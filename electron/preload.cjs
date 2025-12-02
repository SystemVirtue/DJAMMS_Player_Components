// electron/preload.cjs - Preload Script (CJS - required for Electron preload)
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Playlist/File Operations
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  getVideoMetadata: (filePath) => ipcRenderer.invoke('get-video-metadata', filePath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Display Management
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  createFullscreenWindow: (displayId) => ipcRenderer.invoke('create-fullscreen-window', displayId),
  closeFullscreenWindow: () => ipcRenderer.invoke('close-fullscreen-window'),
  controlFullscreenPlayer: (action, data) => ipcRenderer.invoke('control-fullscreen-player', action, data),

  // Player Window Management
  createPlayerWindow: (displayId) => ipcRenderer.invoke('create-player-window', displayId),
  closePlayerWindow: () => ipcRenderer.invoke('close-player-window'),
  togglePlayerWindow: () => ipcRenderer.invoke('toggle-player-window'),
  getPlayerWindowStatus: () => ipcRenderer.invoke('get-player-window-status'),
  controlPlayerWindow: (action, data) => ipcRenderer.invoke('control-player-window', action, data),
  movePlayerToDisplay: (displayId) => ipcRenderer.invoke('move-player-to-display', displayId),
  setPlayerFullscreen: (fullscreen) => ipcRenderer.invoke('set-player-fullscreen', fullscreen),
  refreshPlayerWindow: (displayId) => ipcRenderer.invoke('refresh-player-window', displayId),
  onPlayerWindowClosed: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('player-window-closed', subscription);
    return () => ipcRenderer.removeListener('player-window-closed', subscription);
  },
  
  // Player Settings Updates (sends settings to main process for window positioning)
  sendPlayerSettings: (settings) => ipcRenderer.send('player-settings-updated', settings),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),

  // Window Operations
  openAdminConsole: () => ipcRenderer.invoke('open-admin-console'),

  // Playback State Sync
  sendPlaybackState: (state) => ipcRenderer.send('playback-state-update', state),
  onPlaybackStateSync: (callback) => {
    const subscription = (event, state) => callback(state);
    ipcRenderer.on('playback-state-sync', subscription);
    return () => ipcRenderer.removeListener('playback-state-sync', subscription);
  },

  // Video Control (from main to renderer)
  onVideoEnded: () => ipcRenderer.send('video-ended'),
  onRequestNextVideo: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('request-next-video', subscription);
    return () => ipcRenderer.removeListener('request-next-video', subscription);
  },

  // Menu/Keyboard Events
  onTogglePlayback: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('toggle-playback', subscription);
    return () => ipcRenderer.removeListener('toggle-playback', subscription);
  },
  onSkipVideo: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('skip-video', subscription);
    return () => ipcRenderer.removeListener('skip-video', subscription);
  },
  onVolumeUp: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('volume-up', subscription);
    return () => ipcRenderer.removeListener('volume-up', subscription);
  },
  onVolumeDown: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('volume-down', subscription);
    return () => ipcRenderer.removeListener('volume-down', subscription);
  },
  onOpenSettings: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('open-settings', subscription);
    return () => ipcRenderer.removeListener('open-settings', subscription);
  },
  onPlaylistsDirectoryChanged: (callback) => {
    const subscription = (event, path) => callback(path);
    ipcRenderer.on('playlists-directory-changed', subscription);
    return () => ipcRenderer.removeListener('playlists-directory-changed', subscription);
  },
  onFullscreenClosed: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('fullscreen-closed', subscription);
    return () => ipcRenderer.removeListener('fullscreen-closed', subscription);
  },

  // Fullscreen Player Control
  onControlPlayer: (callback) => {
    const subscription = (event, { action, data }) => callback(action, data);
    ipcRenderer.on('control-player', subscription);
    return () => ipcRenderer.removeListener('control-player', subscription);
  },

  // Search
  getRecentSearches: () => ipcRenderer.invoke('get-recent-searches'),
  addRecentSearch: (query) => ipcRenderer.invoke('add-recent-search', query),
  clearRecentSearches: () => ipcRenderer.invoke('clear-recent-searches'),

  // Platform info
  platform: process.platform,
  isElectron: true
});
