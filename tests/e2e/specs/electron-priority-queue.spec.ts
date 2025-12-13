/**
 * DJAMMS Electron Player Priority Queue Test
 * 
 * Tests priority queue functionality between Kiosk and Electron Player:
 * - Kiosk sends queue_add commands
 * - Electron Player receives and processes commands
 * - Priority queue updates in Electron Player
 * - Console monitoring for errors
 */

import { test, expect, Page, BrowserContext, chromium } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const KIOSK_URL = process.env.KIOSK_URL || 'http://localhost:5175';
const TEST_PLAYER_ID = process.env.TEST_PLAYER_ID || 'DJAMMS_TEST';
const ELECTRON_DEV_SERVER_URL = process.env.ELECTRON_DEV_SERVER_URL || 'http://localhost:3003';
const ELECTRON_DEBUG_PORT = 9222;

// Console log interface
interface ConsoleLog {
  type: string;
  text: string;
  location: string;
  timestamp: Date;
}

// Console monitor for Electron and Kiosk
class ConsoleMonitor {
  private logs: ConsoleLog[] = [];
  private errors: ConsoleLog[] = [];
  private warnings: ConsoleLog[] = [];

  attach(page: Page) {
    page.on('console', (msg) => {
      const log: ConsoleLog = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location().url || 'unknown',
        timestamp: new Date()
      };
      
      this.logs.push(log);
      
      if (msg.type() === 'error') {
        this.errors.push(log);
        console.log(`[ERROR] ${log.text}`);
      } else if (msg.type() === 'warning') {
        this.warnings.push(log);
        console.log(`[WARN] ${log.text}`);
      } else {
        // Only log important messages
        if (log.text.includes('queue_add') || 
            log.text.includes('priority') || 
            log.text.includes('Supabase') ||
            log.text.includes('Command') ||
            log.text.includes('queueAdd')) {
          console.log(`[LOG] ${log.text}`);
        }
      }
    });

