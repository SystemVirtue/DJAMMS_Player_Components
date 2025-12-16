import React from 'react';
import type { Video } from '../../types';

interface VideoResultCardProps {
  video: Video;
  onAddToQueue?: (video: Video) => void;
  onAddToPriorityQueue?: (video: Video) => void;
  showActions?: boolean;
}

export const VideoResultCard: React.FC<VideoResultCardProps> = ({
  video,
  onAddToQueue,
  onAddToPriorityQueue,
  showActions = true
}) => {
  return (
    <div className="video-result-card bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">
            {video.title}
          </h3>
          <p className="text-xs text-gray-600 line-clamp-1">
            {video.artist || 'Unknown Artist'}
          </p>
          {video.duration && (
            <p className="text-xs text-gray-500 mt-1">
              {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
            </p>
          )}
        </div>
      </div>

      {showActions && (
        <div className="flex space-x-2">
          {onAddToQueue && (
            <button
              onClick={() => onAddToQueue(video)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            >
              Add to Queue
            </button>
          )}
          {onAddToPriorityQueue && (
            <button
              onClick={() => onAddToPriorityQueue(video)}
              className="px-3 py-2 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 transition-colors"
            >
              Priority
            </button>
          )}
        </div>
      )}
    </div>
  );
};
