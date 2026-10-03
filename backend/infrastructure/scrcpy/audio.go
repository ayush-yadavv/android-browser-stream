package scrcpy

import (
	"encoding/binary"
	"fmt"
	"io"
)

const (
	// MaxAudioPacketSize prevents unbounded memory allocations on corrupt audio frames (512KB).
	MaxAudioPacketSize = 512 * 1024
)

// AudioPacket represents a framed AAC or PCM audio unit from the scrcpy server.
type AudioPacket struct {
	PTS      int64  // Presentation timestamp in microseconds
	IsConfig bool   // True if audio codec configuration header
	Data     []byte // Raw AAC or PCM frame bytes
}

// ReadAudioPacket decodes the next framed audio packet from an scrcpy audio stream reader.
// Packet layout: [8 bytes PTS & flags][4 bytes size][N bytes audio payload]
func ReadAudioPacket(r io.Reader) (*AudioPacket, error) {
	header := make([]byte, 12)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}

	ptsRaw := binary.BigEndian.Uint64(header[0:8])
	size := binary.BigEndian.Uint32(header[8:12])

	if size > MaxAudioPacketSize {
		return nil, fmt.Errorf("audio packet size exceeds maximum limit (%d > %d)", size, MaxAudioPacketSize)
	}

	isConfig := (ptsRaw & PTSConfigFlag) != 0
	pts := int64(ptsRaw & ^(PTSConfigFlag | PTSKeyFlag))

	data := make([]byte, size)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, fmt.Errorf("read audio packet payload (%d bytes): %w", size, err)
	}

	return &AudioPacket{
		PTS:      pts,
		IsConfig: isConfig,
		Data:     data,
	}, nil
}
