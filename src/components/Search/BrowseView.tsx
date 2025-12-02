// src/components/Search/BrowseView.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Video } from '../../types';

interface BrowseViewProps {
  playlists: Record<string, Video[]>;
  onPlayVideo: (video: Video) => void;
  onAddToQueue: (video: Video) => void;
  onPlayPlaylist: (playlistName: string, videos: Video[]) => void;
  currentPlaylist?: string;
  className?: string;
}

type SortOption = 'title' | 'artist' | 'playlist';

export const BrowseView: React.FC<BrowseViewProps> = ({
  playlists,
  onPlayVideo,
  onAddToQueue,
  onPlayPlaylist,
  currentPlaylist,
  className = ''
}) => {
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(currentPlaylist || null);

  const playlistNames = useMemo(() => {
    return Object.keys(playlists).sort();
  }, [playlists]);

  const filteredVideos = useMemo(() => {
    let videos: Video[] = [];

    // Get videos from selected playlist or all
    if (selectedPlaylist) {
      videos = playlists[selectedPlaylist] || [];
    } else {
      videos = Object.values(playlists).flat();
    }

    // Sort
    return [...videos].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'artist':
          return (a.artist || '').localeCompare(b.artist || '');
        case 'playlist':
          return (a.playlist || '').localeCompare(b.playlist || '');
        default:
          return 0;
      }
    });
  }, [playlists, selectedPlaylist, sortBy]);

  const totalVideos = useMemo(() => {
    return Object.values(playlists).reduce((sum, p) => sum + p.length, 0);
  }, [playlists]);

  const handlePlayAll = useCallback(() => {
    if (selectedPlaylist && playlists[selectedPlaylist]) {
      onPlayPlaylist(selectedPlaylist, playlists[selectedPlaylist]);
    }
  }, [selectedPlaylist, playlists, onPlayPlaylist]);

  if (playlistNames.length === 0) {
    return (
      <div className={`browse-view ${className}`}>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          </div>
          <div className="empty-state-title">No playlists found</div>
          <div className="empty-state-description">
            Add some video files to your playlists directory to get started.
          </div>
        </div>
      </div>
    );
  }

  // Playlists overview (when no playlist selected)
  if (!selectedPlaylist) {
    return (
      <div className={`browse-view ${className}`}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 600, 
            color: 'var(--yt-text-primary)',
            marginBottom: '8px'
          }}>
            Your Library
          </h2>
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
            {totalVideos} videos in {playlistNames.length} playlists
          </p>
        </div>

        <div className="browse-grid">
          {playlistNames.map(name => {
            const count = playlists[name]?.length || 0;
            const isCurrent = currentPlaylist === name;

            return (
              <div
                key={name}
                className="browse-card"
                onClick={() => setSelectedPlaylist(name)}
                style={{
                  borderLeft: isCurrent ? '3px solid var(--yt-accent-primary)' : 'none'
                }}
              >
                <div className="browse-card-thumbnail">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                  </svg>
                </div>
                <div className="browse-card-info">
                  <div className="browse-card-title">{name}</div>
                  <div className="browse-card-meta">
                    {count} video{count !== 1 ? 's' : ''}
                    {isCurrent && (
                      <span style={{ color: 'var(--yt-accent-primary)', marginLeft: '8px' }}>
                        • Now playing
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Single playlist view
  return (
    <div className={`browse-view ${className}`}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: '24px',
        marginBottom: '24px',
        paddingBottom: '24px',
        borderBottom: '1px solid var(--yt-border-subtle)'
      }}>
        {/* Playlist thumbnail */}
        <div style={{
          width: '160px',
          height: '160px',
          background: 'var(--yt-bg-elevated)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--yt-text-muted)">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
          </svg>
        </div>

        {/* Playlist info */}
        <div style={{ flex: 1 }}>
          <button
            onClick={() => setSelectedPlaylist(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--yt-text-secondary)',
              fontSize: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '8px',
              padding: 0
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Back to library
          </button>
          <h2 style={{ 
            fontSize: '32px', 
            fontWeight: 700, 
            color: 'var(--yt-text-primary)',
            marginBottom: '8px'
          }}>
            {selectedPlaylist}
          </h2>
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
            {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handlePlayAll}
              className="control-btn primary"
              style={{ 
                width: 'auto', 
                padding: '12px 32px',
                borderRadius: '24px',
                fontWeight: 500,
                fontSize: '14px'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                <path d="M8 5v14l11-7z"/>
              </svg>
              Play All
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={{
                padding: '12px 16px',
                background: 'var(--yt-bg-elevated)',
                border: '1px solid var(--yt-border-subtle)',
                borderRadius: '8px',
                color: 'var(--yt-text-primary)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="title">Sort by Title</option>
              <option value="artist">Sort by Artist</option>
            </select>
          </div>
        </div>
      </div>

      {/* Video list */}
      <div className="queue-list">
        {filteredVideos.map((video, index) => (
          <div
            key={video.id || index}
            className="queue-item"
            onClick={() => onPlayVideo(video)}
          >
            <span className="queue-item-index">{index + 1}</span>
            
            <div className="queue-item-thumbnail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            
            <div className="queue-item-info">
              <div className="queue-item-title">{video.title}</div>
              <div className="queue-item-artist">{video.artist || 'Unknown Artist'}</div>
            </div>
            
            <div className="queue-item-actions">
              <button
                className="queue-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToQueue(video);
                }}
                title="Add to queue"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
