package docker_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/infrastructure/docker"
)

func TestNewClient_ConstructAndPing(t *testing.T) {
	client, err := docker.NewClient()
	require.NoError(t, err)
	require.NotNil(t, client)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = client.Ping(ctx)
	// If Docker Desktop is running locally, Ping succeeds.
	assert.NoError(t, err)
}
