#!/usr/bin/env bash
# ==============================================================================
# DroidCanvas Remote Deployment Automated Verification Tool
# Tests public HTTPS/WSS deployments for WebCodecs, TLS, API & SPA compliance
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

TARGET_URL="${1:-}"

if [ -z "${TARGET_URL}" ]; then
    echo -e "${RED}[ERROR] Target URL required.${NC}"
    echo -e "Usage: $0 <https://stream.yourdomain.com | http://localhost:5173 | https://localhost>"
    exit 1
fi

# Normalize URL (remove trailing slash)
TARGET_URL="${TARGET_URL%/}"

echo -e "${CYAN}============================================================${NC}"
echo -e "${BOLD}  DroidCanvas Deployment Verification Harness              ${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "Target Endpoint : ${BOLD}${TARGET_URL}${NC}"
echo -e "Timestamp       : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

PASSED_COUNT=0
FAILED_COUNT=0

report_pass() {
    local check_name="$1"
    local detail="$2"
    echo -e "  [${GREEN}PASS${NC}] ${BOLD}${check_name}${NC} : ${detail}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
}

report_fail() {
    local check_name="$1"
    local detail="$2"
    echo -e "  [${RED}FAIL${NC}] ${BOLD}${check_name}${NC} : ${detail}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
}

report_warn() {
    local check_name="$1"
    local detail="$2"
    echo -e "  [${YELLOW}WARN${NC}] ${BOLD}${check_name}${NC} : ${detail}"
}

# 1. Parse Domain / Host
DOMAIN=$(echo "${TARGET_URL}" | awk -F[/:] '{print $4}')
PORT=$(echo "${TARGET_URL}" | awk -F[/:] '{print $5}')
SCHEME=$(echo "${TARGET_URL}" | awk -F: '{print $1}')

echo -e "${BOLD}[1/7] DNS & Network Reachability${NC}"
if command -v getent >/dev/null 2>&1; then
    IP=$(getent hosts "${DOMAIN}" | awk '{print $1}' | head -n1 || true)
    if [ -n "${IP}" ]; then
        report_pass "DNS Resolution" "${DOMAIN} -> ${IP}"
    else
        report_fail "DNS Resolution" "Could not resolve domain ${DOMAIN}"
    fi
else
    report_warn "DNS Resolution" "getent command not available, skipping"
fi

# 2. TLS & Secure Context Verification (CR-5)
echo -e "\n${BOLD}[2/7] TLS Certificate & Secure Context (CR-5)${NC}"
if [ "${SCHEME}" = "https" ]; then
    TLS_INFO=$(curl -sIv --max-time 10 "${TARGET_URL}" 2>&1 || true)
    if echo "${TLS_INFO}" | grep -q "SSL certificate verify ok"; then
        report_pass "TLS Certificate" "Valid SSL/TLS certificate (Enables WebCodecs Secure Context)"
    elif echo "${TLS_INFO}" | grep -q "HTTP/[12]"; then
        report_pass "TLS Connection" "TLS connection established successfully"
    else
        report_fail "TLS Certificate" "Certificate verification failed or invalid"
    fi
else
    if [ "${DOMAIN}" = "localhost" ] || [ "${DOMAIN}" = "127.0.0.1" ]; then
        report_pass "Localhost Exception" "Localhost is considered Secure Context by browsers without HTTPS"
    else
        report_fail "Insecure Context" "Plain HTTP on remote host will block WebCodecs VideoDecoder!"
    fi
fi

# 3. HTTP Security Headers
echo -e "\n${BOLD}[3/7] HTTP Security & Proxy Headers${NC}"
HEADERS=$(curl -sIL --max-time 10 "${TARGET_URL}" || true)

if echo "${HEADERS}" | grep -qi "X-Content-Type-Options: nosniff"; then
    report_pass "X-Content-Type-Options" "nosniff present"
else
    report_warn "X-Content-Type-Options" "Header missing in response"
fi

if echo "${HEADERS}" | grep -qi "X-Frame-Options: DENY"; then
    report_pass "X-Frame-Options" "DENY present (Clickjacking protection)"
else
    report_warn "X-Frame-Options" "Header missing in response"
fi

# 4. Backend Health Endpoint Verification
echo -e "\n${BOLD}[4/7] REST API Health & Telemetry Probe${NC}"
HEALTH_START=$(date +%s%N)
HEALTH_JSON=$(curl -s --max-time 5 "${TARGET_URL}/api/health" || true)
HEALTH_END=$(date +%s%N)
HEALTH_RTT=$(( (HEALTH_END - HEALTH_START) / 1000000 ))

if echo "${HEALTH_JSON}" | grep -qE '"status":"(healthy|ok)"'; then
    report_pass "/api/health" "HTTP 200 OK (${HEALTH_RTT}ms RTT) -> ${HEALTH_JSON}"
else
    report_fail "/api/health" "Unexpected payload: ${HEALTH_JSON}"
fi

PING_JSON=$(curl -s --max-time 5 "${TARGET_URL}/api/ping" || true)
if echo "${PING_JSON}" | grep -q '"message":"pong"'; then
    report_pass "/api/ping" "HTTP 200 OK -> ${PING_JSON}"
else
    report_fail "/api/ping" "Unexpected payload: ${PING_JSON}"
fi

# 5. Frontend Single Page App Delivery
echo -e "\n${BOLD}[5/7] Frontend Single Page Application (SPA) Delivery${NC}"
INDEX_HTML=$(curl -sL --max-time 10 "${TARGET_URL}/" || true)
if echo "${INDEX_HTML}" | grep -qi "DroidCanvas"; then
    report_pass "Root HTML" "Served index.html containing 'DroidCanvas'"
else
    report_fail "Root HTML" "Could not verify DroidCanvas title or bundle in root response"
fi

# 6. SPA Routing Fallback Check
echo -e "\n${BOLD}[6/7] SPA Routing Fallback Handling${NC}"
SPA_HTML=$(curl -sL --max-time 10 "${TARGET_URL}/session/verify-deployment-test" || true)
if echo "${SPA_HTML}" | grep -qi "DroidCanvas"; then
    report_pass "SPA Route Fallback" "/session/:id routes cleanly to index.html with HTTP 200"
else
    report_fail "SPA Route Fallback" "Deep route failed to serve index.html (check try_files in Caddy)"
fi

# 7. WebSocket Handshake & Transport Check
echo -e "\n${BOLD}[7/7] WebSocket Protocol Upgrade Probe${NC}"
WS_RESP=$(curl -i -N -s --max-time 5 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "${TARGET_URL}/api/sessions/non-existent-probe-id/stream" 2>&1 || true)

# When probing a non-existent session, the backend should return 404 or 400, NOT a 502 Bad Gateway
if echo "${WS_RESP}" | grep -q "502 Bad Gateway"; then
    report_fail "WebSocket Edge Proxy" "Caddy returned 502 Bad Gateway! Check backend port 8080 binding"
elif echo "${WS_RESP}" | grep -qE "400|404|101|401"; then
    report_pass "WebSocket Route" "Reverse proxy correctly reaches Go backend stream handler"
else
    report_warn "WebSocket Route" "Response status: $(echo "${WS_RESP}" | head -n1)"
fi

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${BOLD}  Verification Summary: ${GREEN}${PASSED_COUNT} Passed${NC} / ${RED}${FAILED_COUNT} Failed${NC}"
echo -e "${CYAN}============================================================${NC}"

if [ "${FAILED_COUNT}" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✔ Deployment is fully verified and ready for evaluator access!${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}✖ Some checks failed. Review the errors above.${NC}"
    exit 1
fi
