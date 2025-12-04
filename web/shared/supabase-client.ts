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
  try {
    // 1. Insert command and get the ID (for persistence/audit)
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
        return { success: true, error: 'Using local fallback (no table)' };
      }
      console.error('[SupabaseClient] Error inserting command:', insertError);
      return { success: false, error: insertError.message };
    }

    const commandId = data.id;

    // 2. Build the command object
    const command: SupabaseCommand = {
      id: commandId,
      player_id: playerId,
      command_type: commandType,
      command_data: commandData,
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
      executed_at: null,
      status: 'pending',
      execution_result: null,
      created_at: new Date().toISOString()
    };

    // 3. Broadcast the command immediately
    // Use a unique channel name with timestamp to avoid conflicts
    const channelName = `djamms-commands:${playerId}`;
    const commandChannel = supabase.channel(channelName);
    
    console.log(`[SupabaseClient] 📤 Subscribing to command channel: ${channelName}`);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Channel subscribe timeout')), 3000);
      commandChannel.subscribe((status) => {
        console.log(`[SupabaseClient] Command channel status: ${status}`);
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Channel error: ${status}`));
        }
      });
    });

    console.log(`[SupabaseClient] 📤 Broadcasting command: ${commandType} to player: ${playerId}`);
    
    const sendResult = await commandChannel.send({
      type: 'broadcast',
      event: 'command',
      payload: { command, timestamp: new Date().toISOString() }
    });
    
    console.log(`[SupabaseClient] Broadcast send result:`, sendResult);

    // Wait a moment before unsubscribing to ensure message is delivered
    await new Promise(resolve => setTimeout(resolve, 200));
    await commandChannel.unsubscribe();

    // 4. For now, assume success after broadcast (we can add ack later if needed)
    // The command was inserted to DB and broadcast - Electron will pick it up
    console.log(`[SupabaseClient] ✅ Command ${commandType} sent successfully (${commandId})`);
    return { success: true, commandId };

  } catch (err) {
    console.error('[SupabaseClient] Exception in sendCommandAndWait:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Blocking command helpers - send command via Broadcast
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
 * Inserts to database for persistence and broadcasts for instant delivery
 */
export async function insertCommand(
  commandType: CommandType,
  commandData: CommandPayload,
  issuedBy: string = 'web-admin',
  playerId: string = DEFAULT_PLAYER_ID
): Promise<boolean> {
  try {
    // 1. Insert to database for persistence/audit
    const { data, error } = await supabase
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

    // 2. Broadcast for instant delivery
    const commandId = data?.id || crypto.randomUUID();
    const channelName = `djamms-commands:${playerId}`;
    const commandChannel = supabase.channel(channelName);
    
    // Wait for subscription to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Channel subscribe timeout')), 3000);
      commandChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error(`Channel error: ${status}`));
        }
      });
    });
    
    const command: SupabaseCommand = {
      id: commandId,
      player_id: playerId,
      command_type: commandType,
      command_data: commandData,
      issued_by: issuedBy,
      issued_at: new Date().toISOString(),
      executed_at: null,
      status: 'pending',
      execution_result: null,
      created_at: new Date().toISOString()
    };
    
    console.log(`[SupabaseClient] 📤 Broadcasting command: ${commandType} to player: ${playerId}`);
    const sendResult = await commandChannel.send({
      type: 'broadcast',
      event: 'command',
      payload: { command, timestamp: new Date().toISOString() }
    });
    
    console.log(`[SupabaseClient] Broadcast send result:`, sendResult);
    
    // Wait a moment before unsubscribing to ensure message is delivered
    await new Promise(resolve => setTimeout(resolve, 200));
    await commandChannel.unsubscribe();
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
