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
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
	"github.com/user/android-browser-stream/backend/usecase"
)

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
		_ = relay.Relay(ctx, videoServer, controlServer, conn)
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
	ptsFlags := uint64(500000) | scrcpy.PTSKeyFlag

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
	touchPayload[0] = scrcpy.MsgTypeInjectTouchEvent
	touchPayload[1] = scrcpy.ActionDown

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

