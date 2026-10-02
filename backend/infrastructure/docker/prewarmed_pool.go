package docker

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
)

// ADBManager abstracts ADB operations required for container pre-warming.
type ADBManager interface {
	ConnectWithRetry(ctx context.Context, host string, port int, retryInterval time.Duration) error
	WaitForBoot(ctx context.Context, serial string, timeout time.Duration) error
	Push(ctx context.Context, serial, localPath, remotePath string) error
}

// PortPool abstracts port reservation and release.
type PortPool interface {
	Acquire() (int, error)
	Release(port int)
}

// PrewarmedPoolConfig configures standby container limits and startup timeouts.
type PrewarmedPoolConfig struct {
	PoolSize        int
	BootTimeout     time.Duration
	ScrcpyBinPath   string
	ContainerConfig domain.ContainerConfig
}

// PrewarmedPool manages pre-booted Android containers to achieve < 500ms time-to-first-frame.
type PrewarmedPool struct {
	cfg           PrewarmedPoolConfig
	containerRepo domain.ContainerRepository
	portPool      PortPool
	adb           ADBManager

	readyChan chan *domain.PrewarmedContainer
	wakeChan  chan struct{}
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	mu        sync.Mutex
	stopped   bool
}

// NewPrewarmedPool constructs a thread-safe PrewarmedPool.
func NewPrewarmedPool(
	cfg PrewarmedPoolConfig,
	cr domain.ContainerRepository,
	pp PortPool,
	adb ADBManager,
) *PrewarmedPool {
	if cfg.BootTimeout == 0 {
		cfg.BootTimeout = 60 * time.Second
	}
	size := cfg.PoolSize
	if size < 0 {
		size = 0
	}
	chanCap := size
	if chanCap < 1 {
		chanCap = 1
	}

	return &PrewarmedPool{
		cfg:           cfg,
		containerRepo: cr,
		portPool:      pp,
		adb:           adb,
		readyChan:     make(chan *domain.PrewarmedContainer, chanCap),
		wakeChan:      make(chan struct{}, 1),
	}
}

// Start launches the background worker loop that pre-boots standby containers.
func (p *PrewarmedPool) Start(ctx context.Context) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cfg.PoolSize <= 0 || p.stopped {
		return
	}

	p.ctx, p.cancel = context.WithCancel(ctx)
	p.wg.Add(1)
	go p.replenishLoop()
}

// replenishLoop maintains the target number of booted containers in readyChan.
func (p *PrewarmedPool) replenishLoop() {
	defer p.wg.Done()

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		if len(p.readyChan) < p.cfg.PoolSize {
			warm, err := p.provisionOne(p.ctx)
			if err != nil {
				// Avoid hot-spinning on persistent provisioning errors
				select {
				case <-p.ctx.Done():
					return
				case <-time.After(1 * time.Second):
					continue
				}
			}

			select {
			case <-p.ctx.Done():
				// Pool was stopped during provisioning, cleanup
				p.cleanupContainer(warm.ContainerID, warm.ADBPort)
				return
			case p.readyChan <- warm:
				// Successfully placed into ready queue
				continue
			}
		}

		// Wait until an item is acquired or context is cancelled
		select {
		case <-p.ctx.Done():
			return
		case <-p.wakeChan:
		case <-time.After(5 * time.Second):
		}
	}
}

// provisionOne executes the full boot sequence: container create, start, ADB boot wait, and scrcpy push (Option B).
func (p *PrewarmedPool) provisionOne(ctx context.Context) (*domain.PrewarmedContainer, error) {
	port, err := p.portPool.Acquire()
	if err != nil {
		return nil, fmt.Errorf("acquire adb port: %w", err)
	}

	config := p.cfg.ContainerConfig
	config.ADBPort = port
	if config.MemoryLimit == 0 {
		config.MemoryLimit = 4 * 1024 * 1024 * 1024
	}
	if config.CPULimit == 0 {
		config.CPULimit = 2 * 1e9
	}

	containerID, err := p.containerRepo.Create(ctx, config)
	if err != nil {
		p.portPool.Release(port)
		return nil, fmt.Errorf("create prewarmed container: %w", err)
	}

	serial := fmt.Sprintf("127.0.0.1:%d", port)

	// 1. Connect ADB with retry
	if err := p.adb.ConnectWithRetry(ctx, "127.0.0.1", port, 500*time.Millisecond); err != nil {
		p.cleanupContainer(containerID, port)
		return nil, fmt.Errorf("adb connect: %w", err)
	}

	// 2. Wait for Android system boot completion
	if err := p.adb.WaitForBoot(ctx, serial, p.cfg.BootTimeout); err != nil {
		p.cleanupContainer(containerID, port)
		return nil, fmt.Errorf("wait for boot: %w", err)
	}

	// 3. Option B: Pre-push scrcpy-server binary so video stream connects in < 300ms
	pushed := false
	if p.cfg.ScrcpyBinPath != "" {
		if err := p.adb.Push(ctx, serial, p.cfg.ScrcpyBinPath, scrcpy.DeviceServerJarPath); err != nil {
			p.cleanupContainer(containerID, port)
			return nil, fmt.Errorf("pre-push scrcpy-server: %w", err)
		}
		pushed = true
	}

	return &domain.PrewarmedContainer{
		ContainerID:  containerID,
		ADBPort:      port,
		ScrcpyPushed: pushed,
		CreatedAt:    time.Now().UTC(),
	}, nil
}

// Acquire pulls an already-booted container from the pool immediately (< 5ms).
func (p *PrewarmedPool) Acquire(ctx context.Context) (*domain.PrewarmedContainer, error) {
	if p.cfg.PoolSize <= 0 {
		return nil, nil
	}

	select {
	case warm := <-p.readyChan:
		// Verify container is still running
		if p.containerRepo != nil {
			running, err := p.containerRepo.IsRunning(ctx, warm.ContainerID)
			if err != nil || !running {
				// Discard dead container
				p.cleanupContainer(warm.ContainerID, warm.ADBPort)
				p.notifyWake()
				return nil, nil
			}
		}
		p.notifyWake()
		return warm, nil
	default:
		return nil, nil
	}
}

// Stop cleanly terminates and deletes all unclaimed standby containers and releases ports.
func (p *PrewarmedPool) Stop() {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}
	p.stopped = true
	if p.cancel != nil {
		p.cancel()
	}
	p.mu.Unlock()

	p.wg.Wait()

	// Drain remaining ready containers
	for {
		select {
		case warm := <-p.readyChan:
			p.cleanupContainer(warm.ContainerID, warm.ADBPort)
		default:
			return
		}
	}
}

// Count returns the number of currently booted standby containers ready for acquisition.
func (p *PrewarmedPool) Count() int {
	return len(p.readyChan)
}

func (p *PrewarmedPool) notifyWake() {
	select {
	case p.wakeChan <- struct{}{}:
	default:
	}
}

func (p *PrewarmedPool) cleanupContainer(containerID string, port int) {
	if p.containerRepo != nil && containerID != "" {
		_ = p.containerRepo.Stop(context.Background(), containerID)
		_ = p.containerRepo.Remove(context.Background(), containerID)
	}
	if p.portPool != nil && port != 0 {
		p.portPool.Release(port)
	}
}
