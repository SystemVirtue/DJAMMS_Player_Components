// electron/main.ts - Electron Main Process (TypeScript)
import { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import Store from 'electron-store';

// Type definitions for Electron Store
interface StoreDefaults {
  volume: number;
  muted: boolean;
  playlistsDirectory: string;
  recentSearches: string[];
  windowBounds: { width: number; height: number };
}

// Type-safe store interface (flexible for dynamic keys)
interface TypedStore {
  get<K extends keyof StoreDefaults>(key: K): StoreDefaults[K];
  get<K extends keyof StoreDefaults>(key: K, defaultValue: StoreDefaults[K]): StoreDefaults[K];
  get(key: string): any;
  get(key: string, defaultValue: any): any;
  set<K extends keyof StoreDefaults>(key: K, value: StoreDefaults[K]): void;
  set(key: string, value: any): void;
  store: StoreDefaults;
}

// Initialize persistent storage
const store = new Store<StoreDefaults>({
  name: 'djamms-config',
  defaults: {
    volume: 0.7,
    muted: false,
    playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS',
    recentSearches: [],
    windowBounds: { width: 1200, height: 800 }
  }
}) as unknown as TypedStore;

// Keep global references to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let fullscreenWindow: BrowserWindow | null = null;
let adminConsoleWindow: BrowserWindow | null = null;

// Determine if running in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:3000';

// Handle EPIPE errors gracefully (broken pipe - stream closed)
// This is common when logging after process termination
process.on('uncaughtException', (error: Error) => {
  // Suppress EPIPE errors (expected during shutdown/stream closure)
  if ((error as any).code === 'EPIPE' || (error as any).code === 'ENOTCONN') {
    return; // Silently ignore - stream is closed, nothing we can do
  }
  // Log other uncaught exceptions
  console.error('[Main] Uncaught Exception:', error);
  console.error(error.stack);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  // Suppress EPIPE errors
  if (reason?.code === 'EPIPE' || reason?.code === 'ENOTCONN') {
    return; // Silently ignore
  }
  console.error('[Main] Unhandled Rejection:', reason);
});

function getAssetPath(...paths: string[]): string {
  if (isDev) {
    return path.join(__dirname, '..', ...paths);
  }
  return path.join(process.resourcesPath, 'app', ...paths);
}

function createMainWindow(): void {
  const windowBounds = store.get('windowBounds');
  const { width, height } = windowBounds;
  
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
    if (mainWindow) {
      const { width, height } = mainWindow.getBounds();
      store.set('windowBounds', { width, height });
    }
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

function createFullscreenWindow(displayId?: number): BrowserWindow {
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
      mainWindow.webContents.send('player-window-closed');
    }
  });
  
  // Notify main window that player window was opened
  if (mainWindow) {
    mainWindow.webContents.send('player-window-opened');
  }

  return fullscreenWindow;
}

