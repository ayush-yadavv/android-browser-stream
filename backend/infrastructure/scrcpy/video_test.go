package scrcpy_test

import (
	"bytes"
	"encoding/binary"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
)

func buildScrcpyPacket(pts uint64, isConfig, isKeyFrame bool, payload []byte) []byte {
	var ptsFlags uint64 = pts
	if isConfig {
		ptsFlags |= scrcpy.PTSConfigFlag
	}
	if isKeyFrame {
		ptsFlags |= scrcpy.PTSKeyFlag
	}

	buf := new(bytes.Buffer)
	_ = binary.Write(buf, binary.BigEndian, ptsFlags)
	_ = binary.Write(buf, binary.BigEndian, uint32(len(payload)))
	buf.Write(payload)
	return buf.Bytes()
}

func TestReadVideoPacket_DeltaFrame(t *testing.T) {
	nalData := []byte{0x00, 0x00, 0x00, 0x01, 0x61, 0xe0, 0x05} // Non-IDR P-frame
	raw := buildScrcpyPacket(1000000, false, false, nalData)

	reader := bytes.NewReader(raw)
	pkt, err := scrcpy.ReadVideoPacket(reader)
	require.NoError(t, err)

	assert.Equal(t, int64(1000000), pkt.PTS)
	assert.False(t, pkt.IsConfig)
	assert.False(t, pkt.IsKeyFrame)
	assert.Equal(t, nalData, pkt.Data)
}

func TestReadVideoPacket_KeyFrame(t *testing.T) {
	nalData := []byte{0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84} // IDR Keyframe
	raw := buildScrcpyPacket(2000000, false, true, nalData)

	reader := bytes.NewReader(raw)
	pkt, err := scrcpy.ReadVideoPacket(reader)
	require.NoError(t, err)

	assert.Equal(t, int64(2000000), pkt.PTS)
	assert.False(t, pkt.IsConfig)
	assert.True(t, pkt.IsKeyFrame)
	assert.Equal(t, nalData, pkt.Data)
}

func TestReadVideoPacket_ConfigPacket(t *testing.T) {
	spsData := []byte{0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0xe0, 0x1f} // SPS
	raw := buildScrcpyPacket(0, true, false, spsData)

	reader := bytes.NewReader(raw)
	pkt, err := scrcpy.ReadVideoPacket(reader)
	require.NoError(t, err)

	assert.True(t, pkt.IsConfig)
	assert.False(t, pkt.IsKeyFrame)
	assert.Equal(t, spsData, pkt.Data)
}

func TestReadVideoPacket_TruncatedHeader(t *testing.T) {
	// Only 6 bytes instead of required 12
	truncated := []byte{0x00, 0x00, 0x00, 0x00, 0x01, 0x02}
	reader := bytes.NewReader(truncated)

	_, err := scrcpy.ReadVideoPacket(reader)
	assert.ErrorIs(t, err, io.ErrUnexpectedEOF)
}

func TestReadVideoPacket_TruncatedPayload(t *testing.T) {
	buf := new(bytes.Buffer)
	_ = binary.Write(buf, binary.BigEndian, uint64(500000))
	_ = binary.Write(buf, binary.BigEndian, uint32(100)) // says 100 bytes
	buf.Write([]byte{0x01, 0x02, 0x03})                  // only provides 3 bytes

	reader := bytes.NewReader(buf.Bytes())
	_, err := scrcpy.ReadVideoPacket(reader)
	assert.ErrorIs(t, err, io.ErrUnexpectedEOF)
}

func TestReadVideoPacket_ExceedsMaxSize(t *testing.T) {
	buf := new(bytes.Buffer)
	_ = binary.Write(buf, binary.BigEndian, uint64(500000))
	_ = binary.Write(buf, binary.BigEndian, uint32(scrcpy.MaxVideoPacketSize+1)) // 16MB + 1

	reader := bytes.NewReader(buf.Bytes())
	_, err := scrcpy.ReadVideoPacket(reader)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "video packet size exceeds maximum limit")
}
