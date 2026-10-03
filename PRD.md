# Product Requirements Document: DroidCanvas — Ephemeral Cloud-Native Android Streaming Engine

## 1. Product Vision & Principles

**DroidCanvas** is an ultra-low-latency, interactive Android-in-Cloud (AIC) streaming platform that executes ephemeral Android 13 containers and streams interactive H.264 video directly to modern web browsers via WebCodecs at sub-50ms glass-to-glass latency with zero server-side transcode overhead.

The platform is designed around three architectural pillars:
* **Native Kernel Performance**: Leverage Linux host-kernel `binderfs` IPC and scrcpy virtual display capture to achieve near-bare-metal Android execution without emulation overhead.
* **Server as Business Logic Hub**: Keep the web client purely presentational while centralizing container lifecycle management, port pooling, and input validation on the Go backend adhering strictly to **Clean Architecture**.
* **Zero-State Ephemeral Isolation**: Each session runs inside a fresh, dedicated Redroid container that is destroyed on disconnect, guaranteeing zero persistent state or data leaks between users.

---

## 2. Scope & Technical Boundaries

To maintain engineering velocity and rock-solid stability, system boundaries are strictly defined:

| In-Scope | Explicitly Out-of-Scope |
| :--- | :--- |
| Support for 2 to 3 simultaneous isolated Android instances on a single host machine. | Multi-region clusters or global CDN distribution. |
| Single-machine Cloud VM deployment with automated setup scripts. | Automated horizontal autoscaling (Kubernetes HPA, Nomad clusters). |
| Real-time video mirroring and normalized input forwarding (touch, gestures, scroll, and keyboard typing). | Enterprise-grade hardware load balancers. |
| Secure Context (HTTPS/WSS) reverse proxy configuration for WebCodecs. | iOS device virtualization or Chrome DevTools Protocol (CDP) proxies. |

> **Scoping Principle:** A simple, resilient design that works reliably is strictly preferred over an unnecessarily complex system. Supporting 2 to 3 simultaneous instances on one machine provides complete isolation while conserving cloud VM compute.

---

## 3. Core Functional Capabilities

### FR-1: Continuous Real-Time Streaming
* The browser displays a live, persistent mirror of the running Android OS without manual page refreshes.
* Stream delivery achieves sub-50ms glass-to-glass action-to-render latency. While H.264 Baseline is the universal compatibility standard, the pipeline supports modern encoders (H.265/AV1) where hardware acceleration permits.
* Video playback utilizes the browser's low-overhead **WebCodecs API (`VideoDecoder`)** rendered onto an HTML5 Canvas context using desynchronized rendering.

### FR-2: Normalized Input Forwarding (Touch, Scroll, & Keyboard Typing)
* **Touch & Gestures:** Capture and forward tap, swipe, multi-pointer moves, and touch release events.
* **Coordinate Normalization:** Coordinates are mathematically mapped from the client's rendered viewport to the native Android display resolution ($X \in [0, W]$, $Y \in [0, H]$), preserving aspect ratio with proper letterbox/pillarbox compensation across arbitrary browser window resizing.
* **Scroll & Navigation:** Transmit mouse-wheel scroll events using 16-bit signed fixed-point integer serialization (`i16-fixed-point`). Virtual navigation actions (Back, Home, App Switch) are accessible from the navigation bar.
* **Keyboard Typing & Text Injection:** The user can type naturally into Android text fields from their physical keyboard or an in-browser text toolbar. Keystrokes map browser `KeyboardEvent.code` to Android `KeyEvent.KEYCODE_*` codes and forward UTF-8 text strings directly into active Android input fields.

### FR-3: Latency Benchmarking & Metrics Reporting
* **Objective Measurement:** Measure glass-to-glass delay between a user action and visible screen update.
* **Standard Methodology:** Implement a reproducible benchmarking method, such as the **Visual Loopback Test** (rendering a high-precision millisecond counter on the Android OS and comparing it against the captured browser canvas frame).
* **Documented Reporting:** Quantitative latency figures (action-to-render delay, network RTT, framerate, and jitter) are displayed in a live in-app diagnostic HUD (`Ctrl+Shift+L`) and exported via automated benchmark CLI scripts.

### FR-4: Reproducible Single-Machine Execution
* The entire system (backend, frontend, Android container engine, and proxy services) runs on a single machine.
* Automated setup scripts (`run_local.sh`, `docker-compose.yml`) allow developers to reproduce the working environment with a single command.

### FR-5: Public Accessibility & Cloud Deployment
* The backend and frontend run continuously on a remote Cloud VM (Ubuntu 22.04 LTS).
* The service is reachable via a public, secure HTTPS/WSS domain with automated TLS termination via Caddy.

---

## 4. Enterprise & Sandboxing Capabilities

### BR-1: Dedicated Isolated Instance per User
* **Session Isolation:** An orchestration layer guarantees that concurrent users receive completely separate, sandboxed Android environments.
* **Zero Leakage:** No crossover of user actions, storage (`/sdcard`), installed APKs, OS settings, clipboard data, or container ports between users.

### BR-2: On-Demand Lifecycle Management & Leak Prevention
* **Dynamic Provisioning:** Android instances are provisioned dynamically when a user initiates a session and decommissioned automatically upon session termination or inactivity.
* **Pre-Warmed Standby Pool:** An optional background pool keeps containers pre-booted to `sys.boot_completed == 1`, reducing user wait time to <300ms.
* **Abandoned Session Reaper:** Server-side cleanup policies detect abandoned sessions (closed browser tabs, network dropouts, crashed sockets) and reclaim containers, ADB forwarding tunnels, and port allocations without leaking server resources.

### BR-3: Two-Way Bidirectional Clipboard Synchronization
* **Client-to-Device Sync:** Text copied on the user's host computer is seamlessly pasted into the Android device's clipboard.
* **Device-to-Client Sync:** Text copied inside the Android OS is captured and synced back to the user's browser clipboard.
* **Mechanism:** Integration with scrcpy's native system service clipboard protocol (`SET_CLIPBOARD` and `DEVICE_MSG_TYPE_CLIPBOARD`).

### BR-4: Restricted Access / Kiosk Mode Enforcement
* **Application Lockdown:** Locks the streaming session to a single selected application (AOSP DeskClock `com.android.deskclock`), preventing the user from escaping to other apps, system settings, or OS-level controls.
* **Server-Side Enforcement:** Enforcement occurs server-side at the Go proxy layer and through background watchdog monitoring so that tampering with client-side JavaScript cannot bypass restrictions.
* **Blocked Actions:** Drops `KEYCODE_HOME`, `KEYCODE_APP_SWITCH`, status bar swipe-down, and notification shade expansion.

### BR-5: Automated Session Recording, Playback & Download
* **Headless Recording:** Automatic server-side capture of streaming sessions, multiplexing the raw H.264 stream to Fragmented MP4 (`fMP4`) tagged with the unique Session ID.
* **In-Browser Playback:** The application provides an in-browser video playback modal allowing users to review recorded sessions with timeline seeking.
* **Session Download:** The system provides an endpoint and UI button allowing recorded sessions to be downloaded directly.

---

## 5. Technical Architecture Specifications

### Recommended Pipeline:
$$\text{Cloud Backend Service (Go Clean Architecture)} \longrightarrow \text{ADB Proxy} \longrightarrow \text{scrcpy-server (on Redroid OS)} \longrightarrow \text{WebSocket Multiplexer} \longrightarrow \text{Browser WebCodecs (HTML5 Canvas)}$$

* **Protocol Framing & Multiplexing:** 1-byte channel prefix multiplexes data streams over a single WebSocket connection:
  - `0x00`: Raw H.264 Video NAL Units (Annex B format)
  - `0x01`: Audio PCM / AAC Stream (if enabled)
  - `0x02`: Binary Input & Control Messages (touch, scroll, keycode, text)
  - `0x03`: Ping / Pong Telemetry & Latency Probes
  - `0x04`: Stream Metadata (codec ID, screen dimensions)
* **Video Decoding:** Hardware-accelerated WebCodecs API (`VideoDecoder` configured for `avc1.42e01f` or dynamic profile) connected to an HTML5 Canvas context with `desynchronized: true` to minimize buffer queues.
* **Input Normalization:** Math-based projection mapping client mouse/touch coordinates across responsive canvas boundaries with aspect-ratio preservation.
* **Secure Context (HTTPS/WSS) Enforcement:** WebCodecs is restricted to Secure Contexts. Remote Cloud VM connections require valid TLS termination (Caddy reverse proxy with automated Let's Encrypt certificates).
