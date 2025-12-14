// web/admin/src/App.tsx
// DJAMMS Web Admin Console - Exact Clone of Electron Admin UI
// Uses Supabase for state sync instead of Electron IPC

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  supabase, 
  subscribeToPlayerState, 
  subscribeToLocalVideos,
  getPlayerState, 
  getAllLocalVideos, 
  insertCommand, 
  searchLocalVideos, 
  blockingCommands, 
  onConnectionChange,
  isConnected as getConnectionStatus,
  localVideoToQueueItem
} from '@shared/supabase-client';
import type { CommandResult } from '@shared/supabase-client';
import type { 
  SupabasePlayerState, 
  SupabaseLocalVideo, 
  NowPlayingVideo, 
  QueueVideoItem,
  CommandType 
} from '@shared/types';
import { ConnectPlayerModal, usePlayer, PlayerIdBadge } from '@shared/ConnectPlayerModal';
import { cleanVideoTitle } from '@shared/video-utils';
import { shuffleArray } from '@shared/array-utils';
import { initializePingHandler, cleanupPingHandler } from '@shared/ping-handler';
import { getThumbnailsPath, setThumbnailsPath, getSettings } from '@shared/settings';

// Helper to strip YouTube Playlist ID prefix from folder name
// Handles both underscore and dot separators: PLxxxxxx_Name or PLxxxxxx.Name
const getPlaylistDisplayName = (folderName: string): string => {
  const match = folderName.match(/^PL[A-Za-z0-9_-]+[._](.+)$/);
  return match ? match[1] : folderName;
};

// Helper to get display artist (handles 'Unknown' case)
const getDisplayArtist = (artist: string | null | undefined): string => {
  if (!artist || artist === 'Unknown' || artist.toLowerCase() === 'unknown artist') {
    return '';
  }
  return artist;
};

// Helper to extract playlist from SupabaseLocalVideo (stored in metadata)
const getVideoPlaylist = (video: SupabaseLocalVideo): string => {
  const metadata = video.metadata as any;
  return metadata?.playlist || '';
};

// Helper to extract playlist name from file path
// Path format: /path/to/PLAYLISTS/PLxxxxxx.PlaylistName/video.mp4
const extractPlaylistFromPath = (path: string): string => {
  if (!path) return '';
  // Match playlist folder name (PLxxxxxx.PlaylistName or PLxxxxxx_PlaylistName)
  const match = path.match(/PLAYLISTS[\/\\]([^\/\\]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return '';
};

type TabId = 'queue' | 'search' | 'settings' | 'tools';

// Navigation items configuration
const navItems: { id: TabId; icon: string; label: string }[] = [
  { id: 'queue', icon: 'queue_music', label: 'Queue' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'tools', icon: 'build', label: 'Tools' },
];

// Popover component for Add to Priority Queue
interface VideoPopoverProps {
  video: SupabaseLocalVideo;
  position: { x: number; y: number };
  onAddToPriorityQueue: () => void;
  onCancel: () => void;
}

const VideoPopover: React.FC<VideoPopoverProps> = ({ video, position, onAddToPriorityQueue, onCancel }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  // Adjust position to stay within viewport
  const adjustedPosition = useMemo(() => {
    const popoverWidth = 300;
    const popoverHeight = 150;
    const padding = 16;
    let x = position.x;
    let y = position.y;
    
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (y + popoverHeight > window.innerHeight - padding) {
      y = window.innerHeight - popoverHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    
    return { x, y };
  }, [position]);

  const artistDisplay = getDisplayArtist(video.artist);

  return (
    <div
      ref={popoverRef}
      className="video-popover"
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
        background: '#282828',
        border: '1px solid #3f3f3f',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        minWidth: '280px',
        maxWidth: '360px'
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 600, 
          color: '#fff',
          marginBottom: '4px',
          wordBreak: 'break-word'
        }}>
          {artistDisplay ? `${artistDisplay} - ${cleanVideoTitle(video.title)}` : cleanVideoTitle(video.title)}
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#aaa',
          marginTop: '8px'
        }}>
          Add to Priority Queue?
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          className="popover-btn popover-btn-cancel"
        >
          Cancel
        </button>
        <button
          onClick={onAddToPriorityQueue}
          className="popover-btn popover-btn-primary"
        >
          Add Video
        </button>
      </div>
    </div>
  );
};

// Main App wrapped with ConnectPlayerModal for player ID authentication
export default function App() {
  return (
    <ConnectPlayerModal title="DJAMMS Admin Console">
      <AdminApp />
    </ConnectPlayerModal>
  );
}

