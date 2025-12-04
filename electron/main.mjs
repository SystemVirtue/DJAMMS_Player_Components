// electron/main.mjs - Electron Main Process (ESM)
import { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Store from 'electron-store';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize persistent storage
const store = new Store({
  name: 'djamms-config',
  defaults: {
    volume: 0.7,
    muted: false,
    playlistsDirectory: path.join(app.getPath('music'), 'DJAMMS', 'PLAYLISTS'),
    recentSearches: [],
    windowBounds: { width: 1200, height: 800 },
    // Player window settings
    playerWindowBounds: null, // { x, y, width, height } - null means use default
    playerWindowFullscreen: false,
    playerDisplayId: null,
    // App settings
    activePlaylist: null, // Last selected playlist name
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0
  }
});

// Keep global references to prevent garbage collection
let mainWindow = null;
let fullscreenWindow = null;
let playerWindow = null;
let adminConsoleWindow = null;

// Determine if running in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:3000';

function getAssetPath(...paths) {
  if (isDev) {
    return path.join(__dirname, '..', ...paths);
  }
  return path.join(process.resourcesPath, 'app', ...paths);
}

function createMainWindow() {
  const { width, height } = store.get('windowBounds');
  
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
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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

function createFullscreenWindow(displayId) {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId) || displays[displays.length - 1];

  fullscreenWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.size.width,
    height: targetDisplay.size.height,
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    fullscreenWindow.loadURL(`${VITE_DEV_SERVER_URL}/fullscreen.html`);
  } else {
    fullscreenWindow.loadFile(path.join(__dirname, '../dist/fullscreen.html'));
  }

  fullscreenWindow.on('closed', () => {
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

function createPlayerWindow(displayId = null) {
  // If player window already exists, just focus it
  if (playerWindow) {
    playerWindow.focus();
    return playerWindow;
  }

  const displays = screen.getAllDisplays();
  // Try to use saved display, then parameter, then secondary display
  const savedDisplayId = store.get('playerDisplayId');
  let targetDisplay;
  
  if (savedDisplayId) {
    targetDisplay = displays.find(d => d.id === savedDisplayId);
  }
  if (!targetDisplay && displayId) {
    targetDisplay = displays.find(d => d.id === displayId);
  }
  if (!targetDisplay && displays.length > 1) {
    // Use second display if available
    targetDisplay = displays[1];
  }
  
  // Get saved bounds or use defaults
  const savedBounds = store.get('playerWindowBounds');
  const savedFullscreen = store.get('playerWindowFullscreen');
  
  const windowConfig = {
    width: savedBounds?.width || 1280,
    height: savedBounds?.height || 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#000000',
    title: 'DJAMMS Player',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  };

  // Use saved position if available, otherwise position on target display
  if (savedBounds?.x !== undefined && savedBounds?.y !== undefined) {
    windowConfig.x = savedBounds.x;
    windowConfig.y = savedBounds.y;
  } else if (targetDisplay) {
    windowConfig.x = targetDisplay.bounds.x + 50;
    windowConfig.y = targetDisplay.bounds.y + 50;
  }

  playerWindow = new BrowserWindow(windowConfig);

  // Apply fullscreen if it was saved
  if (savedFullscreen) {
    playerWindow.setFullScreen(true);
  }

  if (isDev) {
    playerWindow.loadURL(`${VITE_DEV_SERVER_URL}/fullscreen.html`);
  } else {
    playerWindow.loadFile(path.join(__dirname, '../dist/fullscreen.html'));
  }

  // Save window bounds when moved or resized
  playerWindow.on('move', () => {
    if (!playerWindow.isFullScreen()) {
      const bounds = playerWindow.getBounds();
      store.set('playerWindowBounds', bounds);
    }
  });

  playerWindow.on('resize', () => {
    if (!playerWindow.isFullScreen()) {
      const bounds = playerWindow.getBounds();
      store.set('playerWindowBounds', bounds);
    }
  });

  // Save fullscreen state when changed
  playerWindow.on('enter-full-screen', () => {
    store.set('playerWindowFullscreen', true);
  });

  playerWindow.on('leave-full-screen', () => {
    store.set('playerWindowFullscreen', false);
  });

  playerWindow.on('closed', () => {
    playerWindow = null;
    // Notify main window that player window closed
    if (mainWindow) {
      mainWindow.webContents.send('player-window-closed');
    }
  });

  return playerWindow;
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

// ==================== IPC Handlers ====================

// File System Operations
ipcMain.handle('get-playlists', async () => {
  const playlistsDir = store.get('playlistsDirectory');
  const playlists = {};

  try {
    if (!fs.existsSync(playlistsDir)) {
      console.log('Playlists directory does not exist:', playlistsDir);
      return { playlists: {}, playlistsDirectory: playlistsDir };
    }

    const entries = fs.readdirSync(playlistsDir, { withFileTypes: true });
    
    // Helper function to get display name for playlist (strip YouTube Playlist ID prefix)
    // Format: "PlaylistID.PlaylistName" -> "PlaylistName" or just "PlaylistName" if no prefix
    const getPlaylistDisplayName = (folderName) => {
      // Check if folder name starts with YouTube playlist ID pattern (letters/numbers followed by dot)
      const youtubeIdMatch = folderName.match(/^[A-Za-z0-9_-]+\.(.+)$/);
      if (youtubeIdMatch) {
        return youtubeIdMatch[1];
      }
      return folderName;
    };

    // Helper function to parse artist and title from filename
    // Expected format: "[Youtube_ID] | [Artist_Name] - [Song_Title].mp4"
    // Returns { artist: string | null, title: string }
    const parseFilename = (filename) => {
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      
      // Check if filename has the expected format with " | "
      const pipeIndex = nameWithoutExt.indexOf(' | ');
      if (pipeIndex === -1) {
        // No pipe separator - filename doesn't conform to expected format
        return { artist: null, title: nameWithoutExt };
      }
      
      // Get the part after the YouTube ID (everything after " | ")
      const afterPipe = nameWithoutExt.substring(pipeIndex + 3);
      
      // Check if it has " - " separator for Artist - Title
      const dashIndex = afterPipe.indexOf(' - ');
      if (dashIndex === -1) {
        // No dash separator - just use the whole thing as title, no artist
        return { artist: null, title: afterPipe };
      }
      
      // Split into artist and title
      const artist = afterPipe.substring(0, dashIndex).trim();
      const title = afterPipe.substring(dashIndex + 3).trim();
      
      return { artist: artist || null, title: title || afterPipe };
    };

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const playlistPath = path.join(playlistsDir, entry.name);
        const playlistDisplayName = getPlaylistDisplayName(entry.name);
        
        const files = fs.readdirSync(playlistPath)
          .filter(file => /\.(mp4|webm|mkv|avi|mov)$/i.test(file))
          .map((file, index) => {
            const filePath = path.join(playlistPath, file);
            const stats = fs.statSync(filePath);
            
            // Parse artist and title from filename
            const parsed = parseFilename(file);

            return {
              id: `${entry.name}-${index}`,
              title: parsed.title,
              artist: parsed.artist, // Will be null if filename doesn't conform to expected format
              filename: file,
              path: filePath,
              src: `file://${filePath}`,
              size: stats.size,
              playlist: entry.name, // Keep original folder name for internal use
              playlistDisplayName: playlistDisplayName // Display name without YouTube ID prefix
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

// Display Management - Enhanced with workArea and scaleFactor
ipcMain.handle('get-displays', async () => {
  const displays = screen.getAllDisplays();
  return displays.map((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    name: `Display ${index + 1}${display.bounds.x === 0 && display.bounds.y === 0 ? ' (Primary)' : ''}`,
    width: display.size.width,
    height: display.size.height,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    isPrimary: display.bounds.x === 0 && display.bounds.y === 0
  }));
});

// Player Settings Update Handler - positions window based on settings
ipcMain.on('player-settings-updated', (event, settings) => {
  if (!playerWindow) return;

  if (!settings.showPlayer) {
    playerWindow.hide();
    return;
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = settings.displayId 
    ? displays.find(d => d.id === settings.displayId)
    : displays[settings.displayIndex] || displays[0];

  if (targetDisplay) {
    const { x, y, width, height } = targetDisplay.workArea;

    if (settings.fullscreen) {
      // Move to display and go fullscreen
      playerWindow.setPosition(x, y);
      playerWindow.setFullScreen(true);
    } else {
      // Position at 80% of display, centered
      const winWidth = Math.round(width * 0.8);
      const winHeight = Math.round(height * 0.8);
      const winX = x + Math.round((width - winWidth) / 2);
      const winY = y + Math.round((height - winHeight) / 2);

      playerWindow.setFullScreen(false);
      playerWindow.setBounds({ x: winX, y: winY, width: winWidth, height: winHeight });
    }

    playerWindow.show();
  }
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

// Playlists Directory Operations
ipcMain.handle('get-playlists-directory', async () => {
  return store.get('playlistsDirectory');
});

ipcMain.handle('set-playlists-directory', async (event, path) => {
  store.set('playlistsDirectory', path);
  return { success: true };
});

ipcMain.handle('select-playlists-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Playlists Directory'
  });
  
  if (!result.canceled && result.filePaths[0]) {
    store.set('playlistsDirectory', result.filePaths[0]);
    // Notify renderer of the change
    if (mainWindow) {
      mainWindow.webContents.send('playlists-directory-changed', result.filePaths[0]);
    }
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
  // Forward to player window if it exists
  if (playerWindow && event.sender !== playerWindow.webContents) {
    playerWindow.webContents.send('playback-state-sync', state);
  }
  // Forward to main window if from other windows
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

// Player Window Management
ipcMain.handle('create-player-window', async (event, displayId) => {
  const win = createPlayerWindow(displayId);
  return { success: true, windowId: win.id };
});

ipcMain.handle('close-player-window', async () => {
  if (playerWindow) {
    playerWindow.close();
    playerWindow = null;
  }
  return { success: true };
});

ipcMain.handle('toggle-player-window', async () => {
  if (playerWindow) {
    playerWindow.close();
    playerWindow = null;
    return { success: true, isOpen: false };
  } else {
    createPlayerWindow();
    return { success: true, isOpen: true };
  }
});

ipcMain.handle('get-player-window-status', async () => {
  return { isOpen: !!playerWindow };
});

ipcMain.handle('control-player-window', async (event, action, data) => {
  if (playerWindow) {
    playerWindow.webContents.send('control-player', { action, data });
    return { success: true };
  }
  return { success: false, error: 'No player window' };
});

// Move player window to a different display without recreating it
ipcMain.handle('move-player-to-display', async (event, displayId) => {
  if (!playerWindow) {
    return { success: false, error: 'No player window' };
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = displays.find(d => d.id === displayId);
  
  if (!targetDisplay) {
    return { success: false, error: 'Display not found' };
  }

  const { x, y, width, height } = targetDisplay.workArea;
  const isFullscreen = playerWindow.isFullScreen();
  
  // If fullscreen, temporarily exit to move, then re-enter
  if (isFullscreen) {
    playerWindow.setFullScreen(false);
  }

  // Position at 80% of display, centered
  const winWidth = Math.round(width * 0.8);
  const winHeight = Math.round(height * 0.8);
  const winX = x + Math.round((width - winWidth) / 2);
  const winY = y + Math.round((height - winHeight) / 2);

  playerWindow.setBounds({ x: winX, y: winY, width: winWidth, height: winHeight });
  
  // Restore fullscreen if it was enabled
  if (isFullscreen) {
    setTimeout(() => {
      playerWindow.setFullScreen(true);
    }, 100);
  }

  // Save the display preference
  store.set('playerDisplayId', displayId);
  
  return { success: true };
});

// Set player window fullscreen state
ipcMain.handle('set-player-fullscreen', async (event, fullscreen) => {
  if (!playerWindow) {
    return { success: false, error: 'No player window' };
  }

  playerWindow.setFullScreen(fullscreen);
  store.set('playerWindowFullscreen', fullscreen);
  
  return { success: true };
});

// Refresh player window - close and reopen without losing current video state
// The main window will re-sync the current video after the window reopens
ipcMain.handle('refresh-player-window', async (event, displayId) => {
  const wasOpen = !!playerWindow;
  const wasFullscreen = playerWindow ? playerWindow.isFullScreen() : store.get('playerWindowFullscreen');
  
  if (playerWindow) {
    playerWindow.close();
    playerWindow = null;
  }

  // Small delay to ensure window is fully closed
  await new Promise(resolve => setTimeout(resolve, 200));

  // Recreate the window
  createPlayerWindow(displayId);
  
  // Apply fullscreen if it was set
  if (wasFullscreen && playerWindow) {
    setTimeout(() => {
      playerWindow.setFullScreen(true);
    }, 300);
  }

  return { success: true, wasOpen, wasFullscreen };
});

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  createMainWindow();
  
  // Create Player Window on startup (can be configured)
  const enablePlayerWindow = store.get('enableFullscreenPlayer', true);
  if (enablePlayerWindow) {
    // Small delay to let main window initialize first
    setTimeout(() => {
      createPlayerWindow();
    }, 500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
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
