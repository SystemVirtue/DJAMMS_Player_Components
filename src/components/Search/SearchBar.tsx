// src/components/Search/SearchBar.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear?: () => void;
  placeholder?: string;
  recentSearches?: string[];
  onRecentSearchClick?: (query: string) => void;
  isSearching?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onClear,
  placeholder = 'Search videos...',
  recentSearches = [],
  onRecentSearchClick,
  isSearching = false,
  className = '',
  autoFocus = false
}) => {
  const [query, setQuery] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle outside clicks to close recent searches dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowRecent(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowRecent(false);
    }
  }, [query, onSearch]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // Trigger search as user types (debounced in parent)
    if (value.trim()) {
      onSearch(value.trim());
    }
  }, [onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    onClear?.();
    inputRef.current?.focus();
  }, [onClear]);

  const handleRecentClick = useCallback((recentQuery: string) => {
    setQuery(recentQuery);
    onRecentSearchClick?.(recentQuery);
    setShowRecent(false);
  }, [onRecentSearchClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
      setShowRecent(false);
    }
  }, [handleClear]);

  return (
    <div ref={containerRef} className={`search-bar-container relative ${className}`}>
      <form onSubmit={handleSubmit} className="search-form">
        <div className="relative flex items-center">
          {/* Search Icon */}
          <div className="absolute left-3 text-gray-400 pointer-events-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => setShowRecent(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-10 pr-10 py-3 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Loading/Clear Button */}
          <div className="absolute right-3">
            {isSearching ? (
              <div className="animate-spin">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : query && (
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Recent Searches Dropdown */}
      {showRecent && recentSearches.length > 0 && !query && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
            Recent Searches
          </div>
          <div className="max-h-64 overflow-y-auto">
            {recentSearches.map((recent, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleRecentClick(recent)}
                className="w-full px-3 py-2 text-left text-gray-300 hover:bg-gray-700 flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="truncate">{recent}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
