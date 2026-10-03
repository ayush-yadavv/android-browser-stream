package usecase_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/usecase"
)

type testWSAdapter struct {
	conn *websocket.Conn
}

func (a *testWSAdapter) ReadMessage(ctx context.Context) ([]byte, error) {
	_, data, err := a.conn.Read(ctx)
	return data, err
}

func (a *testWSAdapter) WriteMessage(ctx context.Context, data []byte) error {
	return a.conn.Write(ctx, websocket.MessageBinary, data)
}

func TestRelayVideoAndControl_Pipes(t *testing.T) {
	// Create mock video and control TCP pipes
	videoClient, videoServer := net.Pipe()
	controlClient, controlServer := net.Pipe()
	defer videoClient.Close()
	defer videoServer.Close()
	defer controlClient.Close()
	defer controlServer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Setup local test WebSocket server
	serverDone := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		require.NoError(t, err)
		defer conn.CloseNow()

		relay := usecase.NewStreamRelay()
		_ = relay.Relay(ctx, videoServer, controlServer, &testWSAdapter{conn: conn})
		close(serverDone)
	}))
	defer ts.Close()

	// Connect WebSocket client
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	clientConn, _, err := websocket.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer clientConn.CloseNow()

	// 1. Send simulated video packet into videoClient
	nalData := []byte{0x00, 0x00, 0x00, 0x01, 0x65, 0x99}
	ptsFlags := uint64(500000) | domain.PTSKeyFlag

	header := make([]byte, 12)
	binary.BigEndian.PutUint64(header[0:8], ptsFlags)
	binary.BigEndian.PutUint32(header[8:12], uint32(len(nalData)))

	go func() {
		_, _ = videoClient.Write(header)
		_, _ = videoClient.Write(nalData)
	}()

	// 2. Read from WebSocket client and verify 1-byte channel prefix (0x00 for video)
	msgType, msg, err := clientConn.Read(ctx)
	require.NoError(t, err)
	assert.Equal(t, websocket.MessageBinary, msgType)
	require.GreaterOrEqual(t, len(msg), 13)
	assert.Equal(t, usecase.ChannelVideo, msg[0])
	assert.Equal(t, nalData, msg[13:])

	// 3. Send simulated control message from WebSocket client (0x02 prefix + 32-byte touch)
	touchPayload := make([]byte, 32)
	touchPayload[0] = domain.MsgTypeInjectTouchEvent
	touchPayload[1] = domain.ActionDown

	wsControlMsg := append([]byte{usecase.ChannelControl}, touchPayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsControlMsg)
	require.NoError(t, err)

	// 4. Verify scrcpy control server received touch payload without channel prefix
	receivedTouch := make([]byte, 32)
	_, err = io.ReadFull(controlClient, receivedTouch)
	require.NoError(t, err)
	assert.True(t, bytes.Equal(touchPayload, receivedTouch))

	// 5. Verify ChannelPing echo
	pingMsg := []byte{usecase.ChannelPing, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08}
	err = clientConn.Write(ctx, websocket.MessageBinary, pingMsg)
	require.NoError(t, err)

	pongType, pongMsg, err := clientConn.Read(ctx)
	require.NoError(t, err)
	assert.Equal(t, websocket.MessageBinary, pongType)
	assert.Equal(t, pingMsg, pongMsg)

	// Close client connection to trigger graceful termination
	clientConn.Close(websocket.StatusNormalClosure, "done")
	select {
	case <-serverDone:
	case <-time.After(2 * time.Second):
		t.Fatal("Relay loop did not terminate after client disconnect")
	}
}

type mockRecorder struct {
	mu      sync.Mutex
	packets []*domain.VideoPacket
}

func (m *mockRecorder) WritePacket(pkt *domain.VideoPacket) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if pkt == nil {
		return
	}
	cp := make([]byte, len(pkt.Data))
	copy(cp, pkt.Data)
	m.packets = append(m.packets, &domain.VideoPacket{
		PTS:        pkt.PTS,
		IsConfig:   pkt.IsConfig,
		IsKeyFrame: pkt.IsKeyFrame,
		Data:       cp,
	})
}

