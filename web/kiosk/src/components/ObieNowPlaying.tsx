/**
 * ObieNowPlaying.tsx - Fixed top-left box with yellow border
 * Matches obie-v5 aesthetic
 */

import React from 'react';
import type { QueueVideoItem } from '@shared/types';
import { getDisplayArtist } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';

interface ObieNowPlayingProps {
  nowPlaying: QueueVideoItem | null;
}

export const ObieNowPlaying: React.FC<ObieNowPlayingProps> = ({ nowPlaying }) => {
  const artist = nowPlaying ? getDisplayArtist(nowPlaying.artist) : null;

  return (
    <div className="fixed top-4 left-4 z-20">
      <div className="bg-black/60 border-2 border-yellow-400 rounded-lg p-3 shadow-lg max-w-xs">
        <div className="flex flex-col">
          <p className="text-white text-sm font-bold mb-1">NOW PLAYING</p>
          {nowPlaying ? (
            <>
              <p className="text-yellow-300 text-sm font-semibold truncate">
                {cleanVideoTitle(nowPlaying.title)}
              </p>
              {artist && (
                <p className="text-gray-300 text-xs truncate">
                  {artist.replace(/\s*-\s*Topic$/i, '')}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm italic">No song playing</p>
          )}
        </div>
      </div>
    </div>
  );
};


