/**
 * SleekKioskHeader.tsx - Sleek header matching wireframe design
 * 1280w x 80h with Venue Logo, Now Playing/Coming Up, and Credit Status
 */

import React from 'react';
import type { QueueVideoItem } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './SleekKioskHeader.css';

interface SleekKioskHeaderProps {
  venueName?: string;
  nowPlaying: QueueVideoItem | null;
  upcomingQueue: QueueVideoItem[];
  thumbnailsPath: string;
  isFreePlay: boolean;
  credits?: number;
}

export const SleekKioskHeader: React.FC<SleekKioskHeaderProps> = ({
  venueName = 'DJAMMS',
  nowPlaying,
  upcomingQueue,
  thumbnailsPath,
  isFreePlay,
  credits
}) => {
  const nowPlayingThumbnail = nowPlaying 
    ? getThumbnailUrl(nowPlaying, thumbnailsPath)
    : '';
  
  // Format upcoming queue for scrolling display
  const upcomingText = upcomingQueue.slice(0, 5).map(item => {
    const artist = item.artist || 'Unknown Artist';
    const title = item.title || 'Unknown Title';
    return `${artist} - ${title}`;
  }).join(' • ') || 'No songs queued';
  
  return (
    <header className="sleek-kiosk-header">
      {/* Left: Venue Logo/Name */}
      <div className="sleek-kiosk-header-left">
        <div className="sleek-kiosk-venue-box">
          <span className="sleek-kiosk-venue-name">{venueName}</span>
        </div>
      </div>
      
      {/* Center: Now Playing / Coming Up */}
      <div className="sleek-kiosk-header-center">
        <div className="sleek-kiosk-now-playing-line">
          <span className="sleek-kiosk-label">NOW PLAYING:</span>
          <span className="sleek-kiosk-value">
            {nowPlaying 
              ? `${nowPlaying.artist || 'Unknown Artist'} - ${nowPlaying.title || 'Unknown Title'}`
              : 'No song playing'
            }
          </span>
        </div>
        <div className="sleek-kiosk-coming-up-line">
          <span className="sleek-kiosk-label">COMING UP:</span>
          <span 
            className="sleek-kiosk-value-scroll" 
            data-scroll={shouldScroll}
          >
            {shouldScroll ? scrollingText : upcomingText}
          </span>
        </div>
      </div>
      
      {/* Right: Credit Status */}
      <div className="sleek-kiosk-header-right">
        <div className="sleek-kiosk-credit-box">
          <span className="sleek-kiosk-credit-label">CREDIT:</span>
          <span className="sleek-kiosk-credit-value">
            {isFreePlay ? 'FREE-PLAY MODE' : `${credits || 0} Credits`}
          </span>
        </div>
      </div>
    </header>
  );
};

