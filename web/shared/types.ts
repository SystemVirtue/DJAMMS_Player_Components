/**
 * Supabase Database Types for DJAMMS Web Endpoints
 * Shared between Kiosk and Admin apps
 */

// ==================== Player State ====================

export interface SupabasePlayerState {
  id: string;
  player_id: string;
  status: 'idle' | 'playing' | 'paused' | 'buffering' | 'error';
  current_video_id: string | null;
  current_video_metadata: Record<string, unknown> | null;
  playback_position: number;
  video_duration: number;
  is_playing: boolean;
  volume_level: number;
  last_updated: string;
  session_start: string;
  created_at: string;
  is_online: boolean;
  now_playing_video: NowPlayingVideo | null;
  current_position: number;
  active_queue: QueueVideoItem[];
  priority_queue: QueueVideoItem[];
  queue_index: number; // Current position in active_queue
  volume: number;
  last_heartbeat: string;
}

export interface NowPlayingVideo {
  id: string;
  src: string;
  path: string;
  title: string;
  artist: string | null;
  sourceType: 'local' | 'youtube';
  duration?: number;
}

export interface QueueVideoItem {
  id: string;
  src: string;
  path: string;
  title: string;
  artist: string | null;
  sourceType: 'local' | 'youtube';
  duration?: number;
  playlist?: string;
  playlistDisplayName?: string;
}

// ==================== Commands ====================

export type CommandType = 
  | 'play'
  | 'pause'
  | 'resume'
  | 'skip'
  | 'setVolume'
  | 'seekTo'
  | 'queue_add'
  | 'queue_remove'
  | 'queue_clear'
  | 'queue_shuffle'
  | 'settings_update'
  | 'load_playlist';

export interface SupabaseCommand {
  id: string;
  player_id: string;
  command_type: CommandType;
  command_data: CommandPayload;
  issued_by: string;
  issued_at: string;
  executed_at: string | null;
  status: 'pending' | 'executed' | 'failed' | 'expired';
  execution_result: Record<string, unknown> | null;
  created_at: string;
}

export type CommandPayload = 
  | PlayCommandPayload
  | VolumeCommandPayload
  | SeekCommandPayload
  | QueueAddCommandPayload
  | QueueRemoveCommandPayload
  | LoadPlaylistCommandPayload
  | Record<string, unknown>;

export interface PlayCommandPayload {
  video?: QueueVideoItem;
  queueIndex?: number;
}

export interface VolumeCommandPayload {
  volume: number;
}

export interface SeekCommandPayload {
  position: number;
}

export interface QueueAddCommandPayload {
  video: QueueVideoItem;
  queueType: 'active' | 'priority';
  position?: number;
}

export interface QueueRemoveCommandPayload {
  videoId: string;
  queueType: 'active' | 'priority';
}

export interface LoadPlaylistCommandPayload {
  playlistName: string;
  shuffle?: boolean;
}

// ==================== Local Videos ====================

export interface SupabaseLocalVideo {
  id: string;
  player_id: string;
  title: string;
  artist: string | null;
  path: string;
  duration: number | null;
  is_available: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ==================== Realtime Subscription Types ====================

export interface RealtimePayload<T> {
  commit_timestamp: string;
  errors: null | string[];
  old: T | null;
  new: T | null;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
}

// ==================== Helper Types ====================

export interface VideoSearchResult {
  id: string;
  title: string;
  artist: string | null;
  path: string;
  duration: number | null;
  playlist?: string;
}
