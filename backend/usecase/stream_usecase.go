package usecase

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/adb"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
)

// Channel multiplexing prefixes on single WebSocket connection
const (
	ChannelVideo   byte = 0x00
	ChannelAudio   byte = 0x01
	ChannelControl byte = 0x02
	ChannelPing    byte = 0x03
)

// StreamRelay handles byte-level multiplexing between TCP sockets and a WebSocket connection.
type StreamRelay struct{}

// NewStreamRelay constructs a StreamRelay instance.
func NewStreamRelay() *StreamRelay {
	return &StreamRelay{}
}

// Relay establishes bidirectional forwarding between video/control sockets and WebSocket.
func (r *StreamRelay) Relay(ctx context.Context, videoReader io.Reader, controlWriter io.Writer, ws *websocket.Conn) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// If reader/writer implement io.Closer, ensure cancellation unblocks blocking socket reads
	if closer, ok := videoReader.(io.Closer); ok {
		go func() {
			<-ctx.Done()
			_ = closer.Close()
		}()
	}
	if closer, ok := controlWriter.(io.Closer); ok {
		go func() {
			<-ctx.Done()
			_ = closer.Close()
		}()
	}

	var wg sync.WaitGroup
	var errOnce sync.Once
	var firstErr error

	setErr := func(err error) {
		errOnce.Do(func() {
			if !errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) && !errors.Is(err, io.ErrClosedPipe) && !errors.Is(err, net.ErrClosed) {
				firstErr = err
			}
			cancel()
		})
	}

	var writeMu sync.Mutex
	safeWrite := func(msg []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return ws.Write(ctx, websocket.MessageBinary, msg)
	}

	// 1. Video loop: videoReader (scrcpy) -> WebSocket (Channel 0x00)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			pkt, err := scrcpy.ReadVideoPacket(videoReader)
			if err != nil {
				setErr(err)
				return
			}

			// Packet structure: [channel:1][pts_flags:8][size:4][data:N]
			msg := make([]byte, 1+12+len(pkt.Data))
			msg[0] = ChannelVideo

			var ptsFlags uint64 = uint64(pkt.PTS)
			if pkt.IsConfig {
				ptsFlags |= scrcpy.PTSConfigFlag
			}
			if pkt.IsKeyFrame {
				ptsFlags |= scrcpy.PTSKeyFlag
			}

			binary.BigEndian.PutUint64(msg[1:9], ptsFlags)
			binary.BigEndian.PutUint32(msg[9:13], uint32(len(pkt.Data)))
			copy(msg[13:], pkt.Data)

			if err := safeWrite(msg); err != nil {
				setErr(err)
				return
			}
		}
	}()

	// 2. Control & Ping loop: WebSocket (Channel 0x02, 0x03) -> controlWriter / ws echo
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			_, data, err := ws.Read(ctx)
			if err != nil {
				setErr(err)
				return
			}

			if len(data) < 2 {
				continue
			}

			channel := data[0]
			payload := data[1:]

			if channel == ChannelPing {
				// Immediate low-latency echo of timestamp bytes for RTT measurement
				if err := safeWrite(data); err != nil {
					setErr(err)
					return
				}
				continue
			}

			if channel == ChannelControl && controlWriter != nil {
				if _, err := controlWriter.Write(payload); err != nil {
					setErr(err)
					return
				}
			}
		}
	}()

	wg.Wait()
	return firstErr
}

// StreamUsecase coordinates device boot readiness, scrcpy execution, and streaming relay.
type StreamUsecase struct {
	adb           *adb.Client
	sessionRepo   domain.SessionRepository
	containerRepo domain.ContainerRepository
	scrcpyBinPath string
	relay         *StreamRelay
}

// StreamUsecaseOption configures optional dependencies for StreamUsecase.
type StreamUsecaseOption func(*StreamUsecase)

// WithContainerRepo sets the container repository for inspecting container status.
func WithContainerRepo(cr domain.ContainerRepository) StreamUsecaseOption {
	return func(u *StreamUsecase) {
		u.containerRepo = cr
	}
}

// NewStreamUsecase constructs a StreamUsecase.
func NewStreamUsecase(adbClient *adb.Client, sr domain.SessionRepository, scrcpyPath string, opts ...StreamUsecaseOption) *StreamUsecase {
	u := &StreamUsecase{
		adb:           adbClient,
		sessionRepo:   sr,
		scrcpyBinPath: scrcpyPath,
		relay:         NewStreamRelay(),
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// RelaySession waits for Android boot, starts scrcpy-server, and relays stream to the WebSocket.
func (u *StreamUsecase) RelaySession(ctx context.Context, session *domain.Session, ws *websocket.Conn) error {
	serial := fmt.Sprintf("127.0.0.1:%d", session.ADBPort)

	// 1. Connect ADB with retry while continuously verifying container health
	bootCtx, bootCancel := context.WithTimeout(ctx, 45*time.Second)
	defer bootCancel()

	connected := false
	for {
		select {
		case <-bootCtx.Done():
			return fmt.Errorf("timeout waiting for device ADB connection on %s: %w", serial, bootCtx.Err())
		default:
		}

		if u.containerRepo != nil && session.ContainerID != "" {
			running, err := u.containerRepo.IsRunning(bootCtx, session.ContainerID)
			if err == nil && !running {
				return fmt.Errorf("container exited: Docker Desktop lacks binder_linux. Run on native Ubuntu or see deploy/setup-vm.sh")
			}
		}

		if err := u.adb.Connect(bootCtx, "127.0.0.1", session.ADBPort); err == nil {
			connected = true
			break
		}

		select {
		case <-bootCtx.Done():
			return fmt.Errorf("timeout waiting for device ADB connection on %s: %w", serial, bootCtx.Err())
		case <-time.After(500 * time.Millisecond):
		}
	}

	if !connected {
		return fmt.Errorf("failed to connect ADB on %s", serial)
	}

	// 2. Wait for Android boot completion while continuously verifying container health
	for {
		select {
		case <-bootCtx.Done():
			return fmt.Errorf("timeout waiting for Android boot on %s: %w", serial, bootCtx.Err())
		default:
		}

		if u.containerRepo != nil && session.ContainerID != "" {
			running, err := u.containerRepo.IsRunning(bootCtx, session.ContainerID)
			if err == nil && !running {
				return fmt.Errorf("container exited during boot (exit code 129: kernel 'binder_linux' missing; see deploy/setup-vm.sh)")
			}
		}

		// Check sys.boot_completed
		if err := u.adb.WaitForBoot(bootCtx, serial, 1*time.Second); err == nil {
			break
		}
	}

	// 3. Start scrcpy-server with scrcpy forwarding port = ADBPort + 100
	scrcpyPort := session.ADBPort + 100
	server := scrcpy.NewServer(u.adb, serial)
	if err := server.Start(ctx, u.scrcpyBinPath, scrcpyPort); err != nil {
		return fmt.Errorf("start scrcpy-server: %w", err)
	}
	defer server.Close()

	// Initial screen wake kick to prompt SurfaceFlinger to produce keyframe immediately
	go func() {
		time.Sleep(100 * time.Millisecond)
		wakeCmd := u.adb.Shell(context.Background(), serial, "input", "keyevent", "82")
		_ = wakeCmd.Run()
	}()

	// 4. Mark session as streaming
	_ = u.sessionRepo.UpdateStatus(ctx, session.ID, domain.SessionStatusStreaming)

	// 5. Wrap control socket with LastActiveAt touch updater
	controlConn := server.ControlConn()
	var controlWriter io.Writer = controlConn
	if controlConn != nil {
		controlWriter = &activityTrackingWriter{
			conn:        controlConn,
			sessionID:   session.ID,
			sessionRepo: u.sessionRepo,
		}
	}

	// 5. Execute relay loop
	return u.relay.Relay(ctx, server.VideoConn(), controlWriter, ws)
}

type activityTrackingWriter struct {
	conn         net.Conn
	sessionID    string
	sessionRepo  domain.SessionRepository
	lastRecorded time.Time
	mu           sync.Mutex
}

func (w *activityTrackingWriter) Write(p []byte) (int, error) {
	n, err := w.conn.Write(p)
	if n > 0 && w.sessionRepo != nil {
		w.mu.Lock()
		now := time.Now().UTC()
		if now.Sub(w.lastRecorded) > 5*time.Second {
			w.lastRecorded = now
			w.mu.Unlock()
			go func() {
				_ = w.sessionRepo.UpdateLastActive(context.Background(), w.sessionID, now)
			}()
		} else {
			w.mu.Unlock()
		}
	}
	return n, err
}
