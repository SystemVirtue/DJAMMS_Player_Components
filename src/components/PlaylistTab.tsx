// components/PlaylistTab.tsx
import React from 'react';
import { Video } from '../types';

interface PlaylistTabProps {
  playlist: Video[];
  currentIndex: number;
  currentVideo: Video | null;
  onPlayVideo: (index: number) => void;
  onRemoveFromQueue: (videoId: string) => void;
}

export const PlaylistTab: React.FC<PlaylistTabProps> = ({
  playlist,
  currentIndex,
  currentVideo,
  onPlayVideo,
  onRemoveFromQueue
}) => {
  if (playlist.length === 0) {
    return (
      <div className="demo-section">
        <h2>Playlist</h2>
        <p>No playlist loaded. Select a playlist from the dropdown above.</p>
      </div>
    );
  }

  // Reorder playlist so current playing song is at the top
  const reorderedPlaylist = React.useMemo(() => {
    if (currentIndex < 0 || currentIndex >= playlist.length) {
      return playlist.map((video, index) => ({ video, originalIndex: index }));
    }

    const result = [];
    // Add current song and everything after it
    for (let i = currentIndex; i < playlist.length; i++) {
      result.push({ video: playlist[i], originalIndex: i });
    }
    // Add everything before current song
    for (let i = 0; i < currentIndex; i++) {
      result.push({ video: playlist[i], originalIndex: i });
    }
    return result;
  }, [playlist, currentIndex]);

  return (
    <div className="demo-section">
      <h2>Playlist</h2>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {reorderedPlaylist.map(({ video, originalIndex }, displayIndex) => (
          <div
            key={video.id}
            style={{
              padding: '8px',
              borderBottom: '1px solid #eee',
              backgroundColor: currentVideo && video.id === currentVideo.id ? '#e3f2fd' : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span style={{ flex: 1 }}>
              {originalIndex + 1}. {video.title}{video.artist !== 'Unknown Artist' ? ` by ${video.artist}` : ''}
              {currentVideo && video.id === currentVideo.id && (
                <span style={{ color: '#1976d2', fontWeight: 'bold', marginLeft: '8px' }}>
                  (NOW PLAYING)
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => onPlayVideo(originalIndex)}
                style={{
                  background: 'green',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Play this video"
              >
                ▶️
              </button>
              <button
                onClick={() => onRemoveFromQueue(video.id)}
                style={{
                  background: 'red',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Remove from queue"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};