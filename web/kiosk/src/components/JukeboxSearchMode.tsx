// JukeboxSearchMode.tsx - Premium touchscreen jukebox interface
// Modern cyber-neon aesthetic optimized for 4:3 touchscreen displays

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QueueVideoItem, SupabaseLocalVideo } from '@shared/types';
import { searchLocalVideos, blockingCommands, localVideoToQueueItem } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import './JukeboxSearchMode.css';

// Video background component with ping-pong looping
const VideoBackground: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReversing, setIsReversing] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Handle forward playback ending - start reverse
    const handleEnded = () => {
      setIsReversing(true);
    };

    // Handle reverse playback (manual frame stepping since playbackRate < 0 not supported)
    const reversePlayback = () => {
      if (!video || !isReversing) return;
      
      if (video.currentTime <= 0.05) {
        // Reached start, switch back to forward
        setIsReversing(false);
        video.currentTime = 0;
        video.play();
        return;
      }
      
      // Step backwards (~30fps)
      video.currentTime = Math.max(0, video.currentTime - 0.033);
      animationFrameRef.current = requestAnimationFrame(reversePlayback);
    };

    if (isReversing) {
      video.pause();
      animationFrameRef.current = requestAnimationFrame(reversePlayback);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    video.addEventListener('ended', handleEnded);
    
    return () => {
      video.removeEventListener('ended', handleEnded);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReversing]);

  return (
    <video
      ref={videoRef}
      className="jukebox-video-background"
      src="/background-video.mp4"
      autoPlay
      muted
      playsInline
    />
  );
};

interface JukeboxSearchModeProps {
  nowPlaying?: QueueVideoItem | null;
  credits?: number;
  onCreditsChange?: (newCredits: number) => void;
  onSongQueued?: (video: QueueVideoItem) => void;
  creditCostQueue?: number;
  creditCostPlayNow?: number;
  isFreePlay?: boolean;
  playerId: string; // Required - Player ID to search/queue against
}

// Quick filter categories
const QUICK_FILTERS = [
  { id: 'popular', label: '🔥 Most Popular', icon: '🔥' },
  { id: 'new', label: '✨ New Arrivals', icon: '✨' },
  { id: 'christmas', label: '🎄 Holiday', icon: '🎄' },
  { id: 'rock', label: '🎸 Rock', icon: '🎸' },
  { id: 'karaoke', label: '🎤 Karaoke', icon: '🎤' },
  { id: 'dance', label: '💃 Dance', icon: '💃' },
];

// Keyboard layout - 3 rows with letters and numbers combined
const KEYBOARD_ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const KEYBOARD_ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const KEYBOARD_ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
const KEYBOARD_NUMS_TOP = ['1', '2', '3', '4', '5'];
const KEYBOARD_NUMS_BOT = ['6', '7', '8', '9', '0'];

