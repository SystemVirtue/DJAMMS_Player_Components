#!/bin/bash

# Script to stop Admin and Kiosk dev servers

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}Stopping dev servers...${NC}"

# Kill servers by PID if files exist
if [ -f /tmp/djamms-admin.pid ]; then
    ADMIN_PID=$(cat /tmp/djamms-admin.pid)
    if kill -0 $ADMIN_PID 2>/dev/null; then
        kill $ADMIN_PID 2>/dev/null || true
        echo -e "${GREEN}✓ Stopped Admin server (PID: $ADMIN_PID)${NC}"
    fi
    rm -f /tmp/djamms-admin.pid
fi

if [ -f /tmp/djamms-kiosk.pid ]; then
    KIOSK_PID=$(cat /tmp/djamms-kiosk.pid)
    if kill -0 $KIOSK_PID 2>/dev/null; then
        kill $KIOSK_PID 2>/dev/null || true
        echo -e "${GREEN}✓ Stopped Kiosk server (PID: $KIOSK_PID)${NC}"
    fi
    rm -f /tmp/djamms-kiosk.pid
fi

# Also kill any node processes running on these ports (fallback)
lsof -ti:5176 | xargs kill -9 2>/dev/null || true
lsof -ti:5175 | xargs kill -9 2>/dev/null || true

echo -e "${GREEN}Servers stopped${NC}"

