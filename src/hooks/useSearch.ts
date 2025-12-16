/**
 * useSearch Hook
 * Manages search functionality including query, scope, sorting, and results
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Video } from '../types';
import { localSearchService, getSupabaseService } from '../services';
import { logger } from '../utils/logger';

interface UseSearchOptions {
  playlists: Record<string, Video[]>;
  selectedPlaylist: string | null;
  supabaseInitialized: boolean;
  playerId: string;
}

interface UseSearchReturn {
  // State
  searchQuery: string;
  searchScope: string;
  searchSort: string;
  searchResults: Video[];
  searchLoading: boolean;
  searchTotalCount: number;
  searchLimit: number;
  
  // Setters
  setSearchQuery: (query: string) => void;
  setSearchScope: (scope: string) => void;
  setSearchSort: (sort: string) => void;
  setSearchLimit: (limit: number | ((prev: number) => number)) => void;
  
  // Actions
  handleScopeChange: (scope: string) => void;
}

export const useSearch = ({
  playlists,
  selectedPlaylist,
  supabaseInitialized,
  playerId
}: UseSearchOptions): UseSearchReturn => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchSort, setSearchSort] = useState('az');
  const [searchLimit, setSearchLimit] = useState(100);
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  
  // Track if Supabase RPC functions are available (to avoid repeated failed attempts)
  const supabaseRpcAvailableRef = useRef(true);

  // Helper: Filter videos by scope
  const filterByScope = useCallback((videos: Video[], scope: string): Video[] => {
    if (scope === 'all') return videos;
    if (scope === 'karaoke') {
      return videos.filter(v => 
        v.title?.toLowerCase().includes('karaoke') || 
        v.title?.toLowerCase().includes('karoake') ||
        v.playlist?.toLowerCase().includes('karaoke')
      );
    }
    if (scope === 'no-karaoke') {
      return videos.filter(v => 
        !v.title?.toLowerCase().includes('karaoke') && 
        !v.title?.toLowerCase().includes('karoake') &&
        !v.playlist?.toLowerCase().includes('karaoke')
      );
    }
    return videos;
  }, []);

  // Helper: Sort results
  const sortResults = useCallback((results: Video[], sort: string): Video[] => {
    const sorted = [...results];
    switch (sort) {
      case 'az':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'za':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      case 'artist':
        return sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      case 'playlist':
        return sorted.sort((a, b) => (a.playlist || '').localeCompare(b.playlist || ''));
      default:
        return sorted;
    }
  }, []);

  // Handle scope change
  const handleScopeChange = useCallback((scope: string) => {
    setSearchScope(scope);
  }, []);

  // Perform search
  useEffect(() => {
    const performSearch = async () => {
      setSearchLoading(true);
      
      try {
        // If searching in a specific playlist
        if (searchScope === 'playlist' && selectedPlaylist) {
          const playlistVideos = playlists[selectedPlaylist] || [];
          let results = playlistVideos;
          
          if (searchQuery.trim()) {
            results = playlistVideos.filter(video =>
              video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
            );
          }
          
          setSearchResults(sortResults(results, searchSort));
          setSearchTotalCount(results.length);
        }
        // Local search (fallback or when Supabase not available)
        else if (!supabaseInitialized || searchScope !== 'all') {
          const allVideos = Object.values(playlists).flat();
          let results = filterByScope(allVideos, searchScope);
          
          if (searchQuery.trim()) {
            results = results.filter(video =>
              video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
            );
          }
          
          setSearchResults(sortResults(results, searchSort));
          setSearchTotalCount(results.length);
        }
        // Supabase search (preferred when available, but skip if RPC functions are known to be broken)
        else {
          const supabase = getSupabaseService();
          // Skip Supabase RPC if we've detected it's not available (to avoid repeated errors)
          if (supabase.initialized && supabaseRpcAvailableRef.current) {
            try {
              const dbSortBy = searchSort === 'az' ? 'title' : searchSort;
              
              let results: Video[] = [];
              if (searchQuery.trim()) {
                // User has entered a search query - perform search
                results = await supabase.searchVideos(searchQuery, searchScope, searchLimit, 0);
              } else {
                // No search query - browse all videos (browse mode)
                results = await supabase.browseVideos(searchScope, dbSortBy, 'asc', searchLimit, 0);
              }
              
              // If Supabase browse/search returned empty and we have playlists, fall back to local
              if (results.length === 0 && Object.keys(playlists).length > 0) {
                throw new Error('Supabase returned no results');
              }
              
              setSearchResults(results);
              
              // Get total count for pagination
              if (searchQuery.trim()) {
                // For search queries, we'd need a count endpoint
                // For now, use results length as estimate
                setSearchTotalCount(results.length);
              } else {
                // Browse mode - get accurate count
                const count = await supabase.countVideos(searchScope);
                setSearchTotalCount(count > 0 ? count : results.length);
              }
            } catch (error: any) {
              // Check if this is a schema/function error (RPC not available or broken)
              const errorMessage = error?.message || '';
              const errorCode = error?.code || '';
              
              // Detect schema/function errors that indicate RPC functions are broken
              if (errorCode === '42703' || // column does not exist
                  errorCode === 'PGRST203' || // function overloading issue
                  errorMessage.includes('column') && errorMessage.includes('does not exist') ||
                  errorMessage.includes('Could not choose the best candidate function')) {
                // Mark RPC as unavailable to skip future attempts
                supabaseRpcAvailableRef.current = false;
                logger.debug('[useSearch] Supabase RPC functions unavailable, will use local search only');
              } else {
                // Other errors - log but don't disable RPC permanently
                logger.debug('[useSearch] Supabase browse/search failed, using local search fallback');
              }
              
              // Fall back to local search
              const allVideos = Object.values(playlists).flat();
              let results = filterByScope(allVideos, searchScope);
              
              if (searchQuery.trim()) {
                results = results.filter(video =>
                  video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
                );
              }
              
              setSearchResults(sortResults(results, searchSort));
              setSearchTotalCount(results.length);
            }
          } else {
            // Supabase not initialized or RPC unavailable - use local search
            const allVideos = Object.values(playlists).flat();
            let results = filterByScope(allVideos, searchScope);
            
            if (searchQuery.trim()) {
              results = results.filter(video =>
                video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                video.artist?.toLowerCase().includes(searchQuery.toLowerCase())
              );
            }
            
            setSearchResults(sortResults(results, searchSort));
            setSearchTotalCount(results.length);
          }
        }
      } catch (error) {
        logger.error('[useSearch] Search error:', error);
        setSearchResults([]);
        setSearchTotalCount(0);
      } finally {
        setSearchLoading(false);
      }
    };

    // Debounce search (but always perform it, even with empty query for browse mode)
    const timeoutId = setTimeout(performSearch, searchQuery.trim() ? 300 : 0); // No debounce for browse mode
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchScope, searchSort, searchLimit, selectedPlaylist, playlists, supabaseInitialized, filterByScope, sortResults]);

  return {
    searchQuery,
    searchScope,
    searchSort,
    searchResults,
    searchLoading,
    searchTotalCount,
    searchLimit,
    setSearchQuery,
    setSearchScope,
    setSearchSort,
    setSearchLimit,
    handleScopeChange
  };
};

