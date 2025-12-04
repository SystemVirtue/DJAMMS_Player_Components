// web/admin/src/App.tsx
// DJAMMS Web Admin Console - Exact Clone of Electron Admin UI
// Uses Supabase for state sync instead of Electron IPC

import React, { useState, useEffect, useCallback } from 'react';
import { 
  supabase, 
  subscribeToPlayerState, 
  getPlayerState, 
  getAllLocalVideos, 
  insertCommand, 
  searchLocalVideos, 
  blockingCommands, 
  DEFAULT_PLAYER_ID,
  onConnectionChange,
  isConnected as getConnectionStatus
} from '@shared/supabase-client';
import type { CommandResult } from '@shared/supabase-client';
import type { 
  SupabasePlayerState, 
  SupabaseLocalVideo, 
  NowPlayingVideo, 
  QueueVideoItem,
  CommandType 
} from '@shared/types';

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

type TabId = 'queue' | 'search' | 'browse' | 'settings' | 'tools';

// Navigation items configuration
const navItems: { id: TabId; icon: string; label: string }[] = [
  { id: 'queue', icon: 'queue_music', label: 'Queue' },
  { id: 'search', icon: 'search', label: 'Search' },
  { id: 'browse', icon: 'library_music', label: 'Browse' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'tools', icon: 'build', label: 'Tools' },
];

export default function App() {
  // Player state (synced from Supabase)
  const [playerState, setPlayerState] = useState<SupabasePlayerState | null>(null);
  const [currentVideo, setCurrentVideo] = useState<NowPlayingVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);

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
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseScope, setBrowseScope] = useState('all');
  const [browseSort, setBrowseSort] = useState('az');
  const [allVideos, setAllVideos] = useState<SupabaseLocalVideo[]>([]);

  // UI state
  const [currentTab, setCurrentTab] = useState<TabId>('queue');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Dialog state
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [playlistToLoad, setPlaylistToLoad] = useState<string | null>(null);
  const [showPauseDialog, setShowPauseDialog] = useState(false);

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
      if (typeof state.volume === 'number') {
        setVolume(Math.round(state.volume * 100));
      }
    };

    // Fetch initial state on mount (realtime subscription only fires on CHANGES)
    const loadInitialState = async () => {
      const state = await getPlayerState(DEFAULT_PLAYER_ID);
      if (state) {
        applyState(state);
      }
    };
    loadInitialState();

    // Then subscribe to real-time changes
    const channel = subscribeToPlayerState(DEFAULT_PLAYER_ID, applyState);

    // unsubscribe() returns a Promise but cleanup must be sync - ignore return value
    return () => { channel.unsubscribe(); };
  }, []);

  // Monitor Supabase Realtime connection status
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      console.log(`[WebAdmin] Supabase Realtime ${connected ? '✅ connected' : '❌ disconnected'}`);
      setIsConnected(connected);
    });
    return unsubscribe;
  }, []);

  // Load all videos from local_videos table for Browse/Search
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
  }, []);

  // Search videos when query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await searchLocalVideos(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      }
    };
    
    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

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
      await insertCommand(type, payload);
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  }, []);

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
    await sendBlockingCommand(() => blockingCommands.pause());
  };

  const handleResumePlayback = async () => {
    await sendBlockingCommand(() => blockingCommands.resume());
  };

  const skipTrack = async () => {
    await sendBlockingCommand(() => blockingCommands.skip());
  };

  const toggleShuffle = async () => {
    await sendBlockingCommand(() => blockingCommands.queueShuffle());
  };

  const handleVolumeChange = async (newVolume: number) => {
    setVolume(newVolume);
    // Volume change is non-blocking (frequent updates)
    await sendCommand('setVolume', { volume: newVolume / 100 });
  };

  // Play video at specific index in queue (click-to-play)
  const playVideoAtIndex = async (index: number) => {
    await sendBlockingCommand(() => 
      blockingCommands.play({} as any, index)
    );
  };

  // Playlist functions
  const handlePlaylistClick = (playlistName: string) => {
    setSelectedPlaylist(playlistName);
    setCurrentTab('browse');
    setBrowseScope('playlist');
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
        blockingCommands.loadPlaylist(playlistToLoad, settings.autoShufflePlaylists)
      );
    }
    setPlaylistToLoad(null);
  };

  const handleTabChange = (tab: TabId) => {
    setCurrentTab(tab);
    if (tab === 'browse') {
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
  const filterByScope = (videos: SupabaseLocalVideo[], scope: string): SupabaseLocalVideo[] => {
    switch (scope) {
      case 'all': return videos;
      case 'no-karaoke': return videos.filter(v => !v.title?.toLowerCase().includes('karaoke'));
      case 'karaoke': return videos.filter(v => v.title?.toLowerCase().includes('karaoke'));
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
          player_id: DEFAULT_PLAYER_ID,
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
    if (!searchQuery.trim()) return [];
    let results = filterByScope(searchResults, searchScope);
    return sortResults(results, searchSort);
  };

  const getBrowseResults = (): SupabaseLocalVideo[] => {
    let results = filterByScope(allVideos, browseScope);
    if (browseQuery.trim()) {
      results = results.filter(video =>
        video.title?.toLowerCase().includes(browseQuery.toLowerCase()) ||
        video.artist?.toLowerCase().includes(browseQuery.toLowerCase())
      );
    }
    return sortResults(results, browseSort);
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
              <div className="track-title">{currentVideo?.title || 'No track playing'}</div>
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
                    {activeQueue.length === 0 ? (
                      <tr className="empty-state">
                        <td colSpan={5}>Queue is empty. Add tracks from Search or Browse.</td>
                      </tr>
                    ) : activeQueue.map((track, index) => (
                      <tr
                        key={`${track.id}-${index}`}
                        className={index === queueIndex ? 'playing' : ''}
                        onClick={() => playVideoAtIndex(index)}
                      >
                        <td>{index + 1}</td>
                        <td className="col-title">{track.title}</td>
                        <td>{getDisplayArtist(track.artist)}</td>
                        <td>{track.duration || '—'}</td>
                        <td>{getPlaylistDisplayName(track.playlist || '')}</td>
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
                          <td>{getPlaylistDisplayName(getVideoPlaylist(track))}</td>
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
                          <td>{getPlaylistDisplayName(getVideoPlaylist(track))}</td>
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
    </div>
  );
}
