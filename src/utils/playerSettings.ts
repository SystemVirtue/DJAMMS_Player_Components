// src/utils/playerSettings.ts - Player Settings State Manager

import { DisplayInfo } from './displayManager';

export interface PlayerSettings {
  showPlayer: boolean;
  displayId: number | null;
  displayIndex: number;
  fullscreen: boolean;
}

export interface PlayerSettingsManagerOptions {
  onSettingsChanged?: (settings: PlayerSettings) => void;
  onPlayerWindowToggle?: (show: boolean) => void;
  onDisplayChange?: (displayId: number | null) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const STORAGE_KEYS = {
  SHOW_PLAYER: 'djamms_playerShow',
  DISPLAY_ID: 'djamms_playerDisplayId',
  DISPLAY_INDEX: 'djamms_playerDisplayIndex',
  FULLSCREEN: 'djamms_playerFullscreen'
} as const;

const DEFAULT_SETTINGS: PlayerSettings = {
  showPlayer: true,
  displayId: null,
  displayIndex: 0,
  fullscreen: false
};

/**
 * PlayerSettingsManager - Manages player window settings with persistence
 * Handles localStorage/electron-store persistence and IPC communication
 */
export class PlayerSettingsManager {
  private settings: PlayerSettings;
  private options: PlayerSettingsManagerOptions;
  private isElectron: boolean;

