package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/user/android-browser-stream/backend/api/middleware"
)

func TestCORSMiddleware_CompliantOriginReflection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.CORS())
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Origin", "https://stream.droidcanvas.internal")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	// Must reflect incoming origin, NOT wildcard '*' when credentials are true
	assert.Equal(t, "https://stream.droidcanvas.internal", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
}
