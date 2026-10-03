#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Azure VM Provisioner (8 GB RAM)
# Target: Azure Ubuntu 24.04 LTS (Standard_B2s_v2 - 2 vCPU, 8 GiB RAM)
# Tested & Validated for: Azure for Students / Pay-As-You-Go
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration Defaults (Customizable via CLI or ENV)
RESOURCE_GROUP="${RESOURCE_GROUP:-droidcanvas-rg}"
LOCATION="${LOCATION:-koreacentral}"
VM_NAME="${VM_NAME:-droidcanvas-vm}"
VM_SIZE="${VM_SIZE:-Standard_B2s_v2}" # 2 vCPUs, 8 GB RAM (Permitted in subscription policy & quota)
IMAGE="${IMAGE:-Canonical:ubuntu-24_04-lts:server:latest}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
SSH_KEY_PUB="${SSH_KEY_PUB:-${HOME}/.ssh/id_rsa.pub}"
OS_DISK_SIZE_GB="${OS_DISK_SIZE_GB:-64}"

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  DroidCanvas - Azure 8 GB RAM VM Provisioning              ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "Resource Group : ${BOLD}${RESOURCE_GROUP}${NC}"
echo -e "Location       : ${BOLD}${LOCATION}${NC}"
echo -e "VM Name        : ${BOLD}${VM_NAME}${NC}"
echo -e "VM Size        : ${BOLD}${VM_SIZE}${NC} (2 vCPU, 8 GiB RAM)"
echo -e "OS Image       : ${BOLD}${IMAGE}${NC}"
echo -e "Admin Username : ${BOLD}${ADMIN_USER}${NC}"
echo -e "Public Key     : ${BOLD}${SSH_KEY_PUB}${NC}"
echo -e "OS Disk Size   : ${BOLD}${OS_DISK_SIZE_GB} GB${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

# 1. Check Azure CLI & Login
if ! command -v az &>/dev/null; then
    echo -e "${RED}[ERROR] Azure CLI (az) is not installed.${NC}"
    exit 1
fi

ACCOUNT_INFO=$(az account show -o json 2>/dev/null || true)
if [ -z "${ACCOUNT_INFO}" ]; then
    echo -e "${RED}[ERROR] Not logged in to Azure. Run 'az login' first.${NC}"
    exit 1
fi

SUB_NAME=$(echo "${ACCOUNT_INFO}" | jq -r '.name // "Unknown"')
echo -e "[*] Active Subscription: ${GREEN}${SUB_NAME}${NC}"

# 2. Check / Generate SSH Key
if [ ! -f "${SSH_KEY_PUB}" ]; then
    echo -e "${YELLOW}[!] Public key not found at ${SSH_KEY_PUB}. Generating new SSH keypair...${NC}"
    SSH_DIR=$(dirname "${SSH_KEY_PUB}")
    mkdir -p "${SSH_DIR}"
    ssh-keygen -t rsa -b 4096 -f "${SSH_DIR}/id_rsa" -N "" -C "droidcanvas-azure"
    echo -e "${GREEN}[OK] Generated new SSH key: ${SSH_KEY_PUB}${NC}"
fi

# 3. Create Resource Group if not exists
echo -e "[1/4] Ensuring Resource Group '${RESOURCE_GROUP}' in '${LOCATION}'..."
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" -o table

# 4. Create Virtual Machine
echo -e "[2/4] Provisioning VM '${VM_NAME}' (${VM_SIZE}, 8 GB RAM)..."
az vm create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${VM_NAME}" \
    --image "${IMAGE}" \
    --size "${VM_SIZE}" \
    --location "${LOCATION}" \
    --admin-username "${ADMIN_USER}" \
    --ssh-key-values "${SSH_KEY_PUB}" \
    --os-disk-size-gb "${OS_DISK_SIZE_GB}" \
    --public-ip-sku Standard \
    -o table

# 5. Open necessary ports (SSH: 22, HTTP: 80, HTTPS: 443, Backend: 8080)
echo -e "[3/4] Configuring Network Security Group rules for DroidCanvas..."
NSG_NAME="${VM_NAME}NSG"

az network nsg rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${NSG_NAME}" \
    --name Allow-SSH \
    --priority 1000 \
    --direction Inbound \
    --access Allow \
    --protocol Tcp \
    --source-address-prefixes '*' \
    --source-port-ranges '*' \
    --destination-address-prefixes '*' \
    --destination-port-ranges 22 \
    -o none || true

az network nsg rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${NSG_NAME}" \
    --name Allow-HTTP-HTTPS \
    --priority 1010 \
    --direction Inbound \
    --access Allow \
    --protocol Tcp \
    --source-address-prefixes '*' \
    --source-port-ranges '*' \
    --destination-address-prefixes '*' \
    --destination-port-ranges 80 443 \
    -o none || true

# Port 8080 is internal only and accessed securely via Caddy reverse proxy on 80/443

# 6. Retrieve Public IP Address
echo -e "[4/4] Retrieving VM Public IP address..."
PUBLIC_IP=$(az vm show -d -g "${RESOURCE_GROUP}" -n "${VM_NAME}" --query publicIps -o tsv)

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  VM Provisioned Successfully!                             ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "Public IP     : ${GREEN}${BOLD}${PUBLIC_IP}${NC}"
echo -e "SSH Connect   : ${BOLD}ssh ${ADMIN_USER}@${PUBLIC_IP}${NC}"
echo -e "Web App URL   : ${BOLD}http://${PUBLIC_IP}${NC}"
echo -e ""
echo -e "To configure & deploy DroidCanvas on the VM in one step:"
echo -e "${CYAN}rsync -avz --exclude '.git' --exclude 'frontend/node_modules' . ${ADMIN_USER}@${PUBLIC_IP}:/home/${ADMIN_USER}/android-browser-stream${NC}"
echo -e "${CYAN}ssh -t ${ADMIN_USER}@${PUBLIC_IP} 'cd /home/${ADMIN_USER}/android-browser-stream && sudo ./deploy/deploy.sh'${NC}"
echo -e "${CYAN}============================================================${NC}"
