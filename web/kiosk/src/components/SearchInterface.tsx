// SearchInterface.tsx - Main search interface with keyboard and results
// Styled with obie-v5 aesthetic

import { useState, useEffect, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { SearchKeyboard } from './SearchKeyboard';
import { VideoResultCard, VideoGrid } from './VideoResultCard';
import { 
  searchLocalVideos,
  getAllLocalVideos,
  blockingCommands,
  localVideoToQueueItem 
} from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import type { SupabaseLocalVideo, QueueVideoItem } from '@shared/types';

interface SearchInterfaceProps {
  onSongRequested?: (video: QueueVideoItem) => void;
  credits?: number; // For future implementation
  playerId: string; // Required - Player ID to search/queue against
  showHeader?: boolean; // Whether to show search header and filters (default: true)
  searchQuery?: string; // External search query control
  onSearchQueryChange?: (query: string) => void; // External search query handler
  karaokeFilter?: 'show' | 'hide' | 'all'; // External filter control
  onKaraokeFilterChange?: (filter: 'show' | 'hide' | 'all') => void; // External filter handler
  onClose?: () => void; // Close handler for keyboard CLOSE button
}

export function SearchInterface({ 
  onSongRequested, 
  credits = 999, 
  playerId,
  showHeader = true,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  karaokeFilter: externalKaraokeFilter,
  onKaraokeFilterChange,
  onClose
}: SearchInterfaceProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalKaraokeFilter, setInternalKaraokeFilter] = useState<'show' | 'hide' | 'all'>('all');
  
  // Use external state if provided, otherwise use internal state
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchQueryChange || setInternalSearchQuery;
  const karaokeFilter = externalKaraokeFilter !== undefined ? externalKaraokeFilter : internalKaraokeFilter;
  const setKaraokeFilter = onKaraokeFilterChange || setInternalKaraokeFilter;
  
  const [results, setResults] = useState<SupabaseLocalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SupabaseLocalVideo | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // Helper to check if video is karaoke
  const isKaraokeVideo = (video: SupabaseLocalVideo): boolean => {
    const title = video.title?.toLowerCase() || '';
    const path = video.path?.toLowerCase() || '';
    return title.includes('karaoke') || path.includes('karaoke');
  };

  // Filter results based on karaoke filter
  const filteredResults = results.filter(video => {
    if (karaokeFilter === 'all') return true;
    const hasKaraoke = isKaraokeVideo(video);
    if (karaokeFilter === 'show') {
      return hasKaraoke; // Only show karaoke items
    } else {
      return !hasKaraoke; // Hide karaoke items
    }
  });

  // Debounced search - show ALL videos when query is empty (browse mode)
  useEffect(() => {
    if (!playerId) {
      console.warn('[SearchInterface] ⚠️ No playerId provided, skipping search');
      return;
    }

    console.log('[SearchInterface] 🔍 Starting search with playerId:', playerId);

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (searchQuery.trim().length < 2) {
          // Browse mode: show ALL videos from the player's database
          console.log('[SearchInterface] 📚 Browse mode - Loading ALL videos for player:', playerId);
          const allVideos = await getAllLocalVideos(playerId, null, 0);
          console.log('[SearchInterface] ✅ Loaded', allVideos?.length || 0, 'videos');
          if (allVideos.length === 0) {
            console.error('[SearchInterface] ❌ NO VIDEOS FOUND! Check:');
            console.error('  1. Is the Electron Player running?');
            console.error('  2. Has the Electron Player indexed videos? (Check Tools tab)');
            console.error('  3. Does the playerId match? (Kiosk:', playerId, ')');
            console.error('  4. Check Supabase local_videos table for this playerId');
          }
          setResults(allVideos || []);
        } else {
          // Search mode: search for matching videos
          console.log('[SearchInterface] 🔎 Search mode - Searching for:', searchQuery, 'playerId:', playerId);
          const searchResults = await searchLocalVideos(searchQuery, playerId, null);
          console.log('[SearchInterface] ✅ Found', searchResults?.length || 0, 'results');
          setResults(searchResults || []);
        }
      } catch (error) {
        console.error('[SearchInterface] ❌ Search error:', error);
        // Don't clear results on error - keep existing results if available
        // Only set empty if we don't have any results yet
        if (results.length === 0) {
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, searchQuery.trim().length < 2 ? 0 : 300); // Immediate for browse mode, debounced for search

    return () => clearTimeout(timer);
  }, [searchQuery, playerId]);

  const handleKeyPress = useCallback((key: string) => {
    setSearchQuery(prev => prev + key);
  }, []);

  const handleBackspace = useCallback(() => {
    setSearchQuery(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    if (onSearchQueryChange) {
      onSearchQueryChange('');
    } else {
      setInternalSearchQuery('');
    }
    setResults([]);
    setSelectedVideo(null);
  }, [onSearchQueryChange]);

  const handleVideoSelect = useCallback((video: SupabaseLocalVideo) => {
    setSelectedVideo(video);
    setShowConfirm(true);
  }, []);

  const handleConfirmRequest = useCallback(async () => {
    if (!selectedVideo) return;

    setIsRequesting(true);
    try {
      const queueItem = localVideoToQueueItem(selectedVideo);
      
      // Send command to add to priority queue (using blocking command for feedback)
      const result = await blockingCommands.queueAdd(queueItem, 'priority', 'kiosk', playerId);
      
      if (result.success) {
        onSongRequested?.(queueItem);
        // Reset state
        setShowConfirm(false);
        setSelectedVideo(null);
        if (onSearchQueryChange) {
          onSearchQueryChange('');
        } else {
          setInternalSearchQuery('');
        }
        setResults([]);
      } else {
        console.error('Failed to add song to queue:', result.error);
      }
    } catch (error) {
      console.error('Request error:', error);
    } finally {
      setIsRequesting(false);
    }
  }, [selectedVideo, onSongRequested, playerId]);

  const handleCancelRequest = useCallback(() => {
    setShowConfirm(false);
    setSelectedVideo(null);
  }, []);

  const hasCredits = credits > 0;

  // Render search input and filters if showHeader is true
  const renderSearchHeader = () => {
    if (!showHeader) return null;
    
    return (
      <>
        {/* Search Header */}
        <div className="px-6 py-4">
          <div className="kiosk-card">
            <div className="flex items-center gap-4">
              <Search size={24} className="text-yellow-400" />
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  readOnly
                  placeholder="Type to search for songs..."
                  className="w-full bg-transparent text-white text-xl placeholder:text-gray-500 outline-none"
                />
                {searchQuery && (
                  <button 
                    onClick={handleClear}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
              {isLoading && <Loader2 size={24} className="text-yellow-400 animate-spin" />}
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="px-6 py-2">
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setKaraokeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                karaokeFilter === 'all'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
              }`}
            >
              All Songs
            </button>
            <button
              onClick={() => setKaraokeFilter('hide')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                karaokeFilter === 'hide'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
              }`}
            >
              Hide Karaoke
            </button>
            <button
              onClick={() => setKaraokeFilter('show')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                karaokeFilter === 'show'
                  ? 'bg-yellow-400 text-slate-900'
                  : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
              }`}
            >
              Karaoke Only
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {renderSearchHeader()}

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 size={64} className="text-yellow-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Loading songs...</p>
          </div>
        ) : filteredResults.length > 0 ? (
          <>
            <div className="mb-4 text-gray-400 text-sm text-center">
              {searchQuery.trim().length < 2 ? (
                <span>Showing {filteredResults.length} songs from library</span>
              ) : (
                <span>Found {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
              )}
            </div>
            <VideoGrid>
              {filteredResults.map(video => (
                <VideoResultCard
                  key={video.id}
                  video={video}
                  isSelected={selectedVideo?.id === video.id}
                  onClick={() => handleVideoSelect(video)}
                />
              ))}
            </VideoGrid>
          </>
        ) : !isLoading && results.length === 0 ? (
          <div className="text-center py-12">
            {searchQuery.length >= 2 ? (
              <>
                <div className="kiosk-card bg-red-900/80 text-red-200 mb-4">
                  <h2 className="text-lg font-bold mb-2">No songs found</h2>
                  <p>No results match your search query.</p>
                </div>
                <p className="text-gray-400 text-lg">No songs found for "{searchQuery}"</p>
                <p className="text-gray-500 text-sm mt-2">Try a different search term or clear the search to browse all songs</p>
              </>
            ) : (
              <>
                <div className="kiosk-card bg-yellow-900/80 text-yellow-200 mb-4">
                  <h2 className="text-lg font-bold mb-2">No music database found for this Player</h2>
                  <p>Please check the Player ID or ensure the Electron Player is running and has indexed videos.</p>
                </div>
                <p className="text-gray-400 text-lg">No songs available to browse</p>
                <p className="text-gray-500 text-sm mt-2">Make sure the Player ID is correct and the player has indexed its music library</p>
              </>
            )}
          </div>
        ) : !isLoading ? (
          <div className="text-center py-12">
            <Search size={64} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Browse all songs or search for your favorites</p>
            <p className="text-gray-500 text-sm mt-2">Use the keyboard below to search, or browse all songs</p>
          </div>
        ) : null}
      </div>

      {/* Keyboard */}
      <div className="border-t border-yellow-400/30 backdrop-blur-sm">
        <SearchKeyboard
          onKeyPress={handleKeyPress}
          onBackspace={handleBackspace}
          onClear={handleClear}
          onSubmit={onClose}
        />
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="kiosk-card max-w-md w-full mx-4 p-6">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              Request this song?
            </h2>
            <div className="bg-slate-800/60 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-white">
                {cleanVideoTitle(selectedVideo.title)}
              </h3>
              {selectedVideo.artist && (
                <p className="text-gray-400">{selectedVideo.artist}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleCancelRequest}
                className="kiosk-btn flex-1"
                disabled={isRequesting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRequest}
                className="kiosk-btn kiosk-btn-primary flex-1"
                disabled={isRequesting || !hasCredits}
              >
                {isRequesting ? (
                  <Loader2 size={20} className="animate-spin mx-auto" />
                ) : (
                  'Request Song'
                )}
              </button>
            </div>
            {!hasCredits && (
              <p className="text-red-400 text-sm text-center mt-4">
                No credits available. Please add credits to request songs.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
