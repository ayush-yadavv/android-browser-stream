# DroidCanvas — Cloud VM Deployment & Operations Manual

This document provides a production guide for deploying and operating **DroidCanvas** on public cloud virtual machines.

---

## 1. Cloud Host Requirements & Provider Matrix

DroidCanvas containerizes the Android OS userspace using **Redroid** (Remote Android in Docker), communicating with the host Linux kernel via **Binder IPC** (`/dev/binderfs`). 

Because Redroid executes native OCI Linux containers sharing the host kernel rather than running a full QEMU virtual machine, **nested virtualization is NOT required**. Standard cloud compute instances run DroidCanvas at peak hardware performance.

### Recommended Hardware Sizing:
- **Target OS:** Ubuntu 22.04 LTS (Kernel 5.15 / 6.5 HWE) or Ubuntu 24.04 LTS (Kernel 6.8).
- **Architecture:** `x86_64` (`amd64`).
- **vCPUs:** Minimum 4 vCPUs (recommended: 4–8 vCPUs for 3 concurrent sessions).
- **RAM:** Minimum 8GB RAM (Redroid uses ~800MB–1.2GB per container + 500MB host OS overhead).
- **Disk:** 40GB+ NVMe/SSD storage (Docker image cache + session fMP4 recordings).

### Cloud Provider Recommendations:

| Provider | Recommended Machine Type | vCPUs | RAM | Est. Cost / Mo | Notes |
|:---|:---|:---:|:---:|:---:|:---|
| **AWS EC2** | `t3.xlarge` or `c5.xlarge` | 4 | 8GB–16GB | ~$120 / mo | Ubuntu 22.04 AMI (`ami-0c7217cdde317cfec`). Ensure Nitro-based instance. |
| **GCP Compute Engine** | `e2-standard-4` | 4 | 16GB | ~$95 / mo | Ubuntu 22.04 LTS image. Cost-effective shared core with burst capability. |
| **DigitalOcean** | Regular or Premium Intel Droplet | 4 | 8GB | ~$48 / mo | Excellent price-to-performance ratio; instant public IPv4. |
| **Hetzner Cloud** | `CX32` / `CPX31` | 4 | 8GB | ~$14 / mo | Unbeatable European/US value; native Linux kernel modules readily available. |
| **Oracle Cloud (OCI)** | `VM.Standard.A1.Flex` / `E4.Flex` | 4 | 16GB | Always Free / Low | High RAM availability. |

---

## 2. Firewall & Network Security Group Rules

Configuring tight security perimeter rules is paramount. Exposing internal Android Debug Bridge (ADB) ports to the open internet allows unauthorized remote shell execution.

### Security Group / UFW Configuration:

```
┌────────────────────────────────────────────────────────┐
│ PUBLIC INTERNET (Users & Browsers)                     │
└───────────────────────────┬────────────────────────────┘
                            │
            Port 80 (HTTP)  │  Port 443 (HTTPS / WSS)
            (ACME / Let's Encrypt)
                            ▼
┌────────────────────────────────────────────────────────┐
│ CADDY REVERSE PROXY (Host Edge)                        │
└───────────────────────────┬────────────────────────────┘
                            │
       Internal Loopback    │ Reverse Proxy
       127.0.0.1:8080       │ (Never Exposed Publicly)
                            ▼
┌────────────────────────────────────────────────────────┐
│ DROIDCANVAS BACKEND (Go 1.22+ Clean Architecture)      │
└───────────────────────────┬────────────────────────────┘
                            │
       Internal Loopback    │ ADB Connect (Ports 5555–5557)
       (Strictly Local)     │ (Blocked from External Inbound)
                            ▼
┌────────────────────────────────────────────────────────┐
│ EPHEMERAL REDROID CONTAINERS (Docker Engine)           │
└────────────────────────────────────────────────────────┘
```

### Inbound Rules (Allowed):
| Port | Protocol | Purpose | Source |
|:---:|:---:|:---|:---:|
| **22** | TCP | SSH Server Administration | Your Admin IP (or `0.0.0.0/0` with SSH key) |
| **80** | TCP | HTTP-01 ACME Challenge & Automatic HTTPS Redirection | `0.0.0.0/0` (Anywhere) |
| **443** | TCP | Production Web UI, REST API & Multiplexed Binary WebSocket | `0.0.0.0/0` (Anywhere) |

### Inbound Rules (STRICTLY BLOCKED / INTERNAL ONLY):
| Port | Protocol | Security Risk if Exposed |
|:---:|:---:|:---|
| **8080** | TCP | Internal Go backend API (bypasses Caddy TLS termination and rate limits). |
| **5555–5557** | TCP | Android Debug Bridge (`adbd`) listener. If exposed, arbitrary remote users can run `adb shell` as root! |

### UFW Commands (if using Ubuntu Host Firewall):
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. Domain & DNS Configuration

The W3C **WebCodecs API** (`VideoDecoder`) requires a **Secure Context** (`window.isSecureContext === true`). Browsers disable WebCodecs over plain unencrypted HTTP (except on `localhost`).

1. Register or configure a public DNS domain (e.g. `yourdomain.com`).
2. Create an **A-Record** pointing your subdomain to the Cloud VM's public IPv4 address:
   ```
   Type:  A
   Host:  stream (or @ for apex)
   Value: <YOUR_CLOUD_VM_PUBLIC_IP>
   TTL:   300 seconds (5 minutes)
   ```
3. Verify DNS propagation:
   ```bash
   dig +short stream.yourdomain.com
   # Should output your Cloud VM's public IP
   ```

---

## 4. Automated Step-by-Step Provisioning

### Step 1: Connect to Cloud VM & Clone Repository
```bash
ssh ubuntu@<YOUR_VM_PUBLIC_IP>

# Clone repository to standard production path
sudo git clone https://github.com/ayush-yadavv/android-browser-stream.git /opt/android-browser-stream
cd /opt/android-browser-stream
```

### Step 2: Run VM Provisioner Script
The provisioner script automates system package installation, BinderFS kernel module mounting, Docker Engine installation, Redroid image caching, and Caddy setup:
```bash
chmod +x deploy/setup-vm.sh
sudo ./deploy/setup-vm.sh
```

### Step 3: Configure Domain in Caddyfile
Edit `/opt/android-browser-stream/deploy/Caddyfile` with your actual domain:
```bash
sudo nano deploy/Caddyfile
```
Replace the first line with your domain:
```caddy
stream.yourdomain.com {
    # Serve built React frontend assets
    root * /opt/android-browser-stream/frontend/dist
    file_server

    # Reverse proxy API and WebSocket connections to the Go backend
    handle /api/* {
        reverse_proxy localhost:8080 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # SPA routing fallback: send all other routes to index.html
    handle {
        try_files {path} /index.html
    }

    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    encode zstd gzip
}
```

### Step 4: Execute Deployment Runner
Run the deployment script to compile the frontend, compile the backend binary, register the `systemd` daemon, reload Caddy, and perform health checks:
```bash
sudo ./deploy/deploy.sh
```

---

## 5. Deployment Verification & Smoke Testing

### Automated Remote Verification:
Run the remote verification harness against your deployed domain from your local machine:
```bash
./scripts/verify_deployment.sh https://stream.yourdomain.com
```

### Manual Acceptance Checklist:
1. **WebCodecs Secure Context:**
   Open Chrome DevTools (`F12`) on `https://stream.yourdomain.com`. Run in console:
   ```javascript
   window.isSecureContext === true && typeof VideoDecoder === 'function'
   ```
   Must return `true`.
2. **Session Launch:**
   Click **"Launch Android Session"**. The pre-warmed pool should deliver the interactive Android 13 display within **300ms–1.5s**.
3. **Latency HUD:**
   Press `Ctrl+Shift+L` to verify steady 60 FPS, network RTT under 30ms, and estimated glass-to-glass latency under 50ms.
4. **Interactive Controls:**
   Test drag gestures, scroll wheel, physical keyboard typing, virtual D-pad toggle (`Alt+M`), and two-way clipboard.
5. **Kiosk Mode:**
   Launch Kiosk mode with DeskClock. Verify server-side Go input filter drops Home, Recents, and Power keycodes.
6. **Session Recording:**
   End session with recording checked. Open **"Watch Recording"** in the summary modal; verify smooth fMP4 seeking and download.

---

## 6. Production Operations, Observability & Maintenance

### Managing the DroidCanvas Service (`systemd`):
```bash
# Check service status
sudo systemctl status droidcanvas

# Restart backend service
sudo systemctl restart droidcanvas

# Follow live backend logs in real time
sudo journalctl -u droidcanvas -f

# Filter backend logs by error level
sudo journalctl -u droidcanvas -p err -n 50 --no-pager
```

### Managing Caddy Reverse Proxy & TLS:
```bash
# Check Caddy status
sudo systemctl status caddy

# Reload Caddy configuration after Caddyfile edits
sudo systemctl reload caddy

# Follow Caddy access and TLS certificate logs
sudo journalctl -u caddy -f
```

### Managing Containers & Ports:
```bash
# View active ephemeral Android containers
docker ps --filter "name=redroid-session"

# View active host ADB forwarding rules
adb forward --list

# Inspect database session states
sqlite3 /opt/android-browser-stream/backend/data/sessions.db \
  "SELECT id, status, adb_port, is_kiosk, created_at FROM sessions ORDER BY created_at DESC LIMIT 5;"
```

### Updating to Latest Code:
To pull new updates, rebuild assets, and restart services with zero downtime:
```bash
cd /opt/android-browser-stream
sudo git pull origin main
sudo ./deploy/deploy.sh
```
