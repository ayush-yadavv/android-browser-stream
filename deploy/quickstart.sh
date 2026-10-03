#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Turnkey 1-Command Cloud VM Installer & Orchestrator
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (x86_64)
# ==============================================================================

set -euo pipefail

TARGET_DOMAIN="${1:-}"
INSTALL_DIR="/opt/android-browser-stream"

if [ "$EUID" -ne 0 ]; then
    echo -e "\033[1;33m[!] This installer requires root/sudo privileges.\033[0m"
    exec sudo bash "$0" "$@"
fi

echo -e "\033[0;36m============================================================\033[0m"
echo -e "\033[1m  DroidCanvas Turnkey Cloud VM Bootstrapper                \033[0m"
echo -e "\033[0;36m============================================================\033[0m"

# 1. Install git & curl if missing
if ! command -v git &>/dev/null || ! command -v curl &>/dev/null; then
    echo "[*] Installing bootstrap tools (git, curl)..."
    apt-get update -y
    apt-get install -y git curl
fi

# 2. Clone or update repository in /opt/android-browser-stream
if [ -d "${INSTALL_DIR}/.git" ]; then
    echo "[*] Updating existing repository at ${INSTALL_DIR}..."
    cd "${INSTALL_DIR}"
    git pull origin main || true
else
    echo "[*] Cloning repository into ${INSTALL_DIR}..."
    mkdir -p /opt
    git clone https://github.com/ayush-yadavv/android-browser-stream.git "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"
fi

# 3. Ensure permissions and execute self-provisioning deployment runner
chmod +x deploy/*.sh scripts/*.sh 2>/dev/null || true

echo "[*] Launching deployment runner..."
./deploy/deploy.sh "${TARGET_DOMAIN}"
