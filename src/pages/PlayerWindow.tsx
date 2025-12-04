// src/pages/PlayerWindow.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video } from '../types';
import { localSearchService, SearchResult } from '../services';
import { getPlaylistDisplayName, getDisplayArtist } from '../utils/playlistHelpers';
import { useSupabase } from '../hooks/useSupabase';
import { QueueVideoItem } from '../types/supabase';

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

type TabId = 'queue' | 'search' | 'browse' | 'settings' | 'tools';

// Navigation items configuration
const navItems: { id: TabId; icon: string; label: string }[] = [
  { id: 'queue', icon: 'queue_music', label: 'Queue' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'browse', icon: 'library_music', label: 'Browse' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'tools', icon: 'build', label: 'Tools' },
];

export const PlayerWindow: React.FC<PlayerWindowProps> = ({ className = '' }) => {
  // Player state (synced from Player Window via IPC)
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);

  // Playlist/Queue state
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string>('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [queue, setQueue] = useState<Video[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [priorityQueue, setPriorityQueue] = useState<Video[]>([]); // KIOSK requests

  // Search/Browse state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchSort, setSearchSort] = useState('relevance');
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseScope, setBrowseScope] = useState('all');
  const [browseSort, setBrowseSort] = useState('az');

  // UI state
  const [currentTab, setCurrentTab] = useState<TabId>('queue');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null);
  
  // Dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [playlistToLoad, setPlaylistToLoad] = useState<string | null>(null);
  const [showPauseDialog, setShowPauseDialog] = useState(false);

  // Settings
  const [settings, setSettings] = useState({
    autoShufflePlaylists: true,
    normalizeAudioLevels: false,
    enableFullscreenPlayer: true,
    fadeDuration: 2.0,
    playerDisplayId: null as number | null,
    playerFullscreen: false
  });

  // Display management state
  const [availableDisplays, setAvailableDisplays] = useState<DisplayInfo[]>([]);
  const [playerWindowOpen, setPlayerWindowOpen] = useState(false);

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Supabase integration - listen for remote commands from Web Admin / Kiosk
  // This runs in the main window so commands are received even without Player Window open
  const { isInitialized: supabaseInitialized, isOnline: supabaseOnline, syncState } = useSupabase({
    autoInit: isElectron, // Only initialize in Electron environment
    onPlay: (video?: QueueVideoItem) => {
      console.log('[PlayerWindow] Supabase play command received:', video?.title);
      if (video) {
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
      // Check priority queue first (KIOSK requests take precedence)
      if (priorityQueueRef.current.length > 0) {
        const nextVideo = priorityQueueRef.current[0];
        setPriorityQueue(prev => prev.slice(1)); // Remove from priority queue
        setCurrentVideo(nextVideo);
        setIsPlaying(true);
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('play', nextVideo);
        }
        return;
      }
      // Fall back to active queue
      const nextIndex = queueRef.current.length > 0 
        ? (queueIndexRef.current + 1) % queueRef.current.length 
        : 0;
      const nextVideo = queueRef.current[nextIndex];
      if (nextVideo) {
        setQueueIndex(nextIndex);
        setCurrentVideo(nextVideo);
        setIsPlaying(true);
        if (isElectron) {
          (window as any).electronAPI.controlPlayerWindow('play', nextVideo);
        }
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
        const finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks];
        setActivePlaylist(playlistKey);
        setQueue(finalTracks);
        setQueueIndex(0);
        if (finalTracks.length > 0) {
          setCurrentVideo(finalTracks[0]);
          setIsPlaying(true);
          if (isElectron) {
            (window as any).electronAPI.controlPlayerWindow('play', finalTracks[0]);
          }
        }
      }
    }
  });

  // Shuffle helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

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

  // Load playlists and settings on mount
  useEffect(() => {
    const loadData = async () => {
      if (isElectron) {
        try {
          const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
          setPlaylists(loadedPlaylists || {});
          localSearchService.indexVideos(loadedPlaylists || {});
          
          // Index playlists to Supabase via Player Window (for Admin Console / Kiosk search)
          (window as any).electronAPI.controlPlayerWindow('indexPlaylists', loadedPlaylists || {});
          
          // Load all saved settings
          const savedVolume = await (window as any).electronAPI.getSetting('volume');
          if (savedVolume !== undefined) setVolume(Math.round(savedVolume * 100));
          
          const savedDisplayId = await (window as any).electronAPI.getSetting('playerDisplayId');
          const savedFullscreen = await (window as any).electronAPI.getSetting('playerWindowFullscreen');
          const savedAutoShuffle = await (window as any).electronAPI.getSetting('autoShufflePlaylists');
          const savedNormalize = await (window as any).electronAPI.getSetting('normalizeAudioLevels');
          const savedEnablePlayer = await (window as any).electronAPI.getSetting('enableFullscreenPlayer');
          const savedFadeDuration = await (window as any).electronAPI.getSetting('fadeDuration');
          
          setSettings(s => ({
            ...s,
            playerDisplayId: savedDisplayId ?? s.playerDisplayId,
            playerFullscreen: savedFullscreen ?? s.playerFullscreen,
            autoShufflePlaylists: savedAutoShuffle ?? s.autoShufflePlaylists,
            normalizeAudioLevels: savedNormalize ?? s.normalizeAudioLevels,
            enableFullscreenPlayer: savedEnablePlayer ?? s.enableFullscreenPlayer,
            fadeDuration: savedFadeDuration ?? s.fadeDuration
          }));
          
          // Load last active playlist and auto-play
          const savedActivePlaylist = await (window as any).electronAPI.getSetting('activePlaylist');
          const playlistToLoad = savedActivePlaylist || findDefaultPlaylist(loadedPlaylists);
          
          if (playlistToLoad && loadedPlaylists[playlistToLoad]) {
            console.log('[PlayerWindow] Auto-loading playlist:', playlistToLoad);
            setActivePlaylist(playlistToLoad);
            const playlistTracks = loadedPlaylists[playlistToLoad] || [];
            const shouldShuffle = savedAutoShuffle ?? true;
            const finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : [...playlistTracks];
            setQueue(finalTracks);
            setQueueIndex(0);
            if (finalTracks.length > 0) {
              // Small delay to ensure Player Window is ready
              setTimeout(() => {
                setCurrentVideo(finalTracks[0]);
                setIsPlaying(true);
                // Send play command to Player Window (the ONLY player)
                (window as any).electronAPI.controlPlayerWindow('play', finalTracks[0]);
              }, 500);
            }
          }
        } catch (error) {
          console.error('Failed to load data:', error);
        }
      } else {
        const webPlaylists = (window as any).__PLAYLISTS__ || {};
        setPlaylists(webPlaylists);
        localSearchService.indexVideos(webPlaylists);
      }
    };
    loadData();
  }, [isElectron]);
  
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

  // Listen for player window closed event
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    
    const unsubPlayerClosed = api.onPlayerWindowClosed?.(() => {
      setPlayerWindowOpen(false);
    });
    
    return () => {
      unsubPlayerClosed?.();
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
    const unsubVolumeUp = api.onVolumeUp(() => setVolume(v => Math.min(100, v + 10)));
    const unsubVolumeDown = api.onVolumeDown(() => setVolume(v => Math.max(0, v - 10)));
    const unsubPlaylistDir = api.onPlaylistsDirectoryChanged(async () => {
      const { playlists: newPlaylists } = await api.getPlaylists();
      setPlaylists(newPlaylists || {});
      localSearchService.indexVideos(newPlaylists || {});
    });

    return () => {
      unsubToggle?.();
      unsubSkip?.();
      unsubVolumeUp?.();
      unsubVolumeDown?.();
      unsubPlaylistDir?.();
    };
  }, [isElectron, isPlaying]);

  // Player control functions
  const handlePauseClick = () => {
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
  };

  const handleResumePlayback = () => {
    if (currentVideo) {
      if (isElectron) {
        (window as any).electronAPI.controlPlayerWindow('resume');
      }
      setIsPlaying(true);
    } else if (queue.length > 0) {
      playVideoAtIndex(0);
    }
  };

  const skipTrack = () => {
    if (queueIndex < queue.length - 1) {
      playVideoAtIndex(queueIndex + 1);
    }
  };

  const playNext = () => {
    if (queueIndex < queue.length - 1) {
      playVideoAtIndex(queueIndex + 1);
    }
  };

  const toggleShuffle = () => {
    // Shuffle the current queue (keeping current video at position 0)
    if (queue.length > 1) {
      const currentTrack = queue[queueIndex];
      const otherTracks = queue.filter((_, i) => i !== queueIndex);
      const shuffledOthers = shuffleArray(otherTracks);
      const newQueue = [currentTrack, ...shuffledOthers];
      setQueue(newQueue);
      setQueueIndex(0); // Current track is now at index 0
    }
  };

  // Send play command to Player Window (the ONLY player - handles all audio/video)
  const sendPlayCommand = useCallback((video: Video) => {
    if (isElectron) {
      (window as any).electronAPI.controlPlayerWindow('play', video);
    }
  }, [isElectron]);

  const playVideoAtIndex = useCallback((index: number) => {
    const video = queue[index];
    if (video) {
      setQueueIndex(index);
      setCurrentVideo(video);
      setIsPlaying(true);
      // Send to Player Window (the ONLY player)
      sendPlayCommand(video);
    }
  }, [queue, sendPlayCommand]);

  // Playlist functions
  const handlePlaylistClick = (playlistName: string) => {
    setSelectedPlaylist(playlistName);
    setCurrentTab('browse');
    setBrowseScope('playlist'); // Only set to playlist when user explicitly clicks a playlist
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
      const finalTracks = settings.autoShufflePlaylists ? shuffleArray(playlistTracks) : [...playlistTracks];
      setQueue(finalTracks);
      setQueueIndex(0);
      if (finalTracks.length > 0) {
        setCurrentVideo(finalTracks[0]);
        setIsPlaying(true);
        // Send to Player Window (the ONLY player)
        sendPlayCommand(finalTracks[0]);
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
    setCurrentTab(tab);
    if (tab === 'browse') {
      // Default to 'all' when clicking Browse tab directly
      setBrowseScope('all');
      setSelectedPlaylist(null);
    } else {
      setSelectedPlaylist(null);
    }
  };

  const handleScopeChange = (scope: string, isBrowse: boolean) => {
    if (isBrowse) {
      setBrowseScope(scope);
      if (scope !== 'playlist') setSelectedPlaylist(null);
    } else {
      setSearchScope(scope);
      if (scope !== 'playlist') setSelectedPlaylist(null);
    }
  };

  // Filtering and sorting
  const filterByScope = (videos: Video[], scope: string): Video[] => {
    switch (scope) {
      case 'all': return videos;
      case 'no-karaoke': return videos.filter(v => !v.title?.toLowerCase().includes('karaoke'));
      case 'karaoke': return videos.filter(v => v.title?.toLowerCase().includes('karaoke'));
      case 'queue': return queue;
      case 'playlist':
        if (!selectedPlaylist) return [];
        return playlists[selectedPlaylist] || [];
      default: return videos;
    }
  };

  const sortResults = (results: Video[], sortBy: string): Video[] => {
    const sorted = [...results];
    switch (sortBy) {
      case 'artist': return sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      case 'title':
      case 'az': return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      default: return sorted;
    }
  };

  const getAllVideos = (): Video[] => {
    return Object.values(playlists).flat();
  };

  const getSearchResults = (): Video[] => {
    if (!searchQuery.trim()) return [];
    let results = filterByScope(getAllVideos(), searchScope);
    results = results.filter(video =>
      video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortResults(results, searchSort);
  };

  const getBrowseResults = (): Video[] => {
    let results = filterByScope(getAllVideos(), browseScope);
    if (browseQuery.trim()) {
      results = results.filter(video =>
        video.title?.toLowerCase().includes(browseQuery.toLowerCase()) ||
        video.artist?.toLowerCase().includes(browseQuery.toLowerCase())
      );
    }
    return sortResults(results, browseSort);
  };

  // Queue management
  const handleClearQueue = () => {
    if (currentVideo && isPlaying) {
      setQueue([currentVideo]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  };

  const handleAddToQueue = (video: Video) => {
    setQueue(prev => [...prev, video]);
  };

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

  const handleVideoEnd = useCallback(() => {
    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    
    console.log('[PlayerWindow] Video ended, currentIndex:', currentIndex, 'queueLength:', currentQueue.length);
    
    if (currentQueue.length === 0) {
      console.log('[PlayerWindow] Queue is empty, nothing to play');
      return;
    }
    
    // Advance to next track, or loop back to beginning if at end
    const nextIndex = currentIndex < currentQueue.length - 1 ? currentIndex + 1 : 0;
    console.log('[PlayerWindow] Playing next track at index:', nextIndex);
    playVideoAtIndex(nextIndex);
  }, [playVideoAtIndex]);

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
        }
      }
    });

    return () => {
      if (unsubscribeVideoEnd) unsubscribeVideoEnd();
      if (unsubscribePlaybackState) unsubscribePlaybackState();
    };
  }, [isElectron, handleVideoEnd]);

  // Sync queue to Player Window for Supabase state sync
  // The Player Window will update Supabase with the queue state
  useEffect(() => {
    if (!isElectron) return;
    
    // Send queue update to Player Window
    (window as any).electronAPI.controlPlayerWindow('updateQueue', {
      activeQueue: queue,
      priorityQueue: priorityQueue
    });
  }, [isElectron, queue, priorityQueue]);

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
      // Re-index to Supabase
      (window as any).electronAPI.controlPlayerWindow('indexPlaylists', newPlaylists || {});
    }
  }, [isElectron]);

  // Get playlist counts with display names (strips YouTube Playlist ID prefix)
  const getPlaylistList = () => {
    return Object.entries(playlists).map(([name, videos]) => ({
      name, // Original folder name for internal use
      displayName: getPlaylistDisplayName(name), // Display name without YouTube ID prefix
      count: videos.length
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
              <div className="track-title">{currentTrack?.title || 'No track playing'}</div>
              <div className="track-artist">{getDisplayArtist(currentTrack?.artist) || '—'}</div>
            </div>
          </div>
        </div>
        
        <div className="header-right">
          <div className="player-controls">
            <button className="control-btn control-btn-large" onClick={skipTrack}>
              <span className="control-btn-label">SKIP</span>
            </button>
            <button className="control-btn control-btn-large" onClick={toggleShuffle}>
              <span className="control-btn-label">SHUFFLE</span>
            </button>
            <button className="control-btn play-btn" onClick={handlePauseClick}>
              <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </button>
            <div className="volume-control">
              <span className="material-symbols-rounded">volume_up</span>
              <input 
                type="range" 
                value={volume} 
                onChange={(e) => {
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
                  {item.title}{getDisplayArtist(item.artist) ? ` - ${getDisplayArtist(item.artist)}` : ''}
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
                        <td colSpan={5}>Queue is empty. Add tracks from Search or Browse.</td>
                      </tr>
                    ) : queue.map((track, index) => (
                      <tr
                        key={`${track.id}-${index}`}
                        className={index === queueIndex ? 'playing' : ''}
                        onClick={() => playVideoAtIndex(index)}
                      >
                        <td>{index + 1}</td>
                        <td className="col-title">{track.title}</td>
                        <td>{getDisplayArtist(track.artist)}</td>
                        <td>{track.duration || '—'}</td>
                        <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="search-filters">
                  <select className="filter-select" value={searchScope} onChange={(e) => handleScopeChange(e.target.value, false)}>
                    <option value="all">All Music</option>
                    <option value="no-karaoke">Exclude Karaoke</option>
                    <option value="karaoke">Karaoke Only</option>
                    <option value="queue">Current Queue</option>
                    <option value="playlist">Selected Playlist</option>
                  </select>
                  <select className="filter-select" value={searchSort} onChange={(e) => setSearchSort(e.target.value)}>
                    <option value="relevance">Relevance</option>
                    <option value="artist">Artist</option>
                    <option value="title">Title</option>
                    <option value="az">A-Z</option>
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
                    {!searchQuery.trim() ? (
                      <tr className="empty-state">
                        <td colSpan={5}>Start typing to search...</td>
                      </tr>
                    ) : getSearchResults().length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>No results found</td>
                      </tr>
                    ) : (
                      getSearchResults().map((track, index) => (
                        <tr key={`${track.id}-${index}`} onClick={() => handleAddToQueue(track)}>
                          <td>{index + 1}</td>
                          <td className="col-title">{track.title}</td>
                          <td>{getDisplayArtist(track.artist)}</td>
                          <td>{track.duration || '—'}</td>
                          <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Browse Tab */}
          {currentTab === 'browse' && (
            <div className="tab-content active">
              <div className="search-header">
                <div className="search-input-container">
                  <span className="material-symbols-rounded search-icon">search</span>
                  <input
                    type="text"
                    placeholder="Filter current playlist…"
                    className="search-input"
                    value={browseQuery}
                    onChange={(e) => setBrowseQuery(e.target.value)}
                  />
                </div>
                <div className="search-filters">
                  <select className="filter-select" value={browseScope} onChange={(e) => handleScopeChange(e.target.value, true)}>
                    <option value="all">All Music</option>
                    {selectedPlaylist && <option value="playlist">Selected Playlist: {getPlaylistDisplayName(selectedPlaylist)}</option>}
                    <option value="no-karaoke">Exclude Karaoke</option>
                    <option value="karaoke">Karaoke Only</option>
                  </select>
                  <select className="filter-select" value={browseSort} onChange={(e) => setBrowseSort(e.target.value)}>
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
                    {getBrowseResults().length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>
                          {browseScope === 'playlist' && selectedPlaylist ? 'No tracks in this playlist' : 'No tracks found'}
                        </td>
                      </tr>
                    ) : (
                      getBrowseResults().map((track, index) => (
                        <tr key={`${track.id}-${index}`} onClick={() => handleAddToQueue(track)}>
                          <td>{index + 1}</td>
                          <td className="col-title">{track.title}</td>
                          <td>{getDisplayArtist(track.artist)}</td>
                          <td>{track.duration || '—'}</td>
                          <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
                      onChange={(e) => handleUpdateSetting('autoShufflePlaylists', e.target.checked)}
                    />
                  </div>
                  <div className="setting-item">
                    <label>Crossfade duration</label>
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
                  {isElectron && (
                    <>
                      <div className="tool-card" onClick={handleOpenFullscreen}>
                        <span className="material-symbols-rounded">open_in_new</span>
                        <h3>Fullscreen Player</h3>
                        <p>Open player on secondary display</p>
                      </div>
                      <div className="tool-card" onClick={handleRefreshPlaylists}>
                        <span className="material-symbols-rounded">refresh</span>
                        <h3>Refresh Playlists</h3>
                        <p>Rescan the playlists directory</p>
                      </div>
                    </>
                  )}
                  <div className="tool-card" onClick={handleClearQueue}>
                    <span className="material-symbols-rounded">clear_all</span>
                    <h3>Clear Queue</h3>
                    <p>Remove all tracks from the queue</p>
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
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
