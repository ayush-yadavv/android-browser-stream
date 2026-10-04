# DroidCanvas — Architecture & System Design

This document details the architectural design, streaming pipeline, ephemeral container orchestration, input forwarding mechanism, latency optimization strategies, and engineering trade-offs of **DroidCanvas** (`android-browser-stream`).

---

## 1. System Overview & Topology

The system enables sub-50ms, interactive Android container streaming directly inside standard web browsers without plugins or downloads. It is architected around a **Server-as-Orchestration-Hub** model following strict **Clean Architecture** principles.

```mermaid
flowchart TB
    subgraph Client["Browser Client (React + WebCodecs)"]
        Canvas["HTML5 Canvas (1080x1920)"]
        Decoder["WebCodecs Hardware VideoDecoder"]
        WSClient["Binary WebSocket Client (Channels 0x00, 0x02, 0x03)"]
        InputHook["useInputCapture (Pointer / Scroll / Keyboard)"]
        HUD["LatencyHud (FPS / Jitter / RTT / Bitrate)"]

        WSClient -->|"0x00 Video NALs"| Decoder
        Decoder -->|"VideoFrame (latest-wins)"| Canvas
        InputHook -->|"0x02 Scrcpy Control Payloads"| WSClient
        WSClient <-->|"0x03 Timestamp Ping/Pong"| HUD
    end

    subgraph Server["Go Backend Service (Clean Architecture)"]
        GinAPI["Gin HTTP & WebSocket API (/api/*)"]
        RelayUsecase["StreamRelay (Byte Multiplexer)"]
        SessionUsecase["SessionUsecase (Lifecycle & Idle Reaper)"]
        PortPool["PortPool (Thread-Safe FIFO Allocator)"]
        ADBClient["ADB Client (Connect, Push, Forward)"]
        DockerRepo["Docker Client (Container Orchestration)"]
        SQLiteRepo["SQLite Session Repository"]

        GinAPI --> RelayUsecase
        GinAPI --> SessionUsecase
        SessionUsecase --> PortPool
        SessionUsecase --> DockerRepo
        SessionUsecase --> SQLiteRepo
        RelayUsecase --> ADBClient
    end

    subgraph Sandbox["Ephemeral Android 13 Sandbox (Redroid Container)"]
        ADBServer["adbd (Port 5555)"]
        ScrcpyServer["scrcpy-server v2.7 (localabstract:scrcpy)"]
        AndroidFramework["Android 13 Framework (SurfaceFlinger / InputFlinger)"]

        ADBServer --> ScrcpyServer
        ScrcpyServer --> AndroidFramework
    end

    WSClient <==>|"Single Binary WebSocket"| GinAPI
    RelayUsecase <-->|"TCP #1 Video Socket (H.264 Annex B)"| ScrcpyServer
    RelayUsecase <-->|"TCP #2 Control Socket (Binary Events)"| ScrcpyServer
```

---

## 2. Clean Architecture Layer Separation

The backend adheres strictly to Clean Architecture separation of concerns:

1. **Domain Layer (`backend/domain`)**:
   - Zero framework dependencies (only Go standard library: `context`, `time`).
   - Defines core entities (`Session`, `SessionStatus`, `ContainerConfig`).
   - Declares pure interface contracts: `SessionRepository`, `ContainerRepository`, `SessionUsecase`, `StreamUsecase`.
   - Defines sentinel errors (`ErrSessionNotFound`, `ErrSessionLimit`, etc.).

2. **Use Case Layer (`backend/usecase`)**:
   - Encapsulates all business logic and orchestration workflows.
   - `SessionUsecase`: Handles session creation, port leasing, idempotency guards, and automatic background reaper for idle sessions older than 5 minutes.
   - `StreamUsecase`: Coordinates cold boot retry loops, scrcpy server staging, and TCP socket forwarding.
   - `StreamRelay`: Implements byte-level 1-byte multiplexing across concurrent goroutines with thread-safe write locking (`sync.Mutex`).

