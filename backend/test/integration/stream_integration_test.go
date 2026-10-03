package integration_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/api/route"
	"github.com/user/android-browser-stream/backend/bootstrap"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
	"github.com/user/android-browser-stream/backend/repository"
	"github.com/user/android-browser-stream/backend/usecase"
	_ "modernc.org/sqlite"
)

// IntegratedFakeContainerRepo tracks container lifecycles during integration runs.
type IntegratedFakeContainerRepo struct {
	mu         sync.Mutex
	containers map[string]bool
}

func NewIntegratedFakeContainerRepo() *IntegratedFakeContainerRepo {
	return &IntegratedFakeContainerRepo{
		containers: make(map[string]bool),
	}
}

func (c *IntegratedFakeContainerRepo) Create(ctx context.Context, config domain.ContainerConfig) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	cid := fmt.Sprintf("container-%d-%d", config.ADBPort, time.Now().UnixNano())
	c.containers[cid] = true
	return cid, nil
}

func (c *IntegratedFakeContainerRepo) Stop(ctx context.Context, containerID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.containers[containerID] = false
	return nil
}

func (c *IntegratedFakeContainerRepo) Remove(ctx context.Context, containerID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.containers, containerID)
	return nil
}

func (c *IntegratedFakeContainerRepo) IsRunning(ctx context.Context, containerID string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.containers[containerID], nil
}

type mockStreamUsecase struct {
	relayFunc func(ctx context.Context, session *domain.Session, ws domain.WebSocketConn) error
}

func (m *mockStreamUsecase) RelaySession(ctx context.Context, session *domain.Session, ws domain.WebSocketConn, requestedCodecs ...string) error {
	return m.relayFunc(ctx, session, ws)
}

// TestHarness configures a live TCP test server with real SQLite on disk.
type TestHarness struct {
	ServerURL   string
	WSURL       string
	DB          *repository.SQLiteSessionRepository
	PortPool    *portpool.Pool
	Containers  *IntegratedFakeContainerRepo
	Listener    net.Listener
	HttpServer  *http.Server
	VideoPipes  map[string]net.Conn
	ControlPipe map[string]net.Conn
}

func setupIntegrationServer(t *testing.T, maxSessions int) *TestHarness {
	gin.SetMode(gin.TestMode)

	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "integration_sessions.db")

	env := bootstrap.NewEnv()
	env.DBPath = dbPath
	env.MaxSessions = maxSessions
	env.ADBPortStart = 5555

	db, err := bootstrap.NewSQLiteDatabase(env)
	require.NoError(t, err)

	sessionRepo := repository.NewSQLiteSessionRepository(db)
	pool := portpool.New(env.ADBPortStart, env.MaxSessions)
	containerRepo := NewIntegratedFakeContainerRepo()

	cfg := usecase.SessionConfig{
		Image:        env.RedroidImage,
		MaxSessions:  env.MaxSessions,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		DeviceDPI:    420,
		DeviceFPS:    60,
		GPUMode:      "guest",
		IdleTimeout:  5 * time.Minute,
		BootTimeout:  10 * time.Second,
	}

	sessionUC := usecase.NewSessionUsecase(sessionRepo, containerRepo, pool, cfg, 5*time.Second)

	// Stream usecase with pipe simulation
	videoIn, videoOut := net.Pipe()
	controlIn, controlOut := net.Pipe()

	streamRelay := usecase.NewStreamRelay()

	mockStreamUC := &mockStreamUsecase{
		relayFunc: func(ctx context.Context, session *domain.Session, ws domain.WebSocketConn) error {
			_ = sessionRepo.UpdateStatus(ctx, session.ID, domain.SessionStatusStreaming)
			return streamRelay.Relay(ctx, videoOut, controlOut, ws)
		},
	}

	router := gin.New()
	route.Setup(env, router, sessionUC, mockStreamUC)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	server := &http.Server{
		Handler: router,
	}

	go func() {
		_ = server.Serve(listener)
	}()

	serverURL := fmt.Sprintf("http://%s", listener.Addr().String())
	wsURL := fmt.Sprintf("ws://%s", listener.Addr().String())

	harness := &TestHarness{
		ServerURL:  serverURL,
		WSURL:      wsURL,
		DB:         sessionRepo,
		PortPool:   pool,
		Containers: containerRepo,
		Listener:   listener,
		HttpServer: server,
		VideoPipes: map[string]net.Conn{
			"in":  videoIn,
			"out": videoOut,
		},
		ControlPipe: map[string]net.Conn{
			"in":  controlIn,
			"out": controlOut,
		},
	}

	t.Cleanup(func() {
		_ = server.Close()
		_ = listener.Close()
		_ = db.Close()
		_ = videoIn.Close()
		_ = videoOut.Close()
		_ = controlIn.Close()
		_ = controlOut.Close()
	})

	return harness
}

