// electron/main.js - Electron Main Process
const { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store').default || require('electron-store');

// ============================================================================
// FILE-BASED LOGGING FOR CURSOR AGENT ACCESS
// ============================================================================
// Use app.getPath('logs') for writable location (works in both dev and production)
// In packaged apps, __dirname points to ASAR archive which is read-only
let LOGS_DIR = null;
let MAIN_LOG = null;
let RENDERER_LOG = null;
let COMBINED_LOG = null;

// Initialize logs directory (can be called before app is ready - app.getPath works early)
function initializeLogsDirectory() {
  if (LOGS_DIR) return; // Already initialized
  
  // Use Electron's logs directory (writable location)
  // In dev: ~/Library/Logs/DJAMMS Player (macOS) or %APPDATA%\DJAMMS Player\logs (Windows)
  // In production: same, but guaranteed to be writable
  // Note: app.getPath() can be called before app.whenReady() for most paths
  try {
    if (app && typeof app.getPath === 'function') {
      LOGS_DIR = app.getPath('logs');
      MAIN_LOG = path.join(LOGS_DIR, 'electron-main.log');
      RENDERER_LOG = path.join(LOGS_DIR, 'electron-renderer.log');
      COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');
      
      // Ensure logs directory exists
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
    } else {
      throw new Error('app.getPath not available');
    }
  } catch (error) {
    // Fallback to userData if logs path fails
    try {
      if (app && typeof app.getPath === 'function') {
        LOGS_DIR = path.join(app.getPath('userData'), 'logs');
        MAIN_LOG = path.join(LOGS_DIR, 'electron-main.log');
        RENDERER_LOG = path.join(LOGS_DIR, 'electron-renderer.log');
        COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');
        
        if (!fs.existsSync(LOGS_DIR)) {
          fs.mkdirSync(LOGS_DIR, { recursive: true });
        }
      } else {
        throw new Error('app.getPath not available for fallback');
      }
    } catch (fallbackError) {
      // Last resort: use temp directory (should never happen in normal operation)
      const os = require('os');
      LOGS_DIR = path.join(os.tmpdir(), 'djamms-logs');
      MAIN_LOG = path.join(LOGS_DIR, 'electron-main.log');
      RENDERER_LOG = path.join(LOGS_DIR, 'electron-renderer.log');
      COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');
      
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
    }
  }
}

// Initialize logs directory early (app.getPath works before app.whenReady())
// This ensures logs are available when console overrides are called
initializeLogsDirectory();

// Helper to write to log files
function writeToLogFile(logPath, level, ...args) {
  try {
    // Initialize logs directory if not already done
    if (!LOGS_DIR) {
      initializeLogsDirectory();
    }
    
    // Re-initialize log paths if they're null
    if (!MAIN_LOG || !RENDERER_LOG || !COMBINED_LOG) {
      initializeLogsDirectory();
    }
    
    // If logPath is null or initialization failed, skip logging
    if (!logPath || !LOGS_DIR) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logPath, logLine, 'utf8');
    // Also append to combined log
    if (COMBINED_LOG) {
      fs.appendFileSync(COMBINED_LOG, `[${timestamp}] [${level.toUpperCase()}] [${path.basename(logPath)}] ${message}\n`, 'utf8');
    }
  } catch (error) {
    // Silently fail if log files can't be written
  }
}

// Safe console logging to prevent EPIPE errors
// Wrap console methods to catch EPIPE errors when stdout/stderr are closed
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Helper to safely write to console streams
const safeConsoleWrite = (stream, originalMethod, args) => {
  try {
    // Check stream state before writing
    if (!stream || stream.destroyed || !stream.writable) {
      return false;
    }
    
    // Attempt the write
    originalMethod.apply(console, args);
    return true;
  } catch (err) {
    // Ignore EPIPE, ENOTCONN, and other stream errors
    if (err.code === 'EPIPE' || err.code === 'ENOTCONN' || err.code === 'ECONNRESET') {
      return false;
    }
    // Re-throw unexpected errors
    throw err;
  }
};

console.log = (...args) => {
  try {
    // Try to write to stdout, but don't fail if it's closed
    safeConsoleWrite(process.stdout, originalLog, args);
    
    // Always write to log file (this should never fail with EPIPE)
    try {
      // Ensure logs are initialized before writing
      if (!MAIN_LOG) {
        initializeLogsDirectory();
      }
      writeToLogFile(MAIN_LOG, 'log', ...args);
    } catch (logErr) {
      // Silently ignore log file errors
    }
  } catch (err) {
    // Catch any unexpected errors and ignore them
    // EPIPE errors are already handled in safeConsoleWrite
    if (err.code !== 'EPIPE' && err.code !== 'ENOTCONN' && err.code !== 'ECONNRESET') {
      // Only log unexpected errors if we can
      try {
        if (process.stderr && !process.stderr.destroyed && process.stderr.writable) {
          originalError.apply(console, ['[Console Log Error]', err.message]);
        }
      } catch {}
    }
  }
};

console.error = (...args) => {
  try {
    // Try to write to stderr, but don't fail if it's closed
    safeConsoleWrite(process.stderr, originalError, args);
    
    // Always write to log file
    try {
      // Ensure logs are initialized before writing
      if (!MAIN_LOG) {
        initializeLogsDirectory();
      }
      writeToLogFile(MAIN_LOG, 'error', ...args);
    } catch (logErr) {
      // Silently ignore log file errors
    }
  } catch (err) {
    // Ignore all errors - can't log if streams are closed
    // EPIPE errors are already handled in safeConsoleWrite
  }
};