function createAdminConsoleWindow(): BrowserWindow {
  if (adminConsoleWindow && !adminConsoleWindow.isDestroyed()) {
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

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
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
            if (!mainWindow) return;
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
ipcMain.handle('select-playlists-directory', async () => {
  if (!mainWindow) return { success: false, path: store.get('playlistsDirectory') };
  
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

ipcMain.handle('get-playlists-directory', async () => {
  return store.get('playlistsDirectory');
});

ipcMain.handle('set-playlists-directory', async (_event, newPath: string) => {
  if (newPath && typeof newPath === 'string') {
    store.set('playlistsDirectory', newPath);
    if (mainWindow) {
      mainWindow.webContents.send('playlists-directory-changed', newPath);
    }
    return { success: true, path: newPath };
  }
  return { success: false, path: store.get('playlistsDirectory') };
});

interface VideoFile {
  id: string;
  title: string;
  artist: string | null;
  filename: string;
  path: string;
  fileHash?: string; // Hash for change detection
  src: string;
  size: number;
  playlist: string;
  playlistDisplayName: string;
}

ipcMain.handle('get-playlists', async () => {
  const playlistsDir = store.get('playlistsDirectory');
  const playlists: Record<string, VideoFile[]> = {};

  try {
    // Check if directory exists (async)
    try {
      await fs.promises.access(playlistsDir);
    } catch {
      console.log('Playlists directory does not exist:', playlistsDir);
      return { playlists: {}, playlistsDirectory: playlistsDir };
    }

    // Read directory entries (async)
    const entries = await fs.promises.readdir(playlistsDir, { withFileTypes: true });
    
    // Process playlists in parallel for better performance
    const playlistPromises = entries
      .filter(entry => entry.isDirectory())
      .map(async (entry) => {
        const playlistPath = path.join(playlistsDir, entry.name);
        try {
          const files = await fs.promises.readdir(playlistPath);
          const videoFileNames = files.filter(file => /\.(mp4|webm|mkv|avi|mov)$/i.test(file));
          
          // Process files in parallel
          const videoPromises = videoFileNames.map(async (file, index): Promise<VideoFile> => {
            const filePath = path.join(playlistPath, file);
            const stats = await fs.promises.stat(filePath);
            
            // Calculate file hash for change detection (using size + mtime as quick hash)
            // For full SHA256, uncomment the code below (slower but more accurate)
            const quickHash = `${stats.size}-${stats.mtime.getTime()}`;
            // For full file hash (slower):
            // const fileBuffer = await fs.promises.readFile(filePath);
            // const fullHash = createHash('sha256').update(fileBuffer).digest('hex');
            
            // Parse filename format: "[Artist] - [Title] -- [YouTube_ID].mp4"
            const nameWithoutExt = file.replace(/\.[^/.]+$/i, '');
            
            // Extract YouTube ID (after " -- ")
            const doubleHyphenIndex = nameWithoutExt.lastIndexOf(' -- ');
            let artist: string | null = null;
            let title = nameWithoutExt;
            let youtubeId: string | null = null;
            
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
              playlistDisplayName: entry.name.replace(/^PL[A-Za-z0-9_-]+[._]/, ''),
              fileHash: quickHash // Hash for change detection
            };
          });
          
          // Wait for all video files to be processed
          const processedVideos = await Promise.all(videoPromises);
          processedVideos.sort((a, b) => a.title.localeCompare(b.title));
          
          return { playlistName: entry.name, videos: processedVideos };
        } catch (error: any) {
          console.warn(`Error reading playlist ${entry.name}:`, error.message);
          return { playlistName: entry.name, videos: [] };
        }
      });
    
    // Wait for all playlists to be processed
    const playlistResults = await Promise.all(playlistPromises);
    
    // Build playlists object
    for (const result of playlistResults) {
      playlists[result.playlistName] = result.videos;
    }

    return { playlists, playlistsDirectory: playlistsDir };
  } catch (error: any) {
    console.error('Error reading playlists:', error);
    return { playlists: {}, playlistsDirectory: playlistsDir, error: error.message };
  }
});

ipcMain.handle('get-video-metadata', async (_event, filePath: string) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error: any) {
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

ipcMain.handle('create-fullscreen-window', async (_event, displayId?: number) => {
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

ipcMain.handle('control-fullscreen-player', async (_event, action: string, data?: any) => {
  if (fullscreenWindow) {
    fullscreenWindow.webContents.send('control-player', { action, data });
    return { success: true };
  }
  return { success: false, error: 'No fullscreen window' };
});

// Player window control
ipcMain.handle('control-player-window', async (_event, action: string, data?: any) => {
  if (fullscreenWindow) {
    fullscreenWindow.webContents.send('control-player', { action, data });
    return { success: true };
  }
  return { success: false, error: 'No player window open' };
});

ipcMain.handle('get-player-window-status', async () => {
  return {
    isOpen: fullscreenWindow !== null,
    displayId: fullscreenWindow ? null : null
  };
});

ipcMain.handle('create-player-window', async (_event, displayId?: number) => {
  try {
    const win = createFullscreenWindow(displayId);
    return { success: true, windowId: win.id };
  } catch (error: any) {
    console.error('Error creating player window:', error);
    return { success: false, error: error.message };
  }
});

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

ipcMain.handle('toggle-player-window', async (_event, displayId?: number) => {
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
    } catch (error: any) {
      console.error('Error creating player window:', error);
      return { success: false, error: error.message };
    }
  }
});

ipcMain.handle('move-player-to-display', async (_event, displayId: number) => {
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

ipcMain.handle('set-player-fullscreen', async (_event, fullscreen: boolean) => {
  if (!fullscreenWindow) {
    return { success: false, error: 'No player window open' };
  }
  
  fullscreenWindow.setFullScreen(fullscreen);
  return { success: true };
});

ipcMain.handle('refresh-player-window', async (_event, displayId?: number) => {
  if (fullscreenWindow) {
    fullscreenWindow.close();
    fullscreenWindow = null;
  }
  
  try {
    const win = createFullscreenWindow(displayId);
    return { success: true, windowId: win.id };
  } catch (error: any) {
    console.error('Error refreshing player window:', error);
    return { success: false, error: error.message };
  }
});

// Settings/Store Operations
ipcMain.handle('get-setting', async (_event, key: string) => {
  return store.get(key);
});

ipcMain.handle('set-setting', async (_event, key: string, value: any) => {
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
  if (!mainWindow) return { success: false };
  
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
ipcMain.on('playback-state-update', (_event, state: any) => {
  // Forward to fullscreen window if it exists
  if (fullscreenWindow && _event.sender !== fullscreenWindow.webContents) {
    fullscreenWindow.webContents.send('playback-state-sync', state);
  }
  // Forward to main window if from fullscreen
  if (mainWindow && _event.sender !== mainWindow.webContents) {
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

ipcMain.handle('add-recent-search', async (_event, query: string) => {
  const recent = store.get('recentSearches', []);
  const filtered = recent.filter((s: string) => s.toLowerCase() !== query.toLowerCase());
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
  createMainWindow();

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
  app.on('certificate-error', (_event, _webContents, _url, _error, _certificate, callback) => {
    _event.preventDefault();
    callback(true);
  });
}

