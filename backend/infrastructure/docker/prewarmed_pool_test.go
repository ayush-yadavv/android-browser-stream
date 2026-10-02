package docker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
)

type mockContainerRepo struct {
	mu        sync.Mutex
	created   []domain.ContainerConfig
	stopped   []string
	removed   []string
	running   map[string]bool
	createErr error
}

func newMockContainerRepo() *mockContainerRepo {
	return &mockContainerRepo{
		running: make(map[string]bool),
	}
}

func (m *mockContainerRepo) Create(ctx context.Context, config domain.ContainerConfig) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.createErr != nil {
		return "", m.createErr
	}
	id := "mock-container-" + string(rune('a'+len(m.created)))
	m.created = append(m.created, config)
	m.running[id] = true
	return id, nil
}

func (m *mockContainerRepo) Stop(ctx context.Context, containerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopped = append(m.stopped, containerID)
	m.running[containerID] = false
	return nil
}

func (m *mockContainerRepo) Remove(ctx context.Context, containerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.removed = append(m.removed, containerID)
	delete(m.running, containerID)
	return nil
}

func (m *mockContainerRepo) IsRunning(ctx context.Context, containerID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running[containerID], nil
}

type mockPortPool struct {
	mu       sync.Mutex
	ports    []int
	released []int
}

func (p *mockPortPool) Acquire() (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.ports) == 0 {
		return 0, errors.New("port pool exhausted")
	}
	port := p.ports[0]
	p.ports = p.ports[1:]
	return port, nil
}

func (p *mockPortPool) Release(port int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.released = append(p.released, port)
	p.ports = append(p.ports, port)
}

type mockADBManager struct {
	mu           sync.Mutex
	connected    []string
	bootWaited   []string
	pushed       []string
	connectErr   error
	bootErr      error
	pushErr      error
}

func (m *mockADBManager) ConnectWithRetry(ctx context.Context, host string, port int, retryInterval time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.connectErr != nil {
		return m.connectErr
	}
	m.connected = append(m.connected, host)
	return nil
}

func (m *mockADBManager) WaitForBoot(ctx context.Context, serial string, timeout time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.bootErr != nil {
		return m.bootErr
	}
	m.bootWaited = append(m.bootWaited, serial)
	return nil
}

func (m *mockADBManager) Push(ctx context.Context, serial, localPath, remotePath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.pushErr != nil {
		return m.pushErr
	}
	m.pushed = append(m.pushed, serial)
	return nil
}

func TestPrewarmedPool_Disabled(t *testing.T) {
	pool := NewPrewarmedPool(PrewarmedPoolConfig{
		PoolSize: 0,
	}, nil, nil, nil)

	ctx := context.Background()
	pool.Start(ctx)
	defer pool.Stop()

	assert.Equal(t, 0, pool.Count())

	warm, err := pool.Acquire(ctx)
	assert.NoError(t, err)
	assert.Nil(t, warm)
}

func TestPrewarmedPool_AcquireAndReplenish(t *testing.T) {
	cRepo := newMockContainerRepo()
	pPool := &mockPortPool{ports: []int{5555, 5556, 5557}}
	adbMock := &mockADBManager{}

	cfg := PrewarmedPoolConfig{
		PoolSize:      1,
		BootTimeout:   2 * time.Second,
		ScrcpyBinPath: "bin/scrcpy-server",
		ContainerConfig: domain.ContainerConfig{
			Image:   "redroid:test",
			Width:   1080,
			Height:  1920,
			GPUMode: "guest",
		},
	}

	pool := NewPrewarmedPool(cfg, cRepo, pPool, adbMock)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool.Start(ctx)
	defer pool.Stop()

	// Wait for background worker to provision 1 standby container
	require.Eventually(t, func() bool {
		return pool.Count() == 1
	}, 2*time.Second, 20*time.Millisecond)

	// Acquire warm container
	warm, err := pool.Acquire(ctx)
	require.NoError(t, err)
	require.NotNil(t, warm)
	assert.Equal(t, "mock-container-a", warm.ContainerID)
	assert.Equal(t, 5555, warm.ADBPort)
	assert.True(t, warm.ScrcpyPushed)
	assert.Equal(t, 0, pool.Count())

	// Verify scrcpy was pushed (Option B)
	adbMock.mu.Lock()
	assert.Len(t, adbMock.pushed, 1)
	adbMock.mu.Unlock()

	// Pool should automatically replenish container 2 in background
	require.Eventually(t, func() bool {
		return pool.Count() == 1
	}, 2*time.Second, 20*time.Millisecond)

	warm2, err := pool.Acquire(ctx)
	require.NoError(t, err)
	require.NotNil(t, warm2)
	assert.Equal(t, "mock-container-b", warm2.ContainerID)
	assert.Equal(t, 5556, warm2.ADBPort)
}

func TestPrewarmedPool_DiscardsDeadContainer(t *testing.T) {
	cRepo := newMockContainerRepo()
	pPool := &mockPortPool{ports: []int{5555, 5556}}
	adbMock := &mockADBManager{}

	cfg := PrewarmedPoolConfig{
		PoolSize:    1,
		BootTimeout: 1 * time.Second,
	}

	pool := NewPrewarmedPool(cfg, cRepo, pPool, adbMock)
	ctx := context.Background()
	pool.Start(ctx)
	defer pool.Stop()

	require.Eventually(t, func() bool {
		return pool.Count() == 1
	}, 2*time.Second, 20*time.Millisecond)

	// Simulate container crashed/killed while waiting in pool
	cRepo.mu.Lock()
	cRepo.running["mock-container-a"] = false
	cRepo.mu.Unlock()

	// Acquire should detect it is dead, discard it, release port, and return nil
	warm, err := pool.Acquire(ctx)
	assert.NoError(t, err)
	assert.Nil(t, warm)

	// Port 5555 should have been released back to portPool
	pPool.mu.Lock()
	assert.Contains(t, pPool.released, 5555)
	pPool.mu.Unlock()
}

func TestPrewarmedPool_StopCleansPending(t *testing.T) {
	cRepo := newMockContainerRepo()
	pPool := &mockPortPool{ports: []int{5555}}
	adbMock := &mockADBManager{}

	cfg := PrewarmedPoolConfig{
		PoolSize:    1,
		BootTimeout: 1 * time.Second,
	}

	pool := NewPrewarmedPool(cfg, cRepo, pPool, adbMock)
	ctx := context.Background()
	pool.Start(ctx)

	require.Eventually(t, func() bool {
		return pool.Count() == 1
	}, 2*time.Second, 20*time.Millisecond)

	// Stop pool - should terminate and remove unacquired standby container
	pool.Stop()

	cRepo.mu.Lock()
	assert.Contains(t, cRepo.stopped, "mock-container-a")
	assert.Contains(t, cRepo.removed, "mock-container-a")
	cRepo.mu.Unlock()

	pPool.mu.Lock()
	assert.Contains(t, pPool.released, 5555)
	pPool.mu.Unlock()
}