console.warn = (...args) => {
  try {
    // Try to write to stdout, but don't fail if it's closed
    safeConsoleWrite(process.stdout, originalWarn, args);
    
    // Also write to log file
    try {
      // Ensure logs are initialized before writing
      if (!MAIN_LOG) {
        initializeLogsDirectory();
      }
      writeToLogFile(MAIN_LOG, 'warn', ...args);
    } catch (logErr) {
      // Silently ignore log file errors
    }
  } catch (err) {
    // Ignore all errors - can't log if streams are closed
    // EPIPE errors are already handled in safeConsoleWrite
  }
};

// Handle uncaught exceptions, especially EPIPE errors from console writes
process.on('uncaughtException', (error) => {
  // Silently ignore EPIPE errors (broken pipe - stdout/stderr closed)
  if (error.code === 'EPIPE' || error.code === 'ENOTCONN' || error.code === 'ECONNRESET') {
    // These are harmless - streams are closed, nothing we can do
    return;
  }
  
  // Log other uncaught exceptions to file (don't try console)
  try {
    writeToLogFile(MAIN_LOG, 'error', 'Uncaught Exception:', error.message, error.stack);
  } catch (logErr) {
    // Can't even log to file - silently fail
  }
  
  // Re-throw non-EPIPE errors so they're still visible in dev tools
  // but won't crash the app in production
  if (process.env.NODE_ENV === 'development') {
    throw error;
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  // Ignore EPIPE-related rejections
  if (reason && typeof reason === 'object' && (reason.code === 'EPIPE' || reason.code === 'ENOTCONN' || reason.code === 'ECONNRESET')) {
    return;
  }
  
  // Log other rejections to file
  try {
    writeToLogFile(MAIN_LOG, 'error', 'Unhandled Rejection:', reason);
  } catch (logErr) {
    // Can't log - silently fail
  }
});

// Initialize persistent storage
const store = new Store({
  name: 'djamms-config',
  defaults: {
    volume: 0.7,
    muted: false,
    playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS',
    recentSearches: [],
    windowBounds: { width: 1200, height: 800 }
  }
});

// QueueManager - Centralized queue state management
// NOTE: QueueManager is available but not yet fully integrated.
// Current implementation uses queueState object directly for backward compatibility.
// Future refactor: Replace queueState with QueueManager instance.
const QueueManager = require('./queue-manager.cjs');

// Keep global references to prevent garbage collection
let mainWindow = null;
let fullscreenWindow = null;
let adminConsoleWindow = null;

// Queue state (can be replaced with QueueManager instance in future)
let queueState = {
  activeQueue: [],
  priorityQueue: [],
  nowPlaying: null,
  nowPlayingSource: null,
  queueIndex: 0,
  isPlaying: false
};

// Helper to broadcast queue state to renderer
function broadcastQueueState() {
  // Include currentVideo as alias for nowPlaying for renderer compatibility
  const stateToSend = {
    ...queueState,
    currentVideo: queueState.nowPlaying
  };
  if (mainWindow) {
    mainWindow.webContents.send('queue-state', stateToSend);
  }
  if (fullscreenWindow) {
    fullscreenWindow.webContents.send('queue-state', stateToSend);
  }
}

// Determine if running in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:3003';

// Register custom protocol for serving local files
// This must be done BEFORE app is ready - use app.on('ready') or register synchronously
// For dev mode, we'll register it when app is ready (before windows are created)
app.whenReady().then(() => {
  // Register a custom protocol to serve local files with Range request support
  // This is CRITICAL for seeking to work properly (prevents MEDIA_NETWORK_ERR)
  // Using registerFileProtocol which automatically handles Range requests in Electron
  protocol.registerFileProtocol('djamms', (request, callback) => {
    const url = request.url;
    // Remove protocol prefix: djamms://
    let filePath = url.replace(/^djamms:\/\//, '');
    
    try {
      // The path should NOT be encoded (we fixed the double-encoding issue)
      // But handle both cases: encoded and unencoded
      let decodedPath = filePath;
      
      // Try to decode if it looks encoded (contains %)
      if (filePath.includes('%')) {
        try {
          decodedPath = decodeURIComponent(filePath);
          console.log('[Electron] djamms:// protocol request (decoded):', { url, original: filePath, decoded: decodedPath });
        } catch (e) {
          // If decoding fails, use the path as-is
          console.log('[Electron] djamms:// protocol request (not encoded):', { url, path: filePath });
          decodedPath = filePath;
        }
      } else {
        console.log('[Electron] djamms:// protocol request (unencoded):', { url, path: filePath });
        decodedPath = filePath;
      }
      
      // Normalize the path - handle both absolute and relative paths
      // On macOS, paths from file:// URLs are already absolute (/Users/...)
      // Don't modify paths that are already absolute
      let normalizedPath = decodedPath;
      if (!path.isAbsolute(decodedPath)) {
        // If relative, make it absolute (shouldn't happen, but handle it)
        normalizedPath = path.resolve(decodedPath);
      } else {
        // Already absolute, but ensure it's normalized (resolves .. and .)
        normalizedPath = path.normalize(decodedPath);
      }
      
      // Verify file exists
      if (!fs.existsSync(normalizedPath)) {
        console.error('[Electron] ❌ File not found via djamms://');
        console.error('[Electron] ❌ Original URL:', url);
        console.error('[Electron] ❌ Decoded path:', decodedPath);
        console.error('[Electron] ❌ Normalized path:', normalizedPath);
        callback({ error: -2 }); // FILE_NOT_FOUND
        return;
      }
      
      // Get file stats for logging
      const stats = fs.statSync(normalizedPath);
      
      // Log request details for debugging
      const rangeHeader = request.headers && request.headers.Range;
      if (rangeHeader) {
        console.log(`[Electron] 📦 Range request: ${rangeHeader} for ${path.basename(normalizedPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        console.log(`[Electron] ✅ Full file request: ${path.basename(normalizedPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`[Electron] ✅ Full path: ${normalizedPath}`);
      }
      
      // registerFileProtocol automatically handles Range requests in Electron
      // Return the normalized absolute path
      callback({ path: normalizedPath });
    } catch (error) {
      console.error('[Electron] ❌ Error serving file via custom protocol:', error);
      callback({ error: -2 }); // FILE_NOT_FOUND
    }
  });
  console.log('[Electron] ✅ Registered custom protocol "djamms://" with Range request support for seeking');
});

function getAssetPath(...paths) {
  if (isDev) {
    return path.join(__dirname, '..', ...paths);
  }
  return path.join(process.resourcesPath, 'app', ...paths);
}

function createMainWindow() {
  const { width, height } = store.get('windowBounds');
  
  console.log('[Electron] Creating main window...');
  const preloadPath = path.join(__dirname, 'preload.cjs');
  console.log('[Electron] Preload path:', preloadPath);
  console.log('[Electron] Preload exists:', fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath,
      webSecurity: !isDev // Disable webSecurity in dev mode to allow file:// URLs
    },
    show: false // Don't show until ready
  });
  
  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] ✅ Window ready to show');
    mainWindow.show();
  });
  
  // Load the app
  let serverCheckTimeout = null;
  let hasLoaded = false;
  
  if (isDev) {
    console.log('[Electron] Development mode - loading from Vite dev server:', VITE_DEV_SERVER_URL);
    // Wait for Vite dev server to be ready before loading (only once)
    const checkServer = () => {
      if (hasLoaded) {
        // Clear any pending timeouts if page is already loaded
        if (serverCheckTimeout) {
          clearTimeout(serverCheckTimeout);
          serverCheckTimeout = null;
        }
        return;
      }
      
      const http = require('http');
      const req = http.get(VITE_DEV_SERVER_URL, (res) => {
        if (res.statusCode === 200 && !hasLoaded) {
          hasLoaded = true;
          console.log('[Electron] ✅ Vite dev server is ready, loading app...');
          mainWindow.loadURL(VITE_DEV_SERVER_URL).then(() => {
            console.log('[Electron] ✅ App loaded successfully');
            mainWindow.webContents.openDevTools();
          }).catch((err) => {
            console.error('[Electron] ❌ Failed to load URL:', err);
            hasLoaded = false; // Allow retry on error
          });
        } else if (!hasLoaded) {
          console.log('[Electron] ⏳ Vite dev server not ready yet (status:', res.statusCode, '), retrying...');
          serverCheckTimeout = setTimeout(checkServer, 1000);
        }
      });
      req.on('error', (err) => {
        if (!hasLoaded) {
          console.log('[Electron] ⏳ Vite dev server not ready yet (error:', err.message, '), retrying...');
          serverCheckTimeout = setTimeout(checkServer, 1000);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (!hasLoaded) {
          console.log('[Electron] ⏳ Vite dev server check timeout, retrying...');
          serverCheckTimeout = setTimeout(checkServer, 1000);
        }
      });
    };
    checkServer();
  } else {
    console.log('[Electron] Production mode - loading from dist');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // Log page load events
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[Electron] ✅ Page finished loading');
    hasLoaded = true; // Mark as loaded to stop server checks
    if (serverCheckTimeout) {
      clearTimeout(serverCheckTimeout);
      serverCheckTimeout = null;
    }
  });
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] ❌ Page failed to load:', errorCode, errorDescription, validatedURL);
    hasLoaded = false; // Allow retry on failure
  });
  
  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 0 ? 'log' : level === 1 ? 'warn' : 'error';
    console.log(`[Renderer ${levelStr}]`, message);
    // Also write to log file
    writeToLogFile(RENDERER_LOG, levelStr, message);
  });

  // Save window bounds on resize
  mainWindow.on('resize', () => {
    const { width, height } = mainWindow.getBounds();
    store.set('windowBounds', { width, height });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close all other windows when main closes
    if (fullscreenWindow) {
      fullscreenWindow.close();
      fullscreenWindow = null;
    }
    if (adminConsoleWindow) {
      adminConsoleWindow.close();
      adminConsoleWindow = null;
    }
  });

  // Create application menu
  createApplicationMenu();
}

