// NowPlaying.tsx - Now Playing display for Kiosk top-left corner
// Styled with obie-v5 aesthetic

import { Music } from 'lucide-react';
import type { NowPlayingVideo } from '@shared/types';
import { getDisplayArtist } from '@shared/supabase-client';

interface NowPlayingProps {
  video: NowPlayingVideo | null;
  isOnline: boolean;
}

export function NowPlaying({ video, isOnline }: NowPlayingProps) {
  const artist = video ? getDisplayArtist(video.artist) : null;

  return (
    <div className="fixed top-4 left-4 z-20">
      <div className="kiosk-card max-w-xs">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          
          <div className="flex-1 min-w-0">
            <p className="text-amber-400 text-xs font-bold uppercase tracking-wide mb-1">
              Now Playing
            </p>
            {video ? (
              <>
                <p className="text-white text-sm font-semibold truncate">
                  {video.title}
                </p>
                {artist && (
                  <p className="text-gray-300 text-xs truncate">
                    {artist}
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-400 text-sm italic">
                No song playing
              </p>
            )}
          </div>
          
          {/* Music icon */}
          <div className="flex-shrink-0">
            <Music size={24} className="text-yellow-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
