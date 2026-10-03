#!/usr/bin/env bash

# ==============================================================================
# DroidCanvas — Ephemeral Cloud-Native Android Streaming Engine
# Automated Latency Benchmark & Glass-to-Glass Profiler (CR-3)
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKEND_URL="http://localhost:8080"
WS_BASE_URL="ws://localhost:8080"
SAMPLES=100
SESSION_ID=""
AUTO_CREATED_SESSION=false

# ANSI styling
BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
CYAN="\033[36m"
RED="\033[31m"
RESET="\033[0m"

function print_usage() {
    echo -e "${BOLD}Usage:${RESET} $0 [options]"
    echo ""
    echo "Options:"
    echo "  --session <id>       Benchmark specific active session ID"
    echo "  --samples <num>      Number of microsecond RTT ping samples (default: 100)"
    echo "  --url <backend-url>  Backend HTTP base URL (default: http://localhost:8080)"
    echo "  --create             Automatically create a temporary session if none active"
    echo "  --help, -h           Show this help message"
    echo ""
}

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --session)
            SESSION_ID="$2"
            shift 2
            ;;
        --samples)
            SAMPLES="$2"
            shift 2
            ;;
        --url)
            BACKEND_URL="$2"
            shift 2
            ;;
        --create)
            AUTO_CREATED_SESSION=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${RESET}"
            print_usage
            exit 1
            ;;
    esac
done

echo -e "${CYAN}======================================================================${RESET}"
echo -e "${BOLD}  DroidCanvas Automated Latency Benchmarking Suite (CR-3)${RESET}"
echo -e "${CYAN}======================================================================${RESET}"

# 1. Healthcheck
echo -e "${BLUE}▶ Checking backend service status at ${BACKEND_URL}/api/health...${RESET}"
if ! curl -sf "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
    echo -e "${RED}✘ Error: Go backend service is not reachable at ${BACKEND_URL}.${RESET}"
    echo "  Please start the backend service first via: cd backend && go run ./cmd/server"
    echo "  Or run: ./run_local.sh"
    exit 1
fi
echo -e "${GREEN}✔ Backend service is healthy.${RESET}"

# 2. Find or create session
if [[ -z "${SESSION_ID}" ]]; then
    echo -e "${BLUE}▶ Discovering active streaming sessions...${RESET}"
    SESSIONS_JSON=$(curl -sf "${BACKEND_URL}/api/sessions" || echo "[]")
    SESSION_COUNT=$(echo "${SESSIONS_JSON}" | jq '. | length' 2>/dev/null || echo "0")

    if [[ "${SESSION_COUNT}" -gt 0 ]]; then
        # Pick the first active session
        SESSION_ID=$(echo "${SESSIONS_JSON}" | jq -r '.[0].id')
        echo -e "${GREEN}✔ Found active session: ${BOLD}${SESSION_ID}${RESET}"
    elif [[ "${AUTO_CREATED_SESSION}" == "true" ]]; then
        echo -e "${YELLOW}▶ No active session found. Creating a temporary benchmarking session...${RESET}"
        CREATE_RESP=$(curl -sf -X POST "${BACKEND_URL}/api/sessions" -H "Content-Type: application/json" -d '{}')
        SESSION_ID=$(echo "${CREATE_RESP}" | jq -r '.id')
        echo -e "${GREEN}✔ Created temporary benchmarking session: ${BOLD}${SESSION_ID}${RESET}"
        echo -e "${BLUE}▶ Waiting 3 seconds for redroid container stabilization...${RESET}"
        sleep 3
    else
        echo -e "${YELLOW}✘ No active session found.${RESET}"
        echo "  Pass an active session via '--session <id>' or use '--create' to automatically provision one."
        exit 1
    fi
fi

# Cleanup trap for auto-created sessions
cleanup() {
    if [[ "${AUTO_CREATED_SESSION}" == "true" && -n "${SESSION_ID}" ]]; then
        echo -e "\n${YELLOW}▶ Cleaning up temporary benchmarking session ${SESSION_ID}...${RESET}"
        curl -sf -X DELETE "${BACKEND_URL}/api/sessions/${SESSION_ID}" > /dev/null 2>&1 || true
        echo -e "${GREEN}✔ Temporary session destroyed.${RESET}"
    fi
}
trap cleanup EXIT INT TERM

# 3. Locate ADB port
ADB_DEVICE=""
if command -v adb > /dev/null 2>&1; then
    ACTIVE_DEVICES=$(adb devices | grep -E "localhost:[0-9]+" | head -n 1 | awk '{print $1}')
    if [[ -n "${ACTIVE_DEVICES}" ]]; then
        ADB_DEVICE="${ACTIVE_DEVICES}"
        echo -e "${GREEN}✔ Detected ADB target for SurfaceFlinger profiling: ${BOLD}${ADB_DEVICE}${RESET}"
        echo -e "${CYAN}▶ Launching AOSP DeskClock stopwatch for Visual Loopback verification...${RESET}"
        adb -s "${ADB_DEVICE}" shell am start -n com.android.deskclock/.DeskClock > /dev/null 2>&1 || true
    fi
fi

# 4. Execute Benchmark Probe
WS_STREAM_URL="ws://${BACKEND_URL#*://}/api/sessions/${SESSION_ID}/stream"
echo -e "\n${BLUE}▶ Launching high-frequency telemetry probe against: ${BOLD}${WS_STREAM_URL}${RESET}"

NODE_CMD=(node "${PROJECT_ROOT}/scripts/benchmark_probe.cjs" --url "${WS_STREAM_URL}" --samples "${SAMPLES}")
if [[ -n "${ADB_DEVICE}" ]]; then
    NODE_CMD+=(--adb "${ADB_DEVICE}")
fi

"${NODE_CMD[@]}"

echo -e "${GREEN}✔ Benchmark execution complete!${RESET}"
