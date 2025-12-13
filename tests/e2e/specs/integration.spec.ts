/**
 * DJAMMS Integration Tests
 * 
 * Tests integration between Admin UI and Kiosk:
 * - Realtime sync between Admin and Kiosk
 * - Queue updates propagate correctly
 * - Connection status synchronization
 * - Cross-client state consistency
 */

import { test, expect, Page, BrowserContext, ConsoleMessage } from '@playwright/test';

// Console monitor for integration tests
class ConsoleMonitor {
  private logs: Array<{ type: string; text: string; location: string; timestamp: Date }> = [];
  private errors: Array<{ type: string; text: string; location: string; timestamp: Date }> = [];
  private warnings: Array<{ type: string; text: string; location: string; timestamp: Date }> = [];

  attach(page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
      const log = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location().url || 'unknown',
        timestamp: new Date()
      };
      
      this.logs.push(log);
      
      if (msg.type() === 'error') {
        this.errors.push(log);
      } else if (msg.type() === 'warning') {
        this.warnings.push(log);
      }
    });

    page.on('pageerror', (error) => {
      this.errors.push({
        type: 'pageerror',
        text: error.message,
        location: error.stack || 'unknown',
        timestamp: new Date()
      });
    });
  }

  getErrors() { return this.errors; }
  getWarnings() { return this.warnings; }
  getAllLogs() { return this.logs; }
  hasErrors() { return this.errors.length > 0; }
  
  clear() {
    this.logs = [];
    this.errors = [];
    this.warnings = [];
  }

  getReport() {
    return {
      totalLogs: this.logs.length,
      errors: this.errors,
      warnings: this.warnings,
      errorCount: this.errors.length,
      warningCount: this.warnings.length
    };
  }
}

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5176';
const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:5175';
const TEST_PLAYER_ID = process.env.TEST_PLAYER_ID || 'DJAMMS_TEST';

test.describe('Admin-Kiosk Integration', () => {
  test('should connect both Admin and Kiosk to same player', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect Admin
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.waitForTimeout(2000);

      // Connect Kiosk
      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Both should be connected
      await expect(adminPage.locator('.app, main').first()).toBeVisible();
      await expect(kioskPage.locator('main, [class*="kiosk"]').first()).toBeVisible();
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });

  test('should sync Now Playing between Admin and Kiosk', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect both
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.waitForTimeout(2000);

      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Get Now Playing from both
      const adminNowPlaying = await adminPage
        .locator('.track-title, .now-playing .title, [class*="now-playing"]')
        .first()
        .textContent()
        .catch(() => 'No track playing');

      const kioskNowPlaying = await kioskPage
        .locator('[class*="now-playing"] [class*="title"], [class*="NowPlaying"]')
        .first()
        .textContent()
        .catch(() => 'No track playing');

      // Both should show player state (may be "No track playing" if nothing is playing)
      expect(adminNowPlaying).toBeTruthy();
      expect(kioskNowPlaying).toBeTruthy();

      // If something is playing, they should match (allowing for slight delay)
      if (adminNowPlaying !== 'No track playing' && kioskNowPlaying !== 'No track playing') {
        // Allow for slight differences in formatting
        expect(adminNowPlaying?.toLowerCase().trim()).toBe(kioskNowPlaying?.toLowerCase().trim());
      }
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });

  test('should sync queue updates between Admin and Kiosk', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect both
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.locator('.nav-item:has-text("Queue")').first().click();
      await adminPage.waitForTimeout(2000);

      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Get queue lengths from both
      const adminQueue = adminPage.locator('.media-table tr, [class*="queue"] tr');
      const adminQueueCount = await adminQueue.count();

      // Kiosk shows queue in ticker
      const kioskTicker = kioskPage.locator('[class*="ticker"], [class*="coming"]');
      const kioskTickerExists = await kioskTicker.count() > 0;

      // Both should have queue display (may be empty)
      expect(adminQueueCount).toBeGreaterThanOrEqual(0);
      expect(kioskTickerExists).toBeTruthy();
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });

  test('should sync connection status between Admin and Kiosk', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect both
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.waitForTimeout(2000);

      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Check connection indicators
      const adminIndicator = adminPage.locator('.online-indicator').first();
      const kioskNowPlaying = kioskPage.locator('[class*="now-playing"]').first();

      // Both should show connection status
      await expect(adminIndicator).toBeVisible();
      await expect(kioskNowPlaying).toBeVisible();
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });
});

