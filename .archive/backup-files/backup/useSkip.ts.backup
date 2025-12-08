// hooks/useSkip.ts
import { useCallback } from 'react';
import { VideoRefs } from '../types';
import { fadeOut } from '../utils/crossfade';

interface SkipConfig {
  videoRefs: VideoRefs;
  isPlaying: boolean;
  onSkip?: () => void;
  // Duration in milliseconds for the fade-out
  fadeDurationMs?: number;
}

export function useSkip(config: SkipConfig) {
  const { videoRefs, isPlaying, onSkip, fadeDurationMs } = config;

  const skipImmediately = useCallback(() => {
    const activeVideo = videoRefs.activeVideo?.current;
    if (!activeVideo) return;

    console.log('[useSkip] Skipping immediately - pausing video');

    // Pause the video to prevent any further events
    activeVideo.pause();
    activeVideo.currentTime = 0;

    onSkip?.();
  }, [videoRefs, onSkip]);

  const fadeOutAndSkip = useCallback(async () => {
    const activeVideo = videoRefs.activeVideo?.current;
    if (!activeVideo) return;

    console.log('[useSkip] Starting fade-out');

    // Mark skip-in-progress so UI can hide loading overlays during transition
    try {
      (window as any).__DJAMMS_SKIP_IN_PROGRESS__ = true;
    } catch (e) {
      /* ignore */
    }

    await fadeOut(activeVideo, fadeDurationMs ?? 1000,
      (progress, volume, opacity) => {
        // Progress callback if needed
      },
      () => {
        // Fade complete
        console.log('[useSkip] Fade-out complete');

        // Call onSkip BEFORE pausing so the next playVideo() sees isPlaying=true
        // and uses the crossfade path instead of direct play.
        try {
          onSkip?.();
        } catch (err) {
          console.error('[useSkip] onSkip handler threw:', err);
        }

        // Delay pausing/resetting the active video briefly to allow the
        // next player to initiate crossfade. This prevents the next
        // play from thinking playback was paused and doing a direct cut.
        setTimeout(() => {
          try {
            activeVideo.pause();
            activeVideo.currentTime = 0;
          } catch (e) {
            console.warn('[useSkip] Failed to pause/reset active video after skip:', e);
          }
          // Clear skip-in-progress flag after transition completes
          try {
            (window as any).__DJAMMS_SKIP_IN_PROGRESS__ = false;
          } catch (e) {
            /* ignore */
          }
        }, 250);
      }
    );
  }, [videoRefs, onSkip]);

  const skip = useCallback(() => {
    console.log('[useSkip] skip() called');

    const activeVideo = videoRefs.activeVideo?.current;
    if (!activeVideo) return;

    // Always perform fade-out when skipping, regardless of play state
    fadeOutAndSkip();
  }, [videoRefs, fadeOutAndSkip]);

  return {
    skip
  };
}