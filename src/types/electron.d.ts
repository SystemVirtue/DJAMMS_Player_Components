// types/electron.d.ts
import { Video } from './index';

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

interface QueueState {
  queue: Video[];
  priorityQueue: Video[];
  currentVideo: Video | null;
  nowPlaying: Video | null;
  queueIndex: number;
  isPlaying: boolean;
  nowPlayingSource: 'active' | 'priority' | null;
}

interface QueueCommand {
  action: 
    | 'clear_queue'
    | 'add_to_queue'
    | 'add_to_priority_queue'
    | 'shuffle_queue'
    | 'play_at_index'
    | 'next'
    | 'refresh_playlists'
    | 'move_queue_item'
    | 'remove_from_queue';
  payload?: {
    video?: Video;
    index?: number;
    fromIndex?: number;
    toIndex?: number;
    keepFirst?: boolean;
  };
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

declare global {
  interface Window {
    electronAPI: {
      // Core IPC
      send: (channel: string, data?: unknown) => void;
      on: (channel: string, callback: (data?: unknown) => void) => void;
      off: (channel: string, callback: (data?: unknown) => void) => void;
      
      // Playlist/File Operations
      getPlaylists: () => Promise<{ playlists: Record<string, Video[]>; playlistsDirectory: string; error?: string }>;
      getVideoMetadata: (filePath: string) => Promise<{ size: number; created: Date; modified: Date } | null>;
      selectDirectory: () => Promise<{ success: boolean; path?: string }>;
      selectPlaylistsDirectory: () => Promise<{ success: boolean; path?: string }>;
      getPlaylistsDirectory: () => Promise<string>;
      setPlaylistsDirectory: (path: string) => Promise<{ success: boolean }>;
      selectImageFile: () => Promise<{ success: boolean; path?: string }>;
      
      // Display Management
      getDisplays: () => Promise<DisplayInfoElectron[]>;
      createFullscreenWindow: (displayId?: number) => Promise<{ success: boolean; windowId?: number }>;
      closeFullscreenWindow: () => Promise<{ success: boolean }>;
      controlFullscreenPlayer: (action: string, data?: unknown) => Promise<{ success: boolean; error?: string }>;
      
      // Player Window Management
      createPlayerWindow: (displayId?: number) => Promise<{ success: boolean; windowId?: number }>;
      closePlayerWindow: () => Promise<{ success: boolean }>;
      togglePlayerWindow: () => Promise<{ success: boolean; isOpen: boolean }>;
      getPlayerWindowStatus: () => Promise<{ isOpen: boolean }>;
      controlPlayerWindow: (action: string, data?: unknown) => Promise<{ success: boolean; error?: string }>;
      movePlayerToDisplay: (displayId: number) => Promise<{ success: boolean }>;
      setPlayerFullscreen: (fullscreen: boolean) => Promise<{ success: boolean }>;
      refreshPlayerWindow: (displayId?: number) => Promise<{ success: boolean }>;
      onPlayerWindowClosed: (callback: () => void) => () => void;
      onPlayerWindowOpened: (callback: () => void) => () => void;
      
      // Player Settings (window positioning)
      sendPlayerSettings: (settings: PlayerSettingsElectron) => void;
      
      // Settings
      getSetting: <T = unknown>(key: string) => Promise<T>;
      setSetting: (key: string, value: unknown) => Promise<{ success: boolean }>;
      getAllSettings: () => Promise<Record<string, unknown>>;
      
      // Window Operations
      openAdminConsole: () => Promise<{ success: boolean }>;
      
      // Queue Management (IPC commands to main process orchestrator)
      sendQueueCommand: (command: QueueCommand) => void;
      onQueueState: (callback: (state: QueueState) => void) => () => void;
      getQueueState: () => Promise<QueueState>;
      
      // Playback State Sync
      sendPlaybackState: (state: PlaybackState) => void;
      onPlaybackStateSync: (callback: (state: PlaybackState) => void) => () => void;
      onVideoEnded: () => void;
      onRequestNextVideo: (callback: () => void) => () => void;
      
      // Menu/Keyboard Events
      onTogglePlayback: (callback: () => void) => () => void;
      onSkipVideo: (callback: () => void) => () => void;
      onDebugSkipToEnd: (callback: () => void) => () => void;
      onVolumeUp: (callback: () => void) => () => void;
      onVolumeDown: (callback: () => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onPlaylistsDirectoryChanged: (callback: (path: string) => void) => () => void;
      onFullscreenClosed: (callback: () => void) => () => void;
      
      // Fullscreen Player Control
      onControlPlayer: (callback: (action: string, data?: unknown) => void) => () => void;
      
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

export type { DisplayInfoElectron, PlayerSettingsElectron, QueueState, QueueCommand, PlaybackState };
