// types/video.ts
export interface Video {
  id: string;
  title: string;
  artist: string;
  src: string;
  path?: string;
  file_path?: string;
  duration?: number;
  size?: number;
  album?: string;
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