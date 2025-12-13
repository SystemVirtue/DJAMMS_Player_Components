#!/bin/bash

# Script to run Electron priority queue tests
# Starts Electron and Kiosk, then runs Playwright tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}DJAMMS Electron Priority Queue Test${NC}"
echo -e "${YELLOW}========================================${NC}"

# Track PIDs we started (don't kill processes we didn't start)
STARTED_VITE=false
STARTED_ELECTRON=false
STARTED_KIOSK=false

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    
    # Kill Electron if we started it
    if [ "$STARTED_ELECTRON" = true ] && [ ! -z "$ELECTRON_PID" ]; then
        echo "Stopping Electron (PID: $ELECTRON_PID)"
        kill $ELECTRON_PID 2>/dev/null || true
    fi
    
    # Kill Kiosk if we started it
    if [ "$STARTED_KIOSK" = true ] && [ ! -z "$KIOSK_PID" ]; then
        echo "Stopping Kiosk (PID: $KIOSK_PID)"
        kill $KIOSK_PID 2>/dev/null || true
    fi
    
    # Kill Vite dev server if we started it
    if [ "$STARTED_VITE" = true ]; then
        VITE_PID=$(lsof -ti:3003 2>/dev/null || true)
        if [ ! -z "$VITE_PID" ]; then
            echo "Stopping Vite dev server (PID: $VITE_PID)"
            kill $VITE_PID 2>/dev/null || true
        fi
    fi
}

trap cleanup EXIT INT TERM

# Step 1: Start Vite dev server (required for Electron)
echo -e "\n${YELLOW}Step 1: Starting Vite dev server...${NC}"
cd ../../

if lsof -Pi :3003 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Vite dev server already running on port 3003${NC}"
else
    npm run dev:vite > /tmp/djamms-vite-server.log 2>&1 &
    VITE_PID=$!
    STARTED_VITE=true
    echo "Vite server PID: $VITE_PID"
    
    # Wait for Vite to be ready
    echo "Waiting for Vite dev server..."
    MAX_WAIT=30
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s -f http://localhost:3003 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Vite dev server is ready${NC}"
            break
        fi
        WAIT_COUNT=$((WAIT_COUNT + 1))
        sleep 1
    done
    
    if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
        echo -e "${RED}✗ Vite dev server failed to start${NC}"
        exit 1
    fi
fi

# Step 2: Start Electron with remote debugging
echo -e "\n${YELLOW}Step 2: Starting Electron with remote debugging...${NC}"
cd "$SCRIPT_DIR"

if lsof -Pi :9222 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Electron debug port already in use (Electron may already be running)${NC}"
    ELECTRON_PID=$(lsof -ti:9222 2>/dev/null || true)
    echo -e "${GREEN}✓ Electron already running (PID: $ELECTRON_PID)${NC}"
else
    ./start-electron.sh
    sleep 2
    ELECTRON_PID=$(lsof -ti:9222 2>/dev/null || true)
    if [ -z "$ELECTRON_PID" ]; then
        echo -e "${RED}✗ Failed to start Electron${NC}"
        echo "Check logs: /tmp/djamms-electron-server.log"
        exit 1
    fi
    STARTED_ELECTRON=true
    echo -e "${GREEN}✓ Electron started (PID: $ELECTRON_PID)${NC}"
fi

# Wait a bit for Electron to fully initialize
sleep 3

# Step 3: Start Kiosk
echo -e "\n${YELLOW}Step 3: Starting Kiosk dev server...${NC}"
if lsof -Pi :5175 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Kiosk server already running on port 5175${NC}"
    KIOSK_PID=$(lsof -ti:5175 2>/dev/null || true)
    echo -e "${GREEN}✓ Kiosk already running (PID: $KIOSK_PID)${NC}"
else
    ./start-kiosk.sh
    KIOSK_PID=$(lsof -ti:5175 2>/dev/null || true)
    if [ -z "$KIOSK_PID" ]; then
        echo -e "${RED}✗ Failed to start Kiosk${NC}"
        echo "Check logs: /tmp/djamms-kiosk-server.log"
        exit 1
    fi
    STARTED_KIOSK=true
    echo -e "${GREEN}✓ Kiosk started (PID: $KIOSK_PID)${NC}"
fi

# Wait for Kiosk to be ready
sleep 2

# Step 4: Run Playwright tests
echo -e "\n${YELLOW}Step 4: Running Playwright tests...${NC}"
echo -e "${YELLOW}========================================${NC}\n"

# Export environment variables for tests
export TEST_PLAYER_ID=${TEST_PLAYER_ID:-DJAMMS_TEST}
export KIOSK_URL=${KIOSK_URL:-http://localhost:5175}
export ELECTRON_DEV_SERVER_URL=${ELECTRON_DEV_SERVER_URL:-http://localhost:3003}

echo -e "${YELLOW}Test configuration:${NC}"
echo "  TEST_PLAYER_ID: $TEST_PLAYER_ID"
echo "  KIOSK_URL: $KIOSK_URL"
echo "  ELECTRON_DEV_SERVER_URL: $ELECTRON_DEV_SERVER_URL"
echo ""

npx playwright test specs/electron-priority-queue.spec.ts --headed

TEST_EXIT_CODE=$?

echo -e "\n${YELLOW}========================================${NC}"
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
else
    echo -e "${RED}✗ Some tests failed${NC}"
fi
echo -e "${YELLOW}========================================${NC}"

exit $TEST_EXIT_CODE

