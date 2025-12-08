// src/pages/PlayerWindow.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Video } from '../types';
import { localSearchService, SearchResult, getSupabaseService } from '../services';
import { getPlaylistDisplayName, getDisplayArtist, cleanVideoTitle, formatDuration } from '../utils/playlistHelpers';
import { shuffleArray } from '../utils/arrayUtils';
import { useSupabase } from '../hooks/useSupabase';
import { QueueVideoItem } from '../types/supabase';
import { 
  getPlayerId, 
  setPlayerId as storePlayerId,
  clearPlayerId,
  initializePlayerId,
  DEFAULT_PLAYER_ID,
  isValidPlayerIdFormat,
  claimPlayerId,
  validatePlayerId,
  MIN_PLAYER_ID_LENGTH,
  MAX_PLAYER_ID_LENGTH
} from '../utils/playerUtils';
import { useVideoPlayer } from '../hooks/useVideoPlayer';

interface PlayerWindowProps {
  className?: string;
}

interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

type TabId = 'queue' | 'search' | 'settings' | 'tools';

// Navigation items configuration
const navItems: { id: TabId; icon: string; label: string }[] = [
  { id: 'queue', icon: 'queue_music', label: 'Queue' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'tools', icon: 'build', label: 'Tools' },
];

// Player ID Setting Component (inline for simplicity)
interface PlayerIdSettingProps {
  playerId: string;
  onPlayerIdChange: (newId: string) => void;
  needsPlayerId?: boolean;
  onPlayerIdSet?: () => void;
}

const PlayerIdSetting: React.FC<PlayerIdSettingProps> = ({ playerId, onPlayerIdChange, needsPlayerId = false, onPlayerIdSet }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newId, setNewId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const handleStartEdit = useCallback(() => {
    setNewId('');
    setError(null);
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setNewId('');
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const clean = newId.trim().toUpperCase();
    
    // Validation checks
    if (!clean || clean === '') {
      setError('Player ID cannot be empty');
      return;
    }

    if (clean.length < MIN_PLAYER_ID_LENGTH || clean.length > MAX_PLAYER_ID_LENGTH) {
      setError(`Player ID must be between ${MIN_PLAYER_ID_LENGTH} and ${MAX_PLAYER_ID_LENGTH} characters`);
      return;
    }

    if (!isValidPlayerIdFormat(clean)) {
      setError('Player ID can only contain letters A-Z, numbers 0-9, and underscore (_)');
      return;
    }

    if (clean === playerId) {
      setError('This is already your current Player ID');
      return;
    }

    setIsChanging(true);
    setError(null);

    try {
      // Check if Player ID already exists in Supabase
      const supabaseService = getSupabaseService();
      const client = supabaseService.getClient();
      
      if (client) {
        const { data, error: queryError } = await client
          .from('player_state')
          .select('player_id')
          .eq('player_id', clean)
          .maybeSingle();

        if (queryError && queryError.code !== 'PGRST116') {
          // PGRST116 = no rows found (not an error)
          throw queryError;
        }

        if (data) {
          // Player ID already exists
          setError('The Player ID is already in use. Please enter a new Player ID.');
          return;
        }
      }

      // Player ID is unique - claim it
      const result = await claimPlayerId(clean);
      if (result.success) {
        onPlayerIdChange(clean);
        setIsEditing(false);
        setNewId('');
        if (onPlayerIdSet) {
          onPlayerIdSet();
        }
      } else {
        setError(result.error || 'Failed to claim Player ID');
      }
    } catch (err: any) {
      console.error('[PlayerIdSetting] Validation error:', err);
      if (err.message && err.message.includes('already in use')) {
        setError('The Player ID is already in use. Please enter a new Player ID.');
      } else {
        setError('Failed to validate Player ID. Please try again.');
      }
    } finally {
      setIsChanging(false);
    }
  }, [newId, playerId, onPlayerIdChange]);

  if (!isEditing) {
    return (
      <div className="setting-item">
        <label>Player ID</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ 
            fontFamily: 'monospace',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--accent-color)',
            backgroundColor: 'rgba(62, 166, 255, 0.1)',
            padding: '6px 12px',
            borderRadius: '6px',
            letterSpacing: '0.5px'
          }}>
            {playerId}
          </span>
          <button className="action-btn" onClick={handleStartEdit}>
            <span className="material-symbols-rounded">edit</span>
            Change
          </button>
        </div>
        <p className="setting-description">
          Unique identifier for this player. Web Admin and Kiosk apps connect using this ID.
        </p>
      </div>
    );
  }

  return (
    <div className="setting-item">
      <label>Player ID</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            value={newId}
            onChange={(e) => {
              // Only allow A-Z, 0-9, and underscore
              const filtered = e.target.value.replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
              setNewId(filtered);
              setError(null);
            }}
            placeholder="Enter new Player ID"
            disabled={isChanging}
            data-player-id-edit
            autoFocus={needsPlayerId}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              fontFamily: 'monospace',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              border: error ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
              borderRadius: '6px',
              outline: 'none',
              width: '200px',
              textTransform: 'uppercase'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isChanging) handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
          <button 
            className="action-btn primary"
            onClick={handleSave}
            disabled={isChanging || !newId.trim()}
          >
            {isChanging ? 'Saving...' : 'Save'}
          </button>
          <button 
            className="action-btn"
            onClick={handleCancel}
            disabled={isChanging}
          >
            Cancel
          </button>
        </div>
        {error && (
          <span style={{ fontSize: '12px', color: 'var(--error-color)' }}>
            {error}
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Min {MIN_PLAYER_ID_LENGTH} characters. Will create if not exists. <strong>Restart required</strong> after changing.
        </span>
      </div>
    </div>
  );
};

