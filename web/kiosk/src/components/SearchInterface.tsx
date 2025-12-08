// SearchInterface.tsx - Main search interface with keyboard and results
// Styled with obie-v5 aesthetic

import { useState, useEffect, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { SearchKeyboard } from './SearchKeyboard';
import { VideoResultCard, VideoGrid } from './VideoResultCard';
import { 
  searchLocalVideos, 
  blockingCommands,
  localVideoToQueueItem 
} from '@shared/supabase-client';
import { cleanVideoTitle } from '@shared/video-utils';
import type { SupabaseLocalVideo, QueueVideoItem } from '@shared/types';

interface SearchInterfaceProps {
  onSongRequested?: (video: QueueVideoItem) => void;
  credits?: number; // For future implementation
  playerId: string; // Required - Player ID to search/queue against
}

export function SearchInterface({ onSongRequested, credits = 999, playerId }: SearchInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SupabaseLocalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SupabaseLocalVideo | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchResults = await searchLocalVideos(searchQuery, playerId, 50);
        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleKeyPress = useCallback((key: string) => {
    setSearchQuery(prev => prev + key);
  }, []);

  const handleBackspace = useCallback(() => {
    setSearchQuery(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setSelectedVideo(null);
  }, []);

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
        setSearchQuery('');
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

  return (
    <div className="flex flex-col h-full">
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

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {results.length > 0 ? (
          <VideoGrid>
            {results.map(video => (
              <VideoResultCard
                key={video.id}
                video={video}
                isSelected={selectedVideo?.id === video.id}
                onClick={() => handleVideoSelect(video)}
              />
            ))}
          </VideoGrid>
        ) : searchQuery.length >= 2 && !isLoading ? (
          <div className="text-center py-12">
            <div className="kiosk-card bg-red-900/80 text-red-200 mb-4">
              <h2 className="text-lg font-bold mb-2">No music database found for this Player</h2>
              <p>Please check the Player ID or try again later.</p>
            </div>
            <p className="text-gray-400 text-lg">No songs found for "{searchQuery}"</p>
            <p className="text-gray-500 text-sm mt-2">Try a different search term</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Search size={64} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Search for your favorite songs</p>
            <p className="text-gray-500 text-sm mt-2">Use the keyboard below to type your search</p>
          </div>
        )}
      </div>

      {/* Keyboard */}
      <div className="border-t border-yellow-400/30 bg-slate-900/80 backdrop-blur-sm">
        <SearchKeyboard
          onKeyPress={handleKeyPress}
          onBackspace={handleBackspace}
          onClear={handleClear}
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
