package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
	"github.com/user/android-browser-stream/backend/repository"
	"github.com/user/android-browser-stream/backend/usecase"
	_ "modernc.org/sqlite"
)

// FakeContainerRepository provides deterministic container lifecycle control for tests.
type FakeContainerRepository struct {
	mu           sync.Mutex
	containers   map[string]bool
	failOnCreate bool
	createCalls  int
	stopCalls    int
	removeCalls  int
}

func NewFakeContainerRepository() *FakeContainerRepository {
	return &FakeContainerRepository{
		containers: make(map[string]bool),
	}
}

func (f *FakeContainerRepository) Create(ctx context.Context, config domain.ContainerConfig) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.createCalls++
	if f.failOnCreate {
		return "", errors.New("docker daemon error")
	}
	id := "c-mock-123"
	f.containers[id] = true
	return id, nil
}

func (f *FakeContainerRepository) Stop(ctx context.Context, containerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stopCalls++
	f.containers[containerID] = false
	return nil
}

func (f *FakeContainerRepository) Remove(ctx context.Context, containerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removeCalls++
	delete(f.containers, containerID)
	return nil
}

func (f *FakeContainerRepository) IsRunning(ctx context.Context, containerID string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.containers[containerID], nil
}

func setupUsecase(t *testing.T, maxSessions int) (domain.SessionUsecase, *repository.SQLiteSessionRepository, *FakeContainerRepository, *portpool.Pool) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	err = sessionRepo.Migrate(context.Background())
	require.NoError(t, err)

	fakeDocker := NewFakeContainerRepository()
	pool := portpool.New(5555, maxSessions)

	cfg := usecase.SessionConfig{
		Image:        "redroid/redroid:13.0.0-latest",
		MaxSessions:  maxSessions,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		DeviceDPI:    420,
		DeviceFPS:    60,
		GPUMode:      "guest",
		IdleTimeout:  5 * time.Minute,
		BootTimeout:  30 * time.Second,
	}

	uc := usecase.NewSessionUsecase(sessionRepo, fakeDocker, pool, cfg, 5*time.Second)

	t.Cleanup(func() {
		_ = db.Close()
	})

	return uc, sessionRepo, fakeDocker, pool
}

func TestSessionUsecase_CreateSession_Success(t *testing.T) {
	uc, sessionRepo, fakeDocker, pool := setupUsecase(t, 3)
	ctx := context.Background()

	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "c-mock-123", session.ContainerID)
	assert.Equal(t, 5555, session.ADBPort)
	assert.Equal(t, domain.SessionStatusReady, session.Status)
	assert.Equal(t, 1, fakeDocker.createCalls)

	// Verify persistence in real SQLite repo
	persisted, err := sessionRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, session.ID, persisted.ID)
	assert.Equal(t, domain.SessionStatusReady, persisted.Status)

	// Verify next acquire gets next port in FIFO order
	p2, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5556, p2)
}

func TestSessionUsecase_CreateSession_WithOptions(t *testing.T) {
	uc, sessionRepo, _, _ := setupUsecase(t, 3)
	ctx := context.Background()

	opts := domain.CreateSessionOptions{
		KioskEnabled:   true,
		TargetPackage:  "com.android.calculator2",
		TargetActivity: ".Calculator",
		Recording:      true,
	}

	session, err := uc.CreateSession(ctx, opts)
	require.NoError(t, err)
	assert.True(t, session.KioskEnabled)
	assert.Equal(t, "com.android.calculator2", session.TargetPackage)
	assert.Equal(t, ".Calculator", session.TargetActivity)
	assert.True(t, session.Recording)

	// Verify persistence in SQLite
	persisted, err := sessionRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.True(t, persisted.KioskEnabled)
	assert.Equal(t, "com.android.calculator2", persisted.TargetPackage)
	assert.Equal(t, ".Calculator", persisted.TargetActivity)
	assert.True(t, persisted.Recording)
}

func TestSessionUsecase_CreateSession_MaxLimitExceeded(t *testing.T) {
	uc, _, _, _ := setupUsecase(t, 2)
	ctx := context.Background()

	// 1st session
	_, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	// 2nd session
	_, err = uc.CreateSession(ctx)
	require.NoError(t, err)

	// 3rd session should be rejected with ErrSessionLimit
	_, err = uc.CreateSession(ctx)
	assert.ErrorIs(t, err, domain.ErrSessionLimit)
}