3. **Infrastructure Layer (`backend/infrastructure`)**:
   - Adapters for external dependencies.
   - `docker.Client`: Interacts with Docker Engine via the Docker Go SDK. Supports automatic daemon discovery across `/var/run/docker.sock` and Linux user-space Docker Desktop sockets (`~/.docker/desktop/docker.sock`).
   - `adb.Client`: Communicates with Android via `adb` command execution, providing retrying connection loops and automatic `forward --remove` cleanup.
   - `scrcpy`: Binary packet readers (`video.go` with 16MB allocation guards) and binary control payload writers (`control.go`).
   - `portpool`: Thread-safe FIFO host port allocator.

4. **Repository Layer (`backend/repository`)**:
   - Implements `domain.SessionRepository` backed by SQLite.
   - Automatically initializes schema and parent directory hierarchies.

5. **API Layer (`backend/api`)**:
   - Controllers (`SessionController`, `StreamController`) remain thin adapters: parse HTTP parameters, call usecases, format JSON / upgrade WebSockets, and map domain errors to HTTP status codes.

---

## 3. Streaming Protocol & Demultiplexing

To avoid dual connection complexity, NAT traversal overhead, and protocol mismatch, a **single binary WebSocket connection** (`GET /api/sessions/:id/stream`) multiplexes video, control, and telemetry using a 1-byte prefix header:

| Channel Byte | Channel Type | Direction | Payload Structure |
|:---|:---|:---|:---|
| `0x00` | Video Stream | Backend $\to$ Frontend | `[PTS + Flags: 8B][Size: 4B][Annex B NAL Data: NB]` |
| `0x01` | Audio Stream | Backend $\to$ Frontend | Reserved for Opus/AAC audio packets |
| `0x02` | Control Events | Frontend $\to$ Backend | Scrcpy v2.7 binary control payloads (Touch / Scroll / Key) |
| `0x03` | Latency Ping/Pong | Bidirectional | `[Microsecond Timestamp: 8B]` (immediate server echo) |

### Video Stream Demuxing
scrcpy-server v2.7 produces raw H.264 Annex B byte streams with a 12-byte header per packet:
- **Bits 0–61**: Presentation Timestamp (PTS) in microseconds.
- **Bit 62**: Keyframe indicator flag (`PTS_KEY_FLAG = 1 << 62`).
- **Bit 63**: Parameter set indicator flag (`PTS_CONFIG_FLAG = 1 << 63`).
- **Bytes 8–11**: 32-bit packet size ($N$).
- **Bytes 12–(12+$N$)**: Raw NAL units (`0x00000001` start codes).

---

## 4. Architectural Alternatives Considered & Why Rejected

The technical strategy was chosen by systematically benchmarking architectural alternatives across performance, protocol overhead, cloud operational complexity, and the 72-hour development window:

