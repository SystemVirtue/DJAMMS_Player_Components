// components/VideoPlayer.tsx
import React, { forwardRef } from 'react';
import { DJAMMSPlayer, DJAMMSPlayerRef } from './DJAMMSPlayer';
import { Video } from '../types';

interface VideoPlayerProps {
  width?: number;
  height?: number;
  showControls?: boolean;
  showProgress?: boolean;
  showNowPlaying?: boolean;
  autoPlay?: boolean;
  volume?: number;
  showLoadingOverlay?: boolean;
  enableAudioNormalization?: boolean;
  fadeDuration?: number;
  onVideoEnd?: () => void;
  onSkip?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: { currentVideo: Video | null, currentTime: number, duration: number, isPlaying: boolean }) => void;
}

export const VideoPlayer = forwardRef<DJAMMSPlayerRef, VideoPlayerProps>(({
  width = 800,
  height = 600,
  showControls = false,
  showProgress = false,
  showNowPlaying = false,
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
  return (
    <div style={{ flex: 1 }}>
      <DJAMMSPlayer
        ref={ref}
        width={width}
        height={height}
        showControls={showControls}
        showProgress={showProgress}
        showNowPlaying={showNowPlaying}
        autoPlay={autoPlay}
        showLoadingOverlay={showLoadingOverlay}
        volume={volume}
        fadeDuration={fadeDuration}
        onVideoEnd={onVideoEnd}
        onSkip={onSkip}
        onError={onError}
        onStateChange={onStateChange}
        enableAudioNormalization={enableAudioNormalization}
      />
    </div>
  );
});