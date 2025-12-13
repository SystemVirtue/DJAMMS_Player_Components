console.log('[main] main.js loaded, starting ObieElectronPlayer');

const { app, BrowserWindow, screen, ipcMain, Menu, dialog } = require('electron');
console.log('[main] electron required');
const log = require('electron-log');
console.log('[main] electron-log required');

// Load environment variables from .env file
require('dotenv').config();
console.log('[main] dotenv loaded');
console.log('[main] DJAMMS_DEFAULT_PLAYLIST_PATH:', process.env.DJAMMS_DEFAULT_PLAYLIST_PATH);
const QueueOrchestrator = require('../integration/queue-orchestrator');
console.log('[main] QueueOrchestrator required');
const LocalFileManager = require('../integration/local-file-manager');
console.log('[main] LocalFileManager required');
const SupabaseAdapter = require('../integration/supabase-adapter');
console.log('[main] SupabaseAdapter required');
const PreferencesManager = require('./preferences-manager');
console.log('[main] PreferencesManager required');
const CommandProcessor = require('../integration/command-processor');
console.log('[main] CommandProcessor required');
const SetupWizard = require('./setup-wizard');
console.log('[main] SetupWizard required');
const WindowManager = require('./window-manager');
console.log('[main] WindowManager required');
const path = require('path');
console.log('[main] path required');

// ============================================================================
// DEVELOPMENT CRASH HANDLERS - Prevent hanging on fatal errors
// ============================================================================

const isDev = process.env.NODE_ENV !== 'production' || process.argv.includes('--debug');