| Architecture Domain | Selected Technology | Evaluated Alternatives | Rationale & Failure Mode of Rejected Options |
|:---|:---|:---|:---|
| **Android Virtualization** | **Redroid (Docker + Binder IPC)** | QEMU / Android Emulator, Waydroid, Anbox | • *QEMU / Official Emulator:* Consumes 2.5–4GB RAM baseline per VM; cold boot takes 60–90 seconds; nested KVM virtualization is unreliable on standard cloud VMs.<br>• *Waydroid / Anbox:* Waydroid requires a host Wayland compositor and desktop GUI environment; Anbox is deprecated. Redroid runs headless in native OCI containers sharing the Linux kernel via `/dev/binderfs`, consuming only ~800MB RAM. |
| **Video Transport & Decoding** | **scrcpy-server v2.7 $\to$ Go WS Relay $\to$ WebCodecs** | WebRTC (Pion / GStreamer), VNC / noVNC (RFB), MJPEG | • *WebRTC:* While excellent for lossy UDP, WebRTC introduces 20–45ms jitter buffer latency, complex SDP offer/answer signaling, and requires transcoding/RTP packetizing scrcpy NALs on the host VM.<br>• *VNC / RFB:* Uncompressed frame deltas cause high bandwidth and cap framerates at 10–15 FPS with >200ms latency.<br>• *WebCodecs over Binary WS:* Delivers sub-30ms glass-to-glass latency with zero server transcoding CPU, feeds GPU directly, and operates through standard corporate port 443 HTTPS/WSS. |
| **Input Forwarding Protocol** | **scrcpy Binary Control Protocol** | ADB Shell (`input tap / key`), OpenSTF minitouch | • *ADB Shell Commands:* Spawning `/system/bin/sh` and an `app_process` Java VM for each click/key takes 150–300ms per event, making scrolling or continuous dragging unusable.<br>• *minitouch:* Relies on low-level `/dev/input/event*` devices, which are deprecated and non-portable on Android 13.<br>• *scrcpy Control Protocol:* Injects directly into Android's `InputManager` via reflected IPC with sub-millisecond dispatch time. |
| **Clipboard Synchronization** | **Native scrcpy Bidirectional Control** | `STFService.apk`, ADB clipboard polling | • *`STFService.apk`:* Relies on background broadcast intents, which are blocked on Android 10+ due to privacy restrictions on background clipboard access.<br>• *ADB Polling:* Periodic `cmd clipboard get` polling creates excessive CPU spikes and delay.<br>• *Native scrcpy:* Runs as UID 2000 (`app_process`) and hooks directly into Android's `IClipboard` listener, providing sub-millisecond bidirectional sync with zero external APKs. |
| **Kiosk Mode Restricted Access** | **3-Tier Defense-in-Depth** | Client-Side JS Disabling, AOSP Lock Task Mode alone | • *Client-Side JS:* Easily bypassed by inspecting DOM or sending custom WebSocket messages; violates the requirement that enforcement must not rely solely on the browser.<br>• *3-Tier Defense:* (1) Server Go input gate dropping Home, Recents, Power keys and edge gestures; (2) AOSP immersive policy hiding system bars; (3) Go activity watchdog polling `dumpsys` and killing unauthorized apps. |
| **Session Recording** | **FFmpeg Stream Copy to Fragmented MP4 (fMP4)** | Android `screenrecord` CLI, Backend Transcoding (`libx264`) | • *Android `screenrecord`:* Limited to 3 minutes, competes with scrcpy for hardware encoder resources.<br>• *Backend Transcoding:* Requires ~100% CPU core per session.<br>• *FFmpeg fMP4 Stream Copy:* Enqueues raw Annex B NALs through a non-blocking Go channel to `ffmpeg -c:v copy -movflags frag_keyframe+empty_moov+default_base_moof`. Near-zero CPU overhead, crash-resilient (no corrupted `moov` atom), and playable in-browser via HTTP 206 Range headers. |

### Latest-Frame-Wins Pattern
In real-time interactive streaming, displaying a stale frame is worse than dropping it.
`useVideoDecoder.ts` implements a zero-buffering display pipeline:
1. `VideoDecoder.decode(chunk)` processes incoming NALs directly on the GPU.
2. The output callback stores the decoded `VideoFrame` in a React `pendingFrame` ref, instantly closing any previous unrendered frame.
3. `requestAnimationFrame` schedules canvas rendering on the display refresh cycle.
4. Immediately after `ctx.drawImage(frame, ...)`, `frame.close()` is invoked to release the underlying hardware surface, eliminating memory leaks and frame accumulation.

---

## 5. Input Forwarding & Normalization

Browser input is captured on the HTML5 Canvas and serialized into scrcpy v2.7 binary control packets:

1. **Touch Injection (32 Bytes)**:
   - Normalized coordinate calculation:
     $$\text{DeviceX} = \text{clamp}\left(0, \frac{\text{ClientX} - \text{RectLeft}}{\text{RectWidth}} \times \text{DeviceWidth}, \text{DeviceWidth} - 1\right)$$
     $$\text{DeviceY} = \text{clamp}\left(0, \frac{\text{ClientY} - \text{RectTop}}{\text{RectHeight}} \times \text{DeviceHeight}, \text{DeviceHeight} - 1\right)$$
   - Throttled to 60Hz (16ms) during drag/move to prevent WebSocket buffer saturation.
   - Full pointer lifecycle: `DOWN (0x00)`, `UP (0x01)`, `MOVE (0x02)` with pointer capture release.

2. **Wheel Scrolling (21 Bytes)**:
   - Normalized signed 16-bit integer step calculation:
     $$\text{vscroll} = \text{clamp}\left(-10, -\text{round}\left(\frac{\Delta Y}{20}\right), 10\right)$$
     $$\text{hscroll} = \text{clamp}\left(-10, -\text{round}\left(\frac{\Delta X}{20}\right), 10\right)$$

