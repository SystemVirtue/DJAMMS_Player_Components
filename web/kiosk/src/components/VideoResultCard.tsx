// VideoResultCard.tsx - Video search result card for Kiosk
// Styled with obie-v5 aesthetic

import { Music, Clock } from 'lucide-react';
import type { SupabaseLocalVideo } from '@shared/types';
import { getDisplayArtist, getPlaylistDisplayName } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';

interface VideoResultCardProps {
  video: SupabaseLocalVideo;
  isSelected?: boolean;
  onClick: () => void;
}

export function VideoResultCard({ video, isSelected, onClick }: VideoResultCardProps) {
  const artist = getDisplayArtist(video.artist);
  const playlist = video.metadata ? getPlaylistDisplayName((video.metadata as any).playlist || '') : '';
  
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
    >
      {/* Thumbnail placeholder - gradient */}
      <div className="aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded mb-3 flex items-center justify-center">
        <Music size={48} className="text-slate-500" />
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
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
      {children}
    </div>
  );
}
