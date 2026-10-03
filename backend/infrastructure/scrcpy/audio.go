package scrcpy

import (
	"io"

	"github.com/user/android-browser-stream/backend/domain"
)

const (
	// MaxAudioPacketSize prevents unbounded memory allocations on corrupt audio frames (512KB).
	MaxAudioPacketSize = domain.MaxAudioPacketSize
)

// AudioPacket represents a framed AAC or PCM audio unit from the scrcpy server (canonical in domain).
type AudioPacket = domain.AudioPacket

// ReadAudioPacket decodes the next framed audio packet from an scrcpy audio stream reader.
func ReadAudioPacket(r io.Reader) (*AudioPacket, error) {
	return domain.ReadAudioPacket(r)
}
