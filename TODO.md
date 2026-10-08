# DroidCanvas — Project Action Items & TODOs

This document tracks pending deliverables, deployment tasks, and demonstration requirements for **DroidCanvas**.

---

## 🚀 1. Cloud Deployment & Public Access

- [ ] **Provision Public Cloud VM**
  - Select host instance (Azure Standard_B2s_v2 / Hetzner CPX31 / AWS c6i.large).
  - Ubuntu 22.04 LTS with kernel $\ge$ 5.15 and Android Binder IPC (`/dev/binderfs`).
  - Run `./deploy/setup-vm.sh` to install Docker, Node.js, Go, ffmpeg, and Caddy.

- [ ] **Configure Domain & TLS Reverse Proxy**
  - Set DNS A-record to the VM public IP.
  - Run `./deploy/deploy.sh <your-domain>` to deploy the Docker Compose production stack.
  - Verify Caddy auto-issues Let's Encrypt TLS certificate and forces HTTP/3 / HTTPS.

- [ ] **Verify Remote Live Health**
  - Run `./scripts/verify_deployment.sh https://<your-domain>`.
  - Confirm WebCodecs hardware decoding operates in Secure Context over WSS.
  - Run `./scripts/run_latency_benchmark.sh` to confirm glass-to-glass latency remains $\le$ 45ms.

- [ ] **Update Project Documentation**
  - Insert live deployment URL into [README.md](README.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

---

## 🎬 2. Live Demo Video Recording

- [ ] **Record Unedited Single-Take Demo (3–5 Minutes)**
  - Record the **live deployed Cloud VM** in use (one continuous take without cuts).
  - Walk through each core and bonus feature with voice narration:
    1. **Real-Time Video Streaming**: Android 13 home screen at 60 FPS over WebCodecs.
    2. **Normalized Input Forwarding**: Tap, continuous drag, 16-bit scroll wheel, physical keyboard typing.
    3. **D-pad Navigation Toggle**: Switch to D-pad mode, show blue focus outlines stepping without entering touch mode.
    4. **Latency HUD & Visual Loopback**: Reveal HUD (`Ctrl+Shift+L`), show RTT, jitter, and DeskClock stopwatch delta.
    5. **Two-Way Clipboard Synchronization**: Host-to-Android paste and Android-to-Host copy toast.
    6. **Kiosk Mode 3-Tier Lockdown**: DeskClock pinning, dropping Home/Recents/Power keys and status bar drags.
    7. **Session Recording & In-Browser Playback**: fMP4 stream copy recording, playback modal, and container teardown.

- [ ] **Upload & Link Video**
  - Upload recording to YouTube / Loom / public hosting.
  - Update [README.md](README.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) with the video link.

---

## 🧪 3. Verification & Pre-Flight Checks

- [ ] Run backend race detector tests: `cd backend && go test -v -count=1 -race ./...`
- [ ] Run backend formatting & vet checks: `cd backend && go vet ./... && test -z "$(gofmt -l .)"`
- [ ] Run frontend test suites: `cd frontend && npm test -- --run`
- [ ] Run frontend production build: `cd frontend && npm run build`
