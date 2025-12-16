// hooks/useVideoPlayer.ts
// REFACTORED: Supports both Manual and Seamless crossfade modes
// Manual: Videos play to completion, next starts immediately (clean cut)
// Seamless: Next video starts X seconds before current ends (overlap crossfade)

import { useState, useRef, useCallback, useEffect } from 'react';
import { Video, PlayerState, VideoRefs, CrossfadeMode, TransitionReason } from '../types';
import { createIPCAdapter } from '../utils/ipc';
import { logger } from '../utils/logger';
import { getSupabaseService } from '../services/SupabaseService';

// ============================================================================
// TYPES (local to this module for backwards compatibility)
// ============================================================================

interface VideoPlayerConfig {
  videoRefs: React.RefObject<HTMLVideoElement>[];
  initialVolume?: number;
  crossfadeMode?: CrossfadeMode;
  crossfadeDuration?: number; // seconds (used for both skip fade and seamless overlap)
  onVideoEnd?: () => void;
  onError?: (error: string) => void;
  enableAudioNormalization?: boolean;
  fadeDuration?: number; // DEPRECATED: use crossfadeDuration instead
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useVideoPlayer(config: VideoPlayerConfig) {
  const {
    videoRefs,
    initialVolume = 0.7,
    crossfadeMode: initialCrossfadeMode = 'manual',
    crossfadeDuration: configCrossfadeDuration,
    fadeDuration: legacyFadeDuration, // Support legacy prop
    onVideoEnd,
    onError,
    enableAudioNormalization = false
  } = config;

  // Use crossfadeDuration or fall back to legacy fadeDuration
  const crossfadeDuration = configCrossfadeDuration ?? legacyFadeDuration ?? 2.0;

  // ============================================================================
  // REFS - Video Elements
  // ============================================================================
  
  const videoARef = videoRefs[0] || useRef<HTMLVideoElement>(null);
  const videoBRef = videoRefs[1] || useRef<HTMLVideoElement>(null);
  
  // Track which video is currently active (A or B) using index
  const activeVideoIndexRef = useRef<0 | 1>(0);
  
  // Refs-to-refs for backwards compatibility with existing code
  const activeVideoRefRef = useRef<React.RefObject<HTMLVideoElement>>(videoARef);
  const inactiveVideoRefRef = useRef<React.RefObject<HTMLVideoElement>>(videoBRef);
  
  const getActiveVideo = useCallback((): HTMLVideoElement | null => {
    return activeVideoIndexRef.current === 0 ? videoARef.current : videoBRef.current;
  }, []);
  
  const getInactiveVideo = useCallback((): HTMLVideoElement | null => {
    return activeVideoIndexRef.current === 0 ? videoBRef.current : videoARef.current;
  }, []);
  
  const swapActiveVideo = useCallback(() => {
    activeVideoIndexRef.current = activeVideoIndexRef.current === 0 ? 1 : 0;
    // Update refs-to-refs for compatibility
    activeVideoRefRef.current = activeVideoIndexRef.current === 0 ? videoARef : videoBRef;
    inactiveVideoRefRef.current = activeVideoIndexRef.current === 0 ? videoBRef : videoARef;
  }, []);

  // ============================================================================
  // STATE
  // ============================================================================
  
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);

  // ============================================================================
  // REFS - State Management
  // ============================================================================
  
  // Transition lock - prevents multiple simultaneous transitions (CRITICAL for race condition prevention)
  const transitionLockRef = useRef(false);
  
  // Current video ID - for stale event detection
  const currentVideoIdRef = useRef<string | null>(null);
  
  // Track if early crossfade has been triggered for current video
  const earlyCrossfadeTriggeredRef = useRef(false);
  
  // Track last video end time for debouncing
  const lastVideoEndTimeRef = useRef(0);
  const VIDEO_END_DEBOUNCE_MS = 300;
  
  // Track when a seek occurred to ignore immediate 'ended' events after seeking near the end
  const lastSeekTimeRef = useRef(0);
  const SEEK_END_IGNORE_MS = 500; // Ignore 'ended' events within 500ms of a seek
  
  // Current crossfade mode (allow runtime changes)
  const crossfadeModeRef = useRef<CrossfadeMode>(initialCrossfadeMode);
  
  // Track if we're currently in a crossfade transition
  const isCrossfadingRef = useRef(false);
  
  // Retry tracking
  const retryCountRef = useRef(0);
  
  // Prevent rapid re-triggering of playVideo
  const isLoadingRef = useRef(false);
  const lastPlayRequestRef = useRef<string | null>(null);
  
  // IPC adapter
  const ipcAdapter = createIPCAdapter(true);

  // Refs for audio normalization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const normalizationFactorRef = useRef(1.0);
  const isAnalyzingRef = useRef(false);

  // ============================================================================
  // AUDIO NORMALIZATION (optional feature)
  // ============================================================================

