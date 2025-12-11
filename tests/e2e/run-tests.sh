#!/bin/bash

# Complete test runner: starts servers, runs tests, stops servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    ./stop-servers.sh
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start servers
echo -e "${YELLOW}Starting test servers...${NC}"
./start-servers.sh

# Wait a bit more for servers to fully initialize
sleep 2

# Run tests
echo -e "\n${YELLOW}Running Playwright tests...${NC}"
npx playwright test "$@"
TEST_EXIT_CODE=$?

# Tests complete - cleanup will happen via trap
exit $TEST_EXIT_CODE

