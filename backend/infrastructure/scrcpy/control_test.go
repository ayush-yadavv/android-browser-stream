package scrcpy_test

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
)

func TestBuildTouchPayload_Layout(t *testing.T) {
	buf := new(bytes.Buffer)
	err := scrcpy.WriteTouchEvent(buf, scrcpy.ActionDown, -1, 540, 960, 1080, 1920, 0xFFFF, 1, 1)
	require.NoError(t, err)

	data := buf.Bytes()
	assert.Len(t, data, 32, "Touch payload must be exactly 32 bytes")

	assert.Equal(t, byte(scrcpy.MsgTypeInjectTouchEvent), data[0])
	assert.Equal(t, byte(scrcpy.ActionDown), data[1])
	assert.Equal(t, int64(-1), int64(binary.BigEndian.Uint64(data[2:10])))
	assert.Equal(t, int32(540), int32(binary.BigEndian.Uint32(data[10:14])))
	assert.Equal(t, int32(960), int32(binary.BigEndian.Uint32(data[14:18])))
	assert.Equal(t, uint16(1080), binary.BigEndian.Uint16(data[18:20]))
	assert.Equal(t, uint16(1920), binary.BigEndian.Uint16(data[20:22]))
	assert.Equal(t, uint16(0xFFFF), binary.BigEndian.Uint16(data[22:24]))
	assert.Equal(t, uint32(1), binary.BigEndian.Uint32(data[24:28]))
	assert.Equal(t, uint32(1), binary.BigEndian.Uint32(data[28:32]))
}

func TestBuildScrollPayload_Layout(t *testing.T) {
	buf := new(bytes.Buffer)
	err := scrcpy.WriteScrollEvent(buf, 200, 400, 1080, 1920, 0, -5, 0)
	require.NoError(t, err)

	data := buf.Bytes()
	assert.Len(t, data, 21, "Scroll payload must be exactly 21 bytes (int16 scroll fields)")

	assert.Equal(t, byte(scrcpy.MsgTypeInjectScrollEvent), data[0])
	assert.Equal(t, int32(200), int32(binary.BigEndian.Uint32(data[1:5])))
	assert.Equal(t, int32(400), int32(binary.BigEndian.Uint32(data[5:9])))
	assert.Equal(t, uint16(1080), binary.BigEndian.Uint16(data[9:11]))
	assert.Equal(t, uint16(1920), binary.BigEndian.Uint16(data[11:13]))
	assert.Equal(t, int16(0), int16(binary.BigEndian.Uint16(data[13:15])))
	assert.Equal(t, int16(-5), int16(binary.BigEndian.Uint16(data[15:17])))
	assert.Equal(t, uint32(0), binary.BigEndian.Uint32(data[17:21]))
}

func TestBuildKeycodePayload_Layout(t *testing.T) {
	buf := new(bytes.Buffer)
	err := scrcpy.WriteKeycodeEvent(buf, scrcpy.ActionDown, 66, 0, 0) // KEYCODE_ENTER = 66
	require.NoError(t, err)

	data := buf.Bytes()
	assert.Len(t, data, 14, "Keycode payload must be exactly 14 bytes")

	assert.Equal(t, byte(scrcpy.MsgTypeInjectKeycode), data[0])
	assert.Equal(t, byte(scrcpy.ActionDown), data[1])
	assert.Equal(t, uint32(66), binary.BigEndian.Uint32(data[2:6]))
	assert.Equal(t, uint32(0), binary.BigEndian.Uint32(data[6:10]))
	assert.Equal(t, uint32(0), binary.BigEndian.Uint32(data[10:14]))
}

func TestBuildTextPayload_Layout(t *testing.T) {
	buf := new(bytes.Buffer)
	text := "hello android"
	err := scrcpy.WriteTextEvent(buf, text)
	require.NoError(t, err)

	data := buf.Bytes()
	assert.Len(t, data, 5+len(text))

	assert.Equal(t, byte(scrcpy.MsgTypeInjectText), data[0])
	assert.Equal(t, uint32(len(text)), binary.BigEndian.Uint32(data[1:5]))
	assert.Equal(t, text, string(data[5:]))
}
