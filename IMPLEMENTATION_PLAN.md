# Implementation Plan: DroidCanvas — Ephemeral Cloud-Native Android Streaming Engine

## 1. Goal Description
The objective of this project is to build a production-grade, low-latency web platform that streams an interactive Android OS instance directly into a desktop web browser without requiring browser plugins or custom client software. The platform provides continuous real-time video streaming (sub-50ms glass-to-glass latency), normalized input forwarding (mouse, touch gestures, scroll wheel, and physical keyboard typing), and an explicit D-pad navigation toggle with an on-screen TV remote to support Android TV applications without breaking focus outlines.

In addition to core streaming requirements, the platform implements all advanced enterprise features: per-user container isolation, dynamic on-demand lifecycle management with idle reaper, two-way clipboard synchronization, three-tier kiosk mode enforcement, and automated crash-resilient session recording (fMP4) with in-browser playback. The entire architecture adheres strictly to Go Clean Architecture principles on the backend and modern React/TypeScript/WebCodecs practices on the frontend.

---

## 2. System Architecture Overview

```mermaid
graph TD
    subgraph Client ["Browser Client (React 18 + TypeScript + Vite)"]
        UI["Tailwind + Framer Dark UI"]
        CANVAS["HTML5 Canvas (2D Context / WebGL)"]
        WC["WebCodecs VideoDecoder API"]
        INPUT["Input Controller (Touch, PointerLock, D-pad)"]
        DEMUX["Resilient Binary Demuxer (useWebSocket)"]
        HUD["Real-Time Latency & Health HUD"]
    end

    subgraph Edge ["Edge / Ingress Proxy"]
        CAD["Caddy v2 (Let's Encrypt TLS / WSS Termination)"]
    end

    subgraph Host ["Host Server (Ubuntu 22.04 LTS VM)"]
        subgraph Backend ["Go 1.22+ Backend (Clean Architecture)"]
            API["REST Controllers & Gorilla WebSocket Handler"]
            UC["Use Cases (Session, StreamRelay, KioskWatchdog)"]
            REC["FFmpeg Async Session Recorder (fMP4)"]
            INFRA["Infrastructure (Docker SDK, ADB Client, PortPool)"]
            SQL[("SQLite Persistence (sessions.db)")]
        end

        subgraph ContainerSystem ["Docker & Android Kernel Layer"]
            DOCKER["Docker Engine (Privileged / Docker Socket)"]
            BINDER["Host Kernel Binder IPC (/dev/binderfs)"]
            REDROID["Redroid Container (Android 13 Headless)"]
            ADB["ADB Host Daemon (Port 5037)"]
            SCR["scrcpy-server v2.7 (app_process UID 2000)"]
        end
    end

    REDROID -->|"Mesa/Swiftshader OpenGL ES"| SCR
    SCR -->|"Video Socket (Annex B NAL)"| ADB
    SCR <-->|"Control Socket (Binary Protocol)"| ADB
    ADB <-->|"TCP Forward"| INFRA
    INFRA <--> UC
    UC -->|"Non-blocking Raw NAL Tee"| REC
    UC <--> API
    API <-->|"WSS Multiplex:
0x00=Video, 0x01=Audio, 0x02=Control
0x03=Ping, 0x04=Metadata"| CAD
    API --- SQL
    CAD <-->|"HTTPS / WSS (Port 443)"| REACT
    DEMUX -->|"0x00 Video"| WC --> CANVAS
    DEMUX <-->|"0x02 Control & Clipboard"| INPUT
    DEMUX <-->|"0x03 Telemetry"| HUD
```

---

## 3. Comprehensive Industry Research & Approach Evaluation

Based on comprehensive research across industry implementations (scrcpy, WebRTC, WebCodecs, Redroid, OpenSTF, Tango-Mirror, Appetize.io, and Android Enterprise Lock Task Mode), the following trade-off analyses justify the selected architectural decisions:

### 3.1. Android Virtualization & Container Engines

| Approach | Technology | Pros | Cons | Decision & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **QEMU / Android Emulator / Cuttlefish** | Full system emulation / KVM | Official Google images, Google Play Services | 2.5–4GB RAM baseline per instance; slow cold boot (45–90s); nested KVM virtualization unreliable across low-cost cloud VMs. | **Rejected:** Exceeds single-machine RAM limits for 3 concurrent sessions on an 8GB VM. |
| **Waydroid / Anbox** | LXC / Wayland | Container efficiency | Requires host Wayland compositor, desktop display server, and complex container lifecycle; Anbox is unmaintained. | **Rejected:** Excessive host GUI dependencies and brittle multi-user container isolation. |
| **Redroid (Remote Android in Docker)** | Native OCI Container + Binder IPC | Shares host Linux kernel; lightweight (~800MB RAM); headless; supports Mesa llvmpipe/swiftshader software rendering or GPU passthrough; sub-5ms boot with pre-warmed pool. | Requires `binder_linux` kernel module on host. | **SELECTED BEST APPROACH:** Optimal performance, native Docker orchestration, low resource footprint. |

### 3.2. Screen Capture & Video Streaming Pipeline

| Approach | Protocol | Glass-to-Glass Latency | Server CPU Load | NAT / Firewall Traversal | Decision & Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **VNC / noVNC (RFB)** | TCP frame buffer deltas | 250–500ms | Medium | Simple TCP | **Rejected:** Unacceptable frame rate (<15 FPS) and high latency for interactive mobile gestures. |
| **WebRTC (Pion / GStreamer)** | UDP / SRTP / RTP | 35–60ms | High (RTP packetization, jitter buffer, potential transcode) | Complex (ICE, STUN/TURN, signaling channel) | **Secondary Candidate:** Excellent for packet loss recovery, but introduces 20–45ms jitter buffer latency, complex SDP signaling, and high server CPU in a 72h scope. |
| **scrcpy-server + WebSocket + WebCodecs** | TCP / WSS pass-through NALs | **20–35ms** | **Near-zero (< 1%)** | **Seamless (Standard HTTPS/WSS 443 via Caddy)** | **SELECTED BEST APPROACH:** Direct H.264/H.265/AV1 Annex B NAL stream generated in Android's `MediaCodec`, zero server transcoding, zero-jitter-buffer WebCodecs hardware decoding. |

### 3.3. Input Injection & Control

