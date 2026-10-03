package scrcpy

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/user/android-browser-stream/backend/domain"
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

// Thread-safe cache of codecs that failed on specific device serials (e.g. "127.0.0.1:5555:av1" -> true)
var deviceUnsupportedCodecs sync.Map

type readCloser struct {
	io.Reader
	io.Closer
}

// Server coordinates the scrcpy-server process and TCP sockets (video, audio, control).
type Server struct {
	adb         *adb.Client
	serial      string
	videoPort   int
	cmd         *exec.Cmd
	videoConn   net.Conn
	videoReader io.Reader
	audioConn   net.Conn
	controlConn net.Conn
	codec       domain.VideoCodec
	audio       bool
}

// NewServer constructs an scrcpy Server manager for the targeted device.
func NewServer(adbClient *adb.Client, serial string) *Server {
	return &Server{
		adb:    adbClient,
		serial: serial,
		codec:  domain.CodecH264,
		audio:  true,
	}
}

// Codec returns the active video codec of the scrcpy server.
func (s *Server) Codec() domain.VideoCodec {
	return s.codec
}

// SetCodec configures the video codec for scrcpy-server.
func (s *Server) SetCodec(codec domain.VideoCodec) {
	if codec != "" {
		s.codec = codec
	}
}

// AudioEnabled reports whether device audio streaming is enabled.
func (s *Server) AudioEnabled() bool {
	return s.audio
}

// SetAudio configures whether audio streaming is enabled for scrcpy-server.
func (s *Server) SetAudio(enabled bool) {
	s.audio = enabled
}

// AudioConn returns the dedicated audio stream connection, or nil if audio is disabled.
func (s *Server) AudioConn() io.Reader {
	return s.audioConn
}

// Start pushes the server binary, launches the server process, and establishes video & control sockets.
// Automatically falls back to CodecH264 if the device lacks hardware/software encoder for the requested modern codec.
func (s *Server) Start(ctx context.Context, localBinaryPath string, videoPort int, codecOpt ...domain.VideoCodec) error {
	s.videoPort = videoPort
	if len(codecOpt) > 0 && codecOpt[0] != "" {
		s.codec = codecOpt[0]
	}

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

	// 3. Check if target device supports requested codec; default to H.264 if unsupported
	if s.codec != domain.CodecH264 {
		if !s.checkDeviceEncoderSupport(ctx, s.codec) {
			log.Printf("Device %s lacks encoder for %s; defaulting to %s", s.serial, s.codec, domain.CodecH264)
			s.codec = domain.CodecH264
		}
	}

	targetCodec := s.codec
	targetAudio := s.audio

	err := s.launchAndConnect(ctx, videoPort, targetCodec, targetAudio)

	// If initial launch with a non-H264 codec (e.g. AV1 or H265) fails due to missing device encoder,
	// immediately fall back to universal H.264 without retrying audio on an unsupported codec.
	if err != nil && targetCodec != domain.CodecH264 {
		log.Printf("scrcpy-server launch failed for codec %s (%v); falling back to universal %s", targetCodec, err, domain.CodecH264)
		deviceUnsupportedCodecs.Store(fmt.Sprintf("%s:%s", s.serial, targetCodec), true)
		s.cleanupProcess()
		s.codec = domain.CodecH264
		targetCodec = domain.CodecH264
		err = s.launchAndConnect(ctx, videoPort, domain.CodecH264, targetAudio)
	}

	// If launch failed with audio enabled (even on H.264), retry with audio disabled
	if err != nil && targetAudio {
		log.Printf("scrcpy-server launch failed with audio=true (%v); retrying with audio=false", err)
		s.cleanupProcess()
		s.audio = false
		err = s.launchAndConnect(ctx, videoPort, targetCodec, false)
	}

	if err != nil {
		s.Close()
	}

	return err
}

