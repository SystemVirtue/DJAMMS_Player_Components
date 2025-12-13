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
// Load from environment variables (Vite uses import.meta.env.VITE_*)
// Fallback to defaults for development
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lfvhgdbnecjeuciadimx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTc2MjIsImV4cCI6MjA3OTI3MzYyMn0.kSVtXnNVRofDol8L20oflgdo7A82BgAMco2FoFHRkG8';

// Default player ID - "DJAMMS_DEMO" (prompts user to change but allows app to continue)
// Must be at least 6 characters and unique on Supabase
// Load from environment variable with fallback
export const DEFAULT_PLAYER_ID = import.meta.env.VITE_DEFAULT_PLAYER_ID || 'DJAMMS_DEMO';
export const MIN_PLAYER_ID_LENGTH = 6;

// Video file extensions for filtering
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];

// LocalStorage key for saved player ID
const PLAYER_ID_STORAGE_KEY = 'djamms_player_id';

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

// ==================== Persistent Command Channel ====================
// Reuse channels to avoid subscription overhead per command

interface ChannelState {
  channel: RealtimeChannel;
  isReady: boolean;
  readyPromise: Promise<void>;
}

const commandChannels: Map<string, ChannelState> = new Map();

/**
 * Get or create a persistent command channel for a player
 * Reuses existing channels to avoid subscription overhead
 * Includes retry logic with exponential backoff on failure
 */
