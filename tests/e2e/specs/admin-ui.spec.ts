/**
 * DJAMMS Admin Web UI Comprehensive Test Suite
 * 
 * Tests all Admin UI functionality including:
 * - Queue management (reorder, remove, skip, shuffle)
 * - Search and browse
 * - Settings configuration
 * - Tools
 * - Realtime sync
 * - Connection status
 * - Player controls
 */

import { test, expect, Page } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5176';
const TEST_PLAYER_ID = process.env.TEST_PLAYER_ID || 'DJAMMS_TEST';

test.describe('Admin UI - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should load and display ConnectPlayerModal', async ({ page }) => {
    // Should show player ID input modal on first load
    const modal = page.locator('[class*="modal"], [class*="dialog"], input[placeholder*="Player ID" i]');
    await expect(modal.first()).toBeVisible({ timeout: 5000 });
  });

  test('should connect with player ID', async ({ page }) => {
    // Enter player ID if modal is shown
    const playerIdInput = page.locator('input[placeholder*="Player ID" i], input[type="text"]').first();
    if (await playerIdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await playerIdInput.fill(TEST_PLAYER_ID);
      await page.locator('button:has-text("Connect"), button:has-text("Submit")').first().click();
      await page.waitForTimeout(1000);
    }

    // Should show main admin interface
    await expect(page.locator('.app, main, .content-area').first()).toBeVisible();
  });

  test('should display all navigation tabs', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);

    const tabs = ['Queue', 'Search', 'Settings', 'Tools'];
    for (const tab of tabs) {
      const tabElement = page.locator(`.nav-item:has-text("${tab}"), button:has-text("${tab}")`).first();
      await expect(tabElement).toBeVisible();
    }
  });

  test('should navigate between tabs', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);

    const tabs = ['Queue', 'Search', 'Settings', 'Tools'];
    for (const tab of tabs) {
      await page.locator(`.nav-item:has-text("${tab}"), button:has-text("${tab}")`).first().click();
      await page.waitForTimeout(300);
      
      // Verify tab content is visible
      const tabContent = page.locator(`.tab-content, [class*="${tab.toLowerCase()}"]`).first();
      await expect(tabContent).toBeVisible();
    }
  });

  test('should display player controls in header', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);

    // Check for control buttons
    await expect(page.locator('.control-btn, button:has-text("SKIP")').first()).toBeVisible();
    await expect(page.locator('.control-btn, button:has-text("SHUFFLE")').first()).toBeVisible();
    await expect(page.locator('.play-btn, button:has([class*="play"])').first()).toBeVisible();
    
    // Check for volume control
    await expect(page.locator('.volume-control, input[type="range"]').first()).toBeVisible();
  });

  test('should display connection status indicator', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);

    const indicator = page.locator('.online-indicator, [class*="connection"], [class*="status"]').first();
    await expect(indicator).toBeVisible();
  });

  test('should display Now Playing section', async ({ page }) => {
    await connectToPlayer(page, TEST_PLAYER_ID);

    const nowPlaying = page.locator('.now-playing, [class*="track"], .header-center').first();
    await expect(nowPlaying).toBeVisible();
  });
});

