// src/components/Header.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video } from '../types';
import { formatTime } from '../utils/time';
import { cleanVideoTitle } from '../utils/playlistHelpers';

interface HeaderProps {
  currentVideo: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onPlayPause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onSearch: (query: string) => void;
  onSearchClear: () => void;
  onMenuToggle: () => void;
  searchQuery?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentVideo,
  isPlaying,
  currentTime,
  duration,
  volume,
  onPlayPause,
  onSkip,
  onPrevious,
  onSeek,
  onVolumeChange,
  onSearch,
  onSearchClear,
  onMenuToggle,
  searchQuery = ''
}) => {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(volume);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounced search
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      onSearch(value);
    }, 150);
  }, [onSearch]);

  const handleSearchClear = useCallback(() => {
    setLocalSearch('');
    onSearchClear();
  }, [onSearchClear]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleSearchClear();
    }
  }, [handleSearchClear]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  }, [duration, onSeek]);

  const handleVolumeToggle = useCallback(() => {
    if (isMuted || volume === 0) {
      setIsMuted(false);
      onVolumeChange(previousVolume > 0 ? previousVolume : 0.7);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  }, [isMuted, volume, previousVolume, onVolumeChange]);

  const handleVolumeSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    onVolumeChange(newVolume);
    setIsMuted(newVolume === 0);
  }, [onVolumeChange]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <header className="app-header drag-region">
      {/* Menu Toggle Button */}
      <button 
        className="control-btn no-drag" 
        onClick={onMenuToggle}
        aria-label="Toggle sidebar"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
        </svg>
      </button>

      {/* Logo */}
      <div className="header-logo no-drag">DJAMMS</div>

      {/* Now Playing Info */}
      <div className="header-now-playing no-drag">
        <div className="now-playing-thumbnail">
          {currentVideo ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          )}
        </div>
        <div className="now-playing-info">
          <div className="now-playing-title">
            {cleanVideoTitle(currentVideo?.title) || 'No video playing'}
          </div>
          <div className="now-playing-artist">
            {currentVideo?.artist || 'Select a video to play'}
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="playback-controls no-drag">
        {/* Previous */}
        <button 
          className="control-btn" 
          onClick={onPrevious}
          aria-label="Previous"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        {/* Play/Pause */}
        <button 
          className="control-btn primary" 
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Next/Skip */}
        <button 
          className="control-btn" 
          onClick={onSkip}
          aria-label="Next"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>

      {/* Progress */}
      <div className="header-progress no-drag">
        <span className="progress-time">{formatTime(currentTime)}</span>
        <div 
          className="progress-bar" 
          ref={progressRef}
          onClick={handleProgressClick}
        >
          <div 
            className="progress-fill" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="progress-time">{formatTime(duration)}</span>
      </div>

      {/* Volume Control */}
      <div className="volume-control no-drag">
        <button 
          className="control-btn" 
          onClick={handleVolumeToggle}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : volume < 0.5 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
        <input
          type="range"
          className="volume-slider"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeSlider}
          aria-label="Volume"
        />
      </div>

      {/* Search Bar */}
      <div className="header-search no-drag">
        <input
          type="text"
          placeholder="Search videos..."
          value={localSearch}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          aria-label="Search videos"
        />
        {localSearch ? (
          <button 
            className="search-icon" 
            onClick={handleSearchClear}
            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            aria-label="Clear search"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        ) : (
          <span className="search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;
