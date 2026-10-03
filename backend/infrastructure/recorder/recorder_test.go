package recorder_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/recorder"
)

func TestFileRecorder_WriteAndClose(t *testing.T) {
	tempDir := t.TempDir()
	factory := recorder.NewFFmpegRecorderFactory(tempDir)

	ctx := context.Background()
	rec, outPath, err := factory.CreateRecorder(ctx, "session-test-1", domain.CodecH264)
	require.NoError(t, err)
	assert.NotEmpty(t, outPath)
	assert.True(t, filepath.IsAbs(outPath) || outPath != "")

	// Write mock NAL packets
	fakeNAL1 := []byte{0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1f} // SPS
	fakeNAL2 := []byte{0x00, 0x00, 0x00, 0x01, 0x68, 0xce, 0x3c, 0x80} // PPS
	fakeNAL3 := []byte{0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84, 0x00} // IDR Keyframe

	rec.WritePacket(fakeNAL1)
	rec.WritePacket(fakeNAL2)
	rec.WritePacket(fakeNAL3)

	// Close recorder
	err = rec.Close()
	require.NoError(t, err)

	// Verify file was created on disk and is non-empty
	info, err := os.Stat(outPath)
	require.NoError(t, err)
	assert.True(t, info.Size() > 0, "recording file should not be empty")
}

func TestFileRecorder_NonBlockingDropOnBackpressure(t *testing.T) {
	tempDir := t.TempDir()
	factory := recorder.NewFFmpegRecorderFactory(tempDir)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	rec, _, err := factory.CreateRecorder(ctx, "session-test-backpressure", domain.CodecH264)
	require.NoError(t, err)

	// Push 300 packets rapidly without blocking
	done := make(chan bool)
	go func() {
		for i := 0; i < 300; i++ {
			rec.WritePacket([]byte{0x00, 0x00, 0x00, 0x01, byte(i % 256)})
		}
		done <- true
	}()

	select {
	case <-done:
		// Succeeded immediately without blocking
	case <-time.After(1 * time.Second):
		t.Fatal("WritePacket blocked unexpectedly under backpressure")
	}

	_ = rec.Close()
}
