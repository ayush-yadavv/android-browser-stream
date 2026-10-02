package controller

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/domain"
)

// SessionController handles HTTP requests for ephemeral Android sessions.
type SessionController struct {
	usecase domain.SessionUsecase
}

// NewSessionController constructs a SessionController.
func NewSessionController(u domain.SessionUsecase) *SessionController {
	return &SessionController{usecase: u}
}

// Create provisions a new ephemeral Android session.
func (sc *SessionController) Create(c *gin.Context) {
	session, err := sc.usecase.CreateSession(c.Request.Context())
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
