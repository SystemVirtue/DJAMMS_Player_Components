#!/bin/bash

# Script to start Admin and Kiosk dev servers for E2E tests
# Starts both servers in background and waits for them to be ready

set -e

ADMIN_DIR="../../web/admin"
KIOSK_DIR="../../web/kiosk"
ADMIN_URL="http://localhost:5176"
KIOSK_URL="http://localhost:5175"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting dev servers for E2E tests...${NC}"

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

# Start Admin server
echo -e "${YELLOW}Starting Admin UI server...${NC}"
cd "$ADMIN_DIR"
# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Admin dependencies...${NC}"
    npm install > /tmp/djamms-admin-install.log 2>&1
fi
npx vite > /tmp/djamms-admin-server.log 2>&1 &
ADMIN_PID=$!
echo "Admin server PID: $ADMIN_PID"

# Start Kiosk server
echo -e "${YELLOW}Starting Kiosk UI server...${NC}"
cd "$KIOSK_DIR"
# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Kiosk dependencies...${NC}"
    npm install > /tmp/djamms-kiosk-install.log 2>&1
fi
npx vite > /tmp/djamms-kiosk-server.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk server PID: $KIOSK_PID"

# Wait for servers to be ready
echo -e "${YELLOW}Waiting for servers to be ready...${NC}"

if check_server "$ADMIN_URL"; then
    echo -e "${GREEN}✓ Admin server is ready at $ADMIN_URL${NC}"
else
    echo -e "${RED}✗ Admin server failed to start${NC}"
    kill $ADMIN_PID $KIOSK_PID 2>/dev/null || true
    exit 1
fi

if check_server "$KIOSK_URL"; then
    echo -e "${GREEN}✓ Kiosk server is ready at $KIOSK_URL${NC}"
else
    echo -e "${RED}✗ Kiosk server failed to start${NC}"
    kill $ADMIN_PID $KIOSK_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}All servers are ready!${NC}"

# Save PIDs to file for cleanup
echo "$ADMIN_PID" > /tmp/djamms-admin.pid
echo "$KIOSK_PID" > /tmp/djamms-kiosk.pid

# Return to test directory
cd - > /dev/null

