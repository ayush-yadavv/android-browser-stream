package controller_test

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
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
	"github.com/user/android-browser-stream/backend/repository"
	"github.com/user/android-browser-stream/backend/usecase"
	_ "modernc.org/sqlite"
)

type MockContainerRepo struct{}

func (m *MockContainerRepo) Create(ctx context.Context, config domain.ContainerConfig) (string, error) {
	return "mock-cid-999", nil
}
func (m *MockContainerRepo) Stop(ctx context.Context, containerID string) error { return nil }
func (m *MockContainerRepo) Remove(ctx context.Context, containerID string) error { return nil }
func (m *MockContainerRepo) IsRunning(ctx context.Context, containerID string) (bool, error) {
	return true, nil
}

func setupTestRouter(t *testing.T, maxSessions int) (*gin.Engine, domain.SessionUsecase) {
	gin.SetMode(gin.TestMode)

	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	require.NoError(t, sessionRepo.Migrate(context.Background()))

	pool := portpool.New(5555, maxSessions)
	cfg := usecase.SessionConfig{
		Image:        "redroid/redroid:13.0.0-latest",
		MaxSessions:  maxSessions,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		DeviceDPI:    420,
		DeviceFPS:    60,
		GPUMode:      "guest",
		IdleTimeout:  5 * time.Minute,
		BootTimeout:  30 * time.Second,
	}

	uc := usecase.NewSessionUsecase(sessionRepo, &MockContainerRepo{}, pool, cfg, 5*time.Second)
	ctrl := controller.NewSessionController(uc)

	r := gin.New()
	api := r.Group("/api/sessions")
	{
		api.POST("", ctrl.Create)
		api.GET("", ctrl.List)
		api.GET("/:id", ctrl.Get)
		api.DELETE("/:id", ctrl.Delete)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return r, uc
}

func TestSessionController_CreateAndGet(t *testing.T) {
	router, _ := setupTestRouter(t, 3)

	// 1. POST /api/sessions -> 201 Created
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/sessions", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var session domain.Session
	err := json.Unmarshal(w.Body.Bytes(), &session)
	require.NoError(t, err)
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, 5555, session.ADBPort)
	assert.Equal(t, domain.SessionStatusReady, session.Status)

	// 2. GET /api/sessions/:id -> 200 OK
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var fetched domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &fetched)
	require.NoError(t, err)
	assert.Equal(t, session.ID, fetched.ID)

	// 3. GET /api/sessions -> 200 OK with list of 1
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var list []*domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &list)
	require.NoError(t, err)
	assert.Len(t, list, 1)

	// 4. DELETE /api/sessions/:id -> 204 No Content
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodDelete, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)

	// 5. GET after delete -> 200 with status=terminated
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	err = json.Unmarshal(w.Body.Bytes(), &fetched)
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusTerminated, fetched.Status)
}

func TestSessionController_GetNotFound(t *testing.T) {
	router, _ := setupTestRouter(t, 3)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/sessions/nonexistent-id", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	var errResp domain.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &errResp)
	require.NoError(t, err)
	assert.Equal(t, "session not found", errResp.Message)
}

func TestSessionController_LimitExceeded(t *testing.T) {
	router, _ := setupTestRouter(t, 1)

	// 1st creates fine
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/sessions", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	// 2nd fails with 429
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/sessions", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}
