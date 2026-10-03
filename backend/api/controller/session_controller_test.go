package controller_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
func (m *MockContainerRepo) Stop(ctx context.Context, containerID string) error   { return nil }
func (m *MockContainerRepo) Remove(ctx context.Context, containerID string) error { return nil }
func (m *MockContainerRepo) IsRunning(ctx context.Context, containerID string) (bool, error) {
	return true, nil
}

func setupTestRouter(t *testing.T, maxSessions int) (*gin.Engine, domain.SessionUsecase, *repository.SQLiteSessionRepository) {
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
		api.DELETE("", ctrl.ClearHistory)
		api.GET("/:id", ctrl.Get)
		api.POST("/:id/stop", ctrl.Stop)
		api.DELETE("/:id", ctrl.Delete)
		api.GET("/:id/recording", ctrl.GetRecording)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return r, uc, sessionRepo
}

func TestSessionController_CreateAndGet(t *testing.T) {
	router, _, _ := setupTestRouter(t, 3)

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

	// 4. POST /api/sessions/:id/stop -> 204 No Content
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/sessions/"+session.ID+"/stop", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)

	// 5. GET after stop -> 200 with status=terminated
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	err = json.Unmarshal(w.Body.Bytes(), &fetched)
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusTerminated, fetched.Status)

	// 6. DELETE /api/sessions/:id -> 204 No Content
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodDelete, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)

	// 7. GET after delete -> 404 Not Found
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID, nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestSessionController_GetNotFound(t *testing.T) {
	router, _, _ := setupTestRouter(t, 3)

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
	router, _, _ := setupTestRouter(t, 1)

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

func TestSessionController_CreateWithKioskAndRecording(t *testing.T) {
	router, _, _ := setupTestRouter(t, 3)

	payload := []byte(`{"kiosk_mode": true, "record_session": true}`)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/sessions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var session domain.Session
	err := json.Unmarshal(w.Body.Bytes(), &session)
	require.NoError(t, err)
	assert.True(t, session.KioskEnabled)
	assert.Equal(t, "com.android.deskclock", session.TargetPackage)
	assert.Equal(t, ".DeskClock", session.TargetActivity)
	assert.True(t, session.Recording)
}

func TestSessionController_GetRecording(t *testing.T) {
	router, uc, repo := setupTestRouter(t, 3)

	// Create session with recording
	session, err := uc.CreateSession(context.Background(), domain.CreateSessionOptions{
		Recording: true,
	})
	require.NoError(t, err)

	// 1. While session is active (ready) -> 409 Conflict
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID+"/recording", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusConflict, w.Code)

	// 2. Terminate session
	err = uc.DestroySession(context.Background(), session.ID)
	require.NoError(t, err)

	// 3. When recording path is empty -> 404
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID+"/recording", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)

	// 4. When recording path points to a real file on disk and session is terminated -> 200 OK
	tmpFile, err := os.CreateTemp("", "recording-*.mp4")
	require.NoError(t, err)
	defer os.Remove(tmpFile.Name())
	_, _ = tmpFile.WriteString("fake-mp4-data")
	tmpFile.Close()

	err = repo.UpdateRecordingPath(context.Background(), session.ID, tmpFile.Name())
	require.NoError(t, err)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/"+session.ID+"/recording", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "fake-mp4-data", w.Body.String())

	// 5. Directly test 404 for unknown session
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions/unknown-id/recording", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestSessionController_ClearHistory(t *testing.T) {
	router, uc, _ := setupTestRouter(t, 3)

	s1, err := uc.CreateSession(context.Background())
	require.NoError(t, err)
	s2, err := uc.CreateSession(context.Background())
	require.NoError(t, err)

	// Stop both sessions
	_ = uc.DestroySession(context.Background(), s1.ID)
	_ = uc.DestroySession(context.Background(), s2.ID)

	// Clear history -> 200 OK
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/api/sessions", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify all terminated sessions are removed
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodGet, "/api/sessions", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var list []*domain.Session
	err = json.Unmarshal(w.Body.Bytes(), &list)
	require.NoError(t, err)
	assert.Empty(t, list)
}

func TestSessionController_CreateSession_DefaultRecording(t *testing.T) {
	router, _, _ := setupTestRouter(t, 3)

	// When payload does NOT specify record_session, it defaults to true
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var session domain.Session
	err := json.Unmarshal(w.Body.Bytes(), &session)
	require.NoError(t, err)
	assert.True(t, session.Recording, "record_session should default to true when omitted")

	// When explicitly false, it is false
	w = httptest.NewRecorder()
	req, _ = http.NewRequest(http.MethodPost, "/api/sessions", strings.NewReader(`{"record_session": false}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	err = json.Unmarshal(w.Body.Bytes(), &session)
	require.NoError(t, err)
	assert.False(t, session.Recording, "record_session should be false when explicitly disabled")
}
