// components/FullscreenPlayer.tsx - BROWSER COMPATIBLE VERSION
import React, { useRef, useEffect, useCallback } from 'react';
import { DJAMMSPlayer } from './DJAMMSPlayer';
import { Video } from '../types';

interface FullscreenPlayerProps {
  video: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onVideoEnd: () => void;
  onStateChange: (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => void;
  enableAudioNormalization: boolean;
  preloadVideo?: Video | null;
  fadeDuration?: number;
}

export const FullscreenPlayer: React.FC<FullscreenPlayerProps> = ({
  video,
  isPlaying,
  currentTime,
  duration,
  volume,
  onVideoEnd,
  onStateChange,
  enableAudioNormalization,
  preloadVideo,
  fadeDuration
}) => {
  const playerRef = useRef<any>(null);
  const prevVideoRef = useRef<Video | null>(null);
  const prevIsPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    // Handle video playback changes
    if (video && playerRef.current) {
      const videoChanged = prevVideoRef.current?.id !== video.id;
      const wasPaused = !prevIsPlayingRef.current && isPlaying;

      if (isPlaying) {
        if (videoChanged) {
          // New video - start playing from beginning
          playerRef.current.playVideo(video);
        } else if (wasPaused) {
          // Same video, was paused, now resuming - resume playback
          const activeVideo = playerRef.current.getActiveVideo();
          if (activeVideo) {
            activeVideo.play().catch((error: any) => {
              console.error('Resume failed:', error);
            });
          }
        }
      } else {
        // Pause
        playerRef.current.pauseVideo();
      }
    }

    // Update refs for next comparison
    prevVideoRef.current = video;
    prevIsPlayingRef.current = isPlaying;
  }, [video, isPlaying]);

  // If parent requests a preload of the next video, load it into the inactive element
  useEffect(() => {
    if (preloadVideo && playerRef.current && preloadVideo !== video) {
      try {
        playerRef.current.preloadVideo(preloadVideo);
      } catch (error) {
        console.warn('FullscreenPlayer preload failed', error);
      }
    }
  }, [preloadVideo, playerRef, video]);

  const handleStateChange = (state: any) => {
    onStateChange({
      currentVideo: video,
      currentTime: state.currentTime || 0,
      duration: state.duration || 0,
      isPlaying: state.isPlaying || false
    });
  };

  if (!video) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '24px',
        cursor: 'none'
      }}>
        No video selected
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      position: 'relative',
      cursor: 'none',
      pointerEvents: 'none'
    }}>
      <DJAMMSPlayer
        ref={playerRef}
        width={window.innerWidth}
        height={window.innerHeight}
        showControls={false}
        showProgress={false}
        showNowPlaying={false}
        showLoadingOverlay={false}
        autoPlay={true}
        volume={volume}
        fadeDuration={fadeDuration}
        onVideoEnd={onVideoEnd}
        onStateChange={handleStateChange}
        enableAudioNormalization={enableAudioNormalization}
      />
    </div>
  );
};