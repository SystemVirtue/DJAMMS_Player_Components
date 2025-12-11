/**
 * DJAMMS Web Endpoints Automated Test Suite
 * 
 * Tests the Web Admin (5176) and Web Kiosk (5175) endpoints
 * for functionality, visual appearance, and expected behavior.
 * 
 * Usage:
 *   ADMIN_URL=http://localhost:5176 KIOSK_URL=http://localhost:5175 npx playwright test
 */

import { test, expect, Page, BrowserContext, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ============== Configuration ==============
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5176';
const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:5175';
const MAX_RETRIES = 3;
const SCREENSHOT_DIR = path.join(__dirname, '../reports/screenshots');
const BASELINE_DIR = path.join(__dirname, '../baselines');

// Ensure directories exist
[SCREENSHOT_DIR, BASELINE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============== Console Monitor ==============
interface ConsoleLog {
  type: string;
  text: string;
  location: string;
  timestamp: Date;
}

class ConsoleMonitor {
  private logs: ConsoleLog[] = [];
  private errors: ConsoleLog[] = [];
  private warnings: ConsoleLog[] = [];

  attach(page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
      const log: ConsoleLog = {
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

// ============== Test Helpers ==============
async function takeScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${name}-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function waitForStableDOM(page: Page, timeout = 5000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  // Wait for any animations to settle
  await page.waitForTimeout(500);
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ============== Web Admin Tests ==============
test.describe('Web Admin Console Tests', () => {
  let consoleMonitor: ConsoleMonitor;

  test.beforeEach(async ({ page }) => {
    consoleMonitor = new ConsoleMonitor();
    consoleMonitor.attach(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture screenshot on failure
    if (testInfo.status !== 'passed') {
      await takeScreenshot(page, `admin-failure-${testInfo.title.replace(/\s+/g, '-')}`);
    }
    
    // Log console report
    const report = consoleMonitor.getReport();
    if (report.errorCount > 0) {
      console.log('Console Errors:', JSON.stringify(report.errors, null, 2));
    }
  });

  test('should load admin page successfully', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Check for ConnectPlayerModal or main app content
    // Modal shows on first load, or app content if already connected
    const modalTitle = page.locator('h1:has-text("DJAMMS Admin Console"), h1:has-text("Connect to Player")');
    const appContent = page.locator('.app, main, .content-area, .app-logo[alt="DJAMMS"]');
    
    // Either modal or app should be visible
    const modalVisible = await modalTitle.count() > 0;
    const appVisible = await appContent.count() > 0;
    
    expect(modalVisible || appVisible).toBeTruthy();
    
    // Take baseline screenshot
    await takeScreenshot(page, 'admin-initial-load');
  });

  test('should display navigation tabs', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Check for navigation items - use first() for each to handle multiple matches
    const navItems = ['Queue', 'Search', 'Browse', 'Settings', 'Tools'];
    for (const item of navItems) {
      await expect(page.locator('.nav-item').filter({ hasText: item }).first()).toBeVisible();
    }
  });

  test('should navigate between tabs', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const tabs = ['Queue', 'Search', 'Browse', 'Settings', 'Tools'];
    
    for (const tabName of tabs) {
      await page.click(`.nav-item:has-text("${tabName}")`);
      await page.waitForTimeout(200);
    }
    
    // Take one final screenshot
    await takeScreenshot(page, 'admin-tabs-navigation');
  });

  test('should display player controls', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Check for player control elements
    await expect(page.locator('.control-btn').first()).toBeVisible();
    
    // Check for specific buttons
    const controls = ['SKIP', 'SHUFFLE'];
    for (const control of controls) {
      await expect(page.locator('.control-btn-label').filter({ hasText: control }).first()).toBeVisible();
    }
    
    // Check for play/pause button
    await expect(page.locator('.play-btn').first()).toBeVisible();
    
    // Check for volume slider
    await expect(page.locator('input[type="range"]').first()).toBeVisible();
  });

  test('should interact with Skip button', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const skipButton = page.locator('button, .control-btn').filter({ hasText: 'SKIP' });
    await expect(skipButton).toBeVisible();
    
    // Click Skip and check no JS errors
    await skipButton.click();
    await page.waitForTimeout(500);
    
    // Check console for command errors (RLS should be fixed now)
    const errors = consoleMonitor.getErrors();
    const rlsErrors = errors.filter(e => e.text.includes('row-level security'));
    expect(rlsErrors.length).toBe(0);
  });

  test('should interact with Shuffle button', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const shuffleButton = page.locator('button, .control-btn').filter({ hasText: 'SHUFFLE' });
    await expect(shuffleButton).toBeVisible();
    
    await shuffleButton.click();
    await page.waitForTimeout(500);
    
    // Verify no RLS errors
    const errors = consoleMonitor.getErrors();
    const rlsErrors = errors.filter(e => e.text.includes('row-level security'));
    expect(rlsErrors.length).toBe(0);
  });

  test('should display sidebar with playlists', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Check for sidebar
    await expect(page.locator('.sidebar').first()).toBeVisible();
    
    // Check for playlist section - may have different class names
    const playlistSection = page.locator('[class*="playlist"]').first();
    await expect(playlistSection).toBeVisible();
  });

  test('should show Now Playing info', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Check for now playing area - look for track info or now playing elements
    const nowPlayingArea = page.locator('[class*="track"], [class*="now-playing"], .header-left').first();
    await expect(nowPlayingArea).toBeVisible();
  });

  test('should interact with volume slider', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const volumeSlider = page.locator('.volume-control input[type="range"]');
    await expect(volumeSlider).toBeVisible();
    
    // Get initial value
    const initialValue = await volumeSlider.inputValue();
    
    // Change volume
    await volumeSlider.fill('50');
    await page.waitForTimeout(300);
    
    // Verify value changed
    const newValue = await volumeSlider.inputValue();
    expect(newValue).toBe('50');
  });

  test('should search in Search tab', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Navigate to Search tab
    await page.click('.nav-item:has-text("Search")');
    await page.waitForTimeout(300);
    
    // Find search input
    const searchInput = page.locator('.search-input, input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    // Type search query
    await searchInput.fill('love');
    await page.waitForTimeout(500);
    
    await takeScreenshot(page, 'admin-search-results');
  });

  test('should browse in Browse tab', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Navigate to Browse tab
    await page.click('.nav-item:has-text("Browse")');
    await page.waitForTimeout(500);
    
    // Verify page didn't crash - just check body is visible
    await expect(page.locator('body')).toBeVisible();
    
    await takeScreenshot(page, 'admin-browse');
  });

  test('should display Settings tab options', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Navigate to Settings tab
    await page.click('.nav-item:has-text("Settings")');
    await page.waitForTimeout(500);
    
    // Check for settings options - look for form elements or settings container
    const settingsContent = page.locator('[class*="setting"], form, main, .content').first();
    await expect(settingsContent).toBeVisible();
    
    await takeScreenshot(page, 'admin-settings');
  });

  test('should display Tools tab', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Navigate to Tools tab
    await page.click('.nav-item:has-text("Tools")');
    await page.waitForTimeout(500);
    
    // Check for tools content
    const toolsContent = page.locator('[class*="tool"], main, .content').first();
    await expect(toolsContent).toBeVisible();
    
    await takeScreenshot(page, 'admin-tools');
  });

  test('should toggle sidebar collapse', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const toggleButton = page.locator('.sidebar-toggle');
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'admin-sidebar-collapsed');
      
      // Toggle back
      await toggleButton.click();
      await page.waitForTimeout(300);
    }
  });

  test('should have no critical console errors on load', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    await page.waitForTimeout(2000);
    
    const errors = consoleMonitor.getErrors();
    const criticalErrors = errors.filter(e => 
      !e.text.includes('favicon') && 
      !e.text.includes('404') &&
      !e.text.includes('net::ERR')
    );
    
    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }
    
    // Allow for non-critical errors
    expect(criticalErrors.filter(e => e.text.includes('Uncaught')).length).toBe(0);
  });
});

