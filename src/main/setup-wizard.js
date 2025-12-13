class SetupWizard {
  constructor(preferences) {
    this.preferences = preferences;
  }

  async checkNeedsSetup() {
    // Minimal check: if preferences files are missing or djamms path not set
    const prefs = await this.preferences.load();
    // if djammsPath is empty, say we need setup; otherwise not
    return !prefs || !prefs.djammsPath;
  }

  async show() {
    // In this stub we will return true immediately to continue startup
    return true;
  }
}

module.exports = SetupWizard;
