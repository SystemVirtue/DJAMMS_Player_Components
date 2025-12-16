// src/components/Search/SearchResults.tsx
import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Video } from '../../types';
import { SearchResult } from '../../services/LocalSearchService';
import { cleanVideoTitle } from '../../utils/playlistHelpers';

interface SearchResultsProps {
  results: SearchResult[];
  onPlayVideo: (video: Video) => void;
  onAddToQueue: (video: Video) => void;
  onAddToPriorityQueue?: (video: Video) => void;
  isLoading?: boolean;
  query?: string;
  className?: string;
}

// Popover component for Add to Priority Queue
interface VideoPopoverProps {
  video: Video;
  position: { x: number; y: number };
  onAddToPriorityQueue: () => void;
  onCancel: () => void;
}

const VideoPopover: React.FC<VideoPopoverProps> = ({ video, position, onAddToPriorityQueue, onCancel }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  // Adjust position to stay within viewport
  const adjustedPosition = useMemo(() => {
    const popoverWidth = 300;
    const popoverHeight = 150;
    const padding = 16;
    let x = position.x;
    let y = position.y;
    
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (y + popoverHeight > window.innerHeight - padding) {
      y = window.innerHeight - popoverHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    
    return { x, y };
  }, [position]);

  const artistDisplay = video.artist && video.artist !== 'Unknown' && video.artist.toLowerCase() !== 'unknown artist' 
    ? video.artist 
    : '';

  return (
    <div
      ref={popoverRef}
      className="video-popover"
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
        background: 'var(--yt-bg-elevated, #282828)',
        border: '1px solid var(--yt-border-subtle, #3f3f3f)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        minWidth: '280px',
        maxWidth: '360px'
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 600, 
          color: 'var(--yt-text-primary, #fff)',
          marginBottom: '4px',
          wordBreak: 'break-word'
        }}>
          {artistDisplay ? `${artistDisplay} - ${cleanVideoTitle(video.title)}` : cleanVideoTitle(video.title)}
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: 'var(--yt-text-secondary, #aaa)',
          marginTop: '8px'
        }}>
          Add to Priority Queue?
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            background: 'var(--yt-bg-tertiary, #3f3f3f)',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--yt-text-primary, #fff)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--yt-bg-hover, #4f4f4f)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--yt-bg-tertiary, #3f3f3f)'}
        >
          Cancel
        </button>
        <button
          onClick={onAddToPriorityQueue}
          style={{
            padding: '10px 20px',
            background: 'var(--yt-accent-primary, #3ea6ff)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--yt-accent-hover, #65b8ff)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--yt-accent-primary, #3ea6ff)'}
        >
          Add Video
        </button>
      </div>
    </div>
  );
};

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onPlayVideo,
  onAddToQueue,
  onAddToPriorityQueue,
  isLoading = false,
  query = '',
  className = ''
}) => {
  const [popoverVideo, setPopoverVideo] = useState<Video | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleVideoClick = useCallback((video: Video, event: React.MouseEvent) => {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleAddToPriorityQueue = useCallback(() => {
    if (popoverVideo && onAddToPriorityQueue) {
      onAddToPriorityQueue(popoverVideo);
    }
    setPopoverVideo(null);
  }, [popoverVideo, onAddToPriorityQueue]);

  const handleClosePopover = useCallback(() => {
    setPopoverVideo(null);
  }, []);

  const highlightMatch = useCallback((text: string, matches?: readonly any[]) => {
    if (!matches || matches.length === 0) return text;

    // Find matches for this text
    const textMatch = matches.find(m => m.value === text);
    if (!textMatch || !textMatch.indices || textMatch.indices.length === 0) {
      return text;
    }

    // Build highlighted text
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const [start, end] of textMatch.indices) {
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      parts.push(
        <span key={`${start}-${end}`} className="search-highlight">
          {text.slice(start, end + 1)}
        </span>
      );
      lastIndex = end + 1;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
  }, []);

  if (isLoading) {
    return (
      <div className={`search-results ${className}`}>
        <div className="empty-state">
          <div className="loading-spinner" style={{ marginBottom: '16px' }} />
          <div className="empty-state-title">Searching...</div>
        </div>
      </div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <div className={`search-results ${className}`}>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
          <div className="empty-state-title">No results found</div>
          <div className="empty-state-description">
            Try different keywords or check your spelling
          </div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={`search-results ${className}`}>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
          <div className="empty-state-title">Search your library</div>
          <div className="empty-state-description">
            Type in the search bar above to find videos
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`search-results ${className}`}>
      <div className="queue-list">
        {results.map((result, index) => {
          const video = result.item;
          const relevancePercent = Math.round((1 - (result.score || 0)) * 100);

          return (
            <div
              key={video.id || index}
              className="queue-item"
              onClick={(e) => handleVideoClick(video, e)}
              style={{ cursor: 'pointer' }}
            >
              {/* Video Thumbnail */}
              <div className="queue-item-thumbnail">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>

              {/* Video Info */}
              <div className="queue-item-info">
                <div className="queue-item-title">
                  {highlightMatch(video.title, result.matches)}
                </div>
                <div className="queue-item-artist">
                  {highlightMatch(video.artist || 'Unknown Artist', result.matches)}
                  {video.playlist && (
                    <span style={{ color: 'var(--yt-text-muted)' }}> • {video.playlist}</span>
                  )}
                </div>
              </div>

              {/* Relevance Score */}
              {result.score !== undefined && (
                <span 
                  className="queue-item-duration"
                  style={{ 
                    color: relevancePercent > 70 
                      ? 'var(--yt-accent-primary)' 
                      : relevancePercent > 40 
                        ? 'var(--yt-text-secondary)' 
                        : 'var(--yt-text-muted)' 
                  }}
                >
                  {relevancePercent}%
                </span>
              )}

              {/* Action Buttons */}
              <div className="queue-item-actions">
                <button
                  type="button"
                  className="queue-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayVideo(video);
                  }}
                  title="Play now"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <button
                  type="button"
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
          );
        })}
      </div>

      {/* Priority Queue Popover */}
      {popoverVideo && (
        <VideoPopover
          video={popoverVideo}
          position={popoverPosition}
          onAddToPriorityQueue={handleAddToPriorityQueue}
          onCancel={handleClosePopover}
        />
      )}
    </div>
  );
};
