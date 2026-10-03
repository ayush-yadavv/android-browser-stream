package domain

import "context"

// SessionRecorder defines the contract for persisting video packet streams to storage.
type SessionRecorder interface {
	WritePacket(pkt *VideoPacket)
	Close() error
}

// RecorderFactory creates recorders for active sessions.
type RecorderFactory interface {
	CreateRecorder(ctx context.Context, sessionID string, codec VideoCodec) (SessionRecorder, string, error)
}
