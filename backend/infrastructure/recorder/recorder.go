package recorder

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/user/android-browser-stream/backend/domain"
)

// FFmpegRecorderFactory creates session recorders backed by FFmpeg or file dump.
type FFmpegRecorderFactory struct {
	outputDir string
}

// NewFFmpegRecorderFactory constructs a factory targeting outputDir.
func NewFFmpegRecorderFactory(outputDir string) *FFmpegRecorderFactory {
	return &FFmpegRecorderFactory{outputDir: outputDir}
}

func findFFmpegBinary() (string, error) {
	if bin, err := exec.LookPath("ffmpeg"); err == nil {
		return bin, nil
	}
	candidates := []string{
		"backend/bin/ffmpeg",
		"./bin/ffmpeg",
		"/usr/local/bin/ffmpeg",
		"/usr/bin/ffmpeg",
	}
	for _, cand := range candidates {
		if abs, err := filepath.Abs(cand); err == nil {
			if fi, err := os.Stat(abs); err == nil && !fi.IsDir() && (fi.Mode()&0111 != 0) {
				return abs, nil
			}
		}
	}
	return "", os.ErrNotExist
}

// CreateRecorder initializes a new SessionRecorder.
func (f *FFmpegRecorderFactory) CreateRecorder(ctx context.Context, sessionID string, codec domain.VideoCodec) (domain.SessionRecorder, string, error) {
	if err := os.MkdirAll(f.outputDir, 0755); err != nil {
		return nil, "", fmt.Errorf("create recording directory: %w", err)
	}

	// Check if ffmpeg binary exists
	ffmpegBin, err := findFFmpegBinary()
	if err == nil {
		outputPath := filepath.Join(f.outputDir, fmt.Sprintf("%s.mp4", sessionID))
		// Use FFmpeg for fragmented MP4 multiplexing without transcoding
		ffmpegFormat := "h264"
		switch codec {
		case domain.CodecH265:
			ffmpegFormat = "hevc"
		case domain.CodecAV1:
			ffmpegFormat = "av1"
		}

		cmd := exec.Command(ffmpegBin,
			"-y",
			"-f", ffmpegFormat,
			"-r", "60",
			"-i", "pipe:0",
			"-c:v", "copy",
			"-movflags", "frag_keyframe+empty_moov+default_base_moof",
			outputPath,
		)

		stdin, err := cmd.StdinPipe()
		if err != nil {
			return nil, "", fmt.Errorf("open ffmpeg stdin pipe: %w", err)
		}

		if err := cmd.Start(); err != nil {
			_ = stdin.Close()
			return nil, "", fmt.Errorf("start ffmpeg: %w", err)
		}

		rec := &ffmpegRecorder{
			cmd:     cmd,
			writer:  stdin,
			queue:   make(chan []byte, 120),
			done:    make(chan struct{}),
			outPath: outputPath,
		}
		go rec.run()
		return rec, outputPath, nil
	}

	// Fallback to direct raw Annex B file output if ffmpeg is not available
	ext := "h264"
	switch codec {
	case domain.CodecH265:
		ext = "h265"
	case domain.CodecAV1:
		ext = "obu"
	}
	rawOutputPath := filepath.Join(f.outputDir, fmt.Sprintf("%s.%s", sessionID, ext))
	file, err := os.Create(rawOutputPath)
	if err != nil {
		return nil, "", fmt.Errorf("create recording file: %w", err)
	}

	rec := &ffmpegRecorder{
		file:    file,
		writer:  file,
		queue:   make(chan []byte, 120),
		done:    make(chan struct{}),
		outPath: rawOutputPath,
	}
	go rec.run()
	return rec, rawOutputPath, nil
}

type ffmpegRecorder struct {
	cmd       *exec.Cmd
	file      *os.File
	writer    io.WriteCloser
	queue     chan []byte
	done      chan struct{}
	closeOnce sync.Once
	closed    bool
	mu        sync.RWMutex
	outPath   string
}

func (r *ffmpegRecorder) WritePacket(data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.closed {
		return
	}

	// Clone buffer to avoid data races with caller reuse
	buf := make([]byte, len(data))
	copy(buf, data)

	// Non-blocking write: if queue is full, drop packet to preserve real-time streaming SLA
	select {
	case r.queue <- buf:
	default:
		// Queue full, drop packet
	}
}

func (r *ffmpegRecorder) run() {
	defer close(r.done)
	for pkt := range r.queue {
		if r.writer != nil && len(pkt) > 0 {
			_, _ = r.writer.Write(pkt)
		}
	}
	if r.writer != nil {
		_ = r.writer.Close()
	}
	if r.cmd != nil {
		// Wait up to 5 seconds for FFmpeg to finalize MP4 atoms
		doneWait := make(chan error, 1)
		go func() {
			doneWait <- r.cmd.Wait()
		}()
		select {
		case <-doneWait:
		case <-time.After(5 * time.Second):
			if r.cmd.Process != nil {
				_ = r.cmd.Process.Kill()
			}
		}
	}
}

func (r *ffmpegRecorder) Close() error {
	r.closeOnce.Do(func() {
		r.mu.Lock()
		r.closed = true
		close(r.queue)
		r.mu.Unlock()
	})
	<-r.done
	return nil
}
