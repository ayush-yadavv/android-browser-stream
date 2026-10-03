package controller

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/usecase"
)

// StreamController handles WebSocket upgrade and streaming relay for sessions.
type StreamController struct {
	sessionUsecase domain.SessionUsecase
	streamUsecase  domain.StreamUsecase
	activeStreams  sync.Map // map[string]*streamSessionContext
}

type streamSessionContext struct {
	connectedAt time.Time
}

// NewStreamController constructs a StreamController.
func NewStreamController(su domain.SessionUsecase, stu domain.StreamUsecase) *StreamController {
	return &StreamController{
		sessionUsecase: su,
		streamUsecase:  stu,
	}
}

// HandleStream upgrades the connection to WebSocket and initiates the bidirectional streaming relay.
func (sc *StreamController) HandleStream(c *gin.Context) {
	sessionID := c.Param("id")

	session, err := sc.sessionUsecase.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: "session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}

	if session.Status == domain.SessionStatusTerminated || session.Status == domain.SessionStatusTerminating {
		c.JSON(http.StatusGone, domain.ErrorResponse{Message: "session is already terminated"})
		return
	}

	// Concurrency guard: Only one active streaming connection allowed per session
	_, loaded := sc.activeStreams.LoadOrStore(sessionID, &streamSessionContext{connectedAt: time.Now()})
	if loaded {
		c.JSON(http.StatusConflict, domain.ErrorResponse{Message: "session stream is already in progress"})
		return
	}
	defer sc.activeStreams.Delete(sessionID)

	// Upgrade HTTP connection to binary WebSocket
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Origin validation handled at reverse proxy/middleware
	})
	if err != nil {
		log.Printf("WebSocket handshake upgrade failed for session %s: %v", sessionID, err)
		return
	}
	defer conn.CloseNow()

	// Ephemeral session cleanup: automatically tear down container when browser disconnects or on return
	defer func() {
		log.Printf("Client disconnected, cleaning up ephemeral container for session %s...", sessionID)
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = sc.sessionUsecase.DestroySession(cleanupCtx, sessionID)
	}()

	log.Printf("Stream WebSocket client connected for session %s (ADB port %d)", sessionID, session.ADBPort)

	// Extract requested codecs from URL query (e.g. ?codecs=av1,h265,h264)
	var requestedCodecs []string
	if codecsParam := c.Query("codecs"); codecsParam != "" {
		for _, part := range strings.Split(codecsParam, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				requestedCodecs = append(requestedCodecs, trimmed)
			}
		}
	}

	// Block on streaming relay loop until client disconnects or container terminates
	if err := sc.streamUsecase.RelaySession(c.Request.Context(), session, usecase.NewWSConnAdapter(conn), requestedCodecs...); err != nil {
		log.Printf("Stream relay terminated for session %s: %v", sessionID, err)
		reason := err.Error()
		if len(reason) > 120 {
			reason = reason[:120]
		}
		_ = conn.Close(websocket.StatusPolicyViolation, reason)
	} else {
		log.Printf("Stream relay completed cleanly for session %s", sessionID)
	}
}
