package domain

import (
	"context"
	"time"
)

// SessionStatus tracks lifecycle states of an ephemeral streaming instance.
type SessionStatus string

const (
	SessionStatusCreating    SessionStatus = "creating"
	SessionStatusReady       SessionStatus = "ready"
	SessionStatusStreaming   SessionStatus = "streaming"
	SessionStatusTerminating SessionStatus = "terminating"
	SessionStatusTerminated  SessionStatus = "terminated"
)

// Session represents an ephemeral Android streaming instance.
type Session struct {
	ID             string        `json:"id"`
	ContainerID    string        `json:"container_id"`
	ADBPort        int           `json:"adb_port"`
	Status         SessionStatus `json:"status"`
	DeviceWidth    int           `json:"device_width"`
	DeviceHeight   int           `json:"device_height"`
	KioskEnabled   bool          `json:"kiosk_enabled"`
	TargetPackage  string        `json:"target_package,omitempty"`
	TargetActivity string        `json:"target_activity,omitempty"`
	Recording      bool          `json:"recording"`
	RecordingPath  string        `json:"recording_path,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`
	LastActiveAt   time.Time     `json:"last_active_at"`
}

// CreateSessionOptions defines optional launch configuration for a session.
type CreateSessionOptions struct {
	KioskEnabled   bool   `json:"kiosk_mode"`
	TargetPackage  string `json:"target_package"`
	TargetActivity string `json:"target_activity"`
	Recording      bool   `json:"record_session"`
}

// SessionRepository persists session state in SQLite.
type SessionRepository interface {
	Create(ctx context.Context, session *Session) error
	GetByID(ctx context.Context, id string) (*Session, error)
	List(ctx context.Context) ([]*Session, error)
	UpdateStatus(ctx context.Context, id string, status SessionStatus) error
	UpdateContainerID(ctx context.Context, id string, containerID string) error
	UpdateLastActive(ctx context.Context, id string, t time.Time) error
	UpdateRecordingPath(ctx context.Context, id string, path string) error
	Delete(ctx context.Context, id string) error
	GetStale(ctx context.Context, olderThan time.Duration) ([]*Session, error)
}

// ContainerRepository defines container orchestration operations.
type ContainerRepository interface {
	Create(ctx context.Context, config ContainerConfig) (containerID string, err error)
	Stop(ctx context.Context, containerID string) error
	Remove(ctx context.Context, containerID string) error
	IsRunning(ctx context.Context, containerID string) (bool, error)
}

// SessionUsecase encapsulates session business workflows.
type SessionUsecase interface {
	CreateSession(ctx context.Context, opts ...CreateSessionOptions) (*Session, error)
	GetSession(ctx context.Context, id string) (*Session, error)
	ListSessions(ctx context.Context) ([]*Session, error)
	DestroySession(ctx context.Context, id string) error
	CleanupStaleSessions(ctx context.Context, idleThreshold time.Duration) error
}

// WebSocketConn represents bidirectional binary streaming with the stream client.
type WebSocketConn interface {
	ReadMessage(ctx context.Context) ([]byte, error)
	WriteMessage(ctx context.Context, data []byte) error
}

// StreamUsecase coordinates device streaming relay to a WebSocket connection.
type StreamUsecase interface {
	RelaySession(ctx context.Context, session *Session, ws WebSocketConn, requestedCodecs ...string) error
}

// PrewarmedContainer represents an initialized standby Android instance.
type PrewarmedContainer struct {
	ContainerID  string
	ADBPort      int
	ScrcpyPushed bool
	CreatedAt    time.Time
}

// PrewarmedPool defines contract for managing pre-booted Android standby instances.
type PrewarmedPool interface {
	Acquire(ctx context.Context) (*PrewarmedContainer, error)
	Start(ctx context.Context)
	Stop()
	Count() int
}
