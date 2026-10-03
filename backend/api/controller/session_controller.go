package controller

import (
	"errors"
	"net/http"
	"os"
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/domain"
)

var validComponentRegex = regexp.MustCompile(`^[a-zA-Z0-9._]+$`)

// SessionController handles HTTP requests for ephemeral Android sessions.
type SessionController struct {
	usecase domain.SessionUsecase
}

// NewSessionController constructs a SessionController.
func NewSessionController(u domain.SessionUsecase) *SessionController {
	return &SessionController{usecase: u}
}

// CreateSessionRequest defines optional JSON payload for session provisioning.
type CreateSessionRequest struct {
	KioskMode      bool   `json:"kiosk_mode"`
	TargetPackage  string `json:"target_package"`
	TargetActivity string `json:"target_activity"`
	RecordSession  bool   `json:"record_session"`
}

// Create provisions a new ephemeral Android session.
func (sc *SessionController) Create(c *gin.Context) {
	var req CreateSessionRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, domain.ErrorResponse{Message: "invalid json payload: " + err.Error()})
			return
		}
	}

	if req.TargetPackage != "" && (!validComponentRegex.MatchString(req.TargetPackage) || len(req.TargetPackage) > 128) {
		c.JSON(http.StatusBadRequest, domain.ErrorResponse{Message: "invalid target_package: must be alphanumeric package name"})
		return
	}
	if req.TargetActivity != "" && (!validComponentRegex.MatchString(req.TargetActivity) || len(req.TargetActivity) > 128) {
		c.JSON(http.StatusBadRequest, domain.ErrorResponse{Message: "invalid target_activity: must be alphanumeric activity name"})
		return
	}

	opts := domain.CreateSessionOptions{
		KioskEnabled:   req.KioskMode,
		TargetPackage:  req.TargetPackage,
		TargetActivity: req.TargetActivity,
		Recording:      req.RecordSession,
	}

	if opts.KioskEnabled {
		if opts.TargetPackage == "" {
			opts.TargetPackage = "com.android.deskclock"
		}
		if opts.TargetActivity == "" && opts.TargetPackage == "com.android.deskclock" {
			opts.TargetActivity = ".DeskClock"
		}
	}

	session, err := sc.usecase.CreateSession(c.Request.Context(), opts)
	if err != nil {
		if errors.Is(err, domain.ErrSessionLimit) {
			c.JSON(http.StatusTooManyRequests, domain.ErrorResponse{Message: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}
	c.JSON(http.StatusCreated, session)
}

// Get fetches details for a specific session by ID.
func (sc *SessionController) Get(c *gin.Context) {
	id := c.Param("id")
	session, err := sc.usecase.GetSession(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}
	c.JSON(http.StatusOK, session)
}

// List returns all registered sessions.
func (sc *SessionController) List(c *gin.Context) {
	sessions, err := sc.usecase.ListSessions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}
	if sessions == nil {
		sessions = []*domain.Session{}
	}
	c.JSON(http.StatusOK, sessions)
}

// Delete terminates and cleans up an ephemeral session.
func (sc *SessionController) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := sc.usecase.DestroySession(c.Request.Context(), id); err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// GetRecording serves the session MP4 recording file if available.
func (sc *SessionController) GetRecording(c *gin.Context) {
	id := c.Param("id")
	session, err := sc.usecase.GetSession(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}
	if session.RecordingPath == "" {
		c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: "recording not found for session"})
		return
	}
	if _, err := os.Stat(session.RecordingPath); err != nil {
		c.JSON(http.StatusNotFound, domain.ErrorResponse{Message: "recording file not found on disk"})
		return
	}
	c.File(session.RecordingPath)
}