export const PlayerWindow: React.FC<PlayerWindowProps> = ({ className = '' }) => {
  // Player state (synced from Player Window via IPC)
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [playbackTime, setPlaybackTime] = useState(0); // Current playback position in seconds
  const [playbackDuration, setPlaybackDuration] = useState(0); // Total duration in seconds

  // Playlist/Queue state
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string>('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [queue, setQueue] = useState<Video[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [priorityQueue, setPriorityQueue] = useState<Video[]>([]); // KIOSK requests

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchSort, setSearchSort] = useState('az');
  const [searchLimit, setSearchLimit] = useState(100); // Limit displayed rows for performance
  
  // Supabase-powered search results (async)
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotalCount, setSearchTotalCount] = useState(0);

  // UI state
  const [currentTab, setCurrentTab] = useState<TabId>('queue');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null);
  
  // Dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [playlistToLoad, setPlaylistToLoad] = useState<string | null>(null);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showQueuePlayDialog, setShowQueuePlayDialog] = useState(false);
  const [queueVideoToPlay, setQueueVideoToPlay] = useState<{ video: Video; index: number } | null>(null);
  const [showSkipConfirmDialog, setShowSkipConfirmDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showPlayerIdAlert, setShowPlayerIdAlert] = useState(false);
  const [needsPlayerId, setNeedsPlayerId] = useState(false);
  const [showDefaultPlaylistAlert, setShowDefaultPlaylistAlert] = useState(false);
  const [defaultPlaylistName, setDefaultPlaylistName] = useState<string | null>(null);
  
  // Track if current video is from priority queue (for skip confirmation)
  const [isFromPriorityQueue, setIsFromPriorityQueue] = useState(false);
  
  // Popover state for search video click
  const [popoverVideo, setPopoverVideo] = useState<Video | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  
  // Processing progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });

  // Settings
  const [settings, setSettings] = useState({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0,
    crossfadeMode: 'manual' as 'manual' | 'seamless',
    playerDisplayId: null as number | null,
    playerFullscreen: false,
    playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
  });

  // Player Identity state
  const [playerId, setPlayerId] = useState<string>(DEFAULT_PLAYER_ID);
  const [playerIdInitialized, setPlayerIdInitialized] = useState(false);

  // Kiosk settings state
  const [kioskSettings, setKioskSettings] = useState({
    mode: 'freeplay' as 'freeplay' | 'credits',
    uiMode: 'classic' as 'classic' | 'jukebox', // UI style: classic (SearchInterface) or jukebox (JukeboxSearchMode)
    creditBalance: 0,
    searchAllMusic: true,
    searchYoutube: false
  });
  const [kioskSerialStatus, setKioskSerialStatus] = useState<'disconnected' | 'connected'>('disconnected');
  const [kioskAvailableSerialDevices, setKioskAvailableSerialDevices] = useState<string[]>([]);
  const [kioskSelectedSerialDevice, setKioskSelectedSerialDevice] = useState<string>('');

  // Player overlay settings state - default watermark is Obie_neon_no_BG.png in public folder
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
    watermarkImage: './Obie_neon_no_BG.png', // Default watermark from public folder (relative path for production)
    watermarkSize: 100,
    watermarkX: 90,
    watermarkY: 10,
    watermarkOpacity: 80
  });

  // Display management state
  const [availableDisplays, setAvailableDisplays] = useState<DisplayInfo[]>([]);
  const [playerWindowOpen, setPlayerWindowOpen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false); // True after queue is loaded and ready
  const playerReadyRef = useRef(false); // Ref to avoid stale closure in IPC callbacks
  const hasIndexedRef = useRef(false); // Prevent multiple indexing calls during mount
  const lastIndexedPlayerIdRef = useRef<string | null>(null); // Prevent redundant re-index for same playerId
  
  // Debounce refs to prevent infinite loop on rapid video end events
  const lastPlayNextTimeRef = useRef(0);
  const lastAdvancedFromVideoRef = useRef<string | null>(null); // Track which video we advanced FROM
  const currentVideoRef = useRef<Video | null>(null); // Ref for current video (for debounce check)
  const lastPlayedVideoIdRef = useRef<string | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const MAX_CONSECUTIVE_FAILURES = 3; // Skip video after this many rapid failures

  // Keep currentVideoRef in sync with currentVideo state
  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  // Playback watchdog - detects when playback stalls after video transition
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlaybackTimeRef = useRef<number>(0);
  const watchdogCheckCountRef = useRef<number>(0);
  const WATCHDOG_CHECK_INTERVAL_MS = 2000; // Check every 2 seconds
  const WATCHDOG_MAX_STALL_CHECKS = 3; // Trigger recovery after 3 consecutive stall detections (6 seconds)

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Initialize Player ID on mount
  useEffect(() => {
    if (!isElectron) return;
    
    const init = async () => {
      try {
        // Check for stored ID first
        const storedId = getPlayerId();
        if (storedId && storedId.trim() !== '' && storedId.trim() !== 'DJAMMS_DEMO') {
          console.log('[PlayerWindow] Using stored Player ID:', storedId);
          setPlayerId(storedId);
          setPlayerIdInitialized(true);
          return;
        }
        
        // No Player ID set or using default - initialize with default and prompt user
        const id = await initializePlayerId();
        setPlayerId(id); // Set the ID (will be "DJAMMS_DEMO" if not set)
        setPlayerIdInitialized(true); // Always set initialized to allow app to continue
        
        // If using default demo ID, show prompt (but app continues)
        if (id === 'DJAMMS_DEMO') {
          console.log('[PlayerWindow] Using default Player ID (DJAMMS_DEMO) - showing prompt to change');
          setNeedsPlayerId(true);
          setShowPlayerIdAlert(true);
          setCurrentTab('settings'); // Auto-switch to Settings tab
        } else {
          console.log('[PlayerWindow] Initialized Player ID:', id);
        }
      } catch (err) {
        console.error('[PlayerWindow] Failed to initialize Player ID:', err);
        // On error, use default and prompt
        setPlayerId(DEFAULT_PLAYER_ID);
        setPlayerIdInitialized(true); // Set initialized even on error
        setNeedsPlayerId(true);
        setShowPlayerIdAlert(true);
        setCurrentTab('settings');
      }
    };
    
    init();
  }, [isElectron]);

  // Supabase integration - listen for remote commands from Web Admin / Kiosk
  // This runs in the main window so commands are received even without Player Window open
  // Initialize Supabase with Player ID (even if it's "DJAMMS_DEMO" - allows app to continue)
  const { isInitialized: supabaseInitialized, isOnline: supabaseOnline, syncState } = useSupabase({
    playerId: playerId && playerId.trim() !== '' ? playerId : DEFAULT_PLAYER_ID, // Pass player ID (use default if not set)
    autoInit: !!(isElectron && playerIdInitialized && playerId && playerId.trim() !== ''), // Initialize if Player ID is set (including DJAMMS_DEMO)
    onPlay: (video?: QueueVideoItem, queueIndex?: number) => {
      console.log('[PlayerWindow] Supabase play command received:', video?.title, 'queueIndex:', queueIndex);
      
      // If queueIndex is provided, play from that position in the queue (click-to-play from Web Admin)
      if (typeof queueIndex === 'number' && queueIndex >= 0) {
        const currentQueue = queueRef.current;
        if (currentQueue && queueIndex < currentQueue.length) {
          const videoToPlay = currentQueue[queueIndex];
          console.log('[PlayerWindow] Playing from queue index:', queueIndex, videoToPlay.title);
          setQueueIndex(queueIndex);
          setCurrentVideo(videoToPlay);
          setIsPlaying(true);
          if (isElectron) {
            (window as any).electronAPI.controlPlayerWindow('play', videoToPlay);
          }
          return;
        }
      }
      
      // If video object is provided, play that specific video
      if (video && video.id) {
        // Convert QueueVideoItem to Video format and play
        const videoToPlay: Video = {
          id: video.id,
          src: video.src,
          title: video.title,
          artist: video.artist,
          path: video.path,
          playlist: video.playlist,
          playlistDisplayName: video.playlistDisplayName,
          duration: video.duration
        };
        setCurrentVideo(videoToPlay);
        setIsPlaying(true);
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('play', videoToPlay);
        }
      } else if (currentVideo) {
        // Resume current video
        setIsPlaying(true);
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('resume');
        }
      }
    },
    onPause: () => {
      console.log('[PlayerWindow] Supabase pause command received');
      setIsPlaying(false);
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('pause');
      }
    },
    onResume: () => {
      console.log('[PlayerWindow] Supabase resume command received');
      setIsPlaying(true);
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('resume');
      }
    },
    onSkip: () => {
      console.log('[PlayerWindow] Supabase skip command received');
      // Send skip command to Player Window - triggers fade-out, then video end
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('skip');
      }
    },
    onSetVolume: (newVolume: number) => {
      console.log('[PlayerWindow] Supabase volume command received:', newVolume);
      setVolume(Math.round(newVolume * 100));
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('setVolume', newVolume);
        (window as any).electronAPI.saveSetting('volume', newVolume);
      }
    },
    onSeekTo: (position: number) => {
      console.log('[PlayerWindow] Supabase seek command received:', position);
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('seekTo', position);
      }
    },
    onQueueAdd: (video: QueueVideoItem, queueType: 'active' | 'priority') => {
      console.log('[PlayerWindow] Supabase queue_add command received:', video.title, queueType);
      const videoToAdd: Video = {
        id: video.id,
        src: video.src,
        title: video.title,
        artist: video.artist,
        path: video.path,
        playlist: video.playlist,
        playlistDisplayName: video.playlistDisplayName,
        duration: video.duration
      };
      if (queueType === 'priority') {
        // Add to separate priority queue (consumed first on skip)
        setPriorityQueue(prev => [...prev, videoToAdd]);
      } else {
        // Add to end of active queue
        setQueue(prev => [...prev, videoToAdd]);
      }
    },
    onQueueShuffle: () => {
      console.log('[PlayerWindow] Supabase queue_shuffle command received');
      setQueue(prev => {
        // Keep the current video at index 0, shuffle the rest
        const currentIdx = queueIndexRef.current;
        const currentVideo = prev[currentIdx];
        const otherVideos = prev.filter((_, idx) => idx !== currentIdx);
        const shuffledOthers = shuffleArray(otherVideos);
        // Put current video at index 0, shuffled rest after
        const newQueue = [currentVideo, ...shuffledOthers];
        setQueueIndex(0); // Current video is now at index 0
        
        // Trigger immediate sync so Web Admin sees the shuffled queue right away
        // We call syncState inside the setter to access the new queue value
        setTimeout(() => {
          syncState({
            activeQueue: newQueue,
            queueIndex: 0
          }, true); // immediate = true to bypass debounce
        }, 0);
        
        return newQueue;
      });
    },
    onLoadPlaylist: (playlistName: string, shuffle?: boolean) => {
      console.log('[PlayerWindow] Supabase load_playlist command received:', playlistName, shuffle);
      // Find the playlist (may have YouTube ID prefix)
      const playlistKey = Object.keys(playlists).find(key => 
        key === playlistName || key.includes(playlistName)
      );
      if (playlistKey && playlists[playlistKey]) {
        const playlistTracks = playlists[playlistKey];
        const shouldShuffle = shuffle ?? settings.autoShufflePlaylists;
        const finalTracks = Array.isArray(playlistTracks)
          ? (shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks])
          : [];
        setActivePlaylist(playlistKey);
        
        // Load playlist into main process queue
        if (isElectron && finalTracks.length > 0) {
          // Clear queue in main process
          (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
          
          // Add all videos to main process queue
          finalTracks.forEach((video) => {
            (window as any).electronAPI.sendQueueCommand?.({ 
              action: 'add_to_queue', 
              payload: { video } 
            });
          });
          
          // Play the first video
          setTimeout(() => {
            (window as any).electronAPI.sendQueueCommand?.({ 
              action: 'play_at_index', 
              payload: { index: 0 } 
            });
          }, 100);
        }
        
        // Update local state (will be synced from main process via queue-state event)
        setQueue(finalTracks);
        setQueueIndex(0);
      }
    },
    onQueueMove: (fromIndex: number, toIndex: number) => {
      console.log('[PlayerWindow] Supabase queue_move command received:', fromIndex, '->', toIndex);
      setQueue(prev => {
        const newQueue = [...prev];
        const currentIdx = queueIndexRef.current;
        
        // Validate indices
        if (fromIndex < 0 || fromIndex >= newQueue.length || toIndex < 0 || toIndex >= newQueue.length) {
          console.warn('[PlayerWindow] Invalid queue move indices');
          return prev;
        }
        
        // Remove item from old position and insert at new position
        const [movedItem] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, movedItem);
        
        // Adjust queueIndex if needed to keep current video playing
        let newQueueIdx = currentIdx;
        if (fromIndex === currentIdx) {
          // Moving the current video
          newQueueIdx = toIndex;
        } else if (fromIndex < currentIdx && toIndex >= currentIdx) {
          // Moving item from before current to after current
          newQueueIdx = currentIdx - 1;
        } else if (fromIndex > currentIdx && toIndex <= currentIdx) {
          // Moving item from after current to before current
          newQueueIdx = currentIdx + 1;
        }
        
        setQueueIndex(newQueueIdx);
        
        // Sync immediately
        setTimeout(() => {
          syncState({ activeQueue: newQueue, queueIndex: newQueueIdx }, true);
        }, 0);
        
        return newQueue;
      });
    },
    onQueueRemove: (videoId: string, queueType: 'active' | 'priority') => {
      console.log('[PlayerWindow] Supabase queue_remove command received:', videoId, queueType);
      
      if (queueType === 'priority') {
        setPriorityQueue(prev => {
          const newQueue = prev.filter(v => v.id !== videoId);
          setTimeout(() => syncState({ priorityQueue: newQueue }, true), 0);
          return newQueue;
        });
      } else {
        setQueue(prev => {
          const currentIdx = queueIndexRef.current;
          const removeIdx = prev.findIndex(v => v.id === videoId);
          
          // Don't remove if it's the currently playing video or not found
          if (removeIdx === -1 || removeIdx === currentIdx) {
            console.warn('[PlayerWindow] Cannot remove: video not found or currently playing');
            return prev;
          }
          
          const newQueue = prev.filter(v => v.id !== videoId);
          
          // Adjust queueIndex if removing item before current
          let newQueueIdx = currentIdx;
          if (removeIdx < currentIdx) {
            newQueueIdx = currentIdx - 1;
            setQueueIndex(newQueueIdx);
          }
          
          setTimeout(() => syncState({ activeQueue: newQueue, queueIndex: newQueueIdx }, true), 0);
          return newQueue;
        });
      }
    }
  });

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const videoPlayer = useVideoPlayer({
    videoRefs: [videoARef, videoBRef],
    crossfadeMode: 'manual', // or from settings
    crossfadeDuration: 2,
    onVideoEnd: () => {/* handle video end */},
    // other config
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

  // Track when indexing is complete (for auto-play logic)
  const indexingCompleteRef = useRef(false);
  
  // Initialize indexingCompleteRef based on whether Supabase is available
  useEffect(() => {
    // If Supabase is not initialized, mark as complete immediately (no indexing needed)
    if (!supabaseInitialized) {
      indexingCompleteRef.current = true;
    }
  }, [supabaseInitialized]);
  
  // Sync music database to Supabase when it becomes initialized and we have playlists
  useEffect(() => {
    if (supabaseInitialized && Object.keys(playlists).length > 0) {
      console.log('[PlayerWindow] Supabase initialized - syncing music database');
      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: 0 });
      indexingCompleteRef.current = false;
      getSupabaseService().indexLocalVideos(
        playlists,
        (current, total) => {
          setProcessingProgress({ current, total });
        }
      ).finally(() => {
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
        indexingCompleteRef.current = true;
        console.log('[PlayerWindow] Playlist indexing complete - ready for playback');
      });
    }
  }, [supabaseInitialized, playlists]);

  /**
   * After Player ID is validated/changed, re-parse playlists and upload search data to Supabase.
   * This ensures Admin/Kiosk search stays in sync with the active player instance.
   */
  useEffect(() => {
    const shouldSync = isElectron && playerIdInitialized && playerId && playerId.trim() !== '';
    if (!shouldSync) return;

    // Avoid re-indexing repeatedly for the same playerId
    if (lastIndexedPlayerIdRef.current === playerId) return;

    lastIndexedPlayerIdRef.current = playerId;

    const reloadAndSync = async () => {
      try {
        // Re-parse playlists from disk
        const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
        setPlaylists(loadedPlaylists || {});
        localSearchService.indexVideos(loadedPlaylists || {});

        // Upload search data to Supabase once we have a client
        if (supabaseInitialized && loadedPlaylists) {
          console.log('[PlayerWindow] Player ID validated - syncing playlists/search to Supabase');
          setIsProcessing(true);
          setProcessingProgress({ current: 0, total: 0 });
          indexingCompleteRef.current = false;
          getSupabaseService().indexLocalVideos(
            loadedPlaylists,
            (current, total) => {
              setProcessingProgress({ current, total });
            }
          ).finally(() => {
            setIsProcessing(false);
            setProcessingProgress({ current: 0, total: 0 });
            indexingCompleteRef.current = true;
            console.log('[PlayerWindow] Playlist indexing complete after Player ID validation');
          });
        } else {
          // If Supabase is not initialized, mark as complete (no indexing needed)
          indexingCompleteRef.current = true;
        }
      } catch (error) {
        console.error('[PlayerWindow] Failed to reload playlists after Player ID validation:', error);
      }
    };

    reloadAndSync();
  }, [isElectron, playerIdInitialized, playerId, supabaseInitialized]);

  // Load playlists and settings on mount
  useEffect(() => {
    // Guard against multiple executions (React Strict Mode or HMR)
    if (hasIndexedRef.current) return;
    
    const loadData = async () => {
      if (isElectron) {
        try {
          hasIndexedRef.current = true; // Mark as indexed BEFORE async operations
          const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
          setPlaylists(loadedPlaylists || {});
          localSearchService.indexVideos(loadedPlaylists || {});
          
          // Check for default playlist name and prompt to change if found
          if (loadedPlaylists) {
            const defaultPlaylistKey = Object.keys(loadedPlaylists).find(name => 
              name.includes('DJAMMS_Default') || name.toLowerCase().includes('djamms default')
            );
            if (defaultPlaylistKey) {
              // Check if user has already been prompted (stored setting)
              const hasBeenPrompted = await (window as any).electronAPI.getSetting('defaultPlaylistPromptShown');
              if (!hasBeenPrompted) {
                console.log('[PlayerWindow] Found default playlist - showing prompt to rename');
                setDefaultPlaylistName(defaultPlaylistKey);
                setShowDefaultPlaylistAlert(true);
                setCurrentTab('search'); // Auto-switch to Search tab (where playlists are shown)
                // Mark as prompted so it only shows once
                await (window as any).electronAPI.setSetting('defaultPlaylistPromptShown', true);
              }
            }
          }
          
          // Note: Supabase sync happens automatically via the useEffect hook when supabaseInitialized becomes true
          
          // Load all saved settings
          const savedVolume = await (window as any).electronAPI.getSetting('volume');
          if (savedVolume !== undefined) setVolume(Math.round(savedVolume * 100));
          
          const savedDisplayId = await (window as any).electronAPI.getSetting('playerDisplayId');
          const savedFullscreen = await (window as any).electronAPI.getSetting('playerWindowFullscreen');
          const savedAutoShuffle = await (window as any).electronAPI.getSetting('autoShufflePlaylists');
          const savedNormalize = await (window as any).electronAPI.getSetting('normalizeAudioLevels');
          const savedEnablePlayer = await (window as any).electronAPI.getSetting('enableFullscreenPlayer');
          const savedFadeDuration = await (window as any).electronAPI.getSetting('fadeDuration');
          const savedCrossfadeMode = await (window as any).electronAPI.getSetting('crossfadeMode');
          const savedPlaylistsDir = await (window as any).electronAPI.getPlaylistsDirectory();
          
          setSettings(s => ({
            ...s,
            playerDisplayId: savedDisplayId ?? s.playerDisplayId,
            playerFullscreen: savedFullscreen ?? s.playerFullscreen,
            autoShufflePlaylists: savedAutoShuffle ?? s.autoShufflePlaylists,
            normalizeAudioLevels: savedNormalize ?? s.normalizeAudioLevels,
            enableFullscreenPlayer: savedEnablePlayer ?? s.enableFullscreenPlayer,
            fadeDuration: savedFadeDuration ?? s.fadeDuration,
            crossfadeMode: savedCrossfadeMode ?? s.crossfadeMode,
            playlistsDirectory: savedPlaylistsDir ?? s.playlistsDirectory
          }));
          
          // Open player window on startup if enabled
          if (savedEnablePlayer && isElectron) {
            setTimeout(async () => {
              try {
                await (window as any).electronAPI.createPlayerWindow(savedDisplayId ?? undefined);
                setPlayerWindowOpen(true);
              } catch (error) {
                console.error('[PlayerWindow] Failed to open player window on startup:', error);
              }
            }, 1000); // Delay to ensure main window is ready
          }
          
          // Load saved overlay settings
          const savedOverlaySettings = await (window as any).electronAPI.getSetting('overlaySettings');
          if (savedOverlaySettings) {
            console.log('[PlayerWindow] Loaded saved overlay settings:', savedOverlaySettings);
            setOverlaySettings(prev => ({ ...prev, ...savedOverlaySettings }));
          }
          
          // Load saved kiosk settings
          const savedKioskSettings = await (window as any).electronAPI.getSetting('kioskSettings');
          if (savedKioskSettings) {
            console.log('[PlayerWindow] Loaded saved kiosk settings:', savedKioskSettings);
            setKioskSettings(prev => ({ ...prev, ...savedKioskSettings }));
          }
          
          // Load saved queue state (active queue, priority queue, queueIndex, currentVideo)
          const savedQueueState = await (window as any).electronAPI.getSetting('savedQueueState');
          if (savedQueueState && savedQueueState.activeQueue && savedQueueState.activeQueue.length > 0) {
            console.log('[PlayerWindow] Restoring saved queue state:', {
              activeQueueLength: savedQueueState.activeQueue.length,
              priorityQueueLength: savedQueueState.priorityQueue?.length || 0,
              queueIndex: savedQueueState.queueIndex,
              currentVideo: savedQueueState.currentVideo?.title
            });
            setQueue(savedQueueState.activeQueue);
            setQueueIndex(savedQueueState.queueIndex || 0);
            setPriorityQueue(savedQueueState.priorityQueue || []);
            if (savedQueueState.currentVideo) {
              setCurrentVideo(savedQueueState.currentVideo);
            }
            if (savedQueueState.activePlaylist) {
              setActivePlaylist(savedQueueState.activePlaylist);
            }
            // Resume playback if it was playing - wait for indexing to complete first
            if (savedQueueState.isPlaying && savedQueueState.currentVideo) {
              // Wait for indexing to complete before starting playback
              waitForIndexingComplete().then(() => {
                console.log('[PlayerWindow] Indexing complete - resuming saved playback');
                setTimeout(() => {
                  (window as any).electronAPI.controlPlayerWindow('play', savedQueueState.currentVideo);
                  setIsPlaying(true);
                }, 500);
              });
            }
          } else {
            // No saved queue - load last active playlist and auto-play
            const savedActivePlaylist = await (window as any).electronAPI.getSetting('activePlaylist');
            const playlistToLoad = savedActivePlaylist || findDefaultPlaylist(loadedPlaylists);
            
            if (playlistToLoad && loadedPlaylists[playlistToLoad]) {
              console.log('[PlayerWindow] Auto-loading playlist:', playlistToLoad);
              setActivePlaylist(playlistToLoad);
              const playlistTracks = loadedPlaylists[playlistToLoad] || [];
              const shouldShuffle = savedAutoShuffle ?? true;
              const finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks];
              
              // Load playlist into main process queue
              if (isElectron && finalTracks.length > 0) {
                // Clear queue in main process
                (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
                
                // Add all videos to main process queue
                finalTracks.forEach((video) => {
                  (window as any).electronAPI.sendQueueCommand?.({ 
                    action: 'add_to_queue', 
                    payload: { video } 
                  });
                });
                
                // Wait for indexing to complete, then start playback
                waitForIndexingComplete().then(() => {
                  console.log('[PlayerWindow] Indexing complete - starting auto-play');
                  // Delay to ensure Player Window is fully loaded and ready to receive IPC
                  // Player Window is created at 500ms, needs time to load and register handlers
                  setTimeout(() => {
                    console.log('[PlayerWindow] Sending initial play command to Player Window');
                    // Mark player as ready since we have a queue loaded
                    if (!playerReadyRef.current) {
                      playerReadyRef.current = true;
                      setPlayerReady(true);
                    }
                    // Play first video via main process orchestrator
                    (window as any).electronAPI.sendQueueCommand?.({ 
                      action: 'play_at_index', 
                      payload: { index: 0 } 
                    });
                  }, 500);
                });
              }
              
              // Update local state (will be synced from main process via queue-state event)
              setQueue(finalTracks);
              setQueueIndex(0);
            }
          }
        } catch (error) {
          console.error('Failed to load data:', error);
          hasIndexedRef.current = false; // Reset on error to allow retry
        }
      } else {
        hasIndexedRef.current = true;
        const webPlaylists = (window as any).__PLAYLISTS__ || {};
        setPlaylists(webPlaylists);
        localSearchService.indexVideos(webPlaylists);
      }
    };
    loadData();
  }, [isElectron]);

  // Save queue state whenever it changes (for persistence across app restarts)
  useEffect(() => {
    if (!isElectron || !playerIdInitialized) return;
    
    const saveQueueState = async () => {
      try {
        const queueState = {
          activeQueue: queue,
          priorityQueue: priorityQueue,
          queueIndex: queueIndex,
          currentVideo: currentVideo,
          activePlaylist: activePlaylist,
          isPlaying: isPlaying
        };
        await (window as any).electronAPI.setSetting('savedQueueState', queueState);
      } catch (error) {
        console.warn('[PlayerWindow] Failed to save queue state:', error);
      }
    };

    // Debounce saves to avoid excessive writes
    const timeoutId = setTimeout(saveQueueState, 1000);
    return () => clearTimeout(timeoutId);
  }, [queue, priorityQueue, queueIndex, currentVideo, activePlaylist, isPlaying, isElectron, playerIdInitialized]);
  
  // Helper function to wait for indexing to complete
  const waitForIndexingComplete = async (maxWaitMs: number = 30000): Promise<boolean> => {
    const startTime = Date.now();
    while (!indexingCompleteRef.current && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }
    return indexingCompleteRef.current;
  };

  // Helper function to find DJAMMS Default playlist
  const findDefaultPlaylist = (playlists: Record<string, Video[]>): string | null => {
    const playlistNames = Object.keys(playlists);
    // Look for playlist containing "DJAMMS_Default" (with or without YouTube ID prefix)
    const defaultPlaylist = playlistNames.find(name => 
      name.includes('DJAMMS_Default') || name.toLowerCase().includes('djamms default')
    );
    // Fallback to first playlist if no default found
    return defaultPlaylist || playlistNames[0] || null;
  };

  // Load available displays
  useEffect(() => {
    const loadDisplays = async () => {
      if (isElectron) {
        try {
          const displays = await (window as any).electronAPI.getDisplays();
          setAvailableDisplays(displays || []);
          
          // Check player window status
          const status = await (window as any).electronAPI.getPlayerWindowStatus();
          setPlayerWindowOpen(status?.isOpen || false);
        } catch (error) {
          console.error('Failed to load displays:', error);
        }
      }
    };
    loadDisplays();
  }, [isElectron]);

  // Listen for player window closed/opened events
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    
    const unsubPlayerClosed = api.onPlayerWindowClosed?.(() => {
      setPlayerWindowOpen(false);
    });
    
    // Listen for player window opened event
    const handlePlayerOpened = () => {
      setPlayerWindowOpen(true);
    };
    const unsubPlayerOpened = api.onPlayerWindowOpened?.(handlePlayerOpened);
    
    return () => {
      unsubPlayerClosed?.();
      unsubPlayerOpened?.();
    };
  }, [isElectron]);

  // Set up Electron IPC listeners
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;

    const unsubToggle = api.onTogglePlayback(() => {
      if (isPlaying) handlePauseClick();
      else handleResumePlayback();
    });
    const unsubSkip = api.onSkipVideo(() => skipTrack());
    const unsubDebugSkip = api.onDebugSkipToEnd?.(() => {
      // Debug feature: seek to 15 seconds before end of video to test crossfade
      console.log('[PlayerWindow] Debug skip to end triggered (Shift+>)');
      if (isElectron && playerReady) {
        (window as any).electronAPI.controlPlayerWindow('debugSkipToEnd');
      }
    });
    const unsubVolumeUp = api.onVolumeUp(() => setVolume(v => Math.min(100, v + 10)));
    const unsubVolumeDown = api.onVolumeDown(() => setVolume(v => Math.max(0, v - 10)));
    const unsubPlaylistDir = api.onPlaylistsDirectoryChanged(async (newPath: string) => {
      console.log('[PlayerWindow] Playlists directory changed to:', newPath);
      const { playlists: newPlaylists } = await api.getPlaylists();
      setPlaylists(newPlaylists || {});
      localSearchService.indexVideos(newPlaylists || {});
      // Sync entire music database to Supabase for Web Admin/Kiosk
      if (supabaseInitialized) {
        console.log('[PlayerWindow] Syncing music database to Supabase after directory change (IPC)');
        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: 0 });
        getSupabaseService().indexLocalVideos(
          newPlaylists || {},
          (current, total) => {
            setProcessingProgress({ current, total });
          }
        ).finally(() => {
          setIsProcessing(false);
          setProcessingProgress({ current: 0, total: 0 });
        });
      }
      // Update settings state
      setSettings(s => ({ ...s, playlistsDirectory: newPath }));
    });

    return () => {
      unsubToggle?.();
      unsubSkip?.();
      unsubDebugSkip?.();
      unsubVolumeUp?.();
      unsubVolumeDown?.();
      unsubPlaylistDir?.();
    };
  }, [isElectron, isPlaying, playerReady]);

  // Player control functions
  const handlePauseClick = () => {
    if (!playerReady) return; // Ignore until player is ready
    if (isPlaying) {
      setShowPauseDialog(true);
    } else {
      handleResumePlayback();
    }
  };

  const confirmPause = () => {
    setIsPlaying(false);
    if (isElectron) {
      (window as any).electronAPI.controlPlayerWindow('pause');
    }
    setShowPauseDialog(false);
    setCurrentTab('queue'); // Auto-switch to Queue tab
  };

  const handleResumePlayback = () => {
    if (currentVideo) {
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('resume');
      }
      setIsPlaying(true);
      setCurrentTab('queue'); // Auto-switch to Queue tab
    } else if (queue.length > 0) {
      playVideoAtIndex(0);
      setCurrentTab('queue'); // Auto-switch to Queue tab
    }
  };

  // Send skip command to Player Window - triggers fade-out, then video end
  const sendSkipCommand = useCallback(() => {
    console.log('[PlayerWindow] Sending skip command to Player Window');
    if (isElectron) {
      (window as any).electronAPI.controlPlayerWindow('skip');
    }
    setCurrentTab('queue'); // Auto-switch to Queue tab
  }, [isElectron]);

  const skipTrack = () => {
    if (!playerReady) return; // Ignore until player is ready
    
    // If current video is from priority queue, show confirmation dialog
    if (isFromPriorityQueue) {
      setShowSkipConfirmDialog(true);
      return;
    }
    
    // Send skip command - Player Window will fade out, then trigger onVideoEnd
    sendSkipCommand();
  };
  
  // Actually perform the skip (called after confirmation or directly if not priority)
  const confirmSkip = () => {
    setShowSkipConfirmDialog(false);
    // Send skip command - Player Window will fade out, then trigger onVideoEnd
    sendSkipCommand();
  };

  const playNext = () => {
    playNextVideo();
  };

  // Send play command to Player Window (the ONLY player - handles all audio/video)
  const sendPlayCommand = useCallback((video: Video) => {
    if (isElectron) {
      (window as any).electronAPI.controlPlayerWindow('play', video);
    }
  }, [isElectron]);

  // Request next video from main orchestrator (source of truth)
  const playNextVideo = useCallback(() => {
    // DEBOUNCE: Prevent rapid-fire calls
    const now = Date.now();
    const timeSinceLastCall = now - lastPlayNextTimeRef.current;
    if (timeSinceLastCall < 500) {
      console.warn('[PlayerWindow] playNextVideo debounced - too soon (' + timeSinceLastCall + 'ms since last call)');
      return;
    }
    lastPlayNextTimeRef.current = now;
    
    console.log('[PlayerWindow] 🎬 Requesting next video from orchestrator');
    
    // Reset watchdog state since we're initiating a new video
    watchdogCheckCountRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    
    // Send IPC command to main orchestrator - it will handle queue rotation and broadcast state
    if (isElectron) {
      (window as any).electronAPI.sendQueueCommand?.({ action: 'next' });
    }
  }, [isElectron]);

  const toggleShuffle = () => {
    if (!playerReady || !isElectron) return;
    // Request main orchestrator to shuffle queue - it will broadcast updated state
    (window as any).electronAPI.sendQueueCommand?.({ action: 'shuffle_queue', payload: { keepFirst: true } });
    setCurrentTab('queue'); // Auto-switch to Queue tab
  };

  const playVideoAtIndex = useCallback((index: number) => {
    // Request main orchestrator to play at index - it will broadcast state update
    if (isElectron) {
      (window as any).electronAPI.sendQueueCommand?.({ action: 'play_at_index', payload: { index } });
    }
  }, [isElectron]);

  // Show confirmation dialog before playing from queue
  const handleQueueItemClick = useCallback((index: number) => {
    if (!playerReady) return; // Ignore until player is ready
    const video = queue[index];
    if (video) {
      setQueueVideoToPlay({ video, index });
      setShowQueuePlayDialog(true);
    }
  }, [queue, playerReady]);

  // Confirm and play the selected queue video
  const confirmQueuePlay = useCallback(() => {
    if (queueVideoToPlay && isElectron) {
      // Request main orchestrator to play at index - it will handle queue reordering and broadcast state
      (window as any).electronAPI.sendQueueCommand?.({ action: 'play_at_index', payload: { index: queueVideoToPlay.index } });
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
      // Trigger skip (fade-out) if different video
      if (queueVideoToPlay.video.id !== currentVideo?.id) {
        videoPlayer.skip();
      }
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, queue, currentVideo, videoPlayer]);

  // Move selected queue video to play next (position after current)
  const moveQueueVideoToNext = useCallback(() => {
    if (queueVideoToPlay && isElectron) {
      // Request main orchestrator to move video - it will broadcast updated state
      (window as any).electronAPI.sendQueueCommand?.({ 
        action: 'move_queue_item', 
        payload: { fromIndex: queueVideoToPlay.index, toIndex: queueIndex + 1 } 
      });
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, queueIndex, isElectron]);

  // Remove selected video from queue
  const removeQueueVideo = useCallback(() => {
    if (queueVideoToPlay && isElectron) {
      // Request main orchestrator to remove video - it will broadcast updated state
      (window as any).electronAPI.sendQueueCommand?.({ 
        action: 'remove_from_queue', 
        payload: { index: queueVideoToPlay.index } 
      });
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, isElectron]);

  // Playlist functions
  const handlePlaylistClick = (playlistName: string) => {
    setSelectedPlaylist(playlistName);
    setCurrentTab('search');
    setSearchScope('playlist'); // Filter by selected playlist
    setSearchLimit(100); // Reset pagination
  };

  const handlePlayButtonClick = (e: React.MouseEvent, playlistName: string) => {
    e.stopPropagation();
    setPlaylistToLoad(playlistName);
    setShowLoadDialog(true);
  };

  const confirmLoadPlaylist = () => {
    if (playlistToLoad) {
      setActivePlaylist(playlistToLoad);
      setSelectedPlaylist(null);
      const playlistTracks = playlists[playlistToLoad] || [];
      const finalTracks = Array.isArray(playlistTracks)
        ? (settings.autoShufflePlaylists ? shuffleArray(playlistTracks) : [...playlistTracks])
        : [];
      
      // Clear the main process queue first, then add all videos
      if (isElectron && finalTracks.length > 0) {
        // Clear queue in main process
        (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
        
        // Add all videos to main process queue
        finalTracks.forEach((video) => {
          (window as any).electronAPI.sendQueueCommand?.({ 
            action: 'add_to_queue', 
            payload: { video } 
          });
        });
        
        // Play the first video
        setTimeout(() => {
          (window as any).electronAPI.sendQueueCommand?.({ 
            action: 'play_at_index', 
            payload: { index: 0 } 
          });
        }, 100);
      }
      
      // Update local state (will be synced from main process via queue-state event)
      setQueue(finalTracks);
      setQueueIndex(0);
      
      // Save active playlist to persist between sessions
      if (isElectron) {
        (window as any).electronAPI.setSetting('activePlaylist', playlistToLoad);
      }
    }
    setShowLoadDialog(false);
    setPlaylistToLoad(null);
  };

  const handleTabChange = (tab: TabId) => {
    // If leaving Search tab while a playlist is selected, clear the selection
    if (currentTab === 'search' && tab !== 'search' && selectedPlaylist) {
      setSelectedPlaylist(null);
      setSearchScope('all'); // Reset to default filter
    }
    // If clicking Search tab directly (not from playlist click), reset to defaults
    if (tab === 'search' && currentTab !== 'search') {
      setSearchQuery(''); // Clear search text
      setSearchScope('all'); // Default filter
      setSearchSort('artist'); // Default sort
      setSelectedPlaylist(null); // Clear any selected playlist
      setSearchLimit(100); // Reset pagination
    }
    setCurrentTab(tab);
  };

  const handleScopeChange = (scope: string) => {
    setSearchScope(scope);
    setSearchLimit(100); // Reset pagination when filter changes
    if (scope !== 'playlist') setSelectedPlaylist(null);
  };

  // Filtering and sorting (memoized callbacks for use in useMemo)
  const filterByScope = useCallback((videos: Video[], scope: string): Video[] => {
    // Helper to check if a video contains 'karaoke' in title, filename, or playlist
    const isKaraoke = (v: Video): boolean => {
      const title = v.title?.toLowerCase() || '';
      const path = (v.path || v.src || '').toLowerCase();
      const playlist = v.playlist?.toLowerCase() || '';
      return title.includes('karaoke') || path.includes('karaoke') || playlist.includes('karaoke');
    };
    
    switch (scope) {
      case 'all': return videos;
      case 'no-karaoke': return videos.filter(v => !isKaraoke(v));
      case 'karaoke': return videos.filter(v => isKaraoke(v));
      case 'queue': return queue;
      case 'playlist':
        if (!selectedPlaylist) return [];
        return Array.isArray(playlists[selectedPlaylist]) ? playlists[selectedPlaylist] : [];
      default: return videos;
    }
  }, [queue, selectedPlaylist, playlists]);

  const sortResults = useCallback((results: Video[], sortBy: string): Video[] => {
    const sorted = [...results];
    switch (sortBy) {
      case 'artist': return sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      case 'title':
      case 'az': return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'playlist': return sorted.sort((a, b) => (a.playlist || '').localeCompare(b.playlist || ''));
      default: return sorted;
    }
  }, []);

  // Memoize getAllVideos to avoid recomputing on every render (for local fallback)
  const allVideos = useMemo((): Video[] => {
    const videos = Object.values(playlists).flat();
    // Deduplicate by path (or title+artist if path is not available)
    const seen = new Set<string>();
    return videos.filter(video => {
      const key = video.path || video.src || `${video.title}|${video.artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playlists]);

  // Search effect - calls Supabase PostgreSQL full-text search (or browse when query empty)
  useEffect(() => {
    const supabase = getSupabaseService();
    
    // For playlist scope, always use local data since we have it in memory
    if (searchScope === 'playlist') {
      if (!selectedPlaylist) {
        setSearchResults([]);
        setSearchTotalCount(0);
        return;
      }
      let results = playlists[selectedPlaylist] || [];
      if (searchQuery.trim()) {
        results = results.filter(video =>
          video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      setSearchResults(sortResults(results, searchSort));
      setSearchTotalCount(results.length);
      return;
    }
    
    if (!supabase.initialized) {
      // Fallback to local search/browse if Supabase not ready
      let results = filterByScope(allVideos, searchScope);
      if (searchQuery.trim()) {
        results = results.filter(video =>
          video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      setSearchResults(sortResults(results, searchSort));
      setSearchTotalCount(results.length);
      return;
    }

    // Debounce search/browse requests
    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Map UI sort values to database sort values
        const dbSortBy = searchSort === 'az' ? 'title' : searchSort;
        
        let results: Video[];
        if (searchQuery.trim()) {
          // Search mode - use full-text search
          results = await supabase.searchVideos(searchQuery, searchScope, searchLimit, 0);
          // Apply local sorting to search results
          results = sortResults(results, searchSort);
        } else {
          // Browse mode - show all videos sorted
          results = await supabase.browseVideos(searchScope, dbSortBy, 'asc', searchLimit, 0);
        }
        if (Array.isArray(results)) {
          setSearchResults(sortResults(results, searchSort));
          setSearchTotalCount(results.length);
        } else {
          setSearchResults([]);
          setSearchTotalCount(0);
        }
      } catch (error) {
        console.error('[PlayerWindow] Search error:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchScope, searchSort, searchLimit, selectedPlaylist, playlists, allVideos, filterByScope, sortResults]);

  // Keep these functions for compatibility
  const getAllVideos = (): Video[] => allVideos;
  const getSearchResults = (): Video[] => searchResults;

  // Queue management via IPC (main orchestrator is source of truth)
  const handleClearQueue = () => {
    if (!isElectron) return;
    (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
  };

  const handleAddToQueue = (video: Video) => {
    if (!isElectron) return;
    (window as any).electronAPI.sendQueueCommand?.({ action: 'add_to_queue', payload: { video } });
  };

  // Video click handler for search - opens popover to add to priority queue
  const handleVideoClick = useCallback((video: Video, event: React.MouseEvent) => {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({ x: event.clientX, y: event.clientY });
  }, []);

  // Add video to priority queue (from popover)
  const handleAddToPriorityQueue = useCallback(() => {
    if (!popoverVideo) return;
    setPriorityQueue(prev => [...prev, popoverVideo]);
    // Sync to Supabase
    syncState({
      priorityQueue: [...priorityQueue, popoverVideo]
    }, true);
    setPopoverVideo(null);
  }, [popoverVideo, priorityQueue, syncState]);

  const handleClosePopover = useCallback(() => {
    setPopoverVideo(null);
  }, []);

  // Settings
  const handleUpdateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (isElectron) {
      (window as any).electronAPI.setSetting(key, value);
    }
  };

  // Video end handler - called when Player Window notifies us video ended
  // Uses refs to avoid stale closure issues with IPC listener
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const priorityQueueRef = useRef(priorityQueue);
  
  // Keep refs in sync with state
  useEffect(() => {
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    priorityQueueRef.current = priorityQueue;
  }, [queue, queueIndex, priorityQueue]);

  // Calculate the next video that will play (for preloading)
  // Priority queue takes precedence, then active queue at next index
  const nextVideoToPreload = useMemo((): Video | null => {
    // If priority queue has items, that's what plays next
    if (priorityQueue.length > 0) {
      return priorityQueue[0];
    }
    // Otherwise, next in active queue
    if (queue.length > 0) {
      const nextIndex = queueIndex < queue.length - 1 ? queueIndex + 1 : 0;
      return queue[nextIndex];
    }
    return null;
  }, [priorityQueue, queue, queueIndex]);

  // Preload the next video when it changes (after current video starts playing)
  // This maintains a single queue buffer (up-next video) for smoother playback
  useEffect(() => {
    if (!nextVideoToPreload || !isElectron) return;
    
    // Only preload if we have a current video playing or about to play
    // This prevents unnecessary preloads when queue is empty
    if (!currentVideo && !isPlaying) return;
    
    // Small delay to let current video start loading first (if playing)
    // If not playing yet, preload immediately
    const delay = isPlaying ? 1000 : 100;
    const preloadTimer = setTimeout(() => {
      console.log('[PlayerWindow] 📥 Preloading next video:', nextVideoToPreload.title);
      try {
        (window as any).electronAPI.controlPlayerWindow('preload', nextVideoToPreload);
      } catch (error) {
        console.warn('[PlayerWindow] Preload failed:', error);
      }
    }, delay);
    
    return () => clearTimeout(preloadTimer);
  }, [nextVideoToPreload, isElectron, isPlaying, currentVideo]); // Re-preload when any of these change

  const handleVideoEnd = useCallback(() => {
    console.log('[PlayerWindow] Video ended - calling playNextVideo');
    // Use unified playNextVideo which checks priority queue first
    playNextVideo();
    // Note: Preloading of next video is handled automatically by the useEffect
    // that watches nextVideoToPreload, which updates when queue advances
  }, [playNextVideo]);

  // Set up IPC listener to receive video end events from Player Window
  useEffect(() => {
    if (!isElectron) return;
    
    // Listen for video end events from Player Window
    const unsubscribeVideoEnd = (window as any).electronAPI.onRequestNextVideo?.(() => {
      handleVideoEnd();
    });

    // Listen for playback state updates from Player Window
    const unsubscribePlaybackState = (window as any).electronAPI.onPlaybackStateSync?.((state: any) => {
      if (state) {
        if (typeof state.isPlaying === 'boolean') {
          setIsPlaying(state.isPlaying);
          // Mark player as ready once Player Window responds with playback state
          // This means the Player Window is loaded and communicating
          if (!playerReadyRef.current) {
            console.log('[PlayerWindow] Player Window is responding - marking ready');
            playerReadyRef.current = true;
            setPlayerReady(true);
          }
        }
        // Track playback time and duration for progress display
        if (typeof state.currentTime === 'number') {
          setPlaybackTime(state.currentTime);
        }
        if (typeof state.duration === 'number') {
          setPlaybackDuration(state.duration);
        }
      }
    });

    return () => {
      if (unsubscribeVideoEnd) unsubscribeVideoEnd();
      if (unsubscribePlaybackState) unsubscribePlaybackState();
    };
  }, [isElectron, handleVideoEnd]);

  // PLAYBACK WATCHDOG: Monitor player state and recover from stalled playback
  // This detects when the player is supposed to be playing but playback time isn't advancing
  useEffect(() => {
    if (!isElectron || !playerReady) return;

    // Clear any existing watchdog timer
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    // Start watchdog monitoring
    watchdogTimerRef.current = setInterval(() => {
      // Only monitor when we expect playback to be happening
      if (!isPlaying || !currentVideo) {
        watchdogCheckCountRef.current = 0;
        lastPlaybackTimeRef.current = 0;
        return;
      }

      const currentPlaybackTime = playbackTime;
      const currentDuration = playbackDuration;
      
      // Check if playback time is advancing
      const isTimeAdvancing = currentPlaybackTime > lastPlaybackTimeRef.current;
      const isNearEnd = currentDuration > 0 && currentPlaybackTime >= (currentDuration - 0.5);
      const isAtStart = currentPlaybackTime < 1; // First second - give it time to start
      
      console.log(`[Watchdog] Check: isPlaying=${isPlaying}, time=${currentPlaybackTime.toFixed(1)}s, lastTime=${lastPlaybackTimeRef.current.toFixed(1)}s, advancing=${isTimeAdvancing}, nearEnd=${isNearEnd}`);
      
      if (!isTimeAdvancing && !isNearEnd && !isAtStart && currentPlaybackTime > 0) {
        // Playback appears stalled
        watchdogCheckCountRef.current++;
        console.warn(`[Watchdog] ⚠️ Playback stalled - check ${watchdogCheckCountRef.current}/${WATCHDOG_MAX_STALL_CHECKS}`);
        
        if (watchdogCheckCountRef.current >= WATCHDOG_MAX_STALL_CHECKS) {
          console.error('[Watchdog] 🚨 PLAYBACK STALL DETECTED - Triggering recovery skip!');
          console.error(`[Watchdog] Current video: ${currentVideo?.title}, time stuck at: ${currentPlaybackTime.toFixed(1)}s`);
          
          // Reset watchdog state
          watchdogCheckCountRef.current = 0;
          lastPlaybackTimeRef.current = 0;
          
          // Force skip to next video (bypass normal debounce)
          lastPlayNextTimeRef.current = 0; // Clear debounce
          playNextVideo();
        }
      } else {
        // Playback is progressing normally - reset stall counter
        if (watchdogCheckCountRef.current > 0) {
          console.log('[Watchdog] ✅ Playback resumed, resetting stall counter');
        }
        watchdogCheckCountRef.current = 0;
        lastPlaybackTimeRef.current = currentPlaybackTime;
      }
    }, WATCHDOG_CHECK_INTERVAL_MS);

    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [isElectron, playerReady, isPlaying, currentVideo, playbackTime, playbackDuration, playNextVideo]);

  // Subscribe to authoritative queue state from main orchestrator
  useEffect(() => {
    if (!isElectron) return;
    
    let previousVideoId: string | null = null;
    
    const unsubscribe = (window as any).electronAPI.onQueueState?.((state: any) => {
      if (state) {
        // Update local state from authoritative main process state
        if (state.activeQueue) {
          setQueue(state.activeQueue);
          queueRef.current = state.activeQueue;
        }
        if (state.priorityQueue) {
          setPriorityQueue(state.priorityQueue);
          priorityQueueRef.current = state.priorityQueue;
        }
        if (typeof state.queueIndex === 'number') {
          setQueueIndex(state.queueIndex);
          queueIndexRef.current = state.queueIndex;
        }
        
        // Handle current video change - send play command if video changed
        if (state.currentVideo || state.nowPlaying) {
          const newVideo = state.currentVideo || state.nowPlaying;
          const newVideoId = newVideo.id || newVideo.src;
          
          if (newVideoId !== previousVideoId) {
            console.log('[PlayerWindow] Queue state update - new video:', newVideo.title);
            setCurrentVideo(newVideo);
            currentVideoRef.current = newVideo;
            previousVideoId = newVideoId;
            
            // Send play command if video changed and is playing
            if (state.isPlaying && newVideo) {
              sendPlayCommand(newVideo);
            }
            
            // Update refs for debounce checks
            lastPlayedVideoIdRef.current = newVideoId;
            consecutiveFailuresRef.current = 0; // Reset failure count on new video
          }
        } else {
          // No video playing
          setCurrentVideo(null);
          currentVideoRef.current = null;
          previousVideoId = null;
        }
        
        if (typeof state.isPlaying === 'boolean') setIsPlaying(state.isPlaying);
        if (state.nowPlayingSource) setIsFromPriorityQueue(state.nowPlayingSource === 'priority');
      }
    });
    
    // Request initial state
    (window as any).electronAPI.getQueueState?.().then((state: any) => {
      if (state) {
        if (state.activeQueue) {
          setQueue(state.activeQueue);
          queueRef.current = state.activeQueue;
        }
        if (state.priorityQueue) {
          setPriorityQueue(state.priorityQueue);
          priorityQueueRef.current = state.priorityQueue;
        }
        if (typeof state.queueIndex === 'number') {
          setQueueIndex(state.queueIndex);
          queueIndexRef.current = state.queueIndex;
        }
        if (state.currentVideo || state.nowPlaying) {
          const video = state.currentVideo || state.nowPlaying;
          setCurrentVideo(video);
          currentVideoRef.current = video;
          previousVideoId = video.id || video.src;
          if (state.isPlaying) {
            sendPlayCommand(video);
          }
        }
        if (typeof state.isPlaying === 'boolean') setIsPlaying(state.isPlaying);
        if (state.nowPlayingSource) setIsFromPriorityQueue(state.nowPlayingSource === 'priority');
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isElectron, sendPlayCommand]);

  // Sync overlay settings to Player Window when they change
  useEffect(() => {
    if (!isElectron) return;
    
    console.log('[PlayerWindow] Sending overlay settings to player window:', overlaySettings);
    (window as any).electronAPI.controlPlayerWindow('updateOverlaySettings', overlaySettings);
    
    // Save overlay settings to persistent storage
    (window as any).electronAPI.setSetting('overlaySettings', overlaySettings);
  }, [isElectron, overlaySettings]);

  // Save kiosk settings when they change
  useEffect(() => {
    if (!isElectron) return;
    
    console.log('[PlayerWindow] Saving kiosk settings:', kioskSettings);
    (window as any).electronAPI.setSetting('kioskSettings', kioskSettings);
  }, [isElectron, kioskSettings]);

  // Sync player state to Supabase when it changes
  // This ensures Web Admin / Kiosk see up-to-date state
  useEffect(() => {
    if (!supabaseInitialized) return;
    
    syncState({
      status: isPlaying ? 'playing' : 'paused',
      isPlaying,
      currentVideo,
      volume: volume / 100,
      activeQueue: queue,
      priorityQueue,
      queueIndex
    });
  }, [supabaseInitialized, isPlaying, currentVideo, volume, queue, priorityQueue, queueIndex, syncState]);

  // Tools handlers
  const handleOpenFullscreen = useCallback(async () => {
    if (!isElectron) return;
    try {
      const displays = await (window as any).electronAPI.getDisplays();
      if (displays.length > 1) {
        await (window as any).electronAPI.createFullscreenWindow(displays[1].id);
      }
    } catch (error) {
      console.error('Failed to open fullscreen:', error);
    }
  }, [isElectron]);

  const handleRefreshPlaylists = useCallback(async () => {
    if (isElectron) {
      const { playlists: newPlaylists } = await (window as any).electronAPI.getPlaylists();
      setPlaylists(newPlaylists || {});
      localSearchService.indexVideos(newPlaylists || {});
      // Sync entire music database to Supabase for Web Admin/Kiosk
      if (supabaseInitialized) {
        console.log('[PlayerWindow] Syncing music database to Supabase after manual refresh');
        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: 0 });
        getSupabaseService().indexLocalVideos(
          newPlaylists || {},
          (current, total) => {
            setProcessingProgress({ current, total });
          },
          true // forceIndex = true for manual refresh
        ).finally(() => {
          setIsProcessing(false);
          setProcessingProgress({ current: 0, total: 0 });
        });
      }
    }
  }, [isElectron, supabaseInitialized]);

  const handleReindexMusicDatabase = useCallback(async () => {
    if (isElectron && supabaseInitialized) {
      console.log('[PlayerWindow] Manual re-index of music database requested');
      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: 0 });
      getSupabaseService().indexLocalVideos(
        playlists,
        (current, total) => {
          setProcessingProgress({ current, total });
        },
        true // forceIndex = true for manual re-index
      ).finally(() => {
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
      });
    }
  }, [isElectron, supabaseInitialized, playlists]);

  // Reset Application handler
  const handleResetApplication = useCallback(async () => {
    if (!isElectron) return;
    
    try {
      setShowResetDialog(false);
      
      // Reset all settings to defaults
      const defaultSettings = {
        volume: 0.7,
        muted: false,
        playerDisplayId: null,
        playerWindowFullscreen: false,
        autoShufflePlaylists: true,
        normalizeAudioLevels: false,
        enableFullscreenPlayer: true,
        fadeDuration: 3,
        crossfadeMode: 'manual',
        overlaySettings: {
          showNowPlaying: true,
          showUpcoming: true,
          showWatermark: false,
          watermarkText: '',
          watermarkImage: '',
          watermarkSize: 50,
          watermarkX: 90,
          watermarkY: 90,
          watermarkOpacity: 50
        },
        kioskSettings: {
          mode: 'freeplay',
          uiMode: 'classic',
          searchAllMusic: true,
          searchYoutube: false
        },
        activePlaylist: null,
        savedQueueState: null
      };

      // Reset Player ID to default (DJAMMS_DEMO) instead of clearing
      setPlayerId(DEFAULT_PLAYER_ID);
      storePlayerId(DEFAULT_PLAYER_ID);
      storePlayerId(DEFAULT_PLAYER_ID);
      setPlayerId('');
      
      // Reset all settings via IPC
      for (const [key, value] of Object.entries(defaultSettings)) {
        await (window as any).electronAPI.setSetting(key, value);
      }

      // Clear queue state
      setQueue([]);
      setQueueIndex(0);
      setPriorityQueue([]);
      setCurrentVideo(null);
      setIsPlaying(false);
      setActivePlaylist('');

      // Reset local state
      setSettings({
        autoShufflePlaylists: true,
        normalizeAudioLevels: false,
        enableFullscreenPlayer: true,
        fadeDuration: 3,
        crossfadeMode: 'manual',
        playerDisplayId: null,
        playerFullscreen: false,
        playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
      });

      // Delete player profile from Supabase if connected
      if (supabaseInitialized && playerId) {
        try {
          const supabaseService = getSupabaseService();
          const client = supabaseService.getClient();
          if (client) {
            // Delete player_state row
            await client.from('player_state').delete().eq('player_id', playerId);
            console.log('[PlayerWindow] Deleted player profile from Supabase');
          }
        } catch (err) {
          console.warn('[PlayerWindow] Failed to delete player profile from Supabase:', err);
        }
      }

      // Restart application
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('[PlayerWindow] Failed to reset application:', error);
    }
  }, [isElectron, supabaseInitialized, playerId]);

  // Get playlist counts with display names (strips YouTube Playlist ID prefix)
  const getPlaylistList = () => {
    return Object.entries(playlists).map(([name, videos]) => ({
      name,
      displayName: getPlaylistDisplayName(name),
      count: Array.isArray(videos) ? videos.length : 0
    }));
  };

  // Get display name for active playlist
  const activePlaylistDisplayName = activePlaylist ? getPlaylistDisplayName(activePlaylist) : 'None';
  
  // Get display name for playlist to load in dialog
  const playlistToLoadDisplayName = playlistToLoad ? getPlaylistDisplayName(playlistToLoad) : '';

  const currentTrack = currentVideo;

  return (
    <div className={`app ${className}`}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      
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

      {/* Skip Priority Queue Video Confirmation Dialog */}
      {showSkipConfirmDialog && (
        <div className="dialog-overlay" onClick={() => setShowSkipConfirmDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h3>Now playing from Priority Queue</h3>
            <p>Do you really want to skip this requested song?</p>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn-warning" onClick={confirmSkip}>SKIP</button>
              <button className="dialog-btn" onClick={() => setShowSkipConfirmDialog(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Video Click Popover - Add to Priority Queue */}
      {popoverVideo && (
        <div 
          className="video-popover"
          style={{
            position: 'fixed',
            left: Math.min(popoverPosition.x, window.innerWidth - 320),
            top: Math.min(popoverPosition.y, window.innerHeight - 150),
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="popover-content">
            <div className="popover-title">
              {getDisplayArtist(popoverVideo.artist) 
                ? `${getDisplayArtist(popoverVideo.artist)} - ${cleanVideoTitle(popoverVideo.title)}` 
                : cleanVideoTitle(popoverVideo.title)}
            </div>
            <div className="popover-subtitle">Add to Priority Queue?</div>
          </div>
          <div className="popover-actions">
            <button className="popover-btn popover-btn-cancel" onClick={handleClosePopover}>Cancel</button>
            <button className="popover-btn popover-btn-primary" onClick={handleAddToPriorityQueue}>Add to Priority Queue</button>
          </div>
        </div>
      )}
      {popoverVideo && <div className="popover-backdrop" onClick={handleClosePopover} />}
      
      {/* Fixed Top Header */}
      <header className="top-header">
        <div className="header-left">
          <img src="/icon.png" alt="DJAMMS" className="app-logo" style={{ height: '40px', width: 'auto' }} />
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
              <div className="track-title">{cleanVideoTitle(currentTrack?.title ?? '') || 'No track playing'}</div>
              <div className="track-artist">{getDisplayArtist(currentTrack?.artist) || '—'}</div>
            </div>
          </div>
        </div>
        
        <div className="header-right">
          <div className="player-controls">
            <button className={`control-btn control-btn-large ${!playerReady ? 'disabled' : ''}`} onClick={skipTrack} disabled={!playerReady}>
              <span className="control-btn-label">SKIP</span>
            </button>
            <button className={`control-btn control-btn-large ${!playerReady ? 'disabled' : ''}`} onClick={toggleShuffle} disabled={!playerReady}>
              <span className="control-btn-label">SHUFFLE</span>
            </button>
            <button className={`control-btn play-btn ${!playerReady ? 'disabled' : ''}`} onClick={handlePauseClick} disabled={!playerReady}>
              <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <div className="volume-control">
              <span className="material-symbols-rounded">volume_up</span>
              <input 
                type="range" 
                value={volume} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const newVolume = Number(e.target.value);
                  setVolume(newVolume);
                  // Send volume to Player Window (the ONLY player)
                  if (isElectron) {
                    (window as any).electronAPI.controlPlayerWindow('setVolume', newVolume / 100);
                    (window as any).electronAPI.setSetting('volume', newVolume / 100);
                  }
                }} 
                min="0" 
                max="100" 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Priority Queue Bar */}
      <div className="priority-queue-bar">
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
                {getPlaylistList().map(playlist => (
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
                ))}
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
              </div>
              <div className="table-container">
                {/* Now Playing Section */}
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
                        <div className="now-playing-playlist">{currentVideo.playlistDisplayName || getPlaylistDisplayName(currentVideo.playlist || '')}</div>
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
                            <td>{formatDuration(track.duration)}</td>
                            <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Active Queue Section - Reordered: "Up Next" first, then "Already Played" */}
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
                      {queue.length === 0 ? (
                        <tr className="empty-state">
                          <td colSpan={5}>Queue is empty. Add tracks from Search.</td>
                        </tr>
                      ) : (() => {
                        // Reorder: videos after current index first ("up next"), then videos before ("already played")
                        const upNextVideos = queue.slice(queueIndex + 1).map((track, idx) => ({
                          track,
                          originalIndex: queueIndex + 1 + idx,
                          isUpNext: true
                        }));
                        const alreadyPlayedVideos = queue.slice(0, queueIndex).map((track, idx) => ({
                          track,
                          originalIndex: idx,
                          isUpNext: false
                        }));
                        const reorderedQueue = [...upNextVideos, ...alreadyPlayedVideos];
                        
                        if (reorderedQueue.length === 0) {
                          return (
                            <tr className="empty-state">
                              <td colSpan={5}>No more tracks in queue.</td>
                            </tr>
                          );
                        }
                        
                        return reorderedQueue.map(({ track, originalIndex, isUpNext }, displayIndex) => (
                          <tr
                            key={`queue-${track.id}-${originalIndex}`}
                            className={!isUpNext ? 'played' : ''}
                            onClick={() => handleQueueItemClick(originalIndex)}
                          >
                            <td>{displayIndex + 1}</td>
                            <td className="col-title">{cleanVideoTitle(track.title)}</td>
                            <td>{getDisplayArtist(track.artist)}</td>
                            <td>{formatDuration(track.duration)}</td>
                            <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                          </tr>
                        ));
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
                  {searchLoading && <span className="material-symbols-rounded loading-icon" style={{ marginLeft: '8px', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
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
                    className={`radio-btn ${searchSort === 'artist' ? 'active' : ''}`}
                    onClick={() => setSearchSort('artist')}
                  >
                    Artist
                  </button>
                  <button
                    className={`radio-btn ${searchSort === 'az' || searchSort === 'title' ? 'active' : ''}`}
                    onClick={() => setSearchSort('az')}
                  >
                    Song
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
                    ) : searchResults.length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>
                          {searchScope === 'playlist' && selectedPlaylist ? 'No tracks in this playlist' : 'No tracks found'}
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((track, index) => (
                        <tr key={`${track.id}-${index}`} onClick={(e) => handleVideoClick(track, e)} style={{ cursor: 'pointer' }}>
                          <td>{index + 1}</td>
                          <td className="col-title">{cleanVideoTitle(track.title)}</td>
                          <td>{getDisplayArtist(track.artist)}</td>
                          <td>{track.duration || '—'}</td>
                          <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
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
                      Showing {searchResults.length} of {searchTotalCount} tracks
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
                
                {/* Player Identity Section */}
                <div className="settings-section">
                  <h2><span className="section-icon">🆔</span> Player Identity</h2>
                  <PlayerIdSetting 
                    playerId={playerId}
                    needsPlayerId={needsPlayerId}
                    onPlayerIdChange={(newId) => {
                      storePlayerId(newId);
                      setPlayerId(newId);
                      // Sync entire music database to Supabase for new Player ID
                      if (supabaseInitialized) {
                        console.log('[PlayerWindow] Syncing music database to Supabase for new Player ID:', newId);
                        setIsProcessing(true);
                        setProcessingProgress({ current: 0, total: 0 });
                        getSupabaseService().indexLocalVideos(
                          playlists,
                          (current, total) => {
                            setProcessingProgress({ current, total });
                          }
                        ).finally(() => {
                          setIsProcessing(false);
                          setProcessingProgress({ current: 0, total: 0 });
                        });
                      }
                    }}
                    onPlayerIdSet={() => {
                      setNeedsPlayerId(false);
                      setShowPlayerIdAlert(false);
                    }}
                  />
                </div>
                
                {/* Library Settings Section */}
                <div className="settings-section">
                  <h2><span className="section-icon">📁</span> Library</h2>
                  <div className="setting-item playlists-path-setting">
                    <label>Playlists Folder</label>
                    <div className="path-input-container">
                      <input 
                        type="text"
                        className="path-input"
                        value={settings.playlistsDirectory}
                        readOnly
                        title={settings.playlistsDirectory}
                      />
                      <button 
                        className="action-btn select-folder-btn"
                        onClick={async () => {
                          if (isElectron) {
                            try {
                              const result = await (window as any).electronAPI.selectPlaylistsDirectory();
                              if (result.success) {
                                setSettings(s => ({ ...s, playlistsDirectory: result.path }));
                                // Refresh playlists with new directory
                                const { playlists: newPlaylists } = await (window as any).electronAPI.getPlaylists();
                                setPlaylists(newPlaylists || {});
                                localSearchService.indexVideos(newPlaylists || {});
                                // Sync entire music database to Supabase for Web Admin/Kiosk
                                if (supabaseInitialized) {
                                  console.log('[PlayerWindow] Syncing music database to Supabase after directory change');
                                  setIsProcessing(true);
                                  setProcessingProgress({ current: 0, total: 0 });
                                  getSupabaseService().indexLocalVideos(
                                    newPlaylists || {},
                                    (current, total) => {
                                      setProcessingProgress({ current, total });
                                    }
                                  ).finally(() => {
                                    setIsProcessing(false);
                                    setProcessingProgress({ current: 0, total: 0 });
                                  });
                                }
                              }
                            } catch (error) {
                              console.error('Failed to select playlists directory:', error);
                            }
                          }
                        }}
                      >
                        <span className="material-symbols-rounded">folder_open</span>
                        Select Folder
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h2>Playback</h2>
                  <div className="setting-item">
                    <label>Crossfade mode</label>
                    <div className="crossfade-mode-selector">
                      <button
                        className={`mode-btn ${settings.crossfadeMode === 'manual' ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting('crossfadeMode', 'manual')}
                        title="Videos play to completion, then next starts (clean cut)"
                      >
                        Manual
                      </button>
                      <button
                        className={`mode-btn ${settings.crossfadeMode === 'seamless' ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting('crossfadeMode', 'seamless')}
                        title="Next video overlaps with current for smooth transitions"
                      >
                        Seamless
                      </button>
                    </div>
                  </div>
                  <div className="setting-item">
                    <label>Auto-shuffle playlists</label>
                    <input 
                      type="checkbox" 
                      checked={settings.autoShufflePlaylists}
                      onChange={(e) => handleUpdateSetting('autoShufflePlaylists', e.target.checked)}
                    />
                  </div>
                  <div className="setting-item">
                    <label>{settings.crossfadeMode === 'seamless' ? 'Crossfade overlap' : 'Skip fade duration'}</label>
                    <div className="crossfade-slider-container">
                      <input 
                        type="range" 
                        className="crossfade-slider" 
                        value={settings.fadeDuration}
                        onChange={(e) => handleUpdateSetting('fadeDuration', Number(e.target.value))}
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
                      onChange={(e) => handleUpdateSetting('normalizeAudioLevels', e.target.checked)}
                    />
                  </div>
                </div>

                <div className="settings-section player-display-section">
                  <h2><span className="section-icon">🎬</span> Player Display Settings</h2>
                  
                  {/* Master Toggle */}
                  <div className="setting-item">
                    <label>Show Player Window</label>
                    <div className="toggle-with-status">
                      <span className={`status-indicator ${playerWindowOpen ? 'active' : ''}`}>
                        {playerWindowOpen ? 'Open' : 'Closed'}
                      </span>
                      <input 
                        type="checkbox" 
                        checked={settings.enableFullscreenPlayer}
                        onChange={async (e) => {
                          const enabled = e.target.checked;
                          handleUpdateSetting('enableFullscreenPlayer', enabled);
                          if (isElectron) {
                            try {
                              if (enabled && !playerWindowOpen) {
                                await (window as any).electronAPI.createPlayerWindow(settings.playerDisplayId);
                                setPlayerWindowOpen(true);
                              } else if (!enabled && playerWindowOpen) {
                                await (window as any).electronAPI.closePlayerWindow();
                                setPlayerWindowOpen(false);
                              }
                            } catch (error) {
                              console.error('Failed to toggle player window:', error);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Conditional Player Settings (hidden when Show=OFF) */}
                  <div className={`conditional-settings ${settings.enableFullscreenPlayer ? 'visible' : ''}`}>
                    
                    {/* Display Selection */}
                    <div className="setting-item">
                      <label>Player Location</label>
                      <div className="display-selector">
                        <select 
                          className="setting-select"
                          value={settings.playerDisplayId ?? ''}
                          onChange={async (e) => {
                            const displayId = e.target.value ? Number(e.target.value) : null;
                            handleUpdateSetting('playerDisplayId', displayId);
                            // If player window is open, move it to the new display (don't recreate)
                            if (isElectron && playerWindowOpen && displayId !== null) {
                              try {
                                await (window as any).electronAPI.movePlayerToDisplay(displayId);
                              } catch (error) {
                                console.error('Failed to move player window:', error);
                              }
                            }
                          }}
                        >
                          <option value="">Auto (Secondary Display)</option>
                          {availableDisplays.map((display) => (
                            <option key={display.id} value={display.id}>
                              {display.isPrimary ? '⭐ ' : ''}{display.label || `Display ${display.id}`}
                            </option>
                          ))}
                        </select>
                        <small className="display-info">
                          {(() => {
                            const selectedDisplay = settings.playerDisplayId 
                              ? availableDisplays.find(d => d.id === settings.playerDisplayId)
                              : availableDisplays.find(d => !d.isPrimary) || availableDisplays[0];
                            if (selectedDisplay) {
                              return `Current: ${selectedDisplay.label || 'Display'} (${selectedDisplay.width}×${selectedDisplay.height})`;
                            }
                            return `${availableDisplays.length} display(s) available`;
                          })()}
                        </small>
                      </div>
                    </div>

                    {/* Fullscreen Toggle */}
                    <div className="setting-item">
                      <label>Fullscreen Player</label>
                      <input 
                        type="checkbox" 
                        checked={settings.playerFullscreen}
                        onChange={async (e) => {
                          const fullscreen = e.target.checked;
                          handleUpdateSetting('playerFullscreen', fullscreen);
                          // Directly set fullscreen on the player window
                          if (isElectron && playerWindowOpen) {
                            try {
                              await (window as any).electronAPI.setPlayerFullscreen(fullscreen);
                            } catch (error) {
                              console.error('Failed to set fullscreen:', error);
                            }
                          }
                        }}
                      />
                    </div>

                    {/* Refresh Displays Button */}
                    <div className="setting-item">
                      <label>Display Detection</label>
                      <button 
                        className="action-btn"
                        onClick={async () => {
                          if (isElectron) {
                            const displays = await (window as any).electronAPI.getDisplays();
                            setAvailableDisplays(displays || []);
                          }
                        }}
                      >
                        <span className="material-symbols-rounded">refresh</span>
                        Refresh Displays
                      </button>
                    </div>

                    {/* Refresh Player Window Button */}
                    <div className="setting-item">
                      <label>Refresh Player</label>
                      <button 
                        className="action-btn"
                        onClick={async () => {
                          if (isElectron && playerWindowOpen) {
                            try {
                              // Refresh the player window (close and reopen)
                              await (window as any).electronAPI.refreshPlayerWindow(settings.playerDisplayId);
                              // Re-sync the current video after a short delay
                              setTimeout(() => {
                                if (currentVideo) {
                                  sendPlayCommand(currentVideo);
                                }
                              }, 500);
                            } catch (error) {
                              console.error('Failed to refresh player window:', error);
                            }
                          }
                        }}
                        disabled={!playerWindowOpen}
                      >
                        <span className="material-symbols-rounded">restart_alt</span>
                        Refresh Player
                      </button>
                    </div>
                  </div>
                </div>

                {/* Player Overlay Settings Section */}
                <div className="settings-section">
                  <h2><span className="section-icon">🎬</span> Player Overlay</h2>
                  
                  {/* Now Playing Text */}
                  <div className="setting-item">
                    <label>'Now Playing' Text</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${!overlaySettings.showNowPlaying ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showNowPlaying: false }))}
                      >
                        Hide
                      </button>
                      <button
                        className={`radio-btn ${overlaySettings.showNowPlaying ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showNowPlaying: true }))}
                      >
                        Show
                      </button>
                    </div>
                  </div>

                  {/* Now Playing Settings (conditional) */}
                  <div className={`conditional-settings ${overlaySettings.showNowPlaying ? 'visible' : ''}`}>
                    <div className="setting-item">
                      <label>Now Playing Position & Size</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Size:</span>
                          <input
                            type="number"
                            min="10"
                            max="200"
                            value={overlaySettings.nowPlayingSize}
                            onChange={(e) => {
                              const value = Math.min(200, Math.max(10, parseInt(e.target.value) || 100));
                              setOverlaySettings(prev => ({ ...prev, nowPlayingSize: value }));
                            }}
                            style={{ width: '55px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>X:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.nowPlayingX}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 5));
                              setOverlaySettings(prev => ({ ...prev, nowPlayingX: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Y:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.nowPlayingY}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 85));
                              setOverlaySettings(prev => ({ ...prev, nowPlayingY: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Opacity:</span>
                          <input
                            type="number"
                            min="10"
                            max="100"
                            value={overlaySettings.nowPlayingOpacity}
                            onChange={(e) => {
                              const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 100));
                              setOverlaySettings(prev => ({ ...prev, nowPlayingOpacity: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coming Up Ticker */}
                  <div className="setting-item">
                    <label>'Coming Up' Ticker</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${!overlaySettings.showComingUp ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showComingUp: false }))}
                      >
                        Hide
                      </button>
                      <button
                        className={`radio-btn ${overlaySettings.showComingUp ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showComingUp: true }))}
                      >
                        Show
                      </button>
                    </div>
                  </div>

                  {/* Coming Up Settings (conditional) */}
                  <div className={`conditional-settings ${overlaySettings.showComingUp ? 'visible' : ''}`}>
                    <div className="setting-item">
                      <label>Coming Up Position & Size</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Size:</span>
                          <input
                            type="number"
                            min="10"
                            max="200"
                            value={overlaySettings.comingUpSize}
                            onChange={(e) => {
                              const value = Math.min(200, Math.max(10, parseInt(e.target.value) || 100));
                              setOverlaySettings(prev => ({ ...prev, comingUpSize: value }));
                            }}
                            style={{ width: '55px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>X:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.comingUpX}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 5));
                              setOverlaySettings(prev => ({ ...prev, comingUpX: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Y:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.comingUpY}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 95));
                              setOverlaySettings(prev => ({ ...prev, comingUpY: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Opacity:</span>
                          <input
                            type="number"
                            min="10"
                            max="100"
                            value={overlaySettings.comingUpOpacity}
                            onChange={(e) => {
                              const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 100));
                              setOverlaySettings(prev => ({ ...prev, comingUpOpacity: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Watermark / Logo */}
                  <div className="setting-item">
                    <label>Watermark / Logo</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${!overlaySettings.showWatermark ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showWatermark: false }))}
                      >
                        Off
                      </button>
                      <button
                        className={`radio-btn ${overlaySettings.showWatermark ? 'active' : ''}`}
                        onClick={() => setOverlaySettings(prev => ({ ...prev, showWatermark: true }))}
                      >
                        On
                      </button>
                    </div>
                  </div>

                  {/* Watermark Settings (conditional) */}
                  <div className={`conditional-settings ${overlaySettings.showWatermark ? 'visible' : ''}`}>
                    {/* Image Selection */}
                    <div className="setting-item">
                      <label>Image</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {overlaySettings.watermarkImage && (
                          <div className="watermark-preview" style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            background: '#1a1a1a'
                          }}>
                            <img 
                              src={overlaySettings.watermarkImage} 
                              alt="Watermark preview"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                          </div>
                        )}
                        <button 
                          className="action-btn"
                          onClick={async () => {
                            if (isElectron) {
                              try {
                                const result = await (window as any).electronAPI.selectImageFile();
                                if (result && result.filePath) {
                                  setOverlaySettings(prev => ({ ...prev, watermarkImage: result.filePath }));
                                }
                              } catch (error) {
                                console.error('Failed to select image:', error);
                              }
                            } else {
                              // Web fallback - use file input
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'image/*';
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    setOverlaySettings(prev => ({ ...prev, watermarkImage: ev.target?.result as string }));
                                  };
                                  reader.readAsDataURL(file);
                                }
                              };
                              input.click();
                            }
                          }}
                        >
                          <span className="material-symbols-rounded">image</span>
                          Select Image
                        </button>
                        {overlaySettings.watermarkImage && overlaySettings.watermarkImage !== './Obie_neon_no_BG.png' && (
                          <button 
                            className="action-btn"
                            style={{ backgroundColor: 'var(--warning)' }}
                            onClick={() => setOverlaySettings(prev => ({ ...prev, watermarkImage: './Obie_neon_no_BG.png' }))}
                          >
                            <span className="material-symbols-rounded">restart_alt</span>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Image Size */}
                    <div className="setting-item">
                      <label>Image Size</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min="1"
                          max="400"
                          value={overlaySettings.watermarkSize}
                          onChange={(e) => {
                            const value = Math.min(400, Math.max(1, parseInt(e.target.value) || 100));
                            setOverlaySettings(prev => ({ ...prev, watermarkSize: value }));
                          }}
                          style={{
                            width: '70px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                          }}
                        />
                        <span>%</span>
                        <input
                          type="range"
                          min="1"
                          max="400"
                          value={overlaySettings.watermarkSize}
                          onChange={(e) => setOverlaySettings(prev => ({ ...prev, watermarkSize: parseInt(e.target.value) }))}
                          style={{ flex: 1, maxWidth: '150px' }}
                        />
                      </div>
                    </div>

                    {/* Image Position */}
                    <div className="setting-item">
                      <label>Image Position</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>X:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.watermarkX}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 90));
                              setOverlaySettings(prev => ({ ...prev, watermarkX: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Y:</span>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={overlaySettings.watermarkY}
                            onChange={(e) => {
                              const value = Math.min(99, Math.max(1, parseInt(e.target.value) || 10));
                              setOverlaySettings(prev => ({ ...prev, watermarkY: value }));
                            }}
                            style={{
                              width: '55px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px'
                            }}
                          />
                          <span>%</span>
                        </div>
                      </div>
                      <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                        Position is relative to player window (center of image). Default: X=90%, Y=10%
                      </small>
                    </div>

                    {/* Image Opacity */}
                    <div className="setting-item">
                      <label>Image Opacity</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min="10"
                          max="100"
                          value={overlaySettings.watermarkOpacity}
                          onChange={(e) => {
                            const value = Math.min(100, Math.max(10, parseInt(e.target.value) || 80));
                            setOverlaySettings(prev => ({ ...prev, watermarkOpacity: value }));
                          }}
                          style={{
                            width: '70px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                          }}
                        />
                        <span>%</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={overlaySettings.watermarkOpacity}
                          onChange={(e) => setOverlaySettings(prev => ({ ...prev, watermarkOpacity: parseInt(e.target.value) }))}
                          style={{ flex: 1, maxWidth: '150px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kiosk Settings Section */}
                <div className="settings-section">
                  <h2><span className="section-icon">🎰</span> Kiosk</h2>
                  
                  {/* Kiosk Mode Toggle */}
                  <div className="setting-item">
                    <label>Kiosk Mode</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${kioskSettings.mode === 'freeplay' ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, mode: 'freeplay' }))}
                      >
                        Free Play
                      </button>
                      <button
                        className={`radio-btn ${kioskSettings.mode === 'credits' ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, mode: 'credits' }))}
                      >
                        Credits
                      </button>
                    </div>
                  </div>

                  {/* Kiosk UI Style Toggle */}
                  <div className="setting-item">
                    <label>Kiosk UI Style</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${kioskSettings.uiMode === 'classic' ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, uiMode: 'classic' }))}
                      >
                        Classic
                      </button>
                      <button
                        className={`radio-btn ${kioskSettings.uiMode === 'jukebox' ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, uiMode: 'jukebox' }))}
                      >
                        Jukebox
                      </button>
                    </div>
                    <span className="setting-hint" style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {kioskSettings.uiMode === 'classic' ? 'Standard search interface' : 'Premium cyber-neon touchscreen UI'}
                    </span>
                  </div>

                  {/* Kiosk Balance */}
                  <div className="setting-item">
                    <label>Kiosk Balance</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="kiosk-balance" style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        color: 'var(--accent-primary)',
                        minWidth: '60px'
                      }}>
                        {kioskSettings.creditBalance} Credits
                      </span>
                      <button 
                        className="action-btn"
                        onClick={() => setKioskSettings(prev => ({ ...prev, creditBalance: prev.creditBalance + 1 }))}
                      >
                        +1
                      </button>
                      <button 
                        className="action-btn"
                        onClick={() => setKioskSettings(prev => ({ ...prev, creditBalance: prev.creditBalance + 3 }))}
                      >
                        +3
                      </button>
                      <button 
                        className="action-btn"
                        style={{ backgroundColor: 'var(--error)' }}
                        onClick={() => setKioskSettings(prev => ({ ...prev, creditBalance: 0 }))}
                      >
                        Clear (0)
                      </button>
                    </div>
                  </div>

                  {/* Kiosk Coin Acceptor Status */}
                  <div className="setting-item">
                    <label>Coin Acceptor Status</label>
                    <span className={`status-indicator ${kioskSerialStatus === 'connected' ? 'active' : ''}`} style={{ marginRight: '12px' }}>
                      {kioskSerialStatus === 'connected' ? 'SERIAL DEVICE CONNECTED' : 'SERIAL DEVICE DISCONNECTED'}
                    </span>
                  </div>

                  {/* Serial Device Selection */}
                  <div className="setting-item">
                    <label>Serial Devices</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          className="action-btn"
                          onClick={() => {
                            // TODO: Send command via Supabase to Kiosk to enumerate serial devices
                            console.log('[Kiosk] Requesting serial device list from Kiosk...');
                            // Placeholder - will be populated by Kiosk via Supabase
                            setKioskAvailableSerialDevices(['COM1', 'COM3', '/dev/ttyUSB0']);
                          }}
                        >
                          <span className="material-symbols-rounded">usb</span>
                          List Available Devices
                        </button>
                      </div>
                      <select 
                        className="setting-select"
                        value={kioskSelectedSerialDevice}
                        onChange={(e) => setKioskSelectedSerialDevice(e.target.value)}
                        style={{ maxWidth: '300px' }}
                      >
                        <option value="">Select a device...</option>
                        {kioskAvailableSerialDevices.map((device) => (
                          <option key={device} value={device}>{device}</option>
                        ))}
                      </select>
                      <button 
                        className="action-btn"
                        onClick={() => {
                          if (kioskSelectedSerialDevice) {
                            // TODO: Send command via Supabase to Kiosk to connect to selected device
                            console.log('[Kiosk] Requesting connection to:', kioskSelectedSerialDevice);
                            // Kiosk will update status via Supabase after attempting connection
                          }
                        }}
                        disabled={!kioskSelectedSerialDevice}
                      >
                        <span className="material-symbols-rounded">link</span>
                        Connect to Selected Device
                      </button>
                    </div>
                  </div>

                  {/* Kiosk Search Mode */}
                  <div className="setting-item">
                    <label>Search All Music</label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${kioskSettings.searchAllMusic ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, searchAllMusic: true }))}
                      >
                        Yes
                      </button>
                      <button
                        className={`radio-btn ${!kioskSettings.searchAllMusic ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, searchAllMusic: false }))}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>Search YouTube <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>(future)</span></label>
                    <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className={`radio-btn ${kioskSettings.searchYoutube ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, searchYoutube: true }))}
                      >
                        Yes
                      </button>
                      <button
                        className={`radio-btn ${!kioskSettings.searchYoutube ? 'active' : ''}`}
                        onClick={() => setKioskSettings(prev => ({ ...prev, searchYoutube: false }))}
                      >
                        No
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
                <h1>Tools</h1>
                
                <div className="tools-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginTop: '24px' }}>
                  {/* Reset Application Tool */}
                  <div 
                    className="tool-card" 
                    onClick={() => setShowResetDialog(true)}
                    style={{
                      padding: '20px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔄</div>
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Reset Application</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Reset all settings to defaults and clear Player ID
                    </div>
                  </div>

                  {/* Clear Queue Tool */}
                  <div 
                    className="tool-card" 
                    onClick={handleClearQueue}
                    style={{
                      padding: '20px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗑️</div>
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Clear Queue</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Remove all videos from the current playback queue
                    </div>
                  </div>

                  {/* Refresh Playlists Tool */}
                  {isElectron && (
                    <div 
                      className="tool-card" 
                      onClick={handleRefreshPlaylists}
                      style={{
                        padding: '20px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔄</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Refresh Playlists</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Rescan the playlists directory for changes
                      </div>
                    </div>
                  )}

                  {/* Re-index Music Database Tool */}
                  {isElectron && supabaseInitialized && (
                    <div 
                      className="tool-card" 
                      onClick={handleReindexMusicDatabase}
                      style={{
                        padding: '20px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Re-index Music Database</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Force re-index of all videos to Supabase (bypasses count check)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Reset Application Confirmation Dialog */}
      {showResetDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px', color: 'var(--yt-spec-brand-button-background)' }}>
              ⚠️ WARNING ⚠️
            </div>
            <div style={{ fontSize: '16px', lineHeight: '1.6', marginBottom: '24px', color: 'var(--text-primary)' }}>
              All settings will be set to DEFAULT
              <br /><br />
              Current PLAYER_ID will be removed,
              <br />
              and Data Profile will be deleted from Server
              <br /><br />
              Are you SURE you want to proceed?
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowResetDialog(false)}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                NO - Cancel
              </button>
              <button
                onClick={handleResetApplication}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  backgroundColor: 'var(--yt-spec-brand-button-background)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                YES - Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player ID First-Run Alert */}
      {showPlayerIdAlert && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Please enter a unique PLAYER ID for your application.
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '24px', color: 'var(--text-secondary)' }}>
              <strong>Note:</strong>
              <br />
              • You are currently using the default Player ID: <strong>DJAMMS_DEMO</strong>
              <br />
              • Must be between 4 and 20 characters long
              <br />
              • Only contain the letters A-Z, numbers 0-9, or underscore character
              <br />
              • You can keep "DJAMMS_DEMO" if you want, but a unique ID is recommended
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPlayerIdAlert(false);
                  // Auto-select the Player ID edit button in Settings
                  setTimeout(() => {
                    const editButton = document.querySelector('[data-player-id-edit]') as HTMLElement;
                    if (editButton) {
                      editButton.click();
                    }
                  }, 100);
                }}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  backgroundColor: 'var(--yt-spec-call-to-action)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Default Playlist Name Alert */}
      {showDefaultPlaylistAlert && defaultPlaylistName && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Consider Renaming Your Default Playlist
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '24px', color: 'var(--text-secondary)' }}>
              <strong>Note:</strong>
              <br />
              • You have a playlist named: <strong>{getPlaylistDisplayName(defaultPlaylistName)}</strong>
              <br />
              • This is the default playlist name
              <br />
              • Consider renaming it to something more descriptive
              <br />
              • You can rename playlists by renaming the folder in your PLAYLISTS directory
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDefaultPlaylistAlert(false);
                  setDefaultPlaylistName(null);
                }}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  backgroundColor: 'var(--yt-spec-call-to-action)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Progress Popover */}
      {isProcessing && (
        <div
          onClick={() => setIsProcessing(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'pointer'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '400px',
              width: '90%',
              border: '1px solid var(--border-color)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              cursor: 'default'
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Processing PLAYLISTS ... one moment ...
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              Processing : {processingProgress.current} of {processingProgress.total}
              {processingProgress.total > 0 && processingProgress.current > 0 && (
                <span style={{ marginLeft: '8px', color: 'var(--yt-spec-call-to-action)' }}>
                  ({Math.round((processingProgress.current / processingProgress.total) * 100)}% complete)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
