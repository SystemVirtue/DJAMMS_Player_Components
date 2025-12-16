/**
 * ComingUpTicker.tsx - Scrolling ticker for Player Overlay
 * Shows upcoming queue items (priority queue + active queue) in a scrolling marquee
 * Positioned and sized according to overlay settings
 */

import React from 'react';
import type { Video } from '../types';
import { cleanVideoTitle } from '../utils/playlistHelpers';

interface ComingUpTickerProps {
  priorityQueue: Video[];
  activeQueue: Video[];
  queueIndex: number;
  maxActiveItems?: number;
  // Overlay settings
  positionX: number; // Percentage (0-100)
  positionY: number; // Percentage (0-100)
  size: number; // Percentage (10-200)
  opacity: number; // Percentage (10-100)
}

export const ComingUpTicker: React.FC<ComingUpTickerProps> = ({
  priorityQueue,
  activeQueue,
  queueIndex,
  maxActiveItems = 3,
  positionX,
  positionY,
  size,
  opacity
}) => {
  // Combine priority queue (all items) + next N active queue items
  const displayItems = [
    ...priorityQueue.map(item => ({ ...item, isPriority: true })),
    ...activeQueue.slice(queueIndex + 1, queueIndex + 1 + maxActiveItems).map(item => ({ ...item, isPriority: false }))
  ];

  if (displayItems.length === 0) {
    return null; // Don't show if no upcoming items
  }

  // Helper to get display artist
  const getDisplayArtist = (artist: string | null | undefined): string => {
    if (!artist || artist === 'Unknown' || artist.toLowerCase() === 'unknown artist') {
      return '';
    }
    return artist.replace(/\s*-\s*Topic$/i, '');
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${positionX}%`,
        top: `${positionY}%`,
        transform: `scale(${size / 100})`,
        transformOrigin: positionY > 50 ? 'bottom left' : 'top left',
        opacity: opacity / 100,
        zIndex: 1000,
        pointerEvents: 'none',
        width: '100%',
        maxWidth: '90vw',
        overflow: 'hidden',
        background: 'rgba(0, 0, 0, 0.8)',
        borderTop: '2px solid rgba(255, 193, 7, 0.5)',
        padding: '12px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '32px',
            whiteSpace: 'nowrap',
            animation: 'scroll-left 30s linear infinite',
          }}
        >
          {/* Duplicate items for seamless loop, with spacer between sets */}
          {[0, 1].map((setIndex) => (
            <div key={setIndex} style={{ display: 'inline-flex', alignItems: 'center', gap: '32px' }}>
              {/* "Coming Up ... " text at start of each set */}
              <span
                style={{
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  letterSpacing: '1px',
                  marginRight: '16px',
                  flexShrink: 0,
                }}
              >
                Coming Up ... 
              </span>
              {displayItems.map((item, index) => {
                const artist = getDisplayArtist(item.artist);
                return (
                  <div
                    key={`${item.id}-${setIndex}-${index}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      backgroundColor: item.isPriority
                        ? 'rgba(255, 193, 7, 0.3)'
                        : 'rgba(30, 41, 59, 0.8)',
                      border: `1px solid ${item.isPriority ? 'rgba(255, 193, 7, 0.5)' : 'rgba(255, 193, 7, 0.5)'}`,
                    }}
                  >
                    {item.isPriority ? (
                      <span style={{ color: '#ffc107', fontSize: '14px' }}>★</span>
                    ) : (
                      <span style={{ color: '#ffeb3b', fontSize: '14px' }}>♪</span>
                    )}
                    <span style={{ color: '#ffeb3b', fontSize: '14px', fontWeight: 500 }}>
                      {cleanVideoTitle(item.title)}
                    </span>
                    {artist && (
                      <span style={{ color: 'rgba(255, 235, 59, 0.8)', fontSize: '14px' }}>
                        — {artist}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* Spacer after each set to show clear separation */}
              <div style={{ width: '128px', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
};
