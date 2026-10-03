package usecase

import (
	"context"
	"strings"
	"time"

	"github.com/user/android-browser-stream/backend/domain"
)

// ADBShellRunner defines contract to run shell commands on Android (canonical definition in domain).
type ADBShellRunner = domain.ADBShellRunner

// KioskWatchdog periodically checks foreground activity and restores the target app if unauthorized app appears.
type KioskWatchdog struct {
	runner         ADBShellRunner
	serial         string
	targetPackage  string
	targetActivity string
	interval       time.Duration
	taskLocked     bool
}

// NewKioskWatchdog creates a new KioskWatchdog instance.
func NewKioskWatchdog(runner ADBShellRunner, serial, targetPackage, targetActivity string, interval time.Duration) *KioskWatchdog {
	if interval <= 0 {
		interval = 750 * time.Millisecond
	}
	return &KioskWatchdog{
		runner:         runner,
		serial:         serial,
		targetPackage:  targetPackage,
		targetActivity: targetActivity,
		interval:       interval,
	}
}

// Start runs the watchdog loop until ctx is cancelled.
func (w *KioskWatchdog) Start(ctx context.Context) {
	if w.targetPackage == "" {
		return
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.checkAndEnforce(ctx)
		}
	}
}

func (w *KioskWatchdog) checkAndEnforce(ctx context.Context) {
	output, err := w.runner.RunShell(ctx, w.serial, "dumpsys", "activity", "activities")
	if err != nil {
		return
	}

	lines := strings.Split(output, "\n")
	var resumedLine string
	var targetTaskID string

	for _, l := range lines {
		if resumedLine == "" && (strings.Contains(l, "mResumedActivity") || strings.Contains(l, "topResumedActivity") || strings.Contains(l, "ResumedActivity:")) {
			resumedLine = l
		}
		if targetTaskID == "" && strings.Contains(l, "Task{") && strings.Contains(l, w.targetPackage) {
			parts := strings.Split(l, "#")
			if len(parts) >= 2 {
				numPart := strings.Fields(parts[1])
				if len(numPart) > 0 {
					targetTaskID = numPart[0]
				}
			}
		}
	}

	if resumedLine != "" && !strings.Contains(resumedLine, w.targetPackage) {
		// Unauthorized package took foreground!
		w.taskLocked = false
		// Re-launch target app
		if w.targetActivity != "" {
			component := w.targetPackage + "/" + w.targetActivity
			_, _ = w.runner.RunShell(ctx, w.serial, "am", "start", "-n", component)
		} else {
			_, _ = w.runner.RunShell(ctx, w.serial, "monkey", "-p", w.targetPackage, "-c", "android.intent.category.LAUNCHER", "1")
		}
	} else if targetTaskID != "" && !w.taskLocked {
		// Engage Lock Task Mode on the target task
		_, _ = w.runner.RunShell(ctx, w.serial, "am", "task", "lock", targetTaskID)
		w.taskLocked = true
	}
}
