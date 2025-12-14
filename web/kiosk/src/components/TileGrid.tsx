/**
 * TileGrid.tsx - Grid layout for song tiles with pagination
 * Displays 3 columns x 4 rows = 12 tiles per page
 */

import React, { useMemo } from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { SongTile } from './SongTile';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './TileGrid.css';

interface TileGridProps {
  videos: SupabaseLocalVideo[];
  currentPage: number;
  onPageChange: (page: number) => void;
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
}

const ITEMS_PER_PAGE = 12; // 4 columns x 3 rows

export const TileGrid: React.FC<TileGridProps> = ({
  videos,
  currentPage,
  onPageChange,
  thumbnailsPath,
  onQueue
}) => {
  const totalPages = Math.ceil(videos.length / ITEMS_PER_PAGE);
  
  // Calculate paginated videos
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return videos.slice(startIndex, endIndex);
  }, [videos, currentPage]);
  
  // Get first letter of title for badge
  const getFirstLetter = (title: string): string => {
    if (!title) return '';
    const firstChar = title.trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(firstChar) ? firstChar : '#';
  };
  
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };
  
  // Render page indicator
  const renderPageIndicator = () => {
    if (totalPages <= 1) return null;
    
    if (totalPages < 10) {
      // Show dots for fewer pages
      return (
        <div className="tile-grid-page-indicator-dots">
          {Array.from({ length: totalPages }, (_, i) => (
            <span
              key={i}
              className={`tile-grid-dot ${i + 1 === currentPage ? 'active' : ''}`}
            />
          ))}
        </div>
      );
    } else {
      // Show "Page X of Y" for many pages
      return (
        <div className="tile-grid-page-indicator-text">
          Page {currentPage} of {totalPages}
        </div>
      );
    }
  };
  
  return (
    <div className="tile-grid-container">
      {/* Left Navigation Arrow */}
      <button
        className={`tile-grid-nav-arrow tile-grid-nav-arrow-left ${
          currentPage <= 1 ? 'disabled' : ''
        }`}
        onClick={handlePreviousPage}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={40} />
      </button>
      
      {/* Grid */}
      <div className="tile-grid">
        {paginatedVideos.length === 0 ? (
          <div className="tile-grid-empty">
            <p>No songs found</p>
          </div>
        ) : (
          paginatedVideos.map((video) => (
            <SongTile
              key={video.id}
              video={video}
              thumbnailsPath={thumbnailsPath}
              onQueue={onQueue}
              letter={getFirstLetter(video.title || '')}
            />
          ))
        )}
      </div>
      
      {/* Right Navigation Arrow */}
      <button
        className={`tile-grid-nav-arrow tile-grid-nav-arrow-right ${
          currentPage >= totalPages ? 'disabled' : ''
        }`}
        onClick={handleNextPage}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={40} />
      </button>
      
      {/* Page Indicator */}
      {renderPageIndicator()}
    </div>
  );
};