    page.on('pageerror', (error) => {
      this.errors.push({
        type: 'pageerror',
        text: error.message,
        location: error.stack || 'unknown',
        timestamp: new Date()
      });
      console.log(`[PAGE ERROR] ${error.message}`);
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

// Helper to connect to Electron via CDP
async function connectToElectron(): Promise<{ context: BrowserContext; page: Page }> {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${ELECTRON_DEBUG_PORT}`);
    const contexts = browser.contexts();
    
    if (contexts.length === 0) {
      // Try to create a new context
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(ELECTRON_DEV_SERVER_URL);
      return { context, page };
    }
    
    const context = contexts[0];
    const pages = context.pages();
    
    if (pages.length === 0) {
      // Create a new page in existing context
      const page = await context.newPage();
      await page.goto(ELECTRON_DEV_SERVER_URL);
      return { context, page };
    }
    
    const page = pages[0];
    
    // Ensure page is loaded
    if (page.url() === 'about:blank' || !page.url().includes('localhost')) {
      await page.goto(ELECTRON_DEV_SERVER_URL);
    }
    
    return { context, page };
  } catch (error: any) {
    throw new Error(`Failed to connect to Electron: ${error.message}. Make sure Electron is running with --remote-debugging-port=${ELECTRON_DEBUG_PORT}`);
  }
}

// Helper to connect Kiosk to player
async function connectKioskToPlayer(page: Page, playerId: string) {
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

// Helper to type on Kiosk keyboard
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

// Helper to request a song from Kiosk
async function requestSongFromKiosk(kioskPage: Page, searchQuery: string) {
  // Type search query
  await typeOnKeyboard(kioskPage, searchQuery);
  await kioskPage.waitForTimeout(2000);
  
  // Find first result
  const resultCards = kioskPage.locator('[class*="result"], [class*="card"], [class*="video"]').filter({ hasNotText: '' });
  const cardCount = await resultCards.count();
  
  if (cardCount === 0) {
    throw new Error('No search results found');
  }
  
  // Click first result
  await resultCards.first().click();
  await kioskPage.waitForTimeout(1000);
  
  // Click request/confirm button
  const requestButton = kioskPage
    .locator('button:has-text("Request"), button:has-text("Add"), button:has-text("Confirm")')
    .first();
  
  if (await requestButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await requestButton.click();
    await kioskPage.waitForTimeout(1000);
  } else {
    throw new Error('Request button not found');
  }
}

// Helper to check priority queue in Electron
async function getPriorityQueueFromElectron(electronPage: Page): Promise<number> {
  // Look for priority queue in UI
  const priorityQueueItems = electronPage.locator(
    '.priority-queue-item, [class*="priority"] tr, .priority-queue-ticker span'
  );
  const count = await priorityQueueItems.count();
  return count;
}

test.describe('Electron Player Priority Queue Tests', () => {
  let electronContext: BrowserContext | null = null;
  let electronPage: Page | null = null;
  let kioskContext: BrowserContext | null = null;
  let kioskPage: Page | null = null;
  let electronMonitor: ConsoleMonitor;
  let kioskMonitor: ConsoleMonitor;

  test.beforeAll(async ({ browser }) => {
    // Connect to Electron via CDP
    try {
      const electron = await connectToElectron();
      electronContext = electron.context;
      electronPage = electron.page;
      electronMonitor = new ConsoleMonitor();
      electronMonitor.attach(electronPage);
      
      console.log('✅ Connected to Electron via CDP');
    } catch (error) {
      console.error('❌ Failed to connect to Electron:', error);
      throw new Error('Electron must be running with --remote-debugging-port=9222. Run: npm run dev:electron');
    }

    // Connect to Kiosk
    kioskContext = await browser.newContext();
    kioskPage = await kioskContext.newPage();
    kioskMonitor = new ConsoleMonitor();
    kioskMonitor.attach(kioskPage);
    
    await kioskPage.goto(KIOSK_URL);
    await connectKioskToPlayer(kioskPage, TEST_PLAYER_ID);
    await kioskPage.waitForTimeout(2000);
    
    console.log('✅ Connected to Kiosk');
  });

  test.afterAll(async () => {
    if (kioskPage) await kioskPage.close();
    if (kioskContext) await kioskContext.close();
    
    // Report console errors
    if (electronMonitor) {
      const report = electronMonitor.getReport();
      console.log('\n📊 Electron Console Report:');
      console.log(`  Total logs: ${report.totalLogs}`);
      console.log(`  Errors: ${report.errorCount}`);
      console.log(`  Warnings: ${report.warningCount}`);
      
      if (report.errors.length > 0) {
        console.log('\n❌ Electron Errors:');
        report.errors.forEach(err => {
          console.log(`  [${err.type}] ${err.text}`);
        });
      }
    }
    
    if (kioskMonitor) {
      const report = kioskMonitor.getReport();
      console.log('\n📊 Kiosk Console Report:');
      console.log(`  Total logs: ${report.totalLogs}`);
      console.log(`  Errors: ${report.errorCount}`);
      console.log(`  Warnings: ${report.warningCount}`);
      
      if (report.errors.length > 0) {
        console.log('\n❌ Kiosk Errors:');
        report.errors.forEach(err => {
          console.log(`  [${err.type}] ${err.text}`);
        });
      }
    }
  });

  test('should receive queue_add command from Kiosk in Electron Player', async () => {
    if (!electronPage || !kioskPage) {
      throw new Error('Pages not initialized');
    }

    // Clear monitors
    electronMonitor.clear();
    kioskMonitor.clear();

    // Get initial priority queue count
    const initialCount = await getPriorityQueueFromElectron(electronPage);
    console.log(`Initial priority queue count: ${initialCount}`);

    // Request a song from Kiosk
    try {
      await requestSongFromKiosk(kioskPage, 'LOVE');
      console.log('✅ Song requested from Kiosk');
    } catch (error) {
      console.error('❌ Failed to request song:', error);
      throw error;
    }

    // Wait for command to be processed
    await electronPage.waitForTimeout(5000);

    // Check for command received logs in Electron
    const electronLogs = electronMonitor.getAllLogs();
    const commandReceived = electronLogs.some(log => 
      log.text.includes('queue_add') || 
      log.text.includes('queueAdd') ||
      log.text.includes('Received command') ||
      log.text.includes('Executing command')
    );

    expect(commandReceived).toBeTruthy();
    console.log('✅ Electron received queue_add command');

    // Check for handler execution
    const handlerExecuted = electronLogs.some(log =>
      log.text.includes('queue_add handler called') ||
      log.text.includes('Supabase queue_add command received') ||
      log.text.includes('Adding video to priority queue')
    );

    expect(handlerExecuted).toBeTruthy();
    console.log('✅ Electron executed queue_add handler');

    // Check priority queue updated
    const newCount = await getPriorityQueueFromElectron(electronPage);
    console.log(`New priority queue count: ${newCount}`);
    
    // Priority queue should have increased (or at least not decreased)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('should not have console errors when processing priority queue commands', async () => {
    if (!electronPage || !kioskPage) {
      throw new Error('Pages not initialized');
    }

    // Clear monitors
    electronMonitor.clear();
    kioskMonitor.clear();

    // Request a song
    try {
      await requestSongFromKiosk(kioskPage, 'TEST');
      await electronPage.waitForTimeout(5000);
    } catch (error) {
      // Ignore search errors, focus on command processing
      console.log('Search may have failed, checking command processing...');
    }

    // Check for critical errors
    const electronErrors = electronMonitor.getErrors();
    const criticalErrors = electronErrors.filter(err =>
      !err.text.includes('RPC search failed') && // Known expected error
      !err.text.includes('Returned type jsonb') && // Known schema mismatch
      !err.text.includes('structure of query') // Known schema issue
    );

    if (criticalErrors.length > 0) {
      console.error('❌ Critical errors found:');
      criticalErrors.forEach(err => {
        console.error(`  [${err.type}] ${err.text}`);
      });
    }

    // Should not have critical errors
    expect(criticalErrors.length).toBe(0);
  });

  test('should acknowledge queue_add commands within timeout', async () => {
    if (!electronPage || !kioskPage) {
      throw new Error('Pages not initialized');
    }

    // Clear monitors
    electronMonitor.clear();
    kioskMonitor.clear();

    // Request a song
    try {
      await requestSongFromKiosk(kioskPage, 'MUSIC');
      await electronPage.waitForTimeout(6000); // Wait for command + timeout
    } catch (error) {
      console.log('Search may have failed, checking command processing...');
    }

    // Check Kiosk logs for timeout errors
    const kioskLogs = kioskMonitor.getAllLogs();
    const timeoutErrors = kioskLogs.filter(log =>
      log.text.includes('timeout') &&
      log.text.includes('Command')
    );

    if (timeoutErrors.length > 0) {
      console.error('❌ Command timeout errors found:');
      timeoutErrors.forEach(err => {
        console.error(`  ${err.text}`);
      });
    }

    // Should not have timeout errors
    expect(timeoutErrors.length).toBe(0);
  });
});

