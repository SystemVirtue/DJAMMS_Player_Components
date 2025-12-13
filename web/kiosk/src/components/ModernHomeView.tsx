/**
 * ModernHomeView.tsx - Home tab with curated sections
 * 4x2 grid of 300x300 cards
 */

import React from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './ModernHomeView.css';

interface ModernHomeViewProps {
  videos: SupabaseLocalVideo[];
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
}

export const ModernHomeView: React.FC<ModernHomeViewProps> = ({
  videos,
  thumbnailsPath,
  onQueue
}) => {
  // Create featured playlists (group by playlist)
  const playlists = React.useMemo(() => {
    const grouped: Record<string, SupabaseLocalVideo[]> = {};
    videos.forEach(video => {
      const metadata = video.metadata as any;
      const playlist = metadata?.playlist || 'Unknown';
      if (!grouped[playlist]) grouped[playlist] = [];
      grouped[playlist].push(video);
    });
    return Object.entries(grouped)
      .map(([name, items]) => ({ name, items, count: items.length }))
      .filter(p => p.count > 0)
      .slice(0, 8); // Show top 8 playlists
  }, [videos]);
  
  return (
    <div className="modern-home-view">
      <h2 className="modern-home-section-title">Featured Playlists</h2>
      <div className="modern-home-grid">
        {playlists.map((playlist, index) => {
          const firstVideo = playlist.items[0];
          const thumb = firstVideo ? getThumbnailUrl(firstVideo, thumbnailsPath) : '';
          
          return (
            <div
              key={playlist.name}
              className="modern-home-card"
              onClick={() => {
                // Queue first song from playlist
                if (firstVideo) {
                  onQueue(firstVideo);
                }
              }}
            >
              <div 
                className="modern-home-card-background"
                style={{
                  backgroundImage: thumb ? `url(${thumb})` : 'none',
                  backgroundColor: thumb ? 'transparent' : '#000000'
                }}
              >
                <div className="modern-home-card-overlay" />
              </div>
              <div className="modern-home-card-content">
                <div className="modern-home-card-title">{playlist.name}</div>
                <div className="modern-home-card-count">{playlist.count} songs</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