export const JukeboxSearchMode: React.FC<JukeboxSearchModeProps> = ({
  nowPlaying = null,
  credits = 999,
  onCreditsChange,
  onSongQueued,
  creditCostQueue = 1,
  creditCostPlayNow = 3,
  isFreePlay = true,
  playerId,
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SupabaseLocalVideo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [keyboardVisible] = useState(true);
  const [karaokeFilter, setKaraokeFilter] = useState<'show' | 'hide'>('hide'); // 'show' = only karaoke, 'hide' = no karaoke
  
  // Filter results based on karaoke filter
  const filteredResults = searchResults.filter(video => {
    const hasKaraoke = video.title?.toLowerCase().includes('karaoke') || 
                       video.path?.toLowerCase().includes('karaoke');
    if (karaokeFilter === 'show') {
      return hasKaraoke; // Only show karaoke items
    } else {
      return !hasKaraoke; // Hide karaoke items
    }
  });
  
  // UI state
  const [selectedVideo, setSelectedVideo] = useState<SupabaseLocalVideo | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'queue' | 'playnow'>('queue');
  const [queueingVideo, setQueueingVideo] = useState<string | null>(null);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await searchLocalVideos(query, 50, playerId);
      setSearchResults(results || []);
    } catch (error) {
      console.error('[JukeboxSearchMode] Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [playerId]);

  // Handle search input changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Keyboard handlers
  const handleKeyPress = useCallback((key: string) => {
    // Haptic feedback placeholder
    // navigator.vibrate?.(10);
    setSearchQuery(prev => prev + key);
  }, []);

  const handleBackspace = useCallback(() => {
    setSearchQuery(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const handleSpace = useCallback(() => {
    setSearchQuery(prev => prev + ' ');
  }, []);

  // Queue handlers
  const handleQueueClick = useCallback((video: SupabaseLocalVideo) => {
    setSelectedVideo(video);
    setConfirmAction('queue');
    setShowConfirmModal(true);
  }, []);

  const handlePlayNowClick = useCallback((video: SupabaseLocalVideo) => {
    setSelectedVideo(video);
    setConfirmAction('playnow');
    setShowConfirmModal(true);
  }, []);

  const handleConfirmQueue = useCallback(async () => {
    if (!selectedVideo) return;
    
    const cost = confirmAction === 'queue' ? creditCostQueue : creditCostPlayNow;
    
    // Check credits (if not free play)
    if (!isFreePlay && credits < cost) {
      setShowConfirmModal(false);
      return;
    }
    
    setQueueingVideo(selectedVideo.id);
    setShowConfirmModal(false);
    
    try {
      const queueItem = localVideoToQueueItem(selectedVideo);
      // Both queue and play-now use priority queue - play-now items will be handled by player
      const result = await blockingCommands.queueAdd(queueItem, 'priority', 'kiosk', playerId);
      
      if (result.success) {
        // Deduct credits
        if (!isFreePlay) {
          onCreditsChange?.(credits - cost);
        }
        
        // Show success animation
        setSuccessMessage(confirmAction === 'playnow' ? 'Playing Next!' : 'Added to Queue!');
        setShowSuccessFlash(true);
        setTimeout(() => setShowSuccessFlash(false), 2000);
        
        onSongQueued?.(queueItem);
      }
    } catch (error) {
      console.error('[JukeboxSearchMode] Queue error:', error);
    } finally {
      setQueueingVideo(null);
      setSelectedVideo(null);
    }
  }, [selectedVideo, confirmAction, credits, creditCostQueue, creditCostPlayNow, isFreePlay, onCreditsChange, onSongQueued, playerId]);

  // Generate album art fallback gradient
  const getAlbumArtStyle = useCallback((video: SupabaseLocalVideo | QueueVideoItem) => {
    const title = video.title || 'Unknown';
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue1 = hash % 360;
    const hue2 = (hash + 60) % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hue1}, 70%, 30%) 0%, hsl(${hue2}, 80%, 20%) 100%)`,
    };
  }, []);

  // Get first letter for fallback art
  const getInitial = useCallback((title: string) => {
    return (title || 'U').charAt(0).toUpperCase();
  }, []);

  // Check if video is currently playing
  const isCurrentlyPlaying = useCallback((video: SupabaseLocalVideo) => {
    return nowPlaying?.id === video.id;
  }, [nowPlaying]);

  // Formatted duration
  const formatDuration = useCallback((seconds?: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="jukebox-container">
      {/* Video background with ping-pong loop */}
      <VideoBackground />
      
      {/* Scanline overlay */}
      <div className="jukebox-scanlines" />
      
      {/* Success flash overlay */}
      {showSuccessFlash && (
        <div className="jukebox-success-flash">
          <div className="success-flash-content">
            <span className="success-icon">✓</span>
            <span className="success-text">{successMessage}</span>
          </div>
        </div>
      )}
      
      {/* Top Bar - Now Playing, Search & Credits */}
      <header className="jukebox-header">
        <div className="now-playing-section">
          {nowPlaying ? (
            <>
              <div className="now-playing-art" style={getAlbumArtStyle(nowPlaying)}>
                <span className="art-initial">{getInitial(nowPlaying.title)}</span>
                <div className="now-playing-pulse" />
              </div>
              <div className="now-playing-info">
                <div className="now-playing-label">NOW PLAYING</div>
                <div className="now-playing-title">{cleanVideoTitle(nowPlaying.title)}</div>
                <div className="now-playing-artist">{nowPlaying.artist || 'Unknown Artist'}</div>
              </div>
            </>
          ) : (
            <div className="now-playing-empty">
              <div className="now-playing-art empty">
                <span className="art-icon">🎵</span>
              </div>
              <div className="now-playing-info">
                <div className="now-playing-label">JUKEBOX READY</div>
                <div className="now-playing-title">Search for a song</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Search Bar - Centered in Header */}
        <div className="header-search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search songs, artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            readOnly
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={handleClear}>
              ✕
            </button>
          )}
          {isSearching && <div className="search-loading-bar" />}
        </div>
        
        <div className="credits-section">
          <div className="credits-icon">
            <span className="coin-icon">🪙</span>
            <div className="coin-glow" />
          </div>
          <div className="credits-info">
            <div className="credits-label">{isFreePlay ? 'FREE PLAY' : 'CREDITS'}</div>
            <div className="credits-value">{isFreePlay ? '∞' : credits}</div>
          </div>
        </div>
      </header>
      
      {/* Main Results Area */}
      <main className="jukebox-results" ref={resultsRef}>
        {searchQuery.length === 0 ? (
          // Empty state with quick filters
          <div className="jukebox-empty-state">
            <div className="empty-state-content">
              <div className="empty-state-icon">🎶</div>
              <h2 className="empty-state-title">Start Searching</h2>
              <p className="empty-state-subtitle">Type to find your favorite songs</p>
            </div>
            
            <div className="quick-filters">
              <h3 className="quick-filters-title">Quick Browse</h3>
              <div className="quick-filters-grid">
                {QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className="quick-filter-chip"
                    onClick={() => setSearchQuery(filter.id)}
                  >
                    <span className="filter-icon">{filter.icon}</span>
                    <span className="filter-label">{filter.label.split(' ').slice(1).join(' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : filteredResults.length === 0 && !isSearching ? (
          // No results
          <div className="jukebox-no-results">
            <div className="no-results-icon">😢</div>
            <h2>No songs found</h2>
            <p>{searchResults.length > 0 ? `No ${karaokeFilter === 'show' ? 'karaoke' : 'non-karaoke'} matches` : 'Try a different search term'}</p>
          </div>
        ) : (
          // Results grid
          <div className="results-grid">
            {filteredResults.map((video, index) => (
              <div
                key={video.id}
                className={`song-card ${isCurrentlyPlaying(video) ? 'now-playing' : ''} ${queueingVideo === video.id ? 'queueing' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="song-card-art" style={getAlbumArtStyle(video)}>
                  <span className="art-initial">{getInitial(video.title)}</span>
                  {isCurrentlyPlaying(video) && (
                    <div className="playing-indicator">
                      <span className="playing-bar" />
                      <span className="playing-bar" />
                      <span className="playing-bar" />
                    </div>
                  )}
                </div>
                
                <div className="song-card-info">
                  <h3 className="song-title">{cleanVideoTitle(video.title)}</h3>
                  <p className="song-artist">{video.artist || 'Unknown Artist'}</p>
                  <span className="song-duration">{formatDuration(video.duration)}</span>
                </div>
                
                <div className="song-card-actions">
                  <button
                    className="queue-btn queue-btn-large"
                    onClick={() => handleQueueClick(video)}
                    disabled={queueingVideo === video.id}
                  >
                    <span className="btn-icon">➕</span>
                    <span className="btn-text">QUEUE</span>
                    {!isFreePlay && <span className="btn-cost">{creditCostQueue}💰</span>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      
      {/* On-Screen Keyboard - 3 Row Layout */}
      <div className={`jukebox-keyboard ${keyboardVisible ? 'visible' : 'hidden'}`}>
        {/* Row 1: QWERTYUIOP | BKSP CLR | Karaoke */}
        <div className="keyboard-row">
          <div className="keyboard-section-left">
            <div className="keyboard-letters">
              {KEYBOARD_ROW_1.map((key) => (
                <button key={key} className="keyboard-key" onClick={() => handleKeyPress(key)}>
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="keyboard-section-center">
            <div className="keyboard-actions-row">
              <button className="keyboard-key key-backspace" onClick={handleBackspace}>⌫</button>
              <button className="keyboard-key key-clear" onClick={handleClear}>CLR</button>
            </div>
          </div>
          <div className="keyboard-section-right">
            <button
              className={`keyboard-key key-filter ${karaokeFilter === 'show' ? 'active' : ''}`}
              onClick={() => setKaraokeFilter('show')}
            >
              🎤 Karaoke
            </button>
          </div>
        </div>
        
        {/* Row 2: ASDFGHJKL | 12345 | (spacer) */}
        <div className="keyboard-row">
          <div className="keyboard-section-left">
            <div className="keyboard-letters keyboard-letters-offset">
              {KEYBOARD_ROW_2.map((key) => (
                <button key={key} className="keyboard-key" onClick={() => handleKeyPress(key)}>
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="keyboard-section-center">
            <div className="keyboard-numbers-row">
              {KEYBOARD_NUMS_TOP.map((key) => (
                <button key={key} className="keyboard-key key-number" onClick={() => handleKeyPress(key)}>
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="keyboard-section-right">
            {/* Spacer for alignment */}
          </div>
        </div>
        
        {/* Row 3: ZXCVBNM SPACE | 67890 | Music */}
        <div className="keyboard-row">
          <div className="keyboard-section-left">
            <div className="keyboard-letters keyboard-letters-offset-2">
              {KEYBOARD_ROW_3.map((key) => (
                <button key={key} className="keyboard-key" onClick={() => handleKeyPress(key)}>
                  {key}
                </button>
              ))}
            </div>
            <button className="keyboard-key key-space" onClick={handleSpace}>SPACE</button>
          </div>
          <div className="keyboard-section-center">
            <div className="keyboard-numbers-row">
              {KEYBOARD_NUMS_BOT.map((key) => (
                <button key={key} className="keyboard-key key-number" onClick={() => handleKeyPress(key)}>
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="keyboard-section-right">
            <button
              className={`keyboard-key key-filter ${karaokeFilter === 'hide' ? 'active' : ''}`}
              onClick={() => setKaraokeFilter('hide')}
            >
              🎵 Music
            </button>
          </div>
        </div>
      </div>
      
      {/* Confirmation Modal */}
      {showConfirmModal && selectedVideo && (
        <div className="jukebox-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="jukebox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-art" style={getAlbumArtStyle(selectedVideo)}>
              <span className="art-initial">{getInitial(selectedVideo.title)}</span>
            </div>
            <div className="modal-info">
              <h2 className="modal-title">{cleanVideoTitle(selectedVideo.title)}</h2>
              <p className="modal-artist">{selectedVideo.artist || 'Unknown Artist'}</p>
            </div>
            <div className="modal-action">
              {confirmAction === 'queue' ? (
                <p className="modal-message">Add this song to the queue?</p>
              ) : (
                <p className="modal-message">Play this song next? (Skips queue)</p>
              )}
              {!isFreePlay && (
                <p className="modal-cost">
                  Cost: {confirmAction === 'queue' ? creditCostQueue : creditCostPlayNow} credit(s)
                </p>
              )}
            </div>
            <div className="modal-buttons">
              <button className="modal-btn modal-btn-cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="modal-btn modal-btn-confirm" onClick={handleConfirmQueue}>
                {confirmAction === 'queue' ? '➕ Add to Queue' : '⚡ Play Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JukeboxSearchMode;