function createFullscreenWindow(displayId, fullscreen = true) {
  // IMPORTANT: Close any existing fullscreen window to ensure only one exists at a time
  // This prevents errors where app reloads but previous player window isn't closed
  if (fullscreenWindow) {
    console.log('[Electron] ⚠️ Closing existing fullscreen window before creating new one (ensuring only one player window exists)');
    try {
      // Check if window is still valid before closing
      if (!fullscreenWindow.isDestroyed()) {
        fullscreenWindow.close();
      }
    } catch (error) {
      console.warn('[Electron] Error closing existing fullscreen window:', error);
    }
    fullscreenWindow = null;
  }
  
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId) || displays[displays.length - 1];

  // Windowed mode: use 80% of display size, centered, with frame
  // Fullscreen mode: use full display, no frame
  const windowWidth = fullscreen ? targetDisplay.size.width : Math.floor(targetDisplay.size.width * 0.8);
  const windowHeight = fullscreen ? targetDisplay.size.height : Math.floor(targetDisplay.size.height * 0.8);
  const windowX = fullscreen ? targetDisplay.bounds.x : targetDisplay.bounds.x + Math.floor((targetDisplay.size.width - windowWidth) / 2);
  const windowY = fullscreen ? targetDisplay.bounds.y : targetDisplay.bounds.y + Math.floor((targetDisplay.size.height - windowHeight) / 2);

  fullscreenWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    fullscreen: fullscreen,
    frame: !fullscreen, // Show frame in windowed mode
    backgroundColor: '#000000',
    alwaysOnTop: fullscreen, // Only always on top in fullscreen
    resizable: !fullscreen, // Allow resizing in windowed mode
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: !isDev // Disable webSecurity in dev mode to allow djamms:// protocol
    }
  });

  if (isDev) {
    const fullscreenUrl = `${VITE_DEV_SERVER_URL}/fullscreen.html`;
    console.log('[Electron] Loading fullscreen window from:', fullscreenUrl);
    fullscreenWindow.loadURL(fullscreenUrl);
  } else {
    const fullscreenPath = path.join(__dirname, '../dist/fullscreen.html');
    console.log('[Electron] Loading fullscreen window from:', fullscreenPath);
    fullscreenWindow.loadFile(fullscreenPath);
  }
  
  fullscreenWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] ✅ Fullscreen window finished loading');
  });
  
  fullscreenWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] ❌ Fullscreen window failed to load:', errorCode, errorDescription);
  });
  
  // Forward console messages from fullscreen window to main process
  fullscreenWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 0 ? 'log' : level === 1 ? 'warn' : 'error';
    console.log(`[FullscreenWindow ${levelStr}]:`, message);
    // Also write to log file
    writeToLogFile(RENDERER_LOG, levelStr, `[FullscreenWindow] ${message}`);
  });

  fullscreenWindow.on('closed', () => {
    console.log('[Electron] Fullscreen window closed');
    fullscreenWindow = null;
    // Notify main window
    if (mainWindow) {
      mainWindow.webContents.send('fullscreen-closed');
    }
  });

  return fullscreenWindow;
}

