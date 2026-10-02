package portpool_test

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
)

func TestPortPool_AcquireAndRelease(t *testing.T) {
	pool := portpool.New(5555, 3)

	// Acquire all 3 ports
	p1, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5555, p1)

	p2, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5556, p2)

	p3, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5557, p3)

	// 4th acquire should fail with ErrPortExhausted
	_, err = pool.Acquire()
	assert.ErrorIs(t, err, domain.ErrPortExhausted)

	// Release port 5555 and 5556 in order
	pool.Release(p1)
	pool.Release(p2)

	// FIFO: 5555 was released first, so it should be acquired first
	reacquired1, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5555, reacquired1)

	reacquired2, err := pool.Acquire()
	require.NoError(t, err)
	assert.Equal(t, 5556, reacquired2)

	// Exhausted again
	_, err = pool.Acquire()
	assert.ErrorIs(t, err, domain.ErrPortExhausted)
}

func TestPortPool_ConcurrentAccess(t *testing.T) {
	totalPorts := 10
	pool := portpool.New(6000, totalPorts)

	var wg sync.WaitGroup
	acquiredPorts := make(chan int, totalPorts*10)

	// Launch 20 concurrent workers attempting to acquire and release
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			port, err := pool.Acquire()
			if err == nil {
				acquiredPorts <- port
				pool.Release(port)
			}
		}()
	}

	wg.Wait()
	close(acquiredPorts)

	// Verify all ports can still be cleanly acquired
	var finalPorts []int
	for i := 0; i < totalPorts; i++ {
		p, err := pool.Acquire()
		require.NoError(t, err)
		finalPorts = append(finalPorts, p)
	}
	assert.Len(t, finalPorts, totalPorts)
}