async function getCommandChannel(playerId: string, retryCount = 0): Promise<RealtimeChannel> {
  const channelName = `djamms-commands:${playerId}`;
  const maxRetries = 3;
  
  let state = commandChannels.get(channelName);
  
  if (state && state.isReady) {
    return state.channel;
  }
  
  if (state && !state.isReady) {
    // Channel exists but still connecting - wait for it
    try {
      await state.readyPromise;
      return state.channel;
    } catch (err) {
      // Connection failed, remove stale entry
      commandChannels.delete(channelName);
    }
  }
  
  // Create new channel
  const channel = supabase.channel(channelName);
  
  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      commandChannels.delete(channelName);
      reject(new Error('Channel subscribe timeout'));
    }, 3000);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        const existingState = commandChannels.get(channelName);
        if (existingState) {
          existingState.isReady = true;
        }
        console.log(`[SupabaseClient] ✅ Command channel ready: ${channelName}`);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        commandChannels.delete(channelName);
        reject(new Error(`Channel error: ${status}`));
      } else if (status === 'CLOSED') {
        // Channel was closed - remove from cache so it can be recreated
        commandChannels.delete(channelName);
      }
    });
  });
  
  state = { channel, isReady: false, readyPromise };
  commandChannels.set(channelName, state);
  
  try {
    await readyPromise;
    return channel;
  } catch (err) {
    // Retry with exponential backoff
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
      console.warn(`[SupabaseClient] Channel failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getCommandChannel(playerId, retryCount + 1);
    }
    throw err;
  }
}

// ==================== Player State Functions ====================

/**
 * Get current player state
 */
export async function getPlayerState(playerId: string = DEFAULT_PLAYER_ID): Promise<SupabasePlayerState | null> {
  const { data, error } = await supabase
    .from('player_state')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

  if (error) {
    // PGRST116 = no rows found, which is acceptable - player state doesn't exist yet
    if (error.code === 'PGRST116') {
      console.log(`[SupabaseClient] Player state not found for ${playerId} (player may not be initialized yet)`);
      return null;
    }
    console.error('[SupabaseClient] Error fetching player state:', error);
    return null;
  }

  return data;
}

/**
 * Subscribe to player state changes
 * Uses server-side filtering for efficiency (requires Realtime filter enabled in Supabase dashboard)
 */
export function subscribeToPlayerState(
  playerId: string = DEFAULT_PLAYER_ID,
  callback: (state: SupabasePlayerState) => void
): RealtimeChannel & { stopPolling?: () => void } {
  // Use server-side filter if Realtime filters are enabled in Supabase dashboard
  // Falls back to client-side filtering if server-side filter fails
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastPolledState: SupabasePlayerState | null = null;
  let isPolling = false;
  
  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      isPolling = false;
    }
  };
  
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
        const newState = payload.new as SupabasePlayerState;
        if (newState) {
          console.log(`[SupabaseClient] Received Realtime update for player ${playerId}:`, {
            now_playing: newState.now_playing_video?.title,
            queue_length: newState.active_queue?.length,
            priority_length: newState.priority_queue?.length
          });
          lastPolledState = newState;
          callback(newState);
          
          // Stop polling if Realtime is working
          stopPolling();
          console.log('[SupabaseClient] Realtime working, stopped fallback polling');
        }
      }
    )
    .subscribe((status) => {
      console.log(`[SupabaseClient] Player state subscription: ${status}`);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[SupabaseClient] Realtime subscription failed, starting fallback polling');
        
        // Start fallback polling every 2 seconds
        if (!isPolling) {
          isPolling = true;
          pollInterval = setInterval(async () => {
            try {
              const state = await getPlayerState(playerId);
              if (state) {
                // Only call callback if state actually changed
                if (!lastPolledState || JSON.stringify(state) !== JSON.stringify(lastPolledState)) {
                  console.log(`[SupabaseClient] Polled state update for player ${playerId}:`, {
                    now_playing: state.now_playing_video?.title,
                    queue_length: state.active_queue?.length,
                    priority_length: state.priority_queue?.length
                  });
                  lastPolledState = state;
                  callback(state);
                }
              }
            } catch (error) {
              console.error('[SupabaseClient] Polling error:', error);
            }
          }, 2000);
        }
      } else if (status === 'SUBSCRIBED') {
        console.log('[SupabaseClient] Realtime subscription active');
        // Stop polling if Realtime is working
        stopPolling();
      }
    });

  // Add cleanup method and return enhanced channel
  const enhancedChannel = channel as RealtimeChannel & { stopPolling: () => void };
  enhancedChannel.stopPolling = stopPolling;
  
  // Override unsubscribe to also stop polling
  const originalUnsubscribe = enhancedChannel.unsubscribe.bind(enhancedChannel);
  enhancedChannel.unsubscribe = async () => {
    stopPolling();
    return originalUnsubscribe();
  };

  return enhancedChannel;
}

/**
 * Subscribe to local_videos table changes (for when playlists are re-indexed)
 * This allows Web Admin to auto-refresh when the Electron player indexes new playlists
 * Uses server-side filtering for efficiency
 */
export function subscribeToLocalVideos(
  playerId: string = DEFAULT_PLAYER_ID,
  callback: () => void
): RealtimeChannel {
  const channel = supabase
    .channel(`local_videos:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'local_videos',
        filter: `player_id=eq.${playerId}`
      },
      (payload) => {
          console.log('[SupabaseClient] Local videos changed, triggering refresh');
          callback();
      }
    )
    .subscribe((status) => {
      console.log(`[SupabaseClient] Local videos subscription: ${status}`);
      if (status === 'CHANNEL_ERROR') {
        console.warn('[SupabaseClient] Realtime filter may not be enabled. Enable player_id filter in Supabase dashboard for better performance.');
      }
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
    // Generate command ID upfront so we can broadcast immediately
    const commandId = crypto.randomUUID();
    
    // 1. Build the command object FIRST
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

    // 2. Insert to database FIRST (so we can subscribe to status changes)
    // Note: This is optional - if schema doesn't match, we'll skip DB insert but still broadcast
    // Map to actual schema: admin_id (required), action_type, action_data
    // Also try new columns if they exist: player_id, command_type, command_data, issued_by
    const insertPayload: any = {
      id: commandId,
      admin_id: issuedBy, // Required field in schema
      action_type: commandType, // Map command_type -> action_type
      action_data: commandData, // Map command_data -> action_data
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    // Try to include new columns if they exist (for future compatibility)
    // These will be ignored if columns don't exist
    insertPayload.player_id = playerId;
    insertPayload.command_type = commandType;
    insertPayload.command_data = commandData;
    insertPayload.issued_by = issuedBy;
    insertPayload.issued_at = new Date().toISOString();

    const { error: insertError } = await supabase
      .from('admin_commands')
      .insert(insertPayload);

    // Suppress schema errors (PGRST204 = column not found, 42P01 = table doesn't exist, 23502 = not-null constraint)
    // These are non-critical since broadcasting via Realtime channel works fine
    if (insertError && insertError.code !== '42P01' && insertError.code !== 'PGRST204' && insertError.code !== '23502') {
      console.warn('[SupabaseClient] DB insert failed:', insertError.message);
    }

    // 3. Broadcast using persistent channel (no subscription overhead)
    console.log(`[SupabaseClient] 📤 Broadcasting command: ${commandType} to player: ${playerId}`);
    
    const commandChannel = await getCommandChannel(playerId);
    
    await commandChannel.httpSend({
      type: 'broadcast',
      event: 'command',
      payload: { command, timestamp: new Date().toISOString() }
    });
    
    console.log(`[SupabaseClient] ✅ Command ${commandType} broadcast sent (${commandId})`);

    // 4. Wait for command execution via Realtime subscription
    return new Promise<CommandResult>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[SupabaseClient] Command ${commandId} timeout after ${timeoutMs}ms`);
          resolve({ success: false, error: 'Timeout waiting for command execution', commandId });
        }
      }, timeoutMs);

      // Subscribe to command status changes
      const statusChannel = supabase
        .channel(`command-status:${commandId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'admin_commands',
            filter: `id=eq.${commandId}`
          },
          (payload) => {
            if (resolved) return;
            
            const updated = payload.new as any;
            if (updated && updated.status) {
              if (updated.status === 'executed' || updated.status === 'completed') {
                resolved = true;
                clearTimeout(timeout);
                statusChannel.unsubscribe();
                console.log(`[SupabaseClient] ✅ Command ${commandId} executed successfully`);
                resolve({ success: true, commandId });
              } else if (updated.status === 'failed') {
                resolved = true;
                clearTimeout(timeout);
                statusChannel.unsubscribe();
                const errorMsg = updated.error_message || updated.execution_result?.error || 'Command failed';
                console.error(`[SupabaseClient] ❌ Command ${commandId} failed: ${errorMsg}`);
                resolve({ success: false, error: errorMsg, commandId });
        }
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[SupabaseClient] Subscribed to command status: ${commandId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (!resolved) {
              // Fallback to polling if Realtime fails
              console.warn(`[SupabaseClient] Realtime subscription failed, falling back to polling for ${commandId}`);
              pollCommandStatus(commandId, timeoutMs).then(result => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(result);
                }
              });
            }
          }
        });
    });

  } catch (err) {
    console.error('[SupabaseClient] Exception in sendCommandAndWait:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Poll command status as fallback if Realtime fails
 */
async function pollCommandStatus(
  commandId: string,
  timeoutMs: number
): Promise<CommandResult> {
  const startTime = Date.now();
  const pollInterval = 500; // Poll every 500ms
  
  return new Promise<CommandResult>((resolve) => {
    const poll = setInterval(async () => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(poll);
        resolve({ success: false, error: 'Timeout waiting for command execution', commandId });
        return;
      }

      const { data, error } = await supabase
        .from('admin_commands')
        .select('status, error_message, execution_result')
        .eq('id', commandId)
        .single();

      // If schema doesn't match (PGRST204 = column not found), skip polling
      // Realtime subscription will handle status updates instead
      if (error) {
        if (error.code === 'PGRST204' || error.code === '42P01') {
          // Schema mismatch - skip polling, rely on Realtime subscription
          return;
        }
        clearInterval(poll);
        resolve({ success: false, error: error.message, commandId });
        return;
      }

      if (data) {
        if (data.status === 'executed' || data.status === 'completed') {
          clearInterval(poll);
          resolve({ success: true, commandId });
        } else if (data.status === 'failed') {
          clearInterval(poll);
          const errorMsg = data.error_message || data.execution_result?.error || 'Command failed';
          resolve({ success: false, error: errorMsg, commandId });
        }
        // Otherwise continue polling
      }
    }, pollInterval);
  });
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
 * Broadcasts using persistent channel for instant delivery, then persists to database
 */
export async function insertCommand(
  commandType: CommandType,
  commandData: CommandPayload,
  issuedBy: string = 'web-admin',
  playerId: string = DEFAULT_PLAYER_ID
): Promise<boolean> {
  try {
    // Generate ID upfront for broadcast
    const commandId = crypto.randomUUID();
    
    // 1. Build command object
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
    
    // 2. Broadcast using persistent channel (no subscription overhead)
    console.log(`[SupabaseClient] 📤 Broadcasting command: ${commandType} to player: ${playerId}`);
    
    const commandChannel = await getCommandChannel(playerId);
    
    await commandChannel.httpSend({
      type: 'broadcast',
      event: 'command',
      payload: { command, timestamp: new Date().toISOString() }
    });
    
    console.log(`[SupabaseClient] ✅ Command ${commandType} broadcast sent`);

    // 3. Insert to database for persistence (fire-and-forget, don't block)
    // Note: This is optional - if schema doesn't match, we'll skip DB insert but still broadcast
    // Map to actual schema: admin_id (required), action_type, action_data
    // Also try new columns if they exist: player_id, command_type, command_data, issued_by
    const insertPayload: any = {
      id: commandId,
      admin_id: issuedBy, // Required field in schema
      action_type: commandType, // Map command_type -> action_type
      action_data: commandData, // Map command_data -> action_data
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    // Try to include new columns if they exist (for future compatibility)
    // These will be ignored if columns don't exist
    insertPayload.player_id = playerId;
    insertPayload.command_type = commandType;
    insertPayload.command_data = commandData;
    insertPayload.issued_by = issuedBy;
    insertPayload.issued_at = new Date().toISOString();

    Promise.resolve(supabase
      .from('admin_commands')
      .insert(insertPayload))
      .then(({ error }) => {
        // Suppress schema errors (PGRST204 = column not found, 42P01 = table doesn't exist, 23502 = not-null constraint)
        // These are non-critical since broadcasting via Realtime channel works fine
        if (error && error.code !== '42P01' && error.code !== 'PGRST204' && error.code !== '23502') {
          console.warn('[SupabaseClient] DB insert failed:', error.message);
        }
      })
      .catch(() => {
        // Silently ignore any other errors - broadcasting already succeeded
      });

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
 * 
 * SEARCH IMPLEMENTATION DETAILS:
 * ------------------------------
 * The search splits the query into individual words and matches videos where
 * ANY word appears in EITHER the title OR artist field.
 * 
 * How it works:
 * 1. Query is split by spaces into words (e.g., "with or" → ["with", "or"])
 * 2. Words shorter than 2 characters are filtered out to avoid noise
 * 3. Each word generates an OR clause: title.ilike.%word% OR artist.ilike.%word%
 * 4. All word clauses are combined with OR (any word match counts)
 * 
 * Examples:
 * - "green" matches: "Green Day", "Green Grass of Home", "Greenlight"
 * - "with or" matches: "With Or Without You" (matches "with" AND "or")
 * - "U2" matches any song with "U2" in title or artist
 * 
 * Tunable Parameters:
 * - MIN_WORD_LENGTH (2): Minimum characters per word to search
 * - limit (50): Maximum results returned
 * - MIN_QUERY_LENGTH (2): Minimum total query length to trigger search
 * 
 * Data Source:
 * - Searches the `local_videos` table in Supabase
 * - This table is populated by the Electron player when it indexes the PLAYLISTS folder
 * - Only videos with is_available=true are searchable
 * - Each video record contains: id, title, artist, path, duration, metadata (playlist info)
 */
export async function searchLocalVideos(
  query: string,
  playerId: string = DEFAULT_PLAYER_ID,
  limit: number | null = 50
): Promise<SupabaseLocalVideo[]> {
  // Minimum query length before searching
  const MIN_QUERY_LENGTH = 2;
  
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < MIN_QUERY_LENGTH) {
    return [];
  }
  
  // Prefer PostgreSQL FTS RPC for consistent relevance across clients
  try {
    const { data, error } = await supabase.rpc('search_videos', {
      search_query: trimmedQuery,
      scope: 'all',
      result_limit: limit || 10000, // Use large number if null (effectively unlimited)
      result_offset: 0,
      p_player_id: playerId
    });

    if (error) {
      // Suppress known schema mismatch errors (42804 = type mismatch, PGRST203 = function not found, 400 = bad request)
      // These are non-critical since we have ILIKE fallback - don't log them as errors
      const errorCode = error.code?.toString() || '';
      const isKnownError = errorCode === '42804' || errorCode === 'PGRST203' || errorCode === '400' || 
                          error.message?.includes('structure of query does not match') ||
                          error.message?.includes('Returned type jsonb does not match');
      if (!isKnownError) {
        console.warn('[SupabaseClient] FTS search_videos RPC failed, falling back to ILIKE:', error);
      }
      throw error;
    }

    // If RPC returns player_id, filter client-side to be safe
    // Also filter to only show video files
    const filtered = (data || []).filter((row: any) => {
      // Filter by player_id
      if (row.player_id && row.player_id !== playerId) return false;
      // Filter by video file extension
      const filename = (row.filename || '').toLowerCase();
      return VIDEO_EXTENSIONS.some(ext => filename.endsWith(ext.toLowerCase()));
    });
    return filtered;
  } catch (rpcError: any) {
    // Always fall back to ILIKE search if RPC fails
    // Suppress ALL logging for known schema mismatch errors (expected behavior, no need to log)
    const errorCode = String(rpcError?.code || '');
    const errorMessage = String(rpcError?.message || '');
    const errorDetails = String(rpcError?.details || '');
    const errorString = JSON.stringify(rpcError || {});
    
    // Check for known schema mismatch errors - be very permissive and check all possible fields
    const isKnownError = 
      errorCode === '42804' || 
      errorCode === 'PGRST203' || 
      errorCode === '400' ||
      errorMessage.toLowerCase().includes('structure of query') ||
      errorMessage.toLowerCase().includes('does not match') ||
      errorMessage.toLowerCase().includes('jsonb') ||
      errorDetails.toLowerCase().includes('jsonb') ||
      errorDetails.toLowerCase().includes('does not match') ||
      errorString.toLowerCase().includes('structure of query') ||
      errorString.toLowerCase().includes('jsonb does not match');
    
    // COMPLETELY SILENT for known errors - no console output at all
    // Only log truly unexpected errors that we haven't seen before
    if (!isKnownError) {
      console.debug('[SupabaseClient] RPC search failed, using ILIKE fallback:', rpcError);
    }
    // For known errors: silently continue to ILIKE fallback (no console output whatsoever)
    // Fallback: legacy ILIKE search (any word in title OR artist), scoped to player
    const MIN_WORD_LENGTH = 2;
  const words = trimmedQuery
    .split(/\s+/)
    .filter(word => word.length >= MIN_WORD_LENGTH)
    .map(word => word.replace(/[%_]/g, '')); // Escape SQL wildcards
  
  if (words.length === 0) {
    words.push(trimmedQuery);
  }
  
  const orClauses = words.map(word => `title.ilike.%${word}%,artist.ilike.%${word}%`).join(',');
  
  let queryBuilder = supabase
    .from('local_videos')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_available', true)
    .or(orClauses)
    .order('title');
  
  // Only apply limit if specified
  if (limit !== null) {
    queryBuilder = queryBuilder.limit(limit);
  }
  
  const { data, error } = await queryBuilder;

  if (error) {
      console.error('[SupabaseClient] Error searching videos (ILIKE fallback):', error);
    return [];
  }

  // Filter results client-side to ensure only video files
  const filteredData = (data || []).filter(video => {
    const filename = (video.filename || '').toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => filename.endsWith(ext.toLowerCase()));
  });
  
  if (data && data.length > filteredData.length) {
    console.warn('[SupabaseClient] ⚠️ Search filtered out', data.length - filteredData.length, 'non-video files/folders');
  }
  
  return filteredData;
  }
}

/**
 * Get all local videos (for browse)
 * Supports pagination for large libraries
 * Also exported as queryLocalVideos for backwards compatibility
 */
export async function getAllLocalVideos(
  playerId: string = DEFAULT_PLAYER_ID,
  limit: number | null = null, // null = fetch all, no limit
  offset: number = 0
): Promise<SupabaseLocalVideo[]> {
  if (!playerId || playerId.trim() === '') {
    console.warn('[SupabaseClient] getAllLocalVideos called with empty playerId');
    return [];
  }

  console.log('[SupabaseClient] getAllLocalVideos called:', { playerId, limit: limit || 'unlimited', offset });
  
  // First, check what player_ids exist in the database (for debugging)
  const { data: allPlayers, error: countError } = await supabase
    .from('local_videos')
    .select('player_id')
    .limit(10);
  
  if (!countError && allPlayers && allPlayers.length > 0) {
    const uniquePlayerIds = [...new Set(allPlayers.map(v => v.player_id))];
    console.log('[SupabaseClient] Found videos for player IDs:', uniquePlayerIds);
    if (!uniquePlayerIds.includes(playerId)) {
      console.warn(`[SupabaseClient] ⚠️ WARNING: No videos found for playerId "${playerId}". Available player IDs:`, uniquePlayerIds);
    }
  } else if (!countError) {
    console.warn('[SupabaseClient] ⚠️ WARNING: local_videos table is EMPTY - no videos indexed yet!');
  }
  
  // Build query - if limit is null, fetch all videos (no range limit)
  // Filter to only show actual video files (exclude folders and non-video files)
  let queryBuilder = supabase
    .from('local_videos')
    .select('*')
    .eq('player_id', playerId)
    .eq('is_available', true)
    .order('title');
  
  // Filter by filename extension - only show video files
  // Use OR condition to match any video extension
  const extensionFilters = VIDEO_EXTENSIONS.map(ext => `filename.ilike.%${ext}`);
  queryBuilder = queryBuilder.or(extensionFilters.join(','));
  
  // Only apply range if limit is specified
  // IMPORTANT: PostgREST defaults to 1000 rows if no range is specified
  // To fetch all videos, we must explicitly set a very large range
  if (limit !== null) {
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);
  } else {
    // No limit specified - fetch all videos by setting a very large range
    // This overrides PostgREST's default 1000 row limit
    queryBuilder = queryBuilder.range(offset, offset + 9999999); // 10 million should be more than enough
  }
  
  const { data, error } = await queryBuilder;

  if (error) {
    console.error('[SupabaseClient] ❌ Error fetching all videos:', error);
    console.error('[SupabaseClient] Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return [];
  }

  // Filter results client-side to ensure only video files (double-check)
  const filteredData = (data || []).filter(video => {
    const filename = (video.filename || '').toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => filename.endsWith(ext.toLowerCase()));
  });
  
  console.log('[SupabaseClient] ✅ getAllLocalVideos returned', filteredData.length, 'videos (filtered from', data?.length || 0, 'total) for playerId:', playerId);
  if (filteredData.length > 0) {
    console.log('[SupabaseClient] Sample video:', { title: filteredData[0].title, artist: filteredData[0].artist, filename: filteredData[0].filename });
  }
  if (data && data.length > filteredData.length) {
    console.warn('[SupabaseClient] ⚠️ Filtered out', data.length - filteredData.length, 'non-video files/folders');
  }
  return filteredData;
}

/**
 * Get total count of available videos for a player (for pagination)
 */
export async function getLocalVideosCount(
  playerId: string = DEFAULT_PLAYER_ID
): Promise<number> {
  const { count, error } = await supabase
    .from('local_videos')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('is_available', true);

  if (error) {
    console.error('[SupabaseClient] Error counting videos:', error);
    return 0;
  }

  return count || 0;
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