  constructor(options: PlayerSettingsManagerOptions = {}) {
    this.options = options;
    this.isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /**
   * Initialize settings manager and load persisted settings
   */
  async initialize(): Promise<PlayerSettings> {
    await this.loadSettings();
    return this.settings;
  }

  /**
   * Load settings from storage
   */
  async loadSettings(): Promise<void> {
    try {
      if (this.isElectron) {
        // Load from electron-store via IPC
        const api = (window as any).electronAPI;
        
        const [showPlayer, displayId, displayIndex, fullscreen] = await Promise.all([
          api.getSetting('playerShow'),
          api.getSetting('playerDisplayId'),
          api.getSetting('playerDisplayIndex'),
          api.getSetting('playerFullscreen')
        ]);

        this.settings = {
          showPlayer: showPlayer ?? DEFAULT_SETTINGS.showPlayer,
          displayId: displayId ?? DEFAULT_SETTINGS.displayId,
          displayIndex: displayIndex ?? DEFAULT_SETTINGS.displayIndex,
          fullscreen: fullscreen ?? DEFAULT_SETTINGS.fullscreen
        };
      } else {
        // Load from localStorage
        this.settings = {
          showPlayer: this.getLocalStorage(STORAGE_KEYS.SHOW_PLAYER, DEFAULT_SETTINGS.showPlayer),
          displayId: this.getLocalStorage(STORAGE_KEYS.DISPLAY_ID, DEFAULT_SETTINGS.displayId),
          displayIndex: this.getLocalStorage(STORAGE_KEYS.DISPLAY_INDEX, DEFAULT_SETTINGS.displayIndex),
          fullscreen: this.getLocalStorage(STORAGE_KEYS.FULLSCREEN, DEFAULT_SETTINGS.fullscreen)
        };
      }
    } catch (error) {
      console.error('Failed to load player settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save all settings to storage
   */
  async saveSettings(): Promise<void> {
    try {
      if (this.isElectron) {
        const api = (window as any).electronAPI;
        
        await Promise.all([
          api.setSetting('playerShow', this.settings.showPlayer),
          api.setSetting('playerDisplayId', this.settings.displayId),
          api.setSetting('playerDisplayIndex', this.settings.displayIndex),
          api.setSetting('playerFullscreen', this.settings.fullscreen)
        ]);

        // Emit IPC event for main process
        api.sendPlaybackState?.({
          type: 'player-settings-updated',
          settings: this.settings
        });
      } else {
        // Save to localStorage
        this.setLocalStorage(STORAGE_KEYS.SHOW_PLAYER, this.settings.showPlayer);
        this.setLocalStorage(STORAGE_KEYS.DISPLAY_ID, this.settings.displayId);
        this.setLocalStorage(STORAGE_KEYS.DISPLAY_INDEX, this.settings.displayIndex);
        this.setLocalStorage(STORAGE_KEYS.FULLSCREEN, this.settings.fullscreen);
      }

      // Notify listeners
      this.options.onSettingsChanged?.(this.settings);
    } catch (error) {
      console.error('Failed to save player settings:', error);
    }
  }

  /**
   * Get current settings
   */
  getSettings(): PlayerSettings {
    return { ...this.settings };
  }

  /**
   * Get a specific setting value
   */
  getSetting<K extends keyof PlayerSettings>(key: K): PlayerSettings[K] {
    return this.settings[key];
  }

  /**
   * Update a specific setting
   */
  async updateSetting<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]): Promise<void> {
    const oldValue = this.settings[key];
    this.settings[key] = value;

    // Fire specific callbacks based on setting changed
    if (key === 'showPlayer' && oldValue !== value) {
      this.options.onPlayerWindowToggle?.(value as boolean);
    } else if ((key === 'displayId' || key === 'displayIndex') && oldValue !== value) {
      this.options.onDisplayChange?.(this.settings.displayId);
    } else if (key === 'fullscreen' && oldValue !== value) {
      this.options.onFullscreenChange?.(value as boolean);
    }

    await this.saveSettings();
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(updates: Partial<PlayerSettings>): Promise<void> {
    const oldSettings = { ...this.settings };
    this.settings = { ...this.settings, ...updates };

    // Fire callbacks for changed settings
    if (oldSettings.showPlayer !== this.settings.showPlayer) {
      this.options.onPlayerWindowToggle?.(this.settings.showPlayer);
    }
    if (oldSettings.displayId !== this.settings.displayId || oldSettings.displayIndex !== this.settings.displayIndex) {
      this.options.onDisplayChange?.(this.settings.displayId);
    }
    if (oldSettings.fullscreen !== this.settings.fullscreen) {
      this.options.onFullscreenChange?.(this.settings.fullscreen);
    }

    await this.saveSettings();
  }

  /**
   * Toggle player window visibility
   */
  async togglePlayerWindow(): Promise<boolean> {
    await this.updateSetting('showPlayer', !this.settings.showPlayer);
    return this.settings.showPlayer;
  }

  /**
   * Set the display for the player window
   */
  async setPlayerDisplay(display: DisplayInfo | null): Promise<void> {
    await this.updateSettings({
      displayId: display?.id ?? null,
      displayIndex: display ? 0 : this.settings.displayIndex // Reset index when setting explicit display
    });
  }

  /**
   * Toggle fullscreen mode
   */
  async toggleFullscreen(): Promise<boolean> {
    await this.updateSetting('fullscreen', !this.settings.fullscreen);
    return this.settings.fullscreen;
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
  }

  /**
   * Helper: Get value from localStorage with type coercion
   */
  private getLocalStorage<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;

      // Handle different types
      if (typeof defaultValue === 'boolean') {
        return (stored === 'true') as unknown as T;
      }
      if (typeof defaultValue === 'number') {
        const num = parseInt(stored, 10);
        return (isNaN(num) ? defaultValue : num) as unknown as T;
      }
      if (defaultValue === null) {
        return (stored === 'null' ? null : parseInt(stored, 10)) as unknown as T;
      }
      return stored as unknown as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Helper: Set value in localStorage
   */
  private setLocalStorage(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }
}

// Singleton instance
let playerSettingsInstance: PlayerSettingsManager | null = null;

export function getPlayerSettingsManager(options?: PlayerSettingsManagerOptions): PlayerSettingsManager {
  if (!playerSettingsInstance) {
    playerSettingsInstance = new PlayerSettingsManager(options);
  }
  return playerSettingsInstance;
}

export function destroyPlayerSettingsManager(): void {
  playerSettingsInstance = null;
}
