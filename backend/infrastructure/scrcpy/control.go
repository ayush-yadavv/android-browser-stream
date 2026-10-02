package scrcpy

import (
	"encoding/binary"
	"io"
)

// Control Message Types (scrcpy v2.7)
const (
	MsgTypeInjectKeycode     = 0x00
	MsgTypeInjectText        = 0x01
	MsgTypeInjectTouchEvent  = 0x02
	MsgTypeInjectScrollEvent = 0x03
	MsgTypeSetClipboard      = 0x09
)

// Touch and Key Action Constants
const (
	ActionDown   = 0x00
	ActionUp     = 0x01
	ActionMove   = 0x02
	ActionCancel = 0x03
)

// WriteTouchEvent writes an INJECT_TOUCH_EVENT message (32 bytes) to the target writer.
func WriteTouchEvent(w io.Writer, action byte, pointerID int64,
	x, y int32, screenW, screenH uint16, pressure uint16,
	actionButton, buttons uint32) error {

	buf := make([]byte, 32)
	buf[0] = MsgTypeInjectTouchEvent
	buf[1] = action
	binary.BigEndian.PutUint64(buf[2:10], uint64(pointerID))
	binary.BigEndian.PutUint32(buf[10:14], uint32(x))
	binary.BigEndian.PutUint32(buf[14:18], uint32(y))
	binary.BigEndian.PutUint16(buf[18:20], screenW)
	binary.BigEndian.PutUint16(buf[20:22], screenH)
	binary.BigEndian.PutUint16(buf[22:24], pressure)
	binary.BigEndian.PutUint32(buf[24:28], actionButton)
	binary.BigEndian.PutUint32(buf[28:32], buttons)

	_, err := w.Write(buf)
	return err
}

// WriteScrollEvent writes an INJECT_SCROLL_EVENT message (21 bytes) to the target writer.
func WriteScrollEvent(w io.Writer, x, y int32, screenW, screenH uint16,
	hscroll, vscroll int16, buttons uint32) error {

	buf := make([]byte, 21)
	buf[0] = MsgTypeInjectScrollEvent
	binary.BigEndian.PutUint32(buf[1:5], uint32(x))
	binary.BigEndian.PutUint32(buf[5:9], uint32(y))
	binary.BigEndian.PutUint16(buf[9:11], screenW)
	binary.BigEndian.PutUint16(buf[11:13], screenH)
	binary.BigEndian.PutUint16(buf[13:15], uint16(hscroll))
	binary.BigEndian.PutUint16(buf[15:17], uint16(vscroll))
	binary.BigEndian.PutUint32(buf[17:21], buttons)

	_, err := w.Write(buf)
	return err
}

// WriteKeycodeEvent writes an INJECT_KEYCODE message (14 bytes) to the target writer.
func WriteKeycodeEvent(w io.Writer, action byte, keycode, repeat, metaState uint32) error {
	buf := make([]byte, 14)
	buf[0] = MsgTypeInjectKeycode
	buf[1] = action
	binary.BigEndian.PutUint32(buf[2:6], keycode)
	binary.BigEndian.PutUint32(buf[6:10], repeat)
	binary.BigEndian.PutUint32(buf[10:14], metaState)

	_, err := w.Write(buf)
	return err
}

// WriteTextEvent writes an INJECT_TEXT message (5 + N bytes) to the target writer.
func WriteTextEvent(w io.Writer, text string) error {
	textBytes := []byte(text)
	buf := make([]byte, 5+len(textBytes))
	buf[0] = MsgTypeInjectText
	binary.BigEndian.PutUint32(buf[1:5], uint32(len(textBytes)))
	copy(buf[5:], textBytes)

	_, err := w.Write(buf)
	return err
}

// WriteSetClipboard writes a SET_CLIPBOARD message (14 + N bytes) to the target writer.
func WriteSetClipboard(w io.Writer, sequence uint64, paste bool, text string) error {
	textBytes := []byte(text)
	buf := make([]byte, 14+len(textBytes))
	buf[0] = MsgTypeSetClipboard
	binary.BigEndian.PutUint64(buf[1:9], sequence)
	if paste {
		buf[9] = 1
	} else {
		buf[9] = 0
	}
	binary.BigEndian.PutUint32(buf[10:14], uint32(len(textBytes)))
	copy(buf[14:], textBytes)

	_, err := w.Write(buf)
	return err
}

