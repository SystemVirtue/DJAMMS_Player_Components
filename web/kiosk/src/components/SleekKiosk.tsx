/**
 * SleekKiosk.tsx - Main sleek kiosk component matching wireframe design
 * Modern, intuitive interface with header, nav, grid, and keyboard
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { QueueVideoItem, SupabaseLocalVideo } from '@shared/types';
import { getAllLocalVideos, searchLocalVideos, localVideoToQueueItem } from '@shared/supabase-client';
import { SleekKioskHeader } from './SleekKioskHeader';
import { SleekKioskNav, type NavMode } from './SleekKioskNav';
import { SleekKioskGrid } from './SleekKioskGrid';
import { SleekKioskKeyboard } from './SleekKioskKeyboard';
import { SearchKeyboardModal } from './SearchKeyboardModal';
import './SleekKiosk.css';

interface SleekKioskProps {
  nowPlaying: QueueVideoItem | null;
  activeQueue: QueueVideoItem[];
  playerId: string;
  thumbnailsPath: string;
  onSongQueued: (video: QueueVideoItem) => void;
  venueName?: string;
}

export const SleekKiosk: React.FC<SleekKioskProps> = ({
  nowPlaying,
  activeQueue,
  playerId,
  thumbnailsPath,
  onSongQueued,
  venueName
}) => {
  const [navMode, setNavMode] = useState<NavMode>('browse-songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [allVideos, setAllVideos] = useState<SupabaseLocalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  
  // Load videos based on mode
  useEffect(() => {
    const loadVideos = async () => {
      if (!playerId) return;
      setIsLoading(true);
      try {
        let videos: SupabaseLocalVideo[] = [];
        
        if (navMode === 'search' && searchQuery.trim()) {
          videos = await searchLocalVideos(searchQuery, playerId, 200);
        } else {
          videos = await getAllLocalVideos(playerId, null);
        }
        
        setAllVideos(videos);
      } catch (error) {
        console.error('[SleekKiosk] Error loading videos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadVideos();
  }, [playerId, navMode, searchQuery]);
  
  // Filter videos based on mode
  const filteredVideos = useMemo(() => {
    let videos = [...allVideos];
    
    if (navMode === 'browse-artists' && activeLetter) {
      videos = videos.filter(v => 
        v.artist?.toUpperCase().startsWith(activeLetter)
      );
    } else if (navMode === 'browse-songs' && activeLetter) {
      videos = videos.filter(v => 
        v.title?.toUpperCase().startsWith(activeLetter)
      );
    }
    
    // Sort by title for songs, artist for artists
    if (navMode === 'browse-artists') {
      videos.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else {
      videos.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    
    return videos;
  }, [allVideos, navMode, activeLetter]);
  
  // Get upcoming queue
  const upcomingQueue = useMemo(() => {
    if (!nowPlaying) return activeQueue;
    const nowPlayingIndex = activeQueue.findIndex(item => item.id === nowPlaying.id);
    if (nowPlayingIndex === -1) return activeQueue;
    return activeQueue.slice(nowPlayingIndex + 1);
  }, [activeQueue, nowPlaying]);
  
  const handleQueue = useCallback((video: SupabaseLocalVideo) => {
    const queueItem = localVideoToQueueItem(video);
    onSongQueued(queueItem);
  }, [onSongQueued]);
  
  const handleKeyPress = useCallback((key: string) => {
    if (navMode === 'search') {
      setSearchQuery(prev => prev + key);
      setShowKeyboard(true);
    } else {
      setActiveLetter(key.toUpperCase());
    }
  }, [navMode]);
  
  const handleBackspace = useCallback(() => {
    if (navMode === 'search') {
      setSearchQuery(prev => prev.slice(0, -1));
    } else {
      setActiveLetter(null);
    }
  }, [navMode]);
  
  const handleClear = useCallback(() => {
    if (navMode === 'search') {
      setSearchQuery('');
    } else {
      setActiveLetter(null);
    }
  }, [navMode]);
  
  const handleModeChange = useCallback((mode: NavMode) => {
    setNavMode(mode);
    setSearchQuery('');
    setActiveLetter(null);
    if (mode === 'search') {
      setShowKeyboard(true);
    }
  }, []);
  
  const handleBack = useCallback(() => {
    if (navMode !== 'browse-songs') {
      setNavMode('browse-songs');
      setSearchQuery('');
      setActiveLetter(null);
    }
  }, [navMode]);
  
  return (
    <div className="sleek-kiosk">
      <SleekKioskHeader
        venueName={venueName}
        nowPlaying={nowPlaying}
        upcomingQueue={upcomingQueue}
        thumbnailsPath={thumbnailsPath}
        isFreePlay={true}
      />
      
      <SleekKioskNav
        activeMode={navMode}
        onModeChange={handleModeChange}
        onBack={handleBack}
      />
      
      <div className="sleek-kiosk-content">
        {isLoading ? (
          <div className="sleek-kiosk-loading">
            <div className="sleek-kiosk-loading-spinner" />
            <p>Loading music library...</p>
          </div>
        ) : (
          <SleekKioskGrid
            videos={filteredVideos}
            thumbnailsPath={thumbnailsPath}
            onQueue={handleQueue}
          />
        )}
      </div>
      
      <SleekKioskKeyboard
        onKeyPress={handleKeyPress}
        onBackspace={handleBackspace}
        onClear={handleClear}
        showNumbers={navMode === 'search'}
      />
      
      {/* Modal keyboard for search mode */}
      {navMode === 'search' && showKeyboard && (
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