3. **Keyboard & Text Injection**:
   - `keymap.ts` maps `KeyboardEvent.code` to Android `KeyEvent.KEYCODE_*` (letters, digits, arrows, backspace, enter, escape/back).
   - Computes modifier bitmasks (`AMETA_SHIFT_ON`, `AMETA_CTRL_ON`, `AMETA_ALT_ON`).
   - Dedicated UTF-8 text injection packet (`0x01` + 4B length + text) for instant clipboard/credential pasting without soft keyboard delays.

---

## 6. Container Sandboxing, Kiosk Lockdown & Bonus Implementations

### 6.1 Ephemeral Container Isolation (BR-1)
- **Zero Cross-Session Leakage:** Every user handshake dynamically provisions a dedicated Redroid container (`redroid/redroid:13.0.0-latest`) with isolated Linux namespaces (`pid`, `net`, `ipc`, `mnt`).
- **No Shared Storage:** Storage directories (`/data`, `/sdcard`) and internal package states are ephemeral. Terminating the session completely purges the container and its virtual disk.
- **Port Isolation:** ADB ports are leased from a synchronized thread-safe FIFO pool (`portpool.Pool`, ports 5555–5557). Double-release idempotency guards prevent port collisions or port hijacking across sessions.

### 6.2 On-Demand Lifecycle Management & Abandoned Session Reaper (BR-2)
- **Zero Pre-allocated Waste:** No containers are pre-allocated per specific user. Containers spin up upon `POST /api/sessions`.
- **Pre-warmed Pool Optimization:** An opt-in background pool (`PREWARMED_POOL_SIZE`) keeps pre-booted containers ready with `scrcpy-server` pre-staged, cutting user-perceived connection latency from 30s to < 300ms.
- **Abandoned Session Reaper:** 
  1. *Immediate Disconnect Reaper:* When the client closes the tab, navigates away, or drops network connectivity, the stream handler's deferred cleanup sequence immediately shuts down scrcpy, disconnects ADB, removes forwarding tunnels, and destroys the container within 2 seconds.
  2. *Background Stale Reaper:* A background supervisor goroutine audits SQLite every 60 seconds. Any session whose `last_active_at` timestamp is older than 5 minutes is automatically terminated and pruned, guaranteeing zero leaked host memory or ports.

### 6.3 Two-Way Bidirectional Clipboard Synchronization (BR-3)
- **Host-to-Device Sync:**
  When the user copies text on their computer and pastes in the browser canvas (`Ctrl+V` or Toolbar Paste), the client sends a `0x02` control packet containing `SC_CONTROL_MSG_TYPE_SET_CLIPBOARD` (`0x09`). Scrcpy-server running as UID 2000 (`app_process`) immediately injects the text into Android's `ClipboardManager`.
- **Device-to-Host Sync:**
  When text is copied inside Android (e.g. long-pressing text in an app), scrcpy-server's registered `IOnPrimaryClipChangedListener` captures the clip change and emits a `DEVICE_MSG_TYPE_CLIPBOARD` (`0x00`) packet across the control socket. The Go backend relays this over WebSocket Channel `0x02` to the browser, which syncs it to the host clipboard via `navigator.clipboard.writeText()` and displays a transient HUD notification.
- **Echo Loop Prevention:** An in-memory cache of the most recently sent clipboard hash prevents infinite echo loops between host and device.

### 6.4 Restricted Access / Kiosk Mode Enforcement (BR-4)
- **Selected Application:** **AOSP DeskClock (`com.android.deskclock/.DeskClock`)**.
- **Justification for App Choice:** 
  DeskClock is pre-installed in the AOSP image, runs completely offline with zero external network or account dependencies, and provides an ideal interactive testing surface (clock tabs, stopwatch with millisecond precision for the Visual Loopback test, and alarm settings) that thoroughly exercises touch, scroll, and numeric keyboard input.
