// src/hooks/useDisplayManager.ts - React hook for display management

import { useState, useEffect, useCallback, useRef } from 'react';
import { DisplayManager, DisplayInfo, getDisplayManager, destroyDisplayManager } from '../utils/displayManager';
import { PlayerSettingsManager, PlayerSettings, getPlayerSettingsManager } from '../utils/playerSettings';

export interface UseDisplayManagerReturn {
  // Display state
  displays: DisplayInfo[];
  primaryDisplay: DisplayInfo | null;
  selectedDisplay: DisplayInfo | null;
  isLoading: boolean;
  error: Error | null;

  // Player window state
  playerWindowOpen: boolean;
  settings: PlayerSettings;

  // Actions
  refreshDisplays: () => Promise<void>;
  selectDisplay: (displayId: number | null) => Promise<void>;
  togglePlayerWindow: () => Promise<void>;
  setPlayerWindowOpen: (open: boolean) => Promise<void>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  openPlayerOnDisplay: (displayId: number, fullscreen?: boolean) => Promise<void>;
}

/**
 * React hook for managing displays and player window settings
 * Combines DisplayManager and PlayerSettingsManager with React state
 */
export function useDisplayManager(): UseDisplayManagerReturn {
  // State
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [primaryDisplay, setPrimaryDisplay] = useState<DisplayInfo | null>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<DisplayInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [playerWindowOpen, setPlayerWindowOpenState] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>({
    showPlayer: true,
    displayId: null,
    displayIndex: 0,
    fullscreen: false
  });

  // Refs for managers
  const displayManagerRef = useRef<DisplayManager | null>(null);
  const settingsManagerRef = useRef<PlayerSettingsManager | null>(null);

  // Check if Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Initialize managers
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Initialize display manager
        displayManagerRef.current = getDisplayManager({
          onDisplaysChanged: (newDisplays) => {
            setDisplays(newDisplays);
            setPrimaryDisplay(newDisplays.find(d => d.isPrimary) || newDisplays[0] || null);
          },
          onError: (err) => {
            setError(err);
            console.error('Display manager error:', err);
          }
        });

        // Initialize settings manager
        settingsManagerRef.current = getPlayerSettingsManager({
          onSettingsChanged: (newSettings) => {
            setSettings(newSettings);
          },
          onPlayerWindowToggle: async (show) => {
            if (isElectron) {
              try {
                if (show) {
                  await (window as any).electronAPI.createPlayerWindow(settings.displayId);
                  setPlayerWindowOpenState(true);
                } else {
                  await (window as any).electronAPI.closePlayerWindow();
                  setPlayerWindowOpenState(false);
                }
              } catch (err) {
                console.error('Failed to toggle player window:', err);
              }
            }
          }
        });

        // Load displays
        const loadedDisplays = await displayManagerRef.current.initialize();
        setDisplays(loadedDisplays);
        setPrimaryDisplay(loadedDisplays.find(d => d.isPrimary) || loadedDisplays[0] || null);

        // Load settings
        const loadedSettings = await settingsManagerRef.current.initialize();
        setSettings(loadedSettings);

        // Set selected display based on settings
        if (loadedSettings.displayId !== null) {
          const display = loadedDisplays.find(d => d.id === loadedSettings.displayId);
          setSelectedDisplay(display || null);
        }

        // Check player window status if in Electron
        if (isElectron) {
          try {
            const status = await (window as any).electronAPI.getPlayerWindowStatus();
            setPlayerWindowOpenState(status?.isOpen || false);
          } catch (err) {
            console.error('Failed to get player window status:', err);
          }
        }
      } catch (err) {
        setError(err as Error);
        console.error('Failed to initialize display manager:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    // Cleanup
    return () => {
      displayManagerRef.current?.stopHotPlugDetection();
    };
  }, [isElectron]);

  // Listen for player window closed event
  useEffect(() => {
    if (!isElectron) return;

    const api = (window as any).electronAPI;
    const unsubscribe = api.onPlayerWindowClosed?.(() => {
      setPlayerWindowOpenState(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, [isElectron]);

  // Actions
  const refreshDisplays = useCallback(async () => {
    if (displayManagerRef.current) {
      setIsLoading(true);
      try {
        const newDisplays = await displayManagerRef.current.loadDisplays();
        setDisplays(newDisplays);
        setPrimaryDisplay(newDisplays.find(d => d.isPrimary) || newDisplays[0] || null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  const selectDisplay = useCallback(async (displayId: number | null) => {
    const display = displayId !== null ? displays.find(d => d.id === displayId) : null;
    setSelectedDisplay(display || null);

    if (settingsManagerRef.current) {
      await settingsManagerRef.current.updateSettings({
        displayId,
        displayIndex: display ? displays.indexOf(display) : 0
      });
    }

    // If player window is open, move it to the new display
    if (isElectron && playerWindowOpen && displayId !== null) {
      try {
        await (window as any).electronAPI.closePlayerWindow();
        await (window as any).electronAPI.createPlayerWindow(displayId);
      } catch (err) {
        console.error('Failed to move player window:', err);
      }
    }
  }, [displays, isElectron, playerWindowOpen]);

  const togglePlayerWindow = useCallback(async () => {
    if (settingsManagerRef.current) {
      const newShow = await settingsManagerRef.current.togglePlayerWindow();
      
      if (isElectron) {
        try {
          if (newShow) {
            await (window as any).electronAPI.createPlayerWindow(settings.displayId);
            setPlayerWindowOpenState(true);
          } else {
            await (window as any).electronAPI.closePlayerWindow();
            setPlayerWindowOpenState(false);
          }
        } catch (err) {
          console.error('Failed to toggle player window:', err);
        }
      }
    }
  }, [isElectron, settings.displayId]);

  const setPlayerWindowOpen = useCallback(async (open: boolean) => {
    if (settingsManagerRef.current) {
      await settingsManagerRef.current.updateSetting('showPlayer', open);
    }

    if (isElectron) {
      try {
        if (open) {
          await (window as any).electronAPI.createPlayerWindow(settings.displayId);
          setPlayerWindowOpenState(true);
        } else {
          await (window as any).electronAPI.closePlayerWindow();
          setPlayerWindowOpenState(false);
        }
      } catch (err) {
        console.error('Failed to set player window open state:', err);
      }
    }
  }, [isElectron, settings.displayId]);

  const setFullscreen = useCallback(async (fullscreen: boolean) => {
    if (settingsManagerRef.current) {
      await settingsManagerRef.current.updateSetting('fullscreen', fullscreen);
    }

    // TODO: Send fullscreen command to player window via IPC
    if (isElectron && playerWindowOpen) {
      try {
        await (window as any).electronAPI.controlPlayerWindow('setFullscreen', fullscreen);
      } catch (err) {
        console.error('Failed to set fullscreen:', err);
      }
    }
  }, [isElectron, playerWindowOpen]);

  const openPlayerOnDisplay = useCallback(async (displayId: number, fullscreen: boolean = false) => {
    // Update settings
    if (settingsManagerRef.current) {
      await settingsManagerRef.current.updateSettings({
        showPlayer: true,
        displayId,
        fullscreen
      });
    }

    // Open player window
    if (isElectron) {
      try {
        // Close existing window first
        if (playerWindowOpen) {
          await (window as any).electronAPI.closePlayerWindow();
        }
        
        // Create new window on specified display
        await (window as any).electronAPI.createPlayerWindow(displayId);
        setPlayerWindowOpenState(true);

        // Set fullscreen if requested
        if (fullscreen) {
          await (window as any).electronAPI.controlPlayerWindow('setFullscreen', true);
        }
      } catch (err) {
        console.error('Failed to open player on display:', err);
      }
    }
  }, [isElectron, playerWindowOpen]);

  return {
    // Display state
    displays,
    primaryDisplay,
    selectedDisplay,
    isLoading,
    error,

    // Player window state
    playerWindowOpen,
    settings,

    // Actions
    refreshDisplays,
    selectDisplay,
    togglePlayerWindow,
    setPlayerWindowOpen,
    setFullscreen,
    openPlayerOnDisplay
  };
}
