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
import { ConnectPlayerModal, usePlayer } from '@shared/ConnectPlayerModal';
import { cleanVideoTitle } from '@shared/video-utils';

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
  const { playerId } = usePlayer();

  // Player state (synced from Supabase)
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [currentVideo, setCurrentVideo] = useState<NowPlayingVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [playbackTime, setPlaybackTime] = useState(0); // Current playback position in seconds
  const [playbackDuration, setPlaybackDuration] = useState(0); // Total duration in seconds

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
  const [showQueuePlayDialog, setShowQueuePlayDialog] = useState(false);
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

  // Subscribe to Supabase player_state updates
  useEffect(() => {
    // Helper to apply state
    const applyState = (state: SupabasePlayerState) => {
      console.log('[WebAdmin] Received player state update:', {
        now_playing: state.now_playing_video?.title,
        is_playing: state.is_playing,
        queue_length: state.active_queue?.length || 0,
        queue_index: state.queue_index,
        priority_length: state.priority_queue?.length || 0
      });
      setPlayerState(state);
      
      // Update local state from Supabase
      // Note: Electron writes 'now_playing_video', not 'now_playing'
      if (state.now_playing_video) {
        setCurrentVideo(state.now_playing_video);
      }
      if (typeof state.is_playing === 'boolean') {
        setIsPlaying(state.is_playing);
      }
      if (state.active_queue) {
        setActiveQueue(state.active_queue);
      }
      if (state.priority_queue) {
        setPriorityQueue(state.priority_queue);
      }
      if (typeof state.queue_index === 'number') {
        setQueueIndex(state.queue_index);
      }
      if (typeof state.volume === 'number') {
        setVolume(Math.round(state.volume * 100));
      }
      // Update playback progress
      if (typeof state.playback_position === 'number') {
        setPlaybackTime(state.playback_position);
      }
      if (typeof state.video_duration === 'number') {
        setPlaybackDuration(state.video_duration);
      }
    };

    // Fetch initial state on mount (realtime subscription only fires on CHANGES)
    const loadInitialState = async () => {
      const state = await getPlayerState(playerId);
      if (state) {
        applyState(state);
      }
    };
    loadInitialState();

    // Then subscribe to real-time changes
    const channel = subscribeToPlayerState(playerId, applyState);

    // unsubscribe() returns a Promise but cleanup must be sync - ignore return value
    return () => { channel.unsubscribe(); };
  }, [playerId]);

  // Monitor Supabase Realtime connection status
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      console.log(`[WebAdmin] Supabase Realtime ${connected ? '✅ connected' : '❌ disconnected'}`);
      setIsConnected(connected);
    });
    return unsubscribe;
  }, []);

  // Load all videos from local_videos table for Browse/Search
  // Also subscribe to changes so we auto-refresh when Electron re-indexes playlists
  useEffect(() => {
    const loadAllVideos = async () => {
      try {
        const videos = await getAllLocalVideos();
        setAllVideos(videos);
        
        // Group videos by playlist (playlist is stored in metadata)
        const grouped: Record<string, SupabaseLocalVideo[]> = {};
        videos.forEach(video => {
          // playlist is in metadata.playlist, not video.playlist
          const metadata = video.metadata as any;
          const playlist = metadata?.playlist || 'Unknown';
          if (!grouped[playlist]) grouped[playlist] = [];
          grouped[playlist].push(video);
        });
        setPlaylists(grouped);
      } catch (error) {
        console.error('Failed to load videos:', error);
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
            // Fetch all videos if not loaded yet
            const videos = await getAllLocalVideos();
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

  // Shuffle helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Send command to player via Supabase (fire-and-forget for non-critical)
  const sendCommand = useCallback(async (type: CommandType, payload?: any) => {
    try {
      await insertCommand(type, payload, 'web-admin', playerId);
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  }, [playerId]);

  // Send overlay settings to Electron when they change
  const updateOverlaySetting = useCallback((key: string, value: number | boolean) => {
    setOverlaySettings(prev => {
      const updated = { ...prev, [key]: value };
      // Send command to player with full settings object
      sendCommand('overlay_settings_update', updated);
      return updated;
    });
  }, [sendCommand]);

  // Update kiosk setting and send command
  const updateKioskSetting = useCallback((key: string, value: string | number | boolean) => {
    setKioskSettings(prev => {
      const updated = { ...prev, [key]: value };
      sendCommand('kiosk_settings_update', updated);
      return updated;
    });
  }, [sendCommand]);

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
    if (isPlaying) {
      setShowPauseDialog(true);
    } else {
      handleResumePlayback();
    }
  };

  const confirmPause = async () => {
    setShowPauseDialog(false);
    setIsPlaying(false); // Optimistic update
    const success = await sendBlockingCommand(() => blockingCommands.pause(playerId));
    if (!success) setIsPlaying(true); // Rollback on failure
  };

  const handleResumePlayback = async () => {
    setIsPlaying(true); // Optimistic update
    const success = await sendBlockingCommand(() => blockingCommands.resume(playerId));
    if (!success) setIsPlaying(false); // Rollback on failure
  };

  const skipTrack = async () => {
    // Don't do optimistic update - let Supabase state sync handle the UI update
    // This prevents double-skip when the optimistic update and state sync both advance
    await sendBlockingCommand(() => blockingCommands.skip(playerId));
  };

  const toggleShuffle = async () => {
    await sendBlockingCommand(() => blockingCommands.queueShuffle(playerId));
  };

  const handleVolumeChange = async (newVolume: number) => {
    setVolume(newVolume);
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
            <button 
              className={`control-btn play-btn ${isCommandPending ? 'btn-loading' : ''}`}
              onClick={handlePauseClick}
              disabled={isCommandPending}
            >
              <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
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
                        <div className="now-playing-playlist">{getPlaylistDisplayName(currentVideo.playlist || '')}</div>
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
                          <td colSpan={5}>Queue is empty. Add tracks from Search or Browse.</td>
                        </tr>
                      ) : (() => {
                        // Reorder: videos after current index first ("up next"), then videos before ("already played")
                        const upNextVideos = activeQueue.slice(queueIndex + 1).map((track, idx) => ({
                          track,
                          originalIndex: queueIndex + 1 + idx,
                          isUpNext: true
                        }));
                        const alreadyPlayedVideos = activeQueue.slice(0, queueIndex).map((track, idx) => ({
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
                            style={{ cursor: 'pointer' }}
                          >
                            <td>{displayIndex + 1}</td>
                            <td className="col-title">{cleanVideoTitle(track.title)}</td>
                            <td>{getDisplayArtist(track.artist)}</td>
                            <td>{track.duration || '—'}</td>
                            <td>{getPlaylistDisplayName(track.playlist || '')}</td>
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
              <div className="search-header">
                <div className="search-input-container">
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
                <div className="search-filters">
                  <select className="filter-select" value={searchScope} onChange={(e) => handleScopeChange(e.target.value)}>
                    <option value="all">All Music</option>
                    {selectedPlaylist && <option value="playlist">Selected Playlist: {getPlaylistDisplayName(selectedPlaylist)}</option>}
                    <option value="no-karaoke">Exclude Karaoke</option>
                    <option value="karaoke">Karaoke Only</option>
                  </select>
                  <select className="filter-select" value={searchSort} onChange={(e) => setSearchSort(e.target.value)}>
                    <option value="az">A-Z</option>
                    <option value="artist">Artist</option>
                    <option value="title">Title</option>
                  </select>
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
                    <label>Fullscreen Mode</label>
                    <div className="button-group">
                      <button 
                        className="action-btn"
                        onClick={() => sendCommand('player_fullscreen_toggle', { fullscreen: true })}
                        disabled={isCommandPending}
                      >
                        <span className="material-symbols-rounded">fullscreen</span>
                        Enter Fullscreen
                      </button>
                      <button 
                        className="action-btn"
                        onClick={() => sendCommand('player_fullscreen_toggle', { fullscreen: false })}
                        disabled={isCommandPending}
                      >
                        <span className="material-symbols-rounded">fullscreen_exit</span>
                        Exit Fullscreen
                      </button>
                    </div>
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
