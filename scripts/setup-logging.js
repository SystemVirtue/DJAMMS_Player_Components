#!/usr/bin/env node
/**
 * Setup centralized logging for development
 * 
 * This script configures file-based logging so Cursor Agent can access
 * real-time logs from Electron main, renderer, and Vite dev server.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const MAIN_LOG = path.join(LOGS_DIR, 'electron-main.log');
const RENDERER_LOG = path.join(LOGS_DIR, 'electron-renderer.log');
const VITE_LOG = path.join(LOGS_DIR, 'vite-dev.log');
const COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`✅ Created logs directory: ${LOGS_DIR}`);
}

// Create .gitignore entry for logs (if .gitignore exists)
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignore.includes('logs/')) {
    fs.appendFileSync(gitignorePath, '\n# Development logs\nlogs/\n');
    console.log('✅ Added logs/ to .gitignore');
  }
}

console.log('✅ Logging setup complete!');
console.log(`   Logs will be written to: ${LOGS_DIR}`);
console.log(`   - Main process: ${MAIN_LOG}`);
console.log(`   - Renderer process: ${RENDERER_LOG}`);
console.log(`   - Vite dev server: ${VITE_LOG}`);
console.log(`   - Combined: ${COMBINED_LOG}`);

