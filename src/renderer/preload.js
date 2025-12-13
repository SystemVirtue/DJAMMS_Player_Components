console.log('[preload] Preload script loaded and executing');

const { contextBridge, ipcRenderer } = require('electron');

// Expose electronAPI to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, payload) => {
    ipcRenderer.send(channel, payload);
  },
  on: (channel, cb) => {
    ipcRenderer.on(channel, (_, data) => cb(data));
  },
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  // Specific API methods for admin console
  sendOrchestratorCommand: (command) => {
    return ipcRenderer.invoke('orchestrator-command', command);
  },

  getSystemInfo: () => {
    return ipcRenderer.invoke('get-system-info');
  },

  getQueueState: () => {
    return ipcRenderer.invoke('get-queue-state');
  },

  getPreferences: () => {
    return ipcRenderer.invoke('get-preferences');
  },

  // Event listeners for admin console
  onQueueUpdated: (callback) => {
    ipcRenderer.on('queue:updated', (_, state) => callback(state));
  },

  getPlaylists: () => {
    return ipcRenderer.invoke('get-playlists');
  }
});

console.log('[preload] electronAPI exposed via contextBridge');

// Console forwarding for debugging (only in development)
const isDev = (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') || 
              (typeof process !== 'undefined' && process.argv && process.argv.includes('--debug')) ||
              false;

if (isDev) {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  // Override console methods to forward to main process
  console.log = (...args) => {
    originalConsole.log(...args); // Keep original DevTools output
    ipcRenderer.send('renderer-log', { level: 'log', args });
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    ipcRenderer.send('renderer-log', { level: 'warn', args });
  };

  console.error = (...args) => {
    originalConsole.error(...args);
    ipcRenderer.send('renderer-log', { level: 'error', args });
  };

  console.log('[preload] Console forwarding enabled for development');

  // Renderer crash handlers - prevent hanging on fatal errors
  window.addEventListener('error', (event) => {
    console.error('[FATAL] Renderer Error:', event.error);
    console.error(event.error?.stack);
    ipcRenderer.send('renderer-fatal-error', {
      error: event.error?.message || 'Unknown renderer error',
      stack: event.error?.stack || 'No stack trace'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[FATAL] Renderer Unhandled Rejection:', event.reason);
    console.error(event.reason?.stack);
    ipcRenderer.send('renderer-fatal-error', {
      error: event.reason?.message || 'Unhandled promise rejection',
      stack: event.reason?.stack || 'No stack trace'
    });
  });

  console.log('[preload] Renderer crash handlers enabled for development');
}