func TestIntegration_EndToEndStreamingLifecycle(t *testing.T) {
	harness := setupIntegrationServer(t, 3)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. POST /api/sessions: Create on-demand session
	resp, err := http.Post(harness.ServerURL+"/api/sessions", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var session domain.Session
	err = json.NewDecoder(resp.Body).Decode(&session)
	require.NoError(t, err)
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, 5555, session.ADBPort)
	assert.Equal(t, domain.SessionStatusReady, session.Status)

	// Verify persistence in SQLite
	persisted, err := harness.DB.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, session.ID, persisted.ID)

	// 2. Connect WebSocket to /api/sessions/:id/stream
	wsEndpoint := fmt.Sprintf("%s/api/sessions/%s/stream", harness.WSURL, session.ID)
	wsClient, _, err := websocket.Dial(ctx, wsEndpoint, nil)
	require.NoError(t, err)
	defer wsClient.CloseNow()

	// 3. Send video packet through simulated scrcpy video socket
	nalPayload := []byte{0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0xe0, 0x1f} // SPS Annex B
	ptsFlags := uint64(100000) | scrcpy.PTSConfigFlag

	header := make([]byte, 12)
	binary.BigEndian.PutUint64(header[0:8], ptsFlags)
	binary.BigEndian.PutUint32(header[8:12], uint32(len(nalPayload)))

	go func() {
		_, _ = harness.VideoPipes["in"].Write(header)
		_, _ = harness.VideoPipes["in"].Write(nalPayload)
	}()

	// Read frame from WebSocket client
	msgType, receivedMsg, err := wsClient.Read(ctx)
	require.NoError(t, err)
	assert.Equal(t, websocket.MessageBinary, msgType)
	require.GreaterOrEqual(t, len(receivedMsg), 13)

	// Verify channel prefix 0x00 (Video)
	assert.Equal(t, byte(0x00), receivedMsg[0])
	assert.Equal(t, nalPayload, receivedMsg[13:])

	// 4. Send interactive touch control event from WebSocket client (Channel 0x02 + 32-byte payload)
	touchBuf := new(bytes.Buffer)
	err = scrcpy.WriteTouchEvent(touchBuf, scrcpy.ActionDown, -1, 540, 960, 1080, 1920, 0xFFFF, 1, 1)
	require.NoError(t, err)

	wsControlMsg := append([]byte{0x02}, touchBuf.Bytes()...)
	err = wsClient.Write(ctx, websocket.MessageBinary, wsControlMsg)
	require.NoError(t, err)

	// Read on control socket and verify exact 32 bytes received
	controlReceived := make([]byte, 32)
	_, err = io.ReadFull(harness.ControlPipe["in"], controlReceived)
	require.NoError(t, err)
	assert.Equal(t, touchBuf.Bytes(), controlReceived)

	// 5. Client disconnects: triggers auto-destruction of ephemeral session
	_ = wsClient.Close(websocket.StatusNormalClosure, "disconnect")

	// Allow goroutine to process cleanup
	time.Sleep(100 * time.Millisecond)

	// Verify session in SQLite is marked terminated
	updated, err := harness.DB.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.SessionStatusTerminated, updated.Status)
}

func TestIntegration_ConcurrencyLimitAndReclamation(t *testing.T) {
	harness := setupIntegrationServer(t, 2) // Limit to 2 concurrent sessions
	ctx := context.Background()

	// 1. Create Session 1 (Port 5555)
	resp1, err := http.Post(harness.ServerURL+"/api/sessions", "application/json", nil)
	require.NoError(t, err)
	defer resp1.Body.Close()
	assert.Equal(t, http.StatusCreated, resp1.StatusCode)

	var s1 domain.Session
	require.NoError(t, json.NewDecoder(resp1.Body).Decode(&s1))
	assert.Equal(t, 5555, s1.ADBPort)

	// 2. Create Session 2 (Port 5556)
	resp2, err := http.Post(harness.ServerURL+"/api/sessions", "application/json", nil)
	require.NoError(t, err)
	defer resp2.Body.Close()
	assert.Equal(t, http.StatusCreated, resp2.StatusCode)

	var s2 domain.Session
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&s2))
	assert.Equal(t, 5556, s2.ADBPort)

	// 3. Attempt Session 3: must be rejected with HTTP 429 Too Many Requests
	resp3, err := http.Post(harness.ServerURL+"/api/sessions", "application/json", nil)
	require.NoError(t, err)
	defer resp3.Body.Close()
	assert.Equal(t, http.StatusTooManyRequests, resp3.StatusCode)

	// 4. Terminate Session 1
	req, _ := http.NewRequest(http.MethodDelete, harness.ServerURL+"/api/sessions/"+s1.ID, nil)
	delResp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer delResp.Body.Close()
	assert.Equal(t, http.StatusNoContent, delResp.StatusCode)

	// 5. Now Session 3 creation succeeds!
	resp4, err := http.Post(harness.ServerURL+"/api/sessions", "application/json", nil)
	require.NoError(t, err)
	defer resp4.Body.Close()
	assert.Equal(t, http.StatusCreated, resp4.StatusCode)

	var s3 domain.Session
	require.NoError(t, json.NewDecoder(resp4.Body).Decode(&s3))
	assert.NotEmpty(t, s3.ID)

	// Verify all sessions in DB
	list, err := harness.DB.List(ctx)
	require.NoError(t, err)
	assert.Len(t, list, 3)
}

func TestIntegration_CORSOriginReflection(t *testing.T) {
	harness := setupIntegrationServer(t, 3)

	req, _ := http.NewRequest(http.MethodOptions, harness.ServerURL+"/api/health", nil)
	req.Header.Set("Origin", "https://custom-client.domain.com")
	req.Header.Set("Access-Control-Request-Method", "GET")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	assert.Equal(t, "https://custom-client.domain.com", resp.Header.Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", resp.Header.Get("Access-Control-Allow-Credentials"))
}
