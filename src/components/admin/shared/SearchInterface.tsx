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
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  const handleAddToPriorityQueue = async (video: Video) => {
    await onCommand('queue_add_priority', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  return (
    <div className="search-interface bg-white rounded-lg shadow p-6">
      <div className="search-header mb-6">
        <div className="flex space-x-1 mb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-t ${activeTab === 'browse' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Browse All
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-t ${activeTab === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search music..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="search-results">
        {activeTab === 'browse' && (
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Music Library</h3>
            <p className="text-sm text-gray-600">Browse your complete music collection</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchResults.map(video => (
            <div key={video.id} className="video-result-card">
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="font-medium text-gray-900 mb-1">{video.title}</div>
                <div className="text-sm text-gray-600 mb-3">{video.artist}</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleAddToQueue(video)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    Add to Queue
                  </button>
                  <button
                    onClick={() => handleAddToPriorityQueue(video)}
                    className="px-3 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors"
                  >
                    Priority
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {searchResults.length === 0 && !isSearching && (
          <div className="text-center py-12 text-gray-500">
            {activeTab === 'search' ? 'No search results found' : 'No music found in library'}
          </div>
        )}
      </div>
    </div>
  );
};

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
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  const handleAddToPriorityQueue = async (video: Video) => {
    await onCommand('queue_add_priority', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  return (
    <div className="search-interface bg-white rounded-lg shadow p-6">
      <div className="search-header mb-6">
        <div className="flex space-x-1 mb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-t ${activeTab === 'browse' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Browse All
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-t ${activeTab === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search music..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="search-results">
        {activeTab === 'browse' && (
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Music Library</h3>
            <p className="text-sm text-gray-600">Browse your complete music collection</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchResults.map(video => (
            <div key={video.id} className="video-result-card">
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="font-medium text-gray-900 mb-1">{video.title}</div>
                <div className="text-sm text-gray-600 mb-3">{video.artist}</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleAddToQueue(video)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    Add to Queue
                  </button>
                  <button
                    onClick={() => handleAddToPriorityQueue(video)}
                    className="px-3 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors"
                  >
                    Priority
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {searchResults.length === 0 && !isSearching && (
          <div className="text-center py-12 text-gray-500">
            {activeTab === 'search' ? 'No search results found' : 'No music found in library'}
          </div>
        )}
      </div>
    </div>
  );
};

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
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  const handleAddToPriorityQueue = async (video: Video) => {
    await onCommand('queue_add_priority', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        path: video.src || video.path,
        duration: video.duration
      }
    });
  };

  return (
    <div className="search-interface bg-white rounded-lg shadow p-6">
      <div className="search-header mb-6">
        <div className="flex space-x-1 mb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-t ${activeTab === 'browse' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Browse All
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-t ${activeTab === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search music..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="search-results">
        {activeTab === 'browse' && (
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Music Library</h3>
            <p className="text-sm text-gray-600">Browse your complete music collection</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {searchResults.map(video => (
            <div key={video.id} className="video-result-card">
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="font-medium text-gray-900 mb-1">{video.title}</div>
                <div className="text-sm text-gray-600 mb-3">{video.artist}</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleAddToQueue(video)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    Add to Queue
                  </button>
                  <button
                    onClick={() => handleAddToPriorityQueue(video)}
                    className="px-3 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors"
                  >
                    Priority
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {searchResults.length === 0 && !isSearching && (
          <div className="text-center py-12 text-gray-500">
            {activeTab === 'search' ? 'No search results found' : 'No music found in library'}
          </div>
        )}
      </div>
    </div>
  );
};
