package recorder_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
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

	// Valid H264 SPS (64x64 baseline), PPS, and IDR slice
	validSPS := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x67, 0xf4, 0x00, 0x0a, 0x91, 0x96, 0x84, 0x26, 0xc0, 0x44,
		0x00, 0x00, 0x03, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x0a,
		0x3c, 0x48, 0x9a, 0x80,
	}
	validPPS := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x68, 0xce, 0x0f, 0x19, 0x20,
	}
	validIDR := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x65, 0x88, 0x84, 0x3a, 0x08, 0x40, 0x01, 0x00, 0x08, 0x1a,
		0xce, 0x06, 0xcc, 0xea, 0xcb, 0x1d, 0x98, 0xf6, 0xc3, 0x11,
		0xcc, 0x7f, 0xfe, 0x00, 0x3c, 0x17, 0xe2, 0xdb, 0x19, 0x6c,
	}

	rec.WritePacket(&domain.VideoPacket{Data: validSPS, IsConfig: true, PTS: 0})
	rec.WritePacket(&domain.VideoPacket{Data: validPPS, IsConfig: true, PTS: 0})
	rec.WritePacket(&domain.VideoPacket{Data: validIDR, IsKeyFrame: true, PTS: 0})
	rec.WritePacket(&domain.VideoPacket{Data: validIDR, IsKeyFrame: true, PTS: 1_000_000})

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
			rec.WritePacket(&domain.VideoPacket{
				Data: []byte{0x00, 0x00, 0x00, 0x01, byte(i % 256)},
				PTS:  int64(i * 33333),
			})
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

func TestFileRecorder_VariableFramerateDuration(t *testing.T) {
	tempDir := t.TempDir()
	factory := recorder.NewFFmpegRecorderFactory(tempDir)

	ctx := context.Background()
	rec, outPath, err := factory.CreateRecorder(ctx, "session-vfr", domain.CodecH264)
	require.NoError(t, err)

	validSPS := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x67, 0xf4, 0x00, 0x0a, 0x91, 0x96, 0x84, 0x26, 0xc0, 0x44,
		0x00, 0x00, 0x03, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x0a,
		0x3c, 0x48, 0x9a, 0x80,
	}
	validPPS := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x68, 0xce, 0x0f, 0x19, 0x20,
	}
	validIDR := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x65, 0x88, 0x84, 0x3a, 0x08, 0x40, 0x01, 0x00, 0x08, 0x1a,
		0xce, 0x06, 0xcc, 0xea, 0xcb, 0x1d, 0x98, 0xf6, 0xc3, 0x11,
		0xcc, 0x7f, 0xfe, 0x00, 0x3c, 0x17, 0xe2, 0xdb, 0x19, 0x6c,
	}

	rec.WritePacket(&domain.VideoPacket{Data: validSPS, IsConfig: true, PTS: 0})
	rec.WritePacket(&domain.VideoPacket{Data: validPPS, IsConfig: true, PTS: 0})
	// Frame 1 at t=0
	rec.WritePacket(&domain.VideoPacket{Data: validIDR, IsKeyFrame: true, PTS: 0})
	// Frame 2 at t=2s (idle period)
	rec.WritePacket(&domain.VideoPacket{Data: validIDR, IsKeyFrame: true, PTS: 2_000_000})
	// Frame 3 at t=5s
	rec.WritePacket(&domain.VideoPacket{Data: validIDR, IsKeyFrame: true, PTS: 5_000_000})

	err = rec.Close()
	require.NoError(t, err)

	// If ffprobe is present, inspect container duration
	ffprobeCandidates := []string{
		"../../bin/ffprobe",
		"backend/bin/ffprobe",
		"ffprobe",
	}
	var ffprobeBin string
	for _, cand := range ffprobeCandidates {
		if path, err := exec.LookPath(cand); err == nil {
			ffprobeBin = path
			break
		}
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			ffprobeBin = cand
			break
		}
	}

	if ffprobeBin != "" {
		cmd := exec.Command(ffprobeBin,
			"-v", "error",
			"-show_entries", "format=duration",
			"-of", "default=noprint_wrappers=1:nokey=1",
			outPath,
		)
		out, err := cmd.Output()
		require.NoError(t, err)
		durStr := strings.TrimSpace(string(out))
		dur, err := strconv.ParseFloat(durStr, 64)
		require.NoError(t, err)
		// Expected duration ~5.0s (variable framerate preserved, not 3/60 = 0.05s)
		assert.GreaterOrEqual(t, dur, 4.5, "Duration should reflect real wallclock pacing, not fixed 60fps collapse")
	}
}

