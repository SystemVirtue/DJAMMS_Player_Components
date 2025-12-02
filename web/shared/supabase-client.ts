/**
 * Supabase Client for DJAMMS Web Endpoints
 * Shared between Kiosk and Admin apps
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type {
  SupabasePlayerState,
  SupabaseCommand,
  CommandType,
  CommandPayload,
  SupabaseLocalVideo,
  QueueVideoItem,
} from './types';

// DJAMMS_Obie_Server Project Configuration
const SUPABASE_URL = 'https://lfvhgdbnecjeuciadimx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTc2MjIsImV4cCI6MjA3OTI3MzYyMn0.kSVtXnNVRofDol8L20oflgdo7A82BgAMco2FoFHRkG8';

// Default player ID - matches the Electron player
const DEFAULT_PLAYER_ID = 'electron-player-1';

// Create Supabase client singleton
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ==================== Player State Functions ====================

/**
 * Get current player state
 */
export async function getPlayerState(playerId: string = DEFAULT_PLAYER_ID): Promise<SupabasePlayerState | null> {
  const { data, error } = await supabase
    .from('player_state')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error) {
    console.error('[SupabaseClient] Error fetching player state:', error);
    return null;
  }

  return data;
}

/**
 * Subscribe to player state changes
 */
export function subscribeToPlayerState(
  playerId: string = DEFAULT_PLAYER_ID,
  callback: (state: SupabasePlayerState) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`player_state:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_state',
        filter: `player_id=eq.${playerId}`
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new as SupabasePlayerState);
        }
      }
    )
    .subscribe();

  return channel;
}

// ==================== Command Functions ====================

/**
 * Insert a command to be executed by the Electron player
 */
export async function insertCommand(
  commandType: CommandType,
  commandData: CommandPayload,
  issuedBy: string = 'web-admin'
): Promise<boolean> {
  const { error } = await supabase
    .from('admin_commands')
    .insert({
      command_type: commandType,
      command_data: commandData,
      issued_by: issuedBy,
      status: 'pending',
      issued_at: new Date().toISOString()
    });

  if (error) {
    console.error('[SupabaseClient] Error inserting command:', error);
    return false;
  }

  return true;
}

// Convenience command functions
export const commands = {
  skip: () => insertCommand('skip', {}),
  pause: () => insertCommand('pause', {}),
  resume: () => insertCommand('resume', {}),
  setVolume: (volume: number) => insertCommand('setVolume', { volume }),
  play: (video: QueueVideoItem, queueIndex?: number) => 
    insertCommand('play', { video, queueIndex }),
  queueAdd: (video: QueueVideoItem, queueType: 'active' | 'priority' = 'priority', issuedBy: string = 'kiosk') => 
    insertCommand('queue_add', { video, queueType }, issuedBy),
  queueClear: () => insertCommand('queue_clear', {}),
  queueShuffle: () => insertCommand('queue_shuffle', {}),
  loadPlaylist: (playlistName: string, shuffle?: boolean) => 
    insertCommand('load_playlist', { playlistName, shuffle })
};

// ==================== Local Videos (Search) Functions ====================

/**
 * Search local videos by title or artist
 */
export async function searchLocalVideos(
  query: string,
  playerId: string = DEFAULT_PLAYER_ID,
  limit: number = 50
): Promise<SupabaseLocalVideo[]> {
  const { data, error } = await supabase
    .from('local_videos')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_available', true)
    .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
    .order('title')
    .limit(limit);

  if (error) {
    console.error('[SupabaseClient] Error searching videos:', error);
    return [];
  }

  return data || [];
}

/**
 * Get all local videos (for browse)
 */
export async function getAllLocalVideos(
  playerId: string = DEFAULT_PLAYER_ID
): Promise<SupabaseLocalVideo[]> {
  const { data, error } = await supabase
    .from('local_videos')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_available', true)
    .order('title');

  if (error) {
    console.error('[SupabaseClient] Error fetching all videos:', error);
    return [];
  }

  return data || [];
}

/**
 * Get videos by playlist
 */
export async function getVideosByPlaylist(
  playlistName: string,
  playerId: string = DEFAULT_PLAYER_ID
): Promise<SupabaseLocalVideo[]> {
  const { data, error } = await supabase
    .from('local_videos')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_available', true)
    .contains('metadata', { playlist: playlistName })
    .order('title');

  if (error) {
    console.error('[SupabaseClient] Error fetching playlist videos:', error);
    return [];
  }

  return data || [];
}

/**
 * Get distinct playlists from local videos
 */
export async function getPlaylists(
  playerId: string = DEFAULT_PLAYER_ID
): Promise<string[]> {
  const { data, error } = await supabase
    .from('local_videos')
    .select('metadata')
    .eq('player_id', playerId)
    .eq('is_available', true);

  if (error) {
    console.error('[SupabaseClient] Error fetching playlists:', error);
    return [];
  }

  // Extract unique playlist names from metadata
  const playlists = new Set<string>();
  data?.forEach((video) => {
    const playlist = (video.metadata as any)?.playlist;
    if (playlist) {
      playlists.add(playlist);
    }
  });

  return Array.from(playlists).sort();
}

// ==================== Helper Functions ====================

/**
 * Convert SupabaseLocalVideo to QueueVideoItem for command payloads
 */
export function localVideoToQueueItem(video: SupabaseLocalVideo): QueueVideoItem {
  const metadata = video.metadata as any;
  return {
    id: video.id,
    src: video.path,
    path: video.path,
    title: video.title,
    artist: video.artist,
    sourceType: 'local',
    duration: video.duration || undefined,
    playlist: metadata?.playlist,
    playlistDisplayName: metadata?.playlistDisplayName
  };
}

/**
 * Check if player is online (heartbeat within last 60 seconds)
 */
export function isPlayerOnline(state: SupabasePlayerState): boolean {
  if (!state.last_heartbeat) return false;
  const lastHeartbeat = new Date(state.last_heartbeat).getTime();
  const now = Date.now();
  return now - lastHeartbeat < 60000; // 60 seconds
}

/**
 * Strip YouTube playlist ID prefix from playlist name for display
 */
export function getPlaylistDisplayName(playlistName: string): string {
  // Pattern: [YouTube_Playlist_ID]_Playlist_Name or PLxxxxxx_Playlist_Name
  const match = playlistName.match(/^(?:\[[^\]]+\]_|PL[A-Za-z0-9_-]+_)(.+)$/);
  return match ? match[1] : playlistName;
}

/**
 * Strip " - Topic" suffix from artist names (YouTube auto-generated)
 */
export function getDisplayArtist(artist: string | null): string {
  if (!artist) return '';
  return artist.replace(/\s*-\s*Topic$/i, '');
}

// Export default player ID
export { DEFAULT_PLAYER_ID };