| Approach | Mechanism | Injection Latency | Scalability | Decision & Rationale |
| :--- | :--- | :---: | :--- | :--- |
| **ADB Shell Commands (`adb shell input ...`)** | Spawns `/system/bin/sh` + `app_process` per event | 150–300ms | Extremely poor (CPU spikes, drops drag events) | **Rejected:** Spawning a new Java process for every single touch or key event makes scrolling and typing unusable. |
| **OpenSTF minitouch** | Unix socket to `/dev/input/event*` | 5–15ms | Brittle across Android versions, requires custom driver permissions | **Rejected:** Deprecated and incompatible with modern Android 13 kernel input drivers. |
| **scrcpy-server Binary Protocol** | Direct IPC to `InputManager` via reflected Java calls | **< 1ms** | Ultra-efficient binary packets (32B touch, 21B scroll, 14B key, UTF-8 text) | **SELECTED BEST APPROACH:** Injected via persistent TCP control socket running as UID 2000 (`app_process`) with direct IPC speed. |

### 3.4. Two-Way Clipboard Synchronization (BR-3)

| Approach | Architecture | Reliability | Security / Privacy | Decision & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **`STFService.apk` / Broadcast Intents** | Background Android service + broadcast receivers | Broken on Android 10+ | Requires third-party APK installation | **Rejected:** Android 10+ restricts background clipboard access; fails on modern OS. |
| **ADB Polling (`cmd clipboard get/set`)** | Periodic shell polling loop | High latency (polling interval) | Inefficient, CPU overhead | **Rejected:** High overhead, cannot support real-time sync. |
| **Native scrcpy Bidirectional Control** | `SET_CLIPBOARD` (0x09) & `DEVICE_MSG_TYPE_CLIPBOARD` (0x00) | **Real-time (< 2ms)** | Built into scrcpy `app_process` (UID 2000), bypasses background restrictions | **SELECTED BEST APPROACH:** Hooks directly into Android's `IClipboard` listener. Instant bidirectional sync with zero external APKs. |

### 3.5. Restricted Access / Kiosk Mode Enforcement (BR-4)

| Approach | Mechanism | Tamper Resistance | Complexity | Decision & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Client-Side JS / CSS Disabling** | Disabled DOM buttons | Zero (easily bypassed via DevTools) | Trivial | **Rejected:** Violates security requirement: *"Enforcement must not rely only on the browser."* |
| **AOSP Lock Task Mode alone** | Device Policy Controller (DPC) pinning | High | High (requires DPC provisioning) | **Complementary:** Excellent OS lockdown, but benefits from server-side perimeter guards. |
| **3-Tier Defense-in-Depth Model** | Go Control Filter + AOSP Policy + Go Watchdog | **Tamper-proof** | Modular & robust | **SELECTED BEST APPROACH:**<br>1. *Server Input Filter:* Drops `HOME`, `RECENTS`, `POWER`, `SETTINGS`, and clamps touches outside app viewport.<br>2. *AOSP Lockdown:* Full immersive mode + disabled launcher.<br>3. *Go Activity Watchdog:* Background supervisor polling active package and force-stopping unauthorized apps. |

> **App Choice & Justification (BR-4):**
> - **Selected Application:** **AOSP Calculator (`com.android.calculator2`)** (or Clock).
> - **Justification:** Pre-installed, 100% offline, deterministic, and self-contained. Exercises all input modes: touch buttons, gesture history scrolling, and physical keyboard typing (numbers, operators, enter, backspace) without requiring external network dependencies or personal accounts.
> - **Blocked Actions List & Justification:**
>   1. `KEYCODE_HOME` (3) & `KEYCODE_APP_SWITCH` (187, Recents): Blocked to prevent escaping the target application.
>   2. `KEYCODE_POWER` (26) & `KEYCODE_SLEEP` (223): Blocked to prevent turning off the virtual screen or locking the OS.
>   3. `KEYCODE_SETTINGS` (176) & `KEYCODE_SEARCH` (84): Blocked to prevent reaching system configuration or launching auxiliary intents.
>   4. *Notification Shade Swipes (Top 24px) & Nav Bar Swipes (Bottom 36px):* Blocked at the server filter to prevent expanding quick settings or triggering system gesture navigation.

### 3.6. Automated Session Recording (BR-5)

| Approach | Technology | CPU Overhead | Crash Resilience | Browser Compatibility | Decision & Rationale |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Android `screenrecord` CLI** | Android userspace encoder | High (device CPU) | Poor (3-min limit) | MP4 | **Rejected:** Competes with scrcpy MediaCodec encoder, 3-minute hard limit. |
| **Backend FFmpeg Transcode** | Software re-encoding (`libx264`) | Extremely High (100% CPU core) | Medium | MP4 | **Rejected:** Transcoding destroys multi-session server capacity. |
| **FFmpeg Pipe Stream Copy (fMP4)** | `-c:v copy -movflags frag_keyframe+empty_moov+default_base_moof` | **Near-zero (< 1%)** | **100% Crash-Resilient** | **Native `<video>` Playback** | **SELECTED BEST APPROACH:** Enqueues raw Annex B NALs through non-blocking Go channel to FFmpeg stdin pipe. Produces fragmented MP4 with self-contained `moof` fragments that never corrupt on crash. |

### 3.7. Latency Benchmarking Methodology (FR-3)

| Benchmark Approach | Mechanism | Accuracy | Complexity | Decision & Rationale |
| :--- | :--- | :---: | :---: | :--- |
| **Round-Trip Ping/Pong Probe** | WebSocket timestamp echo | Network RTT only (~5–15ms) | Low | **Incomplete:** Measures network wire time only, ignoring capture, encode, transmission, decode, and render delays. |
| **Frame Timestamp Delta** | Injecting client timestamp into video metadata | ~15–25ms | High | **Partial:** Measures pipeline delay, but misses display photon latency. |
| **Visual Loopback Benchmark** | Sub-millisecond stopwatch running inside Android (`DeskClock`), rendered to browser canvas, captured by camera / screencast | **Absolute glass-to-glass (True RTT)** | Industry standard | **SELECTED BEST APPROACH:** Camera/screenshot differential between device display and web canvas gives objective, irrefutable glass-to-glass latency proof. |

---

## 4. Requirements Coverage Matrix

