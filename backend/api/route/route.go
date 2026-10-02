package route

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/api/middleware"
	"github.com/user/android-browser-stream/backend/bootstrap"
	"github.com/user/android-browser-stream/backend/domain"
)

// Setup registers global middleware, base probes, and domain routers.
func Setup(env *bootstrap.Env, router *gin.Engine, sessionUsecase domain.SessionUsecase) {
	router.Use(middleware.CORS())
	router.Use(gin.Recovery())
	router.Use(gin.Logger())

	api := router.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":    "healthy",
				"service":   "android-browser-stream-backend",
				"max_slots": env.MaxSessions,
			})
		})

		api.GET("/ping", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"message": "pong",
			})
		})

		if sessionUsecase != nil {
			NewSessionRouter(sessionUsecase, api)
		}
	}
}