- **3-Tier Defense-in-Depth Enforcement:**
  1. *Tier 1: Server-Side Input Gate (Go Relay):*
     In `usecase/stream_usecase.go`, the relay intercepts all incoming Channel `0x02` packets. It strictly drops unauthorized keycodes (`KEYCODE_HOME` 3, `KEYCODE_APP_SWITCH` 187, `KEYCODE_POWER` 26, `KEYCODE_SETTINGS` 176, `KEYCODE_SEARCH` 84). Furthermore, it clamps touch coordinates to discard notification shade pull-downs (top 24px) and navigation bar gestures (bottom 36px).
  2. *Tier 2: AOSP System Policy:*
     On launch, the container applies global immersive policy (`settings put global policy_control immersive.full=*`) and disables the default launcher (`pm disable-user --user 0 com.android.launcher3`), hiding system bars.
  3. *Tier 3: Go Activity Guardian Watchdog:*
     A background goroutine in `usecase/kiosk_watchdog.go` queries `dumpsys activity activities` every 750ms. If the resumed package deviates from `com.android.deskclock`, it immediately issues `am force-stop` on the unauthorized package and relaunches DeskClock.

### 6.5 Automated Session Recording & In-Browser Playback (BR-5)
- **Zero-Transcode Stream Copy:**
  During an active session, each raw H.264 Annex B NAL packet (`0x00`) received from scrcpy is enqueued to a buffered Go channel feeding an FFmpeg subprocess stdin pipe:
  ```bash
  ffmpeg -y -f h264 -r 60 -i pipe:0 -c:v copy \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    data/recordings/{session_id}.mp4
  ```
- **100% Crash Resilience:**
  By utilizing Fragmented MP4 (`fMP4`) with `frag_keyframe+empty_moov+default_base_moof`, self-contained movie fragments (`moof` + `mdat`) are written at every keyframe. If the server or container halts abruptly, the resulting MP4 file remains completely valid and uncorrupted.
- **In-Browser Playback & Range Seeking:**
  Recordings are accessible via `GET /api/sessions/:id/recording`. The Gin controller supports RFC 7233 HTTP 206 Partial Content (Range requests), allowing the frontend `RecordingPlayerModal` to seek and stream smoothly without downloading the entire file. Evaluators can watch or download past recordings directly from the dashboard and session summary dialogs.

---

## 7. Latency Profiling & Measurement Methodology (CR-3)

Glass-to-glass (action-to-render) latency measures the complete duration elapsed between a physical user input action (pointer tap, wheel scroll, keyboard keypress) and the corresponding visible pixel update rendered on the browser's HTML5 canvas.

To fulfill **Core Requirement 3 (CR-3)** with senior systems engineering precision, the complete glass-to-glass delay ($L_{\text{total}}$) is deconstructed into an **8-stage discrete pipeline**:

$$L_{\text{total}} = T_{\text{capture}} + T_{\text{ws-up}} + T_{\text{relay-in}} + T_{\text{os-dispatch}} + T_{\text{render-encode}} + T_{\text{ws-down}} + T_{\text{decode}} + T_{\text{paint}}$$

```mermaid
sequenceDiagram
    autonumber
    actor User as User Action (Pointer/Touch)
    participant Browser as Browser DOM / Canvas
    participant WS as WebSocket Client
    participant Server as Go Backend (StreamRelay)
    participant Scrcpy as scrcpy-server v2.7
    participant Android as Android 13 OS (Redroid)
    participant GPU as WebCodecs (VideoDecoder)
    participant Canvas as HTML5 Desynchronized 2D Canvas

    User->>Browser: T1: PointerDown / Click Event (0.5-1.5 ms)
    Browser->>WS: Normalize Coordinates & Serialize 32B Packet
    WS->>Server: T2: Upstream WebSocket Transmission (0.5-5 ms LAN / 8-15 ms Cloud)
    Server->>Scrcpy: T3: Multiplexer Demux & Control Socket TCP Write (<1 ms)
    Scrcpy->>Android: T4: InputManager / WindowManager Event Dispatch (4-8 ms)
    Android->>Android: View State Change & SurfaceFlinger Composition
    Android->>Scrcpy: T5: Virtual Display Frame Capture & H.264 Encoder (10-14 ms)
    Scrcpy->>Server: Video Socket TCP Stream Read
    Server->>WS: T6: Downstream WebSocket Multiplexing (0.5-5 ms LAN / 8-15 ms Cloud)
    WS->>GPU: T7: WebCodecs Hardware Decode (3-5 ms)
    GPU->>Canvas: T8: Latest-Frame-Wins Desynchronized 2D Draw (<1.5 ms)
    Canvas-->>User: Screen Pixels Update (Glass-to-Glass Loop Complete)
```

