package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/domain"
)

// HealthController handles health and ping probes using standardized DTOs.
type HealthController struct {
	maxSlots int
}

// NewHealthController constructs a HealthController.
func NewHealthController(maxSlots int) *HealthController {
	return &HealthController{maxSlots: maxSlots}
}

// Health responds with the service health status.
func (hc *HealthController) Health(c *gin.Context) {
	c.JSON(http.StatusOK, domain.HealthResponse{
		Status:   "healthy",
		Service:  "android-browser-stream-backend",
		MaxSlots: hc.maxSlots,
	})
}

// Ping responds with standard pong message envelope.
func (hc *HealthController) Ping(c *gin.Context) {
	c.JSON(http.StatusOK, domain.SuccessResponse{
		Message: "pong",
	})
}
