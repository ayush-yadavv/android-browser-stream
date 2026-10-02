package docker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	"github.com/user/android-browser-stream/backend/domain"
)

// Client encapsulates Docker SDK operations for ephemeral Redroid containers.
type Client struct {
	cli *client.Client
}

// NewClient constructs an authenticated Docker SDK client from the host environment.
// It automatically detects Docker Desktop or rootless Docker sockets if DOCKER_HOST is unset.
func NewClient() (*Client, error) {
	opts := []client.Opt{
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	}

	if os.Getenv("DOCKER_HOST") == "" {
		if _, err := os.Stat("/var/run/docker.sock"); os.IsNotExist(err) {
			homeDir, _ := os.UserHomeDir()
			desktopSock := filepath.Join(homeDir, ".docker", "desktop", "docker.sock")
			rootlessSock := filepath.Join(homeDir, ".docker", "run", "docker.sock")

			if _, err := os.Stat(desktopSock); err == nil {
				opts = append(opts, client.WithHost("unix://"+desktopSock))
			} else if _, err := os.Stat(rootlessSock); err == nil {
				opts = append(opts, client.WithHost("unix://"+rootlessSock))
			}
		}
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("initialize docker client: %w", err)
	}
	return &Client{cli: cli}, nil
}

// Ping verifies connectivity to the Docker daemon.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.cli.Ping(ctx)
	return err
}

// Create provisions and starts an ephemeral Redroid Android 13 container.
func (c *Client) Create(ctx context.Context, cfg domain.ContainerConfig) (string, error) {
	containerPort := nat.Port("5555/tcp")
	hostPortStr := strconv.Itoa(cfg.ADBPort)

	cmdArgs := []string{
		fmt.Sprintf("androidboot.redroid_width=%d", cfg.Width),
		fmt.Sprintf("androidboot.redroid_height=%d", cfg.Height),
		fmt.Sprintf("androidboot.redroid_dpi=%d", cfg.DPI),
		fmt.Sprintf("androidboot.redroid_fps=%d", cfg.FPS),
		fmt.Sprintf("androidboot.redroid_gpu_mode=%s", cfg.GPUMode),
		"androidboot.use_memfd=1",
		"ro.setupwizard.mode=DISABLED",
	}

	containerName := fmt.Sprintf("redroid-session-%d-%d", cfg.ADBPort, time.Now().Unix())

	resp, err := c.cli.ContainerCreate(ctx,
		&container.Config{
			Image: cfg.Image,
			Cmd:   cmdArgs,
		},
		&container.HostConfig{
			Privileged: true,
			AutoRemove: false,
			PortBindings: nat.PortMap{
				containerPort: []nat.PortBinding{
					{
						HostIP:   "127.0.0.1",
						HostPort: hostPortStr,
					},
				},
			},
			Resources: container.Resources{
				Memory:   cfg.MemoryLimit,
				NanoCPUs: cfg.CPULimit,
			},
		},
		nil,
		nil,
		containerName,
	)
	if err != nil {
		if client.IsErrNotFound(err) {
			return "", fmt.Errorf("docker image '%s' is not ready locally (download in progress, please retry once pull completes): %w", cfg.Image, err)
		}
		return "", fmt.Errorf("create container: %w", err)
	}

	if err := c.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return "", fmt.Errorf("start container: %w", err)
	}

	return resp.ID, nil
}

// Stop stops the target container.
func (c *Client) Stop(ctx context.Context, containerID string) error {
	stopTimeout := 5
	return c.cli.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &stopTimeout})
}

// Remove forcefully deletes the target container.
func (c *Client) Remove(ctx context.Context, containerID string) error {
	return c.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
}

// IsRunning checks whether the specified container is currently active.
func (c *Client) IsRunning(ctx context.Context, containerID string) (bool, error) {
	inspect, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return false, err
	}
	return inspect.State.Running, nil
}
