// hooks/useVideoPlayer.ts
// REFACTORED: Supports both Manual and Seamless crossfade modes
// Manual: Videos play to completion, next starts immediately (clean cut)
// Seamless: Next video starts X seconds before current ends (overlap crossfade)

import { useState, useRef, useCallback, useEffect } from 'react';
import { Video, PlayerState, VideoRefs, CrossfadeMode, TransitionReason } from '../types';
import { createIPCAdapter } from '../utils/ipc';

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
      console.log(`[TRANSITION] Already in progress, ignoring ${reason} trigger`);
      return;
    }
    
    console.log(`[TRANSITION] Starting transition (reason: ${reason})`);
    transitionLockRef.current = true;
    
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
      console.log(`[TRANSITION] Lock released`);
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
      console.log(`[SEAMLESS] Early crossfade trigger: ${remainingTime.toFixed(2)}s remaining`);
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
      console.log('[EVENT] Ignoring stale ended event');
      return;
    }
    
    // In seamless mode, if early crossfade already triggered, don't trigger again
    if (crossfadeModeRef.current === 'seamless' && earlyCrossfadeTriggeredRef.current) {
      console.log('[EVENT] Video ended - early crossfade already handled');
      return;
    }
    
    // Debounce rapid end events
    const now = Date.now();
    if (now - lastVideoEndTimeRef.current < VIDEO_END_DEBOUNCE_MS) {
      console.log('[EVENT] Video ended event debounced');
      return;
    }
    lastVideoEndTimeRef.current = now;
    
    console.log('[EVENT] Video ended naturally');
    transitionToNext('natural_end');
    
  }, [currentVideo, transitionToNext, getActiveVideo]);

  const handleVideoError = useCallback((video: HTMLVideoElement, error: Event) => {
    console.error('[ERROR] Video playback error:', error);
    
    setIsLoading(false);
    isLoadingRef.current = false;
    
    const errorMessage = `Failed to play: ${currentVideo?.title || 'Unknown'}`;
    setError(errorMessage);
    onError?.(errorMessage);
    
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
    const videoPath = video.src || video.path || (video as any).file_path;
    if (!videoPath) {
      throw new Error('No video path found');
    }

    // Already an HTTP URL
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      return videoPath;
    }

    // Get current origin for relative URLs
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

    // Proxy path - use current origin
    if (videoPath.startsWith('/playlist/')) {
      return `${origin}${videoPath}`;
    }

    // Electron detection
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    const isDevMode = origin.startsWith('http://localhost');

    // Electron production - can use file://
    if (isElectron && !isDevMode) {
      return videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`;
    }

    // Web or Electron dev - convert to proxy URL
    const playlistMatch = videoPath.match(/PLAYLISTS\/([^\/]+)\/([^\/]+)$/);
    if (playlistMatch) {
      const [, playlistName, fileName] = playlistMatch;
      return `${origin}/playlist/${encodeURIComponent(playlistName)}/${encodeURIComponent(fileName)}`;
    }

    console.warn('[VIDEO] Cannot convert local path to proxy URL:', videoPath);
    return videoPath;
  }, []);

  // ============================================================================
  // PLAYBACK FUNCTIONS
  // ============================================================================
  
  /**
   * Play video in manual mode (no crossfade, immediate cut)
   */
  const playVideoManual = useCallback((video: Video) => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) return;

    console.log('[MANUAL] Playing video:', video.title);

    const videoSrc = getVideoSource(video);
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

    const playPromise = activeVideo.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[MANUAL] Playback started');
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
            console.log('[MANUAL] Play interrupted (expected during rapid switching)');
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
  }, [volume, getVideoSource, getActiveVideo, getInactiveVideo, handleVideoError, enableAudioNormalization, initializeAudioAnalysis, analyzeVolume]);

  /**
   * Play video in seamless mode (crossfade from current video)
   */
  const playVideoSeamless = useCallback((video: Video) => {
    const currentActive = getActiveVideo();
    const nextActive = getInactiveVideo();
    
    if (!currentActive || !nextActive) return;

    console.log('[SEAMLESS] Starting crossfade to:', video.title);
    isCrossfadingRef.current = true;

    const videoSrc = getVideoSource(video);
    
    // Load next video into inactive element
    nextActive.src = videoSrc;
    nextActive.volume = volume;
    nextActive.style.zIndex = '5'; // Below current but visible during transition
    
    // Start playing the next video (will be behind current)
    const playPromise = nextActive.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[SEAMLESS] Next video loaded, starting crossfade');
          
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
            console.log('[SEAMLESS] Crossfade complete');
          }, crossfadeDuration * 1000);
        })
        .catch(error => {
          isCrossfadingRef.current = false;
          
          if (error.name === 'AbortError') {
            console.log('[SEAMLESS] Play interrupted');
            return;
          }
          
          console.error('[SEAMLESS] Crossfade failed, falling back to manual:', error);
          // Fallback to manual mode
          playVideoManual(video);
        });
    }
  }, [volume, crossfadeDuration, getVideoSource, getActiveVideo, getInactiveVideo, swapActiveVideo, playVideoManual]);

  /**
   * Main play video function - routes to appropriate mode
   */
  const playVideo = useCallback((video: Video) => {
    const videoId = video.id || video.path || video.src || '';
    
    // Prevent duplicate play requests
    if (isLoadingRef.current && lastPlayRequestRef.current === videoId) {
      console.log('[PLAY] Skipping duplicate play request for:', video.title);
      return;
    }

    console.log(`[PLAY] Playing video in ${crossfadeModeRef.current} mode:`, video.title);
    
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
      console.log('[SKIP] Transition in progress, ignoring');
      return;
    }
    
    const activeVideo = getActiveVideo();
    if (!activeVideo) {
      transitionToNext('user_skip');
      return;
    }

    console.log('[SKIP] User skip - fading out');
    transitionLockRef.current = true;
    isCrossfadingRef.current = true;

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
        
        console.log('[SKIP] Fade complete, advancing to next');
        
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
    if (activeVideo) {
      activeVideo.currentTime = time;
      setCurrentTime(time);
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
    console.log(`[MODE] Switching to ${mode} mode`);
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
      console.log(`[PRELOAD] Preloading: ${video.title}`);
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
