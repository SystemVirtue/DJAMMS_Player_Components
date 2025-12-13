/**
 * JukeboxKiosk.tsx - Main kiosk component with new redesigned UI
 * Fixed 1280x1024 layout with Header, Content Area, and Footer
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { QueueVideoItem, SupabaseLocalVideo } from '@shared/types';
import { getAllLocalVideos, searchLocalVideos, localVideoToQueueItem } from '@shared/supabase-client';
import { JukeboxHeader } from './JukeboxHeader';
import { TileGrid } from './TileGrid';
import { BrowseBar } from './BrowseBar';
import { SearchModeFooter } from './SearchModeFooter';
import './JukeboxKiosk.css';

interface JukeboxKioskProps {
  nowPlaying: QueueVideoItem | null;
  playerId: string;
  thumbnailsPath: string;
  onSongQueued: (video: QueueVideoItem) => void;
}

export const JukeboxKiosk: React.FC<JukeboxKioskProps> = ({
  nowPlaying,
  playerId,
  thumbnailsPath,
  onSongQueued
}) => {
  // Mode state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Browse state
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'song' | 'artist'>('song');
  const [activeFilters, setActiveFilters] = useState<string[]>(['music', 'karaoke']); // Both active by default
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  
  // Data
  const [allVideos, setAllVideos] = useState<SupabaseLocalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Load all videos on mount
  useEffect(() => {
    const loadVideos = async () => {
      if (!playerId) return;
      
      setIsLoading(true);
      try {
        const videos = await getAllLocalVideos(playerId, null); // null = no limit
        setAllVideos(videos);
      } catch (error) {
        console.error('[JukeboxKiosk] Error loading videos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadVideos();
  }, [playerId]);
  
  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    let filtered = [...allVideos];
    
    // Apply search query if in search mode
    if (searchMode && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(video => {
        const title = (video.title || '').toLowerCase();
        const artist = (video.artist || '').toLowerCase();
        return title.includes(query) || artist.includes(query);
      });
    }
    
    // Apply letter filter if in browse mode
    if (!searchMode && activeLetter) {
      filtered = filtered.filter(video => {
        const firstChar = (video.title || '').trim().charAt(0).toUpperCase();
        return firstChar === activeLetter;
      });
    }
    
    // Apply music/karaoke filters
    filtered = filtered.filter(video => {
      const title = (video.title || '').toLowerCase();
      const path = (video.path || '').toLowerCase();
      const isKaraoke = title.includes('karaoke') || path.includes('karaoke');
      
      if (activeFilters.includes('music') && activeFilters.includes('karaoke')) {
        return true; // Show all
      } else if (activeFilters.includes('music')) {
        return !isKaraoke; // Show only music
      } else if (activeFilters.includes('karaoke')) {
        return isKaraoke; // Show only karaoke
      }
      return false;
    });
    
    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'song') {
        return (a.title || '').localeCompare(b.title || '');
      } else {
        return (a.artist || '').localeCompare(b.artist || '');
      }
    });
    
    return filtered;
  }, [allVideos, searchMode, searchQuery, activeLetter, activeFilters, sortBy]);
  
  // Calculate available letters
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    allVideos.forEach(video => {
      const firstChar = (video.title || '').trim().charAt(0).toUpperCase();
      if (/[A-Z]/.test(firstChar)) {
        letters.add(firstChar);
      }
    });
    return letters;
  }, [allVideos]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchMode, searchQuery, activeLetter, activeFilters, sortBy]);
  
  // Handle search query changes with debounce
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    // Debounce search for 200ms
    searchDebounceRef.current = setTimeout(() => {
      // Search is handled in filteredVideos memo
    }, 200);
  }, []);
  
  // Handle letter click
  const handleLetterClick = useCallback((letter: string) => {
    setActiveLetter(letter === activeLetter ? null : letter);
    setSearchMode(false);
    setSearchQuery('');
  }, [activeLetter]);
  
  // Handle search button click
  const handleSearchClick = useCallback(() => {
    setSearchMode(true);
    setActiveLetter(null);
    setSearchQuery('');
  }, []);
  
  // Handle hide keyboard
  const handleHideKeyboard = useCallback(() => {
    setSearchMode(false);
    setSearchQuery('');
  }, []);
  
  // Handle filter toggle
  const handleFilterToggle = useCallback((filter: 'music' | 'karaoke') => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        // Remove filter if it's the only one, otherwise remove it
        if (prev.length === 1) {
          return prev; // Keep at least one filter
        }
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  }, []);
  
  // Handle keyboard input
  const handleKeyPress = useCallback((key: string) => {
    setSearchQuery(prev => prev + key);
  }, []);
  
  const handleBackspace = useCallback(() => {
    setSearchQuery(prev => prev.slice(0, -1));
  }, []);
  
  const handleClear = useCallback(() => {
    setSearchQuery('');
  }, []);
  
  // Handle queue
  const handleQueue = useCallback((video: SupabaseLocalVideo) => {
    const queueItem = localVideoToQueueItem(video);
    onSongQueued(queueItem);
  }, [onSongQueued]);
  
  return (
    <div className={`jukebox-kiosk ${searchMode ? 'search-mode' : ''}`}>
      {/* Header */}
      <JukeboxHeader
        nowPlaying={nowPlaying}
        searchMode={searchMode}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        thumbnailsPath={thumbnailsPath}
      />
      
      {/* Content Area */}
      <div className="jukebox-kiosk-content">
        {isLoading ? (
          <div className="jukebox-kiosk-loading">
            <p>Loading songs...</p>
          </div>
        ) : (
          <>
            {/* Sort Toggle */}
            <div className="jukebox-kiosk-sort">
              <button
                className={`jukebox-kiosk-sort-btn ${sortBy === 'song' ? 'active' : ''}`}
                onClick={() => setSortBy('song')}
              >
                By Song Title
              </button>
              <button
                className={`jukebox-kiosk-sort-btn ${sortBy === 'artist' ? 'active' : ''}`}
                onClick={() => setSortBy('artist')}
              >
                By Artist Name
              </button>
            </div>
            
            {/* Tile Grid */}
            <TileGrid
              videos={filteredVideos}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              thumbnailsPath={thumbnailsPath}
              onQueue={handleQueue}
            />
            
            {/* Search Results Count */}
            {searchMode && searchQuery.trim() && (
              <div className="jukebox-kiosk-results-count">
                Showing {filteredVideos.length} result{filteredVideos.length !== 1 ? 's' : ''} for "{searchQuery}"
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Footer */}
      {searchMode ? (
        <SearchModeFooter
          onKeyPress={handleKeyPress}
          onBackspace={handleBackspace}
          onClear={handleClear}
          onHideKeyboard={handleHideKeyboard}
        />
      ) : (
        <BrowseBar
          activeLetter={activeLetter}
          onLetterClick={handleLetterClick}
          onSearchClick={handleSearchClick}
          activeFilters={activeFilters}
          onFilterToggle={handleFilterToggle}
          availableLetters={availableLetters}
        />
      )}
    </div>
  );
};

