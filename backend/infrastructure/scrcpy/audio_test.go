package scrcpy

import (
	"bytes"
	"encoding/binary"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReadAudioPacket_Valid(t *testing.T) {
	buf := new(bytes.Buffer)

	pts := int64(1234567)
	ptsRaw := uint64(pts)
	payload := []byte{0x21, 0x10, 0x05, 0x54}

	require.NoError(t, binary.Write(buf, binary.BigEndian, ptsRaw))
	require.NoError(t, binary.Write(buf, binary.BigEndian, uint32(len(payload))))
	buf.Write(payload)

	pkt, err := ReadAudioPacket(buf)
	require.NoError(t, err)
	assert.Equal(t, pts, pkt.PTS)
	assert.False(t, pkt.IsConfig)
	assert.Equal(t, payload, pkt.Data)
}

func TestReadAudioPacket_ConfigPacket(t *testing.T) {
	buf := new(bytes.Buffer)

	ptsRaw := PTSConfigFlag | uint64(500000)
	configPayload := []byte{0x12, 0x10} // e.g. AudioSpecificConfig

	require.NoError(t, binary.Write(buf, binary.BigEndian, ptsRaw))
	require.NoError(t, binary.Write(buf, binary.BigEndian, uint32(len(configPayload))))
	buf.Write(configPayload)

	pkt, err := ReadAudioPacket(buf)
	require.NoError(t, err)
	assert.True(t, pkt.IsConfig)
	assert.Equal(t, int64(500000), pkt.PTS)
	assert.Equal(t, configPayload, pkt.Data)
}

func TestReadAudioPacket_ExceedsMaxSize(t *testing.T) {
	buf := new(bytes.Buffer)

	ptsRaw := uint64(100)
	hugeSize := uint32(MaxAudioPacketSize + 1)

	require.NoError(t, binary.Write(buf, binary.BigEndian, ptsRaw))
	require.NoError(t, binary.Write(buf, binary.BigEndian, hugeSize))

	pkt, err := ReadAudioPacket(buf)
	assert.Error(t, err)
	assert.Nil(t, pkt)
	assert.Contains(t, err.Error(), "exceeds maximum limit")
}

func TestReadAudioPacket_EOF(t *testing.T) {
	buf := bytes.NewReader([]byte{})
	pkt, err := ReadAudioPacket(buf)
	assert.Equal(t, io.EOF, err)
	assert.Nil(t, pkt)
}
