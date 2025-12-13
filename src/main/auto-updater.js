class AutoUpdateManager {
  constructor() {
    this._available = false;
  }

  async checkForUpdates() {
    // stubbed: returns no updates in dev
    this._available = false;
    return { hasUpdate: false };
  }

  async downloadUpdate() {
    return { ok: true };
  }

  quitAndInstall() {
    // no-op in dev
  }
}

module.exports = AutoUpdateManager;