func (s *Server) checkDeviceEncoderSupport(ctx context.Context, codec domain.VideoCodec) bool {
	if codec == domain.CodecH264 {
		return true
	}
	key := fmt.Sprintf("%s:%s", s.serial, codec)
	if unsupported, ok := deviceUnsupportedCodecs.Load(key); ok && unsupported.(bool) {
		return false
	}

	// Probe device media codecs XML for encoders matching the requested codec
	var pattern string
	switch codec {
	case domain.CodecAV1:
		pattern = "av01|av1"
	case domain.CodecH265:
		pattern = "hevc"
	default:
		return true
	}

	probeCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	cmd := s.adb.Shell(probeCtx, s.serial, "sh", "-c",
		fmt.Sprintf("grep -E -s -i 'MediaCodec.*name=.*encoder.*type=\"video/(%s)\"|MediaCodec.*name=.*(%s).*encoder' /system/etc/media_codecs*.xml /vendor/etc/media_codecs*.xml /apex/com.android.media.swcodec/etc/media_codecs*.xml /etc/media_codecs*.xml", pattern, pattern))
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		log.Printf("Device %s media_codecs probe: no encoder found for %s; caching as unsupported", s.serial, codec)
		deviceUnsupportedCodecs.Store(key, true)
		return false
	}
	return true
}

func (s *Server) launchAndConnect(ctx context.Context, videoPort int, codec domain.VideoCodec, audioEnabled bool) error {
	args := []string{
		fmt.Sprintf("CLASSPATH=%s", DeviceServerJarPath),
		"app_process", "/",
		"com.genymobile.scrcpy.Server", ScrcpyVersion,
		"tunnel_forward=true",
		"video=true",
	}
	if audioEnabled {
		args = append(args,
			"audio=true",
			"audio_codec=aac",
			"audio_bit_rate=128000",
		)
	} else {
		args = append(args, "audio=false")
	}
	args = append(args,
		"control=true",
		fmt.Sprintf("video_codec=%s", codec),
		"max_size=0",
		"max_fps=60",
		"video_bit_rate=8000000",
		"send_device_meta=false",
		"send_dummy_byte=true",
		"send_codec_meta=false",
	)

	// tunnel_forward=true allows the host to connect via adb forward
	cmd := s.adb.Shell(ctx, s.serial, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch scrcpy-server process: %w", err)
	}
	s.cmd = cmd

	cmdDone := make(chan error, 1)
	go func() {
		cmdDone <- cmd.Wait()
	}()

	// Connect Connection #1 (Video Socket) with dummy byte verification
	var videoConn net.Conn
	addr := fmt.Sprintf("127.0.0.1:%d", videoPort)

	for attempt := 0; attempt < 30; attempt++ {
		select {
		case <-ctx.Done():
			s.cleanupProcess()
			return ctx.Err()
		case exitErr := <-cmdDone:
			s.cleanupProcess()
			return fmt.Errorf("scrcpy-server process exited prematurely: %w", exitErr)
		default:
		}

		conn, dialErr := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if dialErr != nil {
			time.Sleep(150 * time.Millisecond)
			continue
		}

		// Verify remote scrcpy-server is truly listening by reading the 1 dummy byte
		_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		dummy := make([]byte, 1)
		if _, readErr := io.ReadFull(conn, dummy); readErr != nil {
			// ADB accepted connection but remote Android socket refused; retry
			_ = conn.Close()
			time.Sleep(150 * time.Millisecond)
			continue
		}
		_ = conn.SetReadDeadline(time.Time{})
		videoConn = conn
		break
	}

	if videoConn == nil {
		s.cleanupProcess()
		return fmt.Errorf("connect video socket on %s: handshake timeout waiting for scrcpy-server", addr)
	}
	s.videoConn = videoConn

	// Connect Connection #2 (Audio Socket - if audioEnabled)
	if audioEnabled {
		audioConn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err != nil {
			s.cleanupProcess()
			return fmt.Errorf("connect audio socket on %s: %w", addr, err)
		}
		s.audioConn = audioConn
	}

	// Connect Connection #3 (or #2 if audio is disabled): Control Socket
	controlConn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		s.cleanupProcess()
		return fmt.Errorf("connect control socket on %s: %w", addr, err)
	}
	s.controlConn = controlConn

	// 4. Verify that video encoder actually starts by reading the initial parameter set (SPS/PPS)
	// If the device lacks an encoder for the selected codec, scrcpy closes the socket with EOF here.
	_ = videoConn.SetReadDeadline(time.Now().Add(2500 * time.Millisecond))
	firstPkt, err := ReadVideoPacket(videoConn)
	_ = videoConn.SetReadDeadline(time.Time{})
	if err != nil {
		s.cleanupProcess()
		return fmt.Errorf("verify video encoder output: %w", err)
	}

	// Replay initial packet into a transparent stream reader so relay receives all packets intact
	var ptsFlags uint64 = uint64(firstPkt.PTS)
	if firstPkt.IsConfig {
		ptsFlags |= PTSConfigFlag
	}
	if firstPkt.IsKeyFrame {
		ptsFlags |= PTSKeyFlag
	}

	rawBytes := make([]byte, 12+len(firstPkt.Data))
	binary.BigEndian.PutUint64(rawBytes[0:8], ptsFlags)
	binary.BigEndian.PutUint32(rawBytes[8:12], uint32(len(firstPkt.Data)))
	copy(rawBytes[12:], firstPkt.Data)

	s.videoReader = &readCloser{
		Reader: io.MultiReader(bytes.NewReader(rawBytes), videoConn),
		Closer: videoConn,
	}

	return nil
}

