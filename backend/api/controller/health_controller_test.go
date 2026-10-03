package controller_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/domain"
)

func TestHealthController_Health(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := controller.NewHealthController(5)

	r := gin.New()
	r.GET("/health", ctrl.Health)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp domain.HealthResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "healthy", resp.Status)
	assert.Equal(t, "android-browser-stream-backend", resp.Service)
	assert.Equal(t, 5, resp.MaxSlots)
}

func TestHealthController_Ping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := controller.NewHealthController(3)

	r := gin.New()
	r.GET("/ping", ctrl.Ping)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/ping", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp domain.SuccessResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "pong", resp.Message)
}
