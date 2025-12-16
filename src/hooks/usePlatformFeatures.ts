import { useMemo } from 'react';

export interface PlatformFeatures {
  // Core features (available everywhere)
  canUseRealtimeSync: boolean;

  // Electron-only features
  canUseLocalFiles: boolean;
  canAccessSystemMenus: boolean;
  canCreateMultipleWindows: boolean;
  canUseFullscreenOnDisplays: boolean;

  // Web-only features
  canUseServiceWorkers: boolean;
  canInstallAsPWA: boolean;
  requiresPlayerIdSelection: boolean;

  // UI adaptation flags
  showLocalFileBrowser: boolean;
  showPlayerIdSelector: boolean;
  showSystemSettings: boolean;
  showConnectionStatus: boolean;
}

export const usePlatformFeatures = (): PlatformFeatures => {
  return useMemo(() => {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    const isWeb = !isElectron;

    return {
      // Core features
      canUseRealtimeSync: true,

      // Electron features
      canUseLocalFiles: isElectron,
      canAccessSystemMenus: isElectron,
      canCreateMultipleWindows: isElectron,
      canUseFullscreenOnDisplays: isElectron,

      // Web features
      canUseServiceWorkers: isWeb && 'serviceWorker' in navigator,
      canInstallAsPWA: isWeb,
      requiresPlayerIdSelection: isWeb,

      // UI flags
      showLocalFileBrowser: isElectron,
      showPlayerIdSelector: isWeb,
      showSystemSettings: isElectron,
      showConnectionStatus: isWeb,
    };
  }, []);
};