function AdminApp() {
  // Get playerId from context (provided by ConnectPlayerModal)
  const { playerId, disconnect } = usePlayer();

  // Player state (synced from Supabase)
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [currentVideo, setCurrentVideo] = useState<NowPlayingVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [playbackTime, setPlaybackTime] = useState(0); // Current playback position in seconds
  const [playbackDuration, setPlaybackDuration] = useState(0); // Total duration in seconds
  const playbackTimeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null); // For debouncing playback time updates
  const lastPlaybackTimeRef = useRef(0); // Track last applied playback time to detect jumps
  const overlaySettingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // For debouncing overlay settings updates

  // Queue state (from Supabase player_state)
  const [activeQueue, setActiveQueue] = useState<QueueVideoItem[]>([]);
  const [priorityQueue, setPriorityQueue] = useState<QueueVideoItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  // Playlist state
  const [playlists, setPlaylists] = useState<Record<string, SupabaseLocalVideo[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string>('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);

  // Search/Browse state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchSort, setSearchSort] = useState('relevance');
  const [searchResults, setSearchResults] = useState<SupabaseLocalVideo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLimit, setSearchLimit] = useState(100);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [allVideos, setAllVideos] = useState<SupabaseLocalVideo[]>();

  // UI state
  const [currentTab, setCurrentTab] = useState<TabId>('queue');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [playlistToLoad, setPlaylistToLoad] = useState<string | null>(null);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showSkipConfirmDialog, setShowSkipConfirmDialog] = useState(false);
  const [showQueuePlayDialog, setShowQueuePlayDialog] = useState(false);
  // Track if current video is from priority queue (for skip confirmation)
  const [isFromPriorityQueue, setIsFromPriorityQueue] = useState(false);
  const prevPriorityQueueRef = useRef<QueueVideoItem[]>([]);
  const [queueVideoToPlay, setQueueVideoToPlay] = useState<{ video: QueueVideoItem; index: number } | null>(null);

  // Priority Queue Popover state
  const [popoverVideo, setPopoverVideo] = useState<SupabaseLocalVideo | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Blocking command state - prevents multiple simultaneous commands
  const [isCommandPending, setIsCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  // Settings (local-only for web, commands sent to player)
  const [settings, setSettings] = useState({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0,
    forceAutoPlay: false, // Force auto-play, disables pause button
    playerFullscreen: false, // Player window fullscreen mode
  });

  // Player overlay settings (synced to Electron via command)
  const [overlaySettings, setOverlaySettings] = useState({
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
    watermarkSize: 100,
    watermarkX: 90,
    watermarkY: 10,
    watermarkOpacity: 80
  });

  // Kiosk settings state
  const [kioskSettings, setKioskSettings] = useState({
    mode: 'freeplay' as 'freeplay' | 'credits',
    uiMode: 'jukebox' as 'classic' | 'jukebox',
    creditBalance: 0,
    searchAllMusic: true
  });

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1000) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load all settings from Electron store on startup
  useEffect(() => {
    const loadAllSettings = async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        try {
          // Load player settings
          const savedSettings = await (window as any).electronAPI.getSetting('playerSettings');
          if (savedSettings) {
            setSettings(prev => ({ ...prev, ...savedSettings }));
          }
          
          // Load overlay settings
          const savedOverlaySettings = await (window as any).electronAPI.getSetting('overlaySettings');
          if (savedOverlaySettings) {
            setOverlaySettings(prev => ({ ...prev, ...savedOverlaySettings }));
          }
          
          // Load kiosk settings
          const savedKioskSettings = await (window as any).electronAPI.getSetting('kioskSettings');
          if (savedKioskSettings) {
            setKioskSettings(prev => ({ ...prev, ...savedKioskSettings }));
          }
          
          console.log('[WebAdmin] Loaded all settings from Electron store');
        } catch (error) {
          console.error('[WebAdmin] Error loading settings:', error);
        }
      }
    };
    
    loadAllSettings();
  }, []);

  // Subscribe to Supabase player_state updates
  useEffect(() => {
    // Helper to apply state
    const applyState = (state: SupabasePlayerState) => {
      const prevQueueLength = activeQueue.length;
      const prevPriorityLength = priorityQueue.length;
      const prevQueueIndex = queueIndex;
      
      console.log('[WebAdmin] Received player state update:', {
        now_playing: state.now_playing_video?.title,
        is_playing: state.is_playing,
        queue_length: state.active_queue?.length || 0,
        queue_index: state.queue_index,
        priority_length: state.priority_queue?.length || 0,
        queue_changed: prevQueueLength !== (state.active_queue?.length || 0) || prevQueueIndex !== (state.queue_index ?? 0),
        priority_changed: prevPriorityLength !== (state.priority_queue?.length || 0)
      });
      setPlayerState(state);
      
      // Update local state from Supabase
      // Note: Electron writes 'now_playing_video', not 'now_playing'
      console.log('[WebAdmin] applyState - now_playing_video:', state.now_playing_video ? {title: state.now_playing_video.title, id: state.now_playing_video.id} : 'null/undefined');
      if (state.now_playing_video) {
        console.log('[WebAdmin] Setting currentVideo:', state.now_playing_video.title);
        setCurrentVideo(state.now_playing_video);
      } else if (state.now_playing_video === null) {
        // Only clear if explicitly null (not undefined - undefined means field wasn't provided)
        console.log('[WebAdmin] Clearing currentVideo (now_playing_video is null)');
        setCurrentVideo(null);
      }
      if (typeof state.is_playing === 'boolean') {
        setIsPlaying(state.is_playing);
      }
      console.log('[WebAdmin] applyState - active_queue:', state.active_queue ? `array with ${state.active_queue.length} items` : state.active_queue === null ? 'null' : 'undefined');
      if (state.active_queue && Array.isArray(state.active_queue)) {
        console.log('[WebAdmin] Setting active queue:', state.active_queue.length, 'items');
        setActiveQueue(state.active_queue);
      } else if (state.active_queue === null) {
        // Only clear if explicitly null (not undefined - undefined means field wasn't provided)
        console.log('[WebAdmin] Clearing active queue (active_queue is null)');
        setActiveQueue([]);
      } else if (state.active_queue === undefined) {
        // CRITICAL FIX: When active_queue is undefined, it means the update didn't include it
        // This is a BUG - active_queue should ALWAYS be included in updates
        // Don't modify the queue - just log a warning (preserve existing display state)
        console.warn('[WebAdmin] ⚠️ WARNING: active_queue is undefined in update - this should not happen!');
        console.warn('[WebAdmin] Update data:', {
          hasNowPlaying: !!state.now_playing_video,
          nowPlayingTitle: state.now_playing_video?.title,
          queueIndex: state.queue_index,
          isPlaying: state.is_playing,
          hasPriorityQueue: !!state.priority_queue
        });
        // Preserve existing queue display - don't fetch or modify (WEBADMIN is display-only)
        // The player will send a proper update with active_queue included
      } else {
        console.warn('[WebAdmin] active_queue is not an array:', state.active_queue, 'type:', typeof state.active_queue);
        setActiveQueue([]);
      }
      if (state.priority_queue) {
        // Track if the current video came from priority queue
        // If priority queue had items and now has fewer, and current video matches what was first
        const prevPriority = prevPriorityQueueRef.current;
        const newPriority = state.priority_queue;
        
        if (prevPriority.length > 0 && newPriority.length < prevPriority.length) {
          // Priority queue shrank - a video was consumed from it
          const consumedVideo = prevPriority[0];
          if (state.now_playing_video && consumedVideo && 
              state.now_playing_video.id === consumedVideo.id) {
            setIsFromPriorityQueue(true);
          }
        } else if (newPriority.length === 0 && prevPriority.length === 0) {
          // Priority queue was empty and still is - video is not from priority
          if (state.now_playing_video) {
            setIsFromPriorityQueue(false);
          }
        }
        
        prevPriorityQueueRef.current = newPriority;
        setPriorityQueue(newPriority);
      }
      if (typeof state.queue_index === 'number') {
        setQueueIndex(state.queue_index);
      }
      if (typeof state.volume === 'number') {
        setVolume(Math.round(state.volume * 100));
      }
      // Update playback progress - use current_position (what SupabaseService writes)
      // Also check playback_position as fallback for backwards compatibility
      const position = state.current_position ?? state.playback_position;
      if (typeof position === 'number' && !isNaN(position)) {
        const lastTime = lastPlaybackTimeRef.current;
        const timeDiff = Math.abs(position - lastTime);
        
        // Clear any pending update
        if (playbackTimeUpdateRef.current) {
          clearTimeout(playbackTimeUpdateRef.current);
          playbackTimeUpdateRef.current = null;
        }
        
        // If change is very small (< 0.1s), debounce to prevent rapid micro-updates
        // If change is large (> 2s), update immediately (likely a seek or new video)
        // Otherwise, debounce small changes to smooth out the timeline
        if (timeDiff < 0.1 && timeDiff > 0) {
          // Very small change - debounce to prevent jitter
          playbackTimeUpdateRef.current = setTimeout(() => {
            setPlaybackTime(position);
            lastPlaybackTimeRef.current = position;
            playbackTimeUpdateRef.current = null;
          }, 300);
        } else if (timeDiff >= 2) {
          // Large change (seek or new video) - update immediately
          setPlaybackTime(position);
          lastPlaybackTimeRef.current = position;
        } else {
          // Moderate change - update with slight debounce to smooth transitions
          playbackTimeUpdateRef.current = setTimeout(() => {
            setPlaybackTime(position);
            lastPlaybackTimeRef.current = position;
            playbackTimeUpdateRef.current = null;
          }, 100);
        }
      }
      if (typeof state.video_duration === 'number') {
        setPlaybackDuration(state.video_duration);
      }
    };

    // Fetch initial state on mount (realtime subscription only fires on CHANGES)
    const loadInitialState = async () => {
      try {
        console.log('[WebAdmin] Fetching initial player state for:', playerId);
        const state = await getPlayerState(playerId);
        if (state) {
          console.log('[WebAdmin] Initial state received:', {
            has_active_queue: !!state.active_queue,
            active_queue_length: state.active_queue?.length || 0,
            active_queue_type: Array.isArray(state.active_queue) ? 'array' : typeof state.active_queue,
            has_priority_queue: !!state.priority_queue,
            priority_queue_length: state.priority_queue?.length || 0,
            has_now_playing: !!state.now_playing_video,
            now_playing_title: state.now_playing_video?.title,
            now_playing_id: state.now_playing_video?.id
          });
          applyState(state);
        } else {
          // Player state not found - this is normal if player hasn't initialized yet
          // Don't show as error, just log for debugging
          console.log('[WebAdmin] Player state not found yet. Waiting for player to initialize...');
        }
      } catch (error) {
        console.error('[WebAdmin] Error loading initial state:', error);
      }
    };
    loadInitialState();

    // Then subscribe to real-time changes
    console.log('[WebAdmin] Setting up realtime subscription for player:', playerId);
    const channel = subscribeToPlayerState(playerId, (state) => {
      // #region agent log
      const logData = {
        hasState: !!state,
        hasActiveQueue: !!state?.active_queue,
        activeQueueLength: state?.active_queue?.length,
        activeQueueType: Array.isArray(state?.active_queue) ? 'array' : typeof state?.active_queue,
        hasNowPlaying: !!state?.now_playing_video,
        nowPlayingTitle: state?.now_playing_video?.title,
        nowPlayingId: state?.now_playing_video?.id,
        queueIndex: state?.queue_index,
        priorityQueueLength: state?.priority_queue?.length,
        timestamp: new Date().toISOString()
      };
      // Log to console for debugging
      console.log('[WebAdmin] Realtime subscription callback fired with state:', logData);
      
      // Also log to debug endpoint if available (for monitoring)
      if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
        (window as any).electronAPI.writeDebugLog({
          location: 'App.tsx:446',
          message: 'Realtime update received',
          data: logData,
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'F'
        }).catch(() => {});
      }
      // #endregion
      applyState(state);
    });

    // unsubscribe() returns a Promise but cleanup must be sync - ignore return value
    return () => { 
      channel.unsubscribe();
      // Clean up any pending playback time updates
      if (playbackTimeUpdateRef.current) {
        clearTimeout(playbackTimeUpdateRef.current);
        playbackTimeUpdateRef.current = null;
      }
    };
  }, [playerId]);

  // Debug: Log current state values whenever they change
  useEffect(() => {
    console.log('[WebAdmin] State values updated:', {
      currentVideo: currentVideo ? { title: currentVideo.title, id: currentVideo.id } : null,
      activeQueueLength: activeQueue.length,
      priorityQueueLength: priorityQueue.length,
      queueIndex,
      isPlaying,
      playerState: playerState ? 'exists' : 'null'
    });
  }, [currentVideo, activeQueue.length, priorityQueue.length, queueIndex, isPlaying, playerState]);

  // Monitor Supabase Realtime connection status
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      console.log(`[WebAdmin] Supabase Realtime ${connected ? '✅ connected' : '❌ disconnected'}`);
      setIsConnected(connected);
    });
    return unsubscribe;
  }, []);

  // Initialize ping handler
  useEffect(() => {
    if (playerId) {
      initializePingHandler(playerId, 'web-admin');
    }
    return () => {
      cleanupPingHandler();
    };
  }, [playerId]);

  // Force auto-play logic (when enabled)
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSkippingRef = useRef(false);
  const currentVideoRef = useRef<NowPlayingVideo | null>(null);
  const isPlayingRef = useRef(false);
  const forceAutoPlayRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    currentVideoRef.current = currentVideo;
    isPlayingRef.current = isPlaying;
    forceAutoPlayRef.current = settings.forceAutoPlay;
  }, [currentVideo, isPlaying, settings.forceAutoPlay]);

  useEffect(() => {
    // Track if we're currently skipping
    isSkippingRef.current = isCommandPending;
  }, [isCommandPending]);

  useEffect(() => {
    if (!settings.forceAutoPlay) {
      // Clear any pending auto-play timer
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }

    // Clear previous timer
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    // If we're skipping or a command is pending, don't auto-play
    if (isSkippingRef.current || isCommandPending) {
      return;
    }

    // Case 1: No video loaded for >2 seconds - skip to next
    if (!currentVideo) {
      autoPlayTimerRef.current = setTimeout(async () => {
        // Use refs to check current state (avoid closure issues)
        if (!currentVideoRef.current && !isSkippingRef.current && !isCommandPending && forceAutoPlayRef.current) {
          console.log('[WebAdmin] Auto-play: No video loaded, skipping to next');
          await blockingCommands.skip(playerId);
        }
      }, 2000);
      return;
    }

    // Case 2: Video is paused for >2 seconds - force play
    if (!isPlaying && currentVideo) {
      autoPlayTimerRef.current = setTimeout(async () => {
        // Use refs to check current state (avoid closure issues)
        if (!isPlayingRef.current && currentVideoRef.current && !isSkippingRef.current && !isCommandPending && forceAutoPlayRef.current) {
          console.log('[WebAdmin] Auto-play: Video paused for >2s, forcing play');
          await blockingCommands.resume(playerId);
        }
      }, 2000);
      return;
    }

    // Case 3: Video is playing - clear any pending timers
    if (isPlaying && currentVideo) {
      // Video is playing, no action needed
      return;
    }
  }, [settings.forceAutoPlay, isPlaying, currentVideo, isCommandPending, playerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, []);

  // Load all videos from local_videos table for Browse/Search
  // Also subscribe to changes so we auto-refresh when Electron re-indexes playlists
  useEffect(() => {
    const loadAllVideos = async () => {
      try {
        console.log('[WebAdmin] Loading all videos for player:', playerId);
        // Fetch all videos without limit (pass null to remove 1000 video restriction)
        const videos = await getAllLocalVideos(playerId, null);
        console.log('[WebAdmin] Loaded', videos.length, 'videos');
        setAllVideos(videos);
        
        // Group videos by playlist (playlist is stored in metadata)
        const grouped: Record<string, SupabaseLocalVideo[]> = {};
        videos.forEach(video => {
          // playlist is in metadata.playlist, not video.playlist
          const metadata = video.metadata as any;
          let playlist = metadata?.playlist;
          
          // Fallback: Extract playlist from path if metadata.playlist is missing
          const videoPath = (video as any).file_path || (video as any).path || '';
          if (!playlist && videoPath) {
            // Match playlist folder name (PLxxxxxx.PlaylistName or PLxxxxxx_PlaylistName)
            const match = videoPath.match(/PLAYLISTS\/([^/]+)\//);
            if (match) {
              playlist = match[1];
            }
          }
          
          // Final fallback
          playlist = playlist || 'Unknown';
          
          if (!grouped[playlist]) grouped[playlist] = [];
          grouped[playlist].push(video);
        });
        console.log('[WebAdmin] Grouped into', Object.keys(grouped).length, 'playlists:', Object.keys(grouped));
        console.log('[WebAdmin] Playlist names:', Object.keys(grouped));
        setPlaylists(grouped);
      } catch (error) {
        console.error('[WebAdmin] Failed to load videos:', error);
      }
    };
    loadAllVideos();
    
    // Subscribe to local_videos changes - debounce to avoid multiple rapid refreshes
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const channel = subscribeToLocalVideos(playerId, () => {
      // Debounce refresh since multiple changes may come in rapid succession
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        console.log('[WebAdmin] Refreshing playlists due to local_videos change');
        loadAllVideos();
      }, 1000);
    });
    
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      channel.unsubscribe();
    };
  }, [playerId]);

  // Cleanup overlay settings debounce on unmount
  useEffect(() => {
    return () => {
      if (overlaySettingsDebounceRef.current) {
        clearTimeout(overlaySettingsDebounceRef.current);
      }
    };
  }, []);

  // Search videos when query changes, or show all videos when empty
  useEffect(() => {
    const performSearch = async () => {
      setSearchLoading(true);
      try {
        if (!searchQuery.trim()) {
          // When no query, show all videos (browse mode)
          if (allVideos && allVideos.length > 0) {
            setSearchResults(allVideos);
            setSearchTotalCount(allVideos.length);
          } else {
            // Fetch all videos if not loaded yet (pass null to remove limit)
            const videos = await getAllLocalVideos(playerId, null);
            setSearchResults(videos);
            setSearchTotalCount(videos.length);
          }
        } else {
          // Search mode
          const results = await searchLocalVideos(searchQuery, playerId, searchLimit);
          setSearchResults(results);
          // If we got exactly searchLimit results, there may be more
          setSearchTotalCount(results.length >= searchLimit ? results.length + 1 : results.length);
        }
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
        setSearchTotalCount(0);
      } finally {
        setSearchLoading(false);
      }
    };
    
    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, searchLimit, allVideos, playerId]);

  // Send command to player via Supabase (fire-and-forget for non-critical)
  const sendCommand = useCallback(async (type: CommandType, payload?: any) => {
    try {
      await insertCommand(type, payload, 'web-admin', playerId);
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  }, [playerId]);

  // Debug keyboard shortcut: Shift+\ (|) to seek to (duration - 15 seconds)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Check for Shift+\ (which produces '|' on most keyboards)
      // Key code is 'Backslash' and shift key is pressed, or key is '|'
      if (e.key === '|' || (e.key === '\\' && e.shiftKey) || (e.code === 'Backslash' && e.shiftKey)) {
        e.preventDefault();
        if (playbackDuration > 0) {
          const seekPosition = Math.max(0, playbackDuration - 15);
          console.log(`[WebAdmin] 🐛 DEBUG: Shift+\\ pressed - seeking to ${seekPosition.toFixed(1)}s (duration: ${playbackDuration.toFixed(1)}s)`);
          sendCommand('seekTo', { position: seekPosition });
        } else {
          console.warn('[WebAdmin] 🐛 DEBUG: Shift+\\ pressed but video duration not available yet');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playbackDuration, sendCommand]);

  // Send overlay settings to Electron when they change (debounced to prevent excessive commands)
  // Also saves to Electron store for persistence
  const updateOverlaySetting = useCallback((key: string, value: number | boolean) => {
    setOverlaySettings(prev => {
      const updated = { ...prev, [key]: value };
      
      // Save to Electron store immediately
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        (window as any).electronAPI.setSetting('overlaySettings', updated).catch((err: any) => {
          console.error('[WebAdmin] Failed to save overlay settings:', err);
        });
      }
      
      // Clear existing debounce timer
      if (overlaySettingsDebounceRef.current) {
        clearTimeout(overlaySettingsDebounceRef.current);
      }
      
      // Debounce command send by 500ms (user stops changing for 500ms before sending)
      overlaySettingsDebounceRef.current = setTimeout(() => {
        sendCommand('overlay_settings_update', updated);
      }, 500);
      
      return updated;
    });
  }, [sendCommand]);

  // Update kiosk setting and send command
  // Also saves to Electron store for persistence
  const updateKioskSetting = useCallback((key: string, value: string | number | boolean) => {
    setKioskSettings(prev => {
      const updated = { ...prev, [key]: value };
      
      // Save to Electron store immediately
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        (window as any).electronAPI.setSetting('kioskSettings', updated).catch((err: any) => {
          console.error('[WebAdmin] Failed to save kiosk settings:', err);
        });
      }
      
      sendCommand('kiosk_settings_update', updated);
      return updated;
    });
  }, [sendCommand]);

  // Save settings to Electron store when they change (debounced)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const timeoutId = setTimeout(() => {
        (window as any).electronAPI.setSetting('playerSettings', settings).catch((err: any) => {
          console.error('[WebAdmin] Failed to save player settings:', err);
        });
      }, 1000); // Debounce saves by 1 second
      
      return () => clearTimeout(timeoutId);
    }
  }, [settings]);

  // Send blocking command - waits for Electron to acknowledge
  const sendBlockingCommand = useCallback(async (
    commandFn: () => Promise<CommandResult>
  ): Promise<boolean> => {
    if (isCommandPending) {
      console.warn('[WebAdmin] Command blocked - previous command still pending');
      return false;
    }

    setIsCommandPending(true);
    setCommandError(null);

    try {
      const result = await commandFn();
      if (!result.success) {
        setCommandError(result.error || 'Command failed');
        console.error('[WebAdmin] Command failed:', result.error);
        return false;
      }
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setCommandError(errorMsg);
      console.error('[WebAdmin] Command exception:', error);
      return false;
    } finally {
      setIsCommandPending(false);
    }
  }, [isCommandPending]);

  // Player control functions - now use blocking commands
  const handlePauseClick = () => {
    if (isCommandPending) return; // Block if command in progress
    if (settings.forceAutoPlay) return; // Disabled when force auto-play is enabled
    if (isPlaying) {
      setShowPauseDialog(true);
    } else {
      handleResumePlayback();
    }
  };

  const confirmPause = async () => {
    if (settings.forceAutoPlay) return; // Don't allow pause when force auto-play is enabled
    setShowPauseDialog(false);
    // CRITICAL: Only send command - player will update state via realtime callback
    // NO optimistic updates - player is the single source of truth
    await sendBlockingCommand(() => blockingCommands.pause(playerId));
  };

  const handleResumePlayback = async () => {
    // CRITICAL: Only send command - player will update state via realtime callback
    // NO optimistic updates - player is the single source of truth
    await sendBlockingCommand(() => blockingCommands.resume(playerId));
  };

  const skipTrack = async () => {
    // If current video is from priority queue, show confirmation dialog
    if (isFromPriorityQueue) {
      setShowSkipConfirmDialog(true);
      return;
    }
    // Don't do optimistic update - let Supabase state sync handle the UI update
    // This prevents double-skip when the optimistic update and state sync both advance
    await sendBlockingCommand(() => blockingCommands.skip(playerId));
  };

  // Actually perform the skip (called after confirmation or directly if not priority)
  const confirmSkip = async () => {
    setShowSkipConfirmDialog(false);
    await sendBlockingCommand(() => blockingCommands.skip(playerId));
  };

  const toggleShuffle = async () => {
    await sendBlockingCommand(() => blockingCommands.queueShuffle(playerId));
  };

  const handleVolumeChange = async (newVolume: number) => {
    // CRITICAL: Only send command - player will update state via realtime callback
    // NO local state update - player is the single source of truth
    // Volume change is non-blocking (frequent updates)
    await sendCommand('setVolume', { volume: newVolume / 100 });
  };

  // Play video at specific index in queue (click-to-play)
  const playVideoAtIndex = async (index: number) => {
    await sendBlockingCommand(() => 
      blockingCommands.play({} as any, index, playerId)
    );
  };

  // Show confirmation dialog before playing from queue
  const handleQueueItemClick = useCallback((index: number) => {
    if (isCommandPending) return;
    const video = activeQueue[index];
    if (video) {
      setQueueVideoToPlay({ video, index });
      setShowQueuePlayDialog(true);
    }
  }, [activeQueue, isCommandPending]);

  // Confirm and play the selected queue video
  const confirmQueuePlay = useCallback(async () => {
    if (queueVideoToPlay) {
      await playVideoAtIndex(queueVideoToPlay.index);
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay]);

  // Move selected queue video to play next (position after current)
  const moveQueueVideoToNext = useCallback(async () => {
    if (queueVideoToPlay && activeQueue.length > 1) {
      const { index } = queueVideoToPlay;
      const targetIndex = queueIndex + 1;
      
      // Don't move if already in the next position or is the current video
      if (index === targetIndex || index === queueIndex) {
        setShowQueuePlayDialog(false);
        setQueueVideoToPlay(null);
        return;
      }
      
      // Send command to reorder queue
      await sendCommand('queue_move', { fromIndex: index, toIndex: targetIndex });
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, activeQueue, queueIndex, sendCommand]);

  // Remove selected video from queue
  const removeQueueVideo = useCallback(async () => {
    if (queueVideoToPlay) {
      const { index, video } = queueVideoToPlay;
      
      // Don't remove the currently playing video
      if (index === queueIndex) {
        setShowQueuePlayDialog(false);
        setQueueVideoToPlay(null);
        return;
      }
      
      // Send command to remove from queue
      await sendCommand('queue_remove', { videoId: video.id, queueType: 'active' });
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, queueIndex, sendCommand]);

  // Playlist functions
  const handlePlaylistClick = (playlistName: string) => {
    setSelectedPlaylist(playlistName);
    setCurrentTab('search');
    setSearchScope('playlist');
  };

  const handlePlayButtonClick = (e: React.MouseEvent, playlistName: string) => {
    e.stopPropagation();
    setPlaylistToLoad(playlistName);
    setShowLoadDialog(true);
  };

  const confirmLoadPlaylist = async () => {
    if (playlistToLoad) {
      setShowLoadDialog(false);
      await sendBlockingCommand(() => 
        blockingCommands.loadPlaylist(playlistToLoad, settings.autoShufflePlaylists, playerId)
      );
    }
    setPlaylistToLoad(null);
  };

  const handleTabChange = (tab: TabId) => {
    setCurrentTab(tab);
    if (tab !== 'search') {
      setSelectedPlaylist(null);
    }
  };

  const handleScopeChange = (scope: string) => {
    setSearchScope(scope);
    if (scope !== 'playlist') setSelectedPlaylist(null);
  };

  // Filtering and sorting
  const filterByScope = (videos: SupabaseLocalVideo[], scope: string): SupabaseLocalVideo[] => {
    // Helper to check if a video contains 'karaoke' in title, filename, or playlist
    const isKaraoke = (v: SupabaseLocalVideo): boolean => {
      const title = v.title?.toLowerCase() || '';
      const path = (v.path || '').toLowerCase();
      const playlist = ((v.metadata as any)?.playlist || '').toLowerCase();
      return title.includes('karaoke') || path.includes('karaoke') || playlist.includes('karaoke');
    };
    
    switch (scope) {
      case 'all': return videos;
      case 'no-karaoke': return videos.filter(v => !isKaraoke(v));
      case 'karaoke': return videos.filter(v => isKaraoke(v));
      case 'queue': 
        // Convert queue items to match local video format for display
        // Put playlist in metadata to match SupabaseLocalVideo structure
        return activeQueue.map(q => ({
          id: q.id,
          title: q.title,
          artist: q.artist || null,
          duration: q.duration || null,
          metadata: { playlist: q.playlist || null },
          path: q.path || '',
          is_available: true,
          player_id: playerId,
          created_at: new Date().toISOString(),
        })) as SupabaseLocalVideo[];
      case 'playlist':
        if (!selectedPlaylist) return [];
        return playlists[selectedPlaylist] || [];
      default: return videos;
    }
  };

  const sortResults = (results: SupabaseLocalVideo[], sortBy: string): SupabaseLocalVideo[] => {
    const sorted = [...results];
    switch (sortBy) {
      case 'artist': return sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      case 'title':
      case 'az': return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      default: return sorted;
    }
  };

  const getSearchResults = (): SupabaseLocalVideo[] => {
    let results = filterByScope(searchResults, searchScope);
    return sortResults(results, searchSort);
  };

  // Queue management
  const handleClearQueue = async () => {
    await sendCommand('queue_clear');
  };

  const handleAddToQueue = async (video: SupabaseLocalVideo) => {
    const metadata = video.metadata as any;
    await sendCommand('queue_add', {
      id: video.id,
      title: video.title,
      artist: video.artist,
      duration: video.duration,
      playlist: metadata?.playlist || null,
      path: video.path,
      src: video.path, // Use path as src for local videos
    });
  };

  // Video click handler - opens popover to add to priority queue
  const handleVideoClick = useCallback((video: SupabaseLocalVideo, event: React.MouseEvent) => {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({ x: event.clientX, y: event.clientY });
  }, []);

  // Add video to priority queue via Supabase command
  const handleAddToPriorityQueue = useCallback(async () => {
    if (!popoverVideo) return;
    
    const queueItem = localVideoToQueueItem(popoverVideo);
    await sendBlockingCommand(() => 
      blockingCommands.queueAdd(queueItem, 'priority', 'web-admin', playerId)
    );
    setPopoverVideo(null);
  }, [popoverVideo, sendBlockingCommand, playerId]);

  const handleClosePopover = useCallback(() => {
    setPopoverVideo(null);
  }, []);

  // Get playlist counts with display names
  const getPlaylistList = () => {
    return Object.entries(playlists).map(([name, videos]) => ({
      name,
      displayName: getPlaylistDisplayName(name),
      count: videos.length
    }));
  };

  // Extract active playlist from current video or active queue
  // This matches the Electron Player Admin logic
  useEffect(() => {
    let newActivePlaylist = '';
    
    // Method 1: Try to get playlist from current video's path
    if (currentVideo?.path) {
      const playlistFromPath = extractPlaylistFromPath(currentVideo.path);
      if (playlistFromPath) {
        newActivePlaylist = playlistFromPath;
      }
    }
    
    // Method 2: If no playlist from current video, try to get from active queue
    // Check the current queue item (at queueIndex) or first item in queue
    if (!newActivePlaylist && activeQueue.length > 0) {
      // Try current queue index first
      const currentQueueItem = activeQueue[queueIndex];
      if (currentQueueItem?.playlist) {
        newActivePlaylist = currentQueueItem.playlist;
      } else if (activeQueue[0]?.playlist) {
        // Fallback to first item in queue
        newActivePlaylist = activeQueue[0].playlist;
      } else {
        // Try extracting from path of queue items
        for (const item of activeQueue) {
          if (item.path) {
            const playlistFromPath = extractPlaylistFromPath(item.path);
            if (playlistFromPath) {
              newActivePlaylist = playlistFromPath;
              break;
            }
          }
        }
      }
    }
    
    // Only update if we found a playlist (don't clear if we can't find one)
    if (newActivePlaylist) {
      setActivePlaylist(newActivePlaylist);
    }
  }, [currentVideo, activeQueue, queueIndex]);

  // Get display name for active playlist
  const activePlaylistDisplayName = activePlaylist ? getPlaylistDisplayName(activePlaylist) : 'None';
  
  // Get display name for playlist to load in dialog
  const playlistToLoadDisplayName = playlistToLoad ? getPlaylistDisplayName(playlistToLoad) : '';

  return (
    <div className="app">
      {/* Load Playlist Dialog */}
      {showLoadDialog && (
        <div className="dialog-overlay" onClick={() => setShowLoadDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h3>Load Playlist</h3>
            <p>Load playlist "{playlistToLoadDisplayName}"?</p>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-primary" onClick={confirmLoadPlaylist}>LOAD</button>
              <button className="dialog-btn" onClick={() => setShowLoadDialog(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Confirmation Dialog */}
      {showPauseDialog && (
        <div className="dialog-overlay" onClick={() => setShowPauseDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h3>Pause the Player?</h3>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-primary" onClick={confirmPause}>PAUSE</button>
              <button className="dialog-btn" onClick={() => setShowPauseDialog(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Priority Queue Video Confirmation Dialog */}
      {showSkipConfirmDialog && (
        <div className="dialog-overlay" onClick={() => setShowSkipConfirmDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h3>Skip Request?</h3>
            <p style={{ color: '#ffcc00', fontSize: '13px', marginBottom: '12px' }}>This video was requested. Are you sure?</p>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-warning" onClick={confirmSkip}>SKIP</button>
              <button className="dialog-btn" onClick={() => setShowSkipConfirmDialog(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Play Confirmation Dialog */}
      {showQueuePlayDialog && queueVideoToPlay && (
        <div className="dialog-overlay" onClick={() => { setShowQueuePlayDialog(false); setQueueVideoToPlay(null); }}>
          <div className="dialog-box dialog-box-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{cleanVideoTitle(queueVideoToPlay.video.title)}{queueVideoToPlay.video.artist ? ` - ${getDisplayArtist(queueVideoToPlay.video.artist)}` : ''}</h3>
            <div className="dialog-actions dialog-actions-grid">
              <button className="dialog-btn dialog-btn-primary" onClick={confirmQueuePlay}>▶ PLAY NOW</button>
              <button className="dialog-btn dialog-btn-secondary" onClick={moveQueueVideoToNext}>⏭ PLAY NEXT</button>
              <button className="dialog-btn dialog-btn-danger" onClick={removeQueueVideo}>✕ REMOVE</button>
              <button className="dialog-btn" onClick={() => { setShowQueuePlayDialog(false); setQueueVideoToPlay(null); }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Fixed Top Header */}
      <header className="top-header">
        <div className="header-left">
          <img src="/icon.png" alt="DJAMMS" className="app-logo" style={{ height: '40px', width: 'auto' }} />
          <div className={`online-indicator ${isConnected ? '' : 'offline'}`} title={isConnected ? 'Connected to Player' : 'Disconnected'}></div>
          <PlayerIdBadge />
        </div>
        
        <div className="header-center">
          <div className="active-playlist-info" title="Click the green PLAY button on a highlighted Playlist in the left-hand menu to change Playlists">
            <div className="active-playlist-label">Active Playlist</div>
            <div className="active-playlist-name">{activePlaylistDisplayName}</div>
          </div>
          <div className="now-playing">
            <div className="album-art">
              <div style={{width: '100%', height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}></div>
            </div>
            <div className="track-info">
              <div className="track-title">{cleanVideoTitle(currentVideo?.title) || 'No track playing'}</div>
              <div className="track-artist">{getDisplayArtist(currentVideo?.artist) || '—'}</div>
            </div>
          </div>
        </div>
        
        <div className="header-right">
          <div className="player-controls">
            <button 
              className={`control-btn control-btn-large ${isCommandPending ? 'btn-loading' : ''}`}
              onClick={skipTrack}
              disabled={isCommandPending}
            >
              <span className="control-btn-label">{isCommandPending ? '...' : 'SKIP'}</span>
            </button>
            <button 
              className={`control-btn control-btn-large ${isCommandPending ? 'btn-loading' : ''}`}
              onClick={toggleShuffle}
              disabled={isCommandPending}
            >
              <span className="control-btn-label">{isCommandPending ? '...' : 'SHUFFLE'}</span>
            </button>
            {settings.forceAutoPlay ? (
              <div 
                className="control-btn play-btn"
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: isPlaying ? '#22c55e' : 'var(--bg-elevated)',
                  color: isPlaying ? '#fff' : '#22c55e',
                  cursor: 'default',
                  fontWeight: 600,
                  fontSize: '9px',
                  letterSpacing: '0.5px',
                  lineHeight: '1.2',
                  width: '48px',
                  height: '48px',
                  textAlign: 'center'
                }}
                title="Auto-play is enabled. Pause is disabled."
              >
                <span>AUTO-PLAY</span>
                <span>ENABLED</span>
              </div>
            ) : (
              <button 
                className={`control-btn play-btn ${isCommandPending ? 'btn-loading' : ''} ${isPlaying ? 'playing' : ''}`}
                onClick={handlePauseClick}
                disabled={isCommandPending}
                style={isPlaying ? { backgroundColor: '#22c55e', color: '#fff' } : {}}
              >
                <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </button>
            )}
            <div className="volume-control">
              <span className="material-symbols-rounded">volume_up</span>
              <input 
                type="range" 
                value={volume} 
                onChange={(e) => handleVolumeChange(Number(e.target.value))} 
                min="0" 
                max="100" 
              />
            </div>
          </div>
          {commandError && (
            <div className="command-error" style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '4px' }}>
              {commandError}
            </div>
          )}
        </div>
      </header>

      {/* Priority Queue Bar */}
      <div className={`priority-queue-bar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="priority-queue-label">Priority Queue:</div>
        <div className="priority-queue-content">
          {priorityQueue.length === 0 ? (
            <span className="priority-queue-empty">Priority Queue is Empty...</span>
          ) : (
            <div className="priority-queue-ticker">
              {priorityQueue.map((item, idx) => (
                <span key={`${item.id}-${idx}`} className="priority-queue-item">
                  {cleanVideoTitle(item.title)}{getDisplayArtist(item.artist) ? ` - ${getDisplayArtist(item.artist)}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="main-container">
        {/* Left Sidebar */}
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Expand Sidebar' : 'Hide Sidebar'}>
            {sidebarCollapsed ? (
              <span className="material-symbols-rounded">chevron_right</span>
            ) : (
              <span className="sidebar-toggle-text">Hide Sidebar</span>
            )}
          </button>
          
          <nav className="sidebar-nav">
            <div className="nav-section">
              {navItems.map(nav => (
                <button
                  key={nav.id}
                  className={`nav-item ${currentTab === nav.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(nav.id)}
                >
                  <span className="material-symbols-rounded">{nav.icon}</span>
                  <span className="nav-label">{nav.label}</span>
                </button>
              ))}
            </div>
            
            <div className="nav-separator"></div>
            
            <div className="playlist-section">
              <div className="playlist-header" title="Click the green PLAY button on a highlighted Playlist in the left-hand menu to change Playlists">
                <span className="playlist-header-label">PLAYLISTS</span>
              </div>
              <div className="playlist-list">
                {getPlaylistList().length === 0 ? (
                  <div style={{ padding: '16px', color: 'var(--text-tertiary)', fontSize: '12px', textAlign: 'center' }}>
                    {allVideos === undefined ? 'Loading playlists...' : 'No playlists found. Player may need to index videos.'}
                  </div>
                ) : (
                  getPlaylistList().map(playlist => (
                  <div
                    key={playlist.name}
                    className={`playlist-item ${selectedPlaylist === playlist.name ? 'selected' : ''}`}
                    onClick={() => handlePlaylistClick(playlist.name)}
                    onMouseEnter={() => setHoveredPlaylist(playlist.name)}
                    onMouseLeave={() => setHoveredPlaylist(null)}
                  >
                    <span className="material-symbols-rounded playlist-icon">playlist_play</span>
                    <span className="playlist-name">
                      {selectedPlaylist === playlist.name ? `Selected: ${playlist.displayName}` : playlist.displayName}
                    </span>
                    {hoveredPlaylist === playlist.name && (
                      <button
                        className="playlist-play-btn"
                        onClick={(e) => handlePlayButtonClick(e, playlist.name)}
                      >
                        <span className="material-symbols-rounded">play_arrow</span>
                      </button>
                    )}
                    <span className="playlist-count">{playlist.count}</span>
                  </div>
                  ))
                )}
              </div>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="content-area">
          {/* Queue Tab */}
          {currentTab === 'queue' && (
            <div className="tab-content active">
              <div className="tab-header">
                <h1>Queue</h1>
                <div className="tab-actions">
                  <button className="action-btn" onClick={handleClearQueue}>
                    <span className="material-symbols-rounded">clear_all</span>
                    Clear Queue
                  </button>
                </div>
              </div>
              <div className="table-container">
                {/* Now Playing Section - Card with Progress Bar */}
                {currentVideo && (
                  <div className="queue-section now-playing-section">
                    <div className="queue-section-header">
                      <span className="material-symbols-rounded">play_circle</span>
                      NOW PLAYING
                    </div>
                    <div className="now-playing-content">
                      <div className="now-playing-info">
                        <div className="now-playing-title">{cleanVideoTitle(currentVideo.title)}</div>
                        <div className="now-playing-artist">{getDisplayArtist(currentVideo.artist)}</div>
                        <div className="now-playing-playlist">{getPlaylistDisplayName(extractPlaylistFromPath(currentVideo.path) || '')}</div>
                      </div>
                      <div className="now-playing-progress">
                        <span className="time-elapsed">
                          {Math.floor(playbackTime / 60)}:{String(Math.floor(playbackTime % 60)).padStart(2, '0')}
                        </span>
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill" 
                            style={{ width: `${playbackDuration > 0 ? (playbackTime / playbackDuration) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="time-remaining">
                          -{Math.floor((playbackDuration - playbackTime) / 60)}:{String(Math.floor((playbackDuration - playbackTime) % 60)).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Priority Queue Section */}
                {priorityQueue.length > 0 && (
                  <div className="queue-section priority-queue-section">
                    <div className="queue-section-header priority">
                      <span className="material-symbols-rounded">priority_high</span>
                      PRIORITY QUEUE
                    </div>
                    <table className="media-table">
                      <tbody>
                        {priorityQueue.map((track, index) => (
                          <tr
                            key={`priority-${track.id}-${index}`}
                            className="priority-item"
                          >
                            <td className="col-index">P{index + 1}</td>
                            <td className="col-title">{cleanVideoTitle(track.title)}</td>
                            <td>{getDisplayArtist(track.artist)}</td>
                            <td>{track.duration || '—'}</td>
                            <td>{getPlaylistDisplayName(track.playlist || '')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Active Queue Section - Reordered: "Up Next" first, then "Already Played" */}
                {(() => {
                  const logData = {
                    activeQueueLength: activeQueue.length,
                    activeQueueIsArray: Array.isArray(activeQueue),
                    firstItem: activeQueue[0]?.title,
                    willShowEmpty: activeQueue.length === 0,
                    playerStateExists: !!playerState,
                    currentVideoExists: !!currentVideo
                  };
                  console.log('[WebAdmin] UI render - Active Queue section:', logData);
                  return null;
                })()}
                <div className="queue-section active-queue-section">
                  <div className="queue-section-header">
                    <span className="material-symbols-rounded">queue_music</span>
                    UP NEXT
                  </div>
                  <table className="media-table">
                    <thead>
                      <tr>
                        <th className="col-index">#</th>
                        <th className="col-title">Title</th>
                        <th className="col-artist">Artist</th>
                        <th className="col-duration">Duration</th>
                        <th className="col-playlist">Playlist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeQueue.length === 0 ? (
                        <tr className="empty-state">
                          <td colSpan={5}>
                            {playerState ? 'Queue is empty. Add tracks from Search or Browse.' : 'Waiting for player to initialize...'}
                          </td>
                        </tr>
                      ) : (() => {
                        // ARCHITECTURE: Index 0 is always now-playing - display only indices 1-end (up-next videos)
                        // The current video (index 0) is NOT shown in this list - it's displayed in NOW PLAYING section
                        const upNextVideos = activeQueue.slice(1); // Videos after index 0 (indices 1-end)
                        // No "already played" videos - index 0 is now-playing, not shown here
                        
                        if (upNextVideos.length === 0) {
                          return (
                            <tr className="empty-state">
                              <td colSpan={5}>No more tracks in queue.</td>
                            </tr>
                          );
                        }
                        
                        // Map to track original indices for click handling
                        // Since we only show indices 1-end, originalIndex = reorderedIndex + 1
                        const getOriginalIndex = (reorderedIndex: number): number => {
                          return reorderedIndex + 1; // Add 1 because we're only showing indices 1-end
                        };
                        
                        // Display only up-next videos (indices 1-end)
                        return upNextVideos.map((track, reorderedIndex) => {
                          const originalIndex = getOriginalIndex(reorderedIndex);
                          
                          return (
                            <tr
                              key={`queue-${track.id}-${originalIndex}`}
                              className=""
                              onClick={() => handleQueueItemClick(originalIndex)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>{reorderedIndex + 1}</td>
                              <td className="col-title">{cleanVideoTitle(track.title)}</td>
                              <td>{getDisplayArtist(track.artist)}</td>
                              <td>{track.duration || '—'}</td>
                              <td>{getPlaylistDisplayName(track.playlist || '')}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Search Tab */}
          {currentTab === 'search' && (
            <div className="tab-content active">
              <div className="search-header" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <div className="search-input-container" style={{ flex: '1 1 300px', minWidth: '200px' }}>
                  <span className="material-symbols-rounded search-icon">search</span>
                  <input
                    type="text"
                    placeholder="Search all music…"
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchLimit(100); // Reset pagination when query changes
                    }}
                  />
                  {searchLoading && (
                    <span className="material-symbols-rounded loading-icon" style={{ marginLeft: '8px', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                  )}
                </div>
                <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginRight: '4px' }}>Filter:</span>
                  {selectedPlaylist && (
                    <button
                      className={`radio-btn ${searchScope === 'playlist' ? 'active' : ''}`}
                      onClick={() => handleScopeChange('playlist')}
                      style={{ fontWeight: searchScope === 'playlist' ? 'bold' : 'normal' }}
                    >
                      📁 {getPlaylistDisplayName(selectedPlaylist)}
                    </button>
                  )}
                  <button
                    className={`radio-btn ${searchScope === 'all' ? 'active' : ''}`}
                    onClick={() => handleScopeChange('all')}
                  >
                    All Music
                  </button>
                  <button
                    className={`radio-btn ${searchScope === 'karaoke' ? 'active' : ''}`}
                    onClick={() => handleScopeChange('karaoke')}
                  >
                    Karaoke Only
                  </button>
                  <button
                    className={`radio-btn ${searchScope === 'no-karaoke' ? 'active' : ''}`}
                    onClick={() => handleScopeChange('no-karaoke')}
                  >
                    Hide Karaoke
                  </button>
                </div>
                <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginRight: '4px' }}>Sort:</span>
                  <button
                    className={`radio-btn ${searchSort === 'relevance' ? 'active' : ''}`}
                    onClick={() => setSearchSort('relevance')}
                  >
                    Relevance
                  </button>
                  <button
                    className={`radio-btn ${searchSort === 'artist' ? 'active' : ''}`}
                    onClick={() => setSearchSort('artist')}
                  >
                    Artist
                  </button>
                  <button
                    className={`radio-btn ${searchSort === 'title' ? 'active' : ''}`}
                    onClick={() => setSearchSort('title')}
                  >
                    Title
                  </button>
                  <button
                    className={`radio-btn ${searchSort === 'playlist' ? 'active' : ''}`}
                    onClick={() => setSearchSort('playlist')}
                  >
                    Playlist
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="media-table">
                  <thead>
                    <tr>
                      <th className="col-index">#</th>
                      <th className="col-title">Title</th>
                      <th className="col-artist">Artist</th>
                      <th className="col-duration">Duration</th>
                      <th className="col-playlist">Playlist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchLoading && searchResults.length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>Loading...</td>
                      </tr>
                    ) : getSearchResults().length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>No results found</td>
                      </tr>
                    ) : (
                      getSearchResults().map((track, index) => (
                        <tr key={`${track.id}-${index}`} onClick={(e) => handleVideoClick(track, e)} style={{ cursor: 'pointer' }}>
                          <td>{index + 1}</td>
                          <td className="col-title">{cleanVideoTitle(track.title)}</td>
                          <td>{getDisplayArtist(track.artist)}</td>
                          <td>{track.duration || '—'}</td>
                          <td>{getPlaylistDisplayName(getVideoPlaylist(track))}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {searchTotalCount > searchResults.length && (
                  <div className="load-more-container" style={{ padding: '12px', textAlign: 'center' }}>
                    <button 
                      className="action-btn"
                      onClick={() => setSearchLimit(prev => prev + 100)}
                      style={{ marginRight: '8px' }}
                      disabled={searchLoading}
                    >
                      {searchLoading ? 'Loading...' : `Load More (${searchTotalCount - searchResults.length} remaining)`}
                    </button>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Showing {searchResults.length} of {searchTotalCount}+ tracks
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {currentTab === 'settings' && (
            <div className="tab-content active">
              <div className="settings-container">
                <h1>Settings</h1>
                
                <div className="settings-section">
                  <h2>Playback</h2>
                  <div className="setting-item">
                    <label>Auto-shuffle playlists</label>
                    <input 
                      type="checkbox" 
                      checked={settings.autoShufflePlaylists}
                      onChange={(e) => setSettings(s => ({ ...s, autoShufflePlaylists: e.target.checked }))}
                    />
                  </div>
                  <div className="setting-item">
                    <label>Crossfade duration</label>
                    <div className="crossfade-slider-container">
                      <input 
                        type="range" 
                        className="crossfade-slider" 
                        value={settings.fadeDuration}
                        onChange={(e) => setSettings(s => ({ ...s, fadeDuration: Number(e.target.value) }))}
                        min="0" 
                        max="5" 
                        step="1"
                      />
                      <span className="crossfade-value">{settings.fadeDuration.toFixed(1)}s</span>
                    </div>
                  </div>
                  <div className="setting-item">
                    <label>Normalize audio levels</label>
                    <input 
                      type="checkbox" 
                      checked={settings.normalizeAudioLevels}
                      onChange={(e) => setSettings(s => ({ ...s, normalizeAudioLevels: e.target.checked }))}
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">🎮</span> Player Controls</h2>
                  <p className="section-description">Control playback behavior and pause functionality</p>
                  
                  <div className="setting-item">
                    <label>Force Auto-Play (this will disable 'Pause' toggle)</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${!settings.forceAutoPlay ? 'active' : ''}`}
                        onClick={() => setSettings(s => ({ ...s, forceAutoPlay: false }))}
                      >
                        DISABLE
                      </button>
                      <button
                        className={`toggle-btn ${settings.forceAutoPlay ? 'active' : ''}`}
                        onClick={() => setSettings(s => ({ ...s, forceAutoPlay: true }))}
                      >
                        ENABLE
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">🆔</span> Player Identity</h2>
                  <div className="setting-item">
                    <label>Player ID</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        backgroundColor: 'rgba(255, 30, 86, 0.1)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        letterSpacing: '0.5px'
                      }}>
                        {playerId}
                      </span>
                      <button 
                        className="action-btn"
                        onClick={() => {
                          // Clear stored player ID and reload to show ConnectPlayerModal
                          disconnect();
                          window.location.reload();
                        }}
                      >
                        <span className="material-symbols-rounded">logout</span>
                        Disconnect
                      </button>
                    </div>
                    <p className="setting-description" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Connected to Electron Player. Disconnect to change Player ID.
                    </p>
                  </div>
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">📚</span> Library</h2>
                  <p className="section-description">Configure library folder paths</p>
                  
                  <div className="setting-item">
                    <label>Path to PLAYLISTS Folder</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={getSettings().playlistsPath || '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'}
                        readOnly
                        style={{ flex: 1, fontSize: '14px' }}
                      />
                      <button className="action-btn" disabled>
                        <span className="material-symbols-rounded">folder</span>
                        Select Folder
                      </button>
                    </div>
                    <p className="setting-description" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Path to the PLAYLISTS folder containing your music library
                    </p>
                  </div>
                  
                  <div className="setting-item">
                    <label>Path to THUMBNAILS Folder</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={getThumbnailsPath()}
                        onChange={(e) => setThumbnailsPath(e.target.value)}
                        style={{ flex: 1, fontSize: '14px' }}
                        placeholder="/Users/mikeclarkin/Music/DJAMMS/THUMBNAILS"
                      />
                      <button className="action-btn" disabled>
                        <span className="material-symbols-rounded">folder</span>
                        Select Folder
                      </button>
                    </div>
                    <p className="setting-description" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Path to the THUMBNAILS folder containing video thumbnails (e.g., youtubeId.thumb.250.png)
                    </p>
                  </div>
                </div>

                <div className="settings-section">
                  <h2>Web Admin</h2>
                  <div className="setting-item">
                    <label>Connection Status</label>
                    <span style={{ color: isConnected ? '#22c55e' : '#ef4444' }}>
                      {isConnected ? 'Connected to Player' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="setting-item">
                    <label>Active Playlist</label>
                    <span>{activePlaylistDisplayName}</span>
                  </div>
                  <div className="setting-item">
                    <label>Queue Size</label>
                    <span>{activeQueue.length} tracks</span>
                  </div>
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">🎬</span> Player Display</h2>
                  <p className="section-description">Control the Electron player window remotely</p>
                  
                  <div className="setting-item">
                    <label>Show/Hide Player Window</label>
                    <div className="button-group">
                      <button 
                        className="action-btn"
                        onClick={() => sendCommand('player_window_toggle', { show: true })}
                        disabled={isCommandPending}
                      >
                        <span className="material-symbols-rounded">visibility</span>
                        Show
                      </button>
                      <button 
                        className="action-btn"
                        onClick={() => sendCommand('player_window_toggle', { show: false })}
                        disabled={isCommandPending}
                      >
                        <span className="material-symbols-rounded">visibility_off</span>
                        Hide
                      </button>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Fullscreen Player</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${!settings.playerFullscreen ? 'active' : ''}`}
                        onClick={async () => {
                          const newValue = false;
                          setSettings(s => ({ ...s, playerFullscreen: newValue }));
                          await sendCommand('player_fullscreen_toggle', { fullscreen: newValue });
                        }}
                        disabled={isCommandPending}
                      >
                        DISABLE
                      </button>
                      <button
                        className={`toggle-btn ${settings.playerFullscreen ? 'active' : ''}`}
                        onClick={async () => {
                          const newValue = true;
                          setSettings(s => ({ ...s, playerFullscreen: newValue }));
                          await sendCommand('player_fullscreen_toggle', { fullscreen: newValue });
                        }}
                        disabled={isCommandPending}
                      >
                        ENABLE
                      </button>
                    </div>
                    <p className="setting-description" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {settings.playerFullscreen 
                        ? 'Player window displays fullscreen on selected display' 
                        : 'Player window displays as resizable windowed mode'}
                    </p>
                  </div>

                  <div className="setting-item">
                    <label>Refresh Player</label>
                    <button 
                      className="action-btn"
                      onClick={() => sendCommand('player_refresh', {})}
                      disabled={isCommandPending}
                    >
                      <span className="material-symbols-rounded">restart_alt</span>
                      Refresh Player Window
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">🎬</span> Player Overlay</h2>
                  <p className="section-description">Control overlay text and watermark on the player</p>
                  
                  {/* Now Playing Text */}
                  <div className="setting-item">
                    <label>'Now Playing' Text</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${!overlaySettings.showNowPlaying ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showNowPlaying', false)}
                      >
                        Hide
                      </button>
                      <button
                        className={`toggle-btn ${overlaySettings.showNowPlaying ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showNowPlaying', true)}
                      >
                        Show
                      </button>
                    </div>
                  </div>

                  {overlaySettings.showNowPlaying && (
                    <div className="setting-item overlay-position-settings">
                      <label>Position & Size</label>
                      <div className="overlay-controls">
                        <div className="overlay-control">
                          <span>Size:</span>
                          <input type="number" min="10" max="200" value={overlaySettings.nowPlayingSize}
                            onChange={(e) => updateOverlaySetting('nowPlayingSize', Math.min(200, Math.max(10, parseInt(e.target.value) || 100)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>X:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.nowPlayingX}
                            onChange={(e) => updateOverlaySetting('nowPlayingX', Math.min(99, Math.max(1, parseInt(e.target.value) || 5)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Y:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.nowPlayingY}
                            onChange={(e) => updateOverlaySetting('nowPlayingY', Math.min(99, Math.max(1, parseInt(e.target.value) || 85)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Opacity:</span>
                          <input type="number" min="10" max="100" value={overlaySettings.nowPlayingOpacity}
                            onChange={(e) => updateOverlaySetting('nowPlayingOpacity', Math.min(100, Math.max(10, parseInt(e.target.value) || 100)))} />
                          <span>%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coming Up Ticker */}
                  <div className="setting-item">
                    <label>'Coming Up' Ticker</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${!overlaySettings.showComingUp ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showComingUp', false)}
                      >
                        Hide
                      </button>
                      <button
                        className={`toggle-btn ${overlaySettings.showComingUp ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showComingUp', true)}
                      >
                        Show
                      </button>
                    </div>
                  </div>

                  {overlaySettings.showComingUp && (
                    <div className="setting-item overlay-position-settings">
                      <label>Position & Size</label>
                      <div className="overlay-controls">
                        <div className="overlay-control">
                          <span>Size:</span>
                          <input type="number" min="10" max="200" value={overlaySettings.comingUpSize}
                            onChange={(e) => updateOverlaySetting('comingUpSize', Math.min(200, Math.max(10, parseInt(e.target.value) || 100)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>X:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.comingUpX}
                            onChange={(e) => updateOverlaySetting('comingUpX', Math.min(99, Math.max(1, parseInt(e.target.value) || 5)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Y:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.comingUpY}
                            onChange={(e) => updateOverlaySetting('comingUpY', Math.min(99, Math.max(1, parseInt(e.target.value) || 95)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Opacity:</span>
                          <input type="number" min="10" max="100" value={overlaySettings.comingUpOpacity}
                            onChange={(e) => updateOverlaySetting('comingUpOpacity', Math.min(100, Math.max(10, parseInt(e.target.value) || 100)))} />
                          <span>%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Watermark / Logo */}
                  <div className="setting-item">
                    <label>Watermark / Logo</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${!overlaySettings.showWatermark ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showWatermark', false)}
                      >
                        Off
                      </button>
                      <button
                        className={`toggle-btn ${overlaySettings.showWatermark ? 'active' : ''}`}
                        onClick={() => updateOverlaySetting('showWatermark', true)}
                      >
                        On
                      </button>
                    </div>
                  </div>

                  {overlaySettings.showWatermark && (
                    <div className="setting-item overlay-position-settings">
                      <label>Position & Size</label>
                      <div className="overlay-controls">
                        <div className="overlay-control">
                          <span>Size:</span>
                          <input type="number" min="10" max="200" value={overlaySettings.watermarkSize}
                            onChange={(e) => updateOverlaySetting('watermarkSize', Math.min(200, Math.max(10, parseInt(e.target.value) || 100)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>X:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.watermarkX}
                            onChange={(e) => updateOverlaySetting('watermarkX', Math.min(99, Math.max(1, parseInt(e.target.value) || 90)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Y:</span>
                          <input type="number" min="1" max="99" value={overlaySettings.watermarkY}
                            onChange={(e) => updateOverlaySetting('watermarkY', Math.min(99, Math.max(1, parseInt(e.target.value) || 10)))} />
                          <span>%</span>
                        </div>
                        <div className="overlay-control">
                          <span>Opacity:</span>
                          <input type="number" min="10" max="100" value={overlaySettings.watermarkOpacity}
                            onChange={(e) => updateOverlaySetting('watermarkOpacity', Math.min(100, Math.max(10, parseInt(e.target.value) || 80)))} />
                          <span>%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="settings-section">
                  <h2><span className="section-icon">🎰</span> Kiosk</h2>
                  <p className="section-description">Control the Kiosk touchscreen interface</p>
                  
                  {/* Kiosk Mode Toggle */}
                  <div className="setting-item">
                    <label>Kiosk Mode</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${kioskSettings.mode === 'freeplay' ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('mode', 'freeplay')}
                      >
                        Free Play
                      </button>
                      <button
                        className={`toggle-btn ${kioskSettings.mode === 'credits' ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('mode', 'credits')}
                      >
                        Credits
                      </button>
                    </div>
                  </div>

                  {/* Kiosk UI Style Toggle */}
                  <div className="setting-item">
                    <label>Kiosk UI Style</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${kioskSettings.uiMode === 'classic' ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('uiMode', 'classic')}
                      >
                        Classic
                      </button>
                      <button
                        className={`toggle-btn ${kioskSettings.uiMode === 'jukebox' ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('uiMode', 'jukebox')}
                      >
                        Jukebox
                      </button>
                    </div>
                    <span className="setting-hint">
                      {kioskSettings.uiMode === 'classic' ? 'Standard search interface' : 'Premium cyber-neon UI'}
                    </span>
                  </div>

                  {/* Kiosk Balance */}
                  <div className="setting-item">
                    <label>Kiosk Balance</label>
                    <div className="kiosk-balance-controls">
                      <span className="kiosk-balance-display">
                        {kioskSettings.creditBalance} Credits
                      </span>
                      <div className="button-group">
                        <button 
                          className="action-btn"
                          onClick={() => updateKioskSetting('creditBalance', kioskSettings.creditBalance + 1)}
                        >
                          +1
                        </button>
                        <button 
                          className="action-btn"
                          onClick={() => updateKioskSetting('creditBalance', kioskSettings.creditBalance + 3)}
                        >
                          +3
                        </button>
                        <button 
                          className="action-btn action-btn-danger"
                          onClick={() => updateKioskSetting('creditBalance', 0)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Kiosk Search Scope */}
                  <div className="setting-item">
                    <label>Search Scope</label>
                    <div className="button-group">
                      <button
                        className={`toggle-btn ${kioskSettings.searchAllMusic ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('searchAllMusic', true)}
                      >
                        All Music
                      </button>
                      <button
                        className={`toggle-btn ${!kioskSettings.searchAllMusic ? 'active' : ''}`}
                        onClick={() => updateKioskSetting('searchAllMusic', false)}
                      >
                        Active Playlist Only
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tools Tab */}
          {currentTab === 'tools' && (
            <div className="tab-content active">
              <div className="tools-container">
                <h2>Toolkit</h2>
                <p>Utility tools for managing your music library and player.</p>
                <div className="tools-grid">
                  <div className="tool-card" onClick={handleClearQueue}>
                    <span className="material-symbols-rounded">clear_all</span>
                    <h3>Clear Queue</h3>
                    <p>Remove all tracks from the queue</p>
                  </div>
                  <div className="tool-card" onClick={toggleShuffle}>
                    <span className="material-symbols-rounded">shuffle</span>
                    <h3>Shuffle Queue</h3>
                    <p>Randomize the current queue order</p>
                  </div>
                  <div className="tool-card disabled">
                    <span className="material-symbols-rounded">edit</span>
                    <h3>Batch Tag Editor</h3>
                    <p>Edit metadata for multiple files</p>
                  </div>
                  <div className="tool-card disabled">
                    <span className="material-symbols-rounded">content_copy</span>
                    <h3>Duplicate Finder</h3>
                    <p>Find and manage duplicate tracks</p>
                  </div>
                  <div className="tool-card disabled">
                    <span className="material-symbols-rounded">analytics</span>
                    <h3>Library Stats</h3>
                    <p>View detailed library statistics</p>
                  </div>
                  <div className="tool-card disabled">
                    <span className="material-symbols-rounded">cloud_sync</span>
                    <h3>Sync Settings</h3>
                    <p>Sync settings with Electron player</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Priority Queue Popover */}
      {popoverVideo && (
        <VideoPopover
          video={popoverVideo}
          position={popoverPosition}
          onAddToPriorityQueue={handleAddToPriorityQueue}
          onCancel={handleClosePopover}
        />
      )}
    </div>
  );
}
