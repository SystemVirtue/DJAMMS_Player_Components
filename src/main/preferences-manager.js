const fs = require('fs');
const path = require('path');

class PreferencesManager {
  constructor() {
    // prefer to keep preferences on disk in userData; for the stub we'll keep a file in workspace
    this._prefsPath = path.join(process.cwd(), '.djamms-preferences.json');
    this._defaults = {
      djammsPath: process.env.HOME ? `${process.env.HOME}/Music/DJAMMS` : '~/Music/DJAMMS',
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_ANON_KEY || '',
      playerId: process.env.PLAYER_ID || 'electron-player-1',
      fullscreenPlayer: true, // Changed from fullscreen: false to fullscreenPlayer: true
      kioskMode: false,
      defaultDisplay: 'primary',
      volume: 1.0,
      muted: false,
      playerDisplayId: null,
      adminDisplayId: null,
      crossfadeEnabled: true,
      crossfadeDuration: 3,
      autoUpdate: true,
      metube: { enabled: false, port: 8081 }
    };

    // ensure file present
    if (!fs.existsSync(this._prefsPath)) {
      try { fs.writeFileSync(this._prefsPath, JSON.stringify(this._defaults, null, 2)); } catch (e) { /* ignore */ }
    }
  }

  async load() {
    try {
      const raw = fs.readFileSync(this._prefsPath, 'utf8');
      const json = JSON.parse(raw);
      return Object.assign({}, this._defaults, json);
    } catch (e) {
      return Object.assign({}, this._defaults);
    }
  }

  loadSync() {
    try { return JSON.parse(fs.readFileSync(this._prefsPath, 'utf8')); } catch (e) { return Object.assign({}, this._defaults); }
  }

  async save(newPrefs) {
    try {
      fs.writeFileSync(this._prefsPath, JSON.stringify(Object.assign({}, this._defaults, newPrefs), null, 2));
      return true;
    } catch (e) {
      return false;
    }
  }

  async resetToDefaults() {
    try { fs.writeFileSync(this._prefsPath, JSON.stringify(this._defaults, null, 2)); return true; } catch (e) { return false; }
  }

  getDefaultDjammsPath() {
    return this._defaults.djammsPath;
  }

  async validateDjammsPath(p) {
    // Very small validation: check PLAYLISTS and COLLECTIONS dir exist
    try {
      return (fs.existsSync(path.join(p, 'PLAYLISTS')) && fs.existsSync(path.join(p, 'COLLECTIONS')));
    } catch (e) { return false; }
  }

  get(key) {
    const prefs = this.loadSync();
    return prefs[key];
  }
}

module.exports = PreferencesManager;
