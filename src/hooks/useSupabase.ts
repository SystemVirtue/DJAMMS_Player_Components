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
  /** Callback when a play command is received */
  onPlay?: (video?: QueueVideoItem) => void;
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
    onLoadPlaylist
  } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const serviceRef = useRef(getSupabaseService());
  const handlersRegisteredRef = useRef(false);

  // Initialize the service
  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      const success = await serviceRef.current.initialize(playerId);
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

  // Register command handlers
  useEffect(() => {
    if (!isInitialized || handlersRegisteredRef.current) return;

    const service = serviceRef.current;

    // Play command
    if (onPlay) {
      service.onCommand('play', (cmd) => {
        const payload = cmd.command_data as { video?: QueueVideoItem };
        onPlay(payload?.video);
      });
    }

    // Pause command
    if (onPause) {
      service.onCommand('pause', () => onPause());
    }

    // Resume command
    if (onResume) {
      service.onCommand('resume', () => onResume());
    }

    // Skip command
    if (onSkip) {
      service.onCommand('skip', () => onSkip());
    }

    // Volume command
    if (onSetVolume) {
      service.onCommand('setVolume', (cmd) => {
        const payload = cmd.command_data as VolumeCommandPayload;
        onSetVolume(payload.volume);
      });
    }

    // Seek command
    if (onSeekTo) {
      service.onCommand('seekTo', (cmd) => {
        const payload = cmd.command_data as SeekCommandPayload;
        onSeekTo(payload.position);
      });
    }

    // Queue add command
    if (onQueueAdd) {
      service.onCommand('queue_add', (cmd) => {
        const payload = cmd.command_data as QueueAddCommandPayload;
        onQueueAdd(payload.video, payload.queueType);
      });
    }

    // Queue shuffle command
    if (onQueueShuffle) {
      service.onCommand('queue_shuffle', () => onQueueShuffle());
    }

    // Load playlist command
    if (onLoadPlaylist) {
      service.onCommand('load_playlist', (cmd) => {
        const payload = cmd.command_data as LoadPlaylistCommandPayload;
        onLoadPlaylist(payload.playlistName, payload.shuffle);
      });
    }

    handlersRegisteredRef.current = true;
  }, [isInitialized, onPlay, onPause, onResume, onSkip, onSetVolume, onSeekTo, onQueueAdd, onQueueShuffle, onLoadPlaylist]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInit) {
      initialize();
    }

    // Cleanup on unmount
    return () => {
      // Note: We don't fully shutdown here as the service is a singleton
      // and may be used by other components. The main app handles final shutdown.
    };
  }, [autoInit, initialize]);

  return {
    isInitialized,
    isOnline,
    initialize,
    shutdown,
    syncState
  };
}

export default useSupabase;
