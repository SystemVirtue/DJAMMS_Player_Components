/**
 * useSupabase Hook - React hook for Supabase integration
 * 
 * This hook provides a React-friendly interface to the SupabaseService,
 * handling initialization, cleanup, and exposing state sync methods.
 * 
 * IMPORTANT: This hook complements the existing player functionality.
 * Local playback continues to use IPC; this adds remote sync capabilities.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSupabaseService } from '../services/SupabaseService';
import { 
  CommandType, 
  SupabaseCommand,
  VolumeCommandPayload,
  SeekCommandPayload,
  QueueAddCommandPayload,
  LoadPlaylistCommandPayload,
  QueueVideoItem
} from '../types/supabase';
import { Video } from '../types';

export interface UseSupabaseOptions {
  /** Player ID (defaults to electron-player-1) */
  playerId?: string;
  /** Whether to auto-initialize on mount */
  autoInit?: boolean;
  /** Callback when a play command is received (video and/or queueIndex for click-to-play) */
  onPlay?: (video?: QueueVideoItem, queueIndex?: number) => void;
  /** Callback when a pause command is received */
  onPause?: () => void;
  /** Callback when a resume command is received */
  onResume?: () => void;
  /** Callback when a skip command is received */
  onSkip?: () => void;
  /** Callback when a volume command is received */
  onSetVolume?: (volume: number) => void;
  /** Callback when a seek command is received */
  onSeekTo?: (position: number) => void;
  /** Callback when a queue add command is received */
  onQueueAdd?: (video: QueueVideoItem, queueType: 'active' | 'priority') => void;
  /** Callback when a queue shuffle command is received */
  onQueueShuffle?: () => void;
  /** Callback when a load playlist command is received */
  onLoadPlaylist?: (playlistName: string, shuffle?: boolean) => void;
  /** Callback when a queue move command is received */
  onQueueMove?: (fromIndex: number, toIndex: number) => void;
  /** Callback when a queue remove command is received */
  onQueueRemove?: (videoId: string, queueType: 'active' | 'priority') => void;
  /** Callback when a player window toggle command is received */
  onPlayerWindowToggle?: (show: boolean) => void;
  /** Callback when a fullscreen toggle command is received */
  onPlayerFullscreenToggle?: (fullscreen: boolean) => void;
  /** Callback when a player refresh command is received */
  onPlayerRefresh?: () => void;
  /** Callback when overlay settings update command is received */
  onOverlaySettingsUpdate?: (settings: Record<string, unknown>) => void;
  /** Callback when kiosk settings update command is received */
  onKioskSettingsUpdate?: (settings: Record<string, unknown>) => void;
}

export interface UseSupabaseReturn {
  /** Whether the service is initialized */
  isInitialized: boolean;
  /** Whether connected and online */
  isOnline: boolean;
  /** Initialize the Supabase service */
  initialize: () => Promise<boolean>;
  /** Shutdown the Supabase service */
  shutdown: () => Promise<void>;
  /** Sync current player state to Supabase (set immediate=true to bypass debounce) */
  syncState: (state: {
    status?: 'idle' | 'playing' | 'paused' | 'buffering' | 'error';
    isPlaying?: boolean;
    currentVideo?: Video | null;
    currentPosition?: number;
    volume?: number;
    activeQueue?: Video[];
    priorityQueue?: Video[];
    queueIndex?: number;
  }, immediate?: boolean) => void;
}

