/**
 * JukeboxHeader.tsx - Header component for Kiosk UI
 * Fixed 100px height with Now Playing, Search Input, and Status Indicator
 */

import React from 'react';
import type { QueueVideoItem } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './JukeboxHeader.css';

interface JukeboxHeaderProps {
  nowPlaying: QueueVideoItem | null;
  searchMode: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  thumbnailsPath: string;
}

export const JukeboxHeader: React.FC<JukeboxHeaderProps> = ({
  nowPlaying,
  searchMode,
  searchQuery,
  onSearchChange,
  thumbnailsPath
}) => {
  const nowPlayingThumbnail = nowPlaying 
    ? getThumbnailUrl(nowPlaying, thumbnailsPath)
    : '';
  
  return (
    <header className="jukebox-header">
      {/* Left: Now Playing */}
      <div className="jukebox-header-now-playing">
        {nowPlayingThumbnail && (
          <img 
            src={nowPlayingThumbnail}
            alt=""
            className="jukebox-header-thumbnail"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <div className="jukebox-header-now-playing-info">
          {nowPlaying ? (
            <>
              <div className="jukebox-header-title">{nowPlaying.title}</div>
              {nowPlaying.artist && (
                <div className="jukebox-header-artist">{nowPlaying.artist}</div>
              )}
            </>
          ) : (
            <div className="jukebox-header-title">No song playing</div>
          )}
        </div>
      </div>
      
      {/* Center: Search Input (only in search mode) */}
      {searchMode && (
        <div className="jukebox-header-search">
          <input
            type="text"
            className="jukebox-header-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search songs..."
            autoFocus
          />
        </div>
      )}
      
      {/* Right: Status Indicator */}
      <div className="jukebox-header-status">
        <div className="jukebox-header-status-indicator">
          <span className="jukebox-header-status-icon">🎵</span>
          <span className="jukebox-header-status-text">FREE PLAY</span>
        </div>
      </div>
    </header>
  );
};



