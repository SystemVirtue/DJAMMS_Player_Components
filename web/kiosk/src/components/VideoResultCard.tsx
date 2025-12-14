// VideoResultCard.tsx - Video search result card for Kiosk
// Styled with obie-v5 aesthetic

import React, { useState, useEffect } from 'react';
import { Music, Clock } from 'lucide-react';
import type { SupabaseLocalVideo } from '@shared/types';
import { getDisplayArtist, getPlaylistDisplayName } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import { getThumbnailUrl, getThumbnailUrlSync } from '../utils/thumbnailUtils';
import { getThumbnailsPath } from '@shared/settings';

interface VideoResultCardProps {
  video: SupabaseLocalVideo;
  isSelected?: boolean;
  onClick: () => void;
}

export function VideoResultCard({ video, isSelected, onClick }: VideoResultCardProps) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const artist = getDisplayArtist(video.artist);
  const playlist = video.metadata ? getPlaylistDisplayName((video.metadata as any).playlist || '') : '';
  const thumbnailsPath = getThumbnailsPath();
  
  // Load thumbnail URL (async for web, sync for Electron)
  useEffect(() => {
    const loadThumbnail = async () => {
      try {
        // Check if we're in Electron (synchronous)
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
          const url = getThumbnailUrlSync(video, thumbnailsPath);
          setThumbnailUrl(url);
        } else {
          // For web, use async cache
          const url = await getThumbnailUrl(video, thumbnailsPath);
          setThumbnailUrl(url);
        }
      } catch (error) {
        console.error('[VideoResultCard] Error loading thumbnail:', error);
        setThumbnailUrl('');
      }
    };
    
    loadThumbnail();
  }, [video, thumbnailsPath]);
  
  // Only allow valid protocols (djamms://, http://, https://, blob:) - never file://
  const isValidUrl = thumbnailUrl && 
    (thumbnailUrl.startsWith('djamms://') || 
     thumbnailUrl.startsWith('http://') || 
     thumbnailUrl.startsWith('https://') ||
     thumbnailUrl.startsWith('blob:'));
  const hasThumbnail = isValidUrl && !thumbnailError;
  
  // Format duration from seconds to mm:ss
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={onClick}
      className={`video-card p-4 ${isSelected ? 'video-card-selected' : ''}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
    >
      {/* Thumbnail with fallback */}
      <div 
        className="aspect-video bg-black rounded mb-3 flex items-center justify-center overflow-hidden"
        style={{
          backgroundImage: hasThumbnail ? `url(${thumbnailUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {hasThumbnail && (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setThumbnailError(true)}
            loading="lazy"
          />
        )}
        {(!hasThumbnail || thumbnailError) && (
          <Music size={48} className="text-slate-500" />
        )}
      </div>
      
      {/* Video info */}
      <div className="space-y-1">
        <h3 className="font-semibold text-white truncate" title={cleanVideoTitle(video.title)}>
          {cleanVideoTitle(video.title)}
        </h3>
        {artist && (
          <p className="text-sm text-gray-400 truncate" title={artist}>
            {artist}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          {playlist && (
            <span className="truncate max-w-[60%]" title={playlist}>
              {playlist}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDuration(video.duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Grid layout wrapper for video cards
interface VideoGridProps {
  children: React.ReactNode;
}

export function VideoGrid({ children }: VideoGridProps) {
  // Convert children to array - pagination is handled in parent
  const childrenArray = React.Children.toArray(children);
  
  return (
    <div className="grid grid-cols-4 gap-4" style={{ gridTemplateRows: 'repeat(2, minmax(200px, 1fr))', gridAutoRows: 'minmax(200px, 1fr)' }}>
      {childrenArray}
    </div>
  );
}