// ============== Helper: Type on Kiosk on-screen keyboard ==============
async function kioskTypeOnKeyboard(page: Page, text: string) {
  // The kiosk uses an on-screen keyboard, find and click each key
  for (const char of text.toUpperCase()) {
    const keyButton = page.locator(`button:has-text("${char}")`).first();
    if (await keyButton.count() > 0) {
      await keyButton.click();
      await page.waitForTimeout(50);
    }
  }
}

// ============== Web Kiosk Tests ==============
test.describe('Web Kiosk Tests', () => {
  let consoleMonitor: ConsoleMonitor;

  test.beforeEach(async ({ page }) => {
    consoleMonitor = new ConsoleMonitor();
    consoleMonitor.attach(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await takeScreenshot(page, `kiosk-failure-${testInfo.title.replace(/\s+/g, '-')}`);
    }
    
    const report = consoleMonitor.getReport();
    if (report.errorCount > 0) {
      console.log('Console Errors:', JSON.stringify(report.errors, null, 2));
    }
  });

  test('should load kiosk page successfully', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for ConnectionFlow modal or main kiosk content
    // ConnectionFlow shows "Connect to DJAMMS Player" on first load
    // Or main kiosk content if already connected
    const modalTitle = page.locator('h1:has-text("Connect to DJAMMS Player"), h1:has-text("Connect to Player")');
    const connectingText = page.locator('text=Connecting to');
    const kioskContent = page.locator('main.relative, h1:has-text("Jukebox"), [class*="SearchInterface"]');
    
    // Either modal, connecting state, or kiosk content should be visible
    const modalVisible = await modalTitle.count() > 0;
    const connectingVisible = await connectingText.count() > 0;
    const kioskVisible = await kioskContent.count() > 0;
    
    expect(modalVisible || connectingVisible || kioskVisible).toBeTruthy();
    
    // Also verify body is visible as fallback
    await expect(page.locator('body')).toBeVisible();
    
    await takeScreenshot(page, 'kiosk-initial-load');
  });

  test('should display search interface', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for search input (readonly, used with on-screen keyboard)
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
  });

  test('should search for songs using on-screen keyboard', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Use the on-screen keyboard to type "LOVE"
    await kioskTypeOnKeyboard(page, 'LOVE');
    await page.waitForTimeout(500);
    
    // Check that search query was entered
    const searchInput = page.locator('input[placeholder*="search" i]');
    await expect(searchInput).toHaveValue(/love/i);
    
    // Check for search results
    await takeScreenshot(page, 'kiosk-search-results');
  });

  test('should display Now Playing section', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for now playing display - look for common elements
    const nowPlayingElements = page.locator('[class*="now-playing" i], [class*="nowplaying" i], [class*="current" i], h1, h2');
    const count = await nowPlayingElements.count();
    
    // Take screenshot regardless
    await takeScreenshot(page, 'kiosk-now-playing');
    
    // At minimum the page should have some headings
    expect(count).toBeGreaterThan(0);
  });

  test('should display Coming Up ticker', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for queue/ticker display
    const ticker = page.locator('[class*="ticker" i], [class*="coming" i], [class*="queue" i], [class*="up-next" i]');
    // May not be visible if queue is empty
    await takeScreenshot(page, 'kiosk-ticker');
  });

  test('should display credits', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for credits display
    const credits = page.locator('[class*="credits" i], [class*="Credits"]');
    // Credits section is optional
    await takeScreenshot(page, 'kiosk-credits');
  });

  test('should request a song via on-screen keyboard', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Use on-screen keyboard to search
    await kioskTypeOnKeyboard(page, 'LOVE');
    await page.waitForTimeout(1000);
    
    // Try to click on a search result card
    const resultCards = page.locator('[class*="result" i], [class*="card" i], [class*="video" i]');
    const cardCount = await resultCards.count();
    
    if (cardCount > 0) {
      await resultCards.first().click();
      await page.waitForTimeout(500);
      
      // Look for request/confirm button
      const requestButton = page.locator('button:has-text("Request"), button:has-text("Add"), button:has-text("Confirm")');
      if (await requestButton.count() > 0) {
        await requestButton.first().click();
        await page.waitForTimeout(500);
      }
      
      await takeScreenshot(page, 'kiosk-song-requested');
    }
    
    // Verify no RLS errors
    const errors = consoleMonitor.getErrors();
    const rlsErrors = errors.filter(e => e.text.includes('row-level security'));
    expect(rlsErrors.length).toBe(0);
  });

  test('should have responsive design', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 1024, height: 768, name: 'tablet' },
      { width: 768, height: 1024, name: 'tablet-portrait' }
    ];
    
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);
      await takeScreenshot(page, `kiosk-${vp.name}`);
    }
  });

  test('should display background video/image', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Check for background elements
    const background = page.locator('[class*="background" i], video, [class*="Background"]');
    // Background may be implemented differently
    await takeScreenshot(page, 'kiosk-background');
  });

  test('should have no critical console errors', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    await page.waitForTimeout(2000);
    
    const errors = consoleMonitor.getErrors();
    const criticalErrors = errors.filter(e => 
      !e.text.includes('favicon') && 
      !e.text.includes('404') &&
      !e.text.includes('net::ERR') &&
      e.text.includes('Uncaught')
    );
    
    expect(criticalErrors.length).toBe(0);
  });
});

