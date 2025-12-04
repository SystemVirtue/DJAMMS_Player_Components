// components/NowPlayingOverlay.tsx
import React from 'react';
import { Video } from '../types';
import { cleanVideoTitle } from '../utils/playlistHelpers';

interface NowPlayingOverlayProps {
  video: Video | null;
  currentTime: number;
  duration: number;
  visible: boolean;
  className?: string;
}

export const NowPlayingOverlay: React.FC<NowPlayingOverlayProps> = ({
  video,
  currentTime,
  duration,
  visible,
  className = ''
}) => {
  if (!visible || !video) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`now-playing-overlay ${className}`}
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        maxWidth: '300px',
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
      }}
    >
      <div className="now-playing-title" style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
        {cleanVideoTitle(video.title)}
      </div>
      {video.artist && video.artist !== 'Unknown Artist' && (
        <div className="now-playing-artist" style={{ fontSize: '14px', color: '#ccc', marginBottom: '10px' }}>
          {video.artist}
        </div>
      )}

      {/* Progress bar */}
      <div
        className="progress-container"
        style={{
          width: '100%',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}
      >
        <div
          className="progress-fill"
          style={{
            width: `${progress}%`,
            height: '100%',
            background: '#007bff',
            transition: 'width 0.1s ease'
          }}
        />
      </div>
    </div>
  );
};