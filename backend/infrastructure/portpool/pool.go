package portpool

import (
	"sync"

	"github.com/user/android-browser-stream/backend/domain"
)

// Pool manages a thread-safe set of available network ports.
type Pool struct {
	mu        sync.Mutex
	available []int
	inUse     map[int]bool
}

// New creates a new port pool with the given start port and count.
func New(startPort, count int) *Pool {
	ports := make([]int, count)
	for i := 0; i < count; i++ {
		ports[i] = startPort + i
	}
	return &Pool{
		available: ports,
		inUse:     make(map[int]bool),
	}
}

// Acquire reserves an available port or returns ErrPortExhausted.
func (p *Pool) Acquire() (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.available) == 0 {
		return 0, domain.ErrPortExhausted
	}

	port := p.available[0]
	p.available = p.available[1:]
	p.inUse[port] = true
	return port, nil
}

// Release returns a previously acquired port back to the pool in FIFO order,
// allowing stopped containers/sockets sufficient time to clear TIME_WAIT.
func (p *Pool) Release(port int) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.inUse[port] {
		delete(p.inUse, port)
		p.available = append(p.available, port)
	}
}
