package domain

import "errors"

// ErrorResponse represents a standardized JSON error envelope.
type ErrorResponse struct {
	Message string `json:"message"`
}

// SuccessResponse represents a standardized JSON success envelope.
type SuccessResponse struct {
	Message string `json:"message"`
}

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionLimit    = errors.New("maximum concurrent sessions reached")
	ErrContainerBoot   = errors.New("container failed to boot")
	ErrADBConnect      = errors.New("ADB connection failed")
	ErrScrcpyStart     = errors.New("scrcpy-server failed to start")
	ErrPortExhausted   = errors.New("no available ports in pool")
)
