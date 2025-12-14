/**
 * ModernKiosk.tsx - Main modern kiosk component
 * Streaming-app inspired layout (Spotify/TouchTunes hybrid)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { QueueVideoItem, SupabaseLocalVideo } from '@shared/types';
import { getAllLocalVideos, localVideoToQueueItem } from '@shared/supabase-client';
import { ModernKioskHeader } from './ModernKioskHeader';
import { ModernKioskTabs, type TabId } from './ModernKioskTabs';
import { ModernKioskFooter } from './ModernKioskFooter';
import { ModernHomeView } from './ModernHomeView';
import { ModernSearchView } from './ModernSearchView';
import { ModernGenresView } from './ModernGenresView';
import { ModernChartsView } from './ModernChartsView';
import { ModernQueueView } from './ModernQueueView';
import './ModernKiosk.css';

interface ModernKioskProps {
  nowPlaying: QueueVideoItem | null;
  activeQueue: QueueVideoItem[];
  playerId: string;
  thumbnailsPath: string;
  onSongQueued: (video: QueueVideoItem) => void;
  onVolumeChange?: (volume: number) => void;
}

export const ModernKiosk: React.FC<ModernKioskProps> = ({
  nowPlaying,
  activeQueue,
  playerId,
  thumbnailsPath,
  onSongQueued,
  onVolumeChange
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [volume, setVolume] = useState(75);
  const [allVideos, setAllVideos] = useState<SupabaseLocalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load all videos
  useEffect(() => {
    const loadVideos = async () => {
      if (!playerId) return;
      setIsLoading(true);
      try {
        const videos = await getAllLocalVideos(playerId, null);
        setAllVideos(videos);
      } catch (error) {
        console.error('[ModernKiosk] Error loading videos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadVideos();
  }, [playerId]);
  
  // Get upcoming queue (excluding now playing)
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
  
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (onVolumeChange) {
      onVolumeChange(newVolume);
    }
  }, [onVolumeChange]);
  
  const handleBack = useCallback(() => {
    if (activeTab !== 'home') {
      setActiveTab('home');
    }
  }, [activeTab]);
  
  const handleHome = useCallback(() => {
    setActiveTab('home');
  }, []);
  
  const handleGenreSelect = useCallback((genre: string) => {
    // For now, just switch to search with genre filter
    // In future, could filter videos by genre
    setActiveTab('search');
  }, []);
  
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="modern-kiosk-loading">
          <div className="modern-kiosk-loading-spinner" />
          <p>Loading music library...</p>
        </div>
      );
    }
    
    switch (activeTab) {
      case 'home':
        return (
          <ModernHomeView
            videos={allVideos}
            thumbnailsPath={thumbnailsPath}
            onQueue={handleQueue}
          />
        );
      case 'search':
        return (
          <ModernSearchView
            playerId={playerId}
            thumbnailsPath={thumbnailsPath}
            onQueue={handleQueue}
          />
        );
      case 'genres':
        return (
          <ModernGenresView
            videos={allVideos}
            onGenreSelect={handleGenreSelect}
          />
        );
      case 'charts':
        return (
          <ModernChartsView
            videos={allVideos}
            thumbnailsPath={thumbnailsPath}
            onQueue={handleQueue}
          />
        );
      case 'queue':
        return (
          <ModernQueueView
            queue={activeQueue}
            thumbnailsPath={thumbnailsPath}
          />
        );
      default:
        return null;
    }
  };
  
  return (
    <div className="modern-kiosk">
      <ModernKioskHeader
        nowPlaying={nowPlaying}
        upcomingQueue={upcomingQueue}
        thumbnailsPath={thumbnailsPath}
        isFreePlay={true}
      />
      
      <ModernKioskTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className="modern-kiosk-content">
        {renderContent()}
      </div>
      
      <ModernKioskFooter
        onBack={handleBack}
        onHome={handleHome}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        onHelp={() => {}}
      />
    </div>
  );
};




