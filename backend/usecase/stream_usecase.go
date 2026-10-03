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

	"github.com/user/android-browser-stream/backend/domain"
)

// Channel multiplexing prefixes on single WebSocket connection
const (
	ChannelVideo    byte = 0x00
	ChannelAudio    byte = 0x01
	ChannelControl  byte = 0x02
	ChannelPing     byte = 0x03
	ChannelMetadata byte = 0x04
)

// StreamRelay handles byte-level multiplexing between TCP sockets and a WebSocket connection.
type StreamRelay struct {
	kioskEnabled bool
	recorder     domain.SessionRecorder
	audioReader  io.Reader
}

// NewStreamRelay constructs a StreamRelay instance.
func NewStreamRelay() *StreamRelay {
	return &StreamRelay{}
}

// SetKioskEnabled toggles server-side input filtering for kiosk mode.
func (r *StreamRelay) SetKioskEnabled(enabled bool) {
	r.kioskEnabled = enabled
}

// SetRecorder sets the SessionRecorder for streaming video packets to disk.
func (r *StreamRelay) SetRecorder(recorder domain.SessionRecorder) {
	r.recorder = recorder
}

// SetAudioReader sets the scrcpy audio stream reader for ChannelAudio (0x01) multiplexing.
func (r *StreamRelay) SetAudioReader(audioReader io.Reader) {
	r.audioReader = audioReader
}

// Relay establishes bidirectional forwarding between video/control sockets and WebSocket.
func (r *StreamRelay) Relay(ctx context.Context, videoReader io.Reader, controlWriter io.Writer, ws domain.WebSocketConn, initPackets ...[]byte) error {
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
	if closer, ok := r.audioReader.(io.Closer); ok {
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
		return ws.WriteMessage(ctx, msg)
	}

	// Send initial metadata frames (e.g. ChannelMetadata 0x04)
	for _, pkt := range initPackets {
		if len(pkt) > 0 {
			if err := safeWrite(pkt); err != nil {
				setErr(err)
				return err
			}
		}
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

			pkt, err := domain.ReadVideoPacket(videoReader)
			if err != nil {
				setErr(err)
				return
			}

			if r.recorder != nil {
				r.recorder.WritePacket(pkt.Data)
			}

			// Packet structure: [channel:1][pts_flags:8][size:4][data:N]
			msg := make([]byte, 1+12+len(pkt.Data))
			msg[0] = ChannelVideo

			var ptsFlags uint64 = uint64(pkt.PTS)
			if pkt.IsConfig {
				ptsFlags |= domain.PTSConfigFlag
			}
			if pkt.IsKeyFrame {
				ptsFlags |= domain.PTSKeyFlag
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

	// 2. Audio loop: audioReader (scrcpy) -> WebSocket (Channel 0x01)
	if r.audioReader != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				pkt, err := domain.ReadAudioPacket(r.audioReader)
				if err != nil {
					// Audio stream disconnected or silent; do not abort video/control session
					return
				}

				// Packet structure: [channel:1][pts_flags:8][size:4][data:N]
				msg := make([]byte, 1+12+len(pkt.Data))
				msg[0] = ChannelAudio

				var ptsFlags uint64 = uint64(pkt.PTS)
				if pkt.IsConfig {
					ptsFlags |= domain.PTSConfigFlag
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
	}

	// 3. Control & Ping loop: WebSocket (Channel 0x02, 0x03) -> controlWriter / ws echo
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			data, err := ws.ReadMessage(ctx)
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
				if r.kioskEnabled && isBlockedKioskControl(payload) {
					continue
				}
				if _, err := controlWriter.Write(payload); err != nil {
					setErr(err)
					return
				}
			}
		}
	}()

	// 3. Device message loop: scrcpy control socket -> WebSocket (Channel 0x02)
	// Reads incoming device messages (e.g. clipboard changes from Android)
	if controlReader, ok := controlWriter.(io.Reader); ok {
		wg.Add(1)
		go func() {
			defer wg.Done()
			typeBuf := make([]byte, 1)
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				if _, err := io.ReadFull(controlReader, typeBuf); err != nil {
					setErr(err)
					return
				}

				msgType := typeBuf[0]
				switch msgType {
				case 0x00: // DEVICE_MSG_TYPE_CLIPBOARD
					lenBuf := make([]byte, 4)
					if _, err := io.ReadFull(controlReader, lenBuf); err != nil {
						setErr(err)
						return
					}
					length := binary.BigEndian.Uint32(lenBuf)
					if length > 256*1024 { // 256 KB safety cap
						if _, err := io.CopyN(io.Discard, controlReader, int64(length)); err != nil {
							setErr(err)
							return
						}
						continue
					}
					textBytes := make([]byte, length)
					if _, err := io.ReadFull(controlReader, textBytes); err != nil {
						setErr(err)
						return
					}

					// Wrap in ChannelControl (0x02) and relay to WebSocket
					// Wire format: [ChannelControl:1B][type:1B][length:4B BE][textBytes:N]
					wsMsg := make([]byte, 1+1+4+length)
					wsMsg[0] = ChannelControl
					wsMsg[1] = 0x00
					copy(wsMsg[2:6], lenBuf)
					copy(wsMsg[6:], textBytes)
					if err := safeWrite(wsMsg); err != nil {
						setErr(err)
						return
					}
				case 0x01: // DEVICE_MSG_TYPE_ACK_CLIPBOARD: [type:1B][sequence:8B BE]
					seqBytes := make([]byte, 8)
					if _, err := io.ReadFull(controlReader, seqBytes); err != nil {
						setErr(err)
						return
					}
				default:
					// Unknown scrcpy device message type
				}
			}
		}()
	}

	wg.Wait()
	return firstErr
}