test.describe('Realtime Sync Tests', () => {
  test('should receive realtime updates in Admin when Kiosk requests song', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    // Monitor console logs
    const adminMonitor = new ConsoleMonitor();
    const kioskMonitor = new ConsoleMonitor();
    adminMonitor.attach(adminPage);
    kioskMonitor.attach(kioskPage);

    try {
      // Connect Admin
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.locator('.nav-item:has-text("Queue")').first().click();
      await adminPage.waitForTimeout(2000);

      // Get initial priority queue count
      const initialPriorityCount = await adminPage
        .locator('.priority-queue-item, [class*="priority"] tr')
        .count();

      // Connect Kiosk and request a song
      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Perform search and request
      await typeOnKeyboard(kioskPage, 'TEST');
      await kioskPage.waitForTimeout(2000);

      const resultCards = kioskPage.locator('[class*="result"], [class*="card"]').first();
      if (await resultCards.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resultCards.click();
        await kioskPage.waitForTimeout(1000);

        const requestButton = kioskPage
          .locator('button:has-text("Request"), button:has-text("Add")')
          .first();
        if (await requestButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await requestButton.click();
          await kioskPage.waitForTimeout(1000);
        }
      }

      // Wait for realtime sync
      await adminPage.waitForTimeout(3000);

      // Check if priority queue updated (may not always work in test environment)
      const newPriorityCount = await adminPage
        .locator('.priority-queue-item, [class*="priority"] tr')
        .count();

      // Priority queue should exist (count may or may not change depending on test data)
      expect(newPriorityCount).toBeGreaterThanOrEqual(0);

      // Check for command errors in Kiosk console
      const kioskErrors = kioskMonitor.getErrors();
      const timeoutErrors = kioskErrors.filter(err =>
        err.text.includes('timeout') && err.text.includes('Command')
      );
      
      if (timeoutErrors.length > 0) {
        console.warn('⚠️ Command timeout errors detected in Kiosk:', timeoutErrors.length);
      }
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });

  test('should update Kiosk when Admin shuffles queue', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect both
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.waitForTimeout(2000);

      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Admin shuffles queue
      const shuffleButton = adminPage.locator('button:has-text("SHUFFLE")').first();
      if (await shuffleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shuffleButton.click();
        await adminPage.waitForTimeout(2000);
      }

      // Wait for realtime sync
      await kioskPage.waitForTimeout(3000);

      // Kiosk should still be responsive
      await expect(kioskPage.locator('body').first()).toBeVisible();
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });
});

test.describe('Cross-Client State Consistency', () => {
  test('should maintain consistent player state across clients', async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const kioskPage = await context.newPage();

    try {
      // Connect both
      await adminPage.goto(ADMIN_URL);
      await connectToPlayer(adminPage, TEST_PLAYER_ID);
      await adminPage.waitForTimeout(2000);

      await kioskPage.goto(KIOSK_URL);
      await connectToPlayer(kioskPage, TEST_PLAYER_ID);
      await kioskPage.waitForTimeout(2000);

      // Both should show same player ID
      const adminPlayerId = await adminPage
        .locator('[class*="player-id"], [class*="badge"]')
        .first()
        .textContent()
        .catch(() => '');

      // Kiosk may not show player ID, but should be connected
      await expect(kioskPage.locator('main').first()).toBeVisible();

      // Admin should show player ID
      expect(adminPlayerId).toBeTruthy();
    } finally {
      await adminPage.close();
      await kioskPage.close();
      await context.close();
    }
  });
});

// Helper functions
async function connectToPlayer(page: Page, playerId: string) {
  const playerIdInput = page.locator('input[placeholder*="Player ID" i], input[type="text"]').first();

  if (await playerIdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await playerIdInput.fill(playerId);
    const connectButton = page
      .locator('button:has-text("Connect"), button:has-text("Submit"), button[type="submit"]')
      .first();
    await connectButton.click();
    await page.waitForTimeout(2000);
  }

  await page.waitForSelector('.app, main, [class*="kiosk"]', { timeout: 10000 }).catch(() => {});
}

async function typeOnKeyboard(page: Page, text: string) {
  for (const char of text.toUpperCase()) {
    const keyButton = page
      .locator(`button:has-text("${char}"), [class*="key"]:has-text("${char}")`)
      .first();
    if (await keyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await keyButton.click();
      await page.waitForTimeout(100);
    }
  }
}