  const initializeAudioAnalysis = useCallback(() => {
    if (!enableAudioNormalization || audioContextRef.current) return;
    
    const activeVideo = getActiveVideo();
    if (!activeVideo) return;

    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaElementSource(activeVideo);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    } catch (error) {
      console.warn('[useVideoPlayer] Web Audio API not supported:', error);
    }
  }, [enableAudioNormalization, getActiveVideo]);

  const calculateRMS = useCallback((buffer: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = (buffer[i] - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }, []);

  const analyzeVolume = useCallback(() => {
    if (!enableAudioNormalization || !analyserRef.current || isAnalyzingRef.current) return;

    isAnalyzingRef.current = true;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const targetRMS = 0.1;
    let totalRMS = 0;
    let sampleCount = 0;

    const analyze = () => {
      if (sampleCount >= 60) {
        const averageRMS = totalRMS / sampleCount;
        normalizationFactorRef.current = Math.max(0.1, Math.min(2.0, targetRMS / averageRMS));
        isAnalyzingRef.current = false;
        return;
      }

      analyserRef.current!.getByteTimeDomainData(dataArray);
      totalRMS += calculateRMS(dataArray);
      sampleCount++;
      requestAnimationFrame(analyze);
    };

    analyze();
  }, [enableAudioNormalization, calculateRMS]);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;

    if (videoA && videoB) {
      const durationMs = Math.max(100, Math.round(crossfadeDuration * 1000));
      
      [videoA, videoB].forEach((video, index) => {
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = 'black';
        video.style.transition = `opacity ${durationMs}ms ease-in-out`;
        video.volume = volume;
        
        // Initially show only video A
        video.style.opacity = index === 0 ? '1' : '0';
        video.style.zIndex = index === 0 ? '10' : '0';
      });
    }
  }, [volume, crossfadeDuration]);

  // ============================================================================
  // CORE TRANSITION LOGIC - SINGLE ENTRY POINT
  // ============================================================================
  
  /**
   * Single entry point for all video transitions
   * Handles locking to prevent race conditions
   */
  const transitionToNext = useCallback((reason: TransitionReason) => {
    // Guard: Prevent duplicate transitions
    if (transitionLockRef.current) {
      logger.debug(`[TRANSITION] Already in progress, ignoring ${reason} trigger`);
      return;
    }
    
    logger.debug(`[TRANSITION] Starting transition (reason: ${reason})`);
    transitionLockRef.current = true;
    
    // Notify SupabaseService of transition lock
    try {
      const supabaseService = getSupabaseService();
      if (supabaseService.initialized) {
        supabaseService.setTransitioning(true);
      }
    } catch (error) {
      // Non-critical - Supabase may not be initialized
      logger.debug('[useVideoPlayer] Could not notify SupabaseService of transition:', error);
    }
    
    // Notify external system
    onVideoEnd?.();
    ipcAdapter.send('playback-ended', {
      videoId: currentVideo?.id,
      title: currentVideo?.title,
      reason
    });
    
    // Release lock after a short delay to allow next video to start loading
    setTimeout(() => {
      transitionLockRef.current = false;
      logger.debug(`[TRANSITION] Lock released`);
      
      // Notify SupabaseService that transition is complete
      try {
        const supabaseService = getSupabaseService();
        if (supabaseService.initialized) {
          supabaseService.setTransitioning(false);
        }
      } catch (error) {
        // Non-critical
        logger.debug('[useVideoPlayer] Could not notify SupabaseService of transition end:', error);
      }
    }, 100);
    
  }, [currentVideo, onVideoEnd, ipcAdapter]);

  /**
   * Check if we should trigger early crossfade in seamless mode
   */
  const checkEarlyCrossfade = useCallback((video: HTMLVideoElement) => {
    // Only in seamless mode
    if (crossfadeModeRef.current !== 'seamless') return;
    
    // Only for active video
    if (video !== getActiveVideo()) return;
    
    // Don't trigger if already triggered or if currently transitioning
    if (earlyCrossfadeTriggeredRef.current || transitionLockRef.current) return;
    
    const remainingTime = video.duration - video.currentTime;
    
    // Trigger when remaining time <= crossfade duration
    if (remainingTime > 0 && remainingTime <= crossfadeDuration && video.duration > 0) {
      logger.debug(`[SEAMLESS] Early crossfade trigger: ${remainingTime.toFixed(2)}s remaining`);
      earlyCrossfadeTriggeredRef.current = true;
      transitionToNext('early_crossfade');
    }
  }, [crossfadeDuration, transitionToNext, getActiveVideo]);

  // ============================================================================
  // VIDEO EVENT HANDLERS - Named functions for proper cleanup
  // ============================================================================
  
  const handleVideoEnded = useCallback((video: HTMLVideoElement) => {
    // Only handle active video
    if (video !== getActiveVideo()) return;
    
    // Check if this is a stale event
    if (currentVideoIdRef.current !== currentVideo?.id) {
      logger.debug('[EVENT] Ignoring stale ended event');
      return;
    }
    
    // CRITICAL: Check if video failed to load - if it ended with very little playback time, it likely failed
    const playbackTime = video.currentTime || 0;
    const duration = video.duration || 0;
    const hasError = video.error !== null;
    
    if (hasError || (playbackTime < 1 && duration > 0)) {
      // Video likely failed to play - log error details
      const errorCode = video.error?.code;
      const errorMessage = video.error?.message || 'Unknown error';
      const errorMessages: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED - Video loading aborted',
        2: 'MEDIA_ERR_NETWORK - Network error while loading video',
        3: 'MEDIA_ERR_DECODE - Video decoding error',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported'
      };
      const errorDetails = hasError ? {
        code: errorCode,
        message: errorMessage,
        errorCode: errorCode === 2 ? 'MEDIA_ERR_NETWORK (2)' : 
                   errorCode === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED (4)' : 
                   errorCode,
        errorText: errorMessages[errorCode || 0] || `Error code: ${errorCode || 'unknown'}`
      } : { reason: 'Ended immediately with minimal playback time' };
      
      console.error('🚨 [EVENT] Video ended with error or failed to play:', {
        title: currentVideo?.title,
        artist: currentVideo?.artist,
        playbackTime,
        duration,
        error: errorDetails,
        networkState: video.networkState,
        readyState: video.readyState,
        networkStateText: ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][video.networkState] || 'UNKNOWN',
        readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState] || 'UNKNOWN',
        src: video.src,
        path: currentVideo?.path,
        paused: video.paused
      });
      
      // Still transition to next, but log the issue
      logger.debug('[EVENT] Video ended due to error/failure - transitioning to next');
    }
    
    // CRITICAL: Ignore 'ended' events that occur immediately after a seek
    // This prevents MEDIA_NETWORK_ERR when seeking near the end triggers immediate end
    const now = Date.now();
    if (now - lastSeekTimeRef.current < SEEK_END_IGNORE_MS) {
      logger.debug(`[EVENT] Ignoring 'ended' event - occurred ${now - lastSeekTimeRef.current}ms after seek (likely caused by seeking near end)`);
      return;
    }
    
    // In seamless mode, if early crossfade already triggered, don't trigger again
    if (crossfadeModeRef.current === 'seamless' && earlyCrossfadeTriggeredRef.current) {
      logger.debug('[EVENT] Video ended - early crossfade already handled');
      return;
    }
    
    // Debounce rapid end events
    if (now - lastVideoEndTimeRef.current < VIDEO_END_DEBOUNCE_MS) {
      logger.debug('[EVENT] Video ended event debounced');
      return;
    }
    lastVideoEndTimeRef.current = now;
    
    logger.debug('[EVENT] Video ended naturally');
    transitionToNext('natural_end');
    
  }, [currentVideo, transitionToNext, getActiveVideo]);

  const handleVideoError = useCallback((video: HTMLVideoElement, error: Event) => {
    // Get detailed error information
    const videoElement = video as HTMLVideoElement;
    const errorCode = videoElement.error?.code;
    const errorMessage = videoElement.error?.message || 'Unknown error';
    const videoSrc = videoElement.src;

    // Map error codes to human-readable messages
    const errorMessages: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED - Video loading aborted',
      2: 'MEDIA_ERR_NETWORK - Network error while loading video',
      3: 'MEDIA_ERR_DECODE - Video decoding error',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported'
    };

    const errorDetails = errorMessages[errorCode || 0] || `Error code: ${errorCode || 'unknown'}`;

    // SPECIAL HANDLING: If current video at index 0 is "Unknown" (corrupted/missing), remove it and auto-play next
    if (currentVideo?.title === 'Unknown' && typeof window !== 'undefined' && (window as any).electronAPI) {
      console.error('🚨 [VIDEO ERROR] Current video at index 0 is "Unknown" - removing from queue and auto-playing next');

      try {
        // Send command to remove the corrupted video at index 0 and auto-play the next one
        (window as any).electronAPI.sendCommand('remove_unknown_video_at_index_zero');
        console.log('✅ [VIDEO ERROR] Sent command to remove unknown video at index 0');
        return; // Don't continue with normal error handling
      } catch (cmdError) {
        console.error('❌ [VIDEO ERROR] Failed to send remove command:', cmdError);
      }
    }

    // Comprehensive PLAYBACK ERROR logging
    const errorLog = {
      type: 'PLAYBACK ERROR',
      timestamp: new Date().toISOString(),
      errorCode,
      errorMessage,
      errorDetails,
      videoSrc,
      videoTitle: currentVideo?.title,
      videoArtist: currentVideo?.artist,
      videoPath: currentVideo?.path || currentVideo?.src,
      networkState: videoElement.networkState,
      readyState: videoElement.readyState,
      networkStateText: ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][videoElement.networkState] || 'UNKNOWN',
      readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][videoElement.readyState] || 'UNKNOWN',
      currentTime: videoElement.currentTime,
      duration: videoElement.duration,
      paused: videoElement.paused,
      muted: videoElement.muted,
      volume: videoElement.volume
    };
    
    console.error('🚨 ========== PLAYBACK ERROR ==========');
    console.error('PLAYBACK ERROR:', errorLog);
    console.error('PLAYBACK ERROR - Video Source:', videoSrc);
    console.error('PLAYBACK ERROR - Video Title:', currentVideo?.title);
    console.error('PLAYBACK ERROR - Error Code:', errorCode, '-', errorDetails);
    console.error('PLAYBACK ERROR - Network State:', errorLog.networkStateText, `(${videoElement.networkState})`);
    console.error('PLAYBACK ERROR - Ready State:', errorLog.readyStateText, `(${videoElement.readyState})`);
    console.error('🚨 ====================================');
    
    // Also log to main process if in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        const { type, ...errorLogWithoutType } = errorLog;
        (window as any).electronAPI.send?.('log-error', {
          ...errorLogWithoutType,
          type: 'PLAYBACK_ERROR' // Override type for IPC
        });
      } catch (e) {
        // Ignore IPC errors
      }
    }
    
    setIsLoading(false);
    isLoadingRef.current = false;
    
    const userErrorMessage = `Failed to play: ${currentVideo?.title || 'Unknown'}\n${errorDetails}`;
    setError(userErrorMessage);
    onError?.(userErrorMessage);
    
    // Auto-advance to next video after error
    setTimeout(() => {
      transitionToNext('error');
    }, 2000);
    
  }, [currentVideo, onError, transitionToNext]);

  const handleLoadedMetadata = useCallback((video: HTMLVideoElement) => {
    if (video === getActiveVideo()) {
      setDuration(video.duration);
    }
  }, [getActiveVideo]);

  const handleTimeUpdate = useCallback((video: HTMLVideoElement) => {
    if (video === getActiveVideo() && isPlaying) {
      setCurrentTime(video.currentTime);
      checkEarlyCrossfade(video);
    }
  }, [isPlaying, checkEarlyCrossfade, getActiveVideo]);

  const handleCanPlayThrough = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handlePlaying = useCallback((video: HTMLVideoElement) => {
    if (video === getActiveVideo()) {
      setIsPlaying(true);
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [getActiveVideo]);

  // ============================================================================
  // EVENT LISTENER SETUP - Proper cleanup with named handlers
  // ============================================================================
  
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) return;

    // Create named handler functions for proper cleanup
    const handlers = {
      videoA: {
        ended: () => handleVideoEnded(videoA),
        error: (e: Event) => handleVideoError(videoA, e),
        loadedmetadata: () => handleLoadedMetadata(videoA),
        timeupdate: () => handleTimeUpdate(videoA),
        canplaythrough: handleCanPlayThrough,
        playing: () => handlePlaying(videoA)
      },
      videoB: {
        ended: () => handleVideoEnded(videoB),
        error: (e: Event) => handleVideoError(videoB, e),
        loadedmetadata: () => handleLoadedMetadata(videoB),
        timeupdate: () => handleTimeUpdate(videoB),
        canplaythrough: handleCanPlayThrough,
        playing: () => handlePlaying(videoB)
      }
    };

    // Add listeners
    videoA.addEventListener('ended', handlers.videoA.ended);
    videoA.addEventListener('error', handlers.videoA.error);
    videoA.addEventListener('loadedmetadata', handlers.videoA.loadedmetadata);
    videoA.addEventListener('timeupdate', handlers.videoA.timeupdate);
    videoA.addEventListener('canplaythrough', handlers.videoA.canplaythrough);
    videoA.addEventListener('playing', handlers.videoA.playing);

    videoB.addEventListener('ended', handlers.videoB.ended);
    videoB.addEventListener('error', handlers.videoB.error);
    videoB.addEventListener('loadedmetadata', handlers.videoB.loadedmetadata);
    videoB.addEventListener('timeupdate', handlers.videoB.timeupdate);
    videoB.addEventListener('canplaythrough', handlers.videoB.canplaythrough);
    videoB.addEventListener('playing', handlers.videoB.playing);

    // Cleanup - CRITICAL: Use the exact same function references
    return () => {
      videoA.removeEventListener('ended', handlers.videoA.ended);
      videoA.removeEventListener('error', handlers.videoA.error);
      videoA.removeEventListener('loadedmetadata', handlers.videoA.loadedmetadata);
      videoA.removeEventListener('timeupdate', handlers.videoA.timeupdate);
      videoA.removeEventListener('canplaythrough', handlers.videoA.canplaythrough);
      videoA.removeEventListener('playing', handlers.videoA.playing);

      videoB.removeEventListener('ended', handlers.videoB.ended);
      videoB.removeEventListener('error', handlers.videoB.error);
      videoB.removeEventListener('loadedmetadata', handlers.videoB.loadedmetadata);
      videoB.removeEventListener('timeupdate', handlers.videoB.timeupdate);
      videoB.removeEventListener('canplaythrough', handlers.videoB.canplaythrough);
      videoB.removeEventListener('playing', handlers.videoB.playing);
    };
  }, [
    handleVideoEnded,
    handleVideoError,
    handleLoadedMetadata,
    handleTimeUpdate,
    handleCanPlayThrough,
    handlePlaying
  ]);

  // ============================================================================
  // PATH RESOLUTION
  // ============================================================================
  
  /**
   * Get video source URL with proper path resolution
   */
  const getVideoSource = useCallback((video: Video): string => {
    // CRITICAL: Always prioritize src over path - src may already be converted to djamms://
    console.log('[VIDEO] getVideoSource called - video.src:', video.src, 'video.path:', video.path);
    
    // If src exists and is djamms:// or http://, use it directly without checking path
    if (video.src) {
      if (video.src.startsWith('djamms://') || video.src.startsWith('http://') || video.src.startsWith('https://')) {
        console.log('[VIDEO] ✅ Using src URL directly (djamms:// or http://):', video.src);
        return video.src;
      }
      // If src is file://, we'll convert it below
      if (video.src.startsWith('file://')) {
        console.log('[VIDEO] src is file://, will convert to djamms://');
      }
    } else {
      console.log('[VIDEO] ⚠️ No src field, will use path or file_path');
    }
    
    // Fallback to path or file_path if src doesn't exist or isn't a valid URL
    let videoPath = video.src || video.path || (video as any).file_path;
    if (!videoPath) {
      throw new Error('No video path found');
    }
    
    // Extract actual file path if it's a file:// URL (for conversion to djamms://)
    if (videoPath.startsWith('file://')) {
      videoPath = videoPath.substring(7); // Remove 'file://' prefix
      console.log('[VIDEO] Extracted file path from file:// URL:', videoPath);
    }

    // Already an HTTP URL
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      return videoPath;
    }

    // Get current origin for relative URLs
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

    // Proxy path - use current origin (for web mode)
    if (videoPath.startsWith('/playlist/')) {
      return `${origin}${videoPath}`;
    }

    // Electron detection
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    const isDevMode = typeof window !== 'undefined' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
    
    console.log('[VIDEO] getVideoSource called:', {
      videoPath,
      isElectron,
      origin,
      isDevMode,
      hasElectronAPI: !!(typeof window !== 'undefined' && (window as any).electronAPI)
    });

    // In Electron, use appropriate protocol based on mode
    if (isElectron) {
      // Normalize path separators for cross-platform compatibility
      // Always work with a pure filesystem path (no protocol prefix)
      let normalizedPath = videoPath;
      if (normalizedPath.startsWith('file://')) {
        normalizedPath = normalizedPath.substring(7); // Remove 'file://' prefix
      }
      // On Windows, incoming paths may contain backslashes (C:\foo\bar.mp4)
      // Convert ALL backslashes to forward slashes so the resulting file:// URL is valid
      normalizedPath = normalizedPath.replace(/\\/g, '/');
      console.log('[VIDEO] Normalized filesystem path for Electron:', normalizedPath);

      // CRITICAL FIX: Handle playlist name changes (YouTube ID removal)
      // If the path contains an old playlist name (with YouTube ID), try to find the new path
      const pathParts = normalizedPath.split('/');
      if (pathParts.length >= 2) {
        const playlistsDir = pathParts.slice(0, -2).join('/'); // Everything except playlist folder and filename
        const oldPlaylistName = pathParts[pathParts.length - 2]; // Playlist folder name
        const filename = pathParts[pathParts.length - 1]; // Video filename

        // Check if this is an old format playlist name (contains YouTube ID)
        const youtubeIdMatch = oldPlaylistName.match(/^PL[A-Za-z0-9_-]+[._](.+)$/);
        if (youtubeIdMatch) {
          const newPlaylistName = youtubeIdMatch[1]; // Extract display name
          const newPath = `${playlistsDir}/${newPlaylistName}/${filename}`;

          // Check if the new path exists
          try {
            const fs = require('fs');
            if (fs.existsSync(newPath)) {
              console.log('✅ [VIDEO] Found video at new path (YouTube ID removed):', newPath);
              normalizedPath = newPath;
            } else {
              console.warn('⚠️ [VIDEO] Old playlist path detected but new path does not exist:', {
                oldPath: normalizedPath,
                newPath: newPath,
                oldPlaylist: oldPlaylistName,
                newPlaylist: newPlaylistName
              });
            }
          } catch (error) {
            console.warn('⚠️ [VIDEO] Error checking new playlist path:', error);
          }
        }
      }

      // In dev mode, use djamms:// protocol (registered in main process)
      // This avoids file:// URL issues with webSecurity and CORS
      if (isDevMode) {
        // DEV MODE: use custom djamms:// protocol (handled by main process)
        // CRITICAL: Encode the path to handle spaces and special characters properly
        // The protocol handler will decode it back
        const encodedPath = encodeURIComponent(normalizedPath).replace(/%2F/g, '/'); // Keep slashes as slashes
        const djammsUrl = `djamms://${encodedPath}`;
        console.log('✅ [VIDEO] Converting file:// to djamms:// in dev mode (PROPERLY ENCODED)');
        console.log('✅ [VIDEO] Original path:', videoPath);
        console.log('✅ [VIDEO] Normalized path:', normalizedPath);
        console.log('✅ [VIDEO] Encoded path:', encodedPath);
        console.log('✅ [VIDEO] djamms:// URL:', djammsUrl);
        return djammsUrl;
      }

      // PRODUCTION: build a valid file:// URL
      // normalizedPath is a pure filesystem path with forward slashes only.
      // Windows drive letters must stay as "C:" (NOT percent-encoded).
      const driveMatch = normalizedPath.match(/^([A-Za-z]:)(\/.*)?$/);
      let fileUrl: string;

      if (driveMatch) {
        const drive = driveMatch[1];           // e.g. "C:"
        const remainder = driveMatch[2] || ''; // e.g. "/Users/..."
        const segments = remainder.split('/').filter(Boolean);
        const encoded = segments.map(seg => encodeURIComponent(seg)).join('/');
        // file:///C:/Users/...
        fileUrl = `file:///${drive}/${encoded}`;
      } else {
        // Non-Windows (or UNC-style) path
        const segments = normalizedPath.split('/').filter(Boolean);
        const encoded = segments.map(seg => encodeURIComponent(seg)).join('/');
        fileUrl = `file:///${encoded}`;
      }

      console.log('[VIDEO] Final file URL for Electron:', fileUrl);
      return fileUrl;
    }

    // Web browser mode - try to convert to proxy URL
    const playlistMatch = videoPath.match(/PLAYLISTS\/([^\/]+)\/([^\/]+)$/);
    if (playlistMatch) {
      const [, playlistName, fileName] = playlistMatch;
      return `${origin}/playlist/${encodeURIComponent(playlistName)}/${encodeURIComponent(fileName)}`;
    }

    // Fallback: try file:// for web (may not work due to CORS, but worth trying)
    console.warn('[VIDEO] Cannot convert local path to proxy URL, using file://:', videoPath);
    return `file://${videoPath}`;
  }, []);

  // ============================================================================
  // PLAYBACK FUNCTIONS
  // ============================================================================
  
  /**
   * Play video in manual mode (no crossfade, immediate cut)
   */
  const playVideoManual = useCallback((video: Video) => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) {
      console.error('[MANUAL] No active video element available');
      return;
    }

    logger.debug('[MANUAL] Playing video:', video.title);

    const videoSrc = getVideoSource(video);
    console.log('[MANUAL] Video source:', videoSrc);
    
    // Clear any previous error state
    setError(null);
    setIsLoading(true);
    isLoadingRef.current = true;
    
    // Set video source
    activeVideo.src = videoSrc;
    activeVideo.style.opacity = '1';
    activeVideo.style.zIndex = '10';
    activeVideo.volume = volume;

    // Ensure inactive video is hidden and stopped
    const inactiveVideo = getInactiveVideo();
    if (inactiveVideo) {
      inactiveVideo.pause();
      inactiveVideo.currentTime = 0;
      inactiveVideo.style.opacity = '0';
      inactiveVideo.style.zIndex = '0';
    }

    // Add error listener to catch loading errors
    const errorHandler = (e: Event) => {
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Video element error event fired');
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Event:', e);
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Video src:', activeVideo.src);
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Video error state:', activeVideo.error ? {
        code: activeVideo.error.code,
        message: activeVideo.error.message
      } : 'no error');
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Network state:', activeVideo.networkState);
      console.error('🚨 [MANUAL] PLAYBACK ERROR - Ready state:', activeVideo.readyState);
      handleVideoError(activeVideo, e);
    };
    activeVideo.addEventListener('error', errorHandler, { once: true });
    
    // Listen for loadstart, loadeddata, canplay events to track loading progress
    const loadStartHandler = () => {
      console.log('[MANUAL] Video load started - src:', activeVideo.src);
    };
    const loadedDataHandler = () => {
      console.log('[MANUAL] Video data loaded:', videoSrc);
    };
    const canPlayHandler = () => {
      console.log('[MANUAL] Video can play:', videoSrc);
    };
    const stalledHandler = () => {
      console.error('🚨 [MANUAL] Video stalled - network issue?', {
        src: activeVideo.src,
        networkState: activeVideo.networkState,
        readyState: activeVideo.readyState,
        error: activeVideo.error
      });
    };
    const suspendHandler = () => {
      console.warn('⚠️ [MANUAL] Video loading suspended:', videoSrc);
    };
    
    activeVideo.addEventListener('loadstart', loadStartHandler, { once: true });
    activeVideo.addEventListener('loadeddata', loadedDataHandler, { once: true });
    activeVideo.addEventListener('canplay', canPlayHandler, { once: true });
    activeVideo.addEventListener('stalled', stalledHandler, { once: true });
    activeVideo.addEventListener('suspend', suspendHandler, { once: true });

    const playPromise = activeVideo.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          logger.debug('[MANUAL] Playback started');
          setIsPlaying(true);
          setIsLoading(false);
          isLoadingRef.current = false;

          // Initialize audio analysis if enabled
          if (enableAudioNormalization) {
            initializeAudioAnalysis();
            setTimeout(() => analyzeVolume(), 500);
          }
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            logger.debug('[MANUAL] Play interrupted (expected during rapid switching)');
            return;
          }
          
          // Try muted playback for autoplay policy
          console.warn('[MANUAL] Play failed, trying muted:', error.message);
          activeVideo.muted = true;
          activeVideo.play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              isLoadingRef.current = false;
              setTimeout(() => { activeVideo.muted = false; }, 100);
            })
            .catch(e => handleVideoError(activeVideo, e));
        });
    }
  }, [volume, getVideoSource, getActiveVideo, getInactiveVideo, handleVideoError, enableAudioNormalization, initializeAudioAnalysis, analyzeVolume, setIsLoading, setError]);

  /**
   * Play video in seamless mode (crossfade from current video)
   */
  const playVideoSeamless = useCallback((video: Video) => {
    const currentActive = getActiveVideo();
    const nextActive = getInactiveVideo();
    
    if (!currentActive || !nextActive) {
      console.error('[SEAMLESS] Missing video elements');
      return;
    }

    logger.debug('[SEAMLESS] Starting crossfade to:', video.title);
    isCrossfadingRef.current = true;

    const videoSrc = getVideoSource(video);
    console.log('[SEAMLESS] Video source:', videoSrc);
    
    // Clear any previous error state
    setError(null);
    setIsLoading(true);
    isLoadingRef.current = true;
    
    // Load next video into inactive element
    nextActive.src = videoSrc;
    nextActive.volume = volume;
    nextActive.style.zIndex = '5'; // Below current but visible during transition
    
    // Add error listener to catch loading errors
    const errorHandler = (e: Event) => {
      console.error('🚨 [SEAMLESS] PLAYBACK ERROR - Video element error event fired');
      console.error('🚨 [SEAMLESS] PLAYBACK ERROR - Event:', e);
      console.error('🚨 [SEAMLESS] PLAYBACK ERROR - Video src:', nextActive.src);
      handleVideoError(nextActive, e);
    };
    nextActive.addEventListener('error', errorHandler, { once: true });
    
    // Track loading progress for seamless mode
    const loadStartHandler = () => {
      console.log('[SEAMLESS] Video load started:', videoSrc);
    };
    const loadedDataHandler = () => {
      console.log('[SEAMLESS] Video data loaded:', videoSrc);
    };
    const canPlayHandler = () => {
      console.log('[SEAMLESS] Video can play:', videoSrc);
    };
    const stalledHandler = () => {
      console.warn('⚠️ [SEAMLESS] Video stalled (buffering):', videoSrc);
    };
    
    nextActive.addEventListener('loadstart', loadStartHandler, { once: true });
    nextActive.addEventListener('loadeddata', loadedDataHandler, { once: true });
    nextActive.addEventListener('canplay', canPlayHandler, { once: true });
    nextActive.addEventListener('stalled', stalledHandler);
    
    // Start playing the next video (will be behind current)
    const playPromise = nextActive.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          logger.debug('[SEAMLESS] Next video loaded, starting crossfade');
          
          // Crossfade: fade out current, fade in next
          currentActive.style.opacity = '0';
          currentActive.style.zIndex = '0';
          nextActive.style.opacity = '1';
          nextActive.style.zIndex = '10';
          
          // After crossfade duration, stop the old video
          setTimeout(() => {
            currentActive.pause();
            currentActive.currentTime = 0;
            
            // Swap active/inactive
            swapActiveVideo();
            
            isCrossfadingRef.current = false;
            setIsPlaying(true);
            setIsLoading(false);
            isLoadingRef.current = false;
            logger.debug('[SEAMLESS] Crossfade complete');
          }, crossfadeDuration * 1000);
        })
        .catch(error => {
          isCrossfadingRef.current = false;
          
          if (error.name === 'AbortError') {
            logger.debug('[SEAMLESS] Play interrupted');
            return;
          }
          
          console.error('[SEAMLESS] Crossfade failed, falling back to manual:', error);
          // Fallback to manual mode
          playVideoManual(video);
        });
    }
  }, [volume, crossfadeDuration, getVideoSource, getActiveVideo, getInactiveVideo, swapActiveVideo, playVideoManual, handleVideoError, setIsLoading, setError]);

  /**
   * Main play video function - routes to appropriate mode
   */
  const playVideo = useCallback((video: Video) => {
    const videoId = video.id || video.path || video.src || '';
    
    // Prevent duplicate play requests
    if (isLoadingRef.current && lastPlayRequestRef.current === videoId) {
      logger.debug('[PLAY] Skipping duplicate play request for:', video.title);
      return;
    }

    logger.debug(`[PLAY] Playing video in ${crossfadeModeRef.current} mode:`, video.title);
    
    // Reset state for new video
    if (currentVideoIdRef.current !== videoId) {
      earlyCrossfadeTriggeredRef.current = false;
      currentVideoIdRef.current = videoId;
    }
    
    isLoadingRef.current = true;
    lastPlayRequestRef.current = videoId;
    retryCountRef.current = 0;
    normalizationFactorRef.current = 1.0;
    isAnalyzingRef.current = false;
    
    setCurrentVideo(video);
    setIsLoading(true);
    setError(null);
    
    // Route to appropriate play mode
    if (crossfadeModeRef.current === 'seamless' && isPlaying && !transitionLockRef.current) {
      // Seamless mode + already playing = crossfade
      playVideoSeamless(video);
    } else {
      // Manual mode OR first video OR transitioning = direct play
      playVideoManual(video);
    }
    
  }, [isPlaying, playVideoManual, playVideoSeamless]);

  // ============================================================================
  // SKIP FUNCTION - User-initiated skip with fade-out
  // ============================================================================
  
  /**
   * User-initiated skip with fade-out
   * Uses the unified transitionToNext entry point
   */
  const skip = useCallback(() => {
    if (transitionLockRef.current) {
      logger.debug('[SKIP] Transition in progress, ignoring');
      return;
    }
    
    const activeVideo = getActiveVideo();
    if (!activeVideo) {
      transitionToNext('user_skip');
      return;
    }

    logger.debug('[SKIP] User skip - fading out');
    transitionLockRef.current = true;
    isCrossfadingRef.current = true;

    // Notify SupabaseService of transition lock
    try {
      const supabaseService = getSupabaseService();
      if (supabaseService.initialized) {
        supabaseService.setTransitioning(true);
      }
    } catch (error) {
      // Non-critical
      logger.debug('[useVideoPlayer] Could not notify SupabaseService of skip transition:', error);
    }

    const startVolume = activeVideo.volume;
    const startOpacity = parseFloat(activeVideo.style.opacity) || 1;
    const fadeStart = Date.now();
    const fadeDurationMs = crossfadeDuration * 1000;

    const fadeStep = () => {
      const elapsed = Date.now() - fadeStart;
      const progress = Math.min(elapsed / fadeDurationMs, 1);

      activeVideo.volume = startVolume * (1 - progress);
      activeVideo.style.opacity = (startOpacity * (1 - progress)).toString();

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        // Fade complete
        activeVideo.pause();
        activeVideo.currentTime = 0;
        activeVideo.volume = volume;
        activeVideo.style.opacity = '1';
        
        isCrossfadingRef.current = false;
        
        logger.debug('[SKIP] Fade complete, advancing to next');
        
        // Use the unified transition mechanism
        // Note: transitionLockRef is already true, transitionToNext will handle it
        onVideoEnd?.();
        ipcAdapter.send('playback-ended', {
          videoId: currentVideo?.id,
          title: currentVideo?.title,
          reason: 'user_skip'
        });
        
        // Release lock
        setTimeout(() => {
          transitionLockRef.current = false;
          
          // Notify SupabaseService that transition is complete
          try {
            const supabaseService = getSupabaseService();
            if (supabaseService.initialized) {
              supabaseService.setTransitioning(false);
            }
          } catch (error) {
            // Non-critical
            logger.debug('[useVideoPlayer] Could not notify SupabaseService of skip transition end:', error);
          }
        }, 100);
      }
    };

    requestAnimationFrame(fadeStep);
    
  }, [volume, crossfadeDuration, getActiveVideo, currentVideo, onVideoEnd, ipcAdapter]);

  // Alias for backwards compatibility
  const skipWithFade = skip;

  // ============================================================================
  // CONTROL FUNCTIONS
  // ============================================================================
  
  const pauseVideo = useCallback(() => {
    const activeVideo = getActiveVideo();
    if (activeVideo) {
      activeVideo.pause();
      setIsPlaying(false);
    }
  }, [getActiveVideo]);

  const resumeVideo = useCallback(() => {
    const activeVideo = getActiveVideo();
    if (activeVideo && currentVideo) {
      activeVideo.play()
        .then(() => setIsPlaying(true))
        .catch(error => console.error('[RESUME] Failed:', error));
    }
  }, [currentVideo, getActiveVideo]);

  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);

    [videoARef.current, videoBRef.current].forEach(video => {
      if (video) video.volume = clampedVolume;
    });

    ipcAdapter.send('save-volume', clampedVolume);
  }, [ipcAdapter]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    [videoARef.current, videoBRef.current].forEach(video => {
      if (video) video.muted = newMuted;
    });

    ipcAdapter.send('save-mute', newMuted);
  }, [isMuted, ipcAdapter]);

  const seekTo = useCallback((time: number) => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) {
      console.warn('[useVideoPlayer] seekTo: No active video element');
      return;
    }

    // CRITICAL: Prevent seeking during transitions to avoid MEDIA_NETWORK_ERR
    if (transitionLockRef.current) {
      console.warn('[useVideoPlayer] seekTo: Transition in progress, seek blocked to prevent MEDIA_NETWORK_ERR');
      return;
    }

    // Validate seek position
    const duration = activeVideo.duration || 0;
    if (isNaN(duration) || duration === 0) {
      console.warn('[useVideoPlayer] seekTo: Video duration not available yet, waiting for metadata...');
      // Wait for metadata to load before seeking
      const onLoadedMetadata = () => {
        // Apply the same buffer logic when metadata loads
        const duration = activeVideo.duration || 0;
        const MIN_BUFFER_FROM_END = 2.0;
        const maxSafeSeekTime = Math.max(0, duration - MIN_BUFFER_FROM_END);
        const validTime = Math.max(0, Math.min(time, maxSafeSeekTime));
        
        // Check transition lock before seeking
        if (transitionLockRef.current) {
          console.warn('[useVideoPlayer] seekTo: Transition in progress after metadata loaded, aborting seek');
          activeVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
          return;
        }
        
        try {
          lastSeekTimeRef.current = Date.now(); // Track seek time
          activeVideo.currentTime = validTime;
          setCurrentTime(validTime);
          console.log(`[useVideoPlayer] seekTo: Successfully sought to ${validTime.toFixed(1)}s after metadata loaded`);
        } catch (error) {
          console.error('[useVideoPlayer] seekTo: Error seeking after metadata loaded:', error);
        }
        activeVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      activeVideo.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      return;
    }

    // Clamp seek time to valid range, but keep at least 2 seconds from the end
    // This prevents seeking too close to the end which would immediately trigger 'ended' event
    // and cause MEDIA_NETWORK_ERR during transitions
    const MIN_BUFFER_FROM_END = 2.0; // seconds
    const maxSafeSeekTime = Math.max(0, duration - MIN_BUFFER_FROM_END);
    const validTime = Math.max(0, Math.min(time, maxSafeSeekTime));
    
    // Warn if requested time was too close to the end
    if (time > maxSafeSeekTime && duration > MIN_BUFFER_FROM_END) {
      console.warn(`[useVideoPlayer] seekTo: Requested position ${time.toFixed(1)}s too close to end (${duration.toFixed(1)}s), clamping to ${validTime.toFixed(1)}s to prevent immediate end event`);
    }
    
    // Check if video is in a state that allows seeking
    if (activeVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
      console.warn('[useVideoPlayer] seekTo: Video not ready (readyState < HAVE_METADATA), waiting...');
      // Wait for metadata before seeking
      const onLoadedMetadata = () => {
        try {
          lastSeekTimeRef.current = Date.now(); // Track seek time
          activeVideo.currentTime = validTime;
          setCurrentTime(validTime);
          console.log(`[useVideoPlayer] seekTo: Successfully sought to ${validTime.toFixed(1)}s after ready`);
        } catch (error) {
          console.error('[useVideoPlayer] seekTo: Error seeking after ready:', error);
        }
        activeVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      activeVideo.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      return;
    }

    // Perform the seek
    try {
      // Check if seeking to a position that requires more data to be loaded
      const seekableRanges = activeVideo.seekable;
      if (seekableRanges.length > 0) {
        const lastRange = seekableRanges.length - 1;
        const maxSeekable = seekableRanges.end(lastRange);
        if (validTime > maxSeekable) {
          console.warn(`[useVideoPlayer] seekTo: Requested position ${validTime.toFixed(1)}s exceeds seekable range (max: ${maxSeekable.toFixed(1)}s), seeking to max instead`);
          lastSeekTimeRef.current = Date.now(); // Track seek time
          activeVideo.currentTime = maxSeekable;
          setCurrentTime(maxSeekable);
          return;
        }
      }

      // Check buffered ranges - if target is not buffered, we might get MEDIA_NETWORK_ERR
      // The browser will request the range, but we should log if it's not buffered
      const bufferedRanges = activeVideo.buffered;
      let isBuffered = false;
      if (bufferedRanges.length > 0) {
        for (let i = 0; i < bufferedRanges.length; i++) {
          if (validTime >= bufferedRanges.start(i) && validTime <= bufferedRanges.end(i)) {
            isBuffered = true;
            break;
          }
        }
        if (!isBuffered) {
          const bufferedEnd = bufferedRanges.end(bufferedRanges.length - 1);
          console.log(`[useVideoPlayer] seekTo: Target ${validTime.toFixed(1)}s not buffered (buffered up to ${bufferedEnd.toFixed(1)}s) - browser will request range`);
        }
      }

      // Double-check transition lock hasn't been set during validation
      if (transitionLockRef.current) {
        console.warn('[useVideoPlayer] seekTo: Transition started during seek validation, aborting seek to prevent MEDIA_NETWORK_ERR');
        return;
      }

      // Ensure video is not in an error state
      if (activeVideo.error) {
        console.error('[useVideoPlayer] seekTo: Video has error state, cannot seek. Error code:', activeVideo.error.code);
        return;
      }

      // Check network state - if it's NETWORK_NO_SOURCE or NETWORK_LOADING, wait
      if (activeVideo.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || 
          activeVideo.networkState === HTMLMediaElement.NETWORK_LOADING) {
        console.warn('[useVideoPlayer] seekTo: Video network state not ready, waiting...', {
          networkState: activeVideo.networkState,
          readyState: activeVideo.readyState
        });
        
        // Wait for network to be ready
        const onCanPlay = () => {
          if (!transitionLockRef.current && !activeVideo.error) {
            try {
              lastSeekTimeRef.current = Date.now(); // Track seek time
              activeVideo.currentTime = validTime;
              setCurrentTime(validTime);
              console.log(`[useVideoPlayer] seekTo: Successfully sought to ${validTime.toFixed(1)}s after network ready`);
            } catch (err) {
              console.error('[useVideoPlayer] seekTo: Error seeking after network ready:', err);
            }
          }
          activeVideo.removeEventListener('canplay', onCanPlay);
        };
        activeVideo.addEventListener('canplay', onCanPlay, { once: true });
        return;
      }

      // Ensure video source is loaded (not empty)
      if (!activeVideo.src || activeVideo.src === '') {
        console.warn('[useVideoPlayer] seekTo: Video src is empty, cannot seek');
        return;
      }

      // Add a small delay to ensure video is stable before seeking
      // This prevents MEDIA_NETWORK_ERR when seeking immediately after state changes
      setTimeout(() => {
        // Double-check everything is still valid
        if (transitionLockRef.current || activeVideo.error || !activeVideo.src) {
          console.warn('[useVideoPlayer] seekTo: Conditions changed during delay, aborting seek');
          return;
        }

        try {
          // Log video state BEFORE seek
          console.log('[useVideoPlayer] seekTo: BEFORE seek - Video state:', {
            currentTime: activeVideo.currentTime,
            duration: activeVideo.duration,
            targetTime: validTime,
            networkState: activeVideo.networkState,
            readyState: activeVideo.readyState,
            error: activeVideo.error ? {
              code: (activeVideo.error as MediaError).code,
              message: (activeVideo.error as MediaError).message
            } : null,
            src: activeVideo.src,
            paused: activeVideo.paused
          });
          
          // Track that a seek is happening - this will prevent immediate 'ended' events
          lastSeekTimeRef.current = Date.now();
          
          // Perform the seek
          activeVideo.currentTime = validTime;
          setCurrentTime(validTime);
          console.log(`[useVideoPlayer] seekTo: ✅ Seek command executed to ${validTime.toFixed(1)}s${isBuffered ? ' (buffered)' : ' (will buffer)'} - ignoring 'ended' events for ${SEEK_END_IGNORE_MS}ms`);
          
          // Monitor for errors immediately after seek
          const checkError = () => {
            if (activeVideo.error) {
              console.error('🚨 [useVideoPlayer] seekTo: MEDIA ERROR detected after seek!', {
                code: activeVideo.error.code,
                message: activeVideo.error.message,
                errorCode: activeVideo.error.code === 2 ? 'MEDIA_ERR_NETWORK (2)' : activeVideo.error.code,
                networkState: activeVideo.networkState,
                readyState: activeVideo.readyState,
                currentTime: activeVideo.currentTime,
                targetTime: validTime,
                src: activeVideo.src,
                buffered: activeVideo.buffered.length > 0 ? {
                  start: activeVideo.buffered.start(0),
                  end: activeVideo.buffered.end(0)
                } : 'none'
              });
              // Also trigger the main error handler
              handleVideoError(activeVideo, new Event('error'));
            }
          };
          
          // Check immediately
          setTimeout(checkError, 10);
          
          // Check again after a short delay
          setTimeout(checkError, 100);
          setTimeout(checkError, 500);
          
          // Listen for seek errors via event
          const onError = (e: Event) => {
            console.error('🚨 [useVideoPlayer] seekTo: ERROR EVENT FIRED after seek!', {
              event: e,
              error: activeVideo.error ? {
                code: activeVideo.error.code,
                message: activeVideo.error.message
              } : null,
              networkState: activeVideo.networkState,
              readyState: activeVideo.readyState,
              currentTime: activeVideo.currentTime,
              targetTime: validTime
            });
            checkError();
            activeVideo.removeEventListener('error', onError);
          };
          activeVideo.addEventListener('error', onError, { once: true });
          
          // Also listen for 'stalled' and 'suspend' events which might indicate network issues
          const onStalled = () => {
            console.warn('[useVideoPlayer] seekTo: Video stalled after seek');
            checkError();
          };
          const onSuspend = () => {
            console.warn('[useVideoPlayer] seekTo: Video suspended after seek');
            checkError();
          };
          activeVideo.addEventListener('stalled', onStalled, { once: true });
          activeVideo.addEventListener('suspend', onSuspend, { once: true });
          
        } catch (seekError) {
          console.error('[useVideoPlayer] seekTo: Exception during seek:', seekError);
        }
      }, 50); // Small delay to ensure video is stable
      
    } catch (error) {
      console.error('[useVideoPlayer] seekTo: Error setting currentTime:', error);
      // If seek fails, try to wait for the video to be more ready
      if (activeVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        console.log('[useVideoPlayer] seekTo: Video not ready enough, waiting for canplay...');
        const onCanPlay = () => {
          try {
            lastSeekTimeRef.current = Date.now(); // Track seek time
            activeVideo.currentTime = validTime;
            setCurrentTime(validTime);
            console.log(`[useVideoPlayer] seekTo: Successfully sought to ${validTime.toFixed(1)}s after canplay`);
          } catch (retryError) {
            console.error('[useVideoPlayer] seekTo: Error seeking after canplay:', retryError);
          }
          activeVideo.removeEventListener('canplay', onCanPlay);
        };
        activeVideo.addEventListener('canplay', onCanPlay, { once: true });
      }
    }
  }, [getActiveVideo]);

  const retry = useCallback(() => {
    if (currentVideo) {
      playVideo(currentVideo);
    }
  }, [currentVideo, playVideo]);

  /**
   * Change crossfade mode at runtime
   */
  const setCrossfadeMode = useCallback((mode: CrossfadeMode) => {
    logger.debug(`[MODE] Switching to ${mode} mode`);
    crossfadeModeRef.current = mode;
  }, []);

  /**
   * Preload a video into the inactive element for faster transitions
   */
  const preloadVideo = useCallback((video: Video) => {
    if (!video) return;

    const inactiveVideo = getInactiveVideo();
    if (!inactiveVideo) {
      console.warn('[PRELOAD] No inactive video element available');
      return;
    }

    try {
      const videoSrc = getVideoSource(video);
      logger.debug(`[PRELOAD] Preloading: ${video.title}`);
      inactiveVideo.src = videoSrc;
      inactiveVideo.preload = 'auto';
      inactiveVideo.load();
    } catch (error) {
      console.warn('[PRELOAD] Failed:', error);
    }
  }, [getInactiveVideo, getVideoSource]);

  // ============================================================================
  // RETURN API
  // ============================================================================
  
  return {
    // State
    currentVideo,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    volume,
    isMuted,
    crossfadeMode: crossfadeModeRef.current,
    
    // Legacy accessor for backwards compatibility
    activeVideoElement: getActiveVideo(),
    
    // Playback controls
    playVideo,
    pauseVideo,
    resumeVideo,
    skip,
    skipWithFade, // Alias for backwards compatibility
    preloadVideo,
    
    // Settings
    setVolume,
    toggleMute,
    seekTo,
    retry,
    setCrossfadeMode
  };
}