// StreamUsecase coordinates device boot readiness, scrcpy execution, and streaming relay.
type StreamUsecase struct {
	commander       domain.DeviceCommander
	streamerFactory domain.DeviceStreamerFactory
	sessionRepo     domain.SessionRepository
	containerRepo   domain.ContainerRepository
	scrcpyBinPath   string
	relay           *StreamRelay
	recorderFactory domain.RecorderFactory
}

// StreamUsecaseOption configures optional dependencies for StreamUsecase.
type StreamUsecaseOption func(*StreamUsecase)

// WithContainerRepo sets the container repository for inspecting container status.
func WithContainerRepo(cr domain.ContainerRepository) StreamUsecaseOption {
	return func(u *StreamUsecase) {
		u.containerRepo = cr
	}
}

// WithRecorderFactory sets the factory for session recording.
func WithRecorderFactory(f domain.RecorderFactory) StreamUsecaseOption {
	return func(u *StreamUsecase) {
		u.recorderFactory = f
	}
}

// NewStreamUsecase constructs a StreamUsecase adhering to Dependency Inversion.
func NewStreamUsecase(
	commander domain.DeviceCommander,
	streamerFactory domain.DeviceStreamerFactory,
	sr domain.SessionRepository,
	scrcpyPath string,
	opts ...StreamUsecaseOption,
) *StreamUsecase {
	u := &StreamUsecase{
		commander:       commander,
		streamerFactory: streamerFactory,
		sessionRepo:     sr,
		scrcpyBinPath:   scrcpyPath,
		relay:           NewStreamRelay(),
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// RelaySession waits for Android boot, starts scrcpy-server, and relays stream to the WebSocket.
func (u *StreamUsecase) RelaySession(ctx context.Context, session *domain.Session, ws domain.WebSocketConn, requestedCodecs ...string) error {
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

		if err := u.commander.Connect(bootCtx, "127.0.0.1", session.ADBPort); err == nil {
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
		if err := u.commander.WaitForBoot(bootCtx, serial, 1*time.Second); err == nil {
			break
		}
	}

	// Negotiate codec with client
	serverSupported := []domain.VideoCodec{domain.CodecH264, domain.CodecH265, domain.CodecAV1}
	requestedCodec, _ := domain.NegotiateCodec(requestedCodecs, serverSupported)

	// 3. Start scrcpy-server with scrcpy forwarding port = ADBPort + 100
	scrcpyPort := session.ADBPort + 100
	server := u.streamerFactory.NewStreamer(serial)
	if err := server.Start(ctx, u.scrcpyBinPath, scrcpyPort, requestedCodec); err != nil {
		return fmt.Errorf("start scrcpy-server: %w", err)
	}
	defer server.Close()

	// Actual codec selected after device capability check & encoder fallback
	chosenCodec := server.Codec()
	wireID := domain.CodecWireID(chosenCodec)

	// Initial screen wake kick and visual touch indicator setup
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(100 * time.Millisecond):
		}
		cmdCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		_, _ = u.commander.RunShell(cmdCtx, serial, "input", "keyevent", "82")
		_, _ = u.commander.RunShell(cmdCtx, serial, "settings", "put", "system", "show_touches", "1")
	}()

	// 4. Mark session as streaming
	_ = u.sessionRepo.UpdateStatus(ctx, session.ID, domain.SessionStatusStreaming)

	// Initialize recording if session.Recording is enabled
	var rec domain.SessionRecorder
	if session.Recording && u.recorderFactory != nil {
		r, outPath, err := u.recorderFactory.CreateRecorder(ctx, session.ID, chosenCodec)
		if err == nil && r != nil {
			rec = r
			defer rec.Close()
			_ = u.sessionRepo.UpdateRecordingPath(ctx, session.ID, outPath)
		}
	}

	// Kiosk mode setup (Tier 2: AOSP system policy lockdown + Tier 3: Watchdog)
	if session.KioskEnabled {
		targetPkg := session.TargetPackage
		if targetPkg == "" {
			targetPkg = "com.android.deskclock"
		}
		targetAct := session.TargetActivity
		if targetAct == "" && targetPkg == "com.android.deskclock" {
			targetAct = ".DeskClock"
		}

		go func() {
			select {
			case <-ctx.Done():
				return
			case <-time.After(300 * time.Millisecond):
			}
			cmdCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			// Tier 2: AOSP lockdown
			// 1. Fabricate Runtime Resource Overlays (FRRO) to set navigation bar height to 0
			// This permanently removes the NavigationBar from Android SystemUI at the OS compositor level
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "fabricate", "--target", "android", "--name", "HideNavBar", "android:dimen/navigation_bar_height", "0x05", "0x00000000")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "fabricate", "--target", "android", "--name", "HideNavBarFrame", "android:dimen/navigation_bar_frame_height", "0x05", "0x00000000")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "fabricate", "--target", "com.android.systemui", "--name", "HideSysUINavBar", "com.android.systemui:dimen/navigation_bar_size", "0x05", "0x00000000")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "fabricate", "--target", "com.android.systemui", "--name", "HideSysUINavBarFrame", "com.android.systemui:dimen/navigation_bar_frame_height", "0x05", "0x00000000")

			// Enable the fabricated overlays
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "enable", "com.android.shell:HideNavBar")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "enable", "com.android.shell:HideNavBarFrame")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "enable", "com.android.shell:HideSysUINavBar")
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "cmd", "overlay", "enable", "com.android.shell:HideSysUINavBarFrame")

			// Restart SystemUI to apply zero-height navigation bar
			_, _ = u.commander.RunShell(cmdCtx, serial, "su", "0", "pkill", "-f", "com.android.systemui")

			// 2. Send disable flags to StatusBarManager to physically disable Home, Recents, Search, and Notification pull-down
			_, _ = u.commander.RunShell(cmdCtx, serial, "cmd", "statusbar", "send-disable-flag", "home", "recents", "search", "statusbar-expansion", "notification-peek")

			// 3. Enable lock-to-app / screen pinning policy and immersive fullscreen
			_, _ = u.commander.RunShell(cmdCtx, serial, "settings", "put", "secure", "lock_to_app_enabled", "1")
			_, _ = u.commander.RunShell(cmdCtx, serial, "settings", "put", "global", "policy_control", "immersive.full=*")

			// 4. Launch target application
			if targetAct != "" {
				_, _ = u.commander.RunShell(cmdCtx, serial, "am", "start", "-n", targetPkg+"/"+targetAct)
			} else {
				_, _ = u.commander.RunShell(cmdCtx, serial, "monkey", "-p", targetPkg, "-c", "android.intent.category.LAUNCHER", "1")
			}

			// Tier 3: Watchdog ensures target app stays in foreground (at 300ms interval)
			watchdog := NewKioskWatchdog(u.commander, serial, targetPkg, targetAct, 300*time.Millisecond)
			watchdog.Start(ctx)
		}()
	}

	// 5. Wrap control socket with LastActiveAt touch updater & ReadWriter
	controlConn := server.ControlConn()
	var controlWriter io.Writer = controlConn
	if controlConn != nil {
		controlWriter = &activityTrackingReadWriter{
			conn:        controlConn,
			sessionID:   session.ID,
			sessionRepo: u.sessionRepo,
		}
	}

	// 6. Build Channel 0x04 metadata packet: [0x04][wireID:1B][width:2B BE][height:2B BE]
	meta := make([]byte, 6)
	meta[0] = ChannelMetadata
	meta[1] = wireID
	w := session.DeviceWidth
	if w <= 0 {
		w = 1080
	}
	h := session.DeviceHeight
	if h <= 0 {
		h = 1920
	}
	binary.BigEndian.PutUint16(meta[2:4], uint16(w))
	binary.BigEndian.PutUint16(meta[4:6], uint16(h))

	// 7. Execute relay loop with per-session options
	relay := NewStreamRelay()
	if session.KioskEnabled {
		relay.SetKioskEnabled(true)
	}
	if rec != nil {
		relay.SetRecorder(rec)
	}
	if server.AudioConn() != nil {
		relay.SetAudioReader(server.AudioConn())
	}

	return relay.Relay(ctx, server.VideoConn(), controlWriter, ws, meta)
}