function createAdminConsoleWindow() {
  if (adminConsoleWindow) {
    adminConsoleWindow.focus();
    return adminConsoleWindow;
  }

  adminConsoleWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    adminConsoleWindow.loadURL(`${VITE_DEV_SERVER_URL}#/admin`);
  } else {
    adminConsoleWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/admin' });
  }

  adminConsoleWindow.on('closed', () => {
    adminConsoleWindow = null;
  });

  return adminConsoleWindow;
}

function createApplicationMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('open-settings');
            }
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Playlists Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Select Playlists Directory'
            });
            if (!result.canceled && result.filePaths[0]) {
              store.set('playlistsDirectory', result.filePaths[0]);
              if (mainWindow) {
                mainWindow.webContents.send('playlists-directory-changed', result.filePaths[0]);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Admin Console',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => createAdminConsoleWindow()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Playback',
      submenu: [
        {
          label: 'Play/Pause',
          accelerator: 'Space',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-playback');
            }
          }
        },
        {
          label: 'Skip',
          accelerator: 'CmdOrCtrl+Right',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('skip-video');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Volume Up',
          accelerator: 'CmdOrCtrl+Up',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('volume-up');
            }
          }
        },
        {
          label: 'Volume Down',
          accelerator: 'CmdOrCtrl+Down',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('volume-down');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/SystemVirtue/DJAMMS_Player_Components')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Queue command handler
ipcMain.on('queue-command', async (_event, command) => {
  try {
    const { action, payload } = command || {};
    switch (action) {
      case 'clear_queue':
        // #region agent log
        try {
          const logPath = path.join(__dirname, '../../.cursor/debug.log');
          const logData = {location:'main.cjs:530',message:'clear_queue command',data:{prevQueueIndex:queueState.queueIndex,prevQueueLength:queueState.activeQueue.length,prevNowPlaying:queueState.nowPlaying?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'};
          fs.appendFileSync(logPath, JSON.stringify(logData) + '\n', 'utf8');
        } catch(e) {}
        // #endregion
        // Clear both active queue and priority queue
        queueState.activeQueue = [];
        queueState.priorityQueue = [];
        queueState.queueIndex = 0;
        // Clear nowPlaying regardless of source (both queues are cleared)
        queueState.nowPlaying = null;
        queueState.nowPlayingSource = null;
        queueState.isPlaying = false;
        console.log('[main] ✅ Cleared both active queue and priority queue');
        break;
      case 'add_to_queue':
        if (payload?.video) {
          // Check if adding this video would create a duplicate at the next position after now-playing
          // This prevents the up-next video from being the same as now-playing
          if (queueState.activeQueue.length > 0) {
            const videoId = payload.video.id || payload.video.src;
            const currentVideoId = queueState.activeQueue[queueState.queueIndex]?.id || queueState.activeQueue[queueState.queueIndex]?.src;
            
            if (videoId === currentVideoId) {
              console.log('[main] ⚠️ Video is same as now-playing (index', queueState.queueIndex, '), skipping add to prevent duplicate up-next');
              break; // Don't add duplicate
            }
          }
          queueState.activeQueue.push(payload.video);
        }
        break;
      case 'add_to_priority_queue':
        if (payload?.video) {
          // Check if video already exists in priority queue (prevent duplicates)
          const videoId = payload.video.id || payload.video.src;
          const alreadyExists = queueState.priorityQueue.some(
            v => (v.id || v.src) === videoId
          );
          
          if (alreadyExists) {
            console.log('[main] ⚠️ Video already in priority queue, skipping duplicate:', payload.video.title);
          } else {
            queueState.priorityQueue.push(payload.video);
            console.log('[main] ✅ Added video to priority queue:', payload.video.title);
          }
        }
        break;
      case 'play_at_index': {
        // ARCHITECTURE: Index 0 is always now-playing
        // Move selected video to index 0, then play it
        const idx = payload?.index ?? 0;
        if (idx >= 0 && idx < queueState.activeQueue.length) {
          // Move video from idx to index 0
          const video = queueState.activeQueue[idx];
          queueState.activeQueue.splice(idx, 1); // Remove from current position
          queueState.activeQueue.unshift(video); // Add to index 0
          
          // Index 0 is now the selected video
          queueState.nowPlaying = queueState.activeQueue[0];
          queueState.nowPlayingSource = 'active';
          queueState.isPlaying = true;
          
          console.log('[main] Moved video to index 0 and playing:', video?.title);
          if (fullscreenWindow) {
            fullscreenWindow.webContents.send('control-player', { action: 'play', data: queueState.nowPlaying });
          }
        }
        break;
      }
      case 'shuffle_queue': {
        // ARCHITECTURE: Index 0 is always now-playing - NEVER shuffle index 0
        if (queueState.activeQueue.length <= 1) {
          // Nothing to shuffle (0 or 1 items)
          break;
        }
        
        // Only shuffle indices 1-end, never touch index 0
        const first = queueState.activeQueue[0]; // Keep index 0 (now-playing)
        const rest = queueState.activeQueue.slice(1); // Get indices 1-end
        
        // Shuffle the rest (indices 1-end)
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        
        // Reconstruct: index 0 stays the same, rest is shuffled
        queueState.activeQueue = [first, ...rest];
        console.log('[main] ✅ Shuffled queue (index 0 preserved):', queueState.activeQueue[0]?.title, 'at index 0');
        break;
      }
      case 'move_queue_item': {
        // ARCHITECTURE: Index 0 is always now-playing - prevent moving index 0
        const fromIndex = payload?.fromIndex ?? -1;
        const toIndex = payload?.toIndex ?? -1;
        
        // Prevent moving index 0 (now-playing)
        if (fromIndex === 0 || toIndex === 0) {
          console.log('[main] ⚠️ Cannot move index 0 (now-playing video)');
          break;
        }
        
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex < queueState.activeQueue.length && toIndex <= queueState.activeQueue.length) {
          const [movedVideo] = queueState.activeQueue.splice(fromIndex, 1);
          const adjustedTarget = fromIndex < toIndex ? toIndex - 1 : toIndex;
          queueState.activeQueue.splice(adjustedTarget, 0, movedVideo);
          console.log('[main] Moved video from index', fromIndex, 'to index', adjustedTarget, ':', movedVideo?.title);
        }
        break;
      }
      case 'remove_from_queue': {
        // ARCHITECTURE: Index 0 is always now-playing - prevent removing index 0
        const idx = payload?.index ?? -1;
        if (idx === 0) {
          console.log('[main] ⚠️ Cannot remove index 0 (now-playing video)');
          break;
        }
        
        if (idx >= 0 && idx < queueState.activeQueue.length) {
          const removedVideo = queueState.activeQueue.splice(idx, 1)[0];
          console.log('[main] Removed video from index', idx, ':', removedVideo?.title);
        }
        break;
      }
      case 'next': {
        // #region agent log
        try {
          const logPath = path.join(__dirname, '../../.cursor/debug.log');
          const logData = {location:'main.cjs:687',message:'next command received',data:{priorityQueueLength:queueState.priorityQueue.length,activeQueueLength:queueState.activeQueue.length,nowPlayingSource:queueState.nowPlayingSource,nowPlayingTitle:queueState.nowPlaying?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,E'};
          fs.appendFileSync(logPath, JSON.stringify(logData) + '\n', 'utf8');
        } catch(e) {}
        // #endregion
        console.log('[main] next command - priorityQueue.length:', queueState.priorityQueue.length, 'activeQueue.length:', queueState.activeQueue.length, 'nowPlayingSource:', queueState.nowPlayingSource);
        console.log('[main] Priority queue contents:', queueState.priorityQueue.map(v => v?.title || 'unknown').join(', '));
        
        // ARCHITECTURE: Index 0 is always now-playing
        // NEW PRIORITY QUEUE LOGIC:
        // 1. Check if current video at index 0 was from priority queue - if so, remove it (don't recycle)
        // 2. BEFORE moving index 0 to end, insert priority video into index 1 if available
        // 3. Move index 0 to end (recycle) - but ONLY if it was from active queue
        // 4. The new index 0 becomes the next video to play
        
        if (queueState.activeQueue.length > 0) {
          const currentVideoAt0 = queueState.activeQueue[0];
          const wasFromPriority = queueState.nowPlayingSource === 'priority';
          
          // Step 1: Handle the current video at index 0
          if (wasFromPriority) {
            // Current video was from priority queue - remove it entirely (don't recycle)
            console.log('[main] 🗑️ Removing priority queue video (not recycling):', currentVideoAt0?.title);
            queueState.activeQueue.shift(); // Remove from index 0
          }
          
          // Step 2: BEFORE moving index 0 to end, insert priority video into index 1 if available
          let priorityVideoInserted = false;
          if (queueState.priorityQueue.length > 0) {
            const priorityVideo = queueState.priorityQueue.shift();
            console.log('[main] 📥 Inserting priority video into index 1:', priorityVideo?.title, 'Remaining priority:', queueState.priorityQueue.length);
            queueState.activeQueue.splice(1, 0, priorityVideo); // Insert at index 1
            priorityVideoInserted = true;
          }
          
          // Step 3: Move index 0 to end (recycle) - but ONLY if it was from active queue
          if (!wasFromPriority && queueState.activeQueue.length > 0) {
            const currentVideo = queueState.activeQueue.shift(); // Remove from index 0
            queueState.activeQueue.push(currentVideo); // Add to end (recycle)
            console.log('[main] ♻️ Recycled active queue video to end:', currentVideo?.title);
          }
          
          // Step 4: The new index 0 is now the next video to play
          const nextVideo = queueState.activeQueue[0];
          
          if (nextVideo) {
            // Determine source: if we inserted a priority video, it's now at index 0
            queueState.nowPlaying = nextVideo;
            queueState.nowPlayingSource = priorityVideoInserted ? 'priority' : 'active';
            queueState.isPlaying = true;
            console.log('[main] 🎬 Next video:', nextVideo.title, 'Source:', queueState.nowPlayingSource);
            
            if (fullscreenWindow) {
              fullscreenWindow.webContents.send('control-player', { action: 'play', data: nextVideo });
            }
          } else {
            // Queue is empty
            queueState.nowPlaying = null;
            queueState.nowPlayingSource = null;
            queueState.isPlaying = false;
            console.log('[main] ⚠️ Queue is empty after next command');
          }
        } else if (queueState.priorityQueue.length > 0) {
          // Active queue is empty, but priority queue has items
          const priorityVideo = queueState.priorityQueue.shift();
          console.log('[main] 🎬 Playing priority video (active queue empty):', priorityVideo?.title);
          queueState.nowPlaying = priorityVideo;
          queueState.nowPlayingSource = 'priority';
          queueState.isPlaying = true;
          
          // Insert into active queue at index 0
          queueState.activeQueue.push(priorityVideo);
          
          if (fullscreenWindow) {
            fullscreenWindow.webContents.send('control-player', { action: 'play', data: priorityVideo });
          }
        } else {
          // No videos in either queue
          queueState.nowPlaying = null;
          queueState.nowPlayingSource = null;
          queueState.isPlaying = false;
          console.log('[main] ⚠️ Both queues are empty');
        }
        break;
      }
      case 'refresh_playlists':
        if (mainWindow) {
          mainWindow.webContents.send('refresh-playlists-request');
        }
        break;
      default:
        console.warn('[main] Unknown queue command:', action);
    }
    broadcastQueueState();
  } catch (error) {
    console.error('[main] queue-command error:', error);
  }
});

// Allow renderer to request current queue state snapshot
ipcMain.handle('get-queue-state', async () => {
  return {
    ...queueState,
    currentVideo: queueState.nowPlaying
  };
});
// ==================== IPC Handlers ====================

// File System Operations
// Select playlists directory via dialog
ipcMain.handle('select-playlists-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Playlists Folder',
    properties: ['openDirectory'],
    defaultPath: store.get('playlistsDirectory')
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    store.set('playlistsDirectory', newPath);
    // Notify renderer of the change
    if (mainWindow) {
      mainWindow.webContents.send('playlists-directory-changed', newPath);
    }
    return { success: true, path: newPath };
  }
  return { success: false, path: store.get('playlistsDirectory') };
});

// Get current playlists directory path
ipcMain.handle('get-playlists-directory', async () => {
  return store.get('playlistsDirectory');
});

// Set playlists directory path
ipcMain.handle('set-playlists-directory', async (event, newPath) => {
  if (newPath && typeof newPath === 'string') {
    store.set('playlistsDirectory', newPath);
    if (mainWindow) {
      mainWindow.webContents.send('playlists-directory-changed', newPath);
    }
    return { success: true, path: newPath };
  }
  return { success: false, path: store.get('playlistsDirectory') };
});

ipcMain.handle('get-playlists', async () => {
  const playlistsDir = store.get('playlistsDirectory');
  const playlists = {};

  try {
    if (!fs.existsSync(playlistsDir)) {
      console.log('Playlists directory does not exist:', playlistsDir);
      return { playlists: {}, playlistsDirectory: playlistsDir };
    }

    const entries = fs.readdirSync(playlistsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const playlistPath = path.join(playlistsDir, entry.name);
        const files = fs.readdirSync(playlistPath)
          .filter(file => /\.(mp4|webm|mkv|avi|mov)$/i.test(file))
          .map((file, index) => {
            const filePath = path.join(playlistPath, file);
            const stats = fs.statSync(filePath);
            
            // Parse filename format: "[Artist] - [Title] -- [YouTube_ID].mp4"
            const nameWithoutExt = file.replace(/\.[^/.]+$/i, '');
            
            // Extract YouTube ID (after " -- ")
            const doubleHyphenIndex = nameWithoutExt.lastIndexOf(' -- ');
            let artist = null;
            let title = nameWithoutExt;
            let youtubeId = null;
            
            if (doubleHyphenIndex !== -1) {
              youtubeId = nameWithoutExt.substring(doubleHyphenIndex + 4).trim();
              const artistAndTitle = nameWithoutExt.substring(0, doubleHyphenIndex);
              
              // Extract Artist and Title (separated by " - ")
              const singleHyphenIndex = artistAndTitle.indexOf(' - ');
              if (singleHyphenIndex !== -1) {
                artist = artistAndTitle.substring(0, singleHyphenIndex).trim();
                title = artistAndTitle.substring(singleHyphenIndex + 3).trim();
              } else {
                title = artistAndTitle.trim();
              }
            } else {
              // No YouTube ID, try to parse as "Artist - Title"
              const singleHyphenIndex = nameWithoutExt.indexOf(' - ');
              if (singleHyphenIndex !== -1) {
                artist = nameWithoutExt.substring(0, singleHyphenIndex).trim();
                title = nameWithoutExt.substring(singleHyphenIndex + 3).trim();
              }
            }

            return {
              id: `${entry.name}-${index}`,
              title,
              artist: artist || entry.name,
              filename: file,
              path: filePath,
              src: `file://${filePath}`,
              size: stats.size,
              playlist: entry.name,
              playlistDisplayName: entry.name.replace(/^PL[A-Za-z0-9_-]+[._]/, '')
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title));
        
        playlists[entry.name] = files;
      }
    }

    return { playlists, playlistsDirectory: playlistsDir };
  } catch (error) {
    console.error('Error reading playlists:', error);
    return { playlists: {}, playlistsDirectory: playlistsDir, error: error.message };
  }
});

ipcMain.handle('get-video-metadata', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    console.error('Error getting video metadata:', error);
    return null;
  }
});

