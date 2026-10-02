#!/usr/bin/env bash

# Setup Native Docker Engine & Android Binder Module on Ubuntu Host
set -euo pipefail

# Ensure script is executed as root
if [ "$EUID" -ne 0 ]; then
    echo -e "\033[0;31m[ERROR] Please run this script with sudo:\033[0m"
    echo "  sudo bash $0"
    exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"

echo -e "\033[0;36m[1/6] Installing native Docker Engine (dockerd) & containerd...\033[0m"
apt-get update -y
apt-get install -y docker-ce containerd.io

echo -e "\033[0;36m[2/6] Enabling and starting Docker system service...\033[0m"
systemctl enable --now docker
systemctl is-active --quiet docker && echo -e "\033[0;32m[OK] Docker service is running on /var/run/docker.sock\033[0m"

echo -e "\033[0;36m[3/6] Adding user '${REAL_USER}' to 'docker' group...\033[0m"
usermod -aG docker "${REAL_USER}"

echo -e "\033[0;36m[4/6] Loading Android binder kernel module into host kernel...\033[0m"
modprobe binder_linux devices="binder,hwbinder,vndbinder"

# Persist binder module across reboots
echo "binder_linux" > /etc/modules-load.d/binder.conf
echo 'options binder_linux devices="binder,hwbinder,vndbinder"' > /etc/modprobe.d/binder.conf

echo -e "\033[0;36m[5/6] Mounting Android BinderFS and creating device symlinks...\033[0m"
mkdir -p /dev/binderfs
if ! grep -q " /dev/binderfs " /proc/mounts; then
    mount -t binder binder /dev/binderfs || true
fi

# Create symlinks under /dev if binder devices exist in /dev/binderfs
for dev in binder hwbinder vndbinder; do
    if [ -e "/dev/binderfs/${dev}" ]; then
        ln -sf "/dev/binderfs/${dev}" "/dev/${dev}"
    fi
done

# Persist binderfs mount in /etc/fstab
if ! grep -q "binder /dev/binderfs" /etc/fstab; then
    echo "binder /dev/binderfs binder nofail 0 0" >> /etc/fstab
fi

# Grant read/write access to binder devices, make binderfs traversable, and grant socket access
chmod 755 /dev/binderfs 2>/dev/null || true
chmod 666 /dev/binder* /dev/binderfs/* /var/run/docker.sock 2>/dev/null || true

echo -e "\033[0;32m[OK] Host Android Binder devices ready:\033[0m"
ls -la /dev/binder* /dev/binderfs/* 2>/dev/null || true

echo -e "\033[0;36m[6/6] Switching Docker context to default native host engine...\033[0m"
if sudo -u "${REAL_USER}" command -v docker >/dev/null 2>&1; then
    sudo -u "${REAL_USER}" docker context use default || true
fi

echo -e "\033[0;32m============================================================\033[0m"
echo -e "\033[0;32m  Native Docker Engine & Android Binder Successfully Setup! \033[0m"
echo -e "\033[0;32m============================================================\033[0m"
echo ""
echo "Next step: Run the project launcher:"
echo "  ./run_local.sh"
echo ""
