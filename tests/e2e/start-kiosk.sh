#!/bin/bash

# Script to start Kiosk dev server for E2E tests

set -e

KIOSK_DIR="../../web/kiosk"
KIOSK_URL="http://localhost:5175"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Kiosk dev server for E2E tests...${NC}"

# Function to check if a URL is responding
check_server() {
    local url=$1
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
        if [ $((attempt % 5)) -eq 0 ]; then
            echo -e "${YELLOW}  Still waiting for server... (${attempt}s)${NC}"
        fi
    done
    return 1
}

# Start Kiosk server
echo -e "${YELLOW}Starting Kiosk UI server...${NC}"
cd "$KIOSK_DIR"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Kiosk dependencies...${NC}"
    npm install > /tmp/djamms-kiosk-install.log 2>&1
fi

# Check if already running
if lsof -Pi :5175 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Kiosk server already running on port 5175${NC}"
    exit 0
fi

npx vite > /tmp/djamms-kiosk-server.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk server PID: $KIOSK_PID"

# Wait for server to be ready
echo -e "${YELLOW}Waiting for Kiosk server to be ready...${NC}"

if check_server "$KIOSK_URL"; then
    echo -e "${GREEN}✓ Kiosk server is ready at $KIOSK_URL${NC}"
    echo "Kiosk PID: $KIOSK_PID"
    echo "Logs: /tmp/djamms-kiosk-server.log"
    exit 0
else
    echo -e "${RED}✗ Kiosk server failed to start${NC}"
    echo "Check logs: /tmp/djamms-kiosk-server.log"
    exit 1
fi



