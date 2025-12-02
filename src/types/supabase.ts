/**
 * Supabase Database Types for DJAMMS Player
 * These types mirror the existing Supabase schema: DJAMMS_Obie_Server
 */

// ==================== Player State ====================

export interface SupabasePlayerState {
  id: string; // UUID
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
  | Record<string, unknown>; // Generic fallback

export interface PlayCommandPayload {
  video?: QueueVideoItem;
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
  position?: number; // Optional position, defaults to end
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

// ==================== Kiosk Requests ====================

export interface SupabaseKioskRequest {
  id: string;
  kiosk_id: string;
  video_source: string;
  video_metadata: Record<string, unknown> | null;
  user_context: Record<string, unknown> | null;
  priority_score: number;
  status: 'requested' | 'queued' | 'playing' | 'played' | 'rejected';
  requested_at: string;
  queued_at: string | null;
  played_at: string | null;
  rejection_reason: string | null;
  queue_position: number | null;
  session_id: string | null;
  created_at: string;
}

// ==================== Priority Requests ====================

export interface SupabasePriorityRequest {
  id: string;
  video_source: string;
  video_metadata: Record<string, unknown> | null;
  user_id: string | null;
  user_context: Record<string, unknown> | null;
  status: 'queued' | 'playing' | 'played' | 'rejected' | 'expired';
  priority_score: number;
  requested_at: string;
  played_at: string | null;
  rejection_reason: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ==================== Videos (Master Catalog) ====================

export interface SupabaseVideo {
  id: string;
  title: string;
  artist: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  source: string | null;
  source_type: 'youtube' | 'local';
  local_file_path: string | null;
  file_metadata: Record<string, unknown> | null;
  quality_score: number;
  content_status: 'pending' | 'approved' | 'rejected';
  moderation_notes: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
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

// ==================== Service Configuration ====================

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string; // Optional - only for server-side operations
  playerId: string;
}

// ==================== Event Types for IPC ====================

export interface CommandReceivedEvent {
  command: SupabaseCommand;
}

export interface StateUpdateEvent {
  state: Partial<SupabasePlayerState>;
}
