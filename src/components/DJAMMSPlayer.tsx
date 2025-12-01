// components/DJAMMSPlayer.tsx
import React, { useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { VideoElement } from './VideoElement';
import { NowPlayingOverlay } from './NowPlayingOverlay';
import { LoadingScreen } from './LoadingScreen';
import { ErrorOverlay } from './ErrorOverlay';
import { ProgressBar } from './ProgressBar';
import { useVideoPlayer } from '../hooks/useVideoPlayer';
import { useSkip } from '../hooks/useSkip';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { Video } from '../types';

interface DJAMMSPlayerProps {
  width?: number;
  height?: number;
  className?: string;
  showControls?: boolean;
  showProgress?: boolean;
  showNowPlaying?: boolean;
  autoPlay?: boolean;
  volume?: number;
  showLoadingOverlay?: boolean;
  enableAudioNormalization?: boolean;
  /** Fade duration in seconds (used for skip/crossfade) */
  fadeDuration?: number;
  onVideoEnd?: () => void;
  onSkip?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => void;
}

export interface DJAMMSPlayerRef {
  playVideo: (video: Video) => void;
  pauseVideo: () => void;
  resumeVideo: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  seekTo: (time: number) => void;
  getActiveVideo: () => HTMLVideoElement | null;
  preloadVideo: (video: Video) => void;
}

export const DJAMMSPlayer = forwardRef<DJAMMSPlayerRef, DJAMMSPlayerProps>(({
  width = 800,
  height = 600,
  className = '',
  showControls = true,
  showProgress = true,
  showNowPlaying = true,
  autoPlay = false,
  volume = 0.7,
  showLoadingOverlay = false,
  enableAudioNormalization = false,
  fadeDuration = 2.0,
  onVideoEnd,
  onSkip,
  onError,
  onStateChange
}, ref) => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  const {
    currentVideo,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    volume: playerVolume,
    isMuted,
    activeVideoElement,
    playVideo,
    pauseVideo,
    resumeVideo,
    preloadVideo,
    setVolume,
    toggleMute,
    seekTo,
    retry
  } = useVideoPlayer({
    videoRefs: [videoRef1, videoRef2],
    initialVolume: volume,
    onVideoEnd,
    onError,
    enableAudioNormalization,
    fadeDuration
  });

  useEffect(() => {
    onStateChange?.({ currentVideo, currentTime, duration, isPlaying });
  }, [currentVideo, currentTime, duration, isPlaying, onStateChange]);

  // Build a VideoRefs-like object for useSkip. We derive active/inactive from
  // the activeVideoElement returned by the hook so skip targets the correct element.
  const activeRefObj = { current: activeVideoElement } as React.RefObject<HTMLVideoElement>;
  const inactiveElem = activeVideoElement === videoRef1.current ? videoRef2.current : videoRef1.current;
  const inactiveRefObj = { current: inactiveElem } as React.RefObject<HTMLVideoElement>;

  const videoRefsForSkip = {
    videoA: videoRef1,
    videoB: videoRef2,
    activeVideo: activeRefObj,
    inactiveVideo: inactiveRefObj
  };

  const { skip } = useSkip({
    videoRefs: videoRefsForSkip,
    isPlaying,
    onSkip,
    fadeDurationMs: (fadeDuration ? Math.round(fadeDuration * 1000) : undefined)
  });

  const handleKeyboardAction = useCallback((action: string) => {
    switch (action) {
      case 'skip':
        skip();
        break;
      case 'playPause':
        if (isPlaying) {
          pauseVideo();
        } else {
          resumeVideo();
        }
        break;
      case 'volumeUp':
        setVolume(Math.min(1, playerVolume + 0.1));
        break;
      case 'volumeDown':
        setVolume(Math.max(0, playerVolume - 0.1));
        break;
      case 'mute':
        toggleMute();
        break;
      default:
        break;
    }
  }, [skip, isPlaying, pauseVideo, resumeVideo, setVolume, playerVolume, toggleMute]);

  useKeyboardControls({
    onAction: handleKeyboardAction,
    enabled: showControls
  });

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    playVideo,
    pauseVideo,
    resumeVideo,
    setVolume,
    toggleMute,
    seekTo,
    getActiveVideo: () => activeVideoElement,
    preloadVideo
  }), [playVideo, pauseVideo, resumeVideo, setVolume, toggleMute, seekTo, activeVideoElement, preloadVideo]);

  const handleProgressSeek = useCallback((time: number) => {
    seekTo(time);
  }, [seekTo]);

  const handleRetry = useCallback(() => {
    retry();
  }, [retry]);

  return (
    <div
      className={`djamms-player ${className}`}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        background: '#000',
        overflow: 'hidden',
        cursor: 'none',
        pointerEvents: 'none'
      }}
    >
      {/* Video Elements */}
      <VideoElement
        ref={videoRef1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
      <VideoElement
        ref={videoRef2}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />

      {/* Overlays */}
      <LoadingScreen
        visible={isLoading && showLoadingOverlay}
        message="Loading video..."
      />

      <ErrorOverlay
        visible={!!error}
        error={error}
        onRetry={handleRetry}
      />

      {showNowPlaying && currentVideo && (
        <NowPlayingOverlay
          video={currentVideo}
          visible={!isLoading && !error}
          currentTime={currentTime}
          duration={duration}
        />
      )}

      {/* Progress Bar */}
      {showProgress && !isLoading && !error && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            right: '20px',
            zIndex: 100
          }}
        >
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={handleProgressSeek}
          />
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && !isLoading && !error && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '20px',
            right: '20px',
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            zIndex: 100
          }}
        >
          <button
            onClick={() => handleKeyboardAction('playPause')}
            style={{
              padding: '8px 16px',
              background: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>

          <button
            onClick={skip}
            style={{
              padding: '8px 16px',
              background: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ⏭️ Skip
          </button>
        </div>
      )}
    </div>
  );
});