// Display Management
ipcMain.handle('get-displays', async () => {
  const displays = screen.getAllDisplays();
  return displays.map(display => ({
    id: display.id,
    label: display.label || `Display ${display.id}`,
    width: display.size.width,
    height: display.size.height,
    bounds: display.bounds,
    isPrimary: display.bounds.x === 0 && display.bounds.y === 0
  }));
});

ipcMain.handle('create-fullscreen-window', async (event, displayId) => {
  const win = createFullscreenWindow(displayId);
  return { success: true, windowId: win.id };
});

ipcMain.handle('close-fullscreen-window', async () => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
  }
  return { success: true };
});

ipcMain.handle('control-fullscreen-player', async (event, action, data) => {
  if (fullscreenWindow) {
    fullscreenWindow.webContents.send('control-player', { action, data });
    return { success: true };
  }
  return { success: false, error: 'No fullscreen window' };
});

// Player window control (new handler)
ipcMain.handle('control-player-window', async (event, action, data) => {
  console.log('[Electron] control-player-window called:', action, 'fullscreenWindow exists:', !!fullscreenWindow);
  if (action === 'play' && data) {
    console.log('[Electron] 🎬 Play command received - video object:');
    console.log('[Electron] 🎬   - title:', data.title);
    console.log('[Electron] 🎬   - src:', data.src);
    console.log('[Electron] 🎬   - path:', data.path);
    console.log('[Electron] 🎬   - id:', data.id);
    console.log('[Electron] 🎬   - Full data keys:', Object.keys(data || {}));
  }
  if (fullscreenWindow) {
    console.log('[Electron] Sending control-player to fullscreen window:', { action, data: data?.title || data?.id || 'no data' });
    if (action === 'play' && data) {
      console.log('[Electron] 🎬 Video object being sent to fullscreen window:');
      console.log('[Electron] 🎬   - src:', data.src);
      console.log('[Electron] 🎬   - path:', data.path);
      console.log('[Electron] 🎬   - Full object:', JSON.stringify(data, null, 2).substring(0, 500));
    }
    fullscreenWindow.webContents.send('control-player', { action, data });
    return { success: true };
  } else {
    console.error('[Electron] ❌ No fullscreen window open - cannot send play command!');
    // Try to create the fullscreen window if it doesn't exist
    const displays = screen.getAllDisplays();
    const targetDisplay = displays[displays.length - 1]; // Use last display
    console.log('[Electron] Attempting to create fullscreen window on display:', targetDisplay.id);
    createFullscreenWindow(targetDisplay.id);
    // Wait a bit for window to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (fullscreenWindow) {
      console.log('[Electron] ✅ Fullscreen window created, sending play command');
      if (action === 'play' && data) {
        console.log('[Electron] Video object being sent after creation - src:', data.src, 'path:', data.path);
      }
      fullscreenWindow.webContents.send('control-player', { action, data });
      return { success: true };
    }
  }
  return { success: false, error: 'No player window open' };
});