func (m *mockRecorder) Close() error {
	return nil
}

func TestRelay_KioskFilterAndRecorder(t *testing.T) {
	videoClient, videoServer := net.Pipe()
	controlClient, controlServer := net.Pipe()
	defer videoClient.Close()
	defer videoServer.Close()
	defer controlClient.Close()
	defer controlServer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	rec := &mockRecorder{}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		require.NoError(t, err)
		defer conn.CloseNow()

		relay := usecase.NewStreamRelay()
		relay.SetKioskEnabled(true)
		relay.SetRecorder(rec)

		_ = relay.Relay(ctx, videoServer, controlServer, &testWSAdapter{conn: conn})
	}))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	clientConn, _, err := websocket.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer clientConn.CloseNow()

	// 1. Verify recorder tees video packet
	nalData := []byte{0x00, 0x00, 0x00, 0x01, 0x67, 0x42}
	header := make([]byte, 12)
	binary.BigEndian.PutUint64(header[0:8], uint64(1000)|domain.PTSKeyFlag)
	binary.BigEndian.PutUint32(header[8:12], uint32(len(nalData)))

	go func() {
		_, _ = videoClient.Write(header)
		_, _ = videoClient.Write(nalData)
	}()

	// Read from WS client
	_, _, err = clientConn.Read(ctx)
	require.NoError(t, err)

	rec.mu.Lock()
	require.NotEmpty(t, rec.packets)
	assert.Equal(t, nalData, rec.packets[0].Data)
	assert.Equal(t, int64(1000), rec.packets[0].PTS)
	assert.True(t, rec.packets[0].IsKeyFrame)
	rec.mu.Unlock()

	// 2. Send blocked KEYCODE_HOME (3) over ChannelControl (0x02)
	homeKeyPayload := make([]byte, 14)
	homeKeyPayload[0] = domain.MsgTypeInjectKeycode
	binary.BigEndian.PutUint32(homeKeyPayload[2:6], 3) // KEYCODE_HOME
	wsMsg := append([]byte{usecase.ChannelControl}, homeKeyPayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsMsg)
	require.NoError(t, err)

	// Send allowed KEYCODE_A (29)
	allowedKeyPayload := make([]byte, 14)
	allowedKeyPayload[0] = domain.MsgTypeInjectKeycode
	binary.BigEndian.PutUint32(allowedKeyPayload[2:6], 29) // KEYCODE_A
	wsAllowedMsg := append([]byte{usecase.ChannelControl}, allowedKeyPayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsAllowedMsg)
	require.NoError(t, err)

	// Read on controlServer: it should receive KEYCODE_A, NOT KEYCODE_HOME!
	receivedKey := make([]byte, 14)
	_, err = io.ReadFull(controlClient, receivedKey)
	require.NoError(t, err)
	assert.Equal(t, byte(domain.MsgTypeInjectKeycode), receivedKey[0])
	assert.Equal(t, uint32(29), binary.BigEndian.Uint32(receivedKey[2:6]))

	// 3. Send blocked top swipe (y = 10 < 15)
	topSwipePayload := make([]byte, 32)
	topSwipePayload[0] = domain.MsgTypeInjectTouchEvent
	binary.BigEndian.PutUint32(topSwipePayload[14:18], 10)   // y = 10
	binary.BigEndian.PutUint16(topSwipePayload[20:22], 1920) // screenH = 1920
	wsTopSwipe := append([]byte{usecase.ChannelControl}, topSwipePayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsTopSwipe)
	require.NoError(t, err)

	// Send allowed center touch (y = 500)
	centerTouchPayload := make([]byte, 32)
	centerTouchPayload[0] = domain.MsgTypeInjectTouchEvent
	binary.BigEndian.PutUint32(centerTouchPayload[14:18], 500)  // y = 500
	binary.BigEndian.PutUint16(centerTouchPayload[20:22], 1920) // screenH = 1920
	wsCenterTouch := append([]byte{usecase.ChannelControl}, centerTouchPayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsCenterTouch)
	require.NoError(t, err)

	// Read on controlServer: should receive center touch, NOT top swipe!
	receivedTouch := make([]byte, 32)
	_, err = io.ReadFull(controlClient, receivedTouch)
	require.NoError(t, err)
	assert.Equal(t, byte(domain.MsgTypeInjectTouchEvent), receivedTouch[0])
	assert.Equal(t, uint32(500), binary.BigEndian.Uint32(receivedTouch[14:18]))

	// 4. Verify bottom touch (y = 1850) passes through to app (navbar eliminated at OS level)
	bottomTouchPayload := make([]byte, 32)
	bottomTouchPayload[0] = domain.MsgTypeInjectTouchEvent
	binary.BigEndian.PutUint32(bottomTouchPayload[14:18], 1850) // y = 1850
	binary.BigEndian.PutUint16(bottomTouchPayload[20:22], 1920) // screenH = 1920
	wsBottomTouch := append([]byte{usecase.ChannelControl}, bottomTouchPayload...)
	err = clientConn.Write(ctx, websocket.MessageBinary, wsBottomTouch)
	require.NoError(t, err)

	// Read on controlServer: should receive bottom touch (1850)
	receivedTouch2 := make([]byte, 32)
	_, err = io.ReadFull(controlClient, receivedTouch2)
	require.NoError(t, err)
	assert.Equal(t, byte(domain.MsgTypeInjectTouchEvent), receivedTouch2[0])
	assert.Equal(t, uint32(1850), binary.BigEndian.Uint32(receivedTouch2[14:18]))

	clientConn.Close(websocket.StatusNormalClosure, "done")
}

