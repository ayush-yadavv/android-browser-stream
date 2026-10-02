package adb_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/infrastructure/adb"
)

func TestNewClient_Default(t *testing.T) {
	client := adb.NewClient()
	require.NotNil(t, client)
}

func TestClient_CommandFormatting(t *testing.T) {
	client := adb.NewClientWithPath("adb")
	cmd := client.Shell(context.Background(), "127.0.0.1:5555", "getprop", "ro.build.version.release")
	require.NotNil(t, cmd)

	expectedArgs := []string{"adb", "-s", "127.0.0.1:5555", "shell", "getprop", "ro.build.version.release"}
	assert.Equal(t, expectedArgs, cmd.Args)
}

func TestClient_WaitForBoot_Timeout(t *testing.T) {
	// Using a nonexistent adb or unreachable serial to test timeout behavior
	client := adb.NewClientWithPath("echo")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := client.WaitForBoot(ctx, "nonexistent:9999", 50*time.Millisecond)
	assert.Error(t, err)
}

func TestClient_ConnectWithRetry_Timeout(t *testing.T) {
	client := adb.NewClientWithPath("false")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := client.ConnectWithRetry(ctx, "127.0.0.1", 9999, 20*time.Millisecond)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "context deadline exceeded")
}