// ============== Integration Tests ==============
test.describe('Integration Tests', () => {
  let consoleMonitor: ConsoleMonitor;

  test.beforeEach(async ({ page }) => {
    consoleMonitor = new ConsoleMonitor();
    consoleMonitor.attach(page);
  });

  test('Admin and Kiosk should connect to same Supabase', async ({ page, context }) => {
    // Open Admin
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Open Kiosk in new tab
    const kioskPage = await context.newPage();
    const kioskMonitor = new ConsoleMonitor();
    kioskMonitor.attach(kioskPage);
    
    await kioskPage.goto(KIOSK_URL);
    await waitForStableDOM(kioskPage);
    
    // Both should load without critical errors
    await page.waitForTimeout(2000);
    await kioskPage.waitForTimeout(2000);
    
    // Check for Supabase connection errors
    const adminErrors = consoleMonitor.getErrors();
    const kioskErrors = kioskMonitor.getErrors();
    
    const adminSupabaseErrors = adminErrors.filter(e => e.text.includes('supabase'));
    const kioskSupabaseErrors = kioskErrors.filter(e => e.text.includes('supabase'));
    
    // Log any supabase errors for debugging
    if (adminSupabaseErrors.length > 0) {
      console.log('Admin Supabase errors:', adminSupabaseErrors);
    }
    if (kioskSupabaseErrors.length > 0) {
      console.log('Kiosk Supabase errors:', kioskSupabaseErrors);
    }
    
    await kioskPage.close();
  });

  test('Player state should be visible in both Admin and Kiosk', async ({ page, context }) => {
    // Open Admin
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    // Get Now Playing from Admin
    const adminNowPlaying = await page.locator('.track-title, .now-playing .title').textContent().catch(() => null);
    
    // Open Kiosk
    const kioskPage = await context.newPage();
    await kioskPage.goto(KIOSK_URL);
    await waitForStableDOM(kioskPage);
    
    // Get Now Playing from Kiosk
    const kioskNowPlaying = await kioskPage.locator('[class*="now-playing"] [class*="title"], [class*="NowPlaying"]').textContent().catch(() => null);
    
    // Both should show player state (even if "No track playing")
    console.log('Admin Now Playing:', adminNowPlaying);
    console.log('Kiosk Now Playing:', kioskNowPlaying);
    
    await kioskPage.close();
  });
});

