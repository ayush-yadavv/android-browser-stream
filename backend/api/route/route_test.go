package route_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/user/android-browser-stream/backend/api/route"
	"github.com/user/android-browser-stream/backend/bootstrap"
)

func TestHealthEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	env := bootstrap.NewEnv()
	r := gin.New()
	route.Setup(env, r, nil)

	req, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	assert.NoError(t, err)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"status":"healthy"`)
	assert.Contains(t, w.Body.String(), `"service":"android-browser-stream-backend"`)
}

func TestPingEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	env := bootstrap.NewEnv()
	r := gin.New()
	route.Setup(env, r, nil)

	req, err := http.NewRequest(http.MethodGet, "/api/ping", nil)
	assert.NoError(t, err)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"message":"pong"`)
}
