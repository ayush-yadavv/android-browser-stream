package route

import (
	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/api/middleware"
	"github.com/user/android-browser-stream/backend/bootstrap"
	"github.com/user/android-browser-stream/backend/domain"
)

// Setup registers global middleware, base probes, and domain routers.
func Setup(env *bootstrap.Env, router *gin.Engine, sessionUsecase domain.SessionUsecase, streamUsecase domain.StreamUsecase) {
	router.Use(middleware.CORS())

	api := router.Group("/api")
	{
		healthCtrl := controller.NewHealthController(env.MaxSessions)
		api.GET("/health", healthCtrl.Health)
		api.GET("/ping", healthCtrl.Ping)

		if sessionUsecase != nil {
			NewSessionRouter(sessionUsecase, streamUsecase, api)
		}
	}
}
