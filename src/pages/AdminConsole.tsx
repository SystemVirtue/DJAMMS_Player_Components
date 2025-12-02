// src/pages/AdminConsole.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SearchBar, SearchResults, BrowseView } from '../components/Search';
import { Video } from '../types';
import { localSearchService, SearchResult } from '../services';

interface AdminConsoleProps {
  className?: string;
}

interface PlaylistStats {
  name: string;
  videoCount: number;
  totalSize: number;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ className = '' }) => {
  // Data state
  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [playlistsDirectory, setPlaylistsDirectory] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // UI state
  const [activeView, setActiveView] = useState<'overview' | 'browse' | 'search' | 'settings'>('overview');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      if (isElectron) {
        try {
          const { playlists: loadedPlaylists, playlistsDirectory: dir } = 
            await (window as any).electronAPI.getPlaylists();
          setPlaylists(loadedPlaylists || {});
          setPlaylistsDirectory(dir || '');
          localSearchService.indexVideos(loadedPlaylists || {});

          const recent = await (window as any).electronAPI.getRecentSearches();
          setRecentSearches(recent || []);
        } catch (error) {
          console.error('Failed to load data:', error);
        }
      } else {
        // Web fallback
        const webPlaylists = (window as any).__PLAYLISTS__ || {};
        setPlaylists(webPlaylists);
        localSearchService.indexVideos(webPlaylists);
      }
      
      setIsLoading(false);
    };

    loadData();
  }, [isElectron]);

  // Computed stats
  const stats = useMemo(() => {
    const playlistStats: PlaylistStats[] = Object.entries(playlists).map(([name, videos]) => ({
      name,
      videoCount: videos.length,
      totalSize: videos.reduce((sum, v) => sum + (v.size || 0), 0)
    }));

    const totalVideos = playlistStats.reduce((sum, p) => sum + p.videoCount, 0);
    const totalSize = playlistStats.reduce((sum, p) => sum + p.totalSize, 0);

    return {
      playlistCount: playlistStats.length,
      totalVideos,
      totalSize,
      playlistStats
    };
  }, [playlists]);

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const results = localSearchService.search(query, { limit: 100 });
    setSearchResults(results);
    setIsSearching(false);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // Directory selection
  const handleSelectDirectory = useCallback(async () => {
    if (!isElectron) return;

    try {
      const result = await (window as any).electronAPI.selectDirectory();
      if (result.success) {
        setPlaylistsDirectory(result.path);
        // Reload playlists
        const { playlists: newPlaylists } = await (window as any).electronAPI.getPlaylists();
        setPlaylists(newPlaylists || {});
        localSearchService.indexVideos(newPlaylists || {});
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  }, [isElectron]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className={`admin-console h-screen bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading admin console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-console h-screen bg-gray-900 flex flex-col ${className}`}>
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">DJAMMS Admin Console</h1>
            <p className="text-sm text-gray-400 mt-1">
              {playlistsDirectory || 'No playlists directory configured'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSelectDirectory}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              Change Directory
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex gap-1 mt-4">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'browse', label: 'Browse', icon: '📁' },
            { id: 'search', label: 'Search', icon: '🔍' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === item.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeView === 'overview' && (
          <div className="h-full overflow-y-auto p-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">📋</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Playlists</p>
                    <p className="text-3xl font-bold text-white">{stats.playlistCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🎬</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total Videos</p>
                    <p className="text-3xl font-bold text-white">{stats.totalVideos}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">💾</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total Size</p>
                    <p className="text-3xl font-bold text-white">{formatSize(stats.totalSize)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Playlist List */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">Playlists</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {stats.playlistStats.map(playlist => (
                  <div
                    key={playlist.name}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedPlaylist(playlist.name);
                      setActiveView('browse');
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                        <span className="text-xl">🎵</span>
                      </div>
                      <div>
                        <h3 className="font-medium text-white">{playlist.name}</h3>
                        <p className="text-sm text-gray-400">
                          {playlist.videoCount} videos • {formatSize(playlist.totalSize)}
                        </p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'browse' && (
          <BrowseView
            playlists={playlists}
            onPlayVideo={(video) => {
              console.log('Admin: Play video', video);
              // Could open in main player window via IPC
            }}
            onAddToQueue={(video) => {
              console.log('Admin: Add to queue', video);
            }}
            onPlayPlaylist={(name, videos) => {
              console.log('Admin: Play playlist', name, videos.length);
            }}
            className="h-full"
          />
        )}

        {activeView === 'search' && (
          <div className="h-full flex flex-col p-6">
            <div className="max-w-2xl mx-auto w-full mb-6">
              <SearchBar
                onSearch={handleSearch}
                onClear={handleClearSearch}
                placeholder="Search all videos..."
                recentSearches={recentSearches}
                onRecentSearchClick={handleSearch}
                isSearching={isSearching}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto">
                <SearchResults
                  results={searchResults}
                  query={searchQuery}
                  isLoading={isSearching}
                  onPlayVideo={(video) => {
                    console.log('Admin: Play video', video);
                  }}
                  onAddToQueue={(video) => {
                    console.log('Admin: Add to queue', video);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-xl font-semibold text-white mb-6">Settings</h2>
              
              <div className="space-y-6">
                {/* Directory Setting */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="font-medium text-white mb-2">Playlists Directory</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Location where DJAMMS looks for video playlists
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      value={playlistsDirectory}
                      readOnly
                      className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                    >
                      Browse
                    </button>
                  </div>
                </div>

                {/* Recent Searches */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="font-medium text-white mb-2">Recent Searches</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Your recent search history
                  </p>
                  {recentSearches.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
                        >
                          {search}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No recent searches</p>
                  )}
                  {recentSearches.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isElectron) {
                          await (window as any).electronAPI.clearRecentSearches();
                          setRecentSearches([]);
                        }
                      }}
                      className="mt-4 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear search history
                    </button>
                  )}
                </div>

                {/* About */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="font-medium text-white mb-2">About DJAMMS</h3>
                  <p className="text-sm text-gray-400">
                    DJAMMS Player React Component v1.0.0
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    A crossfading video player built with React and Electron
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
