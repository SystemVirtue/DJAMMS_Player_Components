// ComingUpTicker.tsx - Footer ticker showing upcoming songs
// Displays "Coming Up ... " text, then priority queue, then active queue indices 1, 2, 3

import type { QueueVideoItem } from '@shared/types';
import { getDisplayArtist } from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import { Star, Music } from 'lucide-react';

interface ComingUpTickerProps {
  priorityQueue: QueueVideoItem[];
  activeQueue: QueueVideoItem[];
  maxActiveItems?: number;
}

type DisplayItem = 
  | { type: 'text'; text: string }
  | { type: 'video'; item: QueueVideoItem; isPriority: boolean };

export function ComingUpTicker({ 
  priorityQueue, 
  activeQueue, 
  maxActiveItems = 3 
}: ComingUpTickerProps) {
  // ARCHITECTURE: Index 0 is always now-playing - show indices 1, 2, 3 from active queue
  // Build display items: "Coming Up ... " text, then priority queue, then active queue indices 1-3
  const displayItems: DisplayItem[] = [
    { type: 'text', text: 'Coming Up ... ' },
    ...priorityQueue.map(item => ({ type: 'video' as const, item, isPriority: true })),
    ...activeQueue.slice(1, maxActiveItems + 1).map(item => ({ type: 'video' as const, item, isPriority: false }))
  ];

  // Check if we have any videos to display (excluding the text item)
  const hasVideos = priorityQueue.length > 0 || activeQueue.length > 1;

  if (!hasVideos) {
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
        <div className="ticker-container flex-1">
          <div className="ticker-content">
            {/* Duplicate items for seamless loop, with spacer between sets */}
            {[0, 1].map((setIndex) => (
              <div key={setIndex} className="inline-flex items-center gap-8">
                {displayItems.map((displayItem, index) => {
                  if (displayItem.type === 'text') {
                    // Render "Coming Up ... " text
                    return (
                      <span 
                        key={`text-${setIndex}-${index}`}
                        className="text-amber-400 font-bold text-sm tracking-wide"
                      >
                        {displayItem.text}
                      </span>
                    );
                  } else {
                    // Render video item
                    const { item, isPriority } = displayItem;
                    const artist = getDisplayArtist(item.artist);
                    return (
                      <div 
                        key={`${item.id}-${setIndex}-${index}`}
                        className={`ticker-item ${isPriority ? 'ticker-item-priority' : ''}`}
                      >
                        {isPriority ? (
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
                  }
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
