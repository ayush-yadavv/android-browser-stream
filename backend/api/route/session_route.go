package route

import (
	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/api/controller"
	"github.com/user/android-browser-stream/backend/domain"
)

// NewSessionRouter registers session REST and WebSocket endpoints onto the given router group.
func NewSessionRouter(sessionUC domain.SessionUsecase, streamUC domain.StreamUsecase, group *gin.RouterGroup) {
	sessionCtrl := controller.NewSessionController(sessionUC)
	var streamCtrl *controller.StreamController
	if streamUC != nil {
		streamCtrl = controller.NewStreamController(sessionUC, streamUC)
	}

	sessions := group.Group("/sessions")
	{
		sessions.POST("", sessionCtrl.Create)
		sessions.GET("", sessionCtrl.List)
		sessions.DELETE("", sessionCtrl.ClearHistory)
		sessions.GET("/:id", sessionCtrl.Get)
		sessions.POST("/:id/stop", sessionCtrl.Stop)
		sessions.DELETE("/:id", sessionCtrl.Delete)
		sessions.GET("/:id/recording", sessionCtrl.GetRecording)

		if streamCtrl != nil {
			sessions.GET("/:id/stream", streamCtrl.HandleStream)
		}
	}
}
