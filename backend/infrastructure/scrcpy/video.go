package scrcpy

import (
	"io"

	"github.com/user/android-browser-stream/backend/domain"
)

const (
	// PTSConfigFlag indicates codec configuration packet (SPS/PPS). Bit 63.
	PTSConfigFlag = domain.PTSConfigFlag
	// PTSKeyFlag indicates IDR keyframe packet. Bit 62.
	PTSKeyFlag = domain.PTSKeyFlag
	// MaxVideoPacketSize prevents unbounded memory allocations on corrupt or out-of-sync frames (16MB).
	MaxVideoPacketSize = domain.MaxVideoPacketSize
)

// VideoPacket represents a framed video unit from the scrcpy server (canonical in domain).
type VideoPacket = domain.VideoPacket

// ReadVideoPacket decodes the next framed video packet from an scrcpy stream reader.
func ReadVideoPacket(r io.Reader) (*VideoPacket, error) {
	return domain.ReadVideoPacket(r)
}
