// components/NowPlayingPanel.tsx
import React from 'react';
import { Video } from '../types';

interface NowPlayingPanelProps {
  currentVideo: Video | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedPlaylist: string;
  playlist: Video[];
  currentIndex: number;
  playlists: Record<string, any[]>;
  onPlaylistChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onPlayPause: () => void;
  onSkip: () => void;
  onShuffle: () => void;
}

export const NowPlayingPanel: React.FC<NowPlayingPanelProps> = ({
  currentVideo,
  currentTime,
  duration,
  isPlaying,
  selectedPlaylist,
  playlist,
  currentIndex,
  playlists,
  onPlaylistChange,
  onPlayPause,
  onSkip,
  onShuffle
}) => {
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      flex: '0 0 400px',
      padding: '20px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      backgroundColor: '#f8f9fa'
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>Now Playing</h3>

      {/* Now Playing Display */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'bold' }}>
          Now Playing: {currentVideo ? `${currentVideo.title}${currentVideo.artist !== 'Unknown Artist' ? ` by ${currentVideo.artist}` : ''}` : 'None'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '10px', background: '#ddd', borderRadius: '5px', marginRight: '10px' }}>
            <div
              style={{
                height: '100%',
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                background: '#007bff',
                borderRadius: '5px'
              }}
            ></div>
          </div>
          <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Selected Playlist Dropdown */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Selected Playlist:</label>
        <select
          value={selectedPlaylist}
          onChange={onPlaylistChange}
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '14px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          <option value="">Select Playlist</option>
          {Object.keys(playlists).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {playlist.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            {playlist.length} videos | Current: {playlist[currentIndex] ? `${playlist[currentIndex].title}${playlist[currentIndex].artist !== 'Unknown Artist' ? ` by ${playlist[currentIndex].artist}` : ''}` : 'None'}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={onPlayPause}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>

        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ⏭️ Skip
        </button>

        <button
          onClick={onShuffle}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🔀 Shuffle
        </button>
      </div>
    </div>
  );
};