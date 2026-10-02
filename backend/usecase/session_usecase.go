package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/user/android-browser-stream/backend/domain"
)

// PortPool defines contract for acquiring and releasing host ports.
type PortPool interface {
	Acquire() (int, error)
	Release(port int)
}

// SessionConfig configures redroid container and session limits.
type SessionConfig struct {
	Image        string
	MaxSessions  int
	DeviceWidth  int
	DeviceHeight int
	DeviceDPI    int
	DeviceFPS    int
	GPUMode      string
	IdleTimeout  time.Duration
	BootTimeout  time.Duration
}

// ADBDisconnector defines contract to terminate ADB connection for a device.
type ADBDisconnector interface {
	Disconnect(ctx context.Context, serial string) error
}

type sessionUsecase struct {
	sessionRepo   domain.SessionRepository
	containerRepo domain.ContainerRepository
	portPool      PortPool
	config        SessionConfig
	timeout       time.Duration
	adb           ADBDisconnector
	prewarmedPool domain.PrewarmedPool
}

// SessionOption configures optional sessionUsecase behavior.
type SessionOption func(*sessionUsecase)

// WithADBDisconnector injects an ADB disconnector for teardown.
func WithADBDisconnector(adb ADBDisconnector) SessionOption {
	return func(u *sessionUsecase) {
		u.adb = adb
	}
}

// WithPrewarmedPool injects a PrewarmedPool for sub-500ms session starts.
func WithPrewarmedPool(pool domain.PrewarmedPool) SessionOption {
	return func(u *sessionUsecase) {
		u.prewarmedPool = pool
	}
}