// Get player window status (new handler)
ipcMain.handle('get-player-window-status', async () => {
  return {
    isOpen: fullscreenWindow !== null,
    displayId: fullscreenWindow ? null : null
  };
});

// Create player window (maps to fullscreen window)
ipcMain.handle('create-player-window', async (event, displayId, fullscreen = true) => {
  try {
    // Check if Admin and Player are on the same display - auto-disable fullscreen if so
    if (mainWindow && fullscreen) {
      const displays = screen.getAllDisplays();
      const adminBounds = mainWindow.getBounds();
      const adminDisplay = screen.getDisplayMatching(adminBounds);
      const targetDisplay = displays.find(d => d.id === displayId) || displays[displays.length - 1];
      
      // If Admin and Player are on the same display, force windowed mode
      if (adminDisplay.id === targetDisplay.id) {
        console.log('[Electron] Admin and Player are on the same display - forcing windowed mode');
        fullscreen = false;
        
        // Notify main window to update setting
        if (mainWindow) {
          mainWindow.webContents.send('player-fullscreen-auto-disabled');
        }
      }
    }
    
    const win = createFullscreenWindow(displayId, fullscreen);
    return { success: true, windowId: win.id };
  } catch (error) {
    console.error('Error creating player window:', error);
    return { success: false, error: error.message };
  }
});

