/**
 * useSettings Hook
 * Manages application settings including player settings, kiosk settings, and overlay settings
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

interface PlayerSettings {
  autoShufflePlaylists: boolean;
  normalizeAudioLevels: boolean;
  enableFullscreenPlayer: boolean;
  fadeDuration: number;
  crossfadeMode: 'manual' | 'seamless';
  playerDisplayId: number | null;
  playerFullscreen: boolean;
  playlistsDirectory: string;
}

interface KioskSettings {
  mode: 'freeplay' | 'credits';
  uiMode: 'classic' | 'jukebox';
  creditBalance: number;
  searchAllMusic: boolean;
  searchYoutube: boolean;
}

interface OverlaySettings {
  showNowPlaying: boolean;
  nowPlayingSize: number;
  nowPlayingX: number;
  nowPlayingY: number;
  nowPlayingOpacity: number;
  showComingUp: boolean;
  comingUpSize: number;
  comingUpX: number;
  comingUpY: number;
  comingUpOpacity: number;
  showWatermark: boolean;
  watermarkImage: string;
  watermarkSize: number;
  watermarkX: number;
  watermarkY: number;
  watermarkOpacity: number;
}

interface UseSettingsOptions {
  isElectron: boolean;
}

interface UseSettingsReturn {
  // Settings state
  settings: PlayerSettings;
  kioskSettings: KioskSettings;
  overlaySettings: OverlaySettings;
  
  // Setters
  setSettings: React.Dispatch<React.SetStateAction<PlayerSettings>>;
  setKioskSettings: React.Dispatch<React.SetStateAction<KioskSettings>>;
  setOverlaySettings: React.Dispatch<React.SetStateAction<OverlaySettings>>;
  
  // Actions
  updateSetting: <K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) => void;
  updateKioskSetting: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
  updateOverlaySetting: <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

export const useSettings = ({ isElectron }: UseSettingsOptions): UseSettingsReturn => {
  const [settings, setSettings] = useState<PlayerSettings>({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0,
    crossfadeMode: 'manual',
    playerDisplayId: null,
    playerFullscreen: false,
    playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
  });

  const [kioskSettings, setKioskSettings] = useState<KioskSettings>({
    mode: 'freeplay',
    uiMode: 'classic',
    creditBalance: 0,
    searchAllMusic: true,
    searchYoutube: false
  });

  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    showNowPlaying: true,
    nowPlayingSize: 100,
    nowPlayingX: 5,
    nowPlayingY: 85,
    nowPlayingOpacity: 100,
    showComingUp: true,
    comingUpSize: 100,
    comingUpX: 5,
    comingUpY: 95,
    comingUpOpacity: 100,
    showWatermark: true,
    watermarkImage: './Obie_neon_no_BG.png',
    watermarkSize: 100,
    watermarkX: 90,
    watermarkY: 10,
    watermarkOpacity: 80
  });

  // Load settings from Electron store
  const loadSettings = useCallback(async () => {
    if (!isElectron) return;
    
    try {
      const savedVolume = await (window as any).electronAPI.getSetting('volume');
      if (savedVolume !== undefined) {
        // Volume is handled separately, but we can load other settings here
      }
      
      const savedSettings = await (window as any).electronAPI.getSetting('playerSettings');
      if (savedSettings) {
        setSettings(prev => ({ ...prev, ...savedSettings }));
      }
      
      const savedKioskSettings = await (window as any).electronAPI.getSetting('kioskSettings');
      if (savedKioskSettings) {
        setKioskSettings(prev => ({ ...prev, ...savedKioskSettings }));
      }
      
      const savedOverlaySettings = await (window as any).electronAPI.getSetting('overlaySettings');
      if (savedOverlaySettings) {
        setOverlaySettings(prev => ({ ...prev, ...savedOverlaySettings }));
      }
    } catch (error) {
      logger.error('[useSettings] Error loading settings:', error);
    }
  }, [isElectron]);

  // Save settings to Electron store
  const saveSettings = useCallback(async () => {
    if (!isElectron) return;
    
    try {
      await (window as any).electronAPI.setSetting('playerSettings', settings);
      await (window as any).electronAPI.setSetting('kioskSettings', kioskSettings);
      await (window as any).electronAPI.setSetting('overlaySettings', overlaySettings);
    } catch (error) {
      logger.error('[useSettings] Error saving settings:', error);
    }
  }, [isElectron, settings, kioskSettings, overlaySettings]);

  // Update individual setting
  const updateSetting = useCallback(<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Update individual kiosk setting
  const updateKioskSetting = useCallback(<K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => {
    setKioskSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Update individual overlay setting
  const updateOverlaySetting = useCallback(<K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => {
    setOverlaySettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Auto-save settings when they change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveSettings();
    }, 1000); // Debounce saves
    
    return () => clearTimeout(timeoutId);
  }, [settings, kioskSettings, overlaySettings, saveSettings]);

  return {
    settings,
    kioskSettings,
    overlaySettings,
    setSettings,
    setKioskSettings,
    setOverlaySettings,
    updateSetting,
    updateKioskSetting,
    updateOverlaySetting,
    loadSettings,
    saveSettings
  };
};