if (isDev) {
  process.on('uncaughtException', (error) => {
    console.error('[FATAL] Main Process Uncaught Exception:');
    console.error(error);
    console.error(error.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Main Process Unhandled Rejection:');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    console.error(reason?.stack);
    
    // Don't exit on database timeouts - these are recoverable
    if (reason && reason.code === '57014') {
      console.error('[main] Database timeout detected - continuing without exiting');
      return;
    }
    
    process.exit(1);
  });

  console.log('[main] Development crash handlers enabled');
}

class ObieElectronPlayer {
  constructor() {
    console.log('[main] ObieElectronPlayer constructor called');
    this.mainWindow = null;
    this.adminWindow = null;
    this.orchestrator = null;
    this.supabase = null;
    this.commandProcessor = null;
    this.windowManager = new WindowManager();
    this.isShuttingDown = false;
    this.preferences = new PreferencesManager();
    this.videosSynced = false; // Track whether videos have been synced to prevent duplicate syncs
    this.playlistLoaded = false; // Track whether playlist has been loaded to prevent duplicates
    
    // Progressive playlist loading
    this.fullPlaylist = null; // Store the complete shuffled playlist
    this.videosLoaded = 0; // Track how many videos have been loaded into queue
    this.preloadBufferSize = 5; // Number of videos to keep in queue ahead of current
    
    console.log('[main] ObieElectronPlayer constructor finished');
  }

    async onAppReady() {
      // Load preferences first
      const prefs = await this.preferences.load();
      console.log('[main] Loaded preferences:', Object.keys(prefs));

      // Apply persistent settings
      this.applyPersistentSettings(prefs);

      // Don't recreate orchestrator if it already exists
      if (this.orchestrator) {
        console.log('[main] Orchestrator already exists, skipping recreation');
        // Send orchestrator-ready to renderer
        this.mainWindow.webContents.send('orchestrator-ready');
        // Set up event listeners for existing orchestrator
        this.setupOrchestratorEventListeners();
        return;
      }
      const playlistsRoot = prefs.djammsPath || prefs.playlistsPath || process.env.DJAMMS_PROJECT_FOLDER_PATH;
      console.log('[main] playlistsRoot:', playlistsRoot);
      const fileManager = new LocalFileManager(playlistsRoot);
      console.log('[main] LocalFileManager created');
      
      // Initialize Supabase adapter
      this.supabase = new SupabaseAdapter();
      const playerId = process.env.PLAYER_ID || 'electron-player-1';
      
      this.orchestrator = new QueueOrchestrator(this.supabase, fileManager);
      console.log('[main] QueueOrchestrator created');
      await this.orchestrator.initialize();
      console.log('[main] QueueOrchestrator initialized');

      // Initialize CommandProcessor
      this.commandProcessor = new CommandProcessor(this.orchestrator, this.supabase);
      await this.commandProcessor.initialize();
      console.log('[main] CommandProcessor initialized');

      // Send orchestrator-ready to renderer
      this.mainWindow.webContents.send('orchestrator-ready');

      // Set up orchestrator event listeners
      this.setupOrchestratorEventListeners();

        // load default playlist path from env
        const defaultPlaylistPath = process.env.DJAMMS_DEFAULT_PLAYLIST_PATH || (playlistsRoot ? `${playlistsRoot}/PLAYLISTS/DJAMMS Default` : null);
        if (defaultPlaylistPath && !this.playlistLoaded) {
          this.playlistLoaded = true; // Mark as loaded to prevent duplicates
          const playlist = await fileManager.getPlaylistByPath(defaultPlaylistPath);
        if (playlist && playlist.videos && playlist.videos.length > 0) {
          // Sync videos to Supabase if connected and not already synced
          if (this.supabase.connected() && !this.videosSynced) {
            try {
              // Add timeout to prevent hanging
              const syncPromise = this.supabase.syncLocalVideos(playerId, playlist.videos);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Video sync timeout')), 30000)
              );
              
              await Promise.race([syncPromise, timeoutPromise]);
              console.log(`[main] Synced ${playlist.videos.length} videos to Supabase`);
              this.videosSynced = true; // Mark as synced to prevent duplicate syncs
            } catch (syncError) {
              console.warn('[main] Failed to sync videos to Supabase:', syncError.message);
              // Don't mark as synced on failure, so it can retry later if needed
            }
          } else if (this.videosSynced) {
            console.log('[main] Videos already synced, skipping sync');
          }

          // Shuffle the playlist randomly before adding to queue
          function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [array[i], array[j]] = [array[j], array[i]];
            }
          }
          shuffleArray(playlist.videos);
          console.log(`[main] Shuffled ${playlist.videos.length} videos in playlist`);

          // add videos to orchestrator queue
          for (const v of playlist.videos) {
            await this.orchestrator.addVideo(v);
          }

          // advance into playing state (advanceQueue will trigger play-video events)
          await this.orchestrator.advanceQueue();
        }
      }
    }

    setupOrchestratorEventListeners() {
      if (!this.orchestrator) return;
      
      // wire orchestrator events to renderer so UI updates automatically
      console.log('[main] Setting up orchestrator event listeners');
      this.orchestrator.on('queue-updated', (state) => {
        console.log('[main] Sending queue:updated to renderer:', state);
        try { this.mainWindow.webContents.send('queue:updated', state); } catch (e) {}
      });
      this.orchestrator.on('play-video', (video) => {
        console.log('[main] Received play-video event, forwarding to PLAYER window only:', video.title);
        // CRITICAL: Only send play-video events to the player window (mainWindow), NOT the admin window
        // Verify mainWindow is the player window, not admin window
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          const windowTitle = this.mainWindow.getTitle();
          console.log(`[main] Sending play-video to window titled: "${windowTitle}" (ID: ${this.mainWindow.id})`);
          
          // Double-check this is NOT the admin window
          if (windowTitle === 'DJAMMS Admin Console') {
            console.error('[main] ERROR: mainWindow appears to be admin window! This should never happen!');
            return;
          }
          
          try { 
            this.mainWindow.webContents.send('play-video', video); 
            console.log(`[main] play-video sent to PLAYER window successfully (window: "${windowTitle}")`);
            
            // Explicitly verify admin window is NOT receiving this
            if (this.adminWindow && !this.adminWindow.isDestroyed()) {
              console.log(`[main] Admin window exists (ID: ${this.adminWindow.id}) but NOT receiving play-video - correct behavior`);
            }
          } catch (e) {
            console.error('[main] Failed to send play-video to player window:', e);
          }
        } else {
          console.warn('[main] Player window not available, cannot send play-video event');
        }
      });
      console.log('[main] Orchestrator event listeners set up');
    }

    createApplicationMenu() {
      console.log('[main] Creating application menu...');
      const template = [
        {
          label: 'DJAMMS Player',
          submenu: [
            {
              label: 'About DJAMMS Player',
              click: () => {
                dialog.showMessageBox(this.mainWindow, {
                  type: 'info',
                  title: 'About DJAMMS Player',
                  message: 'DJAMMS Electron Player',
                  detail: 'Version 0.1.0\nA modern video player for DJAMMS.'
                });
              }
            },
            { type: 'separator' },
            {
              label: 'Preferences...',
              accelerator: 'CmdOrCtrl+,',
              click: () => {
                // TODO: Open preferences window
                console.log('[main] Preferences menu clicked');
              }
            },
            { type: 'separator' },
            {
              label: 'Quit',
              accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
              click: () => {
                app.quit();
              }
            }
          ]
        },
        {
          label: 'Playback',
          submenu: [
            {
              label: 'Play/Pause',
              accelerator: 'Space',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.webContents.send('toggle-play');
                }
              }
            },
            {
              label: 'Skip',
              accelerator: 'S',
              click: () => {
                if (this.mainWindow) {
                  // Set skipCalled flag before sending skip command
                  this.mainWindow.webContents.executeJavaScript('if (window.playerWindow) { window.playerWindow.skipCalled = true; }');
                  this.mainWindow.webContents.send('skip');
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Volume Up',
              accelerator: 'Up',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.webContents.send('volume-up');
                }
              }
            },
            {
              label: 'Volume Down',
              accelerator: 'Down',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.webContents.send('volume-down');
                }
              }
            },
            {
              label: 'Mute',
              accelerator: 'M',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.webContents.send('toggle-mute');
                }
              }
            }
          ]
        },
        {
          label: 'Window',
          submenu: [
            {
              label: 'Minimize',
              accelerator: 'CmdOrCtrl+M',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.minimize();
                }
              }
            },
            {
              label: 'Close',
              accelerator: 'CmdOrCtrl+W',
              click: () => {
                if (this.mainWindow) {
                  this.mainWindow.close();
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Toggle Fullscreen',
              accelerator: 'CmdOrCtrl+F',  // Changed from 'F12' to avoid conflicts
              click: () => {
                if (this.mainWindow) {
                  // Ensure window is focused before toggling fullscreen
                  this.mainWindow.focus();
                  
                  const isCurrentlyFullScreen = this.mainWindow.isFullScreen();
                  this.mainWindow.setFullScreen(!isCurrentlyFullScreen);
                  
                  // Save fullscreenPlayer preference
                  const prefs = this.preferences.loadSync();
                  prefs.fullscreenPlayer = !isCurrentlyFullScreen;
                  this.preferences.save(prefs);
                }
              }
            },
            {
              label: 'Show/Hide Dev Tools',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => {
                if (this.mainWindow) {
                  if (this.mainWindow.webContents.isDevToolsOpened()) {
                    this.mainWindow.webContents.closeDevTools();
                  } else {
                    this.mainWindow.webContents.openDevTools({ mode: 'right' });
                  }
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Select Player Display...',
              click: () => {
                this.showDisplaySelectionDialog('player');
              }
            },
            {
              label: 'Select Admin Display...',
              click: () => {
                this.showDisplaySelectionDialog('admin');
              }
            }
          ]
        },
        {
          label: 'Admin',
          submenu: [
            {
              label: 'Open Admin Console',
              accelerator: 'CmdOrCtrl+Shift+A',
              click: () => {
                console.log('[main] Admin Console menu item clicked');
                this.openAdminConsole();
              }
            },
            {
              label: 'Show/Hide Admin Console',
              accelerator: 'CmdOrCtrl+Shift+H',
              click: () => {
                console.log('[main] Show/Hide Admin Console menu item clicked');
                this.toggleAdminConsole();
              }
            },
            { type: 'separator' },
            {
              label: 'Queue Management',
              submenu: [
                {
                  label: 'Clear Queue',
                  click: () => {
                    if (this.orchestrator) {
                      // TODO: Implement clear queue
                      console.log('[main] Clear queue clicked');
                    }
                  }
                },
                {
                  label: 'Shuffle Queue',
                  click: () => {
                    if (this.orchestrator) {
                      // TODO: Implement shuffle queue
                      console.log('[main] Shuffle queue clicked');
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          label: 'Help',
          submenu: [
            {
              label: 'Keyboard Shortcuts',
              click: () => {
                dialog.showMessageBox(this.mainWindow, {
                  type: 'info',
                  title: 'Keyboard Shortcuts',
                  message: 'DJAMMS Player Shortcuts',
                  detail: 'Space: Play/Pause (Menu only)\nS or →: Skip\n↑/↓: Volume\nM: Mute\nF: Toggle Fullscreen\nCmd/Ctrl+F: Toggle Fullscreen\nCmd/Ctrl+Shift+I: Toggle Dev Tools\nCmd/Ctrl+Shift+A: Open Admin Console\nCmd/Ctrl+Shift+H: Show/Hide Admin Console\nCmd/Ctrl+,: Preferences'
                });
              }
            }
          ]
        }
      ];

      // macOS has different menu conventions
      if (process.platform === 'darwin') {
        template.unshift({
          label: app.getName(),
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        });

        // Window menu
        template[4].submenu = [
          { role: 'close' },
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ];
      }

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
      console.log('[main] Application menu created and set');

      // Ensure menu is visible on macOS
      if (process.platform === 'darwin') {
        app.setAboutPanelOptions({
          applicationName: 'DJAMMS Player',
          applicationVersion: '0.1.0',
          credits: 'DJAMMS Electron Player'
        });
      }
    }

    async applyPersistentSettings(prefs) {
      console.log('[main] Applying persistent settings');

      // Apply volume setting to renderer
      if (this.mainWindow && prefs.volume !== undefined) {
        this.mainWindow.webContents.send('set-volume', prefs.volume);
      }

      // Apply mute setting to renderer
      if (this.mainWindow && prefs.muted !== undefined) {
        this.mainWindow.webContents.send('set-mute', prefs.muted);
      }

      // Apply display settings
      if (prefs.playerDisplayId) {
        setTimeout(() => {
          this.moveWindowToDisplayById('player', prefs.playerDisplayId);
        }, 500);
      }

      if (prefs.adminDisplayId) {
        // Will be applied when admin console is opened
        this.pendingAdminDisplayId = prefs.adminDisplayId;
      }
    }

    moveWindowToDisplayById(windowType, displayId) {
      const displays = screen.getAllDisplays();
      const display = displays.find(d => d.id === displayId);
      if (display) {
        this.moveWindowToDisplay(windowType, display);
      } else {
        console.log(`[main] Display ${displayId} not found, using primary display`);
        const primaryDisplay = screen.getPrimaryDisplay();
        this.moveWindowToDisplay(windowType, primaryDisplay);
      }
    }

    showDisplaySelectionDialog(windowType) {
      const displays = screen.getAllDisplays();
      const currentDisplay = windowType === 'player' ?
        (this.mainWindow ? screen.getDisplayMatching(this.mainWindow.getBounds()) : screen.getPrimaryDisplay()) :
        (this.adminWindow ? screen.getDisplayMatching(this.adminWindow.getBounds()) : screen.getPrimaryDisplay());

      const options = displays.map((display, index) => ({
        label: `Display ${index + 1} (${display.size.width}x${display.size.height}) ${display.id === currentDisplay.id ? '(Current)' : ''}`,
        click: () => {
          this.moveWindowToDisplay(windowType, display);
        }
      }));

      const menu = Menu.buildFromTemplate(options);
      menu.popup();
    }

    moveWindowToDisplay(windowType, display) {
      const window = windowType === 'player' ? this.mainWindow : this.adminWindow;
      if (!window) return;

      const { x, y, width, height } = display.bounds;
      window.setBounds({ x, y, width, height });

      if (windowType === 'player') {
        // For player window, make it fullscreen on the selected display
        window.setFullScreen(true);
      }

      // Save display preference
      const prefs = this.preferences.loadSync();
      if (windowType === 'player') {
        prefs.playerDisplayId = display.id;
      } else {
        prefs.adminDisplayId = display.id;
      }
      this.preferences.save(prefs);

      console.log(`[main] Moved ${windowType} window to display:`, display.id);
    }

    openAdminConsole() {
      console.log('[main] Opening admin console...');
      if (this.adminWindow && !this.adminWindow.isDestroyed()) {
        this.adminWindow.focus();
        return;
      }

      const displays = screen.getAllDisplays();
      let adminDisplay;

      // Use saved admin display if available
      if (this.pendingAdminDisplayId) {
        adminDisplay = displays.find(d => d.id === this.pendingAdminDisplayId);
        if (!adminDisplay) {
          console.log(`[main] Saved admin display ${this.pendingAdminDisplayId} not found, using second display`);
        }
      }

      // Fallback to second display if available
      if (!adminDisplay) {
        adminDisplay = displays.length > 1 ? displays[1] : displays[0];
      }

      this.adminWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        x: adminDisplay.bounds.x + 50,
        y: adminDisplay.bounds.y + 50,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '..', 'renderer', 'preload.js')
        },
        title: 'DJAMMS Admin Console',
        show: false
      });

      // Load admin console HTML
      const adminPath = path.join(__dirname, '..', 'renderer', 'admin', 'admin.html');
      console.log('[main] Loading admin console from:', adminPath);
      console.log('[main] Admin file exists:', require('fs').existsSync(adminPath));
      this.adminWindow.loadFile(adminPath).then(() => {
        console.log('[main] Admin console HTML loaded successfully from file');
      }).catch(err => {
        console.error('[main] Failed to load admin console from file:', err);
        console.error('[main] Error details:', err.message, err.stack);
        // Fallback: create a simple admin interface
        console.log('[main] Loading fallback admin interface');
        this.adminWindow.loadURL(`data:text/html,
          <html>
            <head><title>DJAMMS Admin Console</title></head>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h1>DJAMMS Admin Console</h1>
              <p>Admin console is under development.</p>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
      });

      this.adminWindow.once('ready-to-show', () => {
        this.adminWindow.show();
        // Dev Tools are now hidden by default - can be toggled via menu
        // if (isDev) {
        //   this.adminWindow.webContents.openDevTools({ mode: 'detach' });
        // }
      });

      this.adminWindow.on('closed', () => {
        this.adminWindow = null;
      });

      console.log('[main] Admin console opened');
    }

    toggleAdminConsole() {
      console.log('[main] Toggling admin console visibility');
      if (this.adminWindow && !this.adminWindow.isDestroyed()) {
        if (this.adminWindow.isVisible()) {
          this.adminWindow.hide();
          console.log('[main] Admin console hidden');
        } else {
          this.adminWindow.show();
          this.adminWindow.focus();
          console.log('[main] Admin console shown');
        }
      } else {
        // Admin console doesn't exist, create it
        this.openAdminConsole();
      }
    }

    setupIPCHandlers() {
      ipcMain.on('renderer-ready', async () => {
        if (this.isShuttingDown) return;
        console.log('[main] renderer-ready received');
        // Renderer is ready, now load playlist and start playback
        await this.loadAndStartPlaylist();
      });

      ipcMain.on('playback-ended', async (event, data) => {
        if (this.isShuttingDown) return;
        console.log('[main] playback-ended received', data);
        // Advance to next video
        if (this.orchestrator) {
          await this.orchestrator.advanceQueue();
          // Load next video to maintain buffer
          await this.loadNextVideo();
        }
      });

      ipcMain.on('skip-completed', async (event, data) => {
        if (this.isShuttingDown) return;
        console.log('[main] skip-completed received', data);
        // Skip completed, advance to next
        if (this.orchestrator) {
          await this.orchestrator.advanceQueue();
          // Load next video to maintain buffer
          await this.loadNextVideo();
        }
      });

      // Handle invoke calls
      ipcMain.handle('get-preferences', () => {
        // Return default preferences for now
        return {
          kioskMode: false,
          showLogoOverlay: false,
          showNowPlaying: true,
          nowPlayingPosition: 'bottom',
          nowPlayingStyle: 'modern',
          nowPlayingDuration: 5
        };
      });

      ipcMain.handle('get-queue-state', () => {
        if (!this.orchestrator) {
          return { videos: [], currentIndex: -1, currentVideo: null };
        }
        const state = this.orchestrator.getState();
        // Convert to format expected by admin console
        return {
          videos: state.activeQueue || [],
          currentIndex: state.activeQueue.findIndex(v => v.id === state.nowPlaying?.id) || -1,
          currentVideo: state.nowPlaying,
          activeQueueSize: state.activeQueueSize || 0,
          priorityQueueSize: state.priorityQueueSize || 0
        };
      });

      ipcMain.handle('get-system-info', () => {
        return {
          version: '0.1.0',
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version
        };
      });

      ipcMain.handle('get-playlists', async () => {
        try {
          if (!this.orchestrator || !this.orchestrator.localFileManager) {
            return { playlists: [], collections: [] };
          }
          const library = await this.orchestrator.localFileManager.scanDJAMMSLibrary();
          return {
            playlists: library.playlists.map(p => ({
              name: p.name,
              path: p.path,
              videoCount: p.videos.length
            })),
            collections: library.collections.map(c => ({
              name: c.name,
              path: c.path,
              videoCount: c.videos.length
            }))
          };
        } catch (error) {
          console.error('[main] Failed to get playlists:', error);
          return { playlists: [], collections: [] };
        }
      });

      ipcMain.handle('orchestrator-command', async (event, command) => {
        if (this.isShuttingDown) {
          throw new Error('App is shutting down');
        }
        if (!this.orchestrator) {
          throw new Error('Orchestrator not initialized');
        }
        
        // Map renderer's format to orchestrator's expected format
        const orchestratorCommand = {
          action_type: command.action,
          action_data: command.data
        };
        
        await this.orchestrator.handleAdminCommand(orchestratorCommand);
        return { success: true };
      });

      // Forward renderer console logs to terminal (development only)
      ipcMain.on('renderer-log', (event, data) => {
        const { level, args } = data;
        const prefix = `[renderer:${level}]`;
        switch (level) {
          case 'log':
            console.log(prefix, ...args);
            break;
          case 'warn':
            console.warn(prefix, ...args);
            break;
          case 'error':
            console.error(prefix, ...args);
            break;
          default:
            console.log(prefix, ...args);
        }
      });

      // Handle toggle window fullscreen
      ipcMain.on('toggle-window-fullscreen', () => {
        if (this.mainWindow) {
          // Ensure window is focused before toggling fullscreen
          this.mainWindow.focus();
          
          const isCurrentlyFullScreen = this.mainWindow.isFullScreen();
          this.mainWindow.setFullScreen(!isCurrentlyFullScreen);
          
          // Save fullscreenPlayer preference
          const prefs = this.preferences.loadSync();
          prefs.fullscreenPlayer = !isCurrentlyFullScreen;
          this.preferences.save(prefs);
          
          console.log('[main] Toggled window fullscreen:', !isCurrentlyFullScreen);
        }
      });

      // Handle renderer fatal errors (development only)
      ipcMain.on('renderer-fatal-error', (event, data) => {
        console.error('[FATAL] Renderer Fatal Error:');
        console.error('Error:', data.error);
        console.error('Stack:', data.stack);
        app.quit(); // Quit the app immediately
      });

      // Handle volume save
      ipcMain.on('save-volume', (event, volume) => {
        const prefs = this.preferences.loadSync();
        prefs.volume = volume;
        this.preferences.save(prefs);
        console.log('[main] Saved volume preference:', volume);
      });

      // Handle mute save
      ipcMain.on('save-mute', (event, isMuted) => {
        const prefs = this.preferences.loadSync();
        prefs.muted = isMuted;
        this.preferences.save(prefs);
        console.log('[main] Saved mute preference:', isMuted);
      });
    }

    async loadNextVideo() {
      if (!this.fullPlaylist || this.videosLoaded >= this.fullPlaylist.length) {
        console.log('[main] No more videos to load or playlist not available');
        return false;
      }
      
      try {
        const nextVideo = this.fullPlaylist[this.videosLoaded];
        await this.orchestrator.addVideo(nextVideo);
        this.videosLoaded++;
        console.log(`[main] Loaded next video (${this.videosLoaded}/${this.fullPlaylist.length}): ${nextVideo.title}`);
        return true;
      } catch (error) {
        console.error('[main] Failed to load next video:', error);
        return false;
      }
    }

    async loadAndStartPlaylist() {
      if (this.isShuttingDown) {
        console.log('[main] Skipping loadAndStartPlaylist - app is shutting down');
        return;
      }
      
      console.log('[main] loadAndStartPlaylist called');
      
      // Don't recreate orchestrator if it already exists
      if (this.orchestrator) {
        console.log('[main] Orchestrator already exists, skipping recreation');
        return;
      }
      
      try {
        // Use prefs for file manager
        const prefs = await this.preferences.load();
        const playlistsRoot = prefs.djammsPath || prefs.playlistsPath || process.env.DJAMMS_PROJECT_FOLDER_PATH;
        console.log('[main] playlistsRoot:', playlistsRoot);
        const fileManager = new LocalFileManager(playlistsRoot);
        console.log('[main] LocalFileManager created');
        
        // Initialize Supabase adapter
        this.supabase = new SupabaseAdapter();
        const playerId = process.env.PLAYER_ID || 'electron-player-1';
        
        this.orchestrator = new QueueOrchestrator(this.supabase, fileManager);
        console.log('[main] QueueOrchestrator created');
        await this.orchestrator.initialize();
        console.log('[main] QueueOrchestrator initialized');

        // Initialize CommandProcessor
        this.commandProcessor = new CommandProcessor(this.orchestrator, this.supabase);
        await this.commandProcessor.initialize();
        console.log('[main] CommandProcessor initialized');

        // Send orchestrator-ready to renderer
        this.mainWindow.webContents.send('orchestrator-ready');

        // Set up orchestrator event listeners
        this.setupOrchestratorEventListeners();

        // load default playlist path from env
        const defaultPlaylistPath = process.env.DJAMMS_DEFAULT_PLAYLIST_PATH || (playlistsRoot ? `${playlistsRoot}/PLAYLISTS/DJAMMS Default` : null);
        console.log('[main] defaultPlaylistPath:', defaultPlaylistPath);
        
        if (defaultPlaylistPath && !this.playlistLoaded) {
          console.log('[main] Attempting to load playlist from:', defaultPlaylistPath);
          this.playlistLoaded = true; // Mark as loaded to prevent duplicates
          
          // Temporarily stop realtime subscription to prevent interference with queue loading
          this.orchestrator.stopRealtime();
          console.log('[main] Stopped realtime subscription during playlist loading');
          
          const playlist = await fileManager.getPlaylistByPath(defaultPlaylistPath);
          console.log('[main] getPlaylistByPath result:', playlist ? `found ${playlist.videos?.length || 0} videos` : 'null');
          
          if (playlist && playlist.videos && playlist.videos.length > 0) {
            console.log(`[main] Found playlist with ${playlist.videos.length} videos:`, playlist.name);
            
            // Sync videos to Supabase if connected and not already synced
            if (this.supabase.connected() && !this.videosSynced) {
              try {
                // Add timeout to prevent hanging
                const syncPromise = this.supabase.syncLocalVideos(playerId, playlist.videos);
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Video sync timeout')), 30000)
                );
                
                await Promise.race([syncPromise, timeoutPromise]);
                console.log(`[main] Synced ${playlist.videos.length} videos to Supabase`);
                this.videosSynced = true; // Mark as synced to prevent duplicate syncs
              } catch (syncError) {
                console.warn('[main] Failed to sync videos to Supabase:', syncError.message);
                // Don't mark as synced on failure, so it can retry later if needed
              }
            } else if (this.videosSynced) {
              console.log('[main] Videos already synced, skipping sync');
            }

            // Store the full shuffled playlist for progressive loading
            this.fullPlaylist = playlist.videos;
            console.log(`[main] Stored full playlist with ${this.fullPlaylist.length} videos for progressive loading`);

            // Clear existing queue before adding new playlist videos
            await this.orchestrator.clearQueue();
            console.log('[main] Cleared existing queue before loading new playlist');

            // Load only the first preloadBufferSize videos initially
            this.videosLoaded = 0;
            let initialLoadCount = Math.min(this.preloadBufferSize, this.fullPlaylist.length);
            console.log(`[main] Loading first ${initialLoadCount} videos from playlist`);
            
            for (let i = 0; i < initialLoadCount; i++) {
              await this.orchestrator.addVideo(this.fullPlaylist[i]);
              this.videosLoaded++;
            }
            console.log(`[main] Initially loaded ${this.videosLoaded} videos into queue`);
            
            // Check queue status after loading
            const queueState = this.orchestrator.getState();
            console.log(`[main] Queue status after initial load: activeQueue=${queueState.activeQueueSize}, priorityQueue=${queueState.priorityQueueSize}, nowPlaying=${queueState.nowPlaying?.title || 'none'}`);

            // advance into playing state (advanceQueue will trigger play-video events)
            await this.orchestrator.advanceQueue();
            console.log('[main] Advanced queue to start playback');
            
            // Restart realtime subscription now that playlist loading is complete (non-blocking)
            console.log('[main] Restarting realtime subscription after playlist loading (non-blocking)');
            this.orchestrator.startRealtime(playerId).catch(err => {
              console.warn('[main] Realtime subscription failed (non-critical):', err.message);
            });
            console.log('[main] Realtime subscription initiated');
          } else {
            // Restart realtime subscription even if playlist loading failed (non-blocking)
            console.log('[main] Restarting realtime subscription (non-blocking)');
            this.orchestrator.startRealtime(playerId).catch(err => {
              console.warn('[main] Realtime subscription failed (non-critical):', err.message);
            });
            console.warn('[main] No playlist found or playlist is empty at path:', defaultPlaylistPath);
            // Try to scan all playlists as fallback (non-blocking to prevent startup hang)
            console.log('[main] Attempting fallback: scanning all playlists (non-blocking)');
            // Run scan in background - don't block startup
            (async () => {
              try {
                // Add timeout to prevent hanging on library scan
                const scanPromise = fileManager.scanDJAMMSLibrary();
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Library scan timeout after 15 seconds')), 15000)
                );
                const library = await Promise.race([scanPromise, timeoutPromise]);
                console.log(`[main] Found ${library.playlists.length} playlists and ${library.collections.length} collections`);
              
                if (library.playlists.length > 0) {
                  const firstPlaylist = library.playlists[0];
                  console.log(`[main] Loading first playlist: ${firstPlaylist.name} with ${firstPlaylist.videos.length} videos`);
                  
                  // Shuffle and store full playlist
                  function shuffleArray(array) {
                    for (let i = array.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [array[i], array[j]] = [array[j], array[i]];
                    }
                  }
                  shuffleArray(firstPlaylist.videos);
                  this.fullPlaylist = firstPlaylist.videos;
                  console.log(`[main] Stored fallback playlist with ${this.fullPlaylist.length} videos for progressive loading`);
                  
                  // Load only the first preloadBufferSize videos initially
                  this.videosLoaded = 0;
                  let initialLoadCount = Math.min(this.preloadBufferSize, this.fullPlaylist.length);
                  console.log(`[main] Loading first ${initialLoadCount} videos from fallback playlist`);
                  
                  for (let i = 0; i < initialLoadCount; i++) {
                    await this.orchestrator.addVideo(this.fullPlaylist[i]);
                    this.videosLoaded++;
                  }
                  console.log(`[main] Initially loaded ${this.videosLoaded} videos from fallback playlist`);
                  
                  await this.orchestrator.advanceQueue();
                } else {
                  console.warn('[main] No playlists found in library scan fallback');
                }
              } catch (scanError) {
                console.error('[main] Library scan failed or timed out:', scanError.message);
                console.log('[main] Continuing without playlist - app will wait for manual video addition or realtime commands');
              }
            })();
            console.log('[main] Startup complete - app ready, playlist scan running in background');
          }
        } else {
          console.warn('[main] No default playlist path available');
        }
      } catch (err) {
        console.warn('[main] orchestrator/setup failed', err && err.message ? err.message : err);
      }
    }

    async createPlayerWindow(prefs) {
      // Use prefs for window config
      this.mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        fullscreen: false, // Never start in fullscreen to keep menu bar visible
        kiosk: false, // Never use kiosk mode to keep menu bar visible
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
          preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
          additionalArguments: isDev ? ['--debug'] : []
        }
      });

      console.log('[main] BrowserWindow created, id:', this.mainWindow.id);

      const playerPath = '/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/src/renderer/player/player.html';
      console.log('[main] __dirname:', __dirname);
      console.log('[main] playerPath:', playerPath);
      console.log('[main] path exists:', require('fs').existsSync(playerPath));
      this.mainWindow.loadFile(playerPath)
        .then(() => {
          console.log('[main] player.html loaded successfully:', playerPath);
          try { log.info('[main] player.html loaded successfully:', playerPath); } catch (e) {}
          
          // Start playlist loading immediately after HTML loads
          setTimeout(() => {
            this.loadAndStartPlaylist().catch(err => {
              console.error('[main] loadAndStartPlaylist failed:', err);
            });
          }, 1000); // Give renderer time to initialize
        })
        .catch((err) => {
          console.error('[main] failed to load player.html:', err);
          // fallback to a basic page so the window is visible
          try { 
            this.mainWindow.loadURL('data:text/html,<h1>Obie Player - Error Loading</h1><p>Error: ' + err.message + '</p>');
          } catch (e) { 
            console.error('[main] fallback loadURL also failed:', e);
          }
        });

      // Set up IPC handlers
      this.setupIPCHandlers();

      // Add window event listeners for debugging
      this.mainWindow.on('ready-to-show', () => {
        console.log('[main] window ready-to-show event');
      });

      this.mainWindow.on('show', () => {
        console.log('[main] window show event');
      });

      this.mainWindow.on('hide', () => {
        console.log('[main] window hide event');
      });

      this.mainWindow.on('close', () => {
        console.log('[main] window close event');
      });

      this.mainWindow.on('closed', () => {
        console.log('[main] window closed event - setting mainWindow to null');
        this.mainWindow = null;
      });

      // Add fullscreen state change listeners to keep preferences in sync
      this.mainWindow.on('enter-full-screen', () => {
        console.log('[main] Window entered fullscreen mode');
        const prefs = this.preferences.loadSync();
        prefs.fullscreenPlayer = true;
        this.preferences.save(prefs);
      });

      this.mainWindow.on('leave-full-screen', () => {
        console.log('[main] Window left fullscreen mode');
        const prefs = this.preferences.loadSync();
        prefs.fullscreenPlayer = false;
        this.preferences.save(prefs);
      });

      this.mainWindow.webContents.on('did-finish-load', () => {
        console.log('[main] webContents did-finish-load');
      });

      this.mainWindow.webContents.on('dom-ready', () => {
        console.log('[main] webContents dom-ready');
      });

      this.mainWindow.webContents.on('crashed', (event, killed) => {
        console.error('[main] webContents crashed, killed:', killed);
      });

      // Show when ready; in dev we also force the window to front and open DevTools.
      this.mainWindow.once('ready-to-show', async () => {
        console.log('[main] ready-to-show fired — window is shown');
        try { log.info('[main] ready-to-show fired — window is shown'); } catch (e) {}
        
        // Apply fullscreen setting immediately when window is ready
        const prefs = this.preferences.loadSync();
        if (prefs.fullscreenPlayer) {
          console.log('[main] Setting fullscreen mode on window ready');
          this.mainWindow.setFullScreen(true);
        }
        
        // Force visibility
        try {
          this.mainWindow.maximize();
          this.mainWindow.setVisibleOnAllWorkspaces(true);
          this.mainWindow.focus();
          console.log('[main] Window maximized, focused');
        } catch (e) { console.error('[main] Error forcing visibility:', e); }
        
        // Automatically open admin console after a short delay
        setTimeout(() => {
          console.log('[main] Auto-opening admin console on startup');
          this.openAdminConsole();
        }, 2000); // 2 second delay to let player window fully initialize

        const isDevMode = process.env.NODE_ENV === 'development' || process.env.ELECTRON_ENABLE_LOGGING === 'true' || process.argv.includes('--debug');
        if (isDevMode) {
          // Dev Tools are now hidden by default - can be toggled via menu
          // this.mainWindow.webContents.openDevTools({ mode: 'right' });

          // Don't set full screen bounds in dev mode to keep menu bar visible
          // The window will be positioned normally, allowing menu access

          // Release alwaysOnTop shortly after to allow normal window interaction
          setTimeout(() => { try { this.mainWindow.setAlwaysOnTop(false); } catch (e) {} }, 3000);
        }

        setTimeout(() => { try { this.mainWindow.focus(); } catch (e) {} }, 250);

        // Orchestrator setup is now handled in renderer-ready handler
      });

      this.mainWindow.on('closed', () => { 
        this.mainWindow = null; 
        this.isShuttingDown = true;
      });
    }
  }

  module.exports = ObieElectronPlayer;

// Standard Electron main process setup
console.log('[main] Setting up Electron app handlers');
let player = null;

app.on('ready', () => {
  console.log('[main] app ready event fired - starting menu creation');
  try {
    console.log('[main] Creating ObieElectronPlayer instance');
    player = new ObieElectronPlayer();
    
    // Create application menu
    player.createApplicationMenu();
    
    console.log('[main] ObieElectronPlayer created, calling createWindow');
    player.createPlayerWindow(player.preferences.load());
    console.log('[main] createWindow completed');
  } catch (err) {
    console.error('[main] Error in app ready handler:', err);
    console.error(err.stack);
    process.exit(1);
  }
});

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('[main] app activate event fired');
  console.log('[main] player exists:', !!player);
  console.log('[main] player.mainWindow:', player?.mainWindow);
  if (player && player.mainWindow === null) {
    console.log('[main] mainWindow is null, calling createWindow');
    player.createPlayerWindow(player.preferences.load());
  } else if (player && player.mainWindow && !player.mainWindow.isDestroyed()) {
    console.log('[main] Window already exists and is not destroyed, focusing it');
    player.mainWindow.focus();
  } else {
    console.log('[main] not creating window - conditions not met');
  }
});
