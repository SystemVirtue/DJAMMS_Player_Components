/**
 * Settings utility for web applications
 * Stores settings in localStorage
 */

const SETTINGS_KEY = 'djamms-web-settings';
const DEFAULT_THUMBNAILS_PATH = '/Users/mikeclarkin/Music/DJAMMS/THUMBNAILS';

export interface WebSettings {
  thumbnailsPath: string;
  playlistsPath?: string;
}

const defaultSettings: WebSettings = {
  thumbnailsPath: DEFAULT_THUMBNAILS_PATH,
  playlistsPath: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
};

export function getSettings(): WebSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultSettings, ...parsed };
    }
  } catch (error) {
    console.error('[Settings] Error loading settings:', error);
  }
  return defaultSettings;
}

export function setSettings(settings: Partial<WebSettings>): void {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[Settings] Error saving settings:', error);
  }
}

export function getThumbnailsPath(): string {
  return getSettings().thumbnailsPath;
}

export function setThumbnailsPath(path: string): void {
  setSettings({ thumbnailsPath: path });
}




