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

  const [activeVideoRef, setActiveVideoRef] = useState<React.RefObject<HTMLVideoElement>>(videoARef);
  const [inactiveVideoRef, setInactiveVideoRef] = useState<React.RefObject<HTMLVideoElement>>(videoBRef);

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
        onVideoEnd?.();
        ipcAdapter.send('playback-ended', {
          videoId: currentVideo?.id,
          title: currentVideo?.title
        });
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
    };

    const handleTimeUpdate = (video: HTMLVideoElement) => {
      if (video === activeVideoRef.current && isPlaying) {
        setCurrentTime(video.currentTime);
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
  }, [activeVideoRef, currentVideo, ipcAdapter, onVideoEnd, isPlaying]);

  const handleVideoError = useCallback((video: HTMLVideoElement, error: Event) => {
    console.error('[useVideoPlayer] Handling video error, retry:', retryCountRef.current);

    const errorMessage = `Failed to play: ${currentVideo?.title || 'Unknown'}`;
    setError(errorMessage);
    onError?.(errorMessage);

    // Skip to next video after error
    setTimeout(() => {
      onVideoEnd?.();
    }, 2000);
  }, [currentVideo, onVideoEnd, onError]);

  const playVideo = useCallback((video: Video) => {
    console.log('[useVideoPlayer] Playing video:', video.title, 'by', video.artist);

    setCurrentVideo(video);
    setIsLoading(true);
    setError(null);

    // Reset normalization for new video
    normalizationFactorRef.current = 1.0;
    isAnalyzingRef.current = false;

    retryCountRef.current = 0;

    // Get video path
    const videoPath = video.src || video.path || video.file_path;
    if (!videoPath) {
      console.error('[useVideoPlayer] No video path found in video object:', video);
      setError('No video path');
      setIsLoading(false);
      return;
    }

    const videoSrc = videoPath.startsWith('http://') || videoPath.startsWith('https://') || videoPath.startsWith('/playlist/')
      ? videoPath.startsWith('/playlist/')
        ? `http://localhost:3000${videoPath}`
        : videoPath
      : videoPath.startsWith('file://')
        ? videoPath
        : `file://${videoPath}`;
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
    if (!activeVideo) return;

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
          console.error('[useVideoPlayer] Play failed:', error.message);
          // Try to play muted first
          activeVideo.muted = true;
          activeVideo.play()
            .then(() => {
              console.log('[useVideoPlayer] Playing muted due to autoplay policy');
              setTimeout(() => {
                activeVideo.muted = false;
              }, 100);
            })
            .catch(e => handleVideoError(activeVideo, e));
        });
    }
  }, [activeVideoRef, inactiveVideoRef, volume, handleVideoError, enableAudioNormalization, initializeAudioAnalysis, analyzeVolume]);

  const crossfadeToVideo = useCallback(async (videoSrc: string) => {
    const activeVideo = activeVideoRef.current;
    const inactiveVideo = inactiveVideoRef.current;

    if (!activeVideo || !inactiveVideo) return;

    console.log('[useVideoPlayer] Starting crossfade to:', videoSrc);

    // Preload in inactive video
    inactiveVideo.src = videoSrc;
    // Ensure it has the target volume immediately so the audio is present from the start
    const targetVolume = volume;
    inactiveVideo.volume = targetVolume;
    inactiveVideo.load();

    // Wait for canplaythrough
    await new Promise<void>((resolve) => {
      const handleCanPlay = () => {
        inactiveVideo.removeEventListener('canplaythrough', handleCanPlay);
        resolve();
      };
      inactiveVideo.addEventListener('canplaythrough', handleCanPlay);
    });

    // Start playing inactive video. If the browser blocks autoplay for unmuted playback,
    // fall back to a muted-play and then unmute so audio is audible as soon as possible.
    try {
      const playPromise = inactiveVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(async (err) => {
          console.warn('[useVideoPlayer] crossfade play blocked, attempting muted play', err);
          try {
            inactiveVideo.muted = true;
            await inactiveVideo.play();
            // Unmute once playing if permitted
            inactiveVideo.muted = false;
            inactiveVideo.volume = targetVolume;
          } catch (err2) {
            console.error('[useVideoPlayer] muted crossfade play failed', err2);
          }
        });
      }
    } catch (err) {
      console.warn('[useVideoPlayer] play() threw:', err);
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
        // Swap references
        const oldActive = activeVideoRef;
        setActiveVideoRef(inactiveVideoRef);
        setInactiveVideoRef(oldActive);

        // Reset old active video
        activeVideo.pause();
        activeVideo.currentTime = 0;
        activeVideo.volume = targetVolume;

        setIsPlaying(true);
        setIsLoading(false);

        console.log('[useVideoPlayer] Crossfade complete');
      }
    };

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