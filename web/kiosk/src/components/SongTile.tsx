/**
 * SongTile.tsx - Individual song tile component for Kiosk grid
 * Displays video with thumbnail, title, artist, and queue button
 */

import React, { useState } from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './SongTile.css';

interface SongTileProps {
  video: SupabaseLocalVideo;
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
  letter?: string; // First letter of title for badge display
}

export const SongTile: React.FC<SongTileProps> = ({ 
  video, 
  thumbnailsPath, 
  onQueue,
  letter 
}) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  const thumbnailUrl = getThumbnailUrl(video, thumbnailsPath);
  const hasThumbnail = thumbnailUrl && !thumbnailError;
  
  const handleQueue = () => {
    onQueue(video);
  };
  
  return (
    <div 
      className={`song-tile ${isPressed ? 'pressed' : ''}`}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
    >
      {/* Artist Name - ABOVE the image */}
      {video.artist && (
        <div className="song-tile-artist-label">
          {video.artist}
        </div>
      )}
      
      {/* Thumbnail Image */}
      <div 
        className="song-tile-image-container"
        style={{
          backgroundImage: hasThumbnail ? `url(${thumbnailUrl})` : 'none',
          backgroundColor: hasThumbnail ? 'transparent' : '#000000'
        }}
      >
        {/* Hidden image for error detection */}
        {thumbnailUrl && !thumbnailError && (
          <img
            src={thumbnailUrl}
            alt=""
            className="song-tile-thumbnail-loader"
            onError={() => setThumbnailError(true)}
            loading="lazy"
          />
        )}
      </div>
      
      {/* Song Title - BELOW the image */}
      <div className="song-tile-title-label">
        {video.title || 'Unknown Title'}
      </div>
      
      {/* Queue Button */}
      <button 
        className="song-tile-queue-btn"
        onClick={handleQueue}
        onTouchStart={(e) => e.stopPropagation()}
      >
        QUEUE
      </button>
      
      {/* Letter Badge */}
      {letter && (
        <div className="song-tile-letter-badge">
          {letter.toUpperCase()}
        </div>
      )}
    </div>
  );
};

