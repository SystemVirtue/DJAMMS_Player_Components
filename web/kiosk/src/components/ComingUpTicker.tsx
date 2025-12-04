// ComingUpTicker.tsx - Footer ticker showing upcoming songs
// Displays priority queue first, then next 3 active queue items

import type { QueueVideoItem } from '@shared/types';
import { getDisplayArtist } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import { Star, Music } from 'lucide-react';

interface ComingUpTickerProps {
  priorityQueue: QueueVideoItem[];
  activeQueue: QueueVideoItem[];
  maxActiveItems?: number;
}

export function ComingUpTicker({ 
  priorityQueue, 
  activeQueue, 
  maxActiveItems = 3 
}: ComingUpTickerProps) {
  // Combine priority queue (all items) + next N active queue items
  const displayItems = [
    ...priorityQueue.map(item => ({ ...item, isPriority: true })),
    ...activeQueue.slice(0, maxActiveItems).map(item => ({ ...item, isPriority: false }))
  ];

  if (displayItems.length === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/80 border-t-2 border-yellow-400/50 py-3">
        <div className="text-center text-gray-400 text-sm">
          No upcoming songs in queue
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/80 border-t-2 border-yellow-400/50 py-3 overflow-hidden">
      <div className="flex items-center px-4">
        <span className="text-amber-400 font-bold text-sm tracking-wide mr-4 flex-shrink-0">
          Coming up next ...
        </span>
        
        <div className="ticker-container flex-1">
          <div className="ticker-content">
            {/* Duplicate items for seamless loop, with spacer between sets */}
            {[0, 1].map((setIndex) => (
              <div key={setIndex} className="inline-flex items-center gap-8">
                {displayItems.map((item, index) => {
                  const artist = getDisplayArtist(item.artist);
                  return (
                    <div 
                      key={`${item.id}-${setIndex}-${index}`}
                      className={`ticker-item ${item.isPriority ? 'ticker-item-priority' : ''}`}
                    >
                      {item.isPriority ? (
                        <Star size={14} className="text-amber-400 fill-amber-400" />
                      ) : (
                        <Music size={14} className="text-gray-400" />
                      )}
                      <span className="text-white text-sm font-medium">
                        {cleanVideoTitle(item.title)}
                      </span>
                      {artist && (
                        <span className="text-gray-400 text-sm">
                          — {artist}
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* Spacer after each set to show clear separation */}
                <div className="w-32 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
