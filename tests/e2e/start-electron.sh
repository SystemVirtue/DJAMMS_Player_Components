#!/bin/bash

# Script to start Electron dev server for E2E tests
# Starts Electron with remote debugging enabled

# Don't use set -e - we want to handle errors gracefully

ELECTRON_DIR="../../"
ELECTRON_DEBUG_PORT=9222

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Electron dev server for E2E tests...${NC}"

# Check if Electron is already running
if lsof -Pi :${ELECTRON_DEBUG_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Electron debug port ${ELECTRON_DEBUG_PORT} is already in use${NC}"
    echo -e "${YELLOW}Assuming Electron is already running...${NC}"
    exit 0
fi

# Navigate to Electron directory
cd "$ELECTRON_DIR"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Are you in the correct directory?${NC}"
    exit 1
fi

# Start Electron with remote debugging
echo -e "${YELLOW}Starting Electron with remote debugging on port ${ELECTRON_DEBUG_PORT}...${NC}"

# Start Electron with remote debugging enabled
cd "$ELECTRON_DIR"

# Build Electron main process first
echo -e "${YELLOW}Building Electron main process...${NC}"
if ! npm run build:electron-main > /tmp/djamms-electron-build.log 2>&1; then
    echo -e "${RED}✗ Failed to build Electron main process${NC}"
    echo "Check logs: /tmp/djamms-electron-build.log"
    exit 1
fi

# Wait for Vite dev server to be ready
echo -e "${YELLOW}Waiting for Vite dev server...${NC}"
MAX_VITE_WAIT=30
VITE_WAIT_COUNT=0
while [ $VITE_WAIT_COUNT -lt $MAX_VITE_WAIT ]; do
    if curl -s -f http://localhost:3003 > /dev/null 2>&1; then
        break
    fi
    VITE_WAIT_COUNT=$((VITE_WAIT_COUNT + 1))
    sleep 1
done

if [ $VITE_WAIT_COUNT -ge $MAX_VITE_WAIT ]; then
    echo -e "${RED}✗ Vite dev server not ready. Start it first with: npm run dev:vite${NC}"
    exit 1
fi

# Start Electron with remote debugging
echo -e "${YELLOW}Starting Electron with remote debugging on port ${ELECTRON_DEBUG_PORT}...${NC}"
NODE_ENV=development npx electron . --remote-debugging-port=${ELECTRON_DEBUG_PORT} > /tmp/djamms-electron-server.log 2>&1 &
ELECTRON_PID=$!

echo "Electron server PID: $ELECTRON_PID"
echo "Logs: /tmp/djamms-electron-server.log"

# Wait for Electron to start and open debug port
echo -e "${YELLOW}Waiting for Electron to start...${NC}"
MAX_WAIT=30
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if lsof -Pi :${ELECTRON_DEBUG_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Electron debug port is ready${NC}"
        echo "Electron PID: $ELECTRON_PID"
        exit 0
    fi
    
    # Check if process is still running
    if ! kill -0 $ELECTRON_PID 2>/dev/null; then
        echo -e "${RED}✗ Electron process died. Check logs: /tmp/djamms-electron-server.log${NC}"
        exit 1
    fi
    
    WAIT_COUNT=$((WAIT_COUNT + 1))
    sleep 1
done

echo -e "${RED}✗ Electron failed to start debug port within ${MAX_WAIT}s${NC}"
echo "Check logs: /tmp/djamms-electron-server.log"
exit 1

