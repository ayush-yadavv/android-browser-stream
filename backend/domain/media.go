package domain

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

	// MaxVideoPacketSize prevents unbounded memory allocations on corrupt frames (16MB).
	MaxVideoPacketSize = 16 * 1024 * 1024
	// MaxAudioPacketSize prevents unbounded memory allocations on corrupt audio frames (512KB).
	MaxAudioPacketSize = 512 * 1024

	// Control wire types for input filtering
	MsgTypeInjectKeycode    byte = 0x00
	MsgTypeInjectTouchEvent byte = 0x02
	ActionDown              byte = 0x00
)

// VideoPacket represents a framed video packet unit from an Android device stream.
type VideoPacket struct {
	PTS        int64  // Presentation timestamp in microseconds
	IsConfig   bool   // True if SPS/PPS codec configuration
	IsKeyFrame bool   // True if keyframe (IDR slice)
	Data       []byte // Raw Annex B video data
}

// AudioPacket represents a framed audio packet unit from an Android device stream.
type AudioPacket struct {
	PTS      int64  // Presentation timestamp in microseconds
	IsConfig bool   // True if audio codec configuration header
	Data     []byte // Raw AAC or PCM frame bytes
}

// ReadVideoPacket decodes the next framed video packet from a video stream reader.
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

// ReadAudioPacket decodes the next framed audio packet from an audio stream reader.
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
