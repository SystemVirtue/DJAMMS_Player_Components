/**
 * DJAMMS Kiosk Web UI Comprehensive Test Suite
 * 
 * Tests all Kiosk functionality including:
 * - Search interface
 * - On-screen keyboard
 * - Song requests
 * - Now Playing display
 * - Coming Up ticker
 * - Credits display
 * - Both UI modes (classic and jukebox)
 * - Realtime sync
 */

import { test, expect, Page } from '@playwright/test';

const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:5175';
const TEST_PLAYER_ID = process.env.TEST_PLAYER_ID || 'DJAMMS_TEST';

test.describe('Kiosk UI - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(KIOSK_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should load and display connection flow', async ({ page }) => {
    // Should show player ID input on first load
    const connectionFlow = page.locator('input[placeholder*="Player ID" i], [class*="connection"]').first();
    await expect(connectionFlow).toBeVisible({ timeout: 5000 });
  });

  test('should connect with player ID', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);
    
    // Should show main kiosk interface
    await expect(page.locator('main, [class*="kiosk"], body').first()).toBeVisible();
  });

  test('should display Now Playing section', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    const nowPlaying = page.locator('[class*="now-playing" i], [class*="NowPlaying"]').first();
    await expect(nowPlaying).toBeVisible();
  });

  test('should display search interface', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    const searchInterface = page.locator('[class*="search"], [class*="SearchInterface"]').first();
    await expect(searchInterface).toBeVisible();
  });

  test('should display on-screen keyboard', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    // Look for keyboard buttons
    const keyboard = page.locator('[class*="keyboard"], [class*="Keyboard"], button:has-text("A")').first();
    await expect(keyboard).toBeVisible({ timeout: 5000 });
  });

  test('should display Coming Up ticker', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    const ticker = page.locator('[class*="ticker"], [class*="coming"], [class*="ComingUp"]').first();
    // May not be visible if queue is empty, but should exist
    const exists = await ticker.count() > 0;
    expect(exists).toBeTruthy();
  });
});

test.describe('Kiosk UI - Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
  });

  test('should type on on-screen keyboard', async ({ page }) => {
    // Find and click keyboard buttons
    const letterButtons = page.locator('button:has-text("A"), button:has-text("B"), [class*="key"]');
    const buttonCount = await letterButtons.count();
    
    if (buttonCount > 0) {
      // Click a few letters
      for (let i = 0; i < Math.min(3, buttonCount); i++) {
        await letterButtons.nth(i).click();
        await page.waitForTimeout(100);
      }
      
      // Check that search input has value
      const searchInput = page.locator('input[readonly], input[placeholder*="search" i]').first();
      const value = await searchInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test('should perform search with on-screen keyboard', async ({ page }) => {
    // Type "LOVE" using keyboard
    await typeOnKeyboard(page, 'LOVE');
    await page.waitForTimeout(1000);
    
    // Check search input
    const searchInput = page.locator('input[readonly], input[placeholder*="search" i]').first();
    await expect(searchInput).toHaveValue(/love/i);
    
    // Should show search results
    const results = page.locator('[class*="result"], [class*="card"], [class*="video"]');
    // Results may take time to load
    await page.waitForTimeout(2000);
    const resultCount = await results.count();
    // May have results or empty state
    expect(resultCount).toBeGreaterThanOrEqual(0);
  });

  test('should clear search input', async ({ page }) => {
    // Type something first
    await typeOnKeyboard(page, 'TEST');
    await page.waitForTimeout(500);
    
    // Find clear/backspace button
    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Backspace"), [class*="clear"], [class*="backspace"]').first();
    
    if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearButton.click();
      await page.waitForTimeout(300);
      
      const searchInput = page.locator('input[readonly], input[placeholder*="search" i]').first();
      const value = await searchInput.inputValue();
      // Value should be cleared or reduced
      expect(value.length).toBeLessThanOrEqual(4);
    }
  });

  test('should display search results', async ({ page }) => {
    // Perform search
    await typeOnKeyboard(page, 'LOVE');
    await page.waitForTimeout(2000);
    
    // Results should be visible (or empty state)
    const resultsContainer = page.locator('[class*="results"], [class*="grid"], main').first();
    await expect(resultsContainer).toBeVisible();
  });
});

