# DJAMMS E2E Test Suite

Automated end-to-end tests for DJAMMS Web Admin and Web Kiosk endpoints using Playwright.

## Prerequisites

- Node.js 18+
- Running DJAMMS Electron app (localhost:3000)
- Running Web Admin (localhost:5176)
- Running Web Kiosk (localhost:5175)

## Installation

```bash
cd tests/e2e
npm install
npx playwright install  # Install browser engines
```

## Running Tests

### All Tests (All Browsers)
```bash
npm test
```

### Admin Tests Only
```bash
npm run test:admin
```

### Kiosk Tests Only
```bash
npm run test:kiosk
```

### With UI Mode (Interactive)
```bash
npm run test:ui
```

### With Browser Visible
```bash
npm run test:headed
```

### Debug Mode
```bash
npm run test:debug
```

## Test Reports

After running tests, view the HTML report:
```bash
npm run report
```

Reports are saved to:
- `./reports/html/` - HTML report
- `./reports/results.json` - JSON results
- `./reports/screenshots/` - Failure screenshots
- `./reports/test-results/` - Test artifacts

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_URL` | `http://localhost:5176` | Web Admin endpoint |
| `KIOSK_URL` | `http://localhost:5175` | Web Kiosk endpoint |

### Custom URLs
```bash
ADMIN_URL=https://admin.djamms.com KIOSK_URL=https://kiosk.djamms.com npm test
```

## Test Coverage

### Web Admin Console Tests
- ✅ Page load verification
- ✅ Navigation tabs (Queue, Search, Browse, Settings, Tools)
- ✅ Player controls (Skip, Shuffle, Play/Pause)
- ✅ Volume slider interaction
- ✅ Now Playing display
- ✅ Playlist sidebar
- ✅ Search functionality
- ✅ Browse tab
- ✅ Settings display
- ✅ Tools display
- ✅ Sidebar toggle
- ✅ Console error monitoring

### Web Kiosk Tests
- ✅ Page load verification
- ✅ Search interface
- ✅ Song search
- ✅ Now Playing section
- ✅ Coming Up ticker
- ✅ Credits display
- ✅ Song request flow
- ✅ Responsive design (desktop, tablet, portrait)
- ✅ Background video/image
- ✅ Console error monitoring

### Integration Tests
- ✅ Admin/Kiosk Supabase connection
- ✅ Player state sync between endpoints

### Edge Cases
- ✅ Rapid button clicks handling
- ✅ Empty search handling
- ✅ XSS prevention (special characters)
- ✅ Network timeout graceful degradation

## Writing New Tests

Tests use Playwright's test syntax:

```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
  await page.goto('http://localhost:5176');
  await expect(page.locator('.element')).toBeVisible();
});
```

### Using Console Monitor

```typescript
import { ConsoleMonitor } from '../utils/console-monitor';

test('check for errors', async ({ page }) => {
  const monitor = new ConsoleMonitor();
  monitor.attach(page);
  
  await page.goto(ADMIN_URL);
  
  const errors = monitor.getErrors();
  expect(errors.length).toBe(0);
});
```

## CI Integration

For CI environments:
```bash
CI=true npm test
```

This enables:
- 2 retries on failure
- Single worker
- No parallel execution

## Troubleshooting

### Browser not installed
```bash
npx playwright install chromium
```

### Tests timeout
Increase timeout in `playwright.config.ts`:
```typescript
timeout: 60 * 1000, // 60 seconds
```

### Screenshots not capturing
Check the `reports/screenshots/` directory and ensure write permissions.
