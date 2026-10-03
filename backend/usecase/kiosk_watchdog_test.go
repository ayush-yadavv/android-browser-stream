package usecase_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/usecase"
)

type mockShellRunner struct {
	mu           sync.Mutex
	calls        [][]string
	dumpsysReply string
}

func (m *mockShellRunner) RunShell(ctx context.Context, serial string, args ...string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, args)

	if len(args) >= 3 && args[0] == "dumpsys" && args[1] == "activity" && args[2] == "activities" {
		return m.dumpsysReply, nil
	}
	return "Success", nil
}

func (m *mockShellRunner) getCalls() [][]string {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([][]string, len(m.calls))
	copy(cp, m.calls)
	return cp
}

func TestKioskWatchdog_RelaunchesWhenUnauthorizedAppInFocus(t *testing.T) {
	mockRunner := &mockShellRunner{
		dumpsysReply: "  topResumedActivity=ActivityRecord{a1b2c3 u0 com.android.settings/.Settings t123}",
	}

	watchdog := usecase.NewKioskWatchdog(
		mockRunner,
		"127.0.0.1:5555",
		"com.android.calculator2",
		".Calculator",
		50*time.Millisecond,
	)

	ctx, cancel := context.WithCancel(context.Background())
	go watchdog.Start(ctx)

	// Wait for watchdog to tick at least once
	time.Sleep(120 * time.Millisecond)
	cancel()

	calls := mockRunner.getCalls()
	require.NotEmpty(t, calls)

	// Verify that dumpsys was checked
	hasDumpsys := false
	hasStart := false
	for _, call := range calls {
		if len(call) >= 3 && call[0] == "dumpsys" {
			hasDumpsys = true
		}
		if len(call) >= 4 && call[0] == "am" && call[1] == "start" && call[3] == "com.android.calculator2/.Calculator" {
			hasStart = true
		}
	}

	assert.True(t, hasDumpsys, "should call dumpsys activity")
	assert.True(t, hasStart, "should relaunch target app com.android.calculator2/.Calculator")
}

func TestKioskWatchdog_NoOpWhenTargetAppAlreadyInFocus(t *testing.T) {
	mockRunner := &mockShellRunner{
		dumpsysReply: "  topResumedActivity=ActivityRecord{a1b2c3 u0 com.android.calculator2/.Calculator t123}",
	}

	watchdog := usecase.NewKioskWatchdog(
		mockRunner,
		"127.0.0.1:5555",
		"com.android.calculator2",
		".Calculator",
		50*time.Millisecond,
	)

	ctx, cancel := context.WithCancel(context.Background())
	go watchdog.Start(ctx)

	time.Sleep(120 * time.Millisecond)
	cancel()

	calls := mockRunner.getCalls()
	require.NotEmpty(t, calls)

	hasStart := false
	for _, call := range calls {
		if len(call) >= 2 && call[0] == "am" && call[1] == "start" {
			hasStart = true
		}
	}

	assert.False(t, hasStart, "should not relaunch if target app is already in focus")
}
