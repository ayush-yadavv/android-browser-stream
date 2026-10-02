package scrcpy

import (
	"encoding/binary"
	"fmt"
	"io"
)

const (
	// PTSConfigFlag indicates codec configuration packet (SPS/PPS). Bit 63.
	PTSConfigFlag = uint64(1) << 63
	// PTSKeyFlag indicates IDR keyframe packet. Bit 62.
	PTSKeyFlag = uint64(1) << 62
	// MaxVideoPacketSize prevents unbounded memory allocations on corrupt or out-of-sync frames (16MB).
	MaxVideoPacketSize = 16 * 1024 * 1024
)

// VideoPacket represents a framed H.264 video unit from the scrcpy server.
type VideoPacket struct {
	PTS        int64  // Presentation timestamp in microseconds
	IsConfig   bool   // True if SPS/PPS codec configuration
	IsKeyFrame bool   // True if keyframe (IDR slice)
	Data       []byte // Raw H.264 Annex B stream data
}

// ReadVideoPacket decodes the next framed video packet from an scrcpy stream reader.
// Packet layout: [8 bytes PTS & flags][4 bytes size][N bytes NAL payload]
func ReadVideoPacket(r io.Reader) (*VideoPacket, error) {
	header := make([]byte, 12)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}

	ptsRaw := binary.BigEndian.Uint64(header[0:8])
	size := binary.BigEndian.Uint32(header[8:12])

	if size > MaxVideoPacketSize {
		return nil, fmt.Errorf("video packet size exceeds maximum limit (%d > %d)", size, MaxVideoPacketSize)
	}

	isConfig := (ptsRaw & PTSConfigFlag) != 0
	isKey := (ptsRaw & PTSKeyFlag) != 0
	pts := int64(ptsRaw & ^(PTSConfigFlag | PTSKeyFlag))

	data := make([]byte, size)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, fmt.Errorf("read video packet payload (%d bytes): %w", size, err)
	}

	return &VideoPacket{
		PTS:        pts,
		IsConfig:   isConfig,
		IsKeyFrame: isKey,
		Data:       data,
	}, nil
}
