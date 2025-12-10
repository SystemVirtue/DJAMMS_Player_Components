// hooks/useSkip.ts
// REFACTORED: Simplified wrapper for backwards compatibility
// Skip logic is now handled in useVideoPlayer - this is just a convenience wrapper

import { useCallback } from 'react';
import { VideoRefs } from '../types';
import { logger } from '../utils/logger';

interface SkipConfig {
  videoRefs?: VideoRefs;  // Optional - kept for backwards compatibility but not used
  isPlaying?: boolean;    // Optional - kept for backwards compatibility but not used
  onSkip?: () => void;
  fadeDurationMs?: number; // Optional - kept for backwards compatibility but not used
}

/**
 * Simple skip hook - delegates to a provided onSkip callback
 * 
 * MIGRATION NOTE: This hook is now just a thin wrapper for backwards compatibility.
 * The actual skip logic (including fade-out) is handled in useVideoPlayer.
 * 
 * For new code, use the `skip` function returned from `useVideoPlayer` directly:
 * 
 * ```typescript
 * const { skip } = useVideoPlayer({...});
 * // Use skip() directly instead of useSkip
 * ```
 * 
 * This wrapper exists to minimize breaking changes during migration.
 */
export function useSkip(config: SkipConfig) {
  const { onSkip } = config;

  const skip = useCallback(() => {
    logger.debug('[useSkip] Skip requested - delegating to onSkip callback');
    onSkip?.();
  }, [onSkip]);

  return { skip };
}

// ============================================================================
// MIGRATION EXAMPLE
// ============================================================================

/*
// BEFORE (old pattern with separate useSkip):

const { playVideo, skipWithFade } = useVideoPlayer({
  videoRefs: [videoRef1, videoRef2],
  onVideoEnd: loadNextVideo
});

const { skip } = useSkip({
  videoRefs: videoRefsForSkip,
  isPlaying,
  onSkip: handleSkip,
  fadeDurationMs: 2000
});

// AFTER (new pattern with built-in skip):

const { 
  playVideo, 
  skip,  // Built-in with fade-out!
  setCrossfadeMode 
} = useVideoPlayer({
  videoRefs: [videoRef1, videoRef2],
  crossfadeMode: 'manual',    // or 'seamless'
  crossfadeDuration: 2.0,     // seconds
  onVideoEnd: loadNextVideo
});

// No need for separate useSkip hook!
// Just call skip() directly
*/