// Close player window
ipcMain.handle('close-player-window', async () => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
    // Notify main window
    if (mainWindow) {
      mainWindow.webContents.send('player-window-closed');
    }
  }
  return { success: true };
});

// Toggle player window (create if not exists, close if exists)
ipcMain.handle('toggle-player-window', async (event, displayId) => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
    if (mainWindow) {
      mainWindow.webContents.send('player-window-closed');
    }
    return { success: true, isOpen: false };
  } else {
    try {
      const win = createFullscreenWindow(displayId);
      return { success: true, isOpen: true, windowId: win.id };
    } catch (error) {
      console.error('Error creating player window:', error);
      return { success: false, error: error.message };
    }
  }
});

// Move player window to a different display
ipcMain.handle('move-player-to-display', async (event, displayId) => {
  if (!fullscreenWindow) {
    return { success: false, error: 'No player window open' };
  }
  
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId);
  
  if (!targetDisplay) {
    return { success: false, error: 'Display not found' };
  }
  
  fullscreenWindow.setBounds({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.size.width,
    height: targetDisplay.size.height
  });
  
  return { success: true };
});

// Set player window fullscreen mode
ipcMain.handle('set-player-fullscreen', async (event, fullscreen) => {
  if (!fullscreenWindow) {
    return { success: false, error: 'No player window open' };
  }
  
  // Check if Admin and Player are on the same display - auto-disable fullscreen if so
  if (mainWindow && fullscreen) {
    const displays = screen.getAllDisplays();
    const adminBounds = mainWindow.getBounds();
    const adminDisplay = screen.getDisplayMatching(adminBounds);
    const playerBounds = fullscreenWindow.getBounds();
    const playerDisplay = screen.getDisplayMatching(playerBounds);
    
    // If Admin and Player are on the same display, force windowed mode
    if (adminDisplay.id === playerDisplay.id) {
      console.log('[Electron] Admin and Player are on the same display - forcing windowed mode');
      fullscreen = false;
      
      // Notify main window to update setting
      if (mainWindow) {
        mainWindow.webContents.send('player-fullscreen-auto-disabled');
      }
    }
  }
  
  // Get current display ID
  const displays = screen.getAllDisplays();
  const currentBounds = fullscreenWindow.getBounds();
  const currentDisplay = screen.getDisplayMatching(currentBounds);
  const displayId = currentDisplay.id;
  
  // If switching to windowed mode, we need to recreate the window with frame
  // If switching to fullscreen, we can just toggle fullscreen
  if (!fullscreen && fullscreenWindow.isFullScreen()) {
    // Switching to windowed: recreate window with frame
    const savedState = {
      displayId: displayId,
      fullscreen: false
    };
    
    // Close current window
    fullscreenWindow.close();
    fullscreenWindow = null;
    
    // Recreate in windowed mode
    const win = createFullscreenWindow(displayId, false);
    
    // Notify renderer to resize video players
    if (win && win.webContents) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('control-player', { action: 'resize', data: { mode: 'windowed' } });
      });
    }
    
    return { success: true };
  } else if (fullscreen && !fullscreenWindow.isFullScreen()) {
    // Switching to fullscreen: just toggle
    fullscreenWindow.setFullScreen(true);
    fullscreenWindow.setAlwaysOnTop(true);
    fullscreenWindow.setResizable(false);
    
    // Notify renderer
    if (fullscreenWindow.webContents) {
      fullscreenWindow.webContents.send('control-player', { action: 'resize', data: { mode: 'fullscreen' } });
    }
    
    return { success: true };
  }
  
  // Already in the requested state
  return { success: true };
});