func TestRelayAudio_Pipe(t *testing.T) {
	videoClient, videoServer := net.Pipe()
	audioClient, audioServer := net.Pipe()
	controlClient, controlServer := net.Pipe()
	defer videoClient.Close()
	defer videoServer.Close()
	defer audioClient.Close()
	defer audioServer.Close()
	defer controlClient.Close()
	defer controlServer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	serverDone := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		require.NoError(t, err)
		defer conn.CloseNow()

		relay := usecase.NewStreamRelay()
		relay.SetAudioReader(audioServer)
		_ = relay.Relay(ctx, videoServer, controlServer, &testWSAdapter{conn: conn})
		close(serverDone)
	}))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	clientConn, _, err := websocket.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer clientConn.CloseNow()

	// 1. Send simulated audio packet (AAC chunk) into audioClient
	audioPayload := []byte{0x21, 0x10, 0x05, 0x54, 0xAA, 0xBB}
	ptsFlags := uint64(123456789)

	header := make([]byte, 12)
	binary.BigEndian.PutUint64(header[0:8], ptsFlags)
	binary.BigEndian.PutUint32(header[8:12], uint32(len(audioPayload)))

	go func() {
		_, _ = audioClient.Write(header)
		_, _ = audioClient.Write(audioPayload)
	}()

	// 2. Read from WebSocket client and verify ChannelAudio (0x01) prefix
	msgType, msg, err := clientConn.Read(ctx)
	require.NoError(t, err)
	assert.Equal(t, websocket.MessageBinary, msgType)
	require.GreaterOrEqual(t, len(msg), 13)
	assert.Equal(t, usecase.ChannelAudio, msg[0])
	assert.Equal(t, audioPayload, msg[13:])

	// Verify PTS extracted correctly
	recvPTS := binary.BigEndian.Uint64(msg[1:9])
	assert.Equal(t, ptsFlags, recvPTS)

	clientConn.Close(websocket.StatusNormalClosure, "done")
}
