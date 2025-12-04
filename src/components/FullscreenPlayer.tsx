// components/FullscreenPlayer.tsx - THE ONLY PLAYER - handles all audio/video playback
import React, { useRef, useEffect, useState } from 'react';
import { DJAMMSPlayer } from './DJAMMSPlayer';
import { Video } from '../types';

// Overlay settings type
interface OverlaySettings {
  showNowPlaying: boolean;
  nowPlayingSize: number;
  nowPlayingX: number;
  nowPlayingY: number;
  nowPlayingOpacity: number;
  showComingUp: boolean;
  comingUpSize: number;
  comingUpX: number;
  comingUpY: number;
  comingUpOpacity: number;
  showWatermark: boolean;
  watermarkImage: string;
  watermarkSize: number;
  watermarkX: number;
  watermarkY: number;
  watermarkOpacity: number;
}

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
  seekToPosition?: number | null; // When set, seek to this position (seconds)
  onSeekComplete?: () => void; // Called after seek completes
  overlaySettings?: OverlaySettings; // Player overlay settings
  upcomingVideos?: Video[]; // Upcoming videos for "Coming Up" ticker (priority queue + next from active queue)
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
  fadeDuration,
  seekToPosition,
  onSeekComplete,
  overlaySettings,
  upcomingVideos = []
}) => {
  const playerRef = useRef<any>(null);
  const prevVideoRef = useRef<Video | null>(null);
  const prevIsPlayingRef = useRef<boolean>(false);
  
  // Get the next video from upcoming videos array for "Coming Up" ticker
  const nextVideo = upcomingVideos.length > 0 ? upcomingVideos[0] : null;
  
  // Track window dimensions for responsive video sizing
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Listen for window resize events
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    
    // Also handle fullscreen changes
    const handleFullscreenChange = () => {
      // Small delay to let the browser update dimensions
      setTimeout(handleResize, 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle volume changes from Main Window
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  // Handle seek requests (e.g., debug skip to end)
  useEffect(() => {
    if (seekToPosition !== null && seekToPosition !== undefined && playerRef.current) {
      console.log(`[FullscreenPlayer] Seeking to position: ${seekToPosition}s`);
      playerRef.current.seekTo(seekToPosition);
      if (onSeekComplete) {
        onSeekComplete();
      }
    }
  }, [seekToPosition, onSeekComplete]);

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

  // Calculate progress percentage for the now playing overlay
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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
        width={dimensions.width}
        height={dimensions.height}
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
      
      {/* Now Playing Overlay */}
      {overlaySettings?.showNowPlaying && video && (
        <div style={{
          position: 'absolute',
          left: `${overlaySettings.nowPlayingX}%`,
          top: `${overlaySettings.nowPlayingY}%`,
          transform: `scale(${overlaySettings.nowPlayingSize / 100})`,
          transformOrigin: 'bottom left',
          background: 'linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(20,20,30,0.9) 100%)',
          color: 'white',
          padding: '20px 28px',
          borderRadius: '16px',
          maxWidth: '450px',
          zIndex: 1000,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          opacity: overlaySettings.nowPlayingOpacity / 100
        }}>
          <div style={{ 
            fontSize: '12px', 
            color: '#00bfff', 
            textTransform: 'uppercase', 
            letterSpacing: '2px',
            marginBottom: '8px',
            fontWeight: 600
          }}>
            Now Playing
          </div>
          <div style={{ 
            fontSize: '22px', 
            fontWeight: 'bold', 
            marginBottom: '6px',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            {video.title || 'Unknown Title'}
          </div>
          {video.artist && video.artist !== 'Unknown Artist' && (
            <div style={{ 
              fontSize: '16px', 
              color: '#aaa', 
              marginBottom: '14px' 
            }}>
              {video.artist}
            </div>
          )}
          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: '4px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00bfff, #0080ff)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}
      
      {/* Coming Up Ticker */}
      {overlaySettings?.showComingUp && nextVideo && (
        <div style={{
          position: 'absolute',
          left: `${overlaySettings.comingUpX}%`,
          top: `${overlaySettings.comingUpY}%`,
          transform: `scale(${overlaySettings.comingUpSize / 100})`,
          transformOrigin: 'bottom left',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          opacity: overlaySettings.comingUpOpacity / 100
        }}>
          <span style={{ 
            fontSize: '11px', 
            color: '#ffaa00', 
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 600
          }}>
            Coming Up
          </span>
          <span style={{ 
            fontSize: '14px',
            color: '#ddd'
          }}>
            {nextVideo.title}
            {nextVideo.artist && nextVideo.artist !== 'Unknown Artist' && (
              <span style={{ color: '#888' }}> — {nextVideo.artist}</span>
            )}
          </span>
        </div>
      )}
      
      {/* Watermark/Logo */}
      {overlaySettings?.showWatermark && overlaySettings.watermarkImage && (
        <img
          src={overlaySettings.watermarkImage}
          alt=""
          style={{
            position: 'absolute',
            top: `${overlaySettings.watermarkY}%`,
            left: `${overlaySettings.watermarkX}%`,
            transform: 'translate(-50%, -50%)',
            width: `${overlaySettings.watermarkSize}px`,
            height: 'auto',
            opacity: overlaySettings.watermarkOpacity / 100,
            zIndex: 999,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'
          }}
        />
      )}
    </div>
  );
};