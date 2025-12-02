// types/electron.d.ts

interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DisplayInfoElectron {
  id: number;
  label: string;
  name: string;
  width: number;
  height: number;
  bounds: DisplayBounds;
  workArea: DisplayBounds;
  scaleFactor: number;
  isPrimary: boolean;
}

interface PlayerSettingsElectron {
  showPlayer: boolean;
  displayId: number | null;
  displayIndex: number;
  fullscreen: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      // Core IPC
      send: (channel: string, data?: any) => void;
      on: (channel: string, callback: (data?: any) => void) => void;
      off: (channel: string, callback: (data?: any) => void) => void;
      
      // Playlist/File Operations
      getPlaylists: () => Promise<{ playlists: Record<string, string[]>; playlistsDirectory: string; error?: string }>;
      getVideoMetadata: (filePath: string) => Promise<{ size: number; created: Date; modified: Date } | null>;
      selectDirectory: () => Promise<{ success: boolean; path?: string }>;
      
      // Display Management
      getDisplays: () => Promise<DisplayInfoElectron[]>;
      createFullscreenWindow: (displayId?: number) => Promise<{ success: boolean; windowId?: number }>;
      closeFullscreenWindow: () => Promise<{ success: boolean }>;
      controlFullscreenPlayer: (action: string, data?: any) => Promise<{ success: boolean; error?: string }>;
      
      // Player Window Management
      createPlayerWindow: (displayId?: number) => Promise<{ success: boolean; windowId?: number }>;
      closePlayerWindow: () => Promise<{ success: boolean }>;
      togglePlayerWindow: () => Promise<{ success: boolean; isOpen: boolean }>;
      getPlayerWindowStatus: () => Promise<{ isOpen: boolean }>;
      controlPlayerWindow: (action: string, data?: any) => Promise<{ success: boolean; error?: string }>;
      onPlayerWindowClosed: (callback: () => void) => () => void;
      
      // Player Settings (window positioning)
      sendPlayerSettings: (settings: PlayerSettingsElectron) => void;
      
      // Settings
      getSetting: (key: string) => Promise<any>;
      setSetting: (key: string, value: any) => Promise<{ success: boolean }>;
      getAllSettings: () => Promise<Record<string, any>>;
      
      // Window Operations
      openAdminConsole: () => Promise<{ success: boolean }>;
      
      // Playback State Sync
      sendPlaybackState: (state: any) => void;
      onPlaybackStateSync: (callback: (state: any) => void) => () => void;
      onVideoEnded: () => void;
      onRequestNextVideo: (callback: () => void) => () => void;
      
      // Menu/Keyboard Events
      onTogglePlayback: (callback: () => void) => () => void;
      onSkipVideo: (callback: () => void) => () => void;
      onVolumeUp: (callback: () => void) => () => void;
      onVolumeDown: (callback: () => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onPlaylistsDirectoryChanged: (callback: (path: string) => void) => () => void;
      onFullscreenClosed: (callback: () => void) => () => void;
      
      // Fullscreen Player Control
      onControlPlayer: (callback: (action: string, data?: any) => void) => () => void;
      
      // Search
      getRecentSearches: () => Promise<string[]>;
      addRecentSearch: (query: string) => Promise<string[]>;
      clearRecentSearches: () => Promise<string[]>;
      
      // Platform info
      platform: string;
      isElectron: boolean;
    };
  }
}

export {};