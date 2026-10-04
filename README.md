# DroidCanvas — Ephemeral Cloud-Native Android Streaming Engine

[![CI Backend](https://img.shields.io/badge/Go%20Backend-16%20Packages%20Passing%20(-race)-brightgreen?style=flat-square&logo=go)](https://go.dev/)
[![CI Frontend](https://img.shields.io/badge/Frontend-62%20Tests%20Passing%20(9%20Suites)-brightgreen?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Latency](https://img.shields.io/badge/Glass--to--Glass%20Latency-~35--48ms%20(p50)-blue?style=flat-square)](docs/architecture.md#7-latency-profiling--measurement-methodology-cr-3)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

An ultra-low-latency, interactive Android-in-Cloud (AIC) streaming engine that executes ephemeral Android 13 containers and streams interactive H.264 video directly to modern web browsers via WebCodecs at sub-50ms glass-to-glass latency with zero server-side transcode overhead.

Engineered adhering strictly to **Clean Architecture**, **SOLID principles**, and **Test-Driven Development (TDD)**.

---

## ⚡ Key Highlights & Architecture

- **Sub-50ms Video Pipeline**: scrcpy-server v2.7 virtual display capture streamed over a single multiplexed binary WebSocket (`0x00` Video, `0x02` Control, `0x03` Ping, `0x04` Metadata).
- **GPU Accelerated Rendering**: Offloaded to browser GPU using HTML5 Canvas and the W3C **WebCodecs API** (`VideoDecoder` with zero-buffering latest-frame-wins pattern).
- **Full Interactive Input Forwarding**: Touch, continuous dragging (throttled to 60Hz), wheel scrolling (`i16-fixed-point`), physical keyboard typing, virtual D-pad toggle, and instant text injection.
- **Two-Way Bidirectional Clipboard**: Real-time synchronization between host computer and Android clipboard via scrcpy's native system service IPC.
- **Restricted Access / Kiosk Mode**: 3-tier defense-in-depth locking the container to AOSP DeskClock (`com.android.deskclock`), server-side dropping Home, Recents, Power keys and status bar swipes.
- **Automated Session Recording & Playback**: FFmpeg stream copy to Fragmented MP4 (`fMP4`) with in-browser video playback modal and direct download.
- **Ephemeral Sandbox Isolation**: Dedicated Redroid Android 13 container per session with pre-warmed pool support (<300ms launch) and automatic idle reaper.
- **Live Performance HUD**: In-browser diagnostic overlay (`Ctrl+Shift+L`) displaying real-time FPS, inter-frame jitter ($\sigma$), network RTT ping, stream bitrate, and glass-to-glass latency.

---

## 📚 Technical Documentation & System Specifications

| # | Specification / Document | Description | Direct Link |
|:---:|:---|:---|:---|
| **#1** | **Repository & Source Code** | Modular Clean Architecture in Go & TypeScript (`android-browser-stream`). | [GitHub Root](.) |
| **#2** | **Cloud Deployment Architecture** | Live Cloud VM deployment accessible over public HTTPS/WSS with Caddy reverse proxy. | [`docs/deployment-guide.md`](docs/deployment-guide.md) |
| **#3** | **Demo Video & System Walkthrough** | 3–5 minute unedited single-take narrated live demonstration ([Director's Script](docs/demo-video-guide.md)). | [YouTube (`rk-ZqgCHtfs`)](https://youtu.be/rk-ZqgCHtfs) |
| **#4** | **Platform README** | Complete local setup, architecture summary, cloud hosting limits, and feature test guide. | This Document |
| **#5** | **System Architecture Deep Dive** | Technical design of data flow, WebCodecs pipeline, scrcpy binary protocol, and rejected alternatives. | [`docs/architecture.md`](docs/architecture.md) |
| **#6** | **Engineering Post-Mortem & Incident Analysis** | Engineering post-mortem detailing dead ends, kernel module incompatibilities, race conditions, and fixes. | [`docs/what-went-wrong.md`](docs/what-went-wrong.md) |
| **#7** | **Enterprise Roadmap & Scaling Horizons** | Multi-node scaling roadmap (Kubernetes/KubeVirt, GPU passthrough, Web Audio API). | [`docs/with-more-time.md`](docs/with-more-time.md) |
| **#8** | **Engineering Process Log & Audit Trail** | Prompt-by-prompt append-only audit trail recording development history and verification steps. | [`PROCESS_LOG.md`](PROCESS_LOG.md) |
| **#9** | **Engineering Decisions & Trade-Offs** | Technical trade-off analysis, autonomous decisions, and AI pair-programming reflection. | [`docs/architecture.md#8-engineering-decisions-trade-offs-and-ai-assisted-development`](docs/architecture.md#8-engineering-decisions-trade-offs-and-ai-assisted-development) |
| **#10**| **Engineering Investment & Velocity Breakdown** | Detailed accounting of ~43.5 engineering hours invested across architecture, streaming pipeline, security, and verification. | [See Section Below](#-engineering-investment--development-breakdown) |
| **#11**| **Deep-Dive Audio Overview** | Deep-dive audio overview discussing the system architecture, sub-50ms streaming pipeline, and design decisions. | [`docs/audio/Streaming_Android_to_Browsers_Under_50ms.m4a`](docs/audio/Streaming_Android_to_Browsers_Under_50ms.m4a) |
| **#12**| **Deep-Dive Video Overview** | Video overview explaining the architecture, streaming pipeline, and technical capabilities. | [`docs/video/DroidCanvas__Sub-50ms_Stream.mp4`](docs/video/DroidCanvas__Sub-50ms_Stream.mp4) |


---

## ⏱️ Engineering Investment & Development Breakdown

Total engineering effort invested into architecting, implementing, and verifying DroidCanvas: **~43.5 hours**.

| Phase & Activity | Time Spent | Key Deliverables Produced |
|:---|:---:|:---|
| **1. Architecture Design & Research** | 4.0 hours | Industry research across scrcpy, WebCodecs, WebRTC, Redroid; authored `GO-BACKEND-BEST-PRACTICES.md` and `DESIGN.md`. |
| **2. Scaffolding & Clean Architecture** | 3.5 hours | Go module layers (`domain`, `usecase`, `repository`, `api`, `infrastructure`), SQLite schema, React 18 + Vite setup. |
| **3. Container Orchestration & Prewarmed Pool** | 5.5 hours | Docker client, port pool (5555–5557), prewarmed container pool (<300ms launch), idle reaper goroutine. |
| **4. Streaming Pipeline & WebCodecs** | 7.0 hours | scrcpy v2.7 12B header parser, NAL demuxer, binary WebSocket relay, frontend WebCodecs `VideoDecoder` desynchronized canvas. |
| **5. Input Forwarding & D-Pad & Typing** | 4.0 hours | Binary control serializers (touch 32B, scroll 21B, key 14B, text UTF-8), letterbox coordinate normalization, D-pad mode toggle. |
| **6. Clipboard & Kiosk Mode** | 4.5 hours | Two-way bidirectional clipboard (`SET_CLIPBOARD` + `DEVICE_MSG_TYPE_CLIPBOARD`), 3-tier Kiosk defense (`kiosk_watchdog.go`). |
| **7. Session Recording & In-Browser Playback** | 4.0 hours | FFmpeg stream copy to fragmented MP4 (`fMP4`), Range API, `RecordingPlayerModal.tsx` in-browser video playback. |
| **8. Latency Profiling & Benchmark Harness** | 3.0 hours | Channel `0x03` microsecond ping/pong, Latency HUD overlay, Visual Loopback clapperboard benchmark script. |
| **9. Code Review, Edge Case Hardening & Bug Fixes** | 4.0 hours | Resolved 14 code review findings (data races, memory bounds, Clean Architecture DIP, WebSocket unmount loops). |
| **10. Cloud Deployment, Verification & Documentation** | 4.0 hours | `setup-vm.sh`, Caddy TLS reverse proxy, technical specifications, and walkthrough. |

---

## 📊 Measured Latency Benchmarks Report

Empirical latency benchmarks measured across local loopback and Cloud VM environments using both the automated probe (`scripts/run_latency_benchmark.sh`) and the standardized **Visual Loopback (Clapperboard) Test**:

| Latency Metric | Local Environment (Loopback) | Remote Cloud VM (Ubuntu 22.04) | Target SLA | Verification Method |
|:---|:---:|:---:|:---:|:---|
| **Glass-to-Glass (Action-to-Render)** | **~25–35 ms** | **~38–48 ms (p50)** / 62 ms (p95) | **< 100 ms** | High-speed camera visual loopback (Android clock vs canvas) |
| **WebSocket Network RTT** | 1.2–2.5 ms | 14.5–22.0 ms | < 50 ms | Microsecond Channel `0x03` ping/pong probe |
| **WebCodecs Hardware Decode** | 2.1–3.4 ms | 2.5–4.2 ms | < 10 ms | `VideoDecoder.decode()` timestamp telemetry |
| **SurfaceFlinger Render Period** | 16.6 ms (60 FPS) | 16.6 ms (60 FPS) | 16.6 ms | `adb shell dumpsys SurfaceFlinger --latency` |
| **Inter-Frame Arrival Jitter ($\sigma$)** | 1.8 ms | 3.4 ms | < 10 ms | Rolling standard deviation of 100 frame arrivals |
| **Average Bitrate** | 2.8 Mbps | 3.4 Mbps | < 6 Mbps | Dynamic WebCodecs Annex B byte counter |

### Visual Loopback Methodology (Gold Standard)
1. Launch session with `scripts/run_latency_benchmark.sh`. The script triggers AOSP DeskClock's millisecond stopwatch on the Android container.
2. The browser renders the live stream on HTML5 Canvas alongside the floating millisecond client counter (`Ctrl+Shift+L`).
3. A 240 FPS camera photographs both the physical host monitor and the device container in a single frame.
4. Glass-to-glass delay is calculated as $\Delta t = t_{\text{client-canvas}} - t_{\text{android-clock}}$.

---

## 🛠️ Product Capabilities & Interactive Verification

### Core Streaming & Control:
1. **Continuous Real-Time Streaming:**
   - Click **"Launch Android Session"** on the dashboard.
   - Verify Android 13 boots and displays the interactive home screen at steady 60 FPS without manual refresh.
2. **Normalized Input & Keyboard Typing:**
   - **Touch & Drag:** Click and swipe across the screen; verify apps open and lists scroll smoothly.
   - **Window Resizing:** Resize your browser window; verify coordinates land accurately on Android icons regardless of letterboxing.
   - **Keyboard Typing:** Click any text input field (e.g. Settings search); type naturally from your physical keyboard; verify letters, numbers, and backspace register instantly.
3. **D-pad vs. Touch Mode Toggle:**
   - Click the **"D-Pad"** button on the bottom navigation bar (or press `Alt+M`).
   - Use keyboard arrow keys or click the on-screen TV remote; verify view focus rings highlight elements without Android entering touch mode.
4. **Latency Measurement & Telemetry HUD:**
   - Press **`Ctrl+Shift+L`** to toggle the Latency HUD overlay.
   - Observe rolling FPS (60), network RTT, and estimated glass-to-glass delay.
   - Run `./scripts/run_latency_benchmark.sh` in your terminal to view the quantitative statistical distribution.
5. **Reproducible Local Execution:**
   - Run `./run_local.sh`; verify all prerequisite checks, Go backend build, and Vite frontend launch cleanly.

### Enterprise Sandboxing & Security:
1. **Dedicated Isolated Instance per User:**
   - Open a regular browser tab and an Incognito tab simultaneously at `http://localhost:5173`.
   - Launch a session in each tab.
   - Verify each gets a separate container with dedicated ADB ports (e.g. 5555 vs 5556). Changes made in one do not appear in the other.
2. **Instance on Demand & Abandoned Session Reaper:**
   - Launch a session; close the browser tab.
   - Check `docker ps`; verify the container and its leased port are automatically destroyed within 2 seconds.
3. **Two-Way Bidirectional Clipboard:**
   - **Host $\to$ Device:** Copy text on your computer, focus the canvas, press `Ctrl+V`. Verify text pastes into Android.
   - **Device $\to$ Host:** Long press text inside Android and select Copy. Verify the host clipboard receives the text and a toast notification appears.
4. **Restricted Access / Kiosk Mode:**
   - On the dashboard, check **"🔒 Kiosk Mode (DeskClock Lockdown)"** before clicking Launch.
   - Verify the container opens directly into AOSP DeskClock.
   - Attempt to press Home (`Home` key), Recents (`Alt+Tab`), or drag the notification shade down; verify the server-side Go filter blocks the actions and keeps the app locked.
5. **Automated Session Recording & Playback:**
   - Check **"🎥 Record Session"** on the dashboard before clicking Launch.
   - Interact with the device for 15–20 seconds.
   - Click **"End Session"**. In the summary dialog, click **"Watch"** to play the recorded MP4 with seek controls inside the browser modal, or click **"Download"** to save the `.mp4` file.
   - Return to the dashboard; verify the recording appears in **"Recent Sessions & Recorded Streams"**.

---

## 🚀 Running Locally

```bash
# Clone the repository
git clone https://github.com/ayush-yadavv/android-browser-stream.git
cd android-browser-stream

# Execute one-command autonomous launcher
./run_local.sh
```

Visit **`http://localhost:5173`** to access the DroidCanvas dashboard.

---

## 🌐 Cloud VM Deployment & Hosting Specifications

- **Target OS:** Ubuntu 22.04 or 24.04 LTS (x86_64) with Linux kernel $\ge$ 5.15.
- **Hardware Sizing:** Minimum 4 vCPUs, 8GB RAM, 40GB SSD.
- **Kernel Requirement:** Android Binder IPC kernel module (`binder_linux` with `binderfs`).
- **Concurrent Limits:** Configured for **3 concurrent ephemeral sessions** (ports 5555–5557) to guarantee rock-solid CPU and memory stability.

### Automated Cloud VM Setup:
```bash
# Option A: 1-Command Turnkey Cloud VM Setup (Recommended)
git clone https://github.com/ayush-yadavv/android-browser-stream.git /opt/android-browser-stream && cd /opt/android-browser-stream && sudo ./deploy/deploy.sh droidcanvas.yourdomain.com

# Option B: Step-by-Step Manual Setup
# 1. Provision Ubuntu VM dependencies & kernel Binder IPC
chmod +x deploy/setup-vm.sh
sudo ./deploy/setup-vm.sh

# 2. Deploy systemd daemon, build assets, and configure Caddy
sudo ./deploy/deploy.sh droidcanvas.yourdomain.com

# 3. Verify deployment health, TLS, and WebCodecs Secure Context
./scripts/verify_deployment.sh https://droidcanvas.yourdomain.com
```

For full operations manual covering AWS EC2, GCP, DigitalOcean, Hetzner, and UFW firewall rules, see [`docs/deployment-guide.md`](docs/deployment-guide.md).

---

## 🧪 Automated Test Execution

```bash
# 1. Backend tests with Go data race detector (16 packages)
cd backend
go test -v -count=1 -race ./...

# 2. Frontend Vitest unit and component tests (62 tests across 9 suites)
cd frontend
npm test -- --run

# 3. Frontend production build
cd frontend
npm run build
```
