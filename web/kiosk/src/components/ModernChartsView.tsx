/**
 * ModernChartsView.tsx - Top Charts tab with ranked list
 */

import React, { useMemo, useState } from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './ModernChartsView.css';

interface ModernChartsViewProps {
  videos: SupabaseLocalVideo[];
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
}

export const ModernChartsView: React.FC<ModernChartsViewProps> = ({
  videos,
  thumbnailsPath,
  onQueue
}) => {
  const [sortBy, setSortBy] = useState<'popularity' | 'title'>('popularity');
  
  // Sort videos (for now, just by title - in future could use play counts)
  const sortedVideos = useMemo(() => {
    const sorted = [...videos];
    if (sortBy === 'title') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    // In future, sort by play count for popularity
    return sorted.slice(0, 100); // Top 100
  }, [videos, sortBy]);
  
  return (
    <div className="modern-charts-view">
      <div className="modern-charts-header">
        <h2 className="modern-charts-title">Top Charts</h2>
        <div className="modern-charts-sort">
          <button
            className={`modern-charts-sort-btn ${sortBy === 'popularity' ? 'active' : ''}`}
            onClick={() => setSortBy('popularity')}
          >
            Popularity
          </button>
          <button
            className={`modern-charts-sort-btn ${sortBy === 'title' ? 'active' : ''}`}
            onClick={() => setSortBy('title')}
          >
            Alphabetical
          </button>
        </div>
      </div>
      
      <div className="modern-charts-list">
        {sortedVideos.map((video, index) => {
          const thumb = getThumbnailUrl(video, thumbnailsPath);
          return (
            <div
              key={video.id}
              className="modern-charts-item"
              onClick={() => onQueue(video)}
            >
              <div className="modern-charts-rank">{index + 1}</div>
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  className="modern-charts-art"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="modern-charts-info">
                <div className="modern-charts-title-text">{video.title}</div>
                {video.artist && (
                  <div className="modern-charts-artist">{video.artist}</div>
                )}
              </div>
              <button
                className="modern-charts-queue-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onQueue(video);
                }}
              >
                QUEUE
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

