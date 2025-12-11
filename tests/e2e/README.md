# DJAMMS E2E Test Suite

Comprehensive Playwright test suite for Admin Web UI and Kiosk endpoints.

## Test Structure

- **`specs/admin-ui.spec.ts`** - Admin UI comprehensive tests
  - Core functionality (navigation, controls, connection)
  - Queue management (reorder, remove, skip, shuffle)
  - Search functionality
  - Settings configuration
  - Tools
  - Realtime sync
  - Error handling

- **`specs/kiosk-ui.spec.ts`** - Kiosk UI comprehensive tests
  - Core functionality (connection, display)
  - Search interface and on-screen keyboard
  - Song requests
  - Now Playing and Coming Up ticker
  - UI modes (classic and jukebox)
  - Realtime sync
  - Responsive design
  - Error handling

- **`specs/integration.spec.ts`** - Integration tests
  - Admin-Kiosk integration
  - Realtime sync between clients
  - Cross-client state consistency
  - Queue update propagation

- **`specs/web-endpoints.spec.ts`** - Legacy basic tests (kept for compatibility)

## Prerequisites

1. **Start the development servers:**
   ```bash
   # Terminal 1: Admin UI
   cd web/admin
   npm run dev
   # Runs on http://localhost:5176

   # Terminal 2: Kiosk UI
   cd web/kiosk
   npm run dev
   # Runs on http://localhost:5175
   ```

2. **Ensure Supabase is configured:**
   - Player state should exist in Supabase
   - Realtime should be enabled for `player_state` table
   - Test player ID should be configured (default: `DJAMMS_TEST`)

## Running Tests

### All Tests
```bash
npm test
# or
npx playwright test
```

### Specific Test Suites
```bash
# Admin UI only
npm run test:admin

# Kiosk UI only
npm run test:kiosk

# Integration tests only
npm run test:integration

# All tests
npm run test:all
```

### With Options
```bash
# Run with browser visible (headed mode)
npm run test:headed

# Run in debug mode
npm run test:debug

# Run with Playwright UI
npm run test:ui

# Run specific test file
npx playwright test specs/admin-ui.spec.ts

# Run specific test
npx playwright test -g "should load admin page"
```

## Environment Variables

- `ADMIN_URL` - Admin UI URL (default: `http://localhost:5176`)
- `KIOSK_URL` - Kiosk UI URL (default: `http://localhost:5175`)
- `TEST_PLAYER_ID` - Player ID for testing (default: `DJAMMS_TEST`)

Example:
```bash
ADMIN_URL=http://localhost:5176 KIOSK_URL=http://localhost:5175 TEST_PLAYER_ID=MY_TEST_PLAYER npm test
```

## Test Coverage

### Admin UI Tests
- ✅ Page loading and connection flow
- ✅ Navigation between tabs
- ✅ Player controls (Skip, Shuffle, Play/Pause, Volume)
- ✅ Queue management (display, clear, shuffle)
- ✅ Search functionality (query, filter, sort)
- ✅ Settings configuration
- ✅ Tools (Clear Queue, Shuffle Queue)
- ✅ Realtime sync verification
- ✅ Connection status indicator
- ✅ Error handling (rapid clicks, network errors)

### Kiosk UI Tests
- ✅ Page loading and connection flow
- ✅ Now Playing display
- ✅ Search interface
- ✅ On-screen keyboard input
- ✅ Song requests
- ✅ Coming Up ticker
- ✅ Credits display
- ✅ UI modes (classic and jukebox)
- ✅ Realtime sync
- ✅ Responsive design
- ✅ Error handling

### Integration Tests
- ✅ Admin-Kiosk connection to same player
- ✅ Now Playing sync between clients
- ✅ Queue update propagation
- ✅ Connection status synchronization
- ✅ Realtime updates (Kiosk request → Admin update)
- ✅ Cross-client state consistency

## Test Reports

After running tests, reports are generated in:
- **HTML Report**: `reports/html/index.html`
- **JSON Report**: `reports/results.json`
- **Screenshots**: `reports/screenshots/` (on failure)
- **Videos**: `reports/test-results/` (on retry)

View HTML report:
```bash
npx playwright show-report reports/html
```

## Troubleshooting

### Tests fail with connection errors
- Ensure both Admin and Kiosk dev servers are running
- Check Supabase connection and realtime configuration
- Verify test player ID exists in Supabase

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Check network connectivity
- Verify Supabase is accessible

### Realtime sync tests fail
- Ensure Supabase Realtime is enabled for `player_state` table
- Check that player state exists in database
- Verify realtime filters are configured in Supabase dashboard

### Screenshots show wrong state
- Tests may need adjustment for your specific UI implementation
- Update selectors in test files to match your actual DOM structure
- Check that test player ID has data in Supabase

## Writing New Tests

1. **Use helper functions:**
   - `connectToPlayer(page, playerId)` - Connect to player
   - `typeOnKeyboard(page, text)` - Type on kiosk keyboard

2. **Follow patterns:**
   - Use `test.beforeEach` for setup
   - Wait for elements with appropriate timeouts
   - Use `page.waitForTimeout()` for async operations
   - Check for element existence before interaction

3. **Test structure:**
   ```typescript
   test.describe('Feature Name', () => {
     test.beforeEach(async ({ page }) => {
       // Setup
     });

     test('should do something', async ({ page }) => {
       // Test steps
       await expect(element).toBeVisible();
     });
   });
   ```

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: npm ci

- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run tests
  run: npm test
  env:
    ADMIN_URL: ${{ secrets.ADMIN_URL }}
    KIOSK_URL: ${{ secrets.KIOSK_URL }}
    TEST_PLAYER_ID: ${{ secrets.TEST_PLAYER_ID }}
```
