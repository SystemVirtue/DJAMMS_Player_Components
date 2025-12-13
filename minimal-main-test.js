const { app, BrowserWindow } = require('electron');
const path = require('path');

console.log('[minimal] Starting minimal Electron app');

function createWindow() {
  console.log('[minimal] Creating window');
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const htmlPath = path.join(__dirname, 'simple-test.html');
  console.log('[minimal] Loading HTML from:', htmlPath);

  win.loadFile(htmlPath).then(() => {
    console.log('[minimal] HTML loaded successfully');
  }).catch((err) => {
    console.error('[minimal] Failed to load HTML:', err);
  });
}

app.whenReady().then(() => {
  console.log('[minimal] App ready, creating window');
  createWindow();
});

app.on('window-all-closed', () => {
  console.log('[minimal] All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('[minimal] App activated');
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});