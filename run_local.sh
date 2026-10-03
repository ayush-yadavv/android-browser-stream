#!/usr/bin/env bash

# HealthTick Real-Time Android Browser Stream - Local Runner
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
SCRCPY_BIN="${BACKEND_DIR}/bin/scrcpy-server"
REDROID_IMAGE="${REDROID_IMAGE:-redroid/redroid:13.0.0-latest}"

# Colors
C_RESET='\033[0m'
C_CYAN='\033[0;36m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_RED='\033[0;31m'
C_BOLD='\033[1m'

log_info() { echo -e "${C_CYAN}[INFO]${C_RESET} $*"; }
log_ok()   { echo -e "${C_GREEN}[OK]${C_RESET}   $*"; }
log_warn() { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
log_err()  { echo -e "${C_RED}[ERR]${C_RESET}  $*"; }

echo -e "${C_BOLD}====================================================${C_RESET}"
echo -e "${C_BOLD}  HealthTick · Android-in-Cloud Browser Stream     ${C_RESET}"
echo -e "${C_BOLD}====================================================${C_RESET}"

# 1. Dependency checks
log_info "Verifying development toolchains..."

command -v go >/dev/null 2>&1 || { log_err "Go is required but not installed."; exit 1; }
log_ok "Go $(go version | awk '{print $3}') found"

command -v node >/dev/null 2>&1 || { log_err "Node.js is required but not installed."; exit 1; }
log_ok "Node $(node -v) found"

command -v npm >/dev/null 2>&1 || { log_err "npm is required but not installed."; exit 1; }
log_ok "npm $(npm -v) found"

command -v adb >/dev/null 2>&1 || { log_warn "ADB is not found in PATH. Container ADB connections may require host adb."; }

# Check Docker and auto-detect socket (Docker Desktop, rootless, or system)
if command -v docker >/dev/null 2>&1; then
    if [ -z "${DOCKER_HOST:-}" ]; then
        if [ -S "/var/run/docker.sock" ] && docker -H "unix:///var/run/docker.sock" info >/dev/null 2>&1; then
            export DOCKER_HOST="unix:///var/run/docker.sock"
            docker context use default >/dev/null 2>&1 || true
            log_ok "Using native Linux host Docker daemon (/var/run/docker.sock)"
        else
            DETECTED_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)
            if [ -n "${DETECTED_HOST}" ]; then
                export DOCKER_HOST="${DETECTED_HOST}"
                log_info "Detected active Docker host: ${DOCKER_HOST}"
            elif [ -S "${HOME}/.docker/desktop/docker.sock" ]; then
                export DOCKER_HOST="unix://${HOME}/.docker/desktop/docker.sock"
                log_info "Detected Docker Desktop socket: ${DOCKER_HOST}"
            fi
        fi
    fi

    # Auto-fix permissions on /var/run/docker.sock if non-interactive sudo is available
    if [ -S "/var/run/docker.sock" ] && ! docker -H "unix:///var/run/docker.sock" info >/dev/null 2>&1; then
        if sudo -n true 2>/dev/null; then
            log_info "Configuring permissions on /var/run/docker.sock..."
            sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
        fi
    fi

    # Check for Android Binder IPC module on host (auto-link if non-interactive sudo available)
    if [ ! -e /dev/binder ] || [ ! -e /dev/hwbinder ] || [ ! -e /dev/vndbinder ]; then
        if sudo -n true 2>/dev/null; then
            if [ -d /dev/binderfs ]; then
                log_info "Creating Android binder device symlinks from /dev/binderfs..."
                sudo chmod 755 /dev/binderfs 2>/dev/null || true
                for dev in binder hwbinder vndbinder; do
                    if [ -e "/dev/binderfs/${dev}" ]; then
                        sudo ln -sf "/dev/binderfs/${dev}" "/dev/${dev}" 2>/dev/null || true
                        sudo chmod 666 "/dev/binderfs/${dev}" "/dev/${dev}" 2>/dev/null || true
                    fi
                done
            elif grep -q binder /proc/filesystems; then
                log_info "Mounting Android binderfs on /dev/binderfs..."
                sudo mkdir -p /dev/binderfs 2>/dev/null || true
                sudo mount -t binder binder /dev/binderfs 2>/dev/null || true
                sudo chmod 755 /dev/binderfs 2>/dev/null || true
                for dev in binder hwbinder vndbinder; do
                    sudo ln -sf "/dev/binderfs/${dev}" "/dev/${dev}" 2>/dev/null || true
                    sudo chmod 666 "/dev/binderfs/${dev}" "/dev/${dev}" 2>/dev/null || true
                done
            fi
        fi
    fi

    if [ -e /dev/binder ]; then
        log_ok "Android binder IPC devices detected (/dev/binder)"
    else
        log_warn "Android binder IPC devices NOT detected (/dev/binder)."
        log_info "Run: sudo bash scripts/install-native-docker.sh to load and mount binder_linux"
    fi

    if docker info >/dev/null 2>&1; then
        log_ok "Docker daemon is active and responsive"
        if ! docker image inspect "${REDROID_IMAGE}" >/dev/null 2>&1; then
            log_info "Redroid image '${REDROID_IMAGE}' is not cached locally. Pulling automatically..."
            docker pull "${REDROID_IMAGE}"
            log_ok "Redroid image '${REDROID_IMAGE}' downloaded successfully"
        else
            log_ok "Redroid image '${REDROID_IMAGE}' is ready locally"
        fi
    else
        log_warn "Docker is installed but daemon is inactive (container provisioning will require starting dockerd or Docker Desktop)"
    fi
else
    log_warn "Docker not detected on host."
fi

# 2. Free dangling processes on target ports (8080 and 5173)
if command -v lsof >/dev/null 2>&1; then
    if lsof -i :8080 -t >/dev/null 2>&1; then
        log_info "Port 8080 is in use. Terminating existing process..."
        kill -9 $(lsof -i :8080 -t) 2>/dev/null || true
        sleep 0.5
    fi
    if lsof -i :5173 -t >/dev/null 2>&1; then
        log_info "Port 5173 is in use. Terminating existing process..."
        kill -9 $(lsof -i :5173 -t) 2>/dev/null || true
        sleep 0.5
    fi
fi

# 3. Ensure data and binary directories exist
mkdir -p "${ROOT_DIR}/data"
mkdir -p "${BACKEND_DIR}/bin"

if [ ! -s "${SCRCPY_BIN}" ]; then
    log_info "scrcpy-server v2.7 binary not found. Downloading..."
    curl -L -o "${SCRCPY_BIN}" "https://github.com/Genymobile/scrcpy/releases/download/v2.7/scrcpy-server-v2.7"
    chmod +x "${SCRCPY_BIN}"
    log_ok "Downloaded scrcpy-server v2.7"
else
    log_ok "scrcpy-server v2.7 present in backend/bin"
fi

# 4. Ensure frontend dependencies installed
if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
    log_info "Installing frontend node dependencies..."
    (cd "${FRONTEND_DIR}" && npm install)
    log_ok "Frontend packages installed"
fi

# Setup cleanup traps
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    exit_code=$?
    trap - INT TERM EXIT
    echo ""
    log_info "Shutting down local services..."
    if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        log_info "Stopping Go backend (PID ${BACKEND_PID})..."
        kill -TERM "${BACKEND_PID}" 2>/dev/null || true
        wait "${BACKEND_PID}" 2>/dev/null || true
    fi

    if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        log_info "Stopping Vite frontend (PID ${FRONTEND_PID})..."
        kill -TERM "${FRONTEND_PID}" 2>/dev/null || true
        wait "${FRONTEND_PID}" 2>/dev/null || true
    fi
    log_ok "All services stopped cleanly. Goodbye!"
    exit "${exit_code}"
}