func TestSessionUsecase_CreateSession_ContainerFailureRollback(t *testing.T) {
	uc, sessionRepo, fakeDocker, pool := setupUsecase(t, 3)
	fakeDocker.failOnCreate = true
	ctx := context.Background()

	_, err := uc.CreateSession(ctx)
	assert.Error(t, err)

	// Verify no session was left in SQLite repo
	sessions, err := sessionRepo.List(ctx)
	require.NoError(t, err)
	assert.Empty(t, sessions)

	// In FIFO order: 5555 was acquired then returned to end; next ports are 5556, 5557, then 5555
	p1, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5556, p1)

	p2, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5557, p2)

	p3, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5555, p3)
}

func TestSessionUsecase_DestroySession(t *testing.T) {
	uc, sessionRepo, fakeDocker, pool := setupUsecase(t, 3)
	ctx := context.Background()

	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	err = uc.DestroySession(ctx, session.ID)
	require.NoError(t, err)

	assert.Equal(t, 1, fakeDocker.stopCalls)
	assert.Equal(t, 1, fakeDocker.removeCalls)

	// Verify session marked terminated
	persisted, err := sessionRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusTerminated, persisted.Status)

	// Next available in FIFO order is 5556, 5557, then released 5555
	p1, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5556, p1)
}

func TestSessionUsecase_DestroySession_Idempotent(t *testing.T) {
	uc, _, fakeDocker, pool := setupUsecase(t, 1)
	ctx := context.Background()

	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	// 1st destroy
	err = uc.DestroySession(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, fakeDocker.stopCalls)

	// 2nd destroy on already-terminated session must be a no-op
	err = uc.DestroySession(ctx, session.ID)
	require.NoError(t, err)
	// Stop calls should still be 1 (no duplicate container or port operations)
	assert.Equal(t, 1, fakeDocker.stopCalls)

	// Exactly 1 port should be available to acquire
	p, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5555, p)

	// Pool should now be exhausted; duplicate destroy must not have injected an extra port
	_, err = pool.Acquire()
	assert.ErrorIs(t, err, domain.ErrPortExhausted)
}

func TestSessionUsecase_CleanupStaleSessions(t *testing.T) {
	uc, sessionRepo, fakeDocker, _ := setupUsecase(t, 3)
	ctx := context.Background()

	// Create session and artificially age it in DB
	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	oldTime := time.Now().UTC().Add(-10 * time.Minute)
	err = sessionRepo.UpdateLastActive(ctx, session.ID, oldTime)
	require.NoError(t, err)

	// Run cleanup
	err = uc.CleanupStaleSessions(ctx, 5*time.Minute)
	require.NoError(t, err)

	assert.Equal(t, 1, fakeDocker.stopCalls)
	assert.Equal(t, 1, fakeDocker.removeCalls)

	persisted, err := sessionRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusTerminated, persisted.Status)
}

type fakePrewarmedPool struct {
	mu        sync.Mutex
	container *domain.PrewarmedContainer
	acquireN  int
}

func (f *fakePrewarmedPool) Acquire(ctx context.Context) (*domain.PrewarmedContainer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.acquireN++
	res := f.container
	f.container = nil
	return res, nil
}

func (f *fakePrewarmedPool) Start(ctx context.Context) {}
func (f *fakePrewarmedPool) Stop()                     {}
func (f *fakePrewarmedPool) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.container != nil {
		return 1
	}
	return 0
}

func TestSessionUsecase_CreateSession_UsesPrewarmedPool(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	err = sessionRepo.Migrate(context.Background())
	require.NoError(t, err)

	fakeDocker := NewFakeContainerRepository()
	pool := portpool.New(5555, 3)

	cfg := usecase.SessionConfig{
		Image:        "redroid/redroid:13.0.0-latest",
		MaxSessions:  3,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		IdleTimeout:  5 * time.Minute,
	}

	prewarmedMock := &fakePrewarmedPool{
		container: &domain.PrewarmedContainer{
			ContainerID:  "c-prewarmed-999",
			ADBPort:      5555,
			ScrcpyPushed: true,
			CreatedAt:    time.Now().UTC(),
		},
	}

	uc := usecase.NewSessionUsecase(sessionRepo, fakeDocker, pool, cfg, 5*time.Second,
		usecase.WithPrewarmedPool(prewarmedMock),
	)

	ctx := context.Background()
	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)
	require.NotNil(t, session)

	assert.Equal(t, "c-prewarmed-999", session.ContainerID)
	assert.Equal(t, 5555, session.ADBPort)
	assert.Equal(t, domain.SessionStatusReady, session.Status)
	// On-demand container creation should NOT have been invoked!
	assert.Equal(t, 0, fakeDocker.createCalls)
	assert.Equal(t, 1, prewarmedMock.acquireN)
}

