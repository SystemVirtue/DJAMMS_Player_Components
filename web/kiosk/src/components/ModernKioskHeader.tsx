/**
 * ModernKioskHeader.tsx - Modern streaming-app style header
 * 1280w x 150h with Now Playing, Queue Scroll, and Credits
 */

import React from 'react';
import type { QueueVideoItem } from '@shared/types';
import { getThumbnailUrl } from '../utils/thumbnailUtils';
import './ModernKioskHeader.css';

interface ModernKioskHeaderProps {
  nowPlaying: QueueVideoItem | null;
  upcomingQueue: QueueVideoItem[];
  thumbnailsPath: string;
  isFreePlay: boolean;
  credits?: number;
}

export const ModernKioskHeader: React.FC<ModernKioskHeaderProps> = ({
  nowPlaying,
  upcomingQueue,
  thumbnailsPath,
  isFreePlay,
  credits
}) => {
  const nowPlayingThumbnail = nowPlaying 
    ? getThumbnailUrl(nowPlaying, thumbnailsPath)
    : '';
  
  return (
    <header className="modern-kiosk-header">
      {/* Left: Venue Logo/Name */}
      <div className="modern-kiosk-header-left">
        <div className="modern-kiosk-venue-logo">
          <span className="modern-kiosk-venue-name">DJAMMS</span>
        </div>
      </div>
      
      {/* Center: Now Playing */}
      <div className="modern-kiosk-header-center">
        {nowPlaying ? (
          <>
            <div className="modern-kiosk-now-playing">
              {nowPlayingThumbnail && (
                <img 
                  src={nowPlayingThumbnail}
                  alt=""
                  className="modern-kiosk-now-playing-art"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="modern-kiosk-now-playing-info">
                <div className="modern-kiosk-now-playing-title">{nowPlaying.title}</div>
                {nowPlaying.artist && (
                  <div className="modern-kiosk-now-playing-artist">{nowPlaying.artist}</div>
                )}
              </div>
            </div>
            {/* Progress bar placeholder */}
            <div className="modern-kiosk-progress-bar">
              <div className="modern-kiosk-progress-fill" style={{ width: '45%' }} />
            </div>
          </>
        ) : (
          <div className="modern-kiosk-now-playing-empty">
            No song playing
          </div>
        )}
      </div>
      
      {/* Right: Credits/Status */}
      <div className="modern-kiosk-header-right">
        <div className="modern-kiosk-status">
          {isFreePlay ? (
            <span className="modern-kiosk-status-free">FREE PLAY</span>
          ) : (
            <span className="modern-kiosk-status-credits">{credits || 0} Credits</span>
          )}
        </div>
      </div>
      
      {/* Queue Scroll - Below header content */}
      <div className="modern-kiosk-queue-scroll">
        <div className="modern-kiosk-queue-scroll-content">
          {upcomingQueue.slice(0, 5).map((item, index) => {
            const thumb = getThumbnailUrl(item, thumbnailsPath);
            return (
              <div key={`${item.id}-${index}`} className="modern-kiosk-queue-item">
                {thumb && (
                  <img 
                    src={thumb}
                    alt=""
                    className="modern-kiosk-queue-item-art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="modern-kiosk-queue-item-info">
                  <div className="modern-kiosk-queue-item-title">{item.title}</div>
                  {item.artist && (
                    <div className="modern-kiosk-queue-item-artist">{item.artist}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
};