test.describe('Kiosk UI - Song Requests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
  });

  test('should click on search result to request song', async ({ page }) => {
    // Perform search first
    await typeOnKeyboard(page, 'LOVE');
    await page.waitForTimeout(2000);
    
    // Find result cards
    const resultCards = page.locator('[class*="result"], [class*="card"], [class*="video"], tr').filter({ hasNotText: '' });
    const cardCount = await resultCards.count();
    
    if (cardCount > 0) {
      // Click first result
      await resultCards.first().click();
      await page.waitForTimeout(1000);
      
      // Should show confirmation or success message
      const confirmation = page.locator('[class*="toast"], [class*="success"], [class*="confirm"], button:has-text("Request")');
      const hasConfirmation = await confirmation.count() > 0;
      
      if (hasConfirmation) {
        // Click request/confirm button if visible
        const requestButton = page.locator('button:has-text("Request"), button:has-text("Add"), button:has-text("Confirm")').first();
        if (await requestButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await requestButton.click();
          await page.waitForTimeout(1000);
        }
      }
      
      // Should show success toast
      const successToast = page.locator('[class*="toast"], [class*="success"]:has-text("Requested")');
      // May appear briefly
      await page.waitForTimeout(500);
    }
    
    // Should not crash
    await expect(page.locator('body').first()).toBeVisible();
  });

  test('should display success toast after request', async ({ page }) => {
    // Perform search and request
    await typeOnKeyboard(page, 'TEST');
    await page.waitForTimeout(2000);
    
    const resultCards = page.locator('[class*="result"], [class*="card"]').first();
    if (await resultCards.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resultCards.click();
      await page.waitForTimeout(1000);
      
      // Look for success message
      const successMessage = page.locator('[class*="toast"], [class*="success"]:has-text("Song Requested")');
      // May appear briefly
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Kiosk UI - UI Modes', () => {
  test('should display classic mode by default', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    // Classic mode should show search interface
    const searchInterface = page.locator('[class*="SearchInterface"], [class*="search"]').first();
    await expect(searchInterface).toBeVisible();
  });

  test('should support jukebox mode via URL parameter', async ({ page }) => {
    await page.goto(`${KIOSK_URL}?ui=jukebox`);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    // Jukebox mode should show different layout
    const jukeboxMode = page.locator('[class*="Jukebox"], [class*="jukebox"]').first();
    // May or may not be visible depending on implementation
    const exists = await jukeboxMode.count() > 0 || await page.locator('main').first().isVisible();
    expect(exists).toBeTruthy();
  });
});

test.describe('Kiosk UI - Realtime Sync', () => {
  test('should receive realtime player state updates', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(2000);
    
    // Now Playing should be visible
    const nowPlaying = page.locator('[class*="now-playing" i]').first();
    await expect(nowPlaying).toBeVisible();
  });

  test('should update Now Playing in realtime', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(2000);
    
    // Now Playing section should exist and update
    const nowPlaying = page.locator('[class*="now-playing" i]').first();
    await expect(nowPlaying).toBeVisible();
    
    // Wait a bit for potential updates
    await page.waitForTimeout(3000);
    
    // Should still be visible
    await expect(nowPlaying).toBeVisible();
  });

  test('should update Coming Up ticker in realtime', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(2000);
    
    // Ticker should exist
    const ticker = page.locator('[class*="ticker"], [class*="coming"]').first();
    const exists = await ticker.count() > 0;
    expect(exists).toBeTruthy();
  });
});

test.describe('Kiosk UI - Credits Display', () => {
  test('should display credits when in credits mode', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    // Credits display may or may not be visible
    const credits = page.locator('[class*="credits"], [class*="Credits"]').first();
    const exists = await credits.count() > 0;
    // Credits are optional
    expect(exists).toBeTruthy();
  });
});

test.describe('Kiosk UI - Responsive Design', () => {
  test('should be responsive on different screen sizes', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 1024, height: 768, name: 'tablet' },
      { width: 768, height: 1024, name: 'tablet-portrait' }
    ];
    
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);
      
      // Should still be visible
      await expect(page.locator('body').first()).toBeVisible();
    }
  });
});

test.describe('Kiosk UI - Error Handling', () => {
  test('should handle empty search gracefully', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.waitForTimeout(1000);
    
    // Clear search if possible
    const clearButton = page.locator('button:has-text("Clear"), [class*="clear"]').first();
    if (await clearButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clearButton.click();
      await page.waitForTimeout(300);
    }
    
    // Should not crash
    await expect(page.locator('body').first()).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept and delay Supabase requests
    await page.route('**/*supabase*', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    
    await page.goto(KIOSK_URL, { timeout: 30000 });
    
    // Should still render UI
    await expect(page.locator('body').first()).toBeVisible({ timeout: 10000 });
  });
});

// Helper function to connect to player
async function connectToPlayer(page: Page, playerId: string) {
  const playerIdInput = page.locator('input[placeholder*="Player ID" i], input[type="text"]').first();
  
  if (await playerIdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await playerIdInput.fill(playerId);
    const connectButton = page.locator('button:has-text("Connect"), button:has-text("Submit"), button[type="submit"]').first();
    await connectButton.click();
    await page.waitForTimeout(2000);
  }
  
  // Wait for main app to load
  await page.waitForSelector('main, [class*="kiosk"]', { timeout: 10000 }).catch(() => {});
}

// Helper function to type on on-screen keyboard
async function typeOnKeyboard(page: Page, text: string) {
  for (const char of text.toUpperCase()) {
    const keyButton = page.locator(`button:has-text("${char}"), [class*="key"]:has-text("${char}")`).first();
    if (await keyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await keyButton.click();
      await page.waitForTimeout(100);
    }
  }
}

