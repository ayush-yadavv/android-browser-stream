package controller

import (
	"context"

	"github.com/coder/websocket"
)

// WSConnAdapter adapts *websocket.Conn to domain.WebSocketConn.
type WSConnAdapter struct {
	Conn *websocket.Conn
}

// NewWSConnAdapter wraps *websocket.Conn to implement domain.WebSocketConn.
func NewWSConnAdapter(conn *websocket.Conn) *WSConnAdapter {
	return &WSConnAdapter{Conn: conn}
}

func (a *WSConnAdapter) ReadMessage(ctx context.Context) ([]byte, error) {
	_, data, err := a.Conn.Read(ctx)
	return data, err
}

func (a *WSConnAdapter) WriteMessage(ctx context.Context, data []byte) error {
	return a.Conn.Write(ctx, websocket.MessageBinary, data)
}
