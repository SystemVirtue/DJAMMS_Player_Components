class WindowManager {
  constructor() {}

  openAdminConsole(url) {
    // placeholder: real implementation would create a new BrowserWindow
    // For now we log and do nothing
    // This keeps the main process stable in dev
    // TODO: implement admin console window creation
    return null;
  }

  openKioskInterface(url) {
    // placeholder
    return null;
  }

  hideCursor(win) {
    try {
      // Keep simple: toggle CSS hide via executeJavaScript if available
      if (win && win.webContents) {
        win.webContents.insertCSS('html,body,video { cursor: none !important; }');
      }
    } catch (e) {
      // ignore
    }
  }
}

module.exports = WindowManager;
