package scrcpy

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"time"

	"github.com/user/android-browser-stream/backend/infrastructure/adb"
)

const (
	// ScrcpyVersion defines the exact validated scrcpy-server release.
	ScrcpyVersion = "2.7"
	// DeviceServerJarPath is the temporary location on Android storage.
	DeviceServerJarPath = "/data/local/tmp/scrcpy-server.jar"
	// SocketAbstractName is the Unix domain abstract socket name on Android.
	SocketAbstractName = "scrcpy"
)

// Server coordinates the scrcpy-server process and dual TCP sockets.
type Server struct {
	adb         *adb.Client
	serial      string
	videoPort   int
	cmd         *exec.Cmd
	videoConn   net.Conn
	controlConn net.Conn
}

// NewServer constructs an scrcpy Server manager for the targeted device.
func NewServer(adbClient *adb.Client, serial string) *Server {
	return &Server{
		adb:    adbClient,
		serial: serial,
	}
}

// Start pushes the server binary, launches the server process, and establishes video & control sockets.
func (s *Server) Start(ctx context.Context, localBinaryPath string, videoPort int) error {
	s.videoPort = videoPort

	// 1. Push scrcpy-server binary to Android /data/local/tmp if path provided
	if localBinaryPath != "" {
		if err := s.adb.Push(ctx, s.serial, localBinaryPath, DeviceServerJarPath); err != nil {
			return fmt.Errorf("push scrcpy-server binary: %w", err)
		}
	}

	// 2. Set up ADB forward from host TCP port to Android abstract socket
	if err := s.adb.Forward(ctx, s.serial, videoPort, SocketAbstractName); err != nil {
		return fmt.Errorf("adb forward port %d: %w", videoPort, err)
	}

	// 3. Launch scrcpy-server on Android userspace
	// tunnel_forward=true allows the host to connect via adb forward
	cmd := s.adb.Shell(ctx, s.serial,
		fmt.Sprintf("CLASSPATH=%s", DeviceServerJarPath),
		"app_process", "/",
		"com.genymobile.scrcpy.Server", ScrcpyVersion,
		"tunnel_forward=true",
		"video=true",
		"audio=false",
		"control=true",
		"video_codec=h264",
		"max_size=0",
		"max_fps=60",
		"video_bit_rate=8000000",
		"send_device_meta=false",
		"send_dummy_byte=true",
		"send_codec_meta=false",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch scrcpy-server process: %w", err)
	}
	s.cmd = cmd

	// 4. Connect Connection #1 (Video Socket) with dummy byte verification
	var videoConn net.Conn
	addr := fmt.Sprintf("127.0.0.1:%d", videoPort)

	for attempt := 0; attempt < 30; attempt++ {
		select {
		case <-ctx.Done():
			s.Close()
			return ctx.Err()
		default:
		}

		conn, dialErr := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if dialErr != nil {
			time.Sleep(200 * time.Millisecond)
			continue
		}

		// Verify remote scrcpy-server is truly listening by reading the 1 dummy byte
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		dummy := make([]byte, 1)
		if _, readErr := io.ReadFull(conn, dummy); readErr != nil {
			// ADB accepted connection but remote Android socket refused; retry
			_ = conn.Close()
			time.Sleep(200 * time.Millisecond)
			continue
		}
		_ = conn.SetReadDeadline(time.Time{})
		videoConn = conn
		break
	}

	if videoConn == nil {
		s.Close()
		return fmt.Errorf("connect video socket on %s: handshake timeout waiting for scrcpy-server", addr)
	}
	s.videoConn = videoConn

	// 5. Connect Connection #2 (Control Socket)
	controlConn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		s.Close()
		return fmt.Errorf("connect control socket on %s: %w", addr, err)
	}
	s.controlConn = controlConn

	return nil
}

// VideoConn returns the dedicated video stream socket.
func (s *Server) VideoConn() net.Conn {
	return s.videoConn
}

// ControlConn returns the dedicated bidirectional control socket.
func (s *Server) ControlConn() net.Conn {
	return s.controlConn
}

// Close terminates process and both TCP socket connections.
func (s *Server) Close() {
	if s.videoConn != nil {
		_ = s.videoConn.Close()
		s.videoConn = nil
	}
	if s.controlConn != nil {
		_ = s.controlConn.Close()
		s.controlConn = nil
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_ = s.cmd.Wait()
		s.cmd = nil
	}
	if s.videoPort != 0 && s.adb != nil {
		_ = s.adb.ForwardRemove(context.Background(), s.serial, s.videoPort)
		s.videoPort = 0
	}
}
