/**
 * SleekKioskGrid.tsx - Grid of video tiles with scrollbar
 * 4 columns x multiple rows, matching wireframe design
 */

import React, { useState, useMemo } from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { SongTile } from './SongTile';
import { ChevronUp, ChevronDown } from 'lucide-react';
import './SleekKioskGrid.css';

interface SleekKioskGridProps {
  videos: SupabaseLocalVideo[];
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
  itemsPerPage?: number;
}

export const SleekKioskGrid: React.FC<SleekKioskGridProps> = ({
  videos,
  thumbnailsPath,
  onQueue,
  itemsPerPage = 12 // 4 columns x 3 rows
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  const totalPages = Math.ceil(videos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedVideos = videos.slice(startIndex, endIndex);
  
  const handlePageUp = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handlePageDown = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Calculate scroll thumb position
  const scrollThumbPosition = totalPages > 1 
    ? ((currentPage - 1) / (totalPages - 1)) * 100 
    : 0;
  const scrollThumbHeight = totalPages > 1 
    ? Math.max(20, (100 / totalPages)) 
    : 100;
  
  return (
    <div className="sleek-kiosk-grid-container">
      {/* Left Arrow */}
      <button
        className={`sleek-kiosk-grid-arrow sleek-kiosk-grid-arrow-left ${currentPage === 1 ? 'disabled' : ''}`}
        onClick={handlePageUp}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronUp size={40} />
      </button>
      
      {/* Grid */}
      <div className="sleek-kiosk-grid">
        {displayedVideos.length === 0 ? (
          <div className="sleek-kiosk-grid-empty">
            <p>No songs found</p>
          </div>
        ) : (
          displayedVideos.map((video) => (
            <SongTile
              key={video.id}
              video={video}
              thumbnailsPath={thumbnailsPath}
              onQueue={onQueue}
            />
          ))
        )}
      </div>
      
      {/* Right Arrow */}
      <button
        className={`sleek-kiosk-grid-arrow sleek-kiosk-grid-arrow-right ${currentPage === totalPages ? 'disabled' : ''}`}
        onClick={handlePageDown}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronDown size={40} />
      </button>
      
      {/* Scrollbar */}
      <div className="sleek-kiosk-scrollbar">
        <button
          className={`sleek-kiosk-scroll-btn sleek-kiosk-scroll-btn-up ${currentPage === 1 ? 'disabled' : ''}`}
          onClick={handlePageUp}
          disabled={currentPage === 1}
        >
          <ChevronUp size={24} />
        </button>
        
        <div className="sleek-kiosk-scroll-track">
          <div
            className="sleek-kiosk-scroll-thumb"
            style={{
              top: `${scrollThumbPosition}%`,
              height: `${scrollThumbHeight}%`
            }}
          />
        </div>
        
        <button
          className={`sleek-kiosk-scroll-btn sleek-kiosk-scroll-btn-down ${currentPage === totalPages ? 'disabled' : ''}`}
          onClick={handlePageDown}
          disabled={currentPage === totalPages}
        >
          <ChevronDown size={24} />
        </button>
      </div>
      
      {/* Page Indicator */}
      {totalPages > 1 && (
        <div className="sleek-kiosk-page-indicator">
          Page {currentPage} of {totalPages}
        </div>
      )}
    </div>
  );
};

