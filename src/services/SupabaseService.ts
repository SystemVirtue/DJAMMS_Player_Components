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
import { logger } from '../utils/logger';

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
  private commandSendChannels: Map<string, RealtimeChannel> = new Map(); // Reused channels for sending commands
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stateSyncTimeout: ReturnType<typeof setTimeout> | null = null;
  private commandPollInterval: ReturnType<typeof setInterval> | null = null;
  private indexingInProgress: boolean = false;
  
  // Command handlers
  private commandHandlers: Map<CommandType, CommandHandler[]> = new Map();
  
  // Command deduplication - track processed command IDs to prevent double execution
  private processedCommandIds: Set<string> = new Set();
  private processingCommandIds: Set<string> = new Set(); // Commands currently being processed
  
  // State tracking
  private isInitialized = false;
  private isOnline = false;
  private lastSyncedState: Partial<SupabasePlayerState> | null = null;
  private lastSyncKey: string | null = null; // For deduplication of identical syncs

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
      
      // Create Supabase client with consistent configuration
      // Using direct createClient for now (can be migrated to shared factory later)
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        },
        global: {
          headers: {
            'Accept': 'application/json',
            'statement-timeout': '30000' // 30 second timeout for queries
          }
        }
      });
      
      if (!this.client) {
        throw new Error('Failed to create Supabase client - check environment variables');
      }

      // Initialize or get player state row
      await this.initializePlayerState();

      // Start command listener
      await this.startCommandListener();

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      this.isOnline = true;
      logger.info(`SupabaseService initialized for player: ${this.playerId}`);
      return true;
    } catch (error) {
      logger.error('SupabaseService initialization failed:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Shutdown the service gracefully
   */
  public async shutdown(): Promise<void> {
    logger.info('SupabaseService shutting down...');
    
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

    // Unsubscribe from all command send channels
    for (const [playerId, channel] of this.commandSendChannels.entries()) {
      await channel.unsubscribe();
    }
    this.commandSendChannels.clear();

    this.isInitialized = false;
    this.isOnline = false;
    console.log('[SupabaseService] Shutdown complete');
  }

  // ==================== Player State Management ====================

  /**
   * Initialize or fetch existing player state row
   * Has timeout to prevent hanging if Supabase is unreachable
   */
  private async initializePlayerState(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    // Add timeout to prevent hanging (5 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Player state initialization timeout')), 5000);
    });

    try {
      const initPromise = (async () => {
        // Check for existing player state
        const { data: existing, error: fetchError } = await this.client!
          .from('player_state')
          .select('id')
          .eq('player_id', this.playerId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          // PGRST116 = no rows found (not an error for us)
          logger.warn('[SupabaseService] Error fetching player state (non-critical):', fetchError.message);
        }

        if (existing) {
          this.playerStateId = existing.id;
          logger.info(`[SupabaseService] Found existing player state: ${this.playerStateId}`);
          
          // Update online status (non-blocking)
          this.setOnlineStatus(true).catch(err => {
            logger.warn('[SupabaseService] Failed to update online status (non-critical):', err);
          });
        } else {
          // Create new player state row
          const { data: newState, error: insertError } = await this.client!
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
            // Don't throw - allow app to continue even if Supabase is down
            logger.warn(`[SupabaseService] Failed to create player state (non-critical): ${insertError.message}`);
            logger.info('[SupabaseService] App will continue without Supabase sync');
            return; // Continue without playerStateId
          }

          this.playerStateId = newState.id;
          logger.info(`[SupabaseService] Created new player state: ${this.playerStateId}`);
        }
      })();

      await Promise.race([initPromise, timeoutPromise]);
    } catch (error) {
      // Timeout or other error - log but don't block initialization
      logger.warn('[SupabaseService] Player state initialization failed (non-critical):', error instanceof Error ? error.message : error);
      logger.info('[SupabaseService] App will continue without Supabase sync');
      // Continue without playerStateId - app can still function
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
   * Sync player state to Supabase (debounced by default, immediate if specified)
   * @param state - The state to sync
   * @param immediate - If true, bypass debounce and sync immediately (use for shuffle, etc.)
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
  }, immediate: boolean = false): void {
    // Clear any pending debounced update
    if (this.stateSyncTimeout) {
      clearTimeout(this.stateSyncTimeout);
    }

    if (immediate) {
      // Sync immediately (for queue shuffle, etc.)
      this.performStateSync(state);
    } else {
      // Debounce rapid updates
      this.stateSyncTimeout = setTimeout(() => {
        this.performStateSync(state);
      }, STATE_SYNC_DEBOUNCE);
    }
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
      logger.warn('Cannot sync state - SupabaseService not initialized');
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

      // Check if this update is identical to the last one (skip duplicate syncs)
      const updateKey = JSON.stringify({
        now_playing: updateData.now_playing_video?.title,
        is_playing: updateData.is_playing,
        queue_length: updateData.active_queue?.length,
        queue_index: updateData.queue_index,
        priority_length: updateData.priority_queue?.length
      });
      
      if (this.lastSyncKey === updateKey) {
        logger.debug('Skipping duplicate state sync');
        return; // Skip duplicate update
      }
      this.lastSyncKey = updateKey;

      logger.debug('Syncing state to Supabase', {
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
        logger.error('State sync error:', error);
      } else {
        logger.debug('State synced successfully to Supabase');
        this.lastSyncedState = updateData;
      }
    } catch (error) {
      logger.error('State sync exception:', error);
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

    // Delay initial pending commands check to let Broadcast handle immediate delivery
    // Reduced from 3s to 500ms - deduplication prevents race conditions
    setTimeout(async () => {
      await this.processPendingCommands();
    }, 500);
    
    // Start periodic poll as fallback with minimal delay
    // This is a safety net in case Broadcast misses messages
    setTimeout(() => this.startCommandPoll(), 1000);
  }

  /**
   * Start periodic polling for pending commands as a fallback mechanism
   * This is a safety net in case Broadcast messages are missed
   */
  private startCommandPoll(): void {
    // Poll every 2 seconds for faster fallback recovery on disconnect
    this.commandPollInterval = setInterval(async () => {
      await this.processPendingCommands();
    }, 2000);
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
      // Filter out commands we've already processed (prevents log spam)
      const newCommands = pendingCommands.filter(cmd => !this.processedCommandIds.has(cmd.id));
      
      if (newCommands.length > 0) {
        console.log(`[SupabaseService] Processing ${newCommands.length} pending commands`);
        for (const command of newCommands) {
          await this.processCommand(command);
        }
      }
      
      // Clean up stale commands that are stuck in 'pending' but we've already processed
      // This handles the case where the status update failed
      const staleCommands = pendingCommands.filter(cmd => this.processedCommandIds.has(cmd.id));
      if (staleCommands.length > 0) {
        // Batch update all stale commands to 'executed' status
        const staleIds = staleCommands.map(cmd => cmd.id);
        this.client
          .from('admin_commands')
          .update({ status: 'executed', executed_at: new Date().toISOString() })
          .in('id', staleIds)
          .then(({ error: updateError }) => {
            if (updateError) {
              console.warn('[SupabaseService] Error cleaning up stale commands:', updateError.message);
            } else {
              console.log(`[SupabaseService] 🧹 Cleaned up ${staleIds.length} stale commands`);
            }
          });
      }
    }
  }

  /**
   * Process a single command with deduplication
   * Ensures each command is only processed ONCE, even if received via both Broadcast and polling
   */
  private async processCommand(command: SupabaseCommand): Promise<void> {
    // CRITICAL: Check if command was already processed to prevent duplicate execution
    if (this.processedCommandIds.has(command.id)) {
      // Silent skip - already processed (this can happen via Broadcast + polling race)
      return;
    }
    
    // Check if command is currently being processed (prevent concurrent execution)
    if (this.processingCommandIds.has(command.id)) {
      // Silent skip - currently processing
      return;
    }
    
    // Mark as being processed BEFORE executing to prevent race conditions
    this.processingCommandIds.add(command.id);
    this.processedCommandIds.add(command.id);
    
    // Prevent memory leak - keep only last 500 command IDs
    if (this.processedCommandIds.size > 1000) {
      const idsArray = Array.from(this.processedCommandIds);
      this.processedCommandIds = new Set(idsArray.slice(-500));
    }
    
    const handlers = this.commandHandlers.get(command.command_type as CommandType);
    
    try {
      if (handlers && handlers.length > 0) {
        console.log(`[SupabaseService] ⚙️ Executing command: ${command.command_type} (${command.id})`);
        // Execute only the FIRST handler to prevent duplicate actions from multiple registrations
        await handlers[0](command);
        console.log(`[SupabaseService] ✅ Command executed: ${command.command_type}`);
      } else {
        console.warn(`[SupabaseService] ⚠️ No handler for command type: ${command.command_type}`);
      }

      // Mark command as executed in database (fire-and-forget)
      this.markCommandExecuted(command.id, true);
    } catch (error) {
      console.error(`[SupabaseService] ❌ Error processing command ${command.id}:`, error);
      this.markCommandExecuted(command.id, false, String(error));
    } finally {
      // Remove from processing set (but keep in processed set to prevent re-execution)
      this.processingCommandIds.delete(command.id);
    }
  }

  /**
   * Mark a command as executed or failed
   * Updates database status for audit trail (fire-and-forget, non-blocking)
   */
  private markCommandExecuted(
    commandId: string, 
    success: boolean, 
    errorMessage?: string
  ): void {
    if (!this.client) return;

    console.log(`[SupabaseService] 📝 Marking command ${commandId} as ${success ? 'executed' : 'failed'}`);

    // Update database (fire-and-forget for minimal latency)
    this.client
      .from('admin_commands')
      .update({
        status: success ? 'executed' : 'failed',
        executed_at: new Date().toISOString(),
        execution_result: success ? { success: true } : { error: errorMessage }
      })
      .eq('id', commandId)
      .then(({ error }) => {
        if (error) {
          console.warn('[SupabaseService] Error marking command as executed:', error.message);
        }
      });
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

    // 2. Broadcast for instant delivery using persistent channel
    const commandId = data.id;
    try {
      // Get or create persistent channel for this player
      let commandChannel = this.commandSendChannels.get(targetPlayerId);
      if (!commandChannel) {
        commandChannel = this.client.channel(`djamms-commands:${targetPlayerId}`);
        await commandChannel.subscribe();
        this.commandSendChannels.set(targetPlayerId, commandChannel);
        logger.debug(`[SupabaseService] Created persistent command channel for player: ${targetPlayerId}`);
      }
      
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
    } catch (broadcastError) {
      console.warn('[SupabaseService] Broadcast failed (command still in DB):', broadcastError);
      // Remove failed channel from cache so it can be recreated
      this.commandSendChannels.delete(targetPlayerId);
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
   * Uses database function for efficiency
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.client || !this.playerId) return;

    // Try RPC function first (if it exists), otherwise use direct update
    // RPC function may not exist in all database instances, so we always have a fallback
    if (this.playerStateId) {
      // Use direct update (RPC function may not exist)
      const { error: updateError } = await this.client
        .from('player_state')
        .update({
          last_heartbeat: new Date().toISOString(),
          is_online: true
        })
        .eq('id', this.playerStateId);
      
      if (updateError) {
        logger.warn('[SupabaseService] Heartbeat update failed:', updateError);
      }
    } else {
      // Fallback: update by player_id if playerStateId not set
      const { error: updateError } = await this.client
        .from('player_state')
        .update({
          last_heartbeat: new Date().toISOString(),
          is_online: true
        })
        .eq('player_id', this.playerId);
      
      if (updateError) {
        logger.warn('[SupabaseService] Heartbeat update by player_id failed:', updateError);
      }
    }
  }

  // ==================== Local Video Indexing ====================

  /**
   * Check if database schema is correct by testing if file_path column exists
   */
  private async checkSchema(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Try to select file_path column - if it doesn't exist, we'll get PGRST204
      const { error: testError } = await this.client
        .from('local_videos')
        .select('file_path')
        .limit(1);

      // PGRST204 = column not found in schema cache
      if (testError && testError.code === 'PGRST204') {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('[SupabaseService] Error checking schema:', error);
      return false;
    }
  }

  /**
   * Index local videos to the local_videos Supabase table
   * This allows Admin Console and Kiosk to search the player's local library
   * 
   * @param playlists - Object mapping playlist names to video arrays
   * @param onProgress - Optional callback for progress updates (currentIndex, totalCount)
   * @param forceIndex - If true, skip count check and force indexing (for manual re-index)
   */
  public async indexLocalVideos(
    playlists: Record<string, Video[]>,
    onProgress?: (currentIndex: number, totalCount: number) => void,
    forceIndex: boolean = false
  ): Promise<void> {
    if (!this.client || !this.playerId) {
      console.warn('[SupabaseService] Cannot index videos - not initialized');
      return;
    }

    if (this.indexingInProgress) {
      console.log('[SupabaseService] Skipping indexing - already in progress');
      return;
    }

    // Count local videos from playlists
    const localVideoCount = Object.values(playlists).reduce((total, videos) => total + videos.length, 0);
    
    // Check if indexing is needed by comparing counts (unless forced)
    if (!forceIndex && localVideoCount > 0) {
      const supabaseCount = await this.getLocalVideosCount();
      if (supabaseCount === localVideoCount) {
        logger.info(`[SupabaseService] Index already up-to-date (${localVideoCount} videos). Skipping indexing.`);
        if (onProgress) {
          // Report completion immediately
          onProgress(localVideoCount, localVideoCount);
        }
        // Mark indexing as complete (even though we skipped it)
        this.indexingInProgress = false;
        return;
      } else {
        logger.info(`[SupabaseService] Index mismatch: Supabase has ${supabaseCount} videos, playlists have ${localVideoCount}. Re-indexing...`);
      }
    }

    this.indexingInProgress = true;

    try {
      // Check schema first
      const schemaOk = await this.checkSchema();
      if (!schemaOk) {
        logger.warn('[SupabaseService] Schema issue detected. Attempting to fix...');
        const fixed = await this.fixSchema();
        if (!fixed) {
          logger.error('[SupabaseService] ❌ Schema fix failed. Cannot proceed with indexing.');
          logger.error('[SupabaseService] Please run: db/fix-local-videos-schema.sql in Supabase Dashboard');
          if (onProgress) {
            onProgress(0, 0);
          }
          this.indexingInProgress = false;
          return;
        }
        // Re-check schema after fix
        const schemaOkAfterFix = await this.checkSchema();
        if (!schemaOkAfterFix) {
          logger.error('[SupabaseService] Schema still incorrect after fix attempt. Please run SQL manually.');
          if (onProgress) {
            onProgress(0, 0);
          }
          this.indexingInProgress = false;
          return;
        }
        logger.info('[SupabaseService] ✅ Schema fixed successfully');
      }

      // Flatten all videos from all playlists and deduplicate by path
      const allVideosRaw: Video[] = [];
      for (const videos of Object.values(playlists)) {
        allVideosRaw.push(...videos);
      }
      
      // Deduplicate by path (same video may appear in multiple playlists)
      const seen = new Set<string>();
      const allVideos = allVideosRaw.filter(video => {
        const key = video.path || video.file_path || video.src || `${video.title}|${video.artist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (allVideos.length === 0) {
        console.log('[SupabaseService] No videos to index');
        this.indexingInProgress = false;
        return;
      }

      console.log(`[SupabaseService] Indexing ${allVideos.length} unique local videos (${allVideosRaw.length - allVideos.length} duplicates removed)...`);

      // Mark all existing entries for this player as unavailable (soft maintenance window)
      const { error: markError } = await this.client
        .from('local_videos')
        .update({ is_available: false })
        .eq('player_id', this.playerId);

      if (markError) {
        console.error('[SupabaseService] Error marking existing videos unavailable:', markError);
      }

      // Convert videos to Supabase format
      const localVideoRecords = allVideos.map(video => {
        const filePath = video.path || video.file_path || video.src;
        const record: any = {
          player_id: this.playerId,
          title: video.title,
          artist: video.artist || null,
          file_path: filePath,
          filename: video.filename || filePath.split('/').pop() || 'unknown',
          duration: video.duration || null,
          is_available: true,
          metadata: {
            sourceType: 'local',
            playlist: video.playlist,
            playlistDisplayName: video.playlistDisplayName,
            filename: video.filename
          }
        };
        
        // Include 'path' column for backward compatibility if database still has it
        // Set it to same value as file_path to satisfy NOT NULL constraint
        record.path = filePath;
        
        return record;
      });

      // Report initial progress with total count
      const totalCount = localVideoRecords.length;
      if (onProgress) {
        onProgress(0, totalCount);
      }

      // Upsert in batches to avoid payload limits
      const batchSize = 200;
      let upsertedCount = 0;

      for (let i = 0; i < localVideoRecords.length; i += batchSize) {
        const batch = localVideoRecords.slice(i, i + batchSize);
        
        // Try upsert with file_path
        const { error: upsertError } = await this.client
          .from('local_videos')
          .upsert(batch, { onConflict: 'player_id,file_path' });

        if (upsertError) {
          // If schema error (PGRST204 = column not found), try to fix it
          if (upsertError.code === 'PGRST204') {
            logger.error('[SupabaseService] Schema error detected. Attempting to fix...');
            const fixed = await this.fixSchema();
            if (!fixed) {
              logger.error('[SupabaseService] Failed to fix schema automatically. Please run SQL manually.');
              break;
            }
            // Retry the upsert after schema fix
            const { error: retryError } = await this.client
              .from('local_videos')
              .upsert(batch, { onConflict: 'player_id,file_path' });
            if (retryError) {
              console.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1} after schema fix:`, retryError);
            } else {
              upsertedCount += batch.length;
            }
          } else {
            console.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1}:`, upsertError);
          }
        } else {
          upsertedCount += batch.length;
        }
        
        // Report progress after each batch
        if (onProgress) {
          onProgress(upsertedCount, totalCount);
        }
      }

      console.log(`[SupabaseService] Indexed (upserted) ${upsertedCount}/${allVideos.length} videos`);
    } catch (error) {
      console.error('[SupabaseService] Video indexing exception:', error);
    } finally {
      this.indexingInProgress = false;
    }
  }

  /**
   * Fix database schema by calling RPC function or providing SQL instructions
   */
  private async fixSchema(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Try to call RPC function to fix schema (if it exists)
      const { data, error: rpcError } = await this.client.rpc('fix_local_videos_schema');
      
      if (!rpcError && data) {
        const result = data as { fixed?: boolean; changes?: string[]; error?: string };
        if (result.fixed) {
          logger.info('[SupabaseService] ✅ Schema fixed via RPC function');
          if (result.changes && result.changes.length > 0) {
            logger.info(`[SupabaseService] Changes: ${result.changes.join(', ')}`);
          }
          // Wait longer for schema cache to update (PostgREST caches schema)
          logger.info('[SupabaseService] Waiting for schema cache refresh...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          return true;
        } else if (result.error) {
          logger.error(`[SupabaseService] RPC function returned error: ${result.error}`);
        }
      }

      // RPC function doesn't exist - provide instructions
      logger.error('[SupabaseService] ❌ Schema fix RPC function not found.');
      logger.error('[SupabaseService] To enable automatic schema fixes:');
      logger.error('[SupabaseService] 1. Run: db/create-schema-fix-rpc.sql in Supabase Dashboard');
      logger.error('[SupabaseService] 2. Then run: db/fix-local-videos-schema.sql to fix current schema');
      logger.error('[SupabaseService] After that, the app will auto-fix schema issues in the future.');
      
      return false;
    } catch (error) {
      logger.error('[SupabaseService] Error attempting schema fix:', error);
      return false;
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

  // ==================== Search & Browse (PostgreSQL Full-Text Search) ====================

  /**
   * Search videos using PostgreSQL full-text search
   * @param query - Search query string
   * @param scope - 'all' | 'karaoke' | 'no-karaoke'
   * @param limit - Max results (default 100)
   * @param offset - Pagination offset (default 0)
   */
  public async searchVideos(
    query: string,
    scope: string = 'all',
    limit: number = 100,
    offset: number = 0
  ): Promise<Video[]> {
    if (!this.client) {
      console.error('[SupabaseService] Client not initialized for search');
      return [];
    }

    try {
      const { data, error } = await this.client.rpc('search_videos', {
        search_query: query,
        scope: scope,
        result_limit: limit,
        result_offset: offset
      });

      if (error) {
        console.error('[SupabaseService] Search error:', error);
        return [];
      }

      // Transform database results to Video format
      return (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        path: row.path,
        src: row.path, // Use path as src for local files
        playlist: row.playlist,
        playlistDisplayName: row.playlist_display_name,
        duration: row.duration
      }));
    } catch (error) {
      console.error('[SupabaseService] Search exception:', error);
      return [];
    }
  }

  /**
   * Browse videos with sorting and filtering
   * @param scope - 'all' | 'karaoke' | 'no-karaoke'
   * @param sortBy - 'title' | 'artist' | 'playlist'
   * @param sortDir - 'asc' | 'desc'
   * @param limit - Max results (default 100)
   * @param offset - Pagination offset (default 0)
   */
  public async browseVideos(
    scope: string = 'all',
    sortBy: string = 'title',
    sortDir: string = 'asc',
    limit: number = 100,
    offset: number = 0
  ): Promise<Video[]> {
    if (!this.client) {
      console.error('[SupabaseService] Client not initialized for browse');
      return [];
    }

    try {
      const { data, error } = await this.client.rpc('browse_videos', {
        scope: scope,
        sort_by: sortBy,
        sort_dir: sortDir,
        result_limit: limit,
        result_offset: offset
      });

      if (error) {
        console.error('[SupabaseService] Browse error:', error);
        return [];
      }

      // Transform database results to Video format
      return (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        path: row.path,
        src: row.path, // Use path as src for local files
        playlist: row.playlist,
        playlistDisplayName: row.playlist_display_name,
        duration: row.duration
      }));
    } catch (error) {
      console.error('[SupabaseService] Browse exception:', error);
      return [];
    }
  }

  /**
   * Get total video count for pagination
   * @param scope - 'all' | 'karaoke' | 'no-karaoke'
   */
  public async countVideos(scope: string = 'all'): Promise<number> {
    if (!this.client) {
      return 0;
    }

    try {
      const { data, error } = await this.client.rpc('count_videos', {
        scope: scope
      });

      if (error) {
        console.error('[SupabaseService] Count error:', error);
        return 0;
      }

      return data || 0;
    } catch (error) {
      console.error('[SupabaseService] Count exception:', error);
      return 0;
    }
  }

  /**
   * Get count of available videos in Supabase for the current player_id
   * Used to check if indexing is needed
   */
  public async getLocalVideosCount(): Promise<number> {
    if (!this.client || !this.playerId) {
      return 0;
    }

    try {
      const { count, error } = await this.client
        .from('local_videos')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', this.playerId)
        .eq('is_available', true);

      if (error) {
        logger.error('[SupabaseService] Error counting local videos:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      logger.error('[SupabaseService] Exception counting local videos:', error);
      return 0;
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