// Refresh player window (recreate on specified display)
ipcMain.handle('refresh-player-window', async (event, displayId) => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
  }
  
  try {
    const win = createFullscreenWindow(displayId);
    return { success: true, windowId: win.id };
  } catch (error) {
    console.error('Error refreshing player window:', error);
    return { success: false, error: error.message };
  }
});

// Debug logging
ipcMain.handle('write-debug-log', async (event, logData) => {
  try {
    const logPath = path.join(__dirname, '../../.cursor/debug.log');
    const logLine = JSON.stringify(logData) + '\n';
    fs.appendFileSync(logPath, logLine, 'utf8');
    return { success: true };
  } catch (error) {
    console.error('[main] Failed to write debug log:', error);
    return { success: false, error: error.message };
  }
});

// Forward renderer console logs to file
ipcMain.on('renderer-log', (event, { level, args }) => {
  writeToLogFile(RENDERER_LOG, level, ...args);
});

// Settings/Store Operations
ipcMain.handle('get-setting', async (event, key) => {
  return store.get(key);
});

ipcMain.handle('set-setting', async (event, key, value) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle('get-all-settings', async () => {
  return store.store;
});

// Window Operations
ipcMain.handle('open-admin-console', async () => {
  createAdminConsoleWindow();
  return { success: true };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Playlists Directory'
  });
  
  if (!result.canceled && result.filePaths[0]) {
    store.set('playlistsDirectory', result.filePaths[0]);
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// Playback State Sync (between windows)
ipcMain.on('playback-state-update', (event, state) => {
  // Forward to fullscreen window if it exists
  if (fullscreenWindow && event.sender !== fullscreenWindow.webContents) {
    fullscreenWindow.webContents.send('playback-state-sync', state);
  }
  // Forward to main window if from fullscreen
  if (mainWindow && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('playback-state-sync', state);
  }
});

ipcMain.on('video-ended', () => {
  if (mainWindow) {
    mainWindow.webContents.send('request-next-video');
  }
});

// Recent Searches
ipcMain.handle('get-recent-searches', async () => {
  return store.get('recentSearches', []);
});

ipcMain.handle('add-recent-search', async (event, query) => {
  const recent = store.get('recentSearches', []);
  const filtered = recent.filter(s => s.toLowerCase() !== query.toLowerCase());
  const updated = [query, ...filtered].slice(0, 10);
  store.set('recentSearches', updated);
  return updated;
});

ipcMain.handle('clear-recent-searches', async () => {
  store.set('recentSearches', []);
  return [];
});

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  // Initialize logs directory now that app is ready
  initializeLogsDirectory();
  console.log('[Electron] ✅ App is ready, creating main window...');
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('[Electron] App activated, creating main window...');
      createMainWindow();
    }
  });
});

app.on('ready', () => {
  console.log('[Electron] App ready event fired');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up any resources
});

// Handle certificate errors in development
if (isDev) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
