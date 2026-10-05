#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Azure VM Teardown & Decommission Script
# Dismantles all resources in droidcanvas-rg so zero further charges are incurred.
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

RESOURCE_GROUP="${RESOURCE_GROUP:-droidcanvas-rg}"

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  DroidCanvas - Azure VM & Resource Dismantler              ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "Target Resource Group : ${BOLD}${RESOURCE_GROUP}${NC}"
echo -e "${CYAN}------------------------------------------------------------${NC}"

if ! command -v az &>/dev/null; then
    echo -e "${RED}[ERROR] Azure CLI (az) is not installed.${NC}"
    exit 1
fi

ACCOUNT_INFO=$(az account show -o json 2>/dev/null || true)
if [ -z "${ACCOUNT_INFO}" ]; then
    echo -e "${RED}[ERROR] Not logged in to Azure. Run 'az login' first.${NC}"
    exit 1
fi

if ! az group exists --name "${RESOURCE_GROUP}" | grep -q "true"; then
    echo -e "${YELLOW}[*] Resource group '${RESOURCE_GROUP}' does not exist or has already been deleted.${NC}"
    exit 0
fi

echo -e "${YELLOW}[!] Deleting resource group '${RESOURCE_GROUP}' and all contained resources (VM, disks, IPs, NICs)...${NC}"
az group delete --name "${RESOURCE_GROUP}" --yes --no-wait

echo -e "[*] Waiting for resource group deletion to complete..."
az group wait --name "${RESOURCE_GROUP}" --deleted

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${GREEN}  All resources successfully dismantled! Zero billing remains. ${NC}"
echo -e "${CYAN}============================================================${NC}"
