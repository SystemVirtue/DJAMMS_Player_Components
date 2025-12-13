/**
 * BrowseBar.tsx - Footer component for Browse Mode
 * Contains A-Z letter grid, Search button, and Filter toggles
 */

import React from 'react';
import { Search, Music, Mic } from 'lucide-react';
import './BrowseBar.css';

interface BrowseBarProps {
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
  onSearchClick: () => void;
  activeFilters: string[];
  onFilterToggle: (filter: 'music' | 'karaoke') => void;
  availableLetters: Set<string>; // Letters that have content
}

const ALPHABET_ROW_1 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const ALPHABET_ROW_2 = ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const BrowseBar: React.FC<BrowseBarProps> = ({
  activeLetter,
  onLetterClick,
  onSearchClick,
  activeFilters,
  onFilterToggle,
  availableLetters
}) => {
  return (
    <div className="browse-bar">
      {/* A-Z Letter Grid */}
      <div className="browse-bar-alphabet">
        <div className="browse-bar-alphabet-row">
          {ALPHABET_ROW_1.map((letter) => {
            const hasContent = availableLetters.has(letter);
            const isActive = activeLetter === letter;
            
            return (
              <button
                key={letter}
                className={`browse-bar-letter ${isActive ? 'active' : ''} ${!hasContent ? 'disabled' : ''}`}
                onClick={() => hasContent && onLetterClick(letter)}
                disabled={!hasContent}
              >
                {letter}
              </button>
            );
          })}
        </div>
        <div className="browse-bar-alphabet-row">
          {ALPHABET_ROW_2.map((letter) => {
            const hasContent = availableLetters.has(letter);
            const isActive = activeLetter === letter;
            
            return (
              <button
                key={letter}
                className={`browse-bar-letter ${isActive ? 'active' : ''} ${!hasContent ? 'disabled' : ''}`}
                onClick={() => hasContent && onLetterClick(letter)}
                disabled={!hasContent}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Search Button */}
      <button className="browse-bar-search-btn" onClick={onSearchClick}>
        <Search size={60} />
        <span className="browse-bar-search-label">SEARCH</span>
      </button>
      
      {/* Filter Toggles */}
      <div className="browse-bar-filters">
        <button
          className={`browse-bar-filter ${activeFilters.includes('music') ? 'active' : ''}`}
          onClick={() => onFilterToggle('music')}
        >
          <Music size={20} />
          <span>MUSIC</span>
        </button>
        <button
          className={`browse-bar-filter ${activeFilters.includes('karaoke') ? 'active' : ''}`}
          onClick={() => onFilterToggle('karaoke')}
        >
          <Mic size={20} />
          <span>KARAOKE</span>
        </button>
      </div>
    </div>
  );
};