| Requirement | Priority | PRD Section | Phase | Selected Best Approach & Architecture |
|:---|:---:|:---:|:---:|:---|
| **CR-1: Continuous Real-Time Streaming** | **Must** | §3 FR-1 | 3 | scrcpy v2.7 Annex B NALs → WS binary relay → WebCodecs VideoDecoder. Codec-agnostic design with runtime negotiation (H.264 Baseline floor, H.265, AV1). |
| **CR-2: Normalized Input Forwarding** | **Must** | §3 FR-2 | 4 | `getBoundingClientRect()` normalized coordinates (0.0–1.0) → i16-fixed-point scroll → scrcpy binary control messages (`INJECT_TOUCH_EVENT`, `INJECT_SCROLL_EVENT`). |
| **CR-2 Senior: D-pad vs. Touch Mode Toggle** | **Must (Senior)** | §3 FR-2 | 4, 5 | Segmented UI toggle + Virtual TV Remote. In D-pad mode, raw touch is suppressed to prevent Android Touch Mode flapping (`isInTouchMode=false`); navigation emits `KEYCODE_DPAD_*` (19–23). |
| **CR-3: Latency Measurement** | **Must** | §3 FR-3 | 6 | Standardized Visual Loopback test (sub-millisecond clock rendered in Android vs. canvas capture) + real-time glass-to-glass Latency HUD overlay. |
| **CR-4: Reproducible Execution** | **Must** | §3 FR-4 | 1, 7 | Single-machine automated orchestration via `docker-compose.yml`, `setup-vm.sh`, kernel binder loading, and documented verification scripts. |
| **CR-5: Public Deployed HTTPS Link** | **Must** | §3 FR-5 | 7 | Public Cloud VM deployment fronted by Caddy for auto-TLS (Let's Encrypt), satisfying WebCodecs Secure Context requirements. |
| **BR-1: Isolated Instance per User** | **Bonus** | §4 BR-1 | 2 | Per-session ephemeral redroid container via Go Docker SDK, isolated bridge network, dedicated ADB port, zero cross-session state leakage. |
| **BR-2: On-Demand Lifecycle Management** | **Bonus** | §4 BR-2 | 2 | Ephemeral container boot on handshake/POST, heartbeat tracking, auto-termination on idle timeout (15 min) or disconnect with immediate resource reclamation. |
| **BR-3: Two-Way Clipboard Synchronization** | **Bonus** | §4 BR-3 | 4 | Native scrcpy bidirectional control protocol (`SET_CLIPBOARD` 0x09 + `DEVICE_MSG_TYPE_CLIPBOARD` 0x00) with browser Clipboard API, echo loop suppression, and XSS sanitization. |
| **BR-4: Kiosk Mode Enforcement** | **Bonus** | §4 BR-4 | 2, 4 | 3-Tier Defense-in-Depth: (1) Server-side Go control keycode filter (`HOME`, `RECENTS`, `POWER` dropped), (2) Android Lock Task Mode / immersive policy, (3) Go activity watchdog daemon. |
| **BR-5: Automated Session Recording** | **Bonus** | §4 BR-5 | 3 | Go non-blocking stream tee → FFmpeg stdin pipe remuxing raw Annex B NALs to Fragmented MP4 (`-c:v copy -movflags frag_keyframe+empty_moov+default_base_moof`) tied to Session ID. In-browser `<video>` playback modal and download. |
| **Senior Edge Case: Pointer Lock API** | **Quality** | §7 | 4 | `requestPointerLock()` for relative mouse delta control with virtual cursor state machine; suppresses `KEYCODE_BACK` on `Escape` key when locked. |
| **Senior Edge Case: Special Characters** | **Quality** | §7 | 4 | Binary `INJECT_TEXT` (0x01) UTF-8 injection for `'`, `&`, emojis, and unicode symbols; completely bypasses shell command injection risks. Empty search guarded. |
| **Senior Edge Case: Resilient Demuxing** | **Quality** | §7 | 3, 4 | Length-bounded framing (16MB cap), corrupted packet drop, IDR keyframe resynchronization, and automatic `VideoDecoder` crash recreation circuit breaker. |
| **AI Compliance: Pivot Decisions & Audit** | **Compliance** | §5 | Ongoing | Append-only `PROCESS_LOG.md` recording verbatim prompts, timestamps, suboptimal AI suggestions, architectural pivot rationale, and human vs. AI contribution matrix. |

---

## 5. In-Depth Architectural & Protocol Specifications

### 5.1. scrcpy-server Connection Flow & Multiplexing

The system utilizes a single full-duplex WebSocket connection between browser and Go backend. Packets are framed with a **1-byte channel prefix**:
- `0x00`: Video Frame (scrcpy 12-byte header + raw NAL payload)
- `0x01`: Audio Frame (Reserved for future extension)
- `0x02`: Control / Device Message (Bidirectional touch, keys, clipboard)
- `0x03`: Ping / Pong / Latency probe (Client timestamp + server timestamp)
- `0x04`: Stream Metadata & Codec Negotiation Handshake (Wire Codec ID, width, height)

```mermaid
sequenceDiagram
    participant Browser as Browser Client
    participant Caddy as Caddy (TLS)
    participant Go as Go Backend Relay
    participant ADB as ADB Host Daemon
    participant Scrcpy as scrcpy-server (Guest)

    Browser->>Caddy: WSS /api/sessions/:id/stream?codecs=av1,h265,h264
    Caddy->>Go: Forward WebSocket Upgrade
    Go->>ADB: adb forward tcp:PORT localabstract:scrcpy
    Go->>Scrcpy: Connect Video Socket (TCP #1)
    Go->>Scrcpy: Connect Control Socket (TCP #2)
    Go-->>Browser: Channel 0x04 Metadata [CodecID, Width, Height]
    
    loop Stream Loop (60 FPS)
        Scrcpy->>Go: 12B Header + Annex B NAL Frame
        par Non-blocking Tee
            Go->>Browser: Channel 0x00 + 12B Header + NAL
        and Async Recorder
            Go->>Go: FFmpeg Stdin Pipe (fMP4 copy)
        end
    end

    loop Interaction Loop
        Browser->>Go: Channel 0x02 Control Message (Touch / Key / Clip)
        Go->>Go: Kiosk Filter & Coordinate Clamping
        Go->>Scrcpy: Binary Packet over Control Socket
    end

    loop Telemetry Loop (1000ms)
        Browser->>Go: Channel 0x03 Ping [client_ts: 8B]
        Go-->>Browser: Channel 0x03 Pong [client_ts: 8B, server_ts: 8B]
    end
```

---

### 5.2. Binary Multiplexing Protocol & Channel Architecture

To achieve sub-millisecond dispatch without JSON parsing overhead, all WebSocket messages use binary framing:

```
┌──────────────┬────────────────────────────────────────────────────────┐
│ Channel (1B) │ Payload (Variable Length)                              │
└──────────────┴────────────────────────────────────────────────────────┘
```

- **`0x00` Video Frame:**
  - Prefix: `0x00`
  - Body: `[12-byte scrcpy header] + [raw Annex B NAL or AV1 OBU bitstream data]`
- **`0x01` Audio Frame:**
  - Prefix: `0x01`
  - Body: Reserved for raw Opus / AAC packets.
- **`0x02` Control Message:**
  - Prefix: `0x02`
  - Body: Upstream scrcpy control packets (touch, scroll, keycode, clipboard set) or downstream device messages (`0x00` clipboard sync).
- **`0x03` Latency Telemetry:**
  - Upstream (Ping): `[0x03: 1B] + [client_ts: 8B uint64 BE]`
  - Downstream (Pong): `[0x03: 1B] + [client_ts: 8B uint64 BE] + [server_ts: 8B uint64 BE]`
- **`0x04` Stream Metadata:**
  - Downstream: `[0x04: 1B] + [codec_id: 1B] + [width: 2B uint16 BE] + [height: 2B uint16 BE]`

---

### 5.3. scrcpy 12-Byte Video Packet Header & Codec Negotiation Handshake

Each video frame received from scrcpy-server is framed by a 12-byte binary header:

```
┌────────────────────────────────────────────────────────────┐
│                  pts_and_flags (8 bytes BE)                │
│  Bit 63: PACKET_FLAG_CONFIG (SPS/PPS, VPS, Sequence Header)│
│  Bit 62: PACKET_FLAG_KEY_FRAME (IDR slice / Key OBU)       │
│  Bits 0-61: PTS in microseconds                            │
├────────────────────────────────────────────────────────────┤
│                  packet_size (4 bytes BE)                  │
├────────────────────────────────────────────────────────────┤
│                  Raw Codec Bitstream Data                  │
│       H.264/H.265: Annex B NALs (00 00 00 01 start code)   │
│       AV1: Low-overhead OBU sequence                       │
└────────────────────────────────────────────────────────────┘
```

#### Negotiation Sequence:
1. **Client Probe**: During initialization, frontend calls `VideoDecoder.isConfigSupported()` for:
   - `av01.0.05M.08` (AV1 Main Level 3.1)
   - `hev1.1.6.L93.B0` (HEVC/H.265 Main Level 3.1)
   - `avc1.42e01f` (H.264 Constrained Baseline Level 3.1)
2. **Handshake Query**: Client appends supported list to WebSocket URL: `?codecs=av1,h265,h264`.
3. **Backend Selection**: `domain.NegotiateCodec(requested, allowed)` matches against container capabilities.
4. **scrcpy Launch**: Injects `video_codec=<chosen_codec>` into the server launch arguments.
5. **Metadata Channel (`0x04`)**:
   ```
   [0x04 : 1B Channel]
   [0x01 | 0x02 | 0x03 : 1B Wire Codec ID (1=H264, 2=H265, 3=AV1)]
   [width : 2B uint16 BE]
   [height : 2B uint16 BE]
   ```
6. **Frontend Codec Factory**: Dynamically assigns the corresponding `CodecHandler` strategy, ensuring zero changes to the underlying WebCodecs frame loop.

---

### 5.4. Binary Control Packets Format

All client-to-server interactions over Channel `0x02` match the native `scrcpy-server` binary control message specification:

#### 1. INJECT_TOUCH_EVENT (32 bytes)
Used for primary touch gestures (pointerdown, pointermove, pointerup):
```
[Type: 1B = 0x02]
[Action: 1B (0 = DOWN, 1 = UP, 2 = MOVE)]
[PointerId: 8B uint64 BE]
[Position X: 4B uint32 BE]
[Position Y: 4B uint32 BE]
[Width: 2B uint16 BE]
[Height: 2B uint16 BE]
[Pressure: 2B uint16 BE (float16 normalized 0..1)]
[ActionButton: 4B uint32 BE]
[Buttons: 4B uint32 BE]
```

#### 2. INJECT_SCROLL_EVENT (21 bytes)
Used for mouse wheel vertical and horizontal scrolling:
```
[Type: 1B = 0x03]
[Position X: 4B uint32 BE]
[Position Y: 4B uint32 BE]
[Width: 2B uint16 BE]
[Height: 2B uint16 BE]
[HScroll: 4B int32 BE (float fixed-point)]
[VScroll: 4B int32 BE (float fixed-point)]
[Buttons: 4B uint32 BE]
```

#### 3. INJECT_KEYCODE (14 bytes)
Used for physical keyboard inputs, D-pad navigation, and hardware buttons:
```
[Type: 1B = 0x00]
[Action: 1B (0 = DOWN, 1 = UP)]
[KeyCode: 4B uint32 BE (Android KEYCODE_*)]
[Repeat: 4B uint32 BE]
[MetaState: 4B uint32 BE]
```

#### 4. INJECT_TEXT (Variable Length)
Used for typing arbitrary UTF-8 characters and clipboard paste fallback:
```
[Type: 1B = 0x01]
[Length: 4B uint32 BE]
[UTF-8 Data: N bytes]
```

---

### 5.5. D-pad vs. Touch Interaction Model (FR-2 Senior Requirement)

#### The Touch Mode Problem:
Android's `ViewRootImpl` manages an internal flag `isInTouchMode`. When touch events arrive, Android enters Touch Mode and **strips all focus outlines** from views. In Android TV / Leanback applications (`BrowseSupportFragment`, `VerticalGridView`), clicking with mouse touch coordinates breaks focus and halts navigation.

#### The Solution:
Provide an explicit **D-pad / Touch Mode Toggle** in the web UI.

```mermaid
stateDiagram-v2
    [*] --> TouchMode: Default (Mobile Apps)
    
    state TouchMode {
        direction LR
        CanvasPointer --> INJECT_TOUCH_EVENT: x, y (32B)
        WheelScroll --> INJECT_SCROLL_EVENT: i16 fixed-point (21B)
        Keys --> INJECT_KEYCODE: Standard
    }
    
    TouchMode --> DpadMode: User Toggles (Alt+M / UI Button)
    
    state DpadMode {
        direction LR
        CanvasClick --> KEYCODE_DPAD_CENTER: Key 23 (14B)
        CanvasSwipe --> KEYCODE_DPAD_DIR: Keys 19-22
        WheelStep --> KEYCODE_DPAD_DIR: Up/Down
        VirtualRemote --> KEYCODE_DPAD_DIR: UI Buttons
        SuppressTouch: Suppress raw INJECT_TOUCH
    }
    
    DpadMode --> TouchMode: User Toggles
```

- **Android D-pad Keycodes**:
  - `KEYCODE_DPAD_UP` = 19 (`0x13`)
  - `KEYCODE_DPAD_DOWN` = 20 (`0x14`)
  - `KEYCODE_DPAD_LEFT` = 21 (`0x15`)
  - `KEYCODE_DPAD_RIGHT` = 22 (`0x16`)
  - `KEYCODE_DPAD_CENTER` = 23 (`0x17`)
- **Backend Defense-in-Depth**: In D-pad mode, Go `StreamRelay` discards any stray `INJECT_TOUCH_EVENT` packets, ensuring the Android container never flaps into Touch Mode.

---

### 5.6. Two-Way Clipboard Synchronization (BR-3)

Uses scrcpy-server's native binary protocol over the control socket (UID 2000 `app_process`), bypassing Android 10+ background clipboard restrictions:

1. **Host-to-Device (Browser → Android)**:
   - User triggers native browser paste (`Ctrl+V` / `Cmd+V`) or clicks toolbar Paste.
   - Client sends Channel `0x02` + `MsgTypeSetClipboard` (`0x09`):
     ```
     [0x02 Channel: 1B]
     [0x09 Type: 1B]
     [sequence: 8B uint64 BE]
     [paste: 1B (0x01 = immediate paste)]
     [length: 4B uint32 BE]
     [utf-8 text: N bytes]
     ```
2. **Device-to-Host (Android → Browser)**:
   - When text is copied inside Android, `scrcpy-server` detects clipboard change and emits `DEVICE_MSG_TYPE_CLIPBOARD` (`0x00`) over the control TCP socket:
     ```
     [0x00 Type: 1B]
     [length: 4B uint32 BE]
     [utf-8 text: N bytes]
     ```
   - Go backend wraps with `0x02` channel and relays to WebSocket.
   - Browser client checks `lastLocalClipboardSent` cache (preventing infinite echo loop), then calls `navigator.clipboard.writeText(text)` or shows a 1-click "Copy Remote Text" toast if document lacks transient activation.

---

### 5.7. Kiosk Mode Enforcement (BR-4)

A **3-Tier Defense-in-Depth** model guarantees user isolation to a single app:

1. **Tier 1: Server-Side Input Gate (Go Relay)**:
   - Intercepts Channel `0x02` packets in `usecase/stream_usecase.go`.
   - Discards blocked keycodes: `KEYCODE_HOME` (3), `KEYCODE_APP_SWITCH` (187, Recents), `KEYCODE_POWER` (26), `KEYCODE_SETTINGS` (176), `KEYCODE_SEARCH` (84).
   - Clamps touch coordinates: suppresses swipes in the top 24px (Notification shade) and bottom 36px (Gesture navigation bar).
2. **Tier 2: Android Enterprise Lockdown (AOSP)**:
   - Sets immersive mode: `settings put global policy_control immersive.full=*`.
   - Disables stock launcher: `pm disable-user --user 0 com.android.launcher3`.
   - Configures Lock Task Mode (`ActivityOptions.setLockTaskEnabled(true)`) via headless DPC helper.
3. **Tier 3: Server-Side Activity Guardian (Go Watchdog)**:
   - Background goroutine polls `dumpsys activity activities` every 750ms.
   - If `mResumedActivity` deviates from the target package, executes `am force-stop <unauthorized_pkg>` and relaunches target app.

---

### 5.8. Automated Session Recording (BR-5)

Implements server-side zero-transcode containerization via an asynchronous Go worker:

- **Non-blocking Stream Tee**: In `usecase/stream_usecase.go`, each `pkt.Data` (Annex B NAL) is enqueued to a buffered channel (`chan []byte`, cap 120 frames). If buffer fills, frames are dropped to protect live stream latency.
- **FFmpeg Subprocess Pipe**:
  ```bash
  ffmpeg -y -f h264 -r 60 -i pipe:0 -c:v copy     -movflags frag_keyframe+empty_moov+default_base_moof     /data/recordings/{session_id}.mp4
  ```
- **Crash Resilience**: Fragmented MP4 (`fMP4`) writes self-contained movie fragments (`moof` + `mdat`) at every keyframe. If the container or backend is terminated abruptly, the file is never corrupted and remains 100% playable.
- **API & In-Browser Playback**: `GET /api/v1/sessions/:id/recording` with HTTP Range header support, wired to the `RecordingPlayerModal.tsx` in-browser `<video>` player and direct MP4 download button.

---

### 5.9. Pointer Lock, Special Characters & Error-Resilient Demuxing

- **Pointer Lock API**:
  - `canvas.requestPointerLock({ unadjustedMovement: true })` captures raw `movementX/Y` without OS acceleration.
  - Maintains a virtual cursor `(vx, vy)` clamped to device dimensions.
  - Intercepts `Escape`: releases pointer lock while **suppressing `KEYCODE_BACK`** to prevent unwanted Android app exit.
- **Special Characters (`'`, `&`, Unicode)**:
  - Uses scrcpy `INJECT_TEXT` (`0x01`): sends UTF-8 byte stream directly to the Java server process.
  - Completely avoids shell execution (`/bin/sh`), preventing command injection or syntax breakage.
  - Empty search inputs are guarded client-side (`trim().length > 0`).
- **Error-Resilient Demultiplexing**:
  - Validates minimum header length (`>= 13B`) and bounds-checks packet size (`<= 16MB`).
  - Corrupted packets are dropped without throwing uncaught exceptions.
  - Decoder crashes trigger automatic recreation of `VideoDecoder` and wait for the next IDR keyframe (`isKeyFrame === true`).

---

## 6. Proposed Changes: File Structure

The project follows strict Clean Architecture layer separation on the backend and modular React hooks/components on the frontend:

```
android-browser-stream/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                    # Entrypoint, DI wiring, graceful shutdown
│   ├── internal/
│   │   ├── domain/                        # Pure domain entities, contracts, error types
│   │   │   ├── session.go                 # Session entity & lifecycle states
│   │   │   ├── stream.go                  # Stream entity, protocol channels (0x00..0x04)
│   │   │   ├── input.go                   # Touch, Keycode, Scroll, Clipboard types
│   │   │   ├── codec.go                   # Codec type, negotiation logic
│   │   │   ├── errors.go                  # Domain sentinel errors
│   │   │   └── port_pool.go               # Port allocator interface
│   │   ├── usecase/                       # Business workflows
│   │   │   ├── session_usecase.go         # Create, list, destroy, heartbeat, idle reaper
│   │   │   ├── stream_usecase.go          # WebSocket relay, scrcpy bridge, kiosk filter
│   │   │   ├── kiosk_watchdog.go          # Activity guardian goroutine
│   │   │   └── recorder_usecase.go        # Stream tee recorder integration
│   │   ├── repository/                    # Persistence adapters
│   │   │   └── session_repository.go      # SQLite implementation with GORM / pure SQL
│   │   ├── infrastructure/                # External systems & drivers
│   │   │   ├── docker/
│   │   │   │   └── client.go              # Docker Engine SDK (container create, start, kill)
│   │   │   ├── adb/
│   │   │   │   └── client.go              # Pure Go ADB client (connect, forward, reverse, shell)
│   │   │   ├── scrcpy/
│   │   │   │   ├── server.go              # JAR push, app_process execution, socket handshake
│   │   │   │   ├── video.go               # 12-byte header demux, Annex B NAL reader
│   │   │   │   └── control.go             # Binary control serializer (touch, key, scroll, clip)
│   │   │   ├── recorder/
│   │   │   │   └── ffmpeg_recorder.go     # Async non-blocking FFmpeg pipe (fMP4 stream copy)
│   │   │   └── portpool/
│   │   │       └── pool.go                # Thread-safe in-memory port pool (5555..5557)
│   │   └── api/                           # Delivery layer
│   │       ├── http/
│   │       │   ├── router.go              # Chi / Gin / standard net/http mux
│   │       │   ├── session_handler.go     # POST /sessions, GET /sessions, DELETE /sessions/:id
│   │       │   ├── recording_handler.go   # GET /sessions/:id/recording (Range support)
│   │       │   └── middleware.go          # CORS, recovery, request logging, rate limiting
│   │       └── ws/
│   │           ├── handler.go             # Upgrade GET /sessions/:id/stream to WebSocket
│   │           └── client.go              # Pump goroutines (read, write, heartbeat)
│   ├── pkg/                               # Shared cross-cutting packages
│   │   ├── logger/
│   │   │   └── logger.go                  # Structured logging (zap / zerolog)
│   │   ├── database.go                    # SQLite schema migration
│   │   └── env.go                         # Viper environment config
│   ├── bin/scrcpy-server                  # scrcpy-server v2.7 JAR
│   ├── Dockerfile                         # Backend container (Alpine + Go + ffmpeg + adb)
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── src/
│   │   ├── main.tsx                       # React DOM entry
│   │   ├── App.tsx                        # Router & global state
│   │   ├── components/
│   │   │   ├── DeviceCanvas.tsx           # Canvas viewer + input overlay + virtual controls
│   │   │   ├── VirtualDpad.tsx            # TV Remote overlay (Up, Down, Left, Right, OK, Back, Home)
│   │   │   ├── SessionManager.tsx         # Session dashboard & launcher
│   │   │   ├── RecordingPlayerModal.tsx   # In-browser session recording player modal & download
│   │   │   ├── SessionSummaryDialog.tsx   # Session termination summary with recording preview
│   │   │   ├── LatencyHud.tsx             # Visual Loopback & glass-to-glass stats
│   │   │   ├── ConnectionStatus.tsx       # WS state, codec badge, bitrate indicator
│   │   │   └── Layout.tsx                # Framer-style navigation and dark canvas shell
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts           # Resilient binary demux (Channels 0x00..0x04)
│   │   │   ├── useVideoDecoder.ts        # WebCodecs lifecycle, latest-frame-wins, backpressure
│   │   │   ├── useInputCapture.ts        # Mouse, touch, D-pad, pointer lock, special keys
│   │   │   ├── useClipboardSync.ts       # Bidirectional clipboard synchronization
│   │   │   ├── useLatencyStats.ts        # Rolling latency telemetry and RTT calculation
│   │   │   └── useSession.ts             # Session REST API client
│   │   ├── lib/
│   │   │   ├── codec/
│   │   │   │   ├── types.ts              # CodecHandler interface
│   │   │   │   ├── registry.ts           # CodecFactory & browser probing (AV1, H265, H264)
│   │   │   │   ├── h264.ts               # H.264 Annex B / SPS parser
│   │   │   │   ├── h265.ts               # H.265 VPS/SPS parser
│   │   │   │   └── av1.ts                # AV1 OBU Sequence Header parser
│   │   │   ├── protocol.ts               # Binary packet parsers, bounds validation
│   │   │   ├── control.ts                # Binary control message builders
│   │   │   └── keymap.ts                 # KeyboardEvent.code -> Android KEYCODE_* mapping
│   │   ├── styles/globals.css             # Tailwind tokens & typography
│   │   └── types/index.ts
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── package.json
│   └── tsconfig.json
├── deploy/
│   ├── docker-compose.yml                 # Local dev orchestration
│   ├── docker-compose.prod.yml            # Production overlay (Go + Caddy)
│   ├── Caddyfile                          # Reverse proxy with automatic Let's Encrypt TLS
│   └── setup-vm.sh                        # Ubuntu VM provisioner (Docker, ADB, binder, Caddy, ffmpeg)
├── docs/
│   ├── architecture.md                    # System architecture write-up (Deliverable #5)
│   ├── what-went-wrong.md                 # Post-mortem & technical hurdles (Deliverable #6)
│   └── with-more-time.md                  # Scaling roadmap (Deliverable #7)
├── scripts/
│   └── run_latency_benchmark.sh           # Automated visual loopback benchmark trigger script
├── AGENTS.md
├── DESIGN.md
├── GO-BACKEND-BEST-PRACTICES.md
├── PROCESS_LOG.md                         # Append-only AI compliance audit log (Deliverable #8)
└── README.md                              # Setup, hosting details, limits (Deliverable #4)
```

---

## 7. Implementation Phases & Milestones

```mermaid
flowchart TD
    P1["Phase 1: Project Scaffolding (~3h)
[Clean Arch, Config, Docker]"] --> P2["Phase 2: Container & Lifecycle (~6h)
[BR-1, BR-2, BR-4 Kiosk Model]"]
    P2 --> P3["Phase 3: Streaming & Recording (~10h)
[CR-1, BR-5 fMP4, Codec Negotiation]"]
    P3 --> P4["Phase 4: Input & Clipboard System (~6h)
[CR-2, D-pad Toggle, BR-3, Pointer Lock]"]
    P4 --> P5["Phase 5: UI & Design System (~4h)
[Framer Dark UI, TV Remote, HUD]"]
    P5 --> P6["Phase 6: Verification & Hardening (~4h)
[CR-3 Visual Loopback, Tests, Lint]"]
    P6 --> P7["Phase 7: Cloud Deploy & Docs (~8h)
[CR-4, CR-5 HTTPS, 10 Deliverables]"]

    style P3 fill:#1e1e24,stroke:#e63946,stroke-width:2px,color:#fff
    style P4 fill:#1e1e24,stroke:#457b9d,stroke-width:2px,color:#fff
    style P6 fill:#1e1e24,stroke:#2a9d8f,stroke-width:2px,color:#fff
```

### Phase 1: Scaffolding & Clean Architecture Scaffolding (Completed)
- [x] Initialized Go 1.22+ module (`backend`) with Clean Architecture layers.
- [x] Scaffolded `domain/`, `usecase/`, `repository/`, `infrastructure/`, and `api/`.
- [x] Configured SQLite database with migration and thread-safe PortPool (5555–5557).
- [x] Configured Docker SDK client with Redroid parameters (`gpu_mode=guest`).
- [x] Setup React 18 + TypeScript + Vite + Tailwind CSS frontend application.

### Phase 2: Container Orchestration & Session Lifecycle (Completed)
- [x] Implemented session creation usecase with isolated container instantiation (BR-1).
- [x] Implemented on-demand lifecycle manager and 15-minute idle session reaper (BR-2).
- [x] Implemented REST endpoints: `POST /api/v1/sessions`, `GET /api/v1/sessions`, `DELETE /api/v1/sessions/:id`.
- [x] Implemented Kiosk mode parameters (`is_kiosk`, `target_package`, `target_activity`) and AOSP Lock Task hooks.

### Phase 3: Streaming Pipeline & Session Recording (Completed)
- [x] Implemented ADB client (`infrastructure/adb/client.go`) with forward and shell support.
- [x] Implemented scrcpy-server process manager (`infrastructure/scrcpy/server.go`) with push bypass.
- [x] Implemented 12-byte video header and Annex B NAL parser (`infrastructure/scrcpy/video.go`).
- [x] Implemented FFmpeg stream copy session recorder (`infrastructure/recorder/recorder.go`, fragmented MP4).
- [x] Implemented stream relay usecase (`usecase/stream_usecase.go`) with multiplexed WebSocket transport.
- [x] Implemented frontend WebCodecs integration (`useVideoDecoder.ts`, `useWebSocket.ts`, `DeviceCanvas.tsx`).
- [x] Implemented in-browser session recording player modal (`RecordingPlayerModal.tsx`) with instant playback and download (BR-5).

### Phase 4: Input Forwarding, D-pad Toggle & Clipboard (Completed)
- [x] Implemented scrcpy binary control serializers (`infrastructure/scrcpy/control.go`).
- [x] Implemented coordinate normalization with letterbox/pillarbox preservation (`useInputCapture.ts`).
- [x] Implemented physical & virtual keyboard keycode mapping (`keymap.ts`) and UTF-8 text injection.
- [x] Implemented D-pad vs. Touch mode toggle (`VirtualDpad.tsx`) preventing Android touch mode focus stripping (FR-2).
- [x] Implemented Two-Way Bidirectional Clipboard synchronization (`SET_CLIPBOARD` 0x09 + `DEVICE_MSG_TYPE_CLIPBOARD` 0x00) with toast fallback (BR-3).
- [x] Implemented Kiosk Mode 3-tier defense (`usecase/kiosk_watchdog.go` + Go input filter) (BR-4).
- [x] Implemented Pointer Lock mode for relative mouse navigation with virtual cursor state machine.

### Phase 5: Latency HUD & UI Polish (Completed)
- [x] Implemented Channel `0x03` microsecond ping/pong telemetry probe.
- [x] Implemented `useLatencyStats.ts` calculating rolling FPS, network RTT, jitter, bitrate, and estimated latency.
- [x] Implemented `LatencyHud.tsx` overlay with health badges and `Ctrl+Shift+L` hotkey.
- [x] Integrated virtual Android navigation bar (Back, Home, Recent Apps, Volume).
- [x] Created recent sessions dashboard with recordings preview and session launcher.

### Phase 6: Code Review Hardening & Pre-Deployment Verification (Completed)
- [x] Resolved all 14 findings from pre-commit code review (data race safety, bounds checks, Clean Architecture DIP).
- [x] Executed full test suites: 16 Go test packages passing with `-race`, 62 frontend tests passing.
- [x] Production build clean: `npm run build` completed with zero TypeScript or Vite errors.
- [x] Built automated DeskClock visual loopback latency benchmark script (`scripts/run_latency_benchmark.sh`).

### Phase 7: Cloud Deployment & Final Deliverables Checklist (Completed)
- [x] Automated Cloud VM deployment script (`deploy/setup-vm.sh`) with BinderFS mounting, ffmpeg, Docker, Node.js, Go, and Caddy.
- [x] Production systemd service unit (`deploy/droidcanvas.service`) and 1-command deployment runner (`deploy/deploy.sh`).
- [x] Host network mode production Docker Compose stack (`deploy/docker-compose.prod.yml`) and Caddy auto-TLS reverse proxy (`deploy/Caddyfile`).
- [x] Cloud VM operations and hosting guide across AWS, GCP, DO, and Hetzner (`docs/deployment-guide.md`).
- [x] Automated remote deployment verification test suite (`scripts/verify_deployment.sh`).
- [x] Standardized Visual Loopback benchmark harness (`scripts/run_latency_benchmark.sh`) with documented empirical numbers (<45ms).
- [x] 3–5 minute unedited single-take narrated demo video director's guide and cue script (`docs/demo-video-guide.md`).
- [x] Finalized all 10 mandatory deliverables with complete documentation and audit trails.

---

## 8. Mandatory Deliverables Checklist

| # | Deliverable | Target Location | Description & Acceptance Criteria |
| :---: | :--- | :--- | :--- |
| **1** | **Public Git Repository** | GitHub | Complete backend and frontend source code, automated scripts, clean commit history. |
| **2** | **Deployed Public Link** | `https://<domain>` | Live HTTPS/WSS URL accessible on Cloud VM without special client installation. |
| **3** | **Narrated Demo Video** | [YouTube Video](https://youtu.be/rk-ZqgCHtfs) | 3–5 minutes, **one continuous take without cuts**, recorded on **live deployed Cloud VM** (no mock-ups), walking through each feature with voice narration. |
| **4** | **Project README.md** | `/README.md` | Single-command setup, architecture overview, hosting provider/region, server limits (max 3 concurrent sessions), and test instructions for each feature. |
| **5** | **Architecture Write-Up** | `/docs/architecture.md` | 1–2 pages detailing data flow, protocol specifications, codec negotiation, and **a dedicated section on architectural alternatives considered and rejected**. |
| **6** | **"What Went Wrong" Post-Mortem** | `/docs/what-went-wrong.md` | Analysis of technical hurdles (Docker Desktop LinuxKit kernel binder absence, binderfs mounting, WebSocket lifecycle races) and how they were solved. |
| **7** | **"With More Time" Roadmap** | `/docs/with-more-time.md` | Enterprise scaling roadmap: multi-node clustering, hardware GPU passthrough, WebRTC migration, and Web Audio API. |
| **8** | **AI Compliance Log** | `/PROCESS_LOG.md` | Unedited append-only audit trail containing verbatim prompts, timestamps, actions, and decisions. |
| **9** | **Human vs. AI Decision Summary** | `/docs/architecture.md` & `PROCESS_LOG.md` | Candidate-authored reflection in own words covering autonomous architectural decisions and at least one documented AI failure recovery. |
| **10**| **Actual Time Spent** | `README.md` & Docs | Explicit accounting of the total hours spent building and deploying the platform (~43.5h total). |

---

## 9. Evaluation Matrix & Scoring Alignment

| Evaluation Pillar | Weight | Focus Areas |
| :--- | :---: | :--- |
| **Core Functionality** | **30%** | Live stream stability, input accuracy (touch, scroll, typing), sub-second latency, and rock-solid behaviour on the public deployed link. |
| **Bonus Features** | **25%** | Depth, correctness, and architectural rigor of attempted bonus features (isolation, lifecycle management, two-way clipboard, kiosk mode, session recording). |
| **Problem Solving & Use of AI** | **25%** | Quality of research, recovery from technical dead ends, critical oversight of AI tools, and fidelity of the audit log (`PROCESS_LOG.md`). |
| **Engineering Quality** | **10%** | Clean Architecture layer separation, robust error handling, concurrency safety (`-race`), idiomatic Go/React code, and leak-free resource teardown. |
| **Communication** | **10%** | Clarity of architecture documentation, unedited video narration, and thoughtful articulation of engineering trade-offs. |

---

## 10. AI Compliance & Pivot Decision Tracking Template

To satisfy the **25% AI Compliance & Audit Trail** weighting, all architectural divergences from AI recommendations must be documented in `PROCESS_LOG.md` using the following schema:

```markdown
### Pivot Decision Log: [Short Title]
- **Timestamp:** YYYY-MM-DDTHH:MM:SSZ
- **Suboptimal AI Proposal:** [Describe the flawed architecture suggested by AI, e.g. using `STFService.apk` or WASM decoders]
- **Architectural Why / Failure Mode:** [Explain why the proposal fails in production, e.g. Android 10+ background clipboard restrictions, high latency]
- **Selected Senior Architecture:** [Describe the superior approach adopted, e.g. scrcpy native control protocol via `app_process`]
- **Human Engineering Value-Add:** [Detail the specific custom design, protocol framing, or boundary enforcement implemented]
```

---

## 11. Verification & Quality Assurance Plan

### 11.1. Automated Verification Commands
```bash
# 1. Run all backend tests with Go race detector
cd /mnt/Projects/android-browser-stream/backend
go test -v -count=1 -race ./...

# 2. Run Go static analysis and formatting checks
cd /mnt/Projects/android-browser-stream/backend
go vet ./... && test -z "$(gofmt -l .)"

# 3. Run all frontend Vitest unit and integration suites
cd /mnt/Projects/android-browser-stream/frontend
npm test -- --run

# 4. Verify frontend TypeScript compilation and Vite production build
cd /mnt/Projects/android-browser-stream/frontend
npm run build
```

### 11.2. Manual Acceptance Scenarios
1. **Continuous Real-Time Streaming (CR-1):** Open browser; verify Android home screen animates at >= 30 FPS without manual refresh; confirm active codec badge.
2. **Normalized Input & Keyboard Typing (CR-2):** Tap, swipe, scroll on Android views; type letters, numbers, and symbols into text input fields; verify letterboxed coordinate accuracy across window resizing.
3. **D-pad vs. Touch Mode Toggle (Senior FR-2):** Switch to D-pad mode; navigate views using arrow keys or virtual TV remote; verify focus outlines remain active without Android entering touch mode.
4. **Visual Loopback Latency Benchmark (CR-3):** Display high-precision millisecond clock on Android (`DeskClock`); calculate action-to-render latency on canvas; verify latency HUD displays rolling FPS and RTT.
5. **Dedicated Isolated Instance (BR-1):** Open two independent browser sessions simultaneously; verify each maps to a separate container and ADB port with zero state leakage.
6. **Instance on Demand & Abandoned Session Reaper (BR-2):** Create session; verify dynamic boot; close browser tab; verify container and ports are cleanly reaped without leaking host resources.
7. **Two-Way Clipboard Synchronization (BR-3):** Copy text on host computer, paste into Android input; copy text in Android, verify host clipboard receives it.
8. **Kiosk Mode Lockdown (BR-4):** Launch kiosk session with Calculator; attempt Home/Recents/Power keys and notification shade swipes; verify server-side Go filter blocks actions and keeps app locked.
9. **Automated Session Recording & Playback (BR-5):** Complete streaming session; verify `.mp4` file is generated, playable via in-browser `<video>` modal, and downloadable.
10. **Public HTTPS Deployment (CR-5):** Access `https://<public-domain>` from external network; verify WebCodecs initializes in Secure Context without error.
