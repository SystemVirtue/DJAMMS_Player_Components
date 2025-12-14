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
  const [searchQuery, setSearchQuery] = useState('');
  const [karaokeFilter, setKaraokeFilter] = useState<'show' | 'hide' | 'all'>('all');

  const handleSongRequested = useCallback((video: QueueVideoItem) => {
    onSongQueued?.(video);
    setShowSearchModal(false);
  }, [onSongQueued]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Fallback Background - Behind everything */}
      <FallbackBackground />
      {/* Background Playlist - On top of fallback */}
      <BackgroundPlaylist assets={DEFAULT_BACKGROUND_ASSETS} />

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
        <div 
          className="bg-slate-900/95 backdrop-blur-md border-4 border-yellow-400 rounded-xl overflow-hidden flex flex-col shadow-2xl"
          style={{
            width: 'calc(1280px - 30px)', // 1280px - 15px left - 15px right
            height: 'calc(1024px - 15px - 15px - 60px)', // 1024px - 15px top - 15px bottom - ticker height
            margin: '15px 15px calc(15px + 60px) 15px', // 15px top/left/right, 15px + ticker height bottom
            boxSizing: 'border-box'
          }}
        >
          {/* Modal Header - Single row: SEARCH FOR MUSIC (25%) | Search Input (50%) | Filters (25%) */}
          <div className="flex items-center gap-4 p-4 border-b-2 border-yellow-400/50 bg-black/60">
            {/* Left: SEARCH FOR MUSIC text (25% width) */}
            <div className="w-[25%] flex-shrink-0">
              <h2 className="text-2xl font-bold text-yellow-300 whitespace-nowrap">SEARCH FOR MUSIC</h2>
            </div>
            
            {/* Center: Search Input (50% width) */}
            <div className="w-[50%] flex items-center justify-center">
              <div className="w-full relative">
                <input
                  type="text"
                  value={searchQuery}
                  readOnly
                  placeholder="Type to search for songs..."
                  className="w-full bg-slate-800/60 border-2 border-yellow-400 rounded-lg px-4 py-2 text-white text-lg placeholder:text-gray-500 outline-none"
                />
              </div>
            </div>
            
            {/* Right: Filter buttons (25% width) */}
            <div className="w-[25%] flex items-center justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setKaraokeFilter('all')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  karaokeFilter === 'all'
                    ? 'bg-yellow-400 text-slate-900'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                All Songs
              </button>
              <button
                onClick={() => setKaraokeFilter('hide')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  karaokeFilter === 'hide'
                    ? 'bg-yellow-400 text-slate-900'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                Hide Karaoke
              </button>
              <button
                onClick={() => setKaraokeFilter('show')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  karaokeFilter === 'show'
                    ? 'bg-yellow-400 text-slate-900'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                Karaoke Only
              </button>
            </div>
          </div>

          {/* Search Interface Content - Results and Keyboard */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <SearchInterface
              onSongRequested={handleSongRequested}
              credits={credits}
              playerId={playerId}
              showHeader={false}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              karaokeFilter={karaokeFilter}
              onKaraokeFilterChange={setKaraokeFilter}
              onClose={() => setShowSearchModal(false)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};



