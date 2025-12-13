# Electron Player Priority Queue Tests

This test suite verifies that priority queue requests from the Kiosk are properly received and processed by the Electron Player.

## Prerequisites

1. **Supabase Configuration**: Ensure Supabase is configured and the test player ID exists
2. **Player ID**: Set `TEST_PLAYER_ID` environment variable (default: `DJAMMS_TEST`)
3. **Ports Available**: 
   - Port 3003: Vite dev server
   - Port 5175: Kiosk dev server
   - Port 9222: Electron remote debugging

## Running the Tests

### Option 1: Automated (Recommended)

The test script will start all required servers automatically:

```bash
cd tests/e2e
npm run test:electron
```

This will:
1. Start Vite dev server (if not running)
2. Start Electron with remote debugging
3. Start Kiosk dev server
4. Run Playwright tests
5. Clean up all processes

### Option 2: Manual

If you prefer to start servers manually:

**Terminal 1: Start Vite dev server**
```bash
cd DJAMMS_PLAYER_REACT_MIGRATION
npm run dev:vite
```

**Terminal 2: Start Electron with remote debugging**
```bash
cd DJAMMS_PLAYER_REACT_MIGRATION
npm run dev:electron:debug
```

**Terminal 3: Start Kiosk**
```bash
cd DJAMMS_PLAYER_REACT_MIGRATION
npm run dev:kiosk
```

**Terminal 4: Run tests**
```bash
cd DJAMMS_PLAYER_REACT_MIGRATION/tests/e2e
npx playwright test specs/electron-priority-queue.spec.ts --headed
```

## What the Tests Verify

1. **Command Reception**: Electron Player receives `queue_add` commands from Kiosk via Supabase Broadcast
2. **Command Processing**: Electron Player processes the command and executes the handler
3. **Priority Queue Update**: Priority queue is updated in Electron Player UI
4. **No Errors**: No console errors during command processing
5. **Command Acknowledgment**: Commands are acknowledged within timeout (no timeout errors in Kiosk)

## Console Monitoring

The tests monitor console logs from both Electron and Kiosk:

- **Electron Console**: Monitors for command reception, handler execution, and errors
- **Kiosk Console**: Monitors for command sending, timeout errors, and success messages

All console errors and warnings are reported at the end of the test run.

## Troubleshooting

### Electron not connecting

If you see "No browser contexts found":
- Ensure Electron is running with `--remote-debugging-port=9222`
- Check that port 9222 is not blocked by firewall
- Verify Electron window is open and loaded

### Commands timing out

If Kiosk shows command timeout errors:
- Check that Electron Player is connected to Supabase
- Verify player ID matches between Kiosk and Electron
- Check Supabase Realtime connection status
- Look for errors in Electron console about handler registration

### Priority queue not updating

If priority queue doesn't update:
- Check Electron console for handler execution logs
- Verify `onQueueAdd` handler is registered in `useSupabase` hook
- Check that `sendQueueCommand` is being called in Electron
- Verify main process queue state is being updated

## Test Output

The test will output:
- Console logs from Electron and Kiosk
- Error reports if any errors are detected
- Test results (pass/fail)
- Priority queue counts before and after requests


