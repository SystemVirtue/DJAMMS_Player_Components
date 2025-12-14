/**
 * ObieKiosk.tsx - Main kiosk component matching obie-v5 aesthetic
 * Black background, fixed position elements, modal-based search
 */

import React, { useState, useCallback } from 'react';
import { BackgroundPlaylist, DEFAULT_BACKGROUND_ASSETS, FallbackBackground } from './BackgroundPlaylist';
import { ObieNowPlaying } from './ObieNowPlaying';
import { ObieCredits } from './ObieCredits';
import { ObieSearchButton } from './ObieSearchButton';
import { ObieComingUpMarquee } from './ObieComingUpMarquee';
import { SearchInterface } from './SearchInterface';
import { Dialog } from './Dialog';
import type { QueueVideoItem } from '@shared/types';

interface ObieKioskProps {
  nowPlaying: QueueVideoItem | null;
  activeQueue: QueueVideoItem[];
  priorityQueue: QueueVideoItem[];
  playerId: string;
  credits?: number;
  isFreePlay?: boolean;
  onSongQueued?: (video: QueueVideoItem) => void;
}

export const ObieKiosk: React.FC<ObieKioskProps> = ({
  nowPlaying,
  activeQueue,
  priorityQueue,
  playerId,
  credits = 999,
  isFreePlay = true,
  onSongQueued
}) => {
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleSongRequested = useCallback((video: QueueVideoItem) => {
    onSongQueued?.(video);
    setShowSearchModal(false);
  }, [onSongQueued]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Background Playlist */}
      <BackgroundPlaylist assets={DEFAULT_BACKGROUND_ASSETS} />
      <FallbackBackground />

      {/* Fixed Now Playing - Top Left */}
      <ObieNowPlaying nowPlaying={nowPlaying} />

      {/* Fixed Credits - Top Right */}
      <ObieCredits isFreePlay={isFreePlay} credits={credits} />

      {/* Centered Search Button */}
      {!showSearchModal && (
        <ObieSearchButton onClick={() => setShowSearchModal(true)} />
      )}

      {/* Coming Up Marquee - Bottom */}
      <ObieComingUpMarquee
        priorityQueue={priorityQueue}
        activeQueue={activeQueue}
        maxActiveItems={3}
      />

      {/* Search Modal */}
      <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
        <div className="bg-slate-900/95 backdrop-blur-md border-4 border-yellow-400 rounded-xl w-[95vw] h-[90vh] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b-2 border-yellow-400/50 bg-black/60">
            <h2 className="text-2xl font-bold text-yellow-300">SEARCH FOR MUSIC</h2>
            <button
              onClick={() => setShowSearchModal(false)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg transition-colors"
            >
              CLOSE
            </button>
          </div>

          {/* Search Interface Content */}
          <div className="flex-1 overflow-hidden">
            <SearchInterface
              onSongRequested={handleSongRequested}
              credits={credits}
              playerId={playerId}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};



