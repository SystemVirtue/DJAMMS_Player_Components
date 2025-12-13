// VideoBackground.tsx - Video background with ping-pong playback
// Plays video forward, then reverse, then forward again at 80% speed

import { useEffect, useRef } from 'react';

interface VideoBackgroundProps {
  src: string;
  playbackRate?: number; // Default 0.8 (80% speed)
}

export function VideoBackground({ 
  src, 
  playbackRate = 0.8 
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingForwardRef = useRef<boolean>(true);
  const isReversingRef = useRef<boolean>(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set playback rate for forward playback
    video.playbackRate = playbackRate;
    isPlayingForwardRef.current = true;
    isReversingRef.current = false;

    // Handle ping-pong playback
    const handleTimeUpdate = () => {
      if (!video || isReversingRef.current) return;

      const currentTime = video.currentTime;
      const duration = video.duration;

      if (isPlayingForwardRef.current && currentTime >= duration - 0.1) {
        // Reached end - switch to reverse
        isPlayingForwardRef.current = false;
        isReversingRef.current = true;
        video.pause();
        startReversePlayback();
      }
    };

    const startReversePlayback = () => {
      if (!video) return;
      
      const duration = video.duration;
      let currentTime = duration;
      const reverseSpeed = playbackRate; // Same speed for reverse
      const frameTime = 1 / 60; // Assume 60fps for smooth playback
      const timeStep = frameTime * reverseSpeed;

      const reverseLoop = () => {
        if (!video) return;

        currentTime -= timeStep;
        
        if (currentTime <= 0) {
          // Reached start - switch to forward
          currentTime = 0;
          video.currentTime = 0;
          isPlayingForwardRef.current = true;
          isReversingRef.current = false;
          video.playbackRate = playbackRate;
          video.play().catch(console.error);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          return;
        }

        video.currentTime = currentTime;
        animationFrameRef.current = requestAnimationFrame(reverseLoop);
      };

      // Start reverse playback
      animationFrameRef.current = requestAnimationFrame(reverseLoop);
    };

    // Start playing forward
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.play().catch(console.error);

    // Cleanup
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [src, playbackRate]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        muted
        playsInline
        loop={false} // We handle looping manually with ping-pong
        onError={(e) => {
          console.error('[VideoBackground] Video failed to load:', src, e);
        }}
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (video) {
            console.log('[VideoBackground] Video loaded:', {
              duration: video.duration,
              playbackRate: video.playbackRate
            });
          }
        }}
      />
    </div>
  );
}