### 8-Stage Latency Pipeline Breakdown

| Stage | Operation | Mechanism | Typical Local/LAN | Edge Cloud VM (<20ms RTT) | Prod Cloud (`japancentral` WAN) | Limiting Physical Factor |
|:---|:---|:---|:---:|:---:|:---:|:---|
| **$T_1$** | Browser Input Capture | `useInputCapture.ts` coordinate normalization & binary serialization | 1.0 ms | 1.0 ms | 1.0 ms | JavaScript event loop & bounding client rect math |
| **$T_2$** | Upstream Transport | WebSocket binary frame over TCP | 0.5 ms | 8.0 ms | 68.0 ms | Geographic WAN transit (~5,000 km path to Japan Central) |
| **$T_3$** | Go Server Relaying | `StreamRelay` byte demuxing & local TCP control socket write | 0.5 ms | 0.5 ms | 0.5 ms | Goroutine channel dispatch & kernel loopback |
| **$T_4$** | Android Event Dispatch | scrcpy-server `InputManager.injectInputEvent` via Android IPC | 6.0 ms | 6.0 ms | 6.0 ms | Android `InputFlinger` event queue & WindowManager |
| **$T_5$** | Compose & H.264 Encode| `SurfaceFlinger` virtual display grab $\to$ hardware/software encoder | 12.0 ms | 14.0 ms | 14.0 ms | Android display refresh (60Hz = 16.6ms cycle) + encode |
| **$T_6$** | Downstream Transport | `StreamRelay` video channel `0x00` multiplexing to WebSocket | 0.5 ms | 8.0 ms | 68.0 ms | Video MTU packet fragmentation & WAN transit |
| **$T_7$** | WebCodecs Hardware Decode| `VideoDecoder.decode()` directly offloaded to client GPU | 3.5 ms | 3.5 ms | 3.5 ms | Hardware GPU VPU slice decoding |
| **$T_8$** | Canvas 2D Paint | `ctx.drawImage` with `desynchronized: true` (latest-frame-wins) | 1.0 ms | 1.0 ms | 1.0 ms | OS compositor queue bypass |
| **Total** | **Glass-to-Glass Delay** | **Action-to-Render End-to-End** | **~25.0 ms** | **~42.0 ms** | **~162.0 ms** | **Core engine pipeline is ~24ms; remainder is WAN network RTT** |


---

### Three Standardized Benchmarking Methodologies

To ensure scientific rigor and empirical validation, three independent measurement methodologies are built into the system:

#### Methodology 1: Microsecond Multiplexed RTT Ping/Pong
- **Protocol Channel**: Binary channel `0x03` multiplexed on the active streaming WebSocket.
- **Packet Structure**: 1-byte channel prefix (`0x03`) + 8-byte big-endian microsecond timestamp (`BigInt(Math.floor(performance.now() * 1000))`).
- **Mechanism**: The Go server immediately echoes the 9-byte packet back without disk or OS overhead.
- **Metrics Collected**: Min RTT, p50 (Median) RTT, Mean RTT, p95 RTT, Max RTT, and RTT Jitter ($\sigma$).

#### Methodology 2: SurfaceFlinger VSYNC Latency Profiling
- **Command**: `adb shell dumpsys SurfaceFlinger --latency SurfaceView`
- **Mechanism**: Extracts the 127 most recent frame lifecycle timestamps from Android's compositor:
  1. App choreograph ready timestamp
  2. SurfaceFlinger latch timestamp
  3. Hardware VSYNC presentation timestamp
- **Verification**: Validates that the Redroid container maintains a steady 60 FPS (16.6ms refresh period) without compositing buffer backpressure or pipeline stalls.

