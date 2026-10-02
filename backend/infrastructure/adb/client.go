package adb

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Client provides an os/exec wrapper for Android Debug Bridge (ADB) operations.
type Client struct {
	adbBin string
}

// NewClient initializes a default ADB client looking up 'adb' on system PATH.
func NewClient() *Client {
	return &Client{adbBin: "adb"}
}

// NewClientWithPath creates an ADB client with an explicit binary path.
func NewClientWithPath(binPath string) *Client {
	return &Client{adbBin: binPath}
}

// Connect establishes an ADB TCP socket connection to the target device.
func (c *Client) Connect(ctx context.Context, host string, port int) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	cmd := exec.CommandContext(ctx, c.adbBin, "connect", addr)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("adb connect %s: %s: %w", addr, strings.TrimSpace(string(out)), err)
	}
	if !strings.Contains(string(out), "connected") && !strings.Contains(string(out), "already connected") {
		return fmt.Errorf("adb connect %s: unexpected output: %s", addr, strings.TrimSpace(string(out)))
	}
	return nil
}

// ConnectWithRetry retries Connect at regular intervals until successful or the context is cancelled.
func (c *Client) ConnectWithRetry(ctx context.Context, host string, port int, retryInterval time.Duration) error {
	var lastErr error
	for {
		select {
		case <-ctx.Done():
			if lastErr != nil {
				return fmt.Errorf("%w: last error: %v", ctx.Err(), lastErr)
			}
			return ctx.Err()
		default:
		}

		err := c.Connect(ctx, host, port)
		if err == nil {
			return nil
		}
		lastErr = err

		select {
		case <-ctx.Done():
			return fmt.Errorf("%w: last error: %v", ctx.Err(), lastErr)
		case <-time.After(retryInterval):
		}
	}
}

// WaitForBoot polls sys.boot_completed until Android system server reports complete.
func (c *Client) WaitForBoot(ctx context.Context, serial string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		cmd := exec.CommandContext(ctx, c.adbBin, "-s", serial, "shell", "getprop", "sys.boot_completed")
		out, err := cmd.Output()
		if err == nil && strings.TrimSpace(string(out)) == "1" {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	return fmt.Errorf("device %s boot timeout after %v", serial, timeout)
}

// Push transfers a local file to the remote Android device filesystem.
func (c *Client) Push(ctx context.Context, serial, localPath, remotePath string) error {
	cmd := exec.CommandContext(ctx, c.adbBin, "-s", serial, "push", localPath, remotePath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("adb push: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// Forward establishes a host TCP port forward to an Android abstract domain socket.
func (c *Client) Forward(ctx context.Context, serial string, localPort int, remoteSocket string) error {
	cmd := exec.CommandContext(ctx, c.adbBin, "-s", serial, "forward",
		fmt.Sprintf("tcp:%d", localPort),
		fmt.Sprintf("localabstract:%s", remoteSocket),
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("adb forward: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// ForwardRemove removes a previously configured host TCP port forward rule from ADB.
func (c *Client) ForwardRemove(ctx context.Context, serial string, localPort int) error {
	cmd := exec.CommandContext(ctx, c.adbBin, "-s", serial, "forward", "--remove", fmt.Sprintf("tcp:%d", localPort))
	return cmd.Run()
}

// Shell creates an executable command on the Android device without waiting for completion.
func (c *Client) Shell(ctx context.Context, serial string, args ...string) *exec.Cmd {
	fullArgs := append([]string{"-s", serial, "shell"}, args...)
	return exec.CommandContext(ctx, c.adbBin, fullArgs...)
}

// Disconnect removes the ADB TCP connection for the given device serial.
func (c *Client) Disconnect(ctx context.Context, serial string) error {
	cmd := exec.CommandContext(ctx, c.adbBin, "disconnect", serial)
	_ = cmd.Run()
	return nil
}