// VideoConn returns the dedicated video stream reader.
func (s *Server) VideoConn() io.Reader {
	if s.videoReader != nil {
		return s.videoReader
	}
	return s.videoConn
}

// ControlConn returns the dedicated bidirectional control socket.
func (s *Server) ControlConn() net.Conn {
	return s.controlConn
}

func (s *Server) cleanupProcess() {
	if s.videoConn != nil {
		_ = s.videoConn.Close()
		s.videoConn = nil
	}
	s.videoReader = nil
	if s.audioConn != nil {
		_ = s.audioConn.Close()
		s.audioConn = nil
	}
	if s.controlConn != nil {
		_ = s.controlConn.Close()
		s.controlConn = nil
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		s.cmd = nil
	}

	// CRITICAL: Host adb process kill does not terminate the remote child process inside Android.
	// Explicitly terminate any lingering remote scrcpy-server process to release the localabstract:scrcpy socket,
	// preventing exit status 134 (Aborted / core dumped) on immediate retries.
	// We specifically target com.genymobile.scrcpy.Server rather than generic app_process to prevent killing
	// Android's system Zygote daemon.
	if s.adb != nil && s.serial != "" {
		killCtx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		_ = s.adb.Shell(killCtx, s.serial, "pkill", "-9", "-f", "com.genymobile.scrcpy.Server").Run()
		cancel()
	}

	time.Sleep(200 * time.Millisecond)
}

// Close terminates process and all TCP socket connections (video, audio, control).
func (s *Server) Close() error {
	s.cleanupProcess()
	if s.videoPort != 0 && s.adb != nil {
		_ = s.adb.ForwardRemove(context.Background(), s.serial, s.videoPort)
		s.videoPort = 0
	}
	return nil
}

// StreamerFactory creates scrcpy Server instances implementing domain.DeviceStreamerFactory.
type StreamerFactory struct {
	adb *adb.Client
}

// NewStreamerFactory constructs a StreamerFactory.
func NewStreamerFactory(adbClient *adb.Client) *StreamerFactory {
	return &StreamerFactory{adb: adbClient}
}

// NewStreamer creates a new domain.DeviceStreamer instance for the given device serial.
func (f *StreamerFactory) NewStreamer(serial string) domain.DeviceStreamer {
	return NewServer(f.adb, serial)
}