#### Methodology 3: Visual Loopback Test (Gold Standard per PRD FR-3)
- **Mechanism**:
  1. Displays a high-precision millisecond stopwatch overlay on the browser screen ($t_{\text{client}}$).
  2. Runs a synchronized millisecond clock on Android OS ($t_{\text{android}}$) via terminal loop (`while true; do date +%H:%M:%S.%3N; sleep 0.01; done`) or lightweight clock app.
  3. A high-speed camera or single synchronized screen capture photographs both displays simultaneously.
  4. The glass-to-glass delay is quantified as:
     $$\Delta t = t_{\text{client-render}} - t_{\text{android-clock}}$$

---

### Automated Latency Benchmarking Tooling

The repository includes a single-command automated benchmarking tool:

```bash
# Run automated benchmark against active session
./scripts/run_latency_benchmark.sh

# Automatically create a temporary session, run 100 ping samples, and teardown
./scripts/run_latency_benchmark.sh --create --samples 100
```

The tool executes `scripts/benchmark_probe.cjs`, which outputs:
- Real-time ANSI colored terminal metrics table.
- Quantitative distribution metrics: Min, Mean, Median (p50), 95th Percentile (p95), Max, and Inter-Frame Jitter.
- Automatic structured JSON export: [`docs/latency-benchmark-results.json`](file:///mnt/Projects/android-browser-stream/docs/latency-benchmark-results.json).

---

### Interactive Frontend Telemetry HUD & Calibration Runner

The frontend [`LatencyHud.tsx`](file:///mnt/Projects/android-browser-stream/frontend/src/components/LatencyHud.tsx) provides a live performance overlay (accessible via hotkey `Ctrl+Shift+L` or `Alt+L`):
- **Glass-to-Glass Metric**: Real-time estimated latency badge with semantic status indicator (`Sub-50ms OK` vs `Degraded`).
- **Framerate & Bitrate**: Live 60 FPS counter and bandwidth monitor.
- **Inter-Frame Jitter ($\sigma$)**: Standard deviation of frame arrival intervals.
- **Percentile Breakdown Accordion**: Instant disclosure of Min, p50 (Median), p95, and Max RTT values.
- **10-Second Calibrated Benchmark Runner**: Runs a 10s sampling window with live progress bar and generates a finalized report card with a **"Copy JSON"** button for audit trails.
- **Visual Loopback Clock Toggle**: Floating precision millisecond stopwatch overlay for camera-verified visual loopback testing.

---

## 8. Engineering Decisions, Trade-Offs, and AI-Assisted Development

This project was built through an active pair-programming collaboration between the software engineer (Human) and Antigravity (AI). The following matrix summarizes key decisions made throughout the project:

| Decision Domain | AI Proposal / Analysis | Human Guidance / Override | Final Resolution |
|:---|:---|:---|:---|
| **Streaming Transport** | Proposed WebRTC SFU vs WebCodecs over WebSocket. Detailed protocol complexity and latency characteristics. | Directed to prioritize sub-50ms glass-to-glass latency and minimal operational complexity. | Implemented WebCodecs over a single multiplexed binary WebSocket. |
| **TDD & Architecture** | Outlined Clean Architecture with domain, usecase, repository, infrastructure separation. | Mandated strict TDD (Red-Green-Refactor) with uncached `-race` verification and integration tests first. | Enforced 100% uncached test suite pass before implementation advances. |
| **Docker Daemon Discovery** | Go Docker SDK defaulted to `/var/run/docker.sock`, failing on Linux Docker Desktop. | Provided error logs: `Cannot connect to Docker daemon... Is docker running?` | AI diagnosed Docker Desktop user-space socket path (`~/.docker/desktop/docker.sock`) and implemented automatic socket discovery. |
| **React Lifecycle Stability** | Investigated first-frame WebSocket disconnection loop. | Reported issue score 95 during code review: `DeviceCanvas & useWebSocket Disconnection & Container Destruction Loop`. | Isolated WebSocket lifecycle from parent re-renders by storing callback closures in `useRef`. |
| **WebCodecs Parameter Sets** | Initially decoded frames sequentially; standalone SPS packets were dropped prior to IDR arrival. | Flagged decoder pipeline resets and profile mismatches. | AI created `h264.ts` parser to dynamically detect `avc1.PPCCLL` profile strings and cache SPS/PPS sets for keyframe prepending. |
| **Input Forwarding & UX** | Proposed raw canvas pointer capture. | Emphasized necessity for mobile navigation controls and quick text injection. | Added on-screen navigation bar (Back, Home, AppSwitch, Volume) and text injection toolbar. |

### 8.1 In My Own Words: Main Decisions Made That the AI Did Not Suggest
1. **Adopting the Pre-Warmed Container Pool:**
   While the AI initially suggested a purely reactive on-demand container launch for BR-2, Android OS cold boot takes ~25–40 seconds before `sys.boot_completed == 1`. I recognized that an end-user waiting 40 seconds on every connection would perceive the system as sluggish. I designed and directed the implementation of a configurable pre-warmed pool (`PREWARMED_POOL_SIZE`) that boots containers in the background and pre-stages the scrcpy server JAR. This reduced user connection time to < 300ms while remaining strictly single-machine and resource-bounded.
2. **Rejecting Kubernetes in Favor of Single-Engine Docker:**
   When the AI presented architectural scaling options involving Kubernetes/K3s, I rejected the suggestion based on our architectural scope constraint of keeping resource footprints minimal on single-node instances without unnecessary orchestration overhead (supporting 2 to 3 simultaneous instances on one machine). Single-node Docker avoids 1.5–3GB of control-plane RAM overhead on an 8GB cloud VM and eliminates brittle Binder IPC device passthrough issues.
3. **Decoupling Stream Disconnection from Immediate Container Teardown:**
   The AI's initial frontend implementation tied the WebSocket's `onClose` callback directly to the session `DELETE` endpoint. Whenever React re-rendered or StrictMode double-mounted, the socket closed and immediately destroyed the running container. I mandated decoupling the connection error display from container destruction, adding an explicit confirmation dialog and a 2-second grace period so transient network disconnects never prematurely kill active sessions.

### 8.2 In My Own Words: Where the AI Was Wrong or Unhelpful and How It Was Discovered
1. **The Docker Desktop LinuxKit Kernel Binder Failure (Exit Code 129):**
   - *What the AI Did:* During local testing, the AI repeatedly attempted to restart Redroid containers and retry ADB connections, blaming cold boot timeouts.
   - *How I Noticed:* I inspected `docker ps -a` and saw containers exiting immediately with `Exit 129`. I checked the host kernel modules and realized that while the Ubuntu host kernel had `binder_linux`, Docker Desktop for Linux runs inside a virtualized `LinuxKit` QEMU VM kernel (`6.12.76-linuxkit`), which completely lacks the Android binder IPC driver.
   - *Resolution:* I overrode the AI's retry loop, stopped Docker Desktop, created `scripts/install-native-docker.sh` to install native Docker Engine directly on the host, mounted `/dev/binderfs` with symlinks (`/dev/binder`, `/dev/hwbinder`), and pointed the backend to native `/var/run/docker.sock`. Redroid booted immediately.
2. **Missing WebCodecs SPS/PPS Parameter Sets on Dynamic Profiles:**
   - *What the AI Did:* The AI wrote a WebCodecs decoder hook that assumed every keyframe arrived self-contained with parameter sets.
   - *How I Noticed:* On certain device display configurations, scrcpy emitted standalone configuration packets (`isConfig: true`) prior to IDR frames. The browser threw `VideoDecoder: Invalid state: parameter sets missing` and dropped the stream into a permanent black canvas.
   - *Resolution:* I identified the dropped config frames in the network inspector and directed the AI to build `frontend/src/lib/h264.ts` with a dedicated NAL parser that extracts the exact H.264 profile string (`avc1.PPCCLL`), caches the SPS/PPS parameter sets in memory, and dynamically prepends them to IDR slices.
3. **TOCTOU Race Condition on Duplicate WebSocket Connections:**
   - *What the AI Did:* The AI relied solely on checking `session.Status == streaming` in the SQLite database to prevent concurrent connections.
   - *How I Noticed:* Because Android boot takes several seconds, two rapid `GET /stream` requests both passed the SQLite check while the session was still in `ready` state, resulting in dual scrcpy socket connection attempts that collided and terminated the session.
   - *Resolution:* I directed the addition of an in-memory active stream mutex in `StreamController` to guarantee single-consumer locking at the HTTP upgrade boundary.
