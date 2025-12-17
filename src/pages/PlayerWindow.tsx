// src/pages/PlayerWindow.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Video } from '../types';
import { localSearchService, SearchResult, getSupabaseService } from '../services';
import { getPlaylistDisplayName, getDisplayArtist, cleanVideoTitle, formatDuration } from '../utils/playlistHelpers';
import { shuffleArray } from '../utils/arrayUtils';
import { useSupabase } from '../hooks/useSupabase';
import { usePlayerState } from '../hooks/usePlayerState';
import { usePlaylistManagement } from '../hooks/usePlaylistManagement';
import { useSearch } from '../hooks/useSearch';
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
import { QueueTab, SearchTab, ConnectionsTab } from '../components/tabs';
import { SettingsTab } from '../components/SettingsTab';
import { ToolsTab } from '../components/ToolsTab';

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

type TabId = 'queue' | 'search' | 'settings' | 'tools' | 'connections';

// Navigation items configuration
const navItems: { id: TabId; icon: string; label: string }[] = [
  { id: 'queue', icon: 'queue_music', label: 'Queue' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'tools', icon: 'build', label: 'Tools' },
  { id: 'connections', icon: 'hub', label: 'Connections' },
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

  // Player Identity state
  const [playerId, setPlayerId] = useState<string>(DEFAULT_PLAYER_ID);
  const [playerIdInitialized, setPlayerIdInitialized] = useState(false);

  // Settings
  const [settings, setSettings] = useState({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0,
    crossfadeMode: 'manual' as 'manual' | 'seamless',
    playerDisplayId: null as number | null,
    playerFullscreen: false,
    playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS',
    forceAutoPlay: false
  });

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

  // New state for proper initialization sequence
  const [adminConsoleReady, setAdminConsoleReady] = useState(false);
  const [activeQueuePopulated, setActiveQueuePopulated] = useState(false);
  const [playerWindowInitializing, setPlayerWindowInitializing] = useState(false);
  const hasIndexedRef = useRef(false); // Prevent multiple indexing calls during mount
  const lastIndexedPlaylistsRef = useRef<string>(''); // Track last indexed playlists to prevent re-indexing
  const isReloadingPlaylistsRef = useRef(false); // Prevent concurrent playlist reloads
  
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

  // Force Auto-Play refs
  const isPlayingRef = useRef(isPlaying);
  const settingsRef = useRef(settings);
  const isCommandPendingRef = useRef(false); // Track if skip/play command is in progress
  const forceAutoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keep refs in sync (currentVideoRef is already declared above and synced)
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Check if we're in Electron (check multiple ways for reliability)
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
    autoInit: !!(isElectron && playerIdInitialized), // Initialize if Player ID is initialized (including DJAMMS_DEMO)
    onPlay: (video?: QueueVideoItem, queueIndex?: number) => {
      console.log('[PlayerWindow] Supabase play command received:', video?.title, 'queueIndex:', queueIndex);

      // If queueIndex is provided, play from that position in the queue (click-to-play from Web Admin)
      if (typeof queueIndex === 'number' && queueIndex >= 0) {
        const currentQueue = queueRef.current;
        if (currentQueue && queueIndex < currentQueue.length) {
          const videoToPlay = currentQueue[queueIndex];
          console.log('[PlayerWindow] Requesting play from queue index:', queueIndex, videoToPlay.title);
          setQueueIndex(queueIndex);
          setCurrentVideo(videoToPlay);
          // Don't set isPlaying here - let actual playback state determine it
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
        // Don't set isPlaying here - let actual playback state determine it
        console.log('[PlayerWindow] Requesting play of specific video:', videoToPlay.title);
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('play', videoToPlay);
        }
      } else if (currentVideo) {
        // Resume current video
        // Don't set isPlaying here - let actual playback state determine it
        console.log('[PlayerWindow] Requesting resume of current video');
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('resume');
        }
      }
    },
    onPause: () => {
      console.log('[PlayerWindow] Supabase pause command received');
      // If forceAutoPlay is enabled, ignore pause commands
      if (settingsRef.current.forceAutoPlay) {
        console.log('[PlayerWindow] Force Auto-Play is enabled - ignoring pause command');
        return;
      }
      setIsPlaying(false);
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('pause');
      }
    },
    onResume: () => {
      console.log('[PlayerWindow] Supabase resume command received - requesting resume');
      // Don't set isPlaying here - let actual playback state determine it
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
    onQueueAdd: async (video: QueueVideoItem, queueType: 'active' | 'priority') => {
      console.log('[PlayerWindow] ✅ Supabase queue_add command received:', video.title, queueType);
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
        // Check if video already exists in priority queue (prevent duplicates)
        const videoId = videoToAdd.id || videoToAdd.src;
        setPriorityQueue(prev => {
          const alreadyExists = prev.some(v => (v.id || v.src) === videoId);
          if (alreadyExists) {
            console.log('[PlayerWindow] ⚠️ Video already in priority queue, skipping duplicate:', videoToAdd.title);
            return prev; // Don't add duplicate
          }
          return [...prev, videoToAdd];
        });
        // IMPORTANT: Also add to main process queue state (source of truth for playback)
        // Main process will also check for duplicates
        if (isElectron) {
          // Apply the same URL conversion as sendPlayCommand for priority queue videos
          const isDevMode = typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost');
          let videoForPriorityQueue = { ...videoToAdd };

          if (isDevMode) {
            const videoPath = videoToAdd.src || videoToAdd.path || (videoToAdd as any).file_path;
            if (videoPath && videoPath.startsWith('file://')) {
              // Extract the actual file path from file:// URL
              try {
                const url = new URL(videoPath);
                let cleanPath = url.pathname;

                // Convert file:// to djamms:// for Electron protocol handling
                const djammsUrl = `djamms://${cleanPath}`;

                videoForPriorityQueue = {
                  ...videoToAdd,
                  src: djammsUrl,
                  path: cleanPath
                };

                console.log('[PlayerWindow] 🔄 Converted priority queue video URL:', {
                  title: videoToAdd.title,
                  originalSrc: videoPath,
                  newSrc: djammsUrl
                });
              } catch (error) {
                console.warn('[PlayerWindow] Failed to convert priority queue video URL:', error);
              }
            }
          }

          console.log('[PlayerWindow] 📤 Adding video to priority queue in main process (from Supabase):', videoForPriorityQueue.title);
          (window as any).electronAPI.sendQueueCommand?.({
            action: 'add_to_priority_queue',
            payload: { video: videoForPriorityQueue }
          });
          console.log('[PlayerWindow] ✅ Priority queue command sent to main process');
        }
      } else {
        // Add to end of active queue
        setQueue(prev => [...prev, videoToAdd]);
        // Also add to main process
        if (isElectron) {
          console.log('[PlayerWindow] 📤 Adding video to active queue in main process (from Supabase):', videoToAdd.title);
          (window as any).electronAPI.sendQueueCommand?.({ 
            action: 'add_to_queue', 
            payload: { video: videoToAdd } 
          });
          console.log('[PlayerWindow] ✅ Active queue command sent to main process');
        }
      }
    },
    onQueueShuffle: () => {
      console.log('[PlayerWindow] Supabase queue_shuffle command received');
      
      // #region agent log
      if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
        (window as any).electronAPI.writeDebugLog({location:'PlayerWindow.tsx:572',message:'WEBADMIN shuffle command received',data:{queueLength:queueRef.current?.length||0,currentIndex:queueIndexRef.current,isElectron:!!isElectron,hasSendQueueCommand:!!(window as any).electronAPI?.sendQueueCommand},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}).catch(()=>{});
      }
      // #endregion
      
      // CRITICAL FIX: When WEBADMIN sends shuffle, we must ALSO shuffle the main process queue
      // The main process queue is what actually plays videos - React state is just for display
      // Without this, the display shows shuffled order but playback uses original order
      if (isElectron && (window as any).electronAPI?.sendQueueCommand) {
        // Send shuffle command to main process (same as player's own shuffle button)
        // The main process will shuffle its queue and broadcast the updated state back
        (window as any).electronAPI.sendQueueCommand({ action: 'shuffle_queue', payload: { keepFirst: true } });
        console.log('[PlayerWindow] ✅ Shuffle command sent to main process queue');
        
        // #region agent log
        if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'PlayerWindow.tsx:590',message:'Shuffle command sent to main process',data:{action:'shuffle_queue',keepFirst:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}).catch(()=>{});
        }
        // #endregion
        
        // Don't shuffle React state here - let main process broadcast the shuffled state
        // This ensures React state and main process queue stay in sync
        return;
      }
      
      // Fallback: If not Electron or sendQueueCommand unavailable, shuffle React state only
      // (This should rarely happen, but provides backward compatibility)
      console.warn('[PlayerWindow] ⚠️ Electron API not available - shuffling React state only (may cause desync)');
      setQueue(prev => {
        // ARCHITECTURE: Index 0 is always now-playing - keep index 0, shuffle the rest
        if (prev.length <= 1) return prev; // Nothing to shuffle
        
        const first = prev[0]; // Keep index 0 (now-playing)
        const rest = prev.slice(1); // Get indices 1-end
        const shuffledRest = shuffleArray(rest);
        // Reconstruct: index 0 stays the same, rest is shuffled
        const newQueue = [first, ...shuffledRest];
        
        // Trigger immediate sync so Web Admin sees the shuffled queue right away
        setTimeout(() => {
          syncState({
            activeQueue: newQueue,
            queueIndex: 0 // Always 0 - index 0 is now-playing
          }, true); // immediate = true to bypass debounce
        }, 0);
        
        return newQueue;
      });
    },
    onMigratePlaylistNames: async () => {
      console.log('[PlayerWindow] Manual playlist name migration triggered');
      await migrateSupabasePlaylistNames(playlists);
    },

    onLoadPlaylist: async (playlistName: string, shuffle?: boolean) => {
      console.log('[PlayerWindow] Supabase load_playlist command received:', playlistName, shuffle);

      // Refresh playlists from disk to ensure we have the latest changes
      let refreshedPlaylists = playlists; // Default to current state
      if (isElectron) {
        try {
          const result = await (window as any).electronAPI.getPlaylists();
          if (result?.playlists) {
            refreshedPlaylists = result.playlists;
            setPlaylists(refreshedPlaylists);
            localSearchService.indexVideos(refreshedPlaylists);
          }
        } catch (error) {
          console.warn('[PlayerWindow] Failed to refresh playlists:', error);
        }
      }

      // Find the playlist (may have YouTube ID prefix) - use the refreshed playlists
      const playlistKey = Object.keys(refreshedPlaylists).find(key =>
        key === playlistName || key.includes(playlistName)
      );

      if (playlistKey && refreshedPlaylists[playlistKey]) {
        const playlistTracks = refreshedPlaylists[playlistKey];
        const shouldShuffle = shuffle ?? settings.autoShufflePlaylists;
        const newPlaylistTracks = Array.isArray(playlistTracks)
          ? (shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks])
          : [];

        setActivePlaylist(playlistKey);

        // Load playlist preserving current playing video and priority queue
        if (isElectron && newPlaylistTracks.length > 0) {
          console.log('[PlayerWindow] Loading playlist while preserving current video and priority queue');

          // Mark playlist loading as in progress to prevent Supabase polling interference
          playlistLoadingInProgressRef.current = true;

          // Get current queue state from main process
          (window as any).electronAPI.invoke?.('get-queue-state').then((queueState: any) => {
            const currentQueue = queueState?.activeQueue || [];
            const currentPriorityQueue = queueState?.priorityQueue || [];

            console.log('[PlayerWindow] Current queue state:', {
              activeQueueLength: currentQueue.length,
              priorityQueueLength: currentPriorityQueue.length,
              nowPlaying: queueState?.nowPlaying?.title,
              isPlaying: queueState?.isPlaying
            });

            // Preserve index 0 (currently playing video) if it exists and is playing
            const preservedVideo = (currentQueue.length > 0 && queueState?.isPlaying) ? currentQueue[0] : null;

            if (preservedVideo) {
              console.log('[PlayerWindow] Preserving currently playing video at index 0:', preservedVideo.title);
            }

            // Clear the entire queue first
            (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });

            // If we have a preserved video, add it back at index 0
            if (preservedVideo) {
              (window as any).electronAPI.sendQueueCommand?.({
                action: 'add_to_queue',
                payload: { video: preservedVideo }
              });
            }

            // Add new playlist tracks (they will start from index 1 if preserved video exists)
            newPlaylistTracks.forEach((video) => {
              (window as any).electronAPI.sendQueueCommand?.({
                action: 'add_to_queue',
                payload: { video }
              });
            });

            // Determine if we should auto-play
            // Only auto-play if there's no currently playing video OR if video is not playing
            const shouldAutoPlay = !preservedVideo || !queueState?.isPlaying;

            if (shouldAutoPlay) {
              console.log('[PlayerWindow] Auto-playing first track of new playlist');
              setTimeout(() => {
                (window as any).electronAPI.sendQueueCommand?.({
                  action: 'play_at_index',
                  payload: { index: 0 }
                });
              }, 100);
            } else {
              console.log('[PlayerWindow] Preserving current playing video, playlist loaded starting from index 1');
            }

            // Don't manually update local state - let main process broadcasts handle it
            console.log('[PlayerWindow] Supabase playlist load commands sent - waiting for main process broadcasts');

            // Set queue index to 0 (this will be overridden by main process broadcasts if needed)
            setQueueIndex(0);

            // Sync state with preserved priority queue
            if (updatedQueue.length > 0) {
              syncStateRef.current.lastSyncedHash = JSON.stringify({
                activeQueue: updatedQueue.map(v => v.id),
                priorityQueue: currentPriorityQueue.map((v: Video) => v.id),
                queueIndex: 0
              });
            }
          }).catch((error: any) => {
            console.error('[PlayerWindow] Failed to get queue state:', error);
            // Fallback: clear and load normally
            (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
            newPlaylistTracks.forEach((video) => {
              (window as any).electronAPI.sendQueueCommand?.({
                action: 'add_to_queue',
                payload: { video }
              });
            });
            setQueue(newPlaylistTracks);
            setQueueIndex(0);
          });

          // Mark playlist loading as complete after a delay to allow main process to finish processing
          setTimeout(() => {
            playlistLoadingInProgressRef.current = false;
            console.log('[PlayerWindow] Supabase playlist loading marked as complete');
          }, 2000); // 2 second delay to ensure all operations complete
        } else {
          // Fallback for non-Electron or empty playlist
          setQueue(newPlaylistTracks);
          setQueueIndex(0);
          playlistLoadingInProgressRef.current = false;
        }
      }
    },
    onQueueMove: (fromIndex: number, toIndex: number) => {
      console.log('[PlayerWindow] Supabase queue_move command received:', fromIndex, '->', toIndex);
      
      // ARCHITECTURE: Index 0 is always now-playing - prevent moving index 0
      if (fromIndex === 0 || toIndex === 0) {
        console.warn('[PlayerWindow] Cannot move index 0 (now-playing video)');
        return;
      }
      
      setQueue(prev => {
        const newQueue = [...prev];
        
        // Validate indices
        if (fromIndex < 0 || fromIndex >= newQueue.length || toIndex < 0 || toIndex >= newQueue.length) {
          console.warn('[PlayerWindow] Invalid queue move indices');
          return prev;
        }
        
        // Remove item from old position and insert at new position
        const [movedItem] = newQueue.splice(fromIndex, 1);
        const adjustedTarget = fromIndex < toIndex ? toIndex - 1 : toIndex;
        newQueue.splice(adjustedTarget, 0, movedItem);
        
        // ARCHITECTURE: Index 0 is always now-playing - queueIndex always 0
        setQueueIndex(0);
        
        // Sync immediately
        setTimeout(() => {
          syncState({ activeQueue: newQueue, queueIndex: 0 }, true);
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
          const removeIdx = prev.findIndex(v => v.id === videoId);
          
          // ARCHITECTURE: Index 0 is always now-playing - prevent removing index 0
          if (removeIdx === -1) {
            console.warn('[PlayerWindow] Cannot remove: video not found');
            return prev;
          }
          
          if (removeIdx === 0) {
            console.warn('[PlayerWindow] Cannot remove index 0 (now-playing video)');
            return prev;
          }
          
          const newQueue = prev.filter(v => v.id !== videoId);
          
          // ARCHITECTURE: Index 0 is always now-playing - queueIndex always 0
          setQueueIndex(0);
          
          setTimeout(() => syncState({ activeQueue: newQueue, queueIndex: 0 }, true), 0);
          return newQueue;
        });
      }
    }
  });

  // ⚠️ DISABLED: Electron Player should NOT subscribe to its own queue updates
  // This causes recursion loops: Player writes → Supabase broadcasts → Player receives own update → Processes → Writes again
  // Only Web Admin and Web Kiosk should subscribe to player_state updates (they use subscribeToPlayerState from web/shared/supabase-client.ts)
  // The Electron Player is the authoritative writer and should only WRITE to Supabase, not read its own updates
  // 
  // The original subscription code has been disabled to prevent recursion. The Electron Player only writes to Supabase.
  useEffect(() => {
    // This effect is intentionally empty - subscription is disabled to prevent recursion
    // The Electron Player only writes to Supabase, it doesn't read its own updates
    if (supabaseInitialized && isElectron) {
      console.log('[PlayerWindow] ⚠️ Queue update subscription DISABLED for Electron Player (prevents recursion)');
      console.log('[PlayerWindow] Electron Player only WRITES to Supabase, does not subscribe to its own updates');
    }
  }, [supabaseInitialized, isElectron]);

  // Search state - now managed by useSearch hook (called after playerId and supabaseInitialized are available)
  const {
    searchQuery,
    searchScope,
    searchSort,
    searchResults,
    searchLoading,
    searchTotalCount,
    searchLimit,
    setSearchQuery,
    setSearchScope,
    setSearchSort,
    setSearchLimit,
    handleScopeChange
  } = useSearch({
    playlists,
    selectedPlaylist,
    supabaseInitialized: supabaseInitialized,
    playerId: playerId || DEFAULT_PLAYER_ID
  });

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  
  // Error handler for video playback errors
  const handleVideoError = useCallback((errorMessage: string) => {
    console.error('🚨 ========== PLAYBACK ERROR (PlayerWindow) ==========');
    console.error('🚨 PLAYBACK ERROR - Error Message:', errorMessage);
    console.error('🚨 PLAYBACK ERROR - Current Video:', currentVideo?.title, 'by', currentVideo?.artist);
    console.error('🚨 PLAYBACK ERROR - Video Path:', currentVideo?.path || currentVideo?.src);
    console.error('🚨 PLAYBACK ERROR - Video Source URL:', currentVideo?.src);
    console.error('🚨 PLAYBACK ERROR - Is Electron:', isElectron);
    console.error('🚨 PLAYBACK ERROR - Timestamp:', new Date().toISOString());
    console.error('🚨 =================================================');
    
    // Also try to send to Electron main process if available
    if (isElectron && (window as any).electronAPI) {
      try {
        (window as any).electronAPI.send?.('log-error', {
          type: 'PLAYBACK_ERROR',
          message: errorMessage,
          video: currentVideo,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        // Ignore IPC errors
      }
    }
  }, [currentVideo, isElectron]);
  
  const videoPlayer = useVideoPlayer({
    videoRefs: [videoARef, videoBRef],
    crossfadeMode: 'manual', // or from settings
    crossfadeDuration: 2,
    onVideoEnd: () => {/* handle video end */},
    onError: handleVideoError, // Add error handler
    // other config
  });

  // Debug: Log when playlists state changes
  useEffect(() => {
    const playlistCount = Object.keys(playlists).length;
    console.log('[PlayerWindow] Playlists state updated - count:', playlistCount, 'names:', Object.keys(playlists));
  }, [playlists]);

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

  // Track last indexed playerId and supabaseInitialized state to prevent unnecessary reloads
  // Note: These refs are declared here to avoid duplicate declarations
  const lastIndexedPlayerIdRef = useRef<string>('');
  const lastSupabaseInitializedRef = useRef<boolean>(false);

  // Track when playlist loading is in progress to prevent Supabase polling interference
  const playlistLoadingInProgressRef = useRef(false);
  
  // Initialize indexingCompleteRef based on whether Supabase is available
  useEffect(() => {
    // If Supabase is not initialized, mark as complete immediately (no indexing needed)
    if (!supabaseInitialized) {
      indexingCompleteRef.current = true;
    }
  }, [supabaseInitialized]);

  // Sync music database to Supabase when it becomes initialized and we have playlists
  useEffect(() => {
    if (!supabaseInitialized || Object.keys(playlists).length === 0) return;

    // Create a comprehensive hash of playlist names AND contents to detect actual changes
    const createPlaylistHash = (playlists: Record<string, Video[]>) => {
      const parts: string[] = [];

      // Sort playlist names for consistent ordering
      const sortedNames = Object.keys(playlists).sort();

      for (const name of sortedNames) {
        const videos = playlists[name] || [];
        // Include playlist name and all video IDs in the hash
        const videoIds = videos.map(v => v.id || v.src || v.title).sort().join(',');
        parts.push(`${name}:${videoIds}:${videos.length}`);
      }

      return parts.join('|');
    };

    const playlistHash = createPlaylistHash(playlists);

    // Skip if we've already indexed these exact playlists (including contents)
    if (lastIndexedPlaylistsRef.current === playlistHash) {
      console.log('[PlayerWindow] Playlists unchanged, skipping re-index');
      return;
    }

    console.log('[PlayerWindow] Supabase initialized - syncing music database');
    lastIndexedPlaylistsRef.current = playlistHash;
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
  }, [supabaseInitialized, playlists]);

  /**
   * After Player ID is validated/changed, re-parse playlists and upload search data to Supabase.
   * This ensures Admin/Kiosk search stays in sync with the active player instance.
   * 
   * IMPORTANT: Only reload playlists when playerId changes, NOT when supabaseInitialized changes.
   * The supabaseInitialized change is handled by the other useEffect that syncs to Supabase.
   */
  useEffect(() => {
    const shouldSync = isElectron && playerIdInitialized && playerId && playerId.trim() !== '';
    if (!shouldSync) return;

    // Prevent concurrent reloads
    if (isReloadingPlaylistsRef.current) {
      console.log('[PlayerWindow] Playlist reload already in progress, skipping');
      return;
    }

    // Only reload when playerId changes, not when supabaseInitialized changes
    // This prevents the loop where supabaseInitialized toggling causes reloads
    if (lastIndexedPlayerIdRef.current === playerId) {
      console.log('[PlayerWindow] Player ID unchanged, skipping reload');
      return;
    }

    console.log('[PlayerWindow] 🔄 Player ID changed - triggering reload:', {
      oldPlayerId: lastIndexedPlayerIdRef.current,
      newPlayerId: playerId
    });

    // Update ref to track current playerId BEFORE async operation
    lastIndexedPlayerIdRef.current = playerId;
    isReloadingPlaylistsRef.current = true;

    const reloadAndSync = async () => {
      try {
        // Re-parse playlists from disk
        const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();

        // Create comprehensive hash including playlist contents
        const createPlaylistHash = (playlists: Record<string, Video[]>) => {
          const parts: string[] = [];
          const sortedNames = Object.keys(playlists).sort();
          for (const name of sortedNames) {
            const videos = playlists[name] || [];
            const videoIds = videos.map(v => v.id || v.src || v.title).sort().join(',');
            parts.push(`${name}:${videoIds}:${videos.length}`);
          }
          return parts.join('|');
        };

        const playlistHash = createPlaylistHash(loadedPlaylists || {});

        // Only update if playlists actually changed (including contents)
        if (lastIndexedPlaylistsRef.current !== playlistHash) {
          console.log('[PlayerWindow] Player ID validated - reloading playlists');
          setPlaylists(loadedPlaylists || {});
          localSearchService.indexVideos(loadedPlaylists || {});
          lastIndexedPlaylistsRef.current = playlistHash;
        } else {
          console.log('[PlayerWindow] Player ID validated - playlists unchanged, skipping reload');
        }

        // CRITICAL: When player ID changes, we MUST re-index videos with the new player ID
        // Even if playlists haven't changed, we need to upload them to Supabase with the new player_id
        if (supabaseInitialized && loadedPlaylists && Object.keys(loadedPlaylists).length > 0) {
          console.log('[PlayerWindow] Player ID changed - re-indexing videos with new player ID:', playerId);
          setIsProcessing(true);
          setProcessingProgress({ current: 0, total: 0 });
          getSupabaseService().indexLocalVideos(
            loadedPlaylists,
            (current, total) => {
              setProcessingProgress({ current, total });
            },
            true // forceIndex = true to ensure videos are uploaded with new player ID
          ).finally(() => {
            setIsProcessing(false);
            setProcessingProgress({ current: 0, total: 0 });
            indexingCompleteRef.current = true;
            console.log('[PlayerWindow] ✅ Videos re-indexed with new player ID');
          });
        } else {
          // If Supabase is not initialized, mark as complete (no indexing needed)
          indexingCompleteRef.current = true;
        }
      } catch (error) {
        console.error('[PlayerWindow] Failed to reload playlists after Player ID validation:', error);
      } finally {
        isReloadingPlaylistsRef.current = false;
      }
    };

    reloadAndSync();
  }, [isElectron, playerIdInitialized, playerId]); // Removed supabaseInitialized from dependencies

  // Load playlists and settings on mount
  useEffect(() => {
    // Guard against multiple executions (React Strict Mode or HMR)
    if (hasIndexedRef.current) return;
    
    const loadData = async (retryCount = 0) => {
      // Check if electronAPI is available (it might not be ready on first render)
      const electronAvailable = typeof window !== 'undefined' && !!(window as any).electronAPI;
      
      // If we're in Electron environment (check process or userAgent), wait for electronAPI
      const isElectronEnv = typeof window !== 'undefined' && (
        !!(window as any).process?.versions?.electron || 
        navigator.userAgent.toLowerCase().includes('electron') ||
        !!(window as any).require // Electron has require in renderer
      );
      
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
      const hasProcess = !!(window as any).process;
      const hasRequire = !!(window as any).require;
      console.log(`[PlayerWindow] loadData attempt ${retryCount}:`, {
        electronAvailable,
        isElectronEnv,
        hasElectronAPI: !!(window as any).electronAPI,
        hasProcess,
        hasRequire,
        processElectron: !!(window as any).process?.versions?.electron,
        userAgent: userAgent.substring(0, 100)
      });
      
      if (!electronAvailable && isElectronEnv && retryCount < 20) {
        // Retry more times with increasing delay if electronAPI isn't ready yet
        const delay = Math.min(200 * (retryCount + 1), 2000);
        console.log(`[PlayerWindow] electronAPI not ready, retrying in ${delay}ms (attempt ${retryCount + 1}/20)`);
        setTimeout(() => loadData(retryCount + 1), delay);
        return;
      }
      
      if (electronAvailable) {
        try {
          hasIndexedRef.current = true; // Mark as indexed BEFORE async operations
          const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
          const playlistCount = Object.keys(loadedPlaylists || {}).length;
          console.log('[PlayerWindow] Loaded playlists:', playlistCount, 'playlists');
          if (playlistCount > 0) {
            console.log('[PlayerWindow] Playlist names:', Object.keys(loadedPlaylists || {}));
          } else {
            const playlistDir = await (window as any).electronAPI.getPlaylistsDirectory?.() || 'unknown';
            console.warn('[PlayerWindow] ⚠️ No playlists found! Check playlist directory:', playlistDir);
          }
          setPlaylists(loadedPlaylists || {});
          localSearchService.indexVideos(loadedPlaylists || {});

          // STARTUP CHECK: Compare local playlist file counts with Supabase data
          if (playlistCount > 0 && supabaseInitialized) {
            try {
              console.log('[PlayerWindow] 🔍 Checking playlist count consistency with Supabase...');

              // Get total video count from local playlists
              const localVideoCount = Object.values(loadedPlaylists).reduce((total, videos) => total + videos.length, 0);

              // Get video count from Supabase local_videos table
              const supabaseVideos = await getSupabaseService().getLocalVideos();
              const supabaseVideoCount = supabaseVideos?.length || 0;

              console.log(`[PlayerWindow] 📊 Playlist count comparison: Local=${localVideoCount} videos, Supabase=${supabaseVideoCount} videos`);

              // If there's a significant discrepancy (>10% difference), trigger re-indexing
              const discrepancyThreshold = Math.max(5, Math.floor(localVideoCount * 0.1)); // At least 5 videos or 10% difference
              if (Math.abs(localVideoCount - supabaseVideoCount) > discrepancyThreshold) {
                console.warn(`[PlayerWindow] 🚨 Playlist count discrepancy detected! Local: ${localVideoCount}, Supabase: ${supabaseVideoCount}`);
                console.log('[PlayerWindow] 🔄 Triggering automatic playlist re-indexing...');

                // Trigger re-indexing by sending command to index playlists
                await getSupabaseService().indexLocalVideos(loadedPlaylists);
                console.log('[PlayerWindow] ✅ Automatic playlist re-indexing completed');
              } else {
                console.log('[PlayerWindow] ✅ Playlist counts are consistent');
              }
            } catch (error) {
              console.warn('[PlayerWindow] ⚠️ Failed to check playlist count consistency:', error);
            }
          }

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
          // Load volume separately (it's stored separately)
          const savedVolume = await (window as any).electronAPI.getSetting('volume');
          if (savedVolume !== undefined) setVolume(Math.round(savedVolume * 100));
          
          // Try loading settings as a group first (preferred method)
          const savedPlayerSettings = await (window as any).electronAPI.getSetting('playerSettings');
          if (savedPlayerSettings) {
            // Load from grouped settings
            setSettings(prev => ({ ...prev, ...savedPlayerSettings }));
          } else {
            // Fall back to individual settings (for backwards compatibility)
            const savedDisplayId = await (window as any).electronAPI.getSetting('playerDisplayId');
            const savedFullscreen = await (window as any).electronAPI.getSetting('playerWindowFullscreen');
            const savedAutoShuffle = await (window as any).electronAPI.getSetting('autoShufflePlaylists');
            const savedNormalize = await (window as any).electronAPI.getSetting('normalizeAudioLevels');
            const savedEnablePlayer = await (window as any).electronAPI.getSetting('enableFullscreenPlayer');
            const savedFadeDuration = await (window as any).electronAPI.getSetting('fadeDuration');
            const savedCrossfadeMode = await (window as any).electronAPI.getSetting('crossfadeMode');
            const savedForceAutoPlay = await (window as any).electronAPI.getSetting('forceAutoPlay');
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
              forceAutoPlay: savedForceAutoPlay ?? s.forceAutoPlay,
              playlistsDirectory: savedPlaylistsDir ?? s.playlistsDirectory
            }));
          }
          
          // Extract values needed after loading
          // These variables are set in the else block, so we need to get them from settings or declare them
          let enablePlayerValue = settings.enableFullscreenPlayer;
          let displayIdValue = settings.playerDisplayId;
          let fullscreenValue = settings.playerFullscreen;
          let autoShuffleValue = settings.autoShufflePlaylists;
          
          // If we loaded from grouped settings, extract from there
          if (savedPlayerSettings) {
            enablePlayerValue = savedPlayerSettings.enableFullscreenPlayer ?? enablePlayerValue;
            displayIdValue = savedPlayerSettings.playerDisplayId ?? displayIdValue;
            fullscreenValue = savedPlayerSettings.playerFullscreen ?? fullscreenValue;
            autoShuffleValue = savedPlayerSettings.autoShufflePlaylists ?? autoShuffleValue;
          }
          // Otherwise, values were set in the else block above via setSettings
          
          // Note: Player window is now only created when explicitly requested
          // Removed automatic player window creation to prevent duplicate windows
          
          // Listen for auto-disabled fullscreen event (when Admin and Player are on same display)
          if (isElectron && (window as any).electronAPI?.on) {
            (window as any).electronAPI.on('player-fullscreen-auto-disabled', () => {
              console.log('[PlayerWindow] Fullscreen auto-disabled (Admin and Player on same display)');
              setSettings(s => ({ ...s, playerFullscreen: false }));
              handleUpdateSetting('playerFullscreen', false);
            });
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
              currentVideo: savedQueueState.currentVideo?.title,
              wasPlaying: savedQueueState.isPlaying
            });
            setQueue(savedQueueState.activeQueue);
            setQueueIndex(savedQueueState.queueIndex || 0);
            setPriorityQueue(savedQueueState.priorityQueue || []);
            // Mark that we have a non-empty queue (allows syncing to Supabase)
            if (savedQueueState.activeQueue && savedQueueState.activeQueue.length > 0) {
              syncStateRef.current.lastSyncedHash = JSON.stringify({
                activeQueue: savedQueueState.activeQueue.map((v: Video) => v.id),
                priorityQueue: (savedQueueState.priorityQueue || []).map((v: Video) => v.id),
                queueIndex: savedQueueState.queueIndex || 0
              });
            }
            if (savedQueueState.currentVideo) {
              setCurrentVideo(savedQueueState.currentVideo);
            }
            if (savedQueueState.activePlaylist) {
              setActivePlaylist(savedQueueState.activePlaylist);
            }
            // Always start playback on startup if there's a saved queue (even if it wasn't playing)
            // Wait for indexing to complete first
            waitForIndexingComplete().then(() => {
              console.log('[PlayerWindow] Indexing complete - starting playback from saved queue');
              setTimeout(() => {
                // If there's a current video, play it
                if (savedQueueState.currentVideo) {
                  console.log('[PlayerWindow] Playing saved current video:', savedQueueState.currentVideo.title);
                  (window as any).electronAPI.controlPlayerWindow('play', savedQueueState.currentVideo);
                  setIsPlaying(true);
                } else if (savedQueueState.activeQueue && savedQueueState.activeQueue.length > 0) {
                  // No current video - trigger SKIP once to start playback of next song in active_queue
                  console.log('[PlayerWindow] No saved current video - triggering SKIP to start playback');
                  (window as any).electronAPI.sendQueueCommand?.({ action: 'next' });
                }
              }, 500);
            });
          } else {
            // No saved queue - load last active playlist and auto-play
            const savedActivePlaylist = await (window as any).electronAPI.getSetting('activePlaylist');
            const playlistToLoad = savedActivePlaylist || findDefaultPlaylist(loadedPlaylists);
            
            if (playlistToLoad && loadedPlaylists[playlistToLoad]) {
              console.log('[PlayerWindow] Auto-loading playlist:', playlistToLoad);
              setActivePlaylist(playlistToLoad);
              const playlistTracks = loadedPlaylists[playlistToLoad] || [];
              const shouldShuffle = autoShuffleValue ?? true;
              const finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks];
              
              // Load playlist into main process queue (preserve any existing current video)
              if (isElectron && finalTracks.length > 0) {
                // Get current queue state to preserve currently playing video
                (window as any).electronAPI.invoke?.('get-queue-state').then((queueState: any) => {
                  const currentQueue = queueState?.activeQueue || [];
                  const preservedVideo = (currentQueue.length > 0 && queueState?.isPlaying) ? currentQueue[0] : null;

                  if (preservedVideo) {
                    console.log('[PlayerWindow] Preserving currently playing video during initial load:', preservedVideo.title);
                  }

                  // Apply URL conversion to playlist tracks (same as sendPlayCommand)
                  const isDevMode = typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost');
                  const convertedTracks = finalTracks.map(video => {
                    if (!isDevMode) return video;

                    let convertedVideo = { ...video };
                    const videoPath = video.src || video.path || (video as any).file_path;
                    if (videoPath && videoPath.startsWith('file://')) {
                      try {
                        const url = new URL(videoPath);
                        let cleanPath = url.pathname;

                        // Convert file:// to djamms:// for Electron protocol handling
                        const djammsUrl = `djamms://${cleanPath}`;

                        convertedVideo = {
                          ...video,
                          src: djammsUrl,
                          path: cleanPath
                        };

                        console.log('[PlayerWindow] 🔄 Converted playlist video URL:', {
                          title: video.title,
                          originalSrc: videoPath,
                          newSrc: djammsUrl
                        });
                      } catch (error) {
                        console.warn('[PlayerWindow] Failed to convert playlist video URL:', error);
                      }
                    }
                    return convertedVideo;
                  });

                  // Clear queue in main process
                  (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });

                  // If we have a preserved video, add it back at index 0
                  if (preservedVideo) {
                    (window as any).electronAPI.sendQueueCommand?.({
                      action: 'add_to_queue',
                      payload: { video: preservedVideo }
                    });
                  }

                  // Add converted playlist videos to main process queue
                  convertedTracks.forEach((video) => {
                    (window as any).electronAPI.sendQueueCommand?.({
                      action: 'add_to_queue',
                      payload: { video }
                    });
                  });

                  // Wait for indexing to complete, then wait for admin console readiness
                  waitForIndexingComplete().then(async () => {
                    console.log('[PlayerWindow] Indexing complete - waiting for admin console and queue setup');

                    // Mark active queue as populated
                    setActiveQueuePopulated(true);

                    // Wait for admin console to be ready before initializing player window
                    const waitForReady = () => {
                      if (adminConsoleReady && !playerWindowInitializing) {
                        console.log('[PlayerWindow] Admin console ready and queue populated - starting auto-play');
                        initializePlayerWindow();
                      } else {
                        console.log('[PlayerWindow] Waiting for admin console readiness...');
                        setTimeout(waitForReady, 500);
                      }
                    };

                    waitForReady();
                  });
                }).catch((error: any) => {
                  console.error('[PlayerWindow] Failed to get queue state for initial load:', error);
                  // Fallback: clear and load normally
                  (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
                  finalTracks.forEach((video) => {
                    (window as any).electronAPI.sendQueueCommand?.({
                      action: 'add_to_queue',
                      payload: { video }
                    });
                  });
                  // Continue with the indexing wait...
                  waitForIndexingComplete().then(async () => {
                    setActiveQueuePopulated(true);
                    const waitForReady = () => {
                      if (adminConsoleReady && !playerWindowInitializing) {
                        initializePlayerWindow();
                      } else {
                        setTimeout(waitForReady, 500);
                      }
                    };
                    waitForReady();
                  });
                });
              }
              
              // Update local state (will be synced from main process via queue-state event)
              setQueue(finalTracks);
              setQueueIndex(0);
            }
          }
        } catch (error) {
          console.error('[PlayerWindow] Failed to load playlists:', error);
          hasIndexedRef.current = false; // Reset on error to allow retry
          // Retry once after error
          if (retryCount === 0) {
            setTimeout(() => loadData(1), 1000);
          }
        }
      } else {
        // Only go to web mode if we're definitely not in Electron
        const isElectronEnv = typeof window !== 'undefined' && (
          (window as any).process?.versions?.electron || 
          navigator.userAgent.toLowerCase().includes('electron')
        );
        
        if (isElectronEnv) {
          // Still in Electron but electronAPI not ready - wait a bit more
          console.warn(`[PlayerWindow] ⚠️ Electron environment detected but electronAPI not available. Waiting... (attempt ${retryCount + 1})`);
          if (retryCount < 20) {
            const delay = Math.min(300 * (retryCount + 1), 3000);
            setTimeout(() => loadData(retryCount + 1), delay);
            return;
          } else {
            console.error('[PlayerWindow] ❌ electronAPI never became available after 20 attempts. Check if Electron main process is running.');
            hasIndexedRef.current = true; // Prevent infinite retries
            return; // Don't fall through to web mode
          }
        }
        
        // Web mode - use __PLAYLISTS__ if available (only if not in Electron)
        hasIndexedRef.current = true;
        const webPlaylists = (window as any).__PLAYLISTS__ || {};
        console.log('[PlayerWindow] Web mode - loaded playlists:', Object.keys(webPlaylists).length, 'playlists');
        setPlaylists(webPlaylists);
        localSearchService.indexVideos(webPlaylists);
      }
    };
    loadData();

  // Check if Supabase playlist names need migration due to folder name changes
  if (isElectron && supabaseInitialized) {
    migrateSupabasePlaylistNames(playlists);
  }

  // Mark admin console as ready AFTER all initialization is complete
  console.log('[PlayerWindow] ✅ Admin console initialization complete - marking as ready');
  setAdminConsoleReady(true);
  }, []); // Empty deps - only run once on mount, but check electronAPI availability inside

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
    if (!isElectron || !(window as any).electronAPI) return;
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
    // If forceAutoPlay is enabled, prevent pause
    if (settings.forceAutoPlay) {
      console.log('[PlayerWindow] Force Auto-Play is enabled - pause is disabled');
      return;
    }
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
      isCommandPendingRef.current = true;
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('resume');
      }
      setIsPlaying(true);
      setCurrentTab('queue'); // Auto-switch to Queue tab
      // Reset command pending flag after a delay
      setTimeout(() => {
        isCommandPendingRef.current = false;
      }, 1000);
    } else if (queue.length > 0) {
      playVideoAtIndex(0);
      setCurrentTab('queue'); // Auto-switch to Queue tab
    }
  };

  // Send skip command to Player Window - triggers fade-out, then video end
  const sendSkipCommand = useCallback(() => {
    console.log('[PlayerWindow] Sending skip command to Player Window');
    isCommandPendingRef.current = true;
    if (isElectron) {
      (window as any).electronAPI.controlPlayerWindow('skip');
    }
    setCurrentTab('queue'); // Auto-switch to Queue tab
    // Reset command pending flag after a delay (skip takes time)
    setTimeout(() => {
      isCommandPendingRef.current = false;
    }, 3000);
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

  // Track last play command to prevent duplicates during initialization
  const lastPlayCommandRef = useRef<{ videoId: string; timestamp: number } | null>(null);
  const PLAY_COMMAND_DEBOUNCE_MS = 1000; // Prevent duplicate play commands within 1 second

  // Send play command to Player Window (the ONLY player - handles all audio/video)
  const sendPlayCommand = useCallback((video: Video) => {
    if (isElectron) {
      // Prevent duplicate play commands for the same video within debounce window
      const videoId = video.id || video.src || video.title;
      const now = Date.now();

      if (lastPlayCommandRef.current &&
          lastPlayCommandRef.current.videoId === videoId &&
          (now - lastPlayCommandRef.current.timestamp) < PLAY_COMMAND_DEBOUNCE_MS) {
        console.log('🎬 [PlayerWindow] Skipping duplicate play command for:', video.title, '(within debounce window)');
        return;
      }

      // Update the last command tracking
      lastPlayCommandRef.current = { videoId, timestamp: now };
      // Convert file:// URLs to djamms:// in dev mode BEFORE sending to player window
      const isDevMode = typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost');
      let videoToSend = { ...video };
      
      const videoPath = video.src || video.path || (video as any).file_path;
      if (videoPath && isDevMode) {
        // Extract the actual file path from file:// URL
        let cleanPath: string;
        
        if (videoPath.startsWith('file://')) {
          // Parse the file:// URL properly
          try {
            const url = new URL(videoPath);
            cleanPath = url.pathname;
            // On macOS, remove the leading slash (file:///Users/... -> /Users/...)
            if (process.platform === 'darwin' && cleanPath.startsWith('/')) {
              // Keep the leading slash for absolute paths on macOS
              // file:///Users/... is correct, pathname is /Users/...
            }
          } catch (e) {
            // Fallback: simple string replacement
            cleanPath = videoPath.substring(7); // Remove 'file://' prefix
          }
        } else {
          // Already a plain path
          cleanPath = videoPath.replace(/\\/g, '/');
        }
        
        // Use the path directly without encoding - the protocol handler will handle it
        // DO NOT use encodeURIComponent() as it double-encodes slashes
        const djammsUrl = `djamms://${cleanPath}`;
        
        console.log('✅ [PlayerWindow] Converting file:// to djamms:// (FIXED - no double encoding)');
        console.log('✅ [PlayerWindow] Original path:', videoPath);
        console.log('✅ [PlayerWindow] Clean path:', cleanPath);
        console.log('✅ [PlayerWindow] djamms:// URL:', djammsUrl);
        
        // Update the video object with djamms:// URL
        videoToSend = {
          ...video,
          src: djammsUrl,
          path: cleanPath // Keep clean path for reference
        };
      }
      
      console.log('🎬 [PlayerWindow] Sending play command to Player Window:', {
        title: videoToSend.title,
        artist: videoToSend.artist,
        path: videoToSend.path || videoToSend.src,
        src: videoToSend.src,
        videoId: videoToSend.id,
        timestamp: new Date().toISOString()
      });
      
      try {
        (window as any).electronAPI.controlPlayerWindow('play', videoToSend);
        console.log('🎬 [PlayerWindow] Play command sent successfully');
      } catch (error) {
        console.error('🚨 [PlayerWindow] Failed to send play command:', error);
        console.error('🚨 [PlayerWindow] Video that failed:', videoToSend);
      }
    } else {
      console.warn('[PlayerWindow] Not in Electron - cannot send play command');
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
    
    // Log current state before requesting next video
    console.log('[PlayerWindow] 🎬 Requesting next video from orchestrator');
    console.log('[PlayerWindow] 🎬 Current state - Priority queue:', priorityQueueRef.current.length, 'items:', priorityQueueRef.current.map(v => v?.title || 'unknown').join(', '));
    console.log('[PlayerWindow] 🎬 Current state - Active queue:', queueRef.current.length, 'items, index:', queueIndexRef.current);
    console.log('[PlayerWindow] 🎬 Current state - Now playing:', currentVideo?.title, 'from priority:', isFromPriorityQueue);
    
    // Reset watchdog state since we're initiating a new video
    watchdogCheckCountRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    
    // Send IPC command to main orchestrator - it will handle queue rotation and broadcast state
    // The main process checks priority queue first, then active queue
    // Priority queue items are sent to main process when added (via onQueueAdd or handleAddToPriorityQueue)
    if (isElectron) {
      (window as any).electronAPI.sendQueueCommand?.({ action: 'next' });
    }
  }, [isElectron, currentVideo, isFromPriorityQueue]);

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

  const handlePlayButtonClick = async (e: React.MouseEvent, playlistName: string) => {
    e.stopPropagation();

    // Refresh playlists from disk before showing load dialog
    if (isElectron) {
      try {
        const { playlists: refreshedPlaylists } = await (window as any).electronAPI.getPlaylists();
        if (refreshedPlaylists) {
          setPlaylists(refreshedPlaylists);
          localSearchService.indexVideos(refreshedPlaylists);
        }
      } catch (error) {
        console.warn('[PlayerWindow] Failed to refresh playlists:', error);
      }
    }

    setPlaylistToLoad(playlistName);
    setShowLoadDialog(true);
  };

  const confirmLoadPlaylist = async () => {
    if (playlistToLoad) {
      // Set tab to 'queue' when loading a playlist
      setCurrentTab('queue');

      // Refresh playlists from disk to ensure we have the latest changes
      let refreshedPlaylists = playlists; // Default to current state
      if (isElectron) {
        try {
          const result = await (window as any).electronAPI.getPlaylists();
          if (result?.playlists) {
            refreshedPlaylists = result.playlists;
            setPlaylists(refreshedPlaylists);
            localSearchService.indexVideos(refreshedPlaylists);
          }
        } catch (error) {
          console.warn('[PlayerWindow] Failed to refresh playlists:', error);
        }
      }

      setActivePlaylist(playlistToLoad);
      setSelectedPlaylist(null);
      const playlistTracks = refreshedPlaylists[playlistToLoad] || [];
      const finalTracks = Array.isArray(playlistTracks)
        ? (settings.autoShufflePlaylists ? shuffleArray(playlistTracks) : [...playlistTracks])
        : [];
      
      // Load playlist preserving current playing video (index 0) and priority queue
      if (isElectron && finalTracks.length > 0) {
        console.log('[PlayerWindow] Loading playlist: preserving index 0, clearing from index 1 onwards');
        console.log('[PlayerWindow] DEBUG: finalTracks length:', finalTracks.length, 'playlist name:', playlistToLoad);

        // Mark playlist loading as in progress to prevent Supabase polling interference
        playlistLoadingInProgressRef.current = true;

        // Get current queue state from main process
        console.log('[PlayerWindow] DEBUG: About to call get-queue-state, electronAPI available:', !!(window as any).electronAPI);
        (window as any).electronAPI.invoke?.('get-queue-state').then((queueState: any) => {
          console.log('[PlayerWindow] DEBUG: get-queue-state promise resolved');
          console.log('[PlayerWindow] DEBUG: Raw queueState response:', queueState);
          const currentQueue = queueState?.activeQueue || [];
          const currentPriorityQueue = queueState?.priorityQueue || [];

          console.log('[PlayerWindow] Current queue state for playlist load:', {
            activeQueueLength: currentQueue.length,
            priorityQueueLength: currentPriorityQueue.length,
            nowPlaying: queueState?.nowPlaying?.title,
            isPlaying: queueState?.isPlaying,
            queueStateType: typeof queueState,
            hasActiveQueue: !!queueState?.activeQueue,
            activeQueueType: typeof queueState?.activeQueue
          });

          // Preserve index 0 (currently playing video) - DO NOT MODIFY INDEX 0
          const preservedVideo = currentQueue.length > 0 ? currentQueue[0] : null;

          if (preservedVideo) {
            console.log('[PlayerWindow] Preserving currently playing video at index 0:', preservedVideo.title);
          }

          // Apply URL conversion to playlist tracks (same as sendPlayCommand)
          const isDevMode = typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost');
          const convertedTracks = finalTracks.map(video => {
            if (!isDevMode) return video;

            let convertedVideo = { ...video };
            const videoPath = video.src || video.path || (video as any).file_path;
            if (videoPath && videoPath.startsWith('file://')) {
              try {
                const url = new URL(videoPath);
                let cleanPath = url.pathname;

                // Convert file:// to djamms:// for Electron protocol handling
                const djammsUrl = `djamms://${cleanPath}`;

                convertedVideo = {
                  ...video,
                  src: djammsUrl,
                  path: cleanPath
                };

                console.log('[PlayerWindow] 🔄 Converted playlist video URL:', {
                  title: video.title,
                  originalSrc: videoPath,
                  newSrc: djammsUrl
                });
              } catch (error) {
                console.warn('[PlayerWindow] Failed to convert playlist video URL:', error);
              }
            }
            return convertedVideo;
          });

          // Clear active queue from index 1 onwards (preserve index 0)
          // Remove items from the end backwards to avoid index shifting issues
          console.log('[PlayerWindow] DEBUG: Checking queue clearing - currentQueue.length:', currentQueue.length, 'condition:', currentQueue.length > 1);
          if (currentQueue.length > 1) {
            console.log('[PlayerWindow] Clearing active queue from index 1 onwards:', currentQueue.length - 1, 'items');
            for (let i = currentQueue.length - 1; i >= 1; i--) {
              console.log('[PlayerWindow] DEBUG: Sending remove_from_queue for index', i);
              (window as any).electronAPI.sendQueueCommand?.({
                action: 'remove_from_queue',
                payload: { index: i }
              });
            }
          } else {
            console.log('[PlayerWindow] DEBUG: No items to clear (queue length <= 1)');
          }

          // Add converted playlist videos to main process queue starting from index 1
          console.log('[PlayerWindow] Adding', convertedTracks.length, 'playlist tracks starting from index 1');
          convertedTracks.forEach((video, index) => {
            console.log('[PlayerWindow] DEBUG: Sending add_to_queue for video:', video.title);
            (window as any).electronAPI.sendQueueCommand?.({
              action: 'add_to_queue',
              payload: { video }
            });
          });

          // Don't manually update local state - let main process broadcasts handle it
          // The main process will broadcast the final correct state after all operations
          console.log('[PlayerWindow] Playlist load commands sent - waiting for main process broadcasts');

          // Set queue index to 0 (this will be overridden by main process broadcasts if needed)
          setQueueIndex(0);
        }).catch((error: any) => {
          console.error('[PlayerWindow] DEBUG: get-queue-state promise rejected:', error);
          console.error('[PlayerWindow] Failed to get queue state for playlist load:', error);
          // Fallback: clear and load normally
          (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
          finalTracks.forEach((video) => {
            (window as any).electronAPI.sendQueueCommand?.({
              action: 'add_to_queue',
              payload: { video }
            });
          });
          setQueue(finalTracks);
          setQueueIndex(0);
        });

          // Mark playlist loading as complete after a delay to allow main process to finish processing
          setTimeout(() => {
            playlistLoadingInProgressRef.current = false;
            console.log('[PlayerWindow] Playlist loading marked as complete');
            console.log('[PlayerWindow] DEBUG: Final queue state after loading:', {
              localQueueLength: queue.length,
              localPriorityQueueLength: priorityQueue.length
            });
          }, 2000); // 2 second delay to ensure all operations complete
      }

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

  // handleScopeChange with additional logic (reset pagination, clear selected playlist)
  const handleScopeChangeLocal = (scope: string) => {
    handleScopeChange(scope); // Use hook's handler
    setSearchLimit(100); // Reset pagination when filter changes
    if (scope !== 'playlist') setSelectedPlaylist(null);
  };

  // Memoize getAllVideos for compatibility (used in some places)
  const allVideos = useMemo((): Video[] => {
    const videos = Object.values(playlists).flat();
    const seen = new Set<string>();
    return videos.filter(video => {
      const key = video.path || video.src || `${video.title}|${video.artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playlists]);
  
  const getAllVideos = (): Video[] => allVideos;
  const getSearchResults = (): Video[] => searchResults;

  // Queue management via IPC (main orchestrator is source of truth)
  const handleClearQueue = () => {
    if (!isElectron) return;
    // Clear both active queue and priority queue
    (window as any).electronAPI.sendQueueCommand?.({ action: 'clear_queue' });
    // Also clear local state
    setQueue([]);
    setPriorityQueue([]);
    setQueueIndex(0);
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
    
    // Check if video already exists in priority queue (prevent duplicates)
    const videoId = popoverVideo.id || popoverVideo.src;
    const alreadyExists = priorityQueue.some(v => (v.id || v.src) === videoId);
    
    if (alreadyExists) {
      console.log('[PlayerWindow] ⚠️ Video already in priority queue, skipping duplicate:', popoverVideo.title);
      setPopoverVideo(null);
      return; // Don't add duplicate
    }
    
    const newPriorityQueue = [...priorityQueue, popoverVideo];
    setPriorityQueue(newPriorityQueue);
    
    // IMPORTANT: Sync to main process queue state (source of truth for playback)
    // Main process will also check for duplicates
    if (isElectron) {
      console.log('[PlayerWindow] Adding video to priority queue in main process:', popoverVideo.title);
      (window as any).electronAPI.sendQueueCommand?.({ 
        action: 'add_to_priority_queue', 
        payload: { video: popoverVideo } 
      });
    }
    
    // Sync to Supabase
    syncState({
      priorityQueue: newPriorityQueue
    }, true);
    setPopoverVideo(null);
  }, [popoverVideo, priorityQueue, syncState, isElectron]);

  const handleClosePopover = useCallback(() => {
    setPopoverVideo(null);
  }, []);

  // Settings
  const handleUpdateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (isElectron) {
      // Save individual setting immediately
      (window as any).electronAPI.setSetting(key, value);
      // Also save entire settings object to ensure consistency
      (window as any).electronAPI.setSetting('playerSettings', { ...settings, [key]: value }).catch((err: any) => {
        console.error('[PlayerWindow] Failed to save player settings:', err);
      });
    }
  };

  // Helper to update overlay setting and save immediately
  const handleUpdateOverlaySetting = useCallback((key: keyof typeof overlaySettings, value: any) => {
    setOverlaySettings(prev => {
      const updated = { ...prev, [key]: value };
      // Save immediately when changed
      if (isElectron) {
        (window as any).electronAPI.setSetting('overlaySettings', updated).catch((err: any) => {
          console.error('[PlayerWindow] Failed to save overlay settings:', err);
        });
        // Also send to player window immediately
        (window as any).electronAPI.controlPlayerWindow('updateOverlaySettings', updated);
      }
      return updated;
    });
  }, [isElectron]);

  // Helper to update kiosk setting and save immediately
  const handleUpdateKioskSetting = useCallback((key: keyof typeof kioskSettings, value: any) => {
    setKioskSettings(prev => {
      const updated = { ...prev, [key]: value };
      // Save immediately when changed
      if (isElectron) {
        (window as any).electronAPI.setSetting('kioskSettings', updated).catch((err: any) => {
          console.error('[PlayerWindow] Failed to save kiosk settings:', err);
        });
      }
      return updated;
    });
  }, [isElectron]);

  // Video end handler - called when Player Window notifies us video ended
  // Uses refs to avoid stale closure issues with IPC listener
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const priorityQueueRef = useRef(priorityQueue);
  
  // Consolidated sync state management (replaces 7+ individual flags)
  const syncStateRef = useRef({
    isSyncing: false, // Prevents concurrent/recursive syncs
    lastSyncedHash: '', // Tracks last synced queue hash for change detection
    lastFullStateHash: '', // Tracks full state hash (queue + other state) for change detection
    lastMainProcessHash: '', // Tracks last queue from main process to prevent recursion
    lastSkipLogTime: 0, // Throttles skip log messages to reduce spam
    lastVideoId: '', // Tracks last video ID for change detection
    isExplicitSync: false, // Flag to indicate we're doing an explicit sync (prevents useEffect from skipping)
    lastSyncTime: 0, // Tracks when we last synced to prevent rapid successive syncs
    syncDebounceTimeout: null as NodeJS.Timeout | null, // Debounce timeout for syncs
    lastPlaybackSyncTime: 0, // Tracks when we last synced playback position
    lastSyncedPlaybackPosition: 0, // Tracks last synced playback position
    isReceivingExternalUpdate: false, // Flag to prevent syncing when receiving external state updates
    lastSyncedStatus: null as 'playing' | 'paused' | null // Track last synced status to prevent unnecessary syncs
  });
  
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

  // Track the last preloaded video ID to prevent duplicate preloads
  const lastPreloadedVideoIdRef = useRef<string | null>(null);

  // Request initial state (only once per component mount)
  const initialStateRequestedRef = useRef(false);

  // Reset preload tracking when current video changes (allows re-preloading if video loops back)
  useEffect(() => {
    if (currentVideo?.id) {
      // Reset preload tracking when video changes, so next video can be preloaded
      // This allows the same video to be preloaded again if it comes back in the queue
      lastPreloadedVideoIdRef.current = null;
    }
  }, [currentVideo?.id]);

  // Preload the next video when it changes (after current video starts playing)
  // This maintains a single queue buffer (up-next video) for smoother playback
  useEffect(() => {
    if (!nextVideoToPreload || !isElectron) return;
    
    // Only preload if we have a current video playing or about to play
    // This prevents unnecessary preloads when queue is empty
    if (!currentVideo && !isPlaying) return;
    
    // Prevent duplicate preloads of the same video
    const videoId = nextVideoToPreload.id;
    if (videoId === lastPreloadedVideoIdRef.current) {
      return; // Already preloaded this video
    }
    
    // Small delay to let current video start loading first (if playing)
    // If not playing yet, preload immediately
    const delay = isPlaying ? 1000 : 100;
    const preloadTimer = setTimeout(() => {
      console.log('[PlayerWindow] 📥 Preloading next video:', nextVideoToPreload.title);
      try {
        lastPreloadedVideoIdRef.current = videoId; // Mark as preloaded
        (window as any).electronAPI.controlPlayerWindow('preload', nextVideoToPreload);
      } catch (error) {
        console.warn('[PlayerWindow] Preload failed:', error);
        lastPreloadedVideoIdRef.current = null; // Reset on error to allow retry
      }
    }, delay);
    
    return () => clearTimeout(preloadTimer);
  }, [nextVideoToPreload, isElectron]); // Only re-preload when nextVideoToPreload changes

  const handleVideoEnd = useCallback(() => {
    const endTime = new Date().toISOString();
    console.log('[PlayerWindow] Video ended - calling playNextVideo');
    console.log('⏹️ [PlayerWindow] Video ended - Details:', {
      currentVideo: currentVideo?.title,
      artist: currentVideo?.artist,
      playbackDuration: playbackDuration,
      playbackTime: playbackTime,
      timestamp: endTime
    });
    
    // Check if video actually played or if it failed immediately
    if (playbackTime < 1 && playbackDuration > 0) {
      console.warn('⚠️ [PlayerWindow] Video ended immediately (likely failed to play):', {
        title: currentVideo?.title,
        playbackTime,
        playbackDuration
      });
      // If video failed to play, still advance to next (don't get stuck)
      // But add a small delay to ensure cleanup is complete
      setTimeout(() => {
        playNextVideo();
      }, 100);
      return;
    } else if (playbackTime < 1 && playbackDuration === 0) {
      console.error('🚨 [PlayerWindow] Video ended with 0 duration - MEDIA_ERR_SRC_NOT_SUPPORTED likely:', {
        title: currentVideo?.title,
        path: currentVideo?.path || currentVideo?.src,
        src: currentVideo?.src
      });
      // If video has 0 duration, advance to next with delay
      setTimeout(() => {
        playNextVideo();
      }, 100);
      return;
    }
    
    // Use unified playNextVideo which checks priority queue first
    // For normal video end, advance immediately
    playNextVideo();
    // Note: Preloading of next video is handled automatically by the useEffect
    // that watches nextVideoToPreload, which updates when queue advances
  }, [playNextVideo, currentVideo, playbackDuration, playbackTime]);

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
        // Set flag to prevent status sync while processing external updates
        syncStateRef.current.isReceivingExternalUpdate = true;

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

        // Clear the external update flag after processing
        setTimeout(() => {
          syncStateRef.current.isReceivingExternalUpdate = false;
        }, 100);
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
          console.error('[Watchdog] 🚨 PLAYBACK STALL DETECTED - Setting isPlaying=false and triggering recovery skip!');
          console.error(`[Watchdog] Current video: ${currentVideo?.title}, time stuck at: ${currentPlaybackTime.toFixed(1)}s`);

          // Set isPlaying to false to reflect actual playback state
          setIsPlaying(false);

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
      console.log('[PlayerWindow] DEBUG: Received queue state broadcast:', {
        activeQueueLength: state.activeQueue?.length || 0,
        priorityQueueLength: state.priorityQueue?.length || 0,
        nowPlaying: state.nowPlaying?.title || 'none'
      });
      if (state) {
        // Set flag to prevent status sync while processing external updates
        syncStateRef.current.isReceivingExternalUpdate = true;

        // ARCHITECTURE: Index 0 is always now-playing - no queueIndex needed
        // Store the queue state we're about to set (for state-based sync detection)
        const mainProcessQueueHash = JSON.stringify({
          activeQueue: (state.activeQueue || []).map((v: Video) => v.id), // Array preserves order
          priorityQueue: (state.priorityQueue || []).map((v: Video) => v.id) // Array preserves order
        });
        
        // CRITICAL: Don't set lastMainProcessHash yet - we'll set it AFTER we check if we need explicit sync
        // This prevents the useEffect from skipping when we explicitly sync
        
        // Update local state from authoritative main process state
        // CRITICAL: Store the queue data before updating state so we can use it for sync
        // Must include FULL ID SEQUENCE (array) to detect order changes, not just content
        const prevQueueHash = JSON.stringify({
          activeQueue: queueRef.current.map(v => v.id), // Array preserves order
          priorityQueue: priorityQueueRef.current.map(v => v.id), // Array preserves order
          queueIndex: queueIndexRef.current
        });
        
        if (state.activeQueue) {
          setQueue(state.activeQueue);
          queueRef.current = state.activeQueue;
        }
        // Always update priority queue from main process state (even if empty array)
        // This ensures we preserve the priority queue when it's explicitly preserved in main process
        if (state.priorityQueue !== undefined) {
          setPriorityQueue(state.priorityQueue);
          priorityQueueRef.current = state.priorityQueue;
        }
        
        // CRITICAL: Check if both queues are empty FIRST to prevent any sync logic when empty
        const bothQueuesEmpty = (!state.activeQueue || state.activeQueue.length === 0) && 
                                 (!state.priorityQueue || state.priorityQueue.length === 0) &&
                                 (!queueRef.current || queueRef.current.length === 0) &&
                                 (!priorityQueueRef.current || priorityQueueRef.current.length === 0);
        
        // Check if queue content OR ORDER changed (for shuffle/move detection) - only if queues have content
        // CRITICAL: Must include FULL ID SEQUENCE (not just IDs) to detect order changes (shuffle, move)
        // JSON.stringify of array preserves order, so this will detect both content AND order changes
        // ARCHITECTURE: Index 0 is always now-playing - no queueIndex in hash
        const newQueueHash = JSON.stringify({
          activeQueue: (state.activeQueue || queueRef.current).map((v: Video) => v.id), // Array preserves order
          priorityQueue: (state.priorityQueue || priorityQueueRef.current).map((v: Video) => v.id) // Array preserves order
        });
        // CRITICAL: Only consider queueContentChanged if queues are NOT empty
        // When both queues are empty, queueContentChanged is meaningless and causes infinite loops
        // This hash comparison detects BOTH content changes (add/remove) AND order changes (shuffle/move)
        const queueContentChanged = bothQueuesEmpty ? false : (prevQueueHash !== newQueueHash);
        
        // ARCHITECTURE: Index 0 is always now-playing
        // Use activeQueue[0] as the current video (not queueIndex)
        const newVideo: Video | null = (state.activeQueue && state.activeQueue.length > 0) 
          ? state.activeQueue[0]  // Index 0 is always now-playing
          : (state.currentVideo || state.nowPlaying || null); // Fallback to nowPlaying if queue empty
        
        // CRITICAL: Prevent infinite loops - check if we're already syncing or if this matches what we just synced
        const isAlreadySyncing = syncStateRef.current.isSyncing;
        const matchesLastSynced = mainProcessQueueHash === syncStateRef.current.lastMainProcessHash;
        
        // ARCHITECTURE: Index 0 is always now-playing - always set queueIndex to 0
        setQueueIndex(0);
        queueIndexRef.current = 0;
        
        // Check if queue content changed (shuffle, move, add, remove)
        // Also check if current video changed (index 0 changed)
        const prevVideoId = currentVideoRef.current?.id || currentVideoRef.current?.src;
        const newVideoId = newVideo?.id || newVideo?.src;
        const videoChanged = prevVideoId !== newVideoId;
        
        // AGGRESSIVE FIX: When both queues are empty, completely skip sync
        // Also add debounce: don't sync if we synced within the last 1000ms
        const now = Date.now();
        const recentlySynced = (now - syncStateRef.current.lastSyncTime) < 1000;
        
        // CRITICAL: Sync if queue content changed OR current video changed (index 0 changed)
        const shouldSync = !isAlreadySyncing && 
                          !matchesLastSynced &&
                          !recentlySynced &&
                          !bothQueuesEmpty &&
                          (queueContentChanged || videoChanged);
        
        if (shouldSync) {
          const changeType = videoChanged ? 'video changed (advanced)' : (queueContentChanged ? 'content changed (shuffle/move)' : 'updated');
          console.log(`[PlayerWindow] Queue ${changeType} - explicitly syncing with full queue data to WEBADMIN`);
          
          // CRITICAL: Clear any pending debounce timeout
          if (syncStateRef.current.syncDebounceTimeout) {
            clearTimeout(syncStateRef.current.syncDebounceTimeout);
            syncStateRef.current.syncDebounceTimeout = null;
          }
          
          // CRITICAL: Set lastMainProcessHash IMMEDIATELY to prevent recursion
          syncStateRef.current.lastMainProcessHash = mainProcessQueueHash;
          syncStateRef.current.isExplicitSync = true;
          syncStateRef.current.lastSyncTime = now;
          
          // Explicitly sync with full queue data - this ensures WEBADMIN receives active_queue
          syncStateRef.current.syncDebounceTimeout = setTimeout(() => {
            syncState({
              activeQueue: state.activeQueue || queueRef.current,
              priorityQueue: state.priorityQueue || priorityQueueRef.current,
              queueIndex: 0, // Always 0 - index 0 is now-playing
              currentVideo: newVideo
              // Note: Status and isPlaying are synced separately by status sync effect to prevent recursion
            }, true); // immediate = true to bypass debounce
            
            setTimeout(() => {
              syncStateRef.current.isExplicitSync = false;
              syncStateRef.current.syncDebounceTimeout = null;
            }, 200);
          }, 0);
        } else {
          // No explicit sync needed - set lastMainProcessHash IMMEDIATELY
          syncStateRef.current.lastMainProcessHash = mainProcessQueueHash;
        }
        
        // ARCHITECTURE: Index 0 is always now-playing - update currentVideo from activeQueue[0]
        if (newVideo) {
          const newVideoId = newVideo.id || newVideo.src;
          const wasCurrentVideoNull = !currentVideoRef.current;
          const videoChanged = newVideoId !== previousVideoId;
          
          // Always update if video changed OR if currentVideo is null/undefined
          const shouldUpdate = videoChanged || wasCurrentVideoNull;
          
          if (shouldUpdate) {
            console.log('[PlayerWindow] Queue state update - new video (index 0):', newVideo.title, wasCurrentVideoNull ? '(was null, restoring)' : '(changed)');
            setCurrentVideo(newVideo);
            currentVideoRef.current = newVideo;
            previousVideoId = newVideoId;
            
            // CRITICAL: Set isPlaying state BEFORE sending play command to ensure state is synchronized
            if (state.isPlaying) {
              setIsPlaying(true);
              console.log('🎬 [PlayerWindow] Queue state update - Sending play command (isPlaying=true)');
              setTimeout(() => {
                if (newVideo) {
                  sendPlayCommand(newVideo);
                }
              }, 50);
            } else {
              setIsPlaying(false);
            }
            
            // Update refs for debounce checks
            lastPlayedVideoIdRef.current = newVideoId;
            consecutiveFailuresRef.current = 0; // Reset failure count on new video
          }
        } else {
          // Only clear currentVideo if queue is empty and not playing
          const queueIsEmpty = (!state.activeQueue || state.activeQueue.length === 0) && 
                               (!queueRef.current || queueRef.current.length === 0);
          
          if (queueIsEmpty && !state.isPlaying && currentVideoRef.current) {
            console.log('[PlayerWindow] Queue state update - Clearing current video (queue empty, not playing)');
            setCurrentVideo(null);
            currentVideoRef.current = null;
            previousVideoId = null;
          }
          // Otherwise preserve current video (may be transitioning)
        }
        
        // Always update isPlaying based on actual playback state from fullscreen window
        if (typeof state.isPlaying === 'boolean') {
          setIsPlaying(state.isPlaying);
        }
        if (state.nowPlayingSource) setIsFromPriorityQueue(state.nowPlayingSource === 'priority');

        // Clear the external update flag after processing
        setTimeout(() => {
          syncStateRef.current.isReceivingExternalUpdate = false;
        }, 100);
      }
    });

    // Request initial state (only once per component mount)
    if (!initialStateRequestedRef.current) {
      initialStateRequestedRef.current = true;
      (window as any).electronAPI.getQueueState?.().then(async (state: any) => {
      if (state) {
        if (state.activeQueue) {
          setQueue(state.activeQueue);
          queueRef.current = state.activeQueue;
        }
        // Always update priority queue from main process state (even if empty array)
        // This ensures we preserve the priority queue when it's explicitly preserved in main process
        if (state.priorityQueue !== undefined) {
          setPriorityQueue(state.priorityQueue);
          priorityQueueRef.current = state.priorityQueue;
        }
        if (typeof state.queueIndex === 'number') {
          setQueueIndex(state.queueIndex);
          queueIndexRef.current = state.queueIndex;
        }
        // ARCHITECTURE: Index 0 is always now-playing - use activeQueue[0] as current video
        // CRITICAL: Set isPlaying BEFORE sending play command to ensure state synchronization
        if (typeof state.isPlaying === 'boolean') {
          setIsPlaying(state.isPlaying);
        }
        
        if (state.activeQueue && state.activeQueue.length > 0) {
          const video = state.activeQueue[0]; // Index 0 is now-playing
          setCurrentVideo(video);
          currentVideoRef.current = video;
          previousVideoId = video.id || video.src;
          if (state.isPlaying) {
            console.log('🎬 [PlayerWindow] Initial state - Sending play command (isPlaying=true):', video.title);
            sendPlayCommand(video);
          }
        } else if (state.currentVideo || state.nowPlaying) {
          // Fallback to nowPlaying if queue is empty
          const video = state.currentVideo || state.nowPlaying;
          setCurrentVideo(video);
          currentVideoRef.current = video;
          previousVideoId = video.id || video.src;
          if (state.isPlaying) {
            console.log('🎬 [PlayerWindow] Initial state - Sending play command (isPlaying=true):', video.title);
            sendPlayCommand(video);
          }
        }
        if (state.nowPlayingSource) setIsFromPriorityQueue(state.nowPlayingSource === 'priority');
        
        // ⚠️ REMOVED: Player should NEVER pull queue state from Supabase
        // The Player is the single source of truth for active_queue
        // It should only PUSH its state to Supabase, never PULL from it
        // The only exception is loading initial state on app startup (handled separately)

        // REMOVED: Supabase polling logic - Player should never pull queue state
      }
    });
    } // Close the initialStateRequestedRef check
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isElectron, sendPlayCommand, supabaseInitialized]);

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

  // Save all player settings to Electron store when they change (debounced)
  // This ensures settings are saved even if changed directly via setSettings
  useEffect(() => {
    if (!isElectron) return;
    
    const timeoutId = setTimeout(() => {
      // Save entire settings object to ensure all settings are persisted
      (window as any).electronAPI.setSetting('playerSettings', settings).catch((err: any) => {
        console.error('[PlayerWindow] Failed to save player settings:', err);
      });
    }, 1000); // Debounce saves by 1 second
    
    return () => clearTimeout(timeoutId);
  }, [isElectron, settings]);

  // Force Auto-Play logic: Auto-resume if paused >2s, skip if no video >2s
  useEffect(() => {
    // Check using ref to avoid stale closure
    if (!settingsRef.current.forceAutoPlay || !playerReady) {
      // Clear any existing timer
      if (forceAutoPlayTimerRef.current) {
        clearTimeout(forceAutoPlayTimerRef.current);
        forceAutoPlayTimerRef.current = null;
      }
      return;
    }

    // Clear previous timer
    if (forceAutoPlayTimerRef.current) {
      clearTimeout(forceAutoPlayTimerRef.current);
    }

    // Set up timer to check after 2 seconds
    forceAutoPlayTimerRef.current = setTimeout(() => {
      // Double-check forceAutoPlay is still enabled
      if (!settingsRef.current.forceAutoPlay) {
        return;
      }

      // Check current state using refs to avoid stale closures
      const currentlyPlaying = isPlayingRef.current;
      const currentVideoLoaded = currentVideoRef.current;
      const commandInProgress = isCommandPendingRef.current;

      // Ignore if command is in progress (skip/play happening)
      if (commandInProgress) {
        console.log('[PlayerWindow] Force Auto-Play: Command in progress, skipping check');
        return;
      }

      // Case 1: Video is loaded but paused for >2 seconds - auto-resume
      if (currentVideoLoaded && !currentlyPlaying) {
        console.log('[PlayerWindow] Force Auto-Play: Video paused for >2s, auto-resuming');
        handleResumePlayback();
        return;
      }

      // Case 2: No video loaded for >2 seconds - skip to next
      if (!currentVideoLoaded && queueRef.current.length > 0) {
        console.log('[PlayerWindow] Force Auto-Play: No video loaded for >2s, skipping to next');
        isCommandPendingRef.current = true;
        playNextVideo();
        // Reset command pending flag after delay
        setTimeout(() => {
          isCommandPendingRef.current = false;
        }, 3000);
        return;
      }
    }, 2000); // 2 second delay

    return () => {
      if (forceAutoPlayTimerRef.current) {
        clearTimeout(forceAutoPlayTimerRef.current);
        forceAutoPlayTimerRef.current = null;
      }
    };
  }, [settings.forceAutoPlay, isPlaying, currentVideo, playerReady, handleResumePlayback, playNextVideo]);

  // REMOVED: Playback position sync - not needed by any endpoints
  // Playback time (elapsed duration) is not required by Web Admin or Kiosk

  // Sync player state to Supabase when it changes (excluding frequent playback position updates)
  // This ensures Web Admin / Kiosk see up-to-date state
  useEffect(() => {
    if (!supabaseInitialized) return;

    // Skip sync if offline (prevents log spam from repeated attempts)
    if (!supabaseOnline) {
      // Silently skip - SupabaseService will queue updates when offline
      return;
    }

    // Prevent concurrent/recursive syncs
    if (syncStateRef.current.isSyncing) {
      return; // Silently skip concurrent syncs
    }

    // Create a hash of queue state to detect if it actually changed
    const queueHash = JSON.stringify({
      activeQueue: queue.map(v => v.id),
      priorityQueue: priorityQueue.map(v => v.id),
      queueIndex
    });

    // Create a hash of other state (excluding playbackTime - not synced, and isPlaying - handled separately)
    const otherStateHash = JSON.stringify({
      currentVideo: currentVideo?.id || null,
      volume: Math.round(volume)
    });

    // Combine hashes for full state comparison
    const fullStateHash = `${queueHash}|${otherStateHash}`;

    // State-based detection: Skip sync if current queue matches what we just received from main process
    // This prevents syncing back to Supabase what we just received from main process
    // CRITICAL: Don't skip if we're doing an explicit sync (isExplicitSync flag is set)
    if (queueHash === syncStateRef.current.lastMainProcessHash &&
        syncStateRef.current.lastMainProcessHash !== '' &&
        !syncStateRef.current.isExplicitSync) {
      return; // Skip queue echo prevention
    }

    // Skip syncing empty queues on initial load (prevents overwriting Supabase with empty queue)
    const queueIsEmpty = queue.length === 0 && priorityQueue.length === 0;
    if (queueIsEmpty && syncStateRef.current.lastSyncedHash === '') {
      return; // Silently skip initial empty queue
    }

    // Skip if state hasn't actually changed (prevents unnecessary syncs)
    const lastFullStateHash = syncStateRef.current.lastFullStateHash || '';
    if (fullStateHash === lastFullStateHash && !syncStateRef.current.isExplicitSync) {
      return; // State hasn't changed, skip sync
    }

    console.log(`[PlayerWindow] 📤 Syncing state to Supabase: ${queue.length} active, ${priorityQueue.length} priority items, queueIndex: ${queueIndex}`);

    // Set syncing flag to prevent recursion
    syncStateRef.current.isSyncing = true;

    // Detect queue advancement: if queueIndex changed, force immediate sync
    const prevQueueIndex = queueIndexRef.current;
    const queueAdvanced = prevQueueIndex !== queueIndex;
    
    // Detect if queue content changed (not just index)
    const prevQueueHash = syncStateRef.current.lastSyncedHash || '';
    const queueContentChanged = queueHash !== prevQueueHash;
    
    // Update refs BEFORE calling syncState to prevent re-triggering
    queueIndexRef.current = queueIndex;
    syncStateRef.current.lastSyncedHash = queueHash;
    syncStateRef.current.lastFullStateHash = fullStateHash;
    
    // Clear lastMainProcessHash after we've determined we need to sync
    // This allows future syncs even if the queue matches what we received from main process
    // (e.g., if user makes changes after receiving main process update)
    syncStateRef.current.lastMainProcessHash = '';
    
    // Determine if we need immediate sync:
    // - Queue advanced (queueIndex changed)
    // - Queue content changed (items added/removed/reordered)
    // - Current video changed (now playing changed)
    const needsImmediateSync = queueAdvanced || queueContentChanged || (currentVideo && currentVideo.id !== syncStateRef.current.lastVideoId);
    
    // Track last video ID for change detection
    if (currentVideo) {
      syncStateRef.current.lastVideoId = currentVideo.id;
    }
    
    try {
      if (needsImmediateSync) {
        // #region agent log
        if (isElectron && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'PlayerWindow.tsx:2380',message:'queue or video changed, forcing immediate sync',data:{prevIndex:prevQueueIndex,newIndex:queueIndex,queueLength:queue.length,queueContentChanged,queueAdvanced,currentVideoTitle:currentVideo?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'}).catch(()=>{});
        }
        // #endregion
        if (queueAdvanced) {
          console.log(`[PlayerWindow] Queue advanced: ${prevQueueIndex} → ${queueIndex}, forcing immediate sync`);
        } else if (queueContentChanged) {
          console.log(`[PlayerWindow] Queue content changed, forcing immediate sync`);
        } else {
          console.log(`[PlayerWindow] Current video changed, forcing immediate sync`);
        }
        // Force immediate sync for queue/video changes to ensure Web Admin sees updates immediately
        // Note: Status and isPlaying are synced separately by the status sync effect to prevent recursion
        syncState({
          currentVideo,
          volume: volume / 100,
          activeQueue: queue.map(v => ({
            id: v.id,
            src: v.src,
            path: v.path,
            title: v.title,
            artist: v.artist,
            sourceType: v.src?.startsWith('http') ? 'youtube' : 'local',
            duration: v.duration,
            playlist: v.playlist,
            playlistDisplayName: v.playlistDisplayName
          })),
          priorityQueue: priorityQueue.map(v => ({
            id: v.id,
            src: v.src,
            path: v.path,
            title: v.title,
            artist: v.artist,
            sourceType: v.src?.startsWith('http') ? 'youtube' : 'local',
            duration: v.duration,
            playlist: v.playlist,
            playlistDisplayName: v.playlistDisplayName
          })),
          queueIndex
        }, true); // immediate = true
      } else {
        // Normal sync (debounced) for other state changes (volume, etc.)
        // Note: Status and isPlaying are synced separately by the status sync effect to prevent recursion
        syncState({
          currentVideo,
          volume: volume / 100,
          activeQueue: queue.map(v => ({
            id: v.id,
            src: v.src,
            path: v.path,
            title: v.title,
            artist: v.artist,
            sourceType: v.src?.startsWith('http') ? 'youtube' : 'local',
            duration: v.duration,
            playlist: v.playlist,
            playlistDisplayName: v.playlistDisplayName
          })),
          priorityQueue: priorityQueue.map(v => ({
            id: v.id,
            src: v.src,
            path: v.path,
            title: v.title,
            artist: v.artist,
            sourceType: v.src?.startsWith('http') ? 'youtube' : 'local',
            duration: v.duration,
            playlist: v.playlist,
            playlistDisplayName: v.playlistDisplayName
          })),
          queueIndex
        });
      }
    } finally {
      // Clear syncing flag after a short delay to allow sync to complete
      // Use setTimeout to ensure this happens after any potential state updates
      setTimeout(() => {
        // #region agent log
        if (isElectron && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'PlayerWindow.tsx:2448',message:'Clearing isSyncing flag',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}).catch(()=>{});
        }
        // #endregion
        syncStateRef.current.isSyncing = false;
      }, 100);
    }
  }, [supabaseInitialized, supabaseOnline, currentVideo, volume, queue, priorityQueue, queueIndex]); // Removed isPlaying - status is synced separately

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

      // Force re-index to Supabase even if hash hasn't changed (manual refresh)
      lastIndexedPlaylistsRef.current = ''; // Reset hash to force re-indexing

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
        playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS',
        forceAutoPlay: false
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
  // Memoize to prevent recursion - only recalculate when playlists change
  const playlistList = useMemo(() => {
    const playlistEntries = Object.entries(playlists);
    // Only log when playlists actually change, not on every render
    if (playlistEntries.length > 0) {
      console.log('[PlayerWindow] Playlists updated - count:', playlistEntries.length, 'names:', Object.keys(playlists));
    }
    return playlistEntries.map(([name, videos]) => ({
      name,
      displayName: getPlaylistDisplayName(name),
      count: Array.isArray(videos) ? videos.length : 0
    }));
  }, [playlists]);

  // Get display name for active playlist
  const activePlaylistDisplayName = activePlaylist ? getPlaylistDisplayName(activePlaylist) : 'No Playlist Selected';
  
  // Get display name for playlist to load in dialog
  const playlistToLoadDisplayName = playlistToLoad ? getPlaylistDisplayName(playlistToLoad) : '';

  const currentTrack = currentVideo;

  // Function to migrate Supabase playlist names when folder names change
  const migrateSupabasePlaylistNames = async (currentPlaylists: Record<string, Video[]>) => {
    try {
      console.log('[PlayerWindow] Checking for playlist name migration needs...');

      const supabaseService = getSupabaseService();
      const client = supabaseService.getClient();

      if (!client) {
        console.log('[PlayerWindow] No Supabase client available for migration');
        return;
      }

      // Get videos from Supabase that have playlist names with YouTube IDs
      const { data: videosWithOldNames, error } = await client
        .from('videos')
        .select('id, metadata')
        .eq('player_id', playerId)
        .like('metadata->>playlist', 'PL%');

      if (error) {
        console.error('[PlayerWindow] Error fetching videos for migration:', error);
        return;
      }

      if (!videosWithOldNames || videosWithOldNames.length === 0) {
        console.log('[PlayerWindow] No videos with old playlist names found');
        return;
      }

      console.log(`[PlayerWindow] Found ${videosWithOldNames.length} videos with potential old playlist names`);

      // Create mapping from old names to new names
      const updateOperations = [];

      for (const video of videosWithOldNames) {
        const metadata = video.metadata as any;
        const oldPlaylistName = metadata?.playlist;

        if (!oldPlaylistName) continue;

        // Extract new playlist name by removing YouTube ID
        const youtubeIdMatch = oldPlaylistName.match(/^PL[A-Za-z0-9_-]+[._](.+)$/);
        if (youtubeIdMatch) {
          const newPlaylistName = youtubeIdMatch[1];

          // Check if this new playlist name exists in current playlists
          if (currentPlaylists[newPlaylistName] || currentPlaylists[oldPlaylistName]) {
            // Update the metadata
            const updatedMetadata = {
              ...metadata,
              playlist: newPlaylistName,
              playlistDisplayName: newPlaylistName
            };

            updateOperations.push({
              id: video.id,
              metadata: updatedMetadata
            });
          }
        }
      }

      if (updateOperations.length === 0) {
        console.log('[PlayerWindow] No playlist migrations needed');
        return;
      }

      console.log(`[PlayerWindow] Migrating ${updateOperations.length} video records...`);

      // Perform updates in batches to avoid overwhelming Supabase
      const batchSize = 50;
      let successCount = 0;

      for (let i = 0; i < updateOperations.length; i += batchSize) {
        const batch = updateOperations.slice(i, i + batchSize);

        const promises = batch.map(operation =>
          client
            .from('videos')
            .update({ metadata: operation.metadata })
            .eq('id', operation.id)
        );

        const results = await Promise.all(promises);
        const batchSuccess = results.filter(result => !result.error).length;
        successCount += batchSuccess;

        if (results.some(result => result.error)) {
          console.error('[PlayerWindow] Some updates in batch failed:', results.filter(r => r.error));
        }
      }

      if (successCount > 0) {
        console.log(`[PlayerWindow] ✅ Successfully migrated ${successCount} video records to new playlist names`);
        console.log('[PlayerWindow] Videos should now load properly without MEDIA_ERR_SRC_NOT_SUPPORTED errors');
      }

    } catch (error) {
      console.error('[PlayerWindow] Error during playlist name migration:', error);
    }
  };

  // Function to initialize player window after admin console is ready
  const initializePlayerWindow = async () => {
    if (playerWindowInitializing) {
      console.log('[PlayerWindow] Player window initialization already in progress');
      return;
    }

    setPlayerWindowInitializing(true);

    try {
      console.log('[PlayerWindow] Initializing fullscreen window for auto-play');

      // Create fullscreen window first
      await (window as any).electronAPI.createPlayerWindow(displayIdValue ?? undefined, fullscreenValue ?? true);
      setPlayerWindowOpen(true);

      // Mark player as ready since we have a queue loaded
      if (!playerReadyRef.current) {
        playerReadyRef.current = true;
        setPlayerReady(true);
      }

      console.log('[PlayerWindow] Sending initial play command to fullscreen window');
      // Play first video via main process orchestrator
      (window as any).electronAPI.sendQueueCommand?.({
        action: 'play_at_index',
        payload: { index: 0 }
      });

      // Sync current player state with status for watchdog monitoring
      syncState({
        currentVideo: queue[0] || null,
        volume: volume / 100
        // Note: Status and isPlaying are synced separately by status sync effect to prevent recursion
      });

    } catch (error) {
      console.error('[PlayerWindow] Failed to initialize player window:', error);
    } finally {
      setPlayerWindowInitializing(false);
    }
  };

  // Admin console readiness is now set after full initialization in the main useEffect

  // Sync player status changes with Supabase for watchdog monitoring
  // Only sync when status actually changes, not on every playbackTime update
  // This prevents recursion loops where status keeps toggling
  useEffect(() => {
    if (supabaseInitialized && currentVideo) {
      // Don't sync if we're currently receiving external state updates
      if (syncStateRef.current.isReceivingExternalUpdate) {
        return;
      }

      const playerStatus = isPlaying ? 'playing' : 'paused';
      
      // Only sync status if it actually changed from last sync
      // This prevents recursion loops where status keeps toggling
      if (syncStateRef.current.lastSyncedStatus === playerStatus) {
        // Status hasn't changed - don't sync status
        // Other fields (queue, position, etc.) are synced separately via other syncState calls
        return;
      }

      // Status changed - update the ref and sync
      syncStateRef.current.lastSyncedStatus = playerStatus;
      console.log(`[PlayerWindow] Syncing player status: ${playerStatus} for video: ${currentVideo.title}`);

      // Debounce status sync to prevent rapid toggling
      if (syncStateRef.current.syncDebounceTimeout) {
        clearTimeout(syncStateRef.current.syncDebounceTimeout);
      }

      syncStateRef.current.syncDebounceTimeout = setTimeout(() => {
        // Only sync status - don't include queue/other fields to prevent conflicts with main state sync
        // The main state sync effect handles queue/volume/etc separately
        syncState({
          status: playerStatus,
          isPlaying
        }, true); // immediate = true to ensure status updates quickly
        syncStateRef.current.syncDebounceTimeout = null;
      }, 500); // 500ms debounce to prevent rapid toggling
    }
  }, [currentVideo, isPlaying, supabaseInitialized]); // Only depend on isPlaying and currentVideo - status sync is independent

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
            {settings.forceAutoPlay ? (
              <div className={`control-btn play-btn ${isPlaying ? 'playing' : ''}`} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                backgroundColor: isPlaying ? 'rgba(76, 175, 80, 0.2)' : 'transparent',
                border: isPlaying ? '1px solid rgba(76, 175, 80, 0.5)' : '1px solid var(--yt-spec-10-percent-layer)',
                cursor: 'default',
                pointerEvents: 'none'
              }}>
                <span style={{ 
                  fontSize: '10px', 
                  fontWeight: 600, 
                  color: '#4CAF50',
                  letterSpacing: '0.5px',
                  lineHeight: '1.2'
                }}>
                  AUTO-PLAY
                </span>
                <span style={{ 
                  fontSize: '10px', 
                  fontWeight: 600, 
                  color: '#4CAF50',
                  letterSpacing: '0.5px',
                  lineHeight: '1.2'
                }}>
                  ENABLED
                </span>
              </div>
            ) : (
              <button className={`control-btn play-btn ${!playerReady ? 'disabled' : ''}`} onClick={handlePauseClick} disabled={!playerReady}>
                <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </button>
            )}
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
            <span className="priority-queue-empty">No priority songs queued</span>
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
                {playlistList.length === 0 ? (
                  <div className="playlist-item" style={{ cursor: 'default', opacity: 0.6, padding: '8px' }}>
                    <span className="material-symbols-rounded playlist-icon">playlist_play</span>
                    <span className="playlist-name" style={{ fontStyle: 'italic' }}>
                      {Object.keys(playlists).length === 0 ? 'Loading playlists...' : 'No playlists found'}
                    </span>
                    <span className="playlist-count">0</span>
                  </div>
                ) : (
                  playlistList.map(playlist => (
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
            <QueueTab
              queue={queue}
              queueIndex={queueIndex}
              priorityQueue={priorityQueue}
              currentVideo={currentVideo}
              playbackTime={playbackTime}
              playbackDuration={playbackDuration}
              onQueueItemClick={handleQueueItemClick}
            />
          )}

          {/* Search Tab */}
          {currentTab === 'search' && (
            <SearchTab
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchLoading={searchLoading}
              searchScope={searchScope}
              handleScopeChange={handleScopeChangeLocal}
              selectedPlaylist={selectedPlaylist}
              playlists={playlists}
              searchSort={searchSort}
              setSearchSort={setSearchSort}
              searchResults={searchResults}
              handleVideoClick={handleVideoClick}
              searchTotalCount={searchTotalCount}
              searchLimit={searchLimit}
              setSearchLimit={setSearchLimit}
            />
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
                                await (window as any).electronAPI.createPlayerWindow(settings.playerDisplayId, settings.playerFullscreen);
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
                          // Apply fullscreen setting to ALL existing player windows
                          if (isElectron) {
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
          {/* Connections Tab */}
          {currentTab === 'connections' && (
            <ConnectionsTab playerId={playerId || DEFAULT_PLAYER_ID} />
          )}

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
                      Remove all videos from the active queue and priority queue
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
