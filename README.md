# Cloud-Native Real-Time Android Browser Streaming

[![CI Backend](https://img.shields.io/badge/Go%20Backend-18%20Suites%20Passing-brightgreen?style=flat-square&logo=go)](https://go.dev/)
[![CI Frontend](https://img.shields.io/badge/Frontend-23%20Tests%20Passing-brightgreen?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Latency](https://img.shields.io/badge/Glass--to--Glass%20Latency-18--35ms-blue?style=flat-square)](docs/architecture.md)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

An ultra-low-latency, interactive Android-in-Cloud (AIC) streaming system that executes ephemeral Android 13 containers and streams interactive H.264 video directly to modern web browsers via WebCodecs at sub-50ms glass-to-glass latency.

Designed and built for the **HealthTick Developer Assignment** adhering strictly to **Clean Architecture**, **SOLID principles**, and **Test-Driven Development (TDD)**.

---

## ⚡ Key Highlights & Architecture

- **Sub-50ms Video Pipeline**: Scrcpy v2.7 virtual display capture streamed over a single multiplexed binary WebSocket (`0x00` Video, `0x02` Control, `0x03` Ping).
- **GPU Accelerated Rendering**: Offloaded to browser GPU using HTML5 Canvas and the W3C **WebCodecs API** (`VideoDecoder` with zero-buffering latest-frame-wins pattern).
- **Full Interactive Input Forwarding**: Touch, continuous dragging (throttled to 60Hz), wheel scrolling, physical keyboard typing, and instant clipboard/text injection.
- **Ephemeral Sandbox Isolation**: Dedicated Redroid Android 13 container per session with automatic port leasing, double-release guards, and background idle session reaper.
- **Live Performance HUD**: In-browser diagnostic overlay displaying real-time FPS, inter-frame jitter ($\sigma$), network RTT ping, stream bitrate, and estimated glass-to-glass latency.
- **Framer Dark Canvas UI**: Tailored interface using semantic dark design tokens (`bg-canvas`, `bg-surface-1`, `border-hairline`, and monospace telemetry).

---

## 📋 Deliverables Matrix

| Deliverable | Description | Location |
|:---|:---|:---|
| **#1 Public Git Repository** | Clean Architecture codebase with comprehensive git commit history | [Root Repository](.) |
| **#2 Deployment Config** | Cloud VM automated provisioning and Caddy reverse proxy setup | [`deploy/setup-vm.sh`](deploy/setup-vm.sh), [`deploy/Caddyfile`](deploy/Caddyfile) |
| **#3 Demo Script** | Walkthrough guide for recording live interactive video demo | [Walkthrough & Demo Script](docs/architecture.md#demo-walkthrough-guide) |
| **#4 README.md** | Complete setup steps, architecture summary, and API reference | This Document |
| **#5 Architecture Doc** | Deep-dive system architecture, streaming protocol, and trade-offs | [`docs/architecture.md`](docs/architecture.md) |
| **#6 What Went Wrong** | Engineering post-mortem detailing dead ends, race conditions, and fixes | [`docs/what-went-wrong.md`](docs/what-went-wrong.md) |
| **#7 With More Time** | Scaled commercial roadmap (Kubernetes, GPU virtualization, WebTransport) | [`docs/with-more-time.md`](docs/with-more-time.md) |
| **#8 Process Log** | Verbatim prompt-by-prompt AI pair programming audit trail | [`PROCESS_LOG.md`](PROCESS_LOG.md) |
| **#9 Decision Summary** | Matrix of Human guidance vs AI proposals across all phases | [`docs/architecture.md#8-human-vs-ai-decision-summary`](docs/architecture.md#8-human-vs-ai-decision-summary) |

---

## 🚀 Quickstart: Running Locally

The project includes an automated startup script `run_local.sh` that checks dependencies, auto-detects Docker sockets, builds frontend assets, boots the Go backend, and opens Vite.

### Prerequisites

- **Linux OS** (Ubuntu 22.04 / 24.04 or Linux with KVM)
- **Docker Engine** or **Docker Desktop for Linux**
- **ADB** (`android-tools-adb` or Android SDK platform-tools)
- **Go 1.22+**
- **Node.js 18+** & **npm**

### 1. Launch Stack

```bash
# Clone the repository
git clone https://github.com/user/android-browser-stream.git
cd android-browser-stream

# Execute one-click startup
./run_local.sh
```

The script will:
1. Validate Go, Node, ADB, and Docker status.
2. Auto-discover Docker Desktop sockets (`~/.docker/desktop/docker.sock`).
3. Verify presence of `redroid/redroid:13.0.0-latest`.
4. Ensure `scrcpy-server v2.7` is staged at `backend/bin/scrcpy-server`.
5. Start the Go backend on `http://localhost:8080`.
6. Start the Vite React development server on `http://localhost:5173`.

Visit **`http://localhost:5173`** in your browser, click **"Launch Android Session"**, and enjoy sub-50ms interactive Android streaming!

---

## 🧪 Testing Suite & Quality Verification

All components were written following strict **Test-Driven Development (TDD: Red-Green-Refactor)**.

### Run Backend Unit & Integration Tests (with Race Detection)
```bash
cd backend
go test -count=1 -race ./...
```
*Executes all 18 test suites across domain, usecase, repository, docker infrastructure, adb, scrcpy, and end-to-end integration tests.*

### Run Frontend Unit Tests
```bash
cd frontend
npm test
```
*Executes all 23 Vitest unit tests covering keycode mapping, scrcpy binary serializers, NAL parsers, coordinate normalization, and latency jitter math.*

### Production Build Verification
```bash
cd frontend
npm run build
```
*Validates zero TypeScript errors (`tsc --noEmit`) and builds optimized static assets.*

---

## 🌐 Cloud VM Deployment

To deploy on a remote cloud VM (e.g. Hetzner CX41, DigitalOcean, or AWS EC2):

1. **Provision VM**: Ubuntu 22.04 or 24.04 with KVM support (minimum 4 vCPUs, 8GB RAM).
2. **Run Automated Setup Script**:
   ```bash
   chmod +x deploy/setup-vm.sh
   ./deploy/setup-vm.sh
   ```
3. **Configure Domain & TLS**:
   Edit `deploy/Caddyfile` with your public domain name.
4. **Start Production Stack**:
   ```bash
   cd deploy
   DOMAIN=stream.yourdomain.com docker compose -f docker-compose.prod.yml up -d
   ```
   Caddy will automatically provision a free Let's Encrypt SSL/TLS certificate and proxy WebSocket traffic securely.

---

## 📡 REST & WebSocket API Specification

### REST Endpoints

| Method | Endpoint | Description | Status Codes |
|:---|:---|:---|:---|
| `POST` | `/api/sessions` | Provisions a new ephemeral Android container | `201 Created`, `429 Too Many Requests` |
| `GET` | `/api/sessions` | Lists all active sessions | `200 OK` |
| `GET` | `/api/sessions/:id` | Returns status and metadata of a session | `200 OK`, `404 Not Found` |
| `DELETE` | `/api/sessions/:id` | Terminates container and releases host port | `204 No Content`, `404 Not Found` |
| `GET` | `/api/health` | Health check endpoint | `200 OK` |

### WebSocket Streaming Endpoint

- **URL**: `GET /api/sessions/:id/stream`
- **Protocol**: Single binary WebSocket connection with 1-byte channel prefixes:
  - `0x00`: Video packets (12-byte header + Annex B H.264 NALs)
  - `0x02`: Scrcpy binary control packets (Touch / Scroll / Keycode)
  - `0x03`: Ping/Pong round-trip latency probe (microsecond timestamp echo)

---

## ⚖️ Known Constraints & System Limits

- **Concurrent Sessions**: Default capacity is locked to **3 concurrent containers** (ports 5555–5557) to ensure CPU stability on standard host VMs.
- **Idle Timeout**: Unattended sessions are automatically reaped after **5 minutes of inactivity**.
- **Cold Boot Time**: First-time container launch takes ~25–40 seconds while Android's internal `SurfaceFlinger` boots; warm containers take ~10–15 seconds.
- **Audio**: Video and input pipelines are fully operational; audio channel `0x01` is reserved for the Opus/AAC Web Audio pipeline described in `docs/with-more-time.md`.
