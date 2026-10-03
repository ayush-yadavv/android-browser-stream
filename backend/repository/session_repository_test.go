package repository_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/repository"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)

	repo := repository.NewSQLiteSessionRepository(db)
	err = repo.Migrate(context.Background())
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

func TestSQLiteSessionRepository_CRUD(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSQLiteSessionRepository(db)
	ctx := context.Background()

	now := time.Now().UTC().Truncate(time.Second)
	s := &domain.Session{
		ID:             "test-session-1",
		ContainerID:    "container-123",
		ADBPort:        5555,
		Status:         domain.SessionStatusReady,
		DeviceWidth:    1080,
		DeviceHeight:   1920,
		KioskEnabled:   true,
		TargetPackage:  "com.android.calculator2",
		TargetActivity: ".Calculator",
		Recording:      true,
		RecordingPath:  "data/recordings/test-session-1.mp4",
		CreatedAt:      now,
		LastActiveAt:   now,
	}

	// 1. Create
	err := repo.Create(ctx, s)
	require.NoError(t, err)

	// 2. GetByID
	fetched, err := repo.GetByID(ctx, "test-session-1")
	require.NoError(t, err)
	assert.Equal(t, s.ID, fetched.ID)
	assert.Equal(t, s.ContainerID, fetched.ContainerID)
	assert.Equal(t, s.ADBPort, fetched.ADBPort)
	assert.Equal(t, s.Status, fetched.Status)
	assert.Equal(t, s.DeviceWidth, fetched.DeviceWidth)
	assert.Equal(t, s.DeviceHeight, fetched.DeviceHeight)
	assert.True(t, fetched.KioskEnabled)
	assert.Equal(t, "com.android.calculator2", fetched.TargetPackage)
	assert.Equal(t, ".Calculator", fetched.TargetActivity)
	assert.True(t, fetched.Recording)
	assert.Equal(t, "data/recordings/test-session-1.mp4", fetched.RecordingPath)

	// Update recording path
	err = repo.UpdateRecordingPath(ctx, "test-session-1", "data/recordings/updated.mp4")
	require.NoError(t, err)
	fetched, err = repo.GetByID(ctx, "test-session-1")
	require.NoError(t, err)
	assert.Equal(t, "data/recordings/updated.mp4", fetched.RecordingPath)

	// 3. UpdateStatus
	err = repo.UpdateStatus(ctx, "test-session-1", domain.SessionStatusStreaming)
	require.NoError(t, err)
	fetched, err = repo.GetByID(ctx, "test-session-1")
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusStreaming, fetched.Status)

	// 4. UpdateLastActive
	future := now.Add(5 * time.Minute)
	err = repo.UpdateLastActive(ctx, "test-session-1", future)
	require.NoError(t, err)
	fetched, err = repo.GetByID(ctx, "test-session-1")
	require.NoError(t, err)
	assert.True(t, fetched.LastActiveAt.Equal(future) || fetched.LastActiveAt.Unix() == future.Unix())

	// 5. List
	sessions, err := repo.List(ctx)
	require.NoError(t, err)
	assert.Len(t, sessions, 1)

	// 6. Delete
	err = repo.Delete(ctx, "test-session-1")
	require.NoError(t, err)

	// 7. GetByID after delete should return ErrSessionNotFound
	_, err = repo.GetByID(ctx, "test-session-1")
	assert.ErrorIs(t, err, domain.ErrSessionNotFound)
}

func TestSQLiteSessionRepository_GetStale(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewSQLiteSessionRepository(db)
	ctx := context.Background()

	baseTime := time.Now().UTC().Add(-10 * time.Minute)

	// Stale session
	s1 := &domain.Session{
		ID:           "stale-session",
		ContainerID:  "c-stale",
		ADBPort:      5555,
		Status:       domain.SessionStatusReady,
		CreatedAt:    baseTime,
		LastActiveAt: baseTime,
	}
	require.NoError(t, repo.Create(ctx, s1))

	// Active session
	s2 := &domain.Session{
		ID:           "active-session",
		ContainerID:  "c-active",
		ADBPort:      5556,
		Status:       domain.SessionStatusStreaming,
		CreatedAt:    time.Now().UTC(),
		LastActiveAt: time.Now().UTC(),
	}
	require.NoError(t, repo.Create(ctx, s2))

	stale, err := repo.GetStale(ctx, 5*time.Minute)
	require.NoError(t, err)
	require.Len(t, stale, 1)
	assert.Equal(t, "stale-session", stale[0].ID)
}