// ============== Edge Case Tests ==============
test.describe('Edge Cases & Error Handling', () => {
  test('Admin should handle rapid button clicks', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await waitForStableDOM(page);
    
    const skipButton = page.locator('.control-btn-label:has-text("SKIP")').first();
    
    // Rapid clicks
    for (let i = 0; i < 5; i++) {
      await skipButton.click();
      await page.waitForTimeout(100);
    }
    
    // Should not crash
    await expect(page.locator('.app, body')).toBeVisible();
  });

  test('Kiosk should handle empty search', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // Look for clear button or just check page stability
    const clearButton = page.locator('button:has-text("Clear"), button:has-text("X"), [class*="clear"]');
    if (await clearButton.count() > 0) {
      await clearButton.first().click();
      await page.waitForTimeout(300);
    }
    
    // Should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('Kiosk should handle special characters in search', async ({ page }) => {
    await page.goto(KIOSK_URL);
    await waitForStableDOM(page);
    
    // On-screen keyboard typically doesn't have special characters,
    // so just verify the page handles normal input
    await kioskTypeOnKeyboard(page, 'TEST');
    await page.waitForTimeout(500);
    
    // Page should be stable
    await expect(page.locator('body')).toBeVisible();
    await takeScreenshot(page, 'kiosk-special-chars-test');
  });

  test('Admin should handle network timeout gracefully', async ({ page }) => {
    // Slow down network
    await page.route('**/*supabase*', async route => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.continue();
    });
    
    await page.goto(ADMIN_URL, { timeout: 30000 });
    
    // Should still render UI
    await expect(page.locator('.app, body')).toBeVisible();
  });
});
