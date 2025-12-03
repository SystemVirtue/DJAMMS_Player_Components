/**
 * Supabase Client for DJAMMS Web Endpoints
 * Shared between Kiosk and Admin apps
 * 
 * Features:
 * - Realtime subscriptions for player state
 * - Realtime-based command acknowledgment (no polling)
 * - Connection status monitoring
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
export const DEFAULT_PLAYER_ID = 'electron-player-1';

// Create Supabase client singleton
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ==================== Connection Status ====================

type ConnectionCallback = (connected: boolean) => void;
const connectionCallbacks: Set<ConnectionCallback> = new Set();
let isRealtimeConnected = false;

/**
 * Subscribe to connection status changes
 */
export function onConnectionChange(callback: ConnectionCallback): () => void {
  connectionCallbacks.add(callback);
  // Immediately call with current status
  callback(isRealtimeConnected);
  return () => connectionCallbacks.delete(callback);
}

/**
 * Get current connection status
 */
export function isConnected(): boolean {
  return isRealtimeConnected;
}

// Monitor Realtime connection status using a dedicated channel
const connectionMonitor = supabase.channel('connection-monitor');

connectionMonitor.subscribe((status) => {
  console.log('[SupabaseClient] Realtime status:', status);
  
  if (status === 'SUBSCRIBED') {
    console.log('[SupabaseClient] ✅ Realtime connected');
    isRealtimeConnected = true;
    connectionCallbacks.forEach(cb => cb(true));
  } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
    console.log('[SupabaseClient] ❌ Realtime disconnected');
    isRealtimeConnected = false;
    connectionCallbacks.forEach(cb => cb(false));
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
  // Note: We subscribe to ALL changes and filter client-side because
  // Supabase Realtime filter columns must be explicitly enabled in the dashboard
  const channel = supabase
    .channel(`player_state:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_state'
        // Removed server-side filter - will filter client-side instead
      },
      (payload) => {
        // Filter client-side: only process updates for the target player
        const newState = payload.new as SupabasePlayerState;
        if (newState && newState.player_id === playerId) {
          callback(newState);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[SupabaseClient] Player state subscription: ${status}`);
    });

  return channel;
}

// ==================== Command Functions ====================

/**
 * Result from a blocking command execution
 */
export interface CommandResult {
  success: boolean;
  error?: string;
  commandId?: string;
}

/**
 * Send a command and wait for Electron to acknowledge execution
 * Uses Realtime subscription for instant acknowledgment (faster than polling)
 * Falls back to polling if Realtime fails
 * @param commandType - The type of command to send
 * @param commandData - The command payload
 * @param issuedBy - Who issued the command (web-admin, kiosk, etc.)
 * @param playerId - Target player ID
 * @param timeoutMs - Max time to wait for execution (default 5000ms)
 */
