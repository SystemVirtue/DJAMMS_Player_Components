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
  private commandPollInterval: ReturnType<typeof setInterval> | null = null;
  
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

    // Stop command polling
    if (this.commandPollInterval) {
      clearInterval(this.commandPollInterval);
      this.commandPollInterval = null;
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
    queueIndex?: number;
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
    queueIndex?: number;
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

      if (state.queueIndex !== undefined) {
        updateData.queue_index = state.queueIndex;
      }

      // Only update if something changed
      if (Object.keys(updateData).length <= 1) {
        return; // Only last_updated, skip
      }

      console.log('[SupabaseService] Syncing state to Supabase:', {
        now_playing: updateData.now_playing_video?.title,
        is_playing: updateData.is_playing,
        queue_length: updateData.active_queue?.length,
        queue_index: updateData.queue_index,
        priority_length: updateData.priority_queue?.length
      });

      const { error } = await this.client
        .from('player_state')
        .update(updateData)
        .eq('id', this.playerStateId);

      if (error) {
        console.error('[SupabaseService] State sync error:', error);
      } else {
        console.log('[SupabaseService] ✅ State synced successfully');
        this.lastSyncedState = updateData;
      }
    } catch (error) {
      console.error('[SupabaseService] State sync exception:', error);
    }
  }

  // ==================== Command Handling ====================

  /**
   * Start listening for remote commands using Broadcast channels
   * 
   * Uses Supabase Broadcast (not postgres_changes) because:
   * 1. No database Realtime replication config needed
   * 2. Instant delivery - no database round-trip
   * 3. More reliable - simple pub/sub pattern
   */
  private async startCommandListener(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    console.log(`[SupabaseService] Setting up Broadcast command listener for player: ${this.playerId}`);

    // Use Broadcast channel for instant command delivery
    // Channel name includes player ID so each player gets its own channel
    this.commandChannel = this.client
      .channel(`djamms-commands:${this.playerId}`)
      .on('broadcast', { event: 'command' }, async (payload) => {
        const message = payload.payload as {
          command: SupabaseCommand;
          timestamp: string;
        };
        
        if (!message || !message.command) {
          console.warn('[SupabaseService] Received invalid broadcast message:', payload);
          return;
        }

        const command = message.command;
        console.log('[SupabaseService] 📥 Received command via Broadcast:', command.command_type, command.id);
        
        // Process the command
        await this.processCommand(command);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SupabaseService] ✅ Broadcast command listener SUBSCRIBED - ready to receive commands');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SupabaseService] ❌ Broadcast channel ERROR:', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('[SupabaseService] ⚠️ Broadcast channel TIMED_OUT');
        } else {
          console.log(`[SupabaseService] Broadcast channel status: ${status}`);
        }
      });

    // Check for any pending commands that arrived while offline
    await this.processPendingCommands();
    
    // Start periodic poll as fallback (every 10 seconds) in case Broadcast misses messages
    this.startCommandPoll();
  }

  /**
   * Start periodic polling for pending commands as a fallback mechanism
   * This is a safety net in case Broadcast messages are missed
   */
  private startCommandPoll(): void {
    // Poll every 10 seconds (not aggressive, just a safety net)
    this.commandPollInterval = setInterval(async () => {
      await this.processPendingCommands();
    }, 10000);
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
   * Also sends Broadcast acknowledgment for instant feedback to Web Admin/Kiosk
   */
  private async markCommandExecuted(
    commandId: string, 
    success: boolean, 
    errorMessage?: string
  ): Promise<void> {
    if (!this.client) return;

    console.log(`[SupabaseService] 📝 Marking command ${commandId} as ${success ? 'executed' : 'failed'}`);

    // 1. Send Broadcast acknowledgment (instant feedback)
    try {
      const ackChannel = this.client.channel(`djamms-ack:${commandId}`);
      await ackChannel.subscribe();
      
      console.log(`[SupabaseService] 📤 Sending ack via Broadcast for command ${commandId}`);
      await ackChannel.send({
        type: 'broadcast',
        event: 'ack',
        payload: { success, error: errorMessage }
      });
      
      // Small delay before unsubscribing to ensure message is sent
      setTimeout(() => ackChannel.unsubscribe(), 100);
    } catch (ackError) {
      console.warn('[SupabaseService] Failed to send broadcast ack:', ackError);
    }

    // 2. Update database (for persistence/audit)
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

  /**
   * Send a command to a player (for Admin Console use)
   * Inserts to database for persistence and broadcasts for instant delivery
   */
  public async sendCommand(
    targetPlayerId: string,
    commandType: CommandType,
    payload?: CommandPayload,
    source: string = 'electron-admin'
  ): Promise<{ success: boolean; commandId?: string; error?: string }> {
    if (!this.client) {
      console.warn('[SupabaseService] Cannot send command - not initialized');
      return { success: false, error: 'Not initialized' };
    }

    console.log(`[SupabaseService] 📤 Sending command: ${commandType} to player: ${targetPlayerId}`);

    // 1. Insert to database for persistence/audit
    const { data, error } = await this.client
      .from('admin_commands')
      .insert({
        player_id: targetPlayerId,
        command_type: commandType,
        payload: payload || {},
        source,
        status: 'pending'
      })
      .select('id')
      .single();

    if (error) {
      console.error('[SupabaseService] Error sending command:', error);
      return { success: false, error: error.message };
    }

    // 2. Broadcast for instant delivery
    const commandId = data.id;
    try {
      const commandChannel = this.client.channel(`djamms-commands:${targetPlayerId}`);
      await commandChannel.subscribe();
      
      const command: SupabaseCommand = {
        id: commandId,
        player_id: targetPlayerId,
        command_type: commandType,
        command_data: payload || {},
        issued_by: source,
        issued_at: new Date().toISOString(),
        executed_at: null,
        status: 'pending',
        execution_result: null,
        created_at: new Date().toISOString()
      };
      
      await commandChannel.send({
        type: 'broadcast',
        event: 'command',
        payload: { command, timestamp: new Date().toISOString() }
      });
      
      commandChannel.unsubscribe();
    } catch (broadcastError) {
      console.warn('[SupabaseService] Broadcast failed (command still in DB):', broadcastError);
    }

    console.log(`[SupabaseService] ✅ Command sent: ${commandType} (${commandId})`);
    return { success: true, commandId };
  }

  /**
   * Get the current player ID
   */
  public getPlayerId(): string {
    return this.playerId;
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
