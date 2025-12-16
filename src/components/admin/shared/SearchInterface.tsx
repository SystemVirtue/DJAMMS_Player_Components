import React, { useState, useEffect } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import type { Video } from '../../../types';

interface SearchInterfaceProps {
  playlists: Record<string, Video[]>;
  onCommand: (command: string, data?: any) => Promise<void>;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  playlists,
  onCommand
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'browse'>('browse');

  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim() && activeTab === 'search') {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        if (activeTab === 'search' && searchQuery.trim()) {
          // Use unified API for search
          const results = await unifiedAPI.searchVideos(searchQuery);
          setSearchResults(results);
        } else if (activeTab === 'browse') {
          // Show all videos for browsing
          const allVideos = Object.values(playlists).flat();
          setSearchResults(allVideos);
        }
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, playlists, activeTab]);

  const handleAddToQueue = async (video: Video) => {
    await onCommand('queue_add', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        src: video.src,
        path: video.path,
        duration: video.duration,
        playlist: video.playlist
      }
    });
  };

  const handlePlayNow = async (video: Video) => {
    await onCommand('play_now', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        src: video.src,
        path: video.path,
        duration: video.duration,
        playlist: video.playlist
      }
    });
  };

  return (
    <div className="search-interface bg-ytm-surface rounded-lg shadow-sm p-6">
      <div className="mb-6">
        <div className="flex border-b border-ytm-divider mb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'browse'
                ? 'text-ytm-accent border-b-2 border-ytm-accent'
                : 'text-ytm-text-secondary hover:text-ytm-text'
            }`}
          >
            Browse Library
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-ytm-accent border-b-2 border-ytm-accent'
                : 'text-ytm-text-secondary hover:text-ytm-text'
            }`}
          >
            Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search for songs, artists, or albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-12 border border-ytm-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-ytm-accent focus:border-transparent bg-ytm-surface text-ytm-text placeholder-ytm-text-secondary"
            />
            <div className="absolute left-3 top-3.5 text-ytm-text-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isSearching && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ytm-accent mx-auto mb-2"></div>
            <p className="text-ytm-text-secondary">Searching...</p>
          </div>
        )}

        {!isSearching && searchResults.map((video, index) => (
          <div key={`${video.id}-${index}`} className="flex items-center justify-between p-4 border border-ytm-divider rounded-lg hover:bg-ytm-surface-hover transition-colors">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-ytm-surface-hover rounded flex items-center justify-center">
                  <svg className="w-6 h-6 text-ytm-text-secondary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-medium text-ytm-text truncate">{video.title}</h3>
                <p className="text-sm text-ytm-text-secondary truncate">{video.artist}</p>
                <p className="text-xs text-ytm-text-secondary">{video.playlist}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePlayNow(video)}
                className="px-3 py-1 text-sm bg-ytm-accent text-ytm-text rounded hover:bg-red-600 transition-colors"
              >
                Play Now
              </button>
              <button
                onClick={() => handleAddToQueue(video)}
                className="px-3 py-1 text-sm bg-ytm-surface-hover text-ytm-text rounded hover:bg-ytm-surface transition-colors"
              >
                Add to Queue
              </button>
            </div>
          </div>
        ))}

        {searchResults.length === 0 && !isSearching && (
          <div className="text-center py-12 text-ytm-text-secondary">
            {activeTab === 'search' ? 'No search results found' : 'No music found in library'}
          </div>
        )}
      </div>
    </div>
  );
};