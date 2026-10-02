#!/usr/bin/env bash
# ==============================================================================
# Cloud VM Provisioning Script for Real-Time Android Browser Streaming
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (x86_64 / amd64 with KVM)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting Android-in-Cloud (AIC) VM Provisioning Setup   "
echo "=========================================================="

# 1. Update OS and install base dependencies
sudo apt-get update -y
sudo apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    build-essential \
    pkg-config \
    ca-certificates \
    gnupg \
    lsb-release \
    android-tools-adb

# 2. Kernel Module Configuration for Redroid (Android Binder IPC)
echo "[+] Configuring Android Binder Kernel Modules..."
KERNEL_VER=$(uname -r)
sudo apt-get install -y "linux-modules-extra-${KERNEL_VER}" || true

# Load binder_linux with multiple binder devices
sudo modprobe binder_linux devices="binder,hwbinder,vndbinder" || true

# Older kernels (5.15) support ashmem; 5.18+ (e.g. 6.8 on Ubuntu 24.04) use memfd
if modinfo ashmem_linux >/dev/null 2>&1; then
    sudo modprobe ashmem_linux || true
    echo "ashmem_linux loaded"
else
    echo "ashmem_linux not available; Redroid will use memfd (androidboot.use_memfd=1)"
fi

# Persist modules across VM reboots
sudo bash -c 'cat <<EOF > /etc/modules-load.d/redroid.conf
binder_linux
EOF'
sudo bash -c 'echo "options binder_linux devices=\"binder,hwbinder,vndbinder\"" > /etc/modprobe.d/redroid.conf'

# 3. Install Docker Engine
if ! command -v docker &> /dev/null; then
    echo "[+] Installing Docker Engine..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    sudo systemctl enable --now docker
else
    echo "[+] Docker is already installed."
fi

# 4. Pull Redroid Android 13 Image
echo "[+] Pulling redroid/redroid:13.0.0-latest (this may take a few minutes)..."
sudo docker pull redroid/redroid:13.0.0-latest

# 5. Install Node.js 20 LTS (for frontend building)
if ! command -v node &> /dev/null; then
    echo "[+] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[+] Node.js is already installed: $(node -v)"
fi

# 6. Install Go 1.22+
if ! command -v go &> /dev/null; then
    echo "[+] Installing Go..."
    GO_VERSION="1.22.4"
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> "$HOME/.bashrc"
    export PATH=$PATH:/usr/local/go/bin
else
    echo "[+] Go is already installed: $(go version)"
fi

# 7. Install Caddy (for automatic HTTPS and reverse proxying)
if ! command -v caddy &> /dev/null; then
    echo "[+] Installing Caddy Server..."
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt-get update -y
    sudo apt-get install -y caddy
    sudo systemctl enable caddy
else
    echo "[+] Caddy is already installed."
fi

echo "=========================================================="
echo " VM Provisioning Complete!                               "
echo " Next Steps:                                              "
echo " 1. Clone repository to /opt/android-browser-stream       "
echo " 2. Build frontend: cd frontend && npm ci && npm run build"
echo " 3. Build backend: cd backend && go build -o server ./cmd/server"
echo " 4. Configure /etc/caddy/Caddyfile with your domain       "
echo "=========================================================="