trap cleanup INT TERM EXIT

# 4. Start Go Backend
log_info "Starting Go backend server on port 8080..."
export SERVER_PORT=8080
export DB_PATH="${ROOT_DIR}/data/sessions.db"
export SCRCPY_BIN_PATH="${SCRCPY_BIN}"
export REDROID_IMAGE="redroid/redroid:13.0.0-latest"
export MAX_SESSIONS=3
export ADB_PORT_START=5555
export PREWARMED_POOL_SIZE="${PREWARMED_POOL_SIZE:-0}"
export PATH="${BACKEND_DIR}/bin:${PATH}"

(cd "${BACKEND_DIR}" && go run cmd/server/main.go) &
BACKEND_PID=$!

# Wait for backend health probe
log_info "Waiting for backend health probe on http://localhost:8080/api/health..."
HEALTHY=0
for i in {1..30}; do
    if curl -s http://localhost:8080/api/health | grep -q "healthy"; then
        HEALTHY=1
        break
    fi
    sleep 0.5
done

if [ "${HEALTHY}" -eq 1 ]; then
    log_ok "Go backend is healthy!"
else
    log_err "Go backend failed to respond within 15 seconds."
    exit 1
fi

# 5. Start Vite Frontend
log_info "Starting React + Vite frontend dev server..."
(cd "${FRONTEND_DIR}" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo -e "${C_GREEN}${C_BOLD}✔ Local environment is live!${C_RESET}"
echo -e "  • Frontend UI: ${C_CYAN}http://localhost:5173${C_RESET}"
echo -e "  • Backend API: ${C_CYAN}http://localhost:8080/api/health${C_RESET}"
echo -e "  • REST Docs:   ${C_CYAN}http://localhost:8080/api/sessions${C_RESET}"
echo ""
echo -e "${C_YELLOW}Press Ctrl+C to terminate both servers.${C_RESET}"
echo ""

# Wait for background processes
wait
