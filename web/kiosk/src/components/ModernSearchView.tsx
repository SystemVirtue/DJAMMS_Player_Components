/**
 * ModernSearchView.tsx - Search tab with predictive search and results grid
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SupabaseLocalVideo } from '@shared/types';
import { searchLocalVideos, getAllLocalVideos } from '@shared/supabase-client';
import { SongTile } from './SongTile';
import { SearchKeyboardModal } from './SearchKeyboardModal';
import './ModernSearchView.css';

interface ModernSearchViewProps {
  playerId: string;
  thumbnailsPath: string;
  onQueue: (video: SupabaseLocalVideo) => void;
}

export const ModernSearchView: React.FC<ModernSearchViewProps> = ({
  playerId,
  thumbnailsPath,
  onQueue
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SupabaseLocalVideo[]>([]);
  const [predictions, setPredictions] = useState<string[]>([]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Perform search with debounce
  const performSearch = useCallback(async (query: string) => {
    if (!playerId) return;
    
    if (!query.trim()) {
      // Show all videos when query is empty
      setIsSearching(true);
      try {
        const videos = await getAllLocalVideos(playerId, null);
        setSearchResults(videos);
      } catch (error) {
        console.error('[ModernSearchView] Error loading videos:', error);
      } finally {
        setIsSearching(false);
      }
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await searchLocalVideos(query, playerId, 200);
      setSearchResults(results);
      
      // Generate predictions from results
      const uniqueArtists = [...new Set(results.map(v => v.artist).filter(Boolean))].slice(0, 5);
      setPredictions(uniqueArtists as string[]);
    } catch (error) {
      console.error('[ModernSearchView] Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  }, [playerId]);
  
  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    searchDebounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, performSearch]);
  
  const handleKeyPress = (key: string) => {
    setSearchQuery(prev => prev + key);
  };
  
  const handleBackspace = () => {
    setSearchQuery(prev => prev.slice(0, -1));
  };
  
  const handleClear = () => {
    setSearchQuery('');
  };
  
  const handlePredictionClick = (prediction: string) => {
    setSearchQuery(prediction);
    setShowKeyboard(false);
  };
  
  return (
    <div className="modern-search-view">
      {/* Search Bar */}
      <div className="modern-search-bar-container">
        <input
          ref={searchInputRef}
          type="text"
          className="modern-search-bar"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setShowKeyboard(true)}
          placeholder="Search artists or songs..."
        />
        
        {/* Predictive Dropdown */}
        {predictions.length > 0 && searchQuery && (
          <div className="modern-search-predictions">
            {predictions.map((prediction, index) => (
              <button
                key={index}
                className="modern-search-prediction-item"
                onClick={() => handlePredictionClick(prediction)}
              >
                {prediction}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Results Grid - 4 columns */}
      <div className="modern-search-results">
        {isSearching ? (
          <div className="modern-search-loading">Searching...</div>
        ) : searchResults.length === 0 ? (
          <div className="modern-search-empty">
            {searchQuery ? `No results found for "${searchQuery}"` : 'Start typing to search...'}
          </div>
        ) : (
          <div className="modern-search-grid">
            {searchResults.map((video) => (
              <SongTile
                key={video.id}
                video={video}
                thumbnailsPath={thumbnailsPath}
                onQueue={onQueue}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Keyboard Modal - Only shown when input is focused */}
      {showKeyboard && (
        <SearchKeyboardModal
          onKeyPress={handleKeyPress}
          onBackspace={handleBackspace}
          onClear={handleClear}
          onClose={() => setShowKeyboard(false)}
        />
      )}
    </div>
  );
};