// NewSessionUsecase constructs a SessionUsecase implementation.
func NewSessionUsecase(
	sr domain.SessionRepository,
	cr domain.ContainerRepository,
	pp PortPool,
	cfg SessionConfig,
	timeout time.Duration,
	opts ...SessionOption,
) domain.SessionUsecase {
	u := &sessionUsecase{
		sessionRepo:   sr,
		containerRepo: cr,
		portPool:      pp,
		config:        cfg,
		timeout:       timeout,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

func (u *sessionUsecase) CreateSession(ctx context.Context) (*domain.Session, error) {
	// Respect BootTimeout for container provisioning
	timeout := u.timeout
	if u.config.BootTimeout > timeout {
		timeout = u.config.BootTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 1. Verify concurrency capacity
	sessions, err := u.sessionRepo.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}

	activeCount := 0
	for _, s := range sessions {
		if s.Status != domain.SessionStatusTerminated {
			activeCount++
		}
	}

	if activeCount >= u.config.MaxSessions {
		return nil, domain.ErrSessionLimit
	}

	now := time.Now().UTC()

	// 2. Try acquiring an already-booted container from the prewarmed pool (< 5ms)
	if u.prewarmedPool != nil {
		warm, err := u.prewarmedPool.Acquire(ctx)
		if err == nil && warm != nil {
			session := &domain.Session{
				ID:           uuid.New().String(),
				ContainerID:  warm.ContainerID,
				ADBPort:      warm.ADBPort,
				Status:       domain.SessionStatusReady,
				DeviceWidth:  u.config.DeviceWidth,
				DeviceHeight: u.config.DeviceHeight,
				CreatedAt:    now,
				LastActiveAt: now,
			}
			if err := u.sessionRepo.Create(ctx, session); err != nil {
				_ = u.containerRepo.Stop(ctx, warm.ContainerID)
				_ = u.containerRepo.Remove(ctx, warm.ContainerID)
				u.portPool.Release(warm.ADBPort)
				return nil, fmt.Errorf("create prewarmed session record: %w", err)
			}
			return u.sessionRepo.GetByID(ctx, session.ID)
		}
	}

	// 3. Fallback to normal on-demand container provisioning
	port, err := u.portPool.Acquire()
	if err != nil {
		return nil, err
	}

	session := &domain.Session{
		ID:           uuid.New().String(),
		ADBPort:      port,
		Status:       domain.SessionStatusCreating,
		DeviceWidth:  u.config.DeviceWidth,
		DeviceHeight: u.config.DeviceHeight,
		CreatedAt:    now,
		LastActiveAt: now,
	}

	// 3. Persist initial session record
	if err := u.sessionRepo.Create(ctx, session); err != nil {
		u.portPool.Release(port)
		return nil, fmt.Errorf("create initial session record: %w", err)
	}

	// 4. Provision ephemeral container
	containerConfig := domain.ContainerConfig{
		Image:       u.config.Image,
		ADBPort:     port,
		Width:       u.config.DeviceWidth,
		Height:      u.config.DeviceHeight,
		DPI:         u.config.DeviceDPI,
		FPS:         u.config.DeviceFPS,
		GPUMode:     u.config.GPUMode,
		MemoryLimit: 4 * 1024 * 1024 * 1024,
		CPULimit:    2 * 1e9,
	}

	containerID, err := u.containerRepo.Create(ctx, containerConfig)
	if err != nil {
		// Rollback on container creation failure
		u.portPool.Release(port)
		_ = u.sessionRepo.Delete(ctx, session.ID)
		return nil, fmt.Errorf("provision container: %w", err)
	}

	// 5. Update session with active container ID and ready status
	if err := u.sessionRepo.UpdateContainerID(ctx, session.ID, containerID); err != nil {
		_ = u.containerRepo.Stop(ctx, containerID)
		_ = u.containerRepo.Remove(ctx, containerID)
		u.portPool.Release(port)
		_ = u.sessionRepo.Delete(ctx, session.ID)
		return nil, fmt.Errorf("update session container id: %w", err)
	}

	if err := u.sessionRepo.UpdateStatus(ctx, session.ID, domain.SessionStatusReady); err != nil {
		_ = u.containerRepo.Stop(ctx, containerID)
		_ = u.containerRepo.Remove(ctx, containerID)
		u.portPool.Release(port)
		_ = u.sessionRepo.Delete(ctx, session.ID)
		return nil, fmt.Errorf("update session status to ready: %w", err)
	}

	// Re-fetch to return complete persisted entity
	return u.sessionRepo.GetByID(ctx, session.ID)
}

func (u *sessionUsecase) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	ctx, cancel := context.WithTimeout(ctx, u.timeout)
	defer cancel()

	return u.sessionRepo.GetByID(ctx, id)
}

func (u *sessionUsecase) ListSessions(ctx context.Context) ([]*domain.Session, error) {
	ctx, cancel := context.WithTimeout(ctx, u.timeout)
	defer cancel()

	return u.sessionRepo.List(ctx)
}

func (u *sessionUsecase) DestroySession(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, u.timeout)
	defer cancel()

	session, err := u.sessionRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Idempotency guard: prevent duplicate port releases and teardown races
	if session.Status == domain.SessionStatusTerminated {
		return nil
	}

	_ = u.sessionRepo.UpdateStatus(ctx, id, domain.SessionStatusTerminating)

	if session.ContainerID != "" {
		_ = u.containerRepo.Stop(ctx, session.ContainerID)
		_ = u.containerRepo.Remove(ctx, session.ContainerID)
	}

	if session.ADBPort != 0 {
		if u.adb != nil {
			_ = u.adb.Disconnect(ctx, fmt.Sprintf("127.0.0.1:%d", session.ADBPort))
		}
		u.portPool.Release(session.ADBPort)
	}

	return u.sessionRepo.UpdateStatus(ctx, id, domain.SessionStatusTerminated)
}

func (u *sessionUsecase) CleanupStaleSessions(ctx context.Context, idleThreshold time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, u.timeout)
	defer cancel()

	staleSessions, err := u.sessionRepo.GetStale(ctx, idleThreshold)
	if err != nil {
		return fmt.Errorf("retrieve stale sessions: %w", err)
	}

	for _, s := range staleSessions {
		_ = u.DestroySession(ctx, s.ID)
	}

	return nil
}