export async function sendCommandAndWait(
  commandType: CommandType,
  commandData: CommandPayload,
  issuedBy: string = 'web-admin',
  playerId: string = DEFAULT_PLAYER_ID,
  timeoutMs: number = 5000
): Promise<CommandResult> {
  return new Promise(async (resolve) => {
    try {
      // 1. Insert command and get the ID
      const { data, error: insertError } = await supabase
        .from('admin_commands')
        .insert({
          player_id: playerId,
          command_type: commandType,
          command_data: commandData,
          issued_by: issuedBy,
          status: 'pending',
          issued_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (insertError) {
        // Handle case where table doesn't exist yet
        if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
          console.warn('[SupabaseClient] Commands table not yet created - using local fallback');
          window.dispatchEvent(new CustomEvent('djamms-command', {
            detail: { commandType, commandData, issuedBy, playerId }
          }));
          resolve({ success: true, error: 'Using local fallback (no table)' });
          return;
        }
        console.error('[SupabaseClient] Error inserting command:', insertError);
        resolve({ success: false, error: insertError.message });
        return;
      }

      const commandId = data.id;
      let resolved = false;
      const startTime = Date.now();
      let channelRef: ReturnType<typeof supabase.channel> | null = null;
      
      const cleanup = () => {
        channelRef?.unsubscribe();
      };
      
      const fallbackToPolling = () => {
        if (resolved) return;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(timeoutMs - elapsed, 1000);
        console.log(`[SupabaseClient] Falling back to polling (${remaining}ms remaining)`);
        cleanup();
        
        pollCommandStatus(commandId, remaining, 300)
          .then(result => {
            if (!resolved) {
              resolved = true;
              resolve(result);
            }
          });
      };

      // 2. Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.warn(`[SupabaseClient] Command ${commandType} timed out after ${timeoutMs}ms`);
          resolve({ 
            success: false, 
            error: 'Player not responding. Is the Electron app running?', 
            commandId 
          });
        }
      }, timeoutMs);

      // 3. Subscribe to this command's status change (Realtime - instant acknowledgment)
      //    With fallback to polling if Realtime fails or channel closes unexpectedly
      //    Note: We subscribe to ALL admin_commands updates and filter client-side
      //    because Supabase Realtime filter columns must be enabled in the dashboard
      
      channelRef = supabase
        .channel(`cmd-ack:${commandId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'admin_commands'
            // Removed server-side filter - will filter client-side instead
          },
          (payload) => {
            if (resolved) return;
            
            const newStatus = payload.new as any;
            
            // Filter client-side: only process updates for our specific command
            if (newStatus.id !== commandId) return;
            
            console.log(`[SupabaseClient] Command ${commandId} status: ${newStatus.status}`);
            
            if (newStatus.status === 'executed') {
              resolved = true;
              clearTimeout(timeoutId);
              channelRef?.unsubscribe();
              const result = newStatus.execution_result as any;
              resolve({ 
                success: result?.success !== false, 
                commandId,
                error: result?.error 
              });
            } else if (newStatus.status === 'failed') {
              resolved = true;
              clearTimeout(timeoutId);
              channelRef?.unsubscribe();
              const result = newStatus.execution_result as any;
              resolve({ 
                success: false, 
                error: result?.error || 'Command failed', 
                commandId 
              });
            }
          }
        )
        .subscribe((status) => {
          console.log(`[SupabaseClient] Command ack subscription (${commandId}): ${status}`);
          
          // If subscription fails or closes unexpectedly, fall back to polling
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (status === 'CLOSED') {
              console.warn('[SupabaseClient] Realtime channel closed unexpectedly, falling back to polling');
            } else {
              console.warn('[SupabaseClient] Realtime subscription failed, falling back to polling');
            }
            fallbackToPolling();
          }
        });

    } catch (err) {
      console.error('[SupabaseClient] Exception in sendCommandAndWait:', err);
      resolve({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });
}

/**
 * Fallback polling for command status (used if Realtime fails)
 */
async function pollCommandStatus(
  commandId: string,
  remainingTimeMs: number,
  pollIntervalMs: number = 200
): Promise<CommandResult> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < remainingTimeMs) {
    const { data: cmd, error: fetchError } = await supabase
      .from('admin_commands')
      .select('status, execution_result')
      .eq('id', commandId)
      .single();

    if (fetchError) {
      console.error('[SupabaseClient] Error polling command status:', fetchError);
      return { success: false, error: fetchError.message, commandId };
    }

    if (cmd?.status === 'executed') {
      const result = cmd.execution_result as any;
      return { 
        success: result?.success !== false, 
        commandId,
        error: result?.error 
      };
    } else if (cmd?.status === 'failed') {
      const result = cmd.execution_result as any;
      return { 
        success: false, 
        error: result?.error || 'Command failed', 
        commandId 
      };
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { success: false, error: 'Timeout (polling)', commandId };
}

/**
 * Blocking command helpers - wait for acknowledgment via Realtime
 */
export const blockingCommands = {
  skip: (playerId?: string) => sendCommandAndWait('skip', {}, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  pause: (playerId?: string) => sendCommandAndWait('pause', {}, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  resume: (playerId?: string) => sendCommandAndWait('resume', {}, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  setVolume: (volume: number, playerId?: string) => sendCommandAndWait('setVolume', { volume }, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  play: (video: QueueVideoItem, queueIndex?: number, playerId?: string) => 
    sendCommandAndWait('play', { video, queueIndex }, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  queueAdd: (video: QueueVideoItem, queueType: 'active' | 'priority' = 'priority', issuedBy: string = 'kiosk', playerId?: string) => 
    sendCommandAndWait('queue_add', { video, queueType }, issuedBy, playerId || DEFAULT_PLAYER_ID),
  queueClear: (playerId?: string) => sendCommandAndWait('queue_clear', {}, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  queueShuffle: (playerId?: string) => sendCommandAndWait('queue_shuffle', {}, 'web-admin', playerId || DEFAULT_PLAYER_ID),
  loadPlaylist: (playlistName: string, shuffle?: boolean, playerId?: string) => 
    sendCommandAndWait('load_playlist', { playlistName, shuffle }, 'web-admin', playerId || DEFAULT_PLAYER_ID)
};

/**
 * Insert a command to be executed by the Electron player (fire-and-forget)
 * Uses 'admin_commands' table in Supabase
 */
export async function insertCommand(
  commandType: CommandType,
  commandData: CommandPayload,
  issuedBy: string = 'web-admin',
  playerId: string = DEFAULT_PLAYER_ID
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('admin_commands')
      .insert({
        player_id: playerId,
        command_type: commandType,
        command_data: commandData,
        issued_by: issuedBy,
        status: 'pending',
        issued_at: new Date().toISOString()
      });

    if (error) {
      // Handle case where table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[SupabaseClient] Commands table not yet created in Supabase');
        // Fallback: store command locally for Electron to pick up
        window.dispatchEvent(new CustomEvent('djamms-command', {
          detail: { commandType, commandData, issuedBy, playerId }
        }));
        return true;
      }
      console.error('[SupabaseClient] Error inserting command:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[SupabaseClient] Exception inserting command:', err);
    // Fallback to local event
    window.dispatchEvent(new CustomEvent('djamms-command', {
      detail: { commandType, commandData, issuedBy, playerId }
    }));
    return true;
  }
}

// Convenience command functions
export const commands = {
  skip: (playerId?: string) => insertCommand('skip', {}, 'web-admin', playerId),
  pause: (playerId?: string) => insertCommand('pause', {}, 'web-admin', playerId),
  resume: (playerId?: string) => insertCommand('resume', {}, 'web-admin', playerId),
  setVolume: (volume: number, playerId?: string) => insertCommand('setVolume', { volume }, 'web-admin', playerId),
  play: (video: QueueVideoItem, queueIndex?: number, playerId?: string) => 
    insertCommand('play', { video, queueIndex }, 'web-admin', playerId),
  queueAdd: (video: QueueVideoItem, queueType: 'active' | 'priority' = 'priority', issuedBy: string = 'kiosk', playerId?: string) => 
    insertCommand('queue_add', { video, queueType }, issuedBy, playerId),
  queueClear: (playerId?: string) => insertCommand('queue_clear', {}, 'web-admin', playerId),
  queueShuffle: (playerId?: string) => insertCommand('queue_shuffle', {}, 'web-admin', playerId),
  loadPlaylist: (playlistName: string, shuffle?: boolean, playerId?: string) => 
    insertCommand('load_playlist', { playlistName, shuffle }, 'web-admin', playerId)
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
 * Also exported as queryLocalVideos for backwards compatibility
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
 * Handles: [ID]_Name, PLxxxxxx_Name, PLxxxxxx.Name
 */
export function getPlaylistDisplayName(playlistName: string): string {
  // Pattern: [YouTube_Playlist_ID]_Name or PLxxxxxx_Name or PLxxxxxx.Name
  const match = playlistName.match(/^(?:\[[^\]]+\]_|PL[A-Za-z0-9_-]+[._])(.+)$/);
  return match ? match[1] : playlistName;
}

/**
 * Strip " - Topic" suffix from artist names (YouTube auto-generated)
 */
export function getDisplayArtist(artist: string | null): string {
  if (!artist) return '';
  return artist.replace(/\s*-\s*Topic$/i, '');
}

// Aliases for backwards compatibility
export const queryLocalVideos = getAllLocalVideos;