export function useSupabase(options: UseSupabaseOptions = {}): UseSupabaseReturn {
  const {
    playerId,
    autoInit = true,
    onPlay,
    onPause,
    onResume,
    onSkip,
    onSetVolume,
    onSeekTo,
    onQueueAdd,
    onQueueShuffle,
    onLoadPlaylist,
    onQueueMove,
    onQueueRemove,
    onPlayerWindowToggle,
    onPlayerFullscreenToggle,
    onPlayerRefresh,
    onOverlaySettingsUpdate,
    onKioskSettingsUpdate
  } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const serviceRef = useRef(getSupabaseService());
  const handlersRegisteredRef = useRef(false);
  
  // Store callbacks in refs to prevent effect re-runs when callbacks change
  const callbacksRef = useRef({
    onPlay,
    onPause,
    onResume,
    onSkip,
    onSetVolume,
    onSeekTo,
    onQueueAdd,
    onQueueShuffle,
    onLoadPlaylist,
    onQueueMove,
    onQueueRemove,
    onPlayerWindowToggle,
    onPlayerFullscreenToggle,
    onPlayerRefresh,
    onOverlaySettingsUpdate,
    onKioskSettingsUpdate
  });
  
  // Update callbacks ref when they change (but don't trigger effect)
  useEffect(() => {
    callbacksRef.current = {
      onPlay,
      onPause,
      onResume,
      onSkip,
      onSetVolume,
      onSeekTo,
      onQueueAdd,
      onQueueShuffle,
      onLoadPlaylist,
      onQueueMove,
      onQueueRemove,
      onPlayerWindowToggle,
      onPlayerFullscreenToggle,
      onPlayerRefresh,
      onOverlaySettingsUpdate,
      onKioskSettingsUpdate
    };
  }, [onPlay, onPause, onResume, onSkip, onSetVolume, onSeekTo, onQueueAdd, onQueueShuffle, onLoadPlaylist, onQueueMove, onQueueRemove, onPlayerWindowToggle, onPlayerFullscreenToggle, onPlayerRefresh, onOverlaySettingsUpdate, onKioskSettingsUpdate]);

  // Initialize the service
  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      // Reset handlers flag when re-initializing (playerId might have changed)
      handlersRegisteredRef.current = false;
      // Force re-init if player ID changed
      const currentPlayerId = serviceRef.current.getPlayerId();
      const forceReinit = currentPlayerId !== (playerId || '');
      const success = await serviceRef.current.initialize(playerId, forceReinit);
      setIsInitialized(success);
      setIsOnline(success);
      return success;
    } catch (error) {
      console.error('[useSupabase] Initialization error:', error);
      setIsInitialized(false);
      setIsOnline(false);
      return false;
    }
  }, [playerId]);

  // Shutdown the service
  const shutdown = useCallback(async (): Promise<void> => {
    await serviceRef.current.shutdown();
    setIsInitialized(false);
    setIsOnline(false);
  }, []);

  // Sync state to Supabase
  const syncState = useCallback((state: {
    status?: 'idle' | 'playing' | 'paused' | 'buffering' | 'error';
    isPlaying?: boolean;
    currentVideo?: Video | null;
    currentPosition?: number;
    volume?: number;
    activeQueue?: Video[];
    priorityQueue?: Video[];
  }, immediate: boolean = false) => {
    if (serviceRef.current.initialized) {
      serviceRef.current.syncPlayerState(state, immediate);
    }
  }, []);

  // Reset handlers flag when playerId changes
  useEffect(() => {
    handlersRegisteredRef.current = false;
  }, [playerId]);

  // Register command handlers
  // Only re-register when isInitialized or playerId changes, not when callbacks change
  useEffect(() => {
    if (!isInitialized) {
      console.log(`[useSupabase] ⚠️ Skipping handler registration - not initialized`);
      return;
    }

    // Only register once per initialization/playerId
    if (handlersRegisteredRef.current) {
      console.log(`[useSupabase] ⚠️ Handlers already registered, skipping`);
      return;
    }

    console.log(`[useSupabase] ✅ Registering command handlers for player: ${playerId}`);
    const service = serviceRef.current;
    const callbacks = callbacksRef.current;

    // Play command (supports both video object and queueIndex for click-to-play)
    if (callbacks.onPlay) {
      service.onCommand('play', (cmd) => {
        const payload = cmd.command_data as { video?: QueueVideoItem; queueIndex?: number };
        callbacks.onPlay?.(payload?.video, payload?.queueIndex);
      });
    }

    // Pause command
    if (callbacks.onPause) {
      service.onCommand('pause', () => callbacks.onPause?.());
    }

    // Resume command
    if (callbacks.onResume) {
      service.onCommand('resume', () => callbacks.onResume?.());
    }

    // Skip command
    if (callbacks.onSkip) {
      service.onCommand('skip', () => callbacks.onSkip?.());
    }

    // Volume command
    if (callbacks.onSetVolume) {
      service.onCommand('setVolume', (cmd) => {
        const payload = cmd.command_data as VolumeCommandPayload;
        callbacks.onSetVolume?.(payload.volume);
      });
    }

    // Seek command
    if (callbacks.onSeekTo) {
      service.onCommand('seekTo', (cmd) => {
        const payload = cmd.command_data as SeekCommandPayload;
        callbacks.onSeekTo?.(payload.position);
      });
    }

    // Queue add command
    if (callbacks.onQueueAdd) {
      console.log(`[useSupabase] ✅ Registering queue_add handler`);
      service.onCommand('queue_add', (cmd) => {
        console.log(`[useSupabase] 🎯 queue_add handler called with command:`, cmd.id, cmd.command_type);
        const payload = cmd.command_data as QueueAddCommandPayload;
        console.log(`[useSupabase] 🎯 queue_add payload:`, payload);
        callbacks.onQueueAdd?.(payload.video, payload.queueType);
      });
    } else {
      console.warn(`[useSupabase] ⚠️ onQueueAdd handler not provided - queue_add commands will not be processed`);
    }

    // Queue shuffle command
    if (callbacks.onQueueShuffle) {
      service.onCommand('queue_shuffle', () => callbacks.onQueueShuffle?.());
    }

    // Load playlist command
    if (callbacks.onLoadPlaylist) {
      service.onCommand('load_playlist', (cmd) => {
        const payload = cmd.command_data as LoadPlaylistCommandPayload;
        callbacks.onLoadPlaylist?.(payload.playlistName, payload.shuffle);
      });
    }

    // Queue move command
    if (callbacks.onQueueMove) {
      service.onCommand('queue_move', (cmd) => {
        const payload = cmd.command_data as { fromIndex: number; toIndex: number };
        callbacks.onQueueMove?.(payload.fromIndex, payload.toIndex);
      });
    }

    // Queue remove command
    if (callbacks.onQueueRemove) {
      service.onCommand('queue_remove', (cmd) => {
        const payload = cmd.command_data as { videoId: string; queueType: 'active' | 'priority' };
        callbacks.onQueueRemove?.(payload.videoId, payload.queueType);
      });
    }

    // Player window toggle command
    if (callbacks.onPlayerWindowToggle) {
      service.onCommand('player_window_toggle', (cmd) => {
        const payload = cmd.command_data as { show: boolean };
        callbacks.onPlayerWindowToggle?.(payload.show);
      });
    }

    // Player fullscreen toggle command
    if (callbacks.onPlayerFullscreenToggle) {
      service.onCommand('player_fullscreen_toggle', (cmd) => {
        const payload = cmd.command_data as { fullscreen: boolean };
        callbacks.onPlayerFullscreenToggle?.(payload.fullscreen);
      });
    }

    // Player refresh command
    if (callbacks.onPlayerRefresh) {
      service.onCommand('player_refresh', () => callbacks.onPlayerRefresh?.());
    }

    // Overlay settings update command
    if (callbacks.onOverlaySettingsUpdate) {
      service.onCommand('overlay_settings_update', (cmd) => {
        const payload = cmd.command_data as { settings: Record<string, unknown> };
        callbacks.onOverlaySettingsUpdate?.(payload.settings);
      });
    }

    // Kiosk settings update command
    if (callbacks.onKioskSettingsUpdate) {
      service.onCommand('kiosk_settings_update', (cmd) => {
        const payload = cmd.command_data as { settings: Record<string, unknown> };
        callbacks.onKioskSettingsUpdate?.(payload.settings);
      });
    }

    handlersRegisteredRef.current = true;
    console.log(`[useSupabase] ✅ All command handlers registered`);
  }, [isInitialized, playerId]); // Only depend on isInitialized and playerId

  // Subscribe to connection status changes
  useEffect(() => {
    if (!isInitialized) return;
    
    const unsubscribe = serviceRef.current.onConnectionStatusChange((status) => {
      setIsOnline(status === 'connected');
    });
    
    return () => {
      unsubscribe();
    };
  }, [isInitialized]);

  // Auto-initialize on mount
  const hasInitializedRef = useRef(false);
  const lastAutoInitRef = useRef(false);
  useEffect(() => {
    // Only initialize when autoInit changes from false to true
    if (autoInit && !lastAutoInitRef.current && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      lastAutoInitRef.current = true;
      initialize();
    } else if (!autoInit) {
      // Reset when autoInit becomes false
      lastAutoInitRef.current = false;
      hasInitializedRef.current = false;
    }

    // Cleanup on unmount
    return () => {
      // Note: We don't fully shutdown here as the service is a singleton
      // and may be used by other components. The main app handles final shutdown.
    };
  }, [autoInit]); // Only depend on autoInit, not initialize

  return {
    isInitialized,
    isOnline,
    initialize,
    shutdown,
    syncState
  };
}

export default useSupabase;
