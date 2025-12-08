// types/video.ts
export interface Video {
  id: string;
  title: string;
  artist: string | null; // null if filename doesn't conform to expected format
  src: string;
  path?: string;
  file_path?: string;
  duration?: number;
  size?: number;
  album?: string;
  playlist?: string; // Original folder name (may include YouTube Playlist ID prefix)
  playlistDisplayName?: string; // Display name without YouTube Playlist ID prefix
  filename?: string;
}

// ============================================================================
// CROSSFADE / VIDEO PLAYER TYPES
// ============================================================================

/**
 * Crossfade mode determines video transition behavior:
 * - 'manual': Videos play to completion, next starts immediately (clean cut)
 * - 'seamless': Next video starts X seconds before current ends (overlap crossfade)
 */
export type CrossfadeMode = 'manual' | 'seamless';

/**
 * Reason for a video transition - used for logging and debugging
 */
export type TransitionReason = 
  | 'natural_end'      // Video ended naturally
  | 'early_crossfade'  // Seamless mode: started overlap
  | 'user_skip'        // User pressed skip
  | 'manual_next'      // User pressed next/previous
  | 'error';           // Video error

/**
 * Configuration for useVideoPlayer hook
 */
export interface VideoPlayerConfig {
  videoRefs: React.RefObject<HTMLVideoElement>[];
  initialVolume?: number;
  crossfadeMode?: CrossfadeMode;
  crossfadeDuration?: number; // seconds (1-5s range, user configurable)
  onVideoEnd?: () => void;
  onError?: (error: string) => void;
  enableAudioNormalization?: boolean;
}

/**
 * Return type from useVideoPlayer hook
 */
export interface VideoPlayerReturn {
  // State
  currentVideo: Video | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  crossfadeMode: CrossfadeMode;
  
  // Playback controls
  playVideo: (video: Video) => void;
  pauseVideo: () => void;
  resumeVideo: () => void;
  skip: () => void;
  
  // Settings
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  seekTo: (time: number) => void;
  retry: () => void;
  setCrossfadeMode: (mode: CrossfadeMode) => void;
  
  // Direct access
  activeVideoElement: HTMLVideoElement | null;
}

export interface PlayerState {
  currentVideo: Video | null;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  duration: number;
  showNowPlaying: boolean;
}

export interface QueueState {
  activeQueue: Video[];
  priorityQueue: Video[];
  activeQueueSize: number;
  priorityQueueSize: number;
  stats: {
    videosPlayed: number;
    priorityVideosPlayed: number;
    errors: number;
  };
}

export interface PlayerConfig {
  crossfadeDuration?: number;
  skipFadeDuration?: number;
  nowPlayingDuration?: number;
  maxRetries?: number;
  enableIPC?: boolean;
  enableKeyboardControls?: boolean;
}

export interface IPCAdapter {
  send(channel: string, data?: any): void;
  on(channel: string, callback: (data?: any) => void): void;
  off(channel: string, callback: (data?: any) => void): void;
}

export interface VideoRefs {
  videoA: React.RefObject<HTMLVideoElement>;
  videoB: React.RefObject<HTMLVideoElement>;
  activeVideo: React.RefObject<HTMLVideoElement>;
  inactiveVideo: React.RefObject<HTMLVideoElement>;
}