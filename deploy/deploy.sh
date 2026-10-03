#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Cloud VM Deployment & Continuous Update Script
# Target: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  DroidCanvas Cloud VM Deployment & Update Runner           ${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Resolve project root directory and parameters
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOMAIN="${1:-${DOMAIN:-}}"
cd "${PROJECT_ROOT}"

echo -e "[*] Project root : ${PROJECT_ROOT}"
if [ -n "${DOMAIN}" ]; then
    echo -e "[*] Target Domain: ${BOLD:-}${DOMAIN}${NC}"
fi

# 2. Verify root/sudo privileges
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[!] This script requires root privileges to configure systemd and binder devices.${NC}"
    echo -e "${YELLOW}[!] Re-running with sudo...${NC}"
    exec sudo bash "$0" "$@"
fi

# 3. Check and auto-run VM provisioner if host environment is unprovisioned
if ! command -v docker &>/dev/null || ! command -v go &>/dev/null || ! command -v node &>/dev/null || ! command -v caddy &>/dev/null || [ ! -e /dev/binder ]; then
    echo -e "${YELLOW}[!] Host environment is missing essential dependencies or Binder devices.${NC}"
    echo -e "${YELLOW}[!] Automatically executing VM provisioner (deploy/setup-vm.sh)...${NC}"
    bash "${SCRIPT_DIR}/setup-vm.sh"
    [ -f /etc/profile.d/go.sh ] && . /etc/profile.d/go.sh || true
    export PATH=$PATH:/usr/local/go/bin
fi

# 4. Verify Docker & Binder devices
echo -e "[1/7] Checking Docker Engine and Binder IPC devices..."
systemctl is-active --quiet docker || systemctl start docker

if ! grep -q " /dev/binderfs " /proc/mounts; then
    echo -e "${YELLOW}[!] Mounting /dev/binderfs...${NC}"
    mkdir -p /dev/binderfs
    mount -t binder binder /dev/binderfs || true
fi

for dev in binder hwbinder vndbinder; do
    if [ -e "/dev/binderfs/${dev}" ] && [ ! -e "/dev/${dev}" ]; then
        ln -sf "/dev/binderfs/${dev}" "/dev/${dev}"
    fi
done

chmod 755 /dev/binderfs 2>/dev/null || true
chmod 666 /dev/binder* /dev/binderfs/* 2>/dev/null || true
# Ensure Docker socket permissions follow least privilege (group-accessible)
if [ -S /var/run/docker.sock ]; then
    chown root:docker /var/run/docker.sock 2>/dev/null || true
    chmod 660 /var/run/docker.sock 2>/dev/null || true
fi

# 4. Verify scrcpy-server asset
echo -e "[2/7] Verifying scrcpy-server v2.7 asset..."
mkdir -p "${PROJECT_ROOT}/backend/bin"
SCRCPY_BIN="${PROJECT_ROOT}/backend/bin/scrcpy-server"
if [ ! -f "${SCRCPY_BIN}" ]; then
    echo -e "${YELLOW}[!] Downloading scrcpy-server v2.7...${NC}"
    wget -q "https://github.com/Genymobile/scrcpy/releases/download/v2.7/scrcpy-server-v2.7" -O "${SCRCPY_BIN}"
    chmod +x "${SCRCPY_BIN}"
fi

# 5. Build React Frontend SPA
echo -e "[3/7] Building React Frontend SPA..."
cd "${PROJECT_ROOT}/frontend"
if [ -f "package-lock.json" ]; then
    npm ci --silent
else
    npm install --silent
fi
npm run build
echo -e "${GREEN}[OK] Frontend built successfully: ${PROJECT_ROOT}/frontend/dist${NC}"

# 6. Build Go Backend Service Binary
echo -e "[4/7] Compiling Go Backend Service..."
cd "${PROJECT_ROOT}/backend"
go build -ldflags="-w -s" -o server ./cmd/server
echo -e "${GREEN}[OK] Backend binary compiled: ${PROJECT_ROOT}/backend/server${NC}"

# 7. Configure and install systemd unit
echo -e "[5/7] Installing systemd service (droidcanvas.service)..."
SERVICE_SRC="${PROJECT_ROOT}/deploy/droidcanvas.service"
SERVICE_DEST="/etc/systemd/system/droidcanvas.service"

# Dynamically patch paths if project root is not /opt/android-browser-stream
sed "s|/opt/android-browser-stream|${PROJECT_ROOT}|g" "${SERVICE_SRC}" > "${SERVICE_DEST}"
systemctl daemon-reload
systemctl enable droidcanvas
systemctl restart droidcanvas
echo -e "${GREEN}[OK] droidcanvas.service started and enabled on boot.${NC}"

# 8. Configure Caddy reverse proxy
echo -e "[6/7] Updating Caddy configuration..."
CADDYFILE_DEST="/etc/caddy/Caddyfile"
mkdir -p /etc/caddy

# Dynamically inject frontend dist path
sed "s|/srv/frontend/dist|${PROJECT_ROOT}/frontend/dist|g" "${PROJECT_ROOT}/deploy/Caddyfile" > "${CADDYFILE_DEST}"

# Dynamically inject domain if provided
if [ -n "${DOMAIN}" ]; then
    echo -e "[*] Configuring Caddy with Let's Encrypt TLS for domain: ${DOMAIN}"
    sed -i "s|{\$DOMAIN:localhost}|${DOMAIN}|g" "${CADDYFILE_DEST}"
fi

if systemctl is-active --quiet caddy; then
    systemctl reload caddy
    echo -e "${GREEN}[OK] Caddy reloaded.${NC}"
else
    systemctl enable --now caddy
    echo -e "${GREEN}[OK] Caddy started.${NC}"
fi

# 9. Healthcheck verification
echo -e "[7/7] Verifying backend health..."
sleep 2
HEALTH_RESP=$(curl -s http://127.0.0.1:8080/api/health || true)
if echo "${HEALTH_RESP}" | grep -qE '"status":"(healthy|ok)"'; then
    echo -e "${GREEN}[OK] DroidCanvas backend is healthy: ${HEALTH_RESP}${NC}"
else
    echo -e "${RED}[ERROR] Health check failed: ${HEALTH_RESP:-No response from backend}${NC}"
    echo -e "${YELLOW}Check logs via: sudo journalctl -u droidcanvas -n 30 --no-pager${NC}"
    exit 1
fi

echo -e "${CYAN}============================================================${NC}"
echo -e "${GREEN}  DroidCanvas Deployment Complete!                          ${NC}"
echo -e "${CYAN}============================================================${NC}"
if [ -n "${DOMAIN}" ]; then
    echo -e "Web App URL    : ${GREEN}${BOLD}https://${DOMAIN}${NC}"
else
    echo -e "Web App URL    : ${GREEN}${BOLD}http://localhost${NC} (or configure https://<your-domain>)"
fi
echo -e "Service Status : sudo systemctl status droidcanvas"
echo -e "Stream Logs    : sudo journalctl -u droidcanvas -f"
echo -e "Proxy Logs     : sudo journalctl -u caddy -f"
echo -e "Active Devices : docker ps"
