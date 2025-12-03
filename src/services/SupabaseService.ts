/**
 * SupabaseService - Singleton service for DJAMMS Player Supabase integration
 * 
 * This service handles:
 * - Real-time command listening from admin/kiosk endpoints
 * - Player state synchronization to Supabase
 * - Heartbeat to maintain online status
 * - Local video indexing sync
 * 
 * IMPORTANT: This service is designed to work alongside the existing
 * Electron IPC system, NOT replace it. Local playback still uses IPC.
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  SupabasePlayerState,
  SupabaseCommand,
  CommandType,
  QueueVideoItem,
  NowPlayingVideo,
  CommandPayload,
  VolumeCommandPayload,
  SeekCommandPayload,
  QueueAddCommandPayload,
  LoadPlaylistCommandPayload
} from '../types/supabase';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEFAULT_PLAYER_ID,
  HEARTBEAT_INTERVAL,
  STATE_SYNC_DEBOUNCE,
  COMMAND_EXPIRY_MS
} from '../config/supabase';
import { Video } from '../types';

// Event types for command handlers
export type CommandHandler = (command: SupabaseCommand) => Promise<void> | void;

/**
 * SupabaseService Singleton
 */
class SupabaseService {
  private static instance: SupabaseService | null = null;
  
  private client: SupabaseClient | null = null;
  private playerId: string = DEFAULT_PLAYER_ID;
  private playerStateId: string | null = null; // UUID of the player_state row
  
  // Subscriptions
  private commandChannel: RealtimeChannel | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stateSyncTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Command handlers
  private commandHandlers: Map<CommandType, CommandHandler[]> = new Map();
  
  // State tracking
  private isInitialized = false;
  private isOnline = false;
  private lastSyncedState: Partial<SupabasePlayerState> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  /**
   * Initialize the Supabase service
   * @param playerId - Optional player ID (defaults to DEFAULT_PLAYER_ID)
   */
  public async initialize(playerId?: string): Promise<boolean> {
    if (this.isInitialized) {
      console.log('[SupabaseService] Already initialized');
      return true;
    }

    try {
      this.playerId = playerId || DEFAULT_PLAYER_ID;
      
      // Create Supabase client
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      // Initialize or get player state row
      await this.initializePlayerState();

      // Start command listener
      await this.startCommandListener();

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      this.isOnline = true;
      console.log(`[SupabaseService] Initialized for player: ${this.playerId}`);
      return true;
    } catch (error) {
      console.error('[SupabaseService] Initialization failed:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Shutdown the service gracefully
   */
  public async shutdown(): Promise<void> {
    console.log('[SupabaseService] Shutting down...');
    
    // Mark as offline
    await this.setOnlineStatus(false);
    
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Cancel pending state sync
    if (this.stateSyncTimeout) {
      clearTimeout(this.stateSyncTimeout);
      this.stateSyncTimeout = null;
    }

    // Unsubscribe from realtime
    if (this.commandChannel) {
      await this.commandChannel.unsubscribe();
      this.commandChannel = null;
    }

    this.isInitialized = false;
    this.isOnline = false;
    console.log('[SupabaseService] Shutdown complete');
  }

  // ==================== Player State Management ====================

  /**
   * Initialize or fetch existing player state row
   */
  private async initializePlayerState(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    // Check for existing player state
    const { data: existing, error: fetchError } = await this.client
      .from('player_state')
      .select('id')
      .eq('player_id', this.playerId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error for us)
      console.error('[SupabaseService] Error fetching player state:', fetchError);
    }

    if (existing) {
      this.playerStateId = existing.id;
      console.log(`[SupabaseService] Found existing player state: ${this.playerStateId}`);
      
      // Update online status
      await this.setOnlineStatus(true);
    } else {
      // Create new player state row
      const { data: newState, error: insertError } = await this.client
        .from('player_state')
        .insert({
          player_id: this.playerId,
          status: 'idle',
          is_playing: false,
          is_online: true,
          volume: 1.0,
          volume_level: 0.8,
          playback_position: 0,
          current_position: 0,
          active_queue: [],
          priority_queue: [],
          last_heartbeat: new Date().toISOString()
        })
        .select('id')
        .single();

      if (insertError) {
        throw new Error(`Failed to create player state: ${insertError.message}`);
      }

      this.playerStateId = newState.id;
      console.log(`[SupabaseService] Created new player state: ${this.playerStateId}`);
    }
  }

  /**
   * Update player online status
   */
  private async setOnlineStatus(isOnline: boolean): Promise<void> {
    if (!this.client || !this.playerStateId) return;

    const { error } = await this.client
      .from('player_state')
      .update({
        is_online: isOnline,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', this.playerStateId);

    if (error) {
      console.error('[SupabaseService] Error updating online status:', error);
    } else {
      this.isOnline = isOnline;
    }
  }

  /**
   * Sync player state to Supabase (debounced)
   */
  public syncPlayerState(state: {
    status?: 'idle' | 'playing' | 'paused' | 'buffering' | 'error';
    isPlaying?: boolean;
    currentVideo?: Video | null;
    currentPosition?: number;
    volume?: number;
    activeQueue?: Video[];
    priorityQueue?: Video[];
  }): void {
    // Debounce rapid updates
    if (this.stateSyncTimeout) {
      clearTimeout(this.stateSyncTimeout);
    }

    this.stateSyncTimeout = setTimeout(() => {
      this.performStateSync(state);
    }, STATE_SYNC_DEBOUNCE);
  }

  /**
   * Perform the actual state sync to Supabase
   */
  private async performStateSync(state: {
    status?: string;
    isPlaying?: boolean;
    currentVideo?: Video | null;
    currentPosition?: number;
    volume?: number;
    activeQueue?: Video[];
    priorityQueue?: Video[];
  }): Promise<void> {
    if (!this.client || !this.playerStateId) {
      console.warn('[SupabaseService] Cannot sync state - not initialized');
      return;
    }

    try {
      const updateData: Partial<SupabasePlayerState> = {
        last_updated: new Date().toISOString()
      };

      // Map local state to Supabase schema
      if (state.status !== undefined) {
        updateData.status = state.status as SupabasePlayerState['status'];
      }

      if (state.isPlaying !== undefined) {
        updateData.is_playing = state.isPlaying;
      }

      if (state.currentVideo !== undefined) {
        updateData.now_playing_video = state.currentVideo 
          ? this.videoToNowPlaying(state.currentVideo)
          : null;
      }

      if (state.currentPosition !== undefined) {
        updateData.current_position = state.currentPosition;
        updateData.playback_position = Math.floor(state.currentPosition);
      }

      if (state.volume !== undefined) {
        updateData.volume = state.volume;
        updateData.volume_level = state.volume;
      }

      if (state.activeQueue !== undefined) {
        updateData.active_queue = state.activeQueue.map(v => this.videoToQueueItem(v));
      }

      if (state.priorityQueue !== undefined) {
        updateData.priority_queue = state.priorityQueue.map(v => this.videoToQueueItem(v));
      }

      // Only update if something changed
      if (Object.keys(updateData).length <= 1) {
        return; // Only last_updated, skip
      }

      const { error } = await this.client
        .from('player_state')
        .update(updateData)
        .eq('id', this.playerStateId);

      if (error) {
        console.error('[SupabaseService] State sync error:', error);
      } else {
        this.lastSyncedState = updateData;
      }
    } catch (error) {
      console.error('[SupabaseService] State sync exception:', error);
    }
  }

  // ==================== Command Handling ====================

  /**
   * Start listening for remote commands
   */
  private async startCommandListener(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    console.log(`[SupabaseService] Setting up command listener for player: ${this.playerId}`);

    // Subscribe to admin_commands table for this player
    this.commandChannel = this.client
      .channel(`commands:${this.playerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_commands',
          filter: `player_id=eq.${this.playerId}`
        },
        async (payload) => {
          const command = payload.new as SupabaseCommand;
          // Only process pending commands for this player
          if (command.status === 'pending') {
            console.log('[SupabaseService] 📥 Received command via Realtime:', command.command_type, command.id);
            await this.processCommand(command);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SupabaseService] ✅ Command listener SUBSCRIBED - ready to receive commands');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SupabaseService] ❌ Command channel ERROR:', err);
          console.error('[SupabaseService] Commands from Web Admin/Kiosk will NOT be received!');
          console.error('[SupabaseService] Check: Is Realtime enabled for admin_commands table in Supabase?');
        } else if (status === 'TIMED_OUT') {
          console.warn('[SupabaseService] ⚠️ Command channel TIMED_OUT - retrying...');
        } else {
          console.log(`[SupabaseService] Command channel status: ${status}`);
        }
      });

    // Also check for any pending commands that arrived while offline
    await this.processPendingCommands();
  }

  /**
   * Process any pending commands (catch-up after reconnect)
   */
  private async processPendingCommands(): Promise<void> {
    if (!this.client) return;

    const expiryTime = new Date(Date.now() - COMMAND_EXPIRY_MS).toISOString();

    const { data: pendingCommands, error } = await this.client
      .from('admin_commands')
      .select('*')
      .eq('player_id', this.playerId)
      .eq('status', 'pending')
      .gt('created_at', expiryTime)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SupabaseService] Error fetching pending commands:', error);
      return;
    }

    if (pendingCommands && pendingCommands.length > 0) {
      console.log(`[SupabaseService] Processing ${pendingCommands.length} pending commands`);
      for (const command of pendingCommands) {
        await this.processCommand(command);
      }
    }
  }

  /**
   * Process a single command
   */
  private async processCommand(command: SupabaseCommand): Promise<void> {
    const handlers = this.commandHandlers.get(command.command_type as CommandType);
    
    try {
      if (handlers && handlers.length > 0) {
        console.log(`[SupabaseService] ⚙️ Executing command: ${command.command_type} (${command.id})`);
        for (const handler of handlers) {
          await handler(command);
        }
        console.log(`[SupabaseService] ✅ Command executed: ${command.command_type}`);
      } else {
        console.warn(`[SupabaseService] ⚠️ No handler for command type: ${command.command_type}`);
      }

      // Mark command as executed
      await this.markCommandExecuted(command.id, true);
    } catch (error) {
      console.error(`[SupabaseService] ❌ Error processing command ${command.id}:`, error);
      await this.markCommandExecuted(command.id, false, String(error));
    }
  }

  /**
   * Mark a command as executed or failed
   */
  private async markCommandExecuted(
    commandId: string, 
    success: boolean, 
    errorMessage?: string
  ): Promise<void> {
    if (!this.client) return;

    console.log(`[SupabaseService] 📝 Marking command ${commandId} as ${success ? 'executed' : 'failed'}`);

    const { error } = await this.client
      .from('admin_commands')
      .update({
        status: success ? 'executed' : 'failed',
        executed_at: new Date().toISOString(),
        execution_result: success ? { success: true } : { error: errorMessage }
      })
      .eq('id', commandId);

    if (error) {
      console.error('[SupabaseService] Error marking command as executed:', error);
    } else {
      console.log(`[SupabaseService] ✅ Command ${commandId} marked as ${success ? 'executed' : 'failed'}`);
    }
  }

  /**
   * Register a handler for a specific command type
   */
  public onCommand(type: CommandType, handler: CommandHandler): void {
    const existing = this.commandHandlers.get(type) || [];
    this.commandHandlers.set(type, [...existing, handler]);
  }

  /**
   * Remove a command handler
   */
  public offCommand(type: CommandType, handler: CommandHandler): void {
    const existing = this.commandHandlers.get(type) || [];
    this.commandHandlers.set(type, existing.filter(h => h !== handler));
  }

  // ==================== Heartbeat ====================

  /**
   * Start the heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Send a heartbeat to update last_heartbeat timestamp
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.client || !this.playerStateId) return;

    const { error } = await this.client
      .from('player_state')
      .update({
        last_heartbeat: new Date().toISOString(),
        is_online: true
      })
      .eq('id', this.playerStateId);

    if (error) {
      console.error('[SupabaseService] Heartbeat error:', error);
    }
  }

  // ==================== Local Video Indexing ====================

  /**
   * Index local videos to the local_videos Supabase table
   * This allows Admin Console and Kiosk to search the player's local library
   * 
   * @param playlists - Object mapping playlist names to video arrays
   */
  public async indexLocalVideos(playlists: Record<string, Video[]>): Promise<void> {
    if (!this.client || !this.playerId) {
      console.warn('[SupabaseService] Cannot index videos - not initialized');
      return;
    }

    try {
      // Flatten all videos from all playlists
      const allVideos: Video[] = [];
      for (const videos of Object.values(playlists)) {
        allVideos.push(...videos);
      }

      if (allVideos.length === 0) {
        console.log('[SupabaseService] No videos to index');
        return;
      }

      console.log(`[SupabaseService] Indexing ${allVideos.length} local videos...`);

      // First, delete existing entries for this player (clean slate)
      const { error: deleteError } = await this.client
        .from('local_videos')
        .delete()
        .eq('player_id', this.playerId);

      if (deleteError) {
        console.error('[SupabaseService] Error clearing existing videos:', deleteError);
        // Continue anyway - we'll upsert
      }

      // Convert videos to Supabase format
      const localVideoRecords = allVideos.map(video => ({
        player_id: this.playerId,
        title: video.title,
        artist: video.artist || null,
        path: video.path || video.file_path || video.src,
        duration: video.duration || null,
        is_available: true,
        metadata: {
          sourceType: 'local',
          playlist: video.playlist,
          playlistDisplayName: video.playlistDisplayName,
          filename: video.filename
        }
      }));

      // Insert in batches of 100 to avoid payload limits
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < localVideoRecords.length; i += batchSize) {
        const batch = localVideoRecords.slice(i, i + batchSize);
        
        const { error: insertError } = await this.client
          .from('local_videos')
          .insert(batch);

        if (insertError) {
          console.error(`[SupabaseService] Error inserting batch ${i / batchSize + 1}:`, insertError);
        } else {
          insertedCount += batch.length;
        }
      }

      console.log(`[SupabaseService] Indexed ${insertedCount}/${allVideos.length} videos`);
    } catch (error) {
      console.error('[SupabaseService] Video indexing exception:', error);
    }
  }

  /**
   * Mark a video as unavailable (file deleted/moved)
   */
  public async markVideoUnavailable(path: string): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client
      .from('local_videos')
      .update({ is_available: false })
      .eq('player_id', this.playerId)
      .eq('path', path);

    if (error) {
      console.error('[SupabaseService] Error marking video unavailable:', error);
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Convert local Video type to NowPlayingVideo
   */
  private videoToNowPlaying(video: Video): NowPlayingVideo {
    return {
      id: video.id,
      src: video.src,
      path: video.path || video.file_path || video.src,
      title: video.title,
      artist: video.artist || null,
      sourceType: video.src.startsWith('http') ? 'youtube' : 'local',
      duration: video.duration
    };
  }

  /**
   * Convert local Video type to QueueVideoItem
   */
  private videoToQueueItem(video: Video): QueueVideoItem {
    return {
      id: video.id,
      src: video.src,
      path: video.path || video.file_path || video.src,
      title: video.title,
      artist: video.artist || null,
      sourceType: video.src.startsWith('http') ? 'youtube' : 'local',
      duration: video.duration,
      playlist: video.playlist,
      playlistDisplayName: video.playlistDisplayName
    };
  }

  /**
   * Get helper methods for extracting command payloads
   */
  public getCommandPayload<T extends CommandPayload>(command: SupabaseCommand): T {
    return command.command_data as T;
  }

  // ==================== Public Getters ====================

  public get initialized(): boolean {
    return this.isInitialized;
  }

  public get online(): boolean {
    return this.isOnline;
  }

  public get currentPlayerId(): string {
    return this.playerId;
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }
}

// Export singleton instance getter
export const getSupabaseService = () => SupabaseService.getInstance();

// Export the class for typing
export { SupabaseService };

// Default export
export default SupabaseService;
