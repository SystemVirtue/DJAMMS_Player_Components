// src/hooks/usePlaylistManagement.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Video } from '../types';
import { localSearchService } from '../services';
import { getSupabaseService } from '../services';
import { logger } from '../utils/logger';

interface UsePlaylistManagementOptions {
  isElectron: boolean;
  playerId: string;
  playerIdInitialized: boolean;
  supabaseInitialized: boolean;
  onProgress?: (current: number, total: number) => void;
}

export const usePlaylistManagement = (options: UsePlaylistManagementOptions) => {
  const { isElectron, playerId, playerIdInitialized, supabaseInitialized, onProgress } = options;

  const [playlists, setPlaylists] = useState<Record<string, Video[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string>('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });

  const hasIndexedRef = useRef(false);
  const lastIndexedPlayerIdRef = useRef<string | null>(null);
  const indexingCompleteRef = useRef(false);

  // Initialize indexingCompleteRef based on whether Supabase is available
  useEffect(() => {
    if (!supabaseInitialized) {
      indexingCompleteRef.current = true;
    }
  }, [supabaseInitialized]);

  // Helper to wait for indexing to complete
  const waitForIndexingComplete = useCallback(async (maxWaitMs: number = 30000): Promise<boolean> => {
    const startTime = Date.now();
    while (!indexingCompleteRef.current && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return indexingCompleteRef.current;
  }, []);

  // Helper to find default playlist
  const findDefaultPlaylist = useCallback((playlists: Record<string, Video[]>): string | null => {
    const playlistNames = Object.keys(playlists);
    const defaultPlaylist = playlistNames.find(name => 
      name.includes('DJAMMS_Default') || name.toLowerCase().includes('djamms default')
    );
    return defaultPlaylist || playlistNames[0] || null;
  }, []);

  // Load playlists on mount
  useEffect(() => {
    if (hasIndexedRef.current) return;

    const loadData = async () => {
      if (isElectron) {
        try {
          hasIndexedRef.current = true;
          const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
          setPlaylists(loadedPlaylists || {});
          localSearchService.indexVideos(loadedPlaylists || {});

          // Check for default playlist name and prompt to change if found
          if (loadedPlaylists) {
            const defaultPlaylistKey = Object.keys(loadedPlaylists).find(name => 
              name.includes('DJAMMS_Default') || name.toLowerCase().includes('djamms default')
            );
            if (defaultPlaylistKey) {
              const hasBeenPrompted = await (window as any).electronAPI.getSetting('defaultPlaylistPromptShown');
              if (!hasBeenPrompted) {
                // Return this info to parent component for handling
                // Parent will show alert and switch tabs
              }
            }
          }
        } catch (error) {
          console.error('[usePlaylistManagement] Failed to load playlists:', error);
          hasIndexedRef.current = false;
        }
      } else {
        hasIndexedRef.current = true;
        const webPlaylists = (window as any).__PLAYLISTS__ || {};
        setPlaylists(webPlaylists);
        localSearchService.indexVideos(webPlaylists);
      }
    };

    loadData();
  }, [isElectron]);

  // Sync music database to Supabase when initialized
  useEffect(() => {
    if (supabaseInitialized && Object.keys(playlists).length > 0) {
      logger.info('[usePlaylistManagement] Supabase initialized - syncing music database');
      setIsProcessing(true);
      setProcessingProgress({ current: 0, total: 0 });
      indexingCompleteRef.current = false;
      getSupabaseService().indexLocalVideos(
        playlists,
        (current, total) => {
          setProcessingProgress({ current, total });
          if (onProgress) onProgress(current, total);
        }
      ).finally(() => {
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
        indexingCompleteRef.current = true;
        logger.info('[usePlaylistManagement] Playlist indexing complete');
      });
    }
  }, [supabaseInitialized, playlists, onProgress]);

  // Re-index after Player ID validation
  useEffect(() => {
    const shouldSync = isElectron && playerIdInitialized && playerId && playerId.trim() !== '';
    if (!shouldSync) return;

    if (lastIndexedPlayerIdRef.current === playerId) return;
    lastIndexedPlayerIdRef.current = playerId;

    const reloadAndSync = async () => {
      try {
        const { playlists: loadedPlaylists } = await (window as any).electronAPI.getPlaylists();
        setPlaylists(loadedPlaylists || {});
        localSearchService.indexVideos(loadedPlaylists || {});

        if (supabaseInitialized && loadedPlaylists) {
          logger.info('[usePlaylistManagement] Player ID validated - syncing playlists/search to Supabase');
          setIsProcessing(true);
          setProcessingProgress({ current: 0, total: 0 });
          indexingCompleteRef.current = false;
          getSupabaseService().indexLocalVideos(
            loadedPlaylists,
            (current, total) => {
              setProcessingProgress({ current, total });
              if (onProgress) onProgress(current, total);
            }
          ).finally(() => {
            setIsProcessing(false);
            setProcessingProgress({ current: 0, total: 0 });
            indexingCompleteRef.current = true;
          });
        } else {
          indexingCompleteRef.current = true;
        }
      } catch (error) {
        console.error('[usePlaylistManagement] Failed to reload playlists after Player ID validation:', error);
      }
    };

    reloadAndSync();
  }, [isElectron, playerIdInitialized, playerId, supabaseInitialized, onProgress]);

  // Refresh playlists
  const refreshPlaylists = useCallback(async (forceIndex: boolean = false) => {
    if (!isElectron) return;

    try {
      const { playlists: newPlaylists } = await (window as any).electronAPI.getPlaylists();
      setPlaylists(newPlaylists || {});
      localSearchService.indexVideos(newPlaylists || {});

      if (supabaseInitialized) {
        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: 0 });
        indexingCompleteRef.current = false;
        await getSupabaseService().indexLocalVideos(
          newPlaylists || {},
          (current, total) => {
            setProcessingProgress({ current, total });
            if (onProgress) onProgress(current, total);
          },
          forceIndex
        );
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
        indexingCompleteRef.current = true;
      }
    } catch (error) {
      console.error('[usePlaylistManagement] Failed to refresh playlists:', error);
      setIsProcessing(false);
    }
  }, [isElectron, supabaseInitialized, onProgress]);

  // Listen for playlist directory changes
  useEffect(() => {
    if (!isElectron) return;

    const api = (window as any).electronAPI;
    const unsubscribe = api.onPlaylistsDirectoryChanged?.(async (newPath: string) => {
      logger.info('[usePlaylistManagement] Playlists directory changed to:', newPath);
      const { playlists: newPlaylists } = await api.getPlaylists();
      setPlaylists(newPlaylists || {});
      localSearchService.indexVideos(newPlaylists || {});

      if (supabaseInitialized) {
        setIsProcessing(true);
        setProcessingProgress({ current: 0, total: 0 });
        await getSupabaseService().indexLocalVideos(
          newPlaylists || {},
          (current, total) => {
            setProcessingProgress({ current, total });
            if (onProgress) onProgress(current, total);
          }
        );
        setIsProcessing(false);
        setProcessingProgress({ current: 0, total: 0 });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isElectron, supabaseInitialized, onProgress]);

  return {
    playlists,
    activePlaylist,
    selectedPlaylist,
    isProcessing,
    processingProgress,
    indexingCompleteRef,
    setPlaylists,
    setActivePlaylist,
    setSelectedPlaylist,
    refreshPlaylists,
    waitForIndexingComplete,
    findDefaultPlaylist
  };
};

