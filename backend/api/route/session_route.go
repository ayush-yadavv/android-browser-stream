package route

import (
	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/domain"
)

// NewSessionRouter registers session REST endpoints onto the given router group.
func NewSessionRouter(usecase domain.SessionUsecase, group *gin.RouterGroup) {
	ctrl := controller.NewSessionController(usecase)
	sessions := group.Group("/sessions")
	{
		sessions.POST("", ctrl.Create)
		sessions.GET("", ctrl.List)
		sessions.GET("/:id", ctrl.Get)
		sessions.DELETE("/:id", ctrl.Delete)
	}
}