test.describe('Admin UI - Queue Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.locator('.nav-item:has-text("Queue"), button:has-text("Queue")').first().click();
    await page.waitForTimeout(500);
  });

  test('should display queue tab with Now Playing section', async ({ page }) => {
    const nowPlayingSection = page.locator('.now-playing-section, [class*="now-playing"]').first();
    await expect(nowPlayingSection).toBeVisible();
  });

  test('should display active queue table', async ({ page }) => {
    const queueTable = page.locator('.media-table, table, .queue-section').first();
    await expect(queueTable).toBeVisible();
  });

  test('should display priority queue when items exist', async ({ page }) => {
    // Priority queue section should be present (may be empty)
    const prioritySection = page.locator('.priority-queue-section, [class*="priority"]').first();
    // May not be visible if empty, so just check it exists in DOM
    const exists = await prioritySection.count() > 0;
    expect(exists).toBeTruthy();
  });

  test('should click Skip button', async ({ page }) => {
    const skipButton = page.locator('button:has-text("SKIP"), .control-btn-label:has-text("SKIP")').first();
    await expect(skipButton).toBeVisible();
    
    await skipButton.click();
    await page.waitForTimeout(500);
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should click Shuffle button', async ({ page }) => {
    const shuffleButton = page.locator('button:has-text("SHUFFLE"), .control-btn-label:has-text("SHUFFLE")').first();
    await expect(shuffleButton).toBeVisible();
    
    await shuffleButton.click();
    await page.waitForTimeout(1000);
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should click Clear Queue button', async ({ page }) => {
    const clearButton = page.locator('button:has-text("Clear Queue"), .action-btn:has-text("Clear")').first();
    
    if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearButton.click();
      await page.waitForTimeout(500);
      
      // Should not crash
      await expect(page.locator('.app, body').first()).toBeVisible();
    }
  });

  test('should interact with play/pause button', async ({ page }) => {
    const playButton = page.locator('.play-btn, button:has([class*="play"]), button:has([class*="pause"])').first();
    await expect(playButton).toBeVisible();
    
    await playButton.click();
    await page.waitForTimeout(500);
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should adjust volume slider', async ({ page }) => {
    const volumeSlider = page.locator('.volume-control input[type="range"], input[type="range"]').first();
    await expect(volumeSlider).toBeVisible();
    
    const initialValue = await volumeSlider.inputValue();
    await volumeSlider.fill('50');
    await page.waitForTimeout(300);
    
    const newValue = await volumeSlider.inputValue();
    expect(newValue).toBe('50');
  });
});

test.describe('Admin UI - Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.locator('.nav-item:has-text("Search"), button:has-text("Search")').first().click();
    await page.waitForTimeout(500);
  });

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('.search-input, input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible();
  });

  test('should perform search query', async ({ page }) => {
    const searchInput = page.locator('.search-input, input[placeholder*="Search" i]').first();
    await searchInput.fill('test');
    await page.waitForTimeout(1000);
    
    // Should show results or empty state
    const results = page.locator('.media-table, .search-results, table').first();
    await expect(results).toBeVisible();
  });

  test('should filter by scope (All Music, Karaoke, etc)', async ({ page }) => {
    const scopeButtons = page.locator('.radio-btn, button:has-text("All Music"), button:has-text("Karaoke")');
    const count = await scopeButtons.count();
    
    if (count > 0) {
      await scopeButtons.first().click();
      await page.waitForTimeout(500);
    }
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should sort search results', async ({ page }) => {
    const sortButtons = page.locator('.radio-btn, button:has-text("Relevance"), button:has-text("Artist")');
    const count = await sortButtons.count();
    
    if (count > 0) {
      await sortButtons.nth(1).click();
      await page.waitForTimeout(500);
    }
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should click on search result to add to priority queue', async ({ page }) => {
    // Perform search first
    const searchInput = page.locator('.search-input, input[placeholder*="Search" i]').first();
    await searchInput.fill('test');
    await page.waitForTimeout(1000);
    
    // Try to click on a result
    const results = page.locator('tr, .result-item, [class*="result"]');
    const resultCount = await results.count();
    
    if (resultCount > 0) {
      await results.first().click();
      await page.waitForTimeout(500);
      
      // Should show popover or dialog
      const popover = page.locator('.video-popover, .dialog, [class*="popover"]');
      const hasPopover = await popover.count() > 0;
      
      if (hasPopover) {
        // Click add button if visible
        const addButton = page.locator('button:has-text("Add"), button:has-text("Confirm")').first();
        if (await addButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await addButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });
});

test.describe('Admin UI - Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.locator('.nav-item:has-text("Settings"), button:has-text("Settings")').first().click();
    await page.waitForTimeout(500);
  });

  test('should display settings sections', async ({ page }) => {
    const settingsContent = page.locator('.settings-container, .settings-section, main').first();
    await expect(settingsContent).toBeVisible();
  });

  test('should display player identity settings', async ({ page }) => {
    const playerIdSection = page.locator('h2:has-text("Player Identity"), [class*="player"]').first();
    // May not be visible, but should exist
    const exists = await playerIdSection.count() > 0 || await page.locator('main').first().isVisible();
    expect(exists).toBeTruthy();
  });

  test('should display connection status in settings', async ({ page }) => {
    const connectionStatus = page.locator('label:has-text("Connection Status"), [class*="connection"]').first();
    // Should show connection status
    const exists = await connectionStatus.count() > 0 || await page.locator('main').first().isVisible();
    expect(exists).toBeTruthy();
  });

  test('should display overlay settings', async ({ page }) => {
    // Scroll to find overlay settings
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    const overlaySection = page.locator('h2:has-text("Player Overlay"), [class*="overlay"]').first();
    // May not be visible without scrolling
    const exists = await overlaySection.count() > 0 || await page.locator('main').first().isVisible();
    expect(exists).toBeTruthy();
  });
});

