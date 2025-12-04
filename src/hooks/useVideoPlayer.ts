// hooks/useVideoPlayer.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { Video, PlayerState, PlayerConfig, VideoRefs } from '../types';
import { createIPCAdapter } from '../utils/ipc';

interface VideoPlayerConfig {
  videoRefs: React.RefObject<HTMLVideoElement>[];
  initialVolume?: number;
  onVideoEnd?: () => void;
  onError?: (error: string) => void;
  enableAudioNormalization?: boolean;
  fadeDuration?: number; // seconds
}

export function useVideoPlayer(config: VideoPlayerConfig) {
  const { videoRefs, initialVolume = 0.7, onVideoEnd, onError, enableAudioNormalization = false } = config;
  const { fadeDuration = 0.5 } = config;

  const videoARef = videoRefs[0] || useRef<HTMLVideoElement>(null);
  const videoBRef = videoRefs[1] || useRef<HTMLVideoElement>(null);

  // Use refs instead of state for active/inactive tracking to avoid async state update issues
  // This ensures skip operations always target the correct video element
  const activeVideoRefRef = useRef<React.RefObject<HTMLVideoElement>>(videoARef);
  const inactiveVideoRefRef = useRef<React.RefObject<HTMLVideoElement>>(videoBRef);
  
  // Expose current refs via getters for components that need them
  const activeVideoRef = activeVideoRefRef.current;
  const inactiveVideoRef = inactiveVideoRefRef.current;
  
  // State to trigger re-renders when active video changes (for UI updates)
  const [, forceUpdate] = useState(0);

  const videoRefsObj: VideoRefs = {
    videoA: videoARef,
    videoB: videoBRef,
    activeVideo: activeVideoRef,
    inactiveVideo: inactiveVideoRef
  };

  // Player state
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(false);

  // IPC adapter
  const ipcAdapter = createIPCAdapter(true);

  // Web Audio API for volume normalization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const normalizationFactorRef = useRef<number>(1.0);
  const isAnalyzingRef = useRef<boolean>(false);

  // Retry tracking
  const retryCountRef = useRef(0);
  const retryDelayRef = useRef(1000);

  // Prevent rapid re-triggering of playVideo
  const isLoadingRef = useRef(false);
  const lastPlayRequestRef = useRef<string | null>(null);
  const playDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Track whether we've already triggered the early crossfade for this video
  // This prevents double-triggering (once at fade point, once at actual end)
  const crossfadeTriggeredRef = useRef(false);

  // Debounce protection for video end events to prevent infinite loop on video load failure
  const lastVideoEndTimeRef = useRef(0);
  const VIDEO_END_DEBOUNCE_MS = 500;

  // Track if we're currently in a crossfade to allow dual-play during that time
  const isCrossfadingRef = useRef(false);

  // Dual-play detection - check if both videos are playing simultaneously outside of crossfade
  const dualPlayCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Web Audio API functions for volume normalization
  const initializeAudioAnalysis = useCallback(() => {
    if (!enableAudioNormalization || !activeVideoRef.current || audioContextRef.current) return;

    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaElementSource(activeVideoRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    } catch (error) {
      console.warn('[useVideoPlayer] Web Audio API not supported:', error);
    }
  }, [enableAudioNormalization, activeVideoRef]);

  const calculateRMS = useCallback((buffer: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = (buffer[i] - 128) / 128; // Convert to -1 to 1 range
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }, []);

  const analyzeVolume = useCallback(() => {
    if (!enableAudioNormalization || !analyserRef.current || isAnalyzingRef.current) return;

    isAnalyzingRef.current = true;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let totalRMS = 0;
    let sampleCount = 0;
    const targetRMS = 0.1; // Target RMS level (adjust as needed)

    const analyze = () => {
      if (sampleCount >= 60) { // Analyze for ~1 second at 60fps
        const averageRMS = totalRMS / sampleCount;
        normalizationFactorRef.current = targetRMS / averageRMS;
        normalizationFactorRef.current = Math.max(0.1, Math.min(2.0, normalizationFactorRef.current)); // Clamp between 0.1 and 2.0
        isAnalyzingRef.current = false;
        return;
      }

      analyserRef.current!.getByteTimeDomainData(dataArray);
      const rms = calculateRMS(dataArray);
      totalRMS += rms;
      sampleCount++;

      requestAnimationFrame(analyze);
    };

    analyze();
  }, [enableAudioNormalization, calculateRMS]);

  const applyNormalization = useCallback(() => {
    if (!enableAudioNormalization || !activeVideoRef.current) return;

    const normalizedVolume = Math.min(1.0, volume * normalizationFactorRef.current);
    activeVideoRef.current.volume = normalizedVolume;
  }, [enableAudioNormalization, volume, activeVideoRef]);

  // Initialize video elements
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;

    if (videoA && videoB) {
      // Style video elements
      const durationMs = Math.max(100, Math.round((fadeDuration || 0.5) * 1000));
      [videoA, videoB].forEach(video => {
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = 'black';
        video.style.transition = `opacity ${durationMs}ms ease-in-out`;
        video.volume = volume;
      });

      // Initially hide video B
      videoB.style.opacity = '0';
      videoA.style.opacity = '1';
    }
  }, [volume, fadeDuration]);

  // Video event listeners
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;

    if (!videoA || !videoB) return;

    const handleVideoEnd = (video: HTMLVideoElement) => {
      if (video === activeVideoRef.current) {
        // DEBOUNCE: Prevent rapid-fire video end events (e.g., from failed video loads)
        const now = Date.now();
        const timeSinceLastEnd = now - lastVideoEndTimeRef.current;
        
        if (timeSinceLastEnd < VIDEO_END_DEBOUNCE_MS) {
          console.warn('[useVideoPlayer] Video end debounced - too rapid (' + timeSinceLastEnd + 'ms since last end)');
          return;
        }
        lastVideoEndTimeRef.current = now;
        
        // Only trigger onVideoEnd if we haven't already triggered it via early crossfade
        if (!crossfadeTriggeredRef.current) {
          console.log('[useVideoPlayer] Video ended naturally (no early crossfade)');
          onVideoEnd?.();
          ipcAdapter.send('playback-ended', {
            videoId: currentVideo?.id,
            title: currentVideo?.title
          });
        } else {
          console.log('[useVideoPlayer] Video ended after crossfade already triggered - ignoring');
        }
      }
    };

    const handleError = (video: HTMLVideoElement, error: Event) => {
      const errorCode = (video as any).error ? (video as any).error.code : 'unknown';
      const errorMessage = (video as any).error ? (video as any).error.message : 'Unknown error';
      console.error('[useVideoPlayer] Video error:', errorCode, errorMessage);
      handleVideoError(video, error);
    };

    const handleLoadedMetadata = (video: HTMLVideoElement) => {
      setDuration(video.duration);
      // Reset crossfade trigger flag when new video metadata loads
      crossfadeTriggeredRef.current = false;
    };

    const handleTimeUpdate = (video: HTMLVideoElement) => {
      if (video === activeVideoRef.current && isPlaying) {
        const currentTimeValue = video.currentTime;
        const durationValue = video.duration;
        
        setCurrentTime(currentTimeValue);
        
        // Check if we should trigger early crossfade
        // Trigger when currentTime reaches (duration - fadeDuration)
        // Only trigger once per video (checked via crossfadeTriggeredRef)
        if (
          !crossfadeTriggeredRef.current &&
          durationValue > 0 &&
          fadeDuration > 0 &&
          currentTimeValue >= (durationValue - fadeDuration) &&
          currentTimeValue < durationValue // Ensure we're not past the end
        ) {
          console.log(`[useVideoPlayer] Early crossfade trigger at ${currentTimeValue.toFixed(2)}s (duration: ${durationValue.toFixed(2)}s, fadeDuration: ${fadeDuration}s)`);
          crossfadeTriggeredRef.current = true;
          
          // Trigger onVideoEnd to request the next video
          // The parent component should call playVideo() with the next video,
          // which will use crossfadeToVideo() since isPlaying is true
          onVideoEnd?.();
          ipcAdapter.send('playback-ended', {
            videoId: currentVideo?.id,
            title: currentVideo?.title
          });
        }
      }
    };

    const handleCanPlayThrough = () => {
      setIsLoading(false);
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    // Add event listeners
    [videoA, videoB].forEach(video => {
      video.addEventListener('ended', () => handleVideoEnd(video));
      video.addEventListener('error', (e) => handleError(video, e));
      video.addEventListener('loadedmetadata', () => handleLoadedMetadata(video));
      video.addEventListener('timeupdate', () => handleTimeUpdate(video));
      video.addEventListener('canplaythrough', handleCanPlayThrough);
      video.addEventListener('playing', handlePlaying);
    });

    return () => {
      [videoA, videoB].forEach(video => {
        video.removeEventListener('ended', () => handleVideoEnd(video));
        video.removeEventListener('error', (e) => handleError(video, e));
        video.removeEventListener('loadedmetadata', () => handleLoadedMetadata(video));
        video.removeEventListener('timeupdate', () => handleTimeUpdate(video));
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('playing', handlePlaying);
      });
    };
  }, [activeVideoRef, currentVideo, ipcAdapter, onVideoEnd, isPlaying, fadeDuration]);

  const handleVideoError = useCallback((video: HTMLVideoElement, error: Event) => {
    console.error('[useVideoPlayer] Handling video error, retry:', retryCountRef.current);

    setIsLoading(false); // Reset loading state on error

    const errorMessage = `Failed to play: ${currentVideo?.title || 'Unknown'}`;
    setError(errorMessage);
    onError?.(errorMessage);

    // Skip to next video after error
    setTimeout(() => {
      onVideoEnd?.();
    }, 2000);
  }, [currentVideo, onVideoEnd, onError]);

  const playVideo = useCallback((video: Video) => {
    const videoId = video.id || video.path || video.src || '';
    
    // Prevent duplicate play requests for the same video
    if (isLoadingRef.current && lastPlayRequestRef.current === videoId) {
      console.log('[useVideoPlayer] Skipping duplicate play request for:', video.title);
      return;
    }

    // Clear any pending debounced play
    if (playDebounceRef.current) {
      clearTimeout(playDebounceRef.current);
    }

    // Mark as loading immediately using ref (sync)
    isLoadingRef.current = true;
    lastPlayRequestRef.current = videoId;

    console.log('[useVideoPlayer] Playing video:', video.title, 'by', video.artist);

    setCurrentVideo(video);
    setIsLoading(true);
    setError(null);

    // Reset normalization for new video
    normalizationFactorRef.current = 1.0;
    isAnalyzingRef.current = false;
    
    // Reset crossfade trigger flag for the new video
    crossfadeTriggeredRef.current = false;

    retryCountRef.current = 0;

    // Get video path
    const videoPath = video.src || video.path || video.file_path;
    if (!videoPath) {
      console.error('[useVideoPlayer] No video path found in video object:', video);
      setError('No video path');
      setIsLoading(false);
      isLoadingRef.current = false;
      return;
    }

    // Detect if we're in Electron (can use file://) or web browser (need http proxy)
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
    
    // Get the current origin for relative URLs (handles port changes)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    
    // Check if we're in dev mode (loaded from localhost) - even in Electron, we need to use
    // the Vite proxy for local files because file:// URLs are blocked for security
    const isDevMode = origin.startsWith('http://localhost');
    
    let videoSrc: string;
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      // Already an HTTP URL
      videoSrc = videoPath;
    } else if (videoPath.startsWith('/playlist/')) {
      // Vite proxy path - use current origin for proper port handling
      videoSrc = `${origin}${videoPath}`;
    } else if (isElectron && !isDevMode) {
      // In production Electron (loaded from file://), we can use file:// URLs
      videoSrc = videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`;
    } else {
      // In web browser OR Electron dev mode, convert local path to Vite proxy URL
      // Extract playlist name and filename from path like /Users/.../PLAYLISTS/PlaylistName/filename.mp4
      const playlistMatch = videoPath.match(/PLAYLISTS\/([^\/]+)\/([^\/]+)$/);
      if (playlistMatch) {
        const [, playlistName, fileName] = playlistMatch;
        videoSrc = `${origin}/playlist/${encodeURIComponent(playlistName)}/${encodeURIComponent(fileName)}`;
      } else {
        // Fallback - this won't work in browser but log it
        console.warn('[useVideoPlayer] Cannot convert local path to proxy URL:', videoPath);
        videoSrc = videoPath;
      }
    }
    console.log('[useVideoPlayer] Video source:', videoSrc);

    // Use crossfade if already playing
    if (isPlaying && activeVideoRef.current) {
      crossfadeToVideo(videoSrc);
    } else {
      directPlay(videoSrc);
    }
  }, [isPlaying, activeVideoRef]);

  const directPlay = useCallback((videoSrc: string) => {
    const activeVideo = activeVideoRef.current;
    if (!activeVideo) {
      isLoadingRef.current = false;
      return;
    }

    console.log('[useVideoPlayer] Direct play:', videoSrc);

    activeVideo.src = videoSrc;
    activeVideo.style.opacity = '1';
    activeVideo.volume = volume;
    activeVideo.style.display = 'block';

    if (inactiveVideoRef.current) {
      inactiveVideoRef.current.style.opacity = '0';
    }

    const playPromise = activeVideo.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[useVideoPlayer] Playback started successfully');
          setIsPlaying(true);
          setIsLoading(false);
          isLoadingRef.current = false;

          // Initialize audio analysis if enabled
          if (enableAudioNormalization) {
            initializeAudioAnalysis();
            // Start volume analysis after a short delay
            setTimeout(() => {
              analyzeVolume();
            }, 500);
          }
        })
        .catch(error => {
          // Check if it's the "interrupted by new load" error - this is expected during rapid switching
          if (error.name === 'AbortError' || error.message?.includes('interrupted')) {
            console.log('[useVideoPlayer] Play request was interrupted (expected during rapid switching)');
            // Don't treat this as an error - a new video is loading
            return;
          }
          
          console.error('[useVideoPlayer] Play failed:', error.message);
          // Try to play muted first (for autoplay policy)
          activeVideo.muted = true;
          activeVideo.play()
            .then(() => {
              console.log('[useVideoPlayer] Playing muted due to autoplay policy');
              setIsPlaying(true);
              setIsLoading(false);
              isLoadingRef.current = false;
              setTimeout(() => {
                activeVideo.muted = false;
              }, 100);
            })
            .catch(e => {
              isLoadingRef.current = false;
              handleVideoError(activeVideo, e);
            });
        });
    }
  }, [activeVideoRef, inactiveVideoRef, volume, handleVideoError, enableAudioNormalization, initializeAudioAnalysis, analyzeVolume]);

  const crossfadeToVideo = useCallback(async (videoSrc: string) => {
    const activeVideo = activeVideoRef.current;
    const inactiveVideo = inactiveVideoRef.current;

    if (!activeVideo || !inactiveVideo) {
      console.error('[useVideoPlayer] crossfadeToVideo failed: video elements not available');
      return;
    }

    console.log('[useVideoPlayer] 🎬 Starting crossfade to:', videoSrc);
    const crossfadeStartTime = Date.now();

    // Preload in inactive video
    inactiveVideo.src = videoSrc;
    // Ensure it has the target volume immediately so the audio is present from the start
    const targetVolume = volume;
    inactiveVideo.volume = targetVolume;
    inactiveVideo.load();

    // Wait for canplaythrough with a timeout to prevent hanging
    const CANPLAY_TIMEOUT_MS = 10000; // 10 second timeout
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          const handleCanPlay = () => {
            inactiveVideo.removeEventListener('canplaythrough', handleCanPlay);
            inactiveVideo.removeEventListener('error', handleError);
            console.log('[useVideoPlayer] ✅ canplaythrough fired after', Date.now() - crossfadeStartTime, 'ms');
            resolve();
          };
          const handleError = (e: Event) => {
            inactiveVideo.removeEventListener('canplaythrough', handleCanPlay);
            inactiveVideo.removeEventListener('error', handleError);
            console.error('[useVideoPlayer] ❌ Video load error during crossfade:', e);
            throw new Error('Video load failed during crossfade');
          };
          inactiveVideo.addEventListener('canplaythrough', handleCanPlay);
          inactiveVideo.addEventListener('error', handleError);
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            console.error('[useVideoPlayer] ⏰ canplaythrough timeout after', CANPLAY_TIMEOUT_MS, 'ms');
            reject(new Error('Timeout waiting for video to load'));
          }, CANPLAY_TIMEOUT_MS);
        })
      ]);
    } catch (error) {
      console.error('[useVideoPlayer] ❌ Crossfade preload failed:', error);
      isCrossfadingRef.current = false;
      // Trigger video error handling to skip to next
      handleVideoError(inactiveVideo, error as Event);
      return;
    }

    // Start playing inactive video. If the browser blocks autoplay for unmuted playback,
    // fall back to a muted-play and then unmute so audio is audible as soon as possible.
    try {
      console.log('[useVideoPlayer] 🎵 Starting playback of incoming video...');
      const playPromise = inactiveVideo.play();
      if (playPromise !== undefined) {
        await playPromise.catch(async (err) => {
          console.warn('[useVideoPlayer] crossfade play blocked, attempting muted play', err);
          try {
            inactiveVideo.muted = true;
            await inactiveVideo.play();
            // Unmute once playing if permitted
            inactiveVideo.muted = false;
            inactiveVideo.volume = targetVolume;
            console.log('[useVideoPlayer] ✅ Muted play succeeded, unmuted');
          } catch (err2) {
            console.error('[useVideoPlayer] ❌ muted crossfade play failed', err2);
            throw err2; // Re-throw to be caught by outer catch
          }
        });
      }
    } catch (err) {
      console.error('[useVideoPlayer] ❌ play() failed completely:', err);
      isCrossfadingRef.current = false;
      handleVideoError(inactiveVideo, err as Event);
      return;
    }

    // Perform crossfade: only fade OUT the active video (audio+video), while the incoming
    // video is visible/audio-at-normal-volume immediately (so we don't miss the start of audio).
    const startActiveVolume = activeVideo.volume;
    const startTime = Date.now();
    const durationMs = Math.max(100, Math.round((fadeDuration || 0.5) * 1000));

    const fadeStep = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Fade in inactive video visually
      inactiveVideo.style.opacity = progress.toString();

      // Fade out active video (both opacity and audio)
      const fadeOutProgress = 1 - progress;
      activeVideo.style.opacity = fadeOutProgress.toString();
      activeVideo.volume = startActiveVolume * fadeOutProgress;

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        // Crossfade complete - clear the flag
        isCrossfadingRef.current = false;
        
        // Swap references synchronously using refs
        const oldActive = activeVideoRefRef.current;
        activeVideoRefRef.current = inactiveVideoRefRef.current;
        inactiveVideoRefRef.current = oldActive;
        
        // Force a re-render so UI components get updated refs
        forceUpdate(n => n + 1);

        // Reset old active video
        activeVideo.pause();
        activeVideo.currentTime = 0;
        activeVideo.volume = targetVolume;

        setIsPlaying(true);
        setIsLoading(false);
        isLoadingRef.current = false;

        const totalCrossfadeTime = Date.now() - crossfadeStartTime;
        console.log('[useVideoPlayer] ✅ Crossfade complete in', totalCrossfadeTime, 'ms, swapped active video to:', activeVideoRefRef.current === videoARef ? 'A' : 'B');
      }
    };

    // Mark that we're starting a crossfade
    isCrossfadingRef.current = true;
    requestAnimationFrame(fadeStep);
  }, [activeVideoRef, inactiveVideoRef, volume, fadeDuration]);

  const pauseVideo = useCallback(() => {
    const activeVideo = activeVideoRef.current;
    if (activeVideo) {
      activeVideo.pause();
      setIsPlaying(false);
    }
  }, [activeVideoRef]);

  const resumeVideo = useCallback(() => {
    const activeVideo = activeVideoRef.current;
    if (activeVideo && currentVideo) {
      activeVideo.play().then(() => {
        setIsPlaying(true);
      }).catch(error => {
        console.error('[useVideoPlayer] Resume failed:', error.message);
      });
    }
  }, [activeVideoRef, currentVideo]);

  const setVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);

    [videoARef.current, videoBRef.current].forEach(video => {
      if (video) video.volume = clampedVolume;
    });

    // Save volume preference
    ipcAdapter.send('save-volume', clampedVolume);

    console.log('[useVideoPlayer] Volume set to:', clampedVolume);
  }, [ipcAdapter]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    [videoARef.current, videoBRef.current].forEach(video => {
      if (video) video.muted = newMuted;
    });

    // Save mute state
    ipcAdapter.send('save-mute', newMuted);

    console.log('[useVideoPlayer] Mute toggled:', newMuted);
  }, [isMuted, ipcAdapter]);

  const seekTo = useCallback((time: number) => {
    const activeVideo = activeVideoRef.current;
    if (activeVideo) {
      activeVideo.currentTime = time;
      setCurrentTime(time);
    }
  }, [activeVideoRef]);

  const retry = useCallback(() => {
    if (currentVideo) {
      playVideo(currentVideo);
    }
  }, [currentVideo, playVideo]);

  const preloadVideo = useCallback((video: Video) => {
    if (!video) return;

    const videoPath = video.src || video.path || (video as any).file_path;
    if (!videoPath) return;

    const videoSrc = videoPath.startsWith('http://') || videoPath.startsWith('https://') || videoPath.startsWith('/playlist/')
      ? videoPath.startsWith('/playlist/')
        ? `http://localhost:3000${videoPath}`
        : videoPath
      : videoPath.startsWith('file://')
        ? videoPath
        : `file://${videoPath}`;

    const inactiveVideo = inactiveVideoRef.current;
    if (inactiveVideo) {
      try {
        inactiveVideo.src = videoSrc;
        inactiveVideo.load();
      } catch (error) {
        console.warn('[useVideoPlayer] preload failed', error);
      }
    }
  }, [inactiveVideoRef]);

  // Apply volume normalization periodically during playback
  useEffect(() => {
    if (!enableAudioNormalization) return;

    const interval = setInterval(() => {
      if (activeVideoRef.current && activeVideoRef.current.currentTime > 1 && !isAnalyzingRef.current) {
        applyNormalization();
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [enableAudioNormalization, applyNormalization, activeVideoRef]);

  // SAFEGUARD: Detect and handle dual-play situations (both videos playing outside of crossfade)
  // This prevents state desync and ensures only the active video is playing
  useEffect(() => {
    const checkDualPlay = () => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;
      const activeVideo = activeVideoRefRef.current.current;
      const inactiveVideo = inactiveVideoRefRef.current.current;
      
      if (!videoA || !videoB) return;
      
      // Check if both videos are playing
      const videoAPlaying = !videoA.paused && !videoA.ended && videoA.currentTime > 0;
      const videoBPlaying = !videoB.paused && !videoB.ended && videoB.currentTime > 0;
      
      // If both are playing and we're NOT in a crossfade, this is an error state
      if (videoAPlaying && videoBPlaying && !isCrossfadingRef.current) {
        console.warn('[useVideoPlayer] ⚠️ DUAL-PLAY DETECTED: Both videos playing outside of crossfade!');
        console.warn('[useVideoPlayer] Active video:', activeVideo === videoA ? 'A' : 'B');
        console.warn('[useVideoPlayer] Video A playing:', videoAPlaying, 'time:', videoA.currentTime.toFixed(2));
        console.warn('[useVideoPlayer] Video B playing:', videoBPlaying, 'time:', videoB.currentTime.toFixed(2));
        
        // Determine which video should be stopped (the inactive one)
        const videoToStop = inactiveVideo;
        
        if (videoToStop) {
          console.log('[useVideoPlayer] 🛑 Stopping incorrectly playing video with fade-out');
          
          // Fade out the incorrect video over 500ms
          const startVolume = videoToStop.volume;
          const fadeStartTime = Date.now();
          const fadeDurationMs = 500;
          
          const fadeOutStep = () => {
            const elapsed = Date.now() - fadeStartTime;
            const progress = Math.min(elapsed / fadeDurationMs, 1);
            
            // Fade out volume and opacity
            videoToStop.volume = startVolume * (1 - progress);
            videoToStop.style.opacity = (1 - progress).toString();
            
            if (progress < 1) {
              requestAnimationFrame(fadeOutStep);
            } else {
              // Fade complete - stop the video
              videoToStop.pause();
              videoToStop.currentTime = 0;
              videoToStop.volume = volume; // Reset volume for next use
              videoToStop.style.opacity = '0';
              console.log('[useVideoPlayer] ✅ Incorrectly playing video stopped and reset');
              
              // Ensure active video is at full opacity and volume
              if (activeVideo) {
                activeVideo.style.opacity = '1';
                activeVideo.volume = volume;
              }
            }
          };
          
          requestAnimationFrame(fadeOutStep);
        }
      }
    };
    
    // Check every 500ms for dual-play situations
    dualPlayCheckIntervalRef.current = setInterval(checkDualPlay, 500);
    
    return () => {
      if (dualPlayCheckIntervalRef.current) {
        clearInterval(dualPlayCheckIntervalRef.current);
        dualPlayCheckIntervalRef.current = null;
      }
    };
  }, [volume]);

  return {
    currentVideo,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    volume,
    isMuted,
    activeVideoElement: activeVideoRef.current,
    playVideo,
    pauseVideo,
    resumeVideo,
    preloadVideo,
    setVolume,
    toggleMute,
    seekTo,
    retry
  };
}