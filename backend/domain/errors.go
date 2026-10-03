package domain

import "errors"

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionLimit    = errors.New("maximum concurrent sessions reached")
	ErrContainerBoot   = errors.New("container failed to boot")
	ErrADBConnect      = errors.New("ADB connection failed")
	ErrScrcpyStart     = errors.New("scrcpy-server failed to start")
	ErrPortExhausted   = errors.New("no available ports in pool")
)