func TestSessionUsecase_CreateSession_FallsBackWhenPrewarmedPoolEmpty(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	err = sessionRepo.Migrate(context.Background())
	require.NoError(t, err)

	fakeDocker := NewFakeContainerRepository()
	pool := portpool.New(5555, 3)

	cfg := usecase.SessionConfig{
		Image:        "redroid/redroid:13.0.0-latest",
		MaxSessions:  3,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		IdleTimeout:  5 * time.Minute,
	}

	prewarmedMock := &fakePrewarmedPool{
		container: nil, // empty pool
	}

	uc := usecase.NewSessionUsecase(sessionRepo, fakeDocker, pool, cfg, 5*time.Second,
		usecase.WithPrewarmedPool(prewarmedMock),
	)

	ctx := context.Background()
	session, err := uc.CreateSession(ctx)
	require.NoError(t, err)
	require.NotNil(t, session)

	assert.Equal(t, "c-mock-123", session.ContainerID)
	assert.Equal(t, 5555, session.ADBPort)
	assert.Equal(t, domain.SessionStatusReady, session.Status)
	// On-demand container creation SHOULD have been invoked as fallback!
	assert.Equal(t, 1, fakeDocker.createCalls)
	assert.Equal(t, 1, prewarmedMock.acquireN)
}

func TestSessionUsecase_DeleteSession(t *testing.T) {
	uc, sessionRepo, fakeDocker, _ := setupUsecase(t, 3)
	ctx := context.Background()

	// 1. Create a session with a dummy recording file
	session, err := uc.CreateSession(ctx, domain.CreateSessionOptions{
		Recording: true,
	})
	require.NoError(t, err)

	tmpRecFile, err := os.CreateTemp("", "session-rec-*.mp4")
	require.NoError(t, err)
	defer os.Remove(tmpRecFile.Name()) // clean up just in case
	_, _ = tmpRecFile.WriteString("dummy mp4")
	tmpRecFile.Close()

	err = sessionRepo.UpdateRecordingPath(ctx, session.ID, tmpRecFile.Name())
	require.NoError(t, err)

	// 2. Call DeleteSession while active: should terminate container, delete file from disk, and delete from DB
	err = uc.DeleteSession(ctx, session.ID)
	require.NoError(t, err)

	assert.Equal(t, 1, fakeDocker.stopCalls)
	assert.Equal(t, 1, fakeDocker.removeCalls)

	// File on disk must be gone
	_, err = os.Stat(tmpRecFile.Name())
	assert.True(t, os.IsNotExist(err), "recording file on disk should be deleted")

	// Session in DB must be gone
	_, err = sessionRepo.GetByID(ctx, session.ID)
	assert.ErrorIs(t, err, domain.ErrSessionNotFound)
}

func TestSessionUsecase_ClearSessionHistory(t *testing.T) {
	uc, sessionRepo, _, _ := setupUsecase(t, 3)
	ctx := context.Background()

	// Create 2 sessions
	s1, err := uc.CreateSession(ctx)
	require.NoError(t, err)
	s2, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	// Terminate s1 and s2
	_ = uc.DestroySession(ctx, s1.ID)
	_ = uc.DestroySession(ctx, s2.ID)

	// Create s3 which remains active
	s3, err := uc.CreateSession(ctx)
	require.NoError(t, err)

	// Clear history
	err = uc.ClearSessionHistory(ctx)
	require.NoError(t, err)

	// s1 and s2 should be deleted
	_, err = sessionRepo.GetByID(ctx, s1.ID)
	assert.ErrorIs(t, err, domain.ErrSessionNotFound)
	_, err = sessionRepo.GetByID(ctx, s2.ID)
	assert.ErrorIs(t, err, domain.ErrSessionNotFound)

	// Active s3 should still exist
	activeS3, err := sessionRepo.GetByID(ctx, s3.ID)
	require.NoError(t, err)
	assert.Equal(t, s3.ID, activeS3.ID)
}

