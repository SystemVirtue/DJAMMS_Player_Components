import { defineConfig, devices } from '@playwright/test';

/**
 * DJAMMS E2E Test Configuration
 * 
 * Environment Variables:
 *   ADMIN_URL - Web Admin URL (default: http://localhost:5176)
 *   KIOSK_URL - Web Kiosk URL (default: http://localhost:5175)
 * 
 * Run commands:
 *   npm test              - Run all tests
 *   npm run test:admin    - Run Admin tests only
 *   npm run test:kiosk    - Run Kiosk tests only
 *   npm run test:headed   - Run with browser visible
 *   npm run test:debug    - Run in debug mode
 *   npm run test:ui       - Run with Playwright UI
 */

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: './reports/html' }],
    ['json', { outputFile: './reports/results.json' }],
    ['list']
  ],
  timeout: 30 * 1000,
  expect: { 
    timeout: 10000,
    toHaveScreenshot: { maxDiffPixels: 100 }
  },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 }
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 }
      },
    },
  ],
  outputDir: './reports/test-results',
});
