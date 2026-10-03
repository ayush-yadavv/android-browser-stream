#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Cloud VM Provisioning Script
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (x86_64 / amd64 with KVM)
# ==============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "=========================================================="
echo " Starting DroidCanvas Cloud VM Provisioning Setup         "
echo "=========================================================="

# 1. Update OS and install base dependencies
echo "[1/7] Installing base system dependencies and tools..."
sudo -E apt-get update -y
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
    android-tools-adb \
    ffmpeg

# 2. Kernel Module Configuration for Redroid (Android Binder IPC & BinderFS)
echo "[2/7] Configuring Android Binder Kernel Modules & BinderFS..."
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

# Mount Android BinderFS and create device symlinks
sudo mkdir -p /dev/binderfs
if ! grep -q " /dev/binderfs " /proc/mounts; then
    sudo mount -t binder binder /dev/binderfs || true
fi

for dev in binder hwbinder vndbinder; do
    if [ -e "/dev/binderfs/${dev}" ]; then
        sudo ln -sf "/dev/binderfs/${dev}" "/dev/${dev}"
    fi
done

if ! grep -q "binder /dev/binderfs" /etc/fstab; then
    sudo bash -c 'echo "binder /dev/binderfs binder nofail 0 0" >> /etc/fstab'
fi

sudo chmod 755 /dev/binderfs 2>/dev/null || true
sudo chmod 666 /dev/binder* /dev/binderfs/* 2>/dev/null || true

# 3. Install Docker Engine
echo "[3/7] Setting up Docker Engine..."
if ! command -v docker &> /dev/null; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ACTUAL_USER="${SUDO_USER:-$USER}"
    sudo usermod -aG docker "${ACTUAL_USER}"
    sudo systemctl enable --now docker
else
    echo "[+] Docker is already installed."
    ACTUAL_USER="${SUDO_USER:-$USER}"
    sudo usermod -aG docker "${ACTUAL_USER}" 2>/dev/null || true
fi

# Ensure docker socket has standard secure group permissions (least privilege)
if [ -S /var/run/docker.sock ]; then
    sudo chown root:docker /var/run/docker.sock 2>/dev/null || true
    sudo chmod 660 /var/run/docker.sock 2>/dev/null || true
fi

# 4. Pull Redroid Android 13 Image
echo "[4/7] Pulling redroid/redroid:13.0.0-latest..."
sudo docker pull redroid/redroid:13.0.0-latest

# 5. Install Node.js 20 LTS (for frontend building)
echo "[5/7] Verifying Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[+] Node.js is already installed: $(node -v)"
fi

# 6. Install Go 1.22+
echo "[6/7] Verifying Go toolchain..."
if ! command -v go &> /dev/null; then
    GO_VERSION="1.22.4"
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh >/dev/null
    sudo chmod +x /etc/profile.d/go.sh
    export PATH=$PATH:/usr/local/go/bin
    if [ -n "${SUDO_USER:-}" ] && [ -d "/home/${SUDO_USER}" ]; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> "/home/${SUDO_USER}/.bashrc"
    fi
else
    echo "[+] Go is already installed: $(go version)"
fi

# 7. Install Caddy (for automatic HTTPS and reverse proxying)
echo "[7/7] Setting up Caddy Reverse Proxy with Auto-TLS..."
if ! command -v caddy &> /dev/null; then
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
echo " DroidCanvas VM Provisioning Complete!                    "
echo " Next Steps:                                              "
echo " 1. Configure your domain in deploy/Caddyfile             "
echo " 2. Run the deployment script: sudo ./deploy/deploy.sh    "
echo " 3. Check health: curl http://127.0.0.1:8080/api/health   "
echo "=========================================================="