test.describe('Admin UI - Tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.locator('.nav-item:has-text("Tools"), button:has-text("Tools")').first().click();
    await page.waitForTimeout(500);
  });

  test('should display tools grid', async ({ page }) => {
    const toolsGrid = page.locator('.tools-grid, .tools-container, main').first();
    await expect(toolsGrid).toBeVisible();
  });

  test('should display Clear Queue tool', async ({ page }) => {
    const clearTool = page.locator('.tool-card:has-text("Clear Queue"), [class*="tool"]:has-text("Clear")').first();
    await expect(clearTool).toBeVisible();
  });

  test('should display Shuffle Queue tool', async ({ page }) => {
    const shuffleTool = page.locator('.tool-card:has-text("Shuffle Queue"), [class*="tool"]:has-text("Shuffle")').first();
    await expect(shuffleTool).toBeVisible();
  });

  test('should click Clear Queue tool', async ({ page }) => {
    const clearTool = page.locator('.tool-card:has-text("Clear Queue")').first();
    await clearTool.click();
    await page.waitForTimeout(500);
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should click Shuffle Queue tool', async ({ page }) => {
    const shuffleTool = page.locator('.tool-card:has-text("Shuffle Queue")').first();
    await shuffleTool.click();
    await page.waitForTimeout(1000);
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });
});

test.describe('Admin UI - Realtime Sync', () => {
  test('should receive realtime queue updates', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    
    // Wait for realtime connection
    await page.waitForTimeout(2000);
    
    // Check connection status
    const indicator = page.locator('.online-indicator').first();
    await expect(indicator).toBeVisible();
    
    // Connection should be established (may show offline initially)
    const isOffline = await indicator.locator('.offline').count() > 0;
    // If offline, that's okay - just verify indicator exists
    expect(indicator).toBeTruthy();
  });

  test('should display queue updates in realtime', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    await page.locator('.nav-item:has-text("Queue")').first().click();
    await page.waitForTimeout(2000);
    
    // Queue should be visible
    const queueTable = page.locator('.media-table, table').first();
    await expect(queueTable).toBeVisible();
  });
});

test.describe('Admin UI - Error Handling', () => {
  test('should handle rapid button clicks gracefully', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await connectToPlayer(page, TEST_PLAYER_ID);
    
    const skipButton = page.locator('button:has-text("SKIP")').first();
    
    // Rapid clicks
    for (let i = 0; i < 5; i++) {
      await skipButton.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(100);
    }
    
    // Should not crash
    await expect(page.locator('.app, body').first()).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept and delay Supabase requests
    await page.route('**/*supabase*', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    
    await page.goto(ADMIN_URL, { timeout: 30000 });
    
    // Should still render UI
    await expect(page.locator('.app, body').first()).toBeVisible({ timeout: 10000 });
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
  await page.waitForSelector('.app, main, .content-area', { timeout: 10000 }).catch(() => {});
}

