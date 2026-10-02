package route_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/api/route"
	"github.com/user/android-browser-stream/backend/bootstrap"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
	"github.com/user/android-browser-stream/backend/repository"
	"github.com/user/android-browser-stream/backend/usecase"
	_ "modernc.org/sqlite"
)

type FakeContainerOrchestrator struct{}

func (f *FakeContainerOrchestrator) Create(ctx context.Context, config domain.ContainerConfig) (string, error) {
	return "container-abc-123", nil
}
func (f *FakeContainerOrchestrator) Stop(ctx context.Context, containerID string) error { return nil }
func (f *FakeContainerOrchestrator) Remove(ctx context.Context, containerID string) error {
	return nil
}
func (f *FakeContainerOrchestrator) IsRunning(ctx context.Context, containerID string) (bool, error) {
	return true, nil
}

func TestSessionRouteIntegration(t *testing.T) {
	gin.SetMode(gin.TestMode)
	env := bootstrap.NewEnv()

	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	require.NoError(t, sessionRepo.Migrate(context.Background()))

	pool := portpool.New(env.ADBPortStart, env.MaxSessions)
	cfg := usecase.SessionConfig{
		Image:        env.RedroidImage,
		MaxSessions:  env.MaxSessions,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		DeviceDPI:    420,
		DeviceFPS:    60,
		GPUMode:      "guest",
		IdleTimeout:  5 * time.Minute,
		BootTimeout:  30 * time.Second,
	}

	sessionUC := usecase.NewSessionUsecase(sessionRepo, &FakeContainerOrchestrator{}, pool, cfg, 5*time.Second)

	r := gin.New()
	route.Setup(env, r, sessionUC)

	// 1. POST /api/sessions
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/sessions", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var created domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &created)
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "container-abc-123", created.ContainerID)
	assert.Equal(t, 5555, created.ADBPort)

	// 2. GET /api/sessions/:id
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+created.ID, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var fetched domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &fetched)
	require.NoError(t, err)
	assert.Equal(t, created.ID, fetched.ID)

	// 3. GET /api/sessions
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var list []*domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &list)
	require.NoError(t, err)
	assert.Len(t, list, 1)

	// 4. DELETE /api/sessions/:id
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodDelete, "/api/sessions/"+created.ID, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
}
