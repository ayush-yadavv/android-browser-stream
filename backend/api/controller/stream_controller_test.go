package controller_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/domain"
)

type mockSessionUCForStream struct {
	session *domain.Session
	err     error
}

func (m *mockSessionUCForStream) CreateSession(ctx context.Context, opts ...domain.CreateSessionOptions) (*domain.Session, error) {
	return nil, nil
}
func (m *mockSessionUCForStream) GetSession(ctx context.Context, id string) (*domain.Session, error) {
	return m.session, m.err
}
func (m *mockSessionUCForStream) ListSessions(ctx context.Context) ([]*domain.Session, error) {
	return nil, nil
}
func (m *mockSessionUCForStream) DestroySession(ctx context.Context, id string) error {
	return nil
}
func (m *mockSessionUCForStream) CleanupStaleSessions(ctx context.Context, idleThreshold time.Duration) error {
	return nil
}

type mockStreamUCForStream struct {
	relayCalled bool
	blockRelay  chan struct{}
}

func (m *mockStreamUCForStream) RelaySession(ctx context.Context, session *domain.Session, ws domain.WebSocketConn, requestedCodecs ...string) error {
	m.relayCalled = true
	if m.blockRelay != nil {
		<-m.blockRelay
	}
	return nil
}

func TestHandleStream_NotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, r := gin.CreateTestContext(w)

	mockSession := &mockSessionUCForStream{err: domain.ErrSessionNotFound}
	mockStream := &mockStreamUCForStream{}
	ctrl := controller.NewStreamController(mockSession, mockStream)

	r.GET("/api/sessions/:id/stream", ctrl.HandleStream)
	c.Request, _ = http.NewRequest(http.MethodGet, "/api/sessions/nonexistent/stream", nil)
	r.ServeHTTP(w, c.Request)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHandleStream_TerminatedSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, r := gin.CreateTestContext(w)

	mockSession := &mockSessionUCForStream{
		session: &domain.Session{
			ID:     "term-session",
			Status: domain.SessionStatusTerminated,
		},
	}
	mockStream := &mockStreamUCForStream{}
	ctrl := controller.NewStreamController(mockSession, mockStream)

	r.GET("/api/sessions/:id/stream", ctrl.HandleStream)
	c.Request, _ = http.NewRequest(http.MethodGet, "/api/sessions/term-session/stream", nil)
	r.ServeHTTP(w, c.Request)

	assert.Equal(t, http.StatusGone, w.Code)
}

func TestHandleStream_ConcurrentStreamConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockSession := &mockSessionUCForStream{
		session: &domain.Session{
			ID:      "active-session",
			Status:  domain.SessionStatusReady,
			ADBPort: 5555,
		},
	}
	blockCh := make(chan struct{})
	mockStream := &mockStreamUCForStream{blockRelay: blockCh}
	ctrl := controller.NewStreamController(mockSession, mockStream)

	router := gin.New()
	router.GET("/api/sessions/:id/stream", ctrl.HandleStream)
	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):] + "/api/sessions/active-session/stream"

	var wg sync.WaitGroup
	wg.Add(1)

	// Connection 1 connects via WebSocket
	go func() {
		defer wg.Done()
		conn, resp, err := websocket.Dial(context.Background(), wsURL, nil)
		if assert.NoError(t, err) && assert.NotNil(t, conn) {
			assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)
			defer conn.CloseNow()
			<-blockCh
		}
	}()

	// Wait for Connection 1 to establish
	time.Sleep(100 * time.Millisecond)

	// Connection 2 attempts to connect to same session
	resp, err := http.Get(server.URL + "/api/sessions/active-session/stream")
	assert.NoError(t, err)
	assert.Equal(t, http.StatusConflict, resp.StatusCode)

	// Unblock Connection 1
	close(blockCh)
	wg.Wait()
}
