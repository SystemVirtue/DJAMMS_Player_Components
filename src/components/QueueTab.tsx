// src/components/QueueTab.tsx
import React from 'react';
import { Video } from '../types';
import { formatTime } from '../utils/time';
import { cleanVideoTitle } from '../utils/playlistHelpers';

interface QueueTabProps {
  queue: Video[];
  currentIndex: number;
  currentVideo: Video | null;
  onPlayVideo: (index: number) => void;
  onRemoveFromQueue: (videoId: string) => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({
  queue,
  currentIndex,
  currentVideo,
  onPlayVideo,
  onRemoveFromQueue
}) => {
  if (queue.length === 0) {
    return (
      <div className="tab-content">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
            </svg>
          </div>
          <div className="empty-state-title">Queue is empty</div>
          <div className="empty-state-description">
            Browse or search for videos and add them to your queue to start playing.
          </div>
        </div>
      </div>
    );
  }

  // Reorder queue: "up next" videos first (after currentIndex), then "already played" (before currentIndex)
  // The current video is NOT shown in this list - it's displayed in NOW PLAYING section
  const upNextVideos = queue.slice(currentIndex + 1); // Videos after current
  const alreadyPlayedVideos = queue.slice(0, currentIndex); // Videos before current
  const reorderedQueue = [...upNextVideos, ...alreadyPlayedVideos];
  
  // Map to track original indices for click handling
  const getOriginalIndex = (reorderedIndex: number): number => {
    if (reorderedIndex < upNextVideos.length) {
      // It's in the "up next" section
      return currentIndex + 1 + reorderedIndex;
    } else {
      // It's in the "already played" section
      return reorderedIndex - upNextVideos.length;
    }
  };

  return (
    <div className="tab-content">
      <div className="queue-list">
        {reorderedQueue.map((video, reorderedIndex) => {
          const originalIndex = getOriginalIndex(reorderedIndex);
          const isUpNext = reorderedIndex < upNextVideos.length;
          
          return (
            <div
              key={`${video.id}-${originalIndex}`}
              className={`queue-item ${!isUpNext ? 'played' : ''}`}
              onClick={() => onPlayVideo(originalIndex)}
            >
              <span className="queue-item-index">
                {reorderedIndex + 1}
              </span>
              
              <div className="queue-item-thumbnail">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
                </svg>
              </div>
              
              <div className="queue-item-info">
                <div className="queue-item-title">{cleanVideoTitle(video.title)}</div>
                <div className="queue-item-artist">{video.artist || 'Unknown Artist'}</div>
              </div>
              
              <span className="queue-item-duration">
                {video.duration ? formatTime(video.duration) : '--:--'}
              </span>
              
              <div className="queue-item-actions">
                <button
                  className="queue-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromQueue(video.id);
                  }}
                  title="Remove from queue"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QueueTab;