// isBlockedKioskControl checks if an incoming scrcpy control message violates kiosk isolation.
func isBlockedKioskControl(payload []byte) bool {
	if len(payload) == 0 {
		return false
	}
	msgType := payload[0]
	// 1. Keycode injection: drop Home (3), App Switch (187), Power (26), Settings (176), Search (84)
	if msgType == domain.MsgTypeInjectKeycode && len(payload) >= 6 {
		keycode := binary.BigEndian.Uint32(payload[2:6])
		switch keycode {
		case 3, 187, 26, 176, 84:
			return true
		}
	}
	// Note: Bottom navigation bar is physically eliminated at the OS compositor level (h=0) via FRRO overlays.
	// We only guard extreme top-edge swipes (top 15px) to prevent notification shade drag attempts.
	if msgType == domain.MsgTypeInjectTouchEvent && len(payload) >= 22 {
		action := payload[1]
		y := int32(binary.BigEndian.Uint32(payload[14:18]))
		if action == domain.ActionDown && y < 15 {
			return true
		}
	}
	return false
}

type activityTrackingReadWriter struct {
	conn         net.Conn
	sessionID    string
	sessionRepo  domain.SessionRepository
	lastRecorded time.Time
	mu           sync.Mutex
}

func (w *activityTrackingReadWriter) Read(p []byte) (int, error) {
	return w.conn.Read(p)
}

func (w *activityTrackingReadWriter) Close() error {
	return w.conn.Close()
}

func (w *activityTrackingReadWriter) Write(p []byte) (int, error) {
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
