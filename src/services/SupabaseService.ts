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
// @ts-ignore - fast-deep-equal has inconsistent export types
import isEqual from 'fast-deep-equal/es6/index.js';
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
import { mergeQueueUpdates, MergeQueueOptions } from '../utils/queueMerge';
import { getIOLogger } from './IOLogger';

// Event types for command handlers
export type CommandHandler = (command: SupabaseCommand) => Promise<void> | void;

// Offline queue handling type
interface QueuedQueueUpdate {
  activeQueue: QueueVideoItem[];
  priorityQueue: QueueVideoItem[];
  timestamp: number;
  retryCount: number;
}

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
  private playerStateChannel: RealtimeChannel | null = null; // Realtime subscription for player_state updates
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private stateSyncTimeout: ReturnType<typeof setTimeout> | null = null;
  private indexingInProgress: boolean = false;
  private broadcastChannelStatus: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT' | 'UNKNOWN' = 'UNKNOWN';
  
  // Schema fix tracking - prevent repeated attempts
  private schemaFixAttempted: boolean = false;
  private schemaFixFailed: boolean = false;
  
  // Track which columns exist in the database to avoid schema errors
  private metadataColumnExists: boolean | null = null; // null = not checked yet
  private pathColumnExists: boolean | null = null; // null = not checked yet
  
  // Error tracking to suppress spam during long runtime
  private consecutiveStateSyncErrors = 0;
  private lastErrorLogTime = 0;
  private readonly ERROR_SUPPRESSION_MS = 60000; // Only log errors once per minute
  
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
  
  // Request deduplication
  private pendingStateSyncRequest: { requestId: string; timeoutId: ReturnType<typeof setTimeout> } | null = null;
  private activeStateSyncRequest: { requestId: string; promise: Promise<void>; abortController: AbortController } | null = null;
  private lastSyncTime: number = 0;
  private readonly MIN_SYNC_INTERVAL_MS = 100; // Minimum 100ms between syncs to prevent rapid-fire duplicates

  // Connection state management
  private connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private queuedCommands: Array<{ command: SupabaseCommand; timestamp: number }> = [];
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 10;
  private reconnectionBackoffMs = 1000; // Start with 1 second
  private reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionStatusCallbacks: Set<(status: 'connected' | 'disconnected' | 'reconnecting') => void> = new Set();

  // Queue sync and conflict resolution
  private lastQueueUpdateTime: string | null = null; // Timestamp of last successful queue write
  private queueUpdateCallbacks: Set<(queue: QueueVideoItem[], priorityQueue: QueueVideoItem[]) => void> = new Set();
  private isTransitioning: boolean = false; // Flag to prevent writes during crossfade/swap
  private transitionLockCallbacks: Set<(isTransitioning: boolean) => void> = new Set();
  private isProcessingRemoteUpdate: boolean = false; // Flag to prevent sync during remote update processing

  // Offline queue handling
  private queuedQueueUpdates: QueuedQueueUpdate[] = [];
  private retryQueueTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastDuplicateSkipLogTime: number = 0; // Rate limit duplicate skip logs
  private readonly DUPLICATE_SKIP_LOG_INTERVAL_MS = 2000; // Only log duplicate skip once per 2 seconds

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
    const newPlayerId = playerId || DEFAULT_PLAYER_ID;
    
    // If already initialized but player ID changed, we need to re-initialize
    if (this.isInitialized && this.playerId !== newPlayerId) {
      logger.info(`[SupabaseService] Player ID changed from ${this.playerId} to ${newPlayerId} - re-initializing`);
      this.isInitialized = false;
      this.isOnline = false;
      // Clear existing subscriptions
      if (this.commandChannel) {
        this.commandChannel.unsubscribe();
        this.commandChannel = null;
      }
    } else if (this.isInitialized) {
      logger.info('[SupabaseService] Already initialized with same player ID');
      return true;
    }

    try {
      this.playerId = newPlayerId;
      
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

      // CRITICAL: Electron Player should NOT subscribe to its own player_state updates
      // This causes recursion loops: Player writes → Supabase broadcasts → Player receives own update → Processes → Writes again → Loop
      // Only Web Admin and Web Kiosk should subscribe to player_state updates (they use subscribeToPlayerState from web/shared/supabase-client.ts)
      // The Electron Player is the authoritative writer and should only WRITE to Supabase, not read its own updates
      // await this.startPlayerStateSubscription(); // DISABLED - prevents recursion

      // Initialize IO Logger with Supabase client
      const { getIOLogger } = await import('./IOLogger');
      const ioLogger = getIOLogger();
      await ioLogger.initialize(this.client, this.playerId);

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      this.isOnline = true;
      // Set connection status to 'connected' after successful initialization
      // This allows queue syncs to proceed immediately instead of being queued
      this.setConnectionStatus('connected');
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

    // Command polling removed - using Broadcast channel only

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

    if (this.playerStateChannel) {
      await this.playerStateChannel.unsubscribe();
      this.playerStateChannel = null;
    }

    // Unsubscribe from all command send channels
    for (const [playerId, channel] of this.commandSendChannels.entries()) {
      await channel.unsubscribe();
    }
    this.commandSendChannels.clear();

    // Clear retry queue timeout
    if (this.retryQueueTimeout) {
      clearTimeout(this.retryQueueTimeout);
      this.retryQueueTimeout = null;
    }

    this.isInitialized = false;
    this.isOnline = false;
    logger.info('[SupabaseService] Shutdown complete');
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
        // Use maybeSingle() instead of single() to handle case when no rows exist (prevents 406 error)
        const { data: existing, error: fetchError } = await this.client!
          .from('player_state')
          .select('id')
          .eq('player_id', this.playerId)
          .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
          // PGRST116 = no rows found (not an error for us)
          logger.warn('[SupabaseService] Error fetching player state (non-critical):', fetchError.message);
        }

        if (existing) {
          this.playerStateId = existing.id;
          logger.info(`[SupabaseService] Found existing player state: ${this.playerStateId}`);
          
          // CRITICAL: Initialize lastSyncedState with existing database state
          // This ensures active_queue and priority_queue are always available for preservation in updates
          const { data: fullState, error: stateError } = await this.client!
            .from('player_state')
            .select('*')
            .eq('id', this.playerStateId)
            .maybeSingle();
          
          if (!stateError && fullState) {
            // Initialize lastSyncedState with existing database state
            // Ensure active_queue and priority_queue default to empty arrays if null/undefined
            this.lastSyncedState = {
              ...fullState,
              active_queue: fullState.active_queue || [],
              priority_queue: fullState.priority_queue || []
            } as SupabasePlayerState;
            logger.info(`[SupabaseService] ✅ Initialized lastSyncedState with existing DB state (active_queue: ${this.lastSyncedState.active_queue?.length || 0}, priority_queue: ${this.lastSyncedState.priority_queue?.length || 0})`);
          } else if (stateError) {
            logger.warn('[SupabaseService] Failed to fetch full player state for lastSyncedState initialization:', stateError.message);
            // Initialize with empty arrays as fallback
            this.lastSyncedState = {
              active_queue: [],
              priority_queue: []
            } as Partial<SupabasePlayerState>;
          }
          
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
              is_online: true,
              volume: 1.0,
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
          
          // Initialize lastSyncedState with empty queues for new player state
          this.lastSyncedState = {
            active_queue: [],
            priority_queue: []
          } as Partial<SupabasePlayerState>;
          logger.info('[SupabaseService] ✅ Initialized lastSyncedState with empty queues for new player state');
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
      logger.error('[SupabaseService] Error updating online status:', error);
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
    // #region agent log
    if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
      (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:367',message:'syncPlayerState called',data:{hasActiveQueue:state.activeQueue!==undefined,activeQueueLength:state.activeQueue?.length,hasPriorityQueue:state.priorityQueue!==undefined,hasCurrentVideo:state.currentVideo!==undefined,currentVideoId:state.currentVideo?.id,immediate,lastSyncedHasQueue:this.lastSyncedState?.active_queue!==undefined,lastSyncedQueueLength:this.lastSyncedState?.active_queue?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'}).catch(()=>{});
    }
    // #endregion
    // If transitioning, queue the update instead of writing immediately
    if (this.isTransitioning && (state.activeQueue !== undefined || state.priorityQueue !== undefined)) {
      logger.debug('[SupabaseService] Transition in progress, queueing queue update');
      this.queueQueueUpdate(state.activeQueue, state.priorityQueue);
      return;
    }

    // If offline, queue the update and RETURN EARLY (don't continue processing)
    if (this.connectionStatus === 'disconnected' || this.connectionStatus === 'reconnecting') {
      if (state.activeQueue !== undefined || state.priorityQueue !== undefined) {
        // Only queue if it's different from the last queued update (prevent duplicates)
        const shouldQueue = this.shouldQueueUpdate(state.activeQueue, state.priorityQueue);
        if (shouldQueue) {
          logger.debug('[SupabaseService] Offline, queueing queue update');
          this.queueQueueUpdate(state.activeQueue, state.priorityQueue);
        } else {
          // Rate limit duplicate skip logs to prevent spam (only log once per interval)
          const now = Date.now();
          if (now - this.lastDuplicateSkipLogTime >= this.DUPLICATE_SKIP_LOG_INTERVAL_MS) {
            logger.debug('[SupabaseService] Offline, skipping duplicate queue update (will retry on reconnect)');
            this.lastDuplicateSkipLogTime = now;
          }
        }
      }
      // Return early - don't continue processing when offline
      return;
    }
    const requestId = crypto.randomUUID();
    
    // Cancel any pending debounced request
    const pendingRequest = this.pendingStateSyncRequest;
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeoutId);
      this.pendingStateSyncRequest = null;
    }
    
    // Clear the old debounce timeout
    if (this.stateSyncTimeout) {
      clearTimeout(this.stateSyncTimeout);
      this.stateSyncTimeout = null;
    }

    if (immediate) {
      // Cancel any pending request and sync immediately
      const pendingRequest = this.pendingStateSyncRequest;
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeoutId);
        this.pendingStateSyncRequest = null;
      }
      // If there's an active request, cancel it and start new one
      if (this.activeStateSyncRequest) {
        // Cancel the previous request
        this.activeStateSyncRequest.abortController.abort();
        logger.debug('[SupabaseService] Cancelled previous state sync request');
      }
      // Start new sync immediately
      this.performStateSyncWithDedup(state, requestId);
    } else {
      // Debounce rapid updates - cancel previous request if new one arrives
      this.pendingStateSyncRequest = {
        requestId,
        timeoutId: setTimeout(() => {
          this.pendingStateSyncRequest = null;
          this.performStateSyncWithDedup(state, requestId);
        }, STATE_SYNC_DEBOUNCE)
      };
    }
  }

  /**
   * Perform state sync with request deduplication
   */
  private async performStateSyncWithDedup(
    state: {
      status?: string;
      isPlaying?: boolean;
      currentVideo?: Video | null;
      currentPosition?: number;
      volume?: number;
      activeQueue?: Video[];
      priorityQueue?: Video[];
      queueIndex?: number;
    },
    requestId: string
  ): Promise<void> {
    // Rate limiting: prevent rapid-fire duplicate syncs
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;
    if (timeSinceLastSync < this.MIN_SYNC_INTERVAL_MS && !this.isProcessingRemoteUpdate) {
      logger.debug(`[SupabaseService] Rate limiting sync (${timeSinceLastSync}ms since last sync, min ${this.MIN_SYNC_INTERVAL_MS}ms)`);
      // Reschedule for later
      setTimeout(() => {
        this.performStateSyncWithDedup(state, requestId);
      }, this.MIN_SYNC_INTERVAL_MS - timeSinceLastSync);
      return;
    }
    
    // If there's already an active request, cancel it
    if (this.activeStateSyncRequest) {
      this.activeStateSyncRequest.abortController.abort();
      logger.debug('[SupabaseService] Cancelled previous state sync request');
    }
    
    // Create abort controller for this request
    const abortController = new AbortController();
    
    // Mark this as the active request
    const syncPromise = this.performStateSync(state, abortController.signal);
    this.activeStateSyncRequest = { requestId, promise: syncPromise, abortController };
    
    try {
      await syncPromise;
      // Update last sync time on success
      this.lastSyncTime = Date.now();
    } catch (error: any) {
      // Ignore abort errors (expected when cancelled)
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        logger.debug('[SupabaseService] State sync request was cancelled');
        return;
      }
      throw error;
    } finally {
      // Clear active request when done
      if (this.activeStateSyncRequest?.requestId === requestId) {
        this.activeStateSyncRequest = null;
      }
    }
  }

  /**
   * Perform the actual state sync to Supabase
   */
  private async performStateSync(
    state: {
      status?: string;
      isPlaying?: boolean;
      currentVideo?: Video | null;
      currentPosition?: number;
      volume?: number;
      activeQueue?: Video[];
      priorityQueue?: Video[];
      queueIndex?: number;
    },
    abortSignal: AbortSignal
  ): Promise<void> {
    if (!this.client || !this.playerStateId) {
      logger.warn('Cannot sync state - SupabaseService not initialized');
      return;
    }

    // Check if request was cancelled before starting
    if (abortSignal.aborted) {
      throw new DOMException('Request was cancelled', 'AbortError');
    }

    try {
      const updateData: Partial<SupabasePlayerState> = {
        last_updated: new Date().toISOString()
      };

      // Map local state to Supabase schema
      if (state.status !== undefined) {
        updateData.status = state.status as SupabasePlayerState['status'];
      }

      // Note: is_playing column doesn't exist in schema - use status instead
      if (state.isPlaying !== undefined) {
        updateData.status = state.isPlaying ? 'playing' : 'paused';
      }

      if (state.currentVideo !== undefined) {
        updateData.now_playing_video = state.currentVideo 
          ? this.videoToNowPlaying(state.currentVideo)
          : null;
      } else {
        // Preserve now_playing_video from last synced state if not provided
        // This prevents clearing now_playing_video when only other fields change
        if (this.lastSyncedState?.now_playing_video !== undefined) {
          updateData.now_playing_video = this.lastSyncedState.now_playing_video;
        }
      }

      if (state.currentPosition !== undefined) {
        updateData.current_position = state.currentPosition;
        // Note: playback_position column doesn't exist in schema - use current_position instead
        // updateData.playback_position = Math.floor(state.currentPosition);
      }

      if (state.volume !== undefined) {
        updateData.volume = state.volume;
        // Note: volume_level column doesn't exist in schema - use volume instead
        // updateData.volume_level = state.volume;
      }

      // Always sync queues (even if empty) to ensure Web Admin shows correct state
      // IMPORTANT: If state.activeQueue is explicitly provided (even if empty array), sync it
      // Only preserve old data if activeQueue is truly undefined (not provided)
      if (state.activeQueue !== undefined) {
        updateData.active_queue = state.activeQueue.map(v => this.videoToQueueItem(v));
      } else {
        // CRITICAL: Always preserve active_queue from lastSyncedState if it exists
        // This ensures Web Admin receives queue data in every Realtime update, even when only other fields change
        // Without this, partial updates (e.g., only now_playing_video) would not include active_queue
        // Check for both existence and non-null (empty arrays are valid)
        if (this.lastSyncedState?.active_queue !== undefined && this.lastSyncedState?.active_queue !== null) {
          updateData.active_queue = this.lastSyncedState.active_queue;
          logger.debug('[SupabaseService] Preserving active_queue from lastSyncedState for partial update');
        }
      }

      // Same logic for priority queue
      if (state.priorityQueue !== undefined) {
        // Remove duplicates from priority queue before syncing (prevent corruption)
        const uniquePriorityQueue = state.priorityQueue.filter((video, index, self) => {
          const videoId = video.id || video.src;
          return index === self.findIndex(v => (v.id || v.src) === videoId);
        });
        
        if (uniquePriorityQueue.length !== state.priorityQueue.length) {
          logger.warn(`[SupabaseService] Removed ${state.priorityQueue.length - uniquePriorityQueue.length} duplicate(s) from priority queue before sync`);
        }
        
        updateData.priority_queue = uniquePriorityQueue.map(v => this.videoToQueueItem(v));
      } else {
        // Only preserve if priorityQueue was not provided at all (undefined)
        // Check for both existence and non-null (empty arrays are valid)
        if (this.lastSyncedState?.priority_queue !== undefined && this.lastSyncedState?.priority_queue !== null) {
          updateData.priority_queue = this.lastSyncedState.priority_queue;
        }
      }

      // ARCHITECTURE: Index 0 is always now-playing - always send queue_index: 0
      // The queue_index column exists in the database schema (added in migration 20241204_add_queue_index.sql)
      // Always set to 0 since index 0 of active_queue is always the now-playing video
      updateData.queue_index = 0;

      // CRITICAL: ALWAYS include active_queue and priority_queue in updates if they exist in lastSyncedState
      // This ensures Web Admin receives queue data in EVERY Realtime update, even for partial updates
      // This is a fallback in case the above logic didn't catch it (defensive programming)
      // IMPORTANT: This is especially critical for SKIP operations where queueIndex changes
      // Check for both undefined AND null to catch all cases
      if (updateData.active_queue === undefined || updateData.active_queue === null) {
        if (this.lastSyncedState?.active_queue !== undefined && this.lastSyncedState?.active_queue !== null) {
          updateData.active_queue = this.lastSyncedState.active_queue;
          logger.debug('[SupabaseService] Fallback: Including active_queue from lastSyncedState to ensure Web Admin receives it');
        } else {
          // CRITICAL FIX: If lastSyncedState doesn't have active_queue, fetch it from the database
          // This ensures we always include queue data in updates, preventing WEBADMIN from showing stale data
          // This should be rare - only happens if lastSyncedState was never initialized or got cleared
          logger.warn('[SupabaseService] ⚠️ lastSyncedState missing active_queue - fetching from database to ensure WEBADMIN receives queue data');
          
          // #region agent log
          if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
            (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:619',message:'Fetching active_queue from DB - lastSyncedState missing it',data:{hasLastSyncedState:!!this.lastSyncedState,lastSyncedStateKeys:this.lastSyncedState?Object.keys(this.lastSyncedState):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'}).catch(()=>{});
          }
          // #endregion
          
          try {
            const currentState = await this.fetchPlayerState();
            if (currentState?.active_queue !== undefined && currentState?.active_queue !== null) {
              updateData.active_queue = currentState.active_queue;
              // Also update lastSyncedState so we don't need to fetch again on next sync
              if (!this.lastSyncedState) {
                this.lastSyncedState = {};
              }
              this.lastSyncedState.active_queue = currentState.active_queue;
              logger.info('[SupabaseService] ✅ Fetched active_queue from database and included in update (length: ' + currentState.active_queue.length + ')');
              
              // #region agent log
              if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
                (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:633',message:'Successfully fetched active_queue from DB',data:{queueLength:currentState.active_queue.length,hasPriorityQueue:currentState.priority_queue!==undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'}).catch(()=>{});
              }
              // #endregion
            } else {
              // Even if database doesn't have it, use empty array instead of undefined
              // This ensures WEBADMIN receives a valid (empty) queue rather than undefined
              updateData.active_queue = [];
              logger.warn('[SupabaseService] ⚠️ Database also missing active_queue - using empty array to prevent undefined in Realtime update');
            }
          } catch (fetchError) {
            logger.error('[SupabaseService] ❌ Failed to fetch active_queue from database:', fetchError);
            // Last resort: use empty array instead of undefined
            // This is critical - undefined active_queue causes WEBADMIN to preserve stale data
            updateData.active_queue = [];
            logger.warn('[SupabaseService] ⚠️ Using empty array as fallback for active_queue (prevents undefined in Realtime)');
          }
        }
      }
      // Check for both undefined AND null to catch all cases
      if (updateData.priority_queue === undefined || updateData.priority_queue === null) {
        if (this.lastSyncedState?.priority_queue !== undefined && this.lastSyncedState?.priority_queue !== null) {
          updateData.priority_queue = this.lastSyncedState.priority_queue;
          logger.debug('[SupabaseService] Fallback: Including priority_queue from lastSyncedState to ensure Web Admin receives it');
        } else {
          // CRITICAL FIX: If lastSyncedState doesn't have priority_queue, fetch it from the database
          // This should be rare - only happens if lastSyncedState was never initialized or got cleared
          logger.warn('[SupabaseService] ⚠️ lastSyncedState missing priority_queue - fetching from database');
          try {
            const currentState = await this.fetchPlayerState();
            if (currentState?.priority_queue !== undefined && currentState?.priority_queue !== null) {
              updateData.priority_queue = currentState.priority_queue;
              // Also update lastSyncedState so we don't need to fetch again on next sync
              if (!this.lastSyncedState) {
                this.lastSyncedState = {};
              }
              this.lastSyncedState.priority_queue = currentState.priority_queue;
              logger.info('[SupabaseService] ✅ Fetched priority_queue from database and included in update (length: ' + currentState.priority_queue.length + ')');
            } else {
              // Use empty array instead of undefined
              updateData.priority_queue = [];
              logger.warn('[SupabaseService] ⚠️ Database also missing priority_queue - using empty array');
            }
          } catch (fetchError) {
            logger.error('[SupabaseService] ❌ Failed to fetch priority_queue from database:', fetchError);
            updateData.priority_queue = [];
            logger.warn('[SupabaseService] ⚠️ Using empty array as fallback for priority_queue');
          }
        }
      }
      
      // CRITICAL FINAL CHECK: Ensure active_queue is NEVER undefined or null in updateData
      // This is the last chance to prevent undefined/null from being sent to Supabase
      // If active_queue is still undefined or null after all the above logic, use empty array
      if (updateData.active_queue === undefined || updateData.active_queue === null) {
        logger.warn('[SupabaseService] ⚠️ CRITICAL: active_queue is still undefined/null after all preservation logic - using empty array');
        updateData.active_queue = [];
      }
      
      // ARCHITECTURE VALIDATION: Ensure activeQueue[0] always matches now_playing_video
      // Index 0 is always now-playing - validate this invariant
      if (updateData.active_queue && updateData.active_queue.length > 0 && updateData.now_playing_video) {
        const index0Video = updateData.active_queue[0];
        const nowPlayingId = updateData.now_playing_video.id || updateData.now_playing_video.src;
        const index0Id = index0Video.id || index0Video.src;
        
        if (index0Id !== nowPlayingId) {
          logger.warn('[SupabaseService] ⚠️ ARCHITECTURE VIOLATION: activeQueue[0] does not match now_playing_video');
          logger.warn('[SupabaseService] activeQueue[0]:', index0Video.title, 'id:', index0Id);
          logger.warn('[SupabaseService] now_playing_video:', updateData.now_playing_video.title, 'id:', nowPlayingId);
          // Fix: Move now_playing_video to index 0
          const queueWithoutNowPlaying = updateData.active_queue.filter((v: any) => {
            const vid = v.id || v.src;
            return vid !== nowPlayingId;
          });
          updateData.active_queue = [updateData.now_playing_video, ...queueWithoutNowPlaying];
          logger.info('[SupabaseService] ✅ Fixed: Moved now_playing_video to index 0');
        }
      }
      
      // #region agent log
      if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
        (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:622',message:'updateData before DB write',data:{hasActiveQueue:updateData.active_queue!==undefined,activeQueueLength:updateData.active_queue?.length,hasPriorityQueue:updateData.priority_queue!==undefined,hasNowPlaying:updateData.now_playing_video!==undefined,nowPlayingId:updateData.now_playing_video?.id,lastSyncedHasQueue:this.lastSyncedState?.active_queue!==undefined,lastSyncedQueueLength:this.lastSyncedState?.active_queue?.length,updateDataKeys:Object.keys(updateData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'}).catch(()=>{});
      }
      // #endregion
      
      // Check if we have queue data after all the above logic
      const hasQueueData = updateData.active_queue !== undefined || updateData.priority_queue !== undefined;
      
      // Also check if now_playing_video is provided (important for Web Admin display)
      const hasNowPlaying = updateData.now_playing_video !== undefined;
      
      // Only update if something changed OR if we have queue/now_playing data to sync
      if (Object.keys(updateData).length <= 1 && !hasQueueData && !hasNowPlaying) {
        // #region agent log
        if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:625',message:'Skipping sync - no meaningful data',data:{updateDataKeys:Object.keys(updateData),hasQueueData,hasNowPlaying},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'}).catch(()=>{});
        }
        // #endregion
        return; // Only last_updated and no meaningful data, skip
      }

      // Skip sync if we're currently processing a remote update (prevents recursion loop)
      if (this.isProcessingRemoteUpdate) {
        // #region agent log
        if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:630',message:'Skipping sync - processing remote update',data:{hasQueueData,hasNowPlaying},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'}).catch(()=>{});
        }
        // #endregion
        logger.debug('[SupabaseService] Skipping state sync - processing remote update');
        return;
      }

      // Deep equality check: skip sync if state is truly unchanged
      // For queue data, check if it's actually different from last synced state
      if (hasQueueData) {
        // Check if queue data is actually different from last synced
        const lastActiveQueue = this.lastSyncedState?.active_queue || [];
        const lastPriorityQueue = this.lastSyncedState?.priority_queue || [];
        const newActiveQueue = updateData.active_queue || [];
        const newPriorityQueue = updateData.priority_queue || [];
        
        // Compare queue lengths first (quick check)
        const activeQueueLengthChanged = lastActiveQueue.length !== newActiveQueue.length;
        const priorityQueueLengthChanged = lastPriorityQueue.length !== newPriorityQueue.length;
        
        // If lengths changed, queues definitely changed
        if (activeQueueLengthChanged || priorityQueueLengthChanged) {
          logger.debug('Syncing state with queue data (queue length changed)');
        } else {
          // Lengths are same - check if content OR order is different
          // Compare both content (ID sets) and order (ID sequence) to catch shuffle operations
          const lastActiveIds = new Set(lastActiveQueue.map(item => item.id));
          const newActiveIds = new Set(newActiveQueue.map(item => item.id));
          const activeQueueContentChanged = lastActiveIds.size !== newActiveIds.size ||
            [...lastActiveIds].some(id => !newActiveIds.has(id));
          
          // Check if order changed (compare ID sequences, not just sets)
          const lastActiveIdSequence = lastActiveQueue.map(item => item.id);
          const newActiveIdSequence = newActiveQueue.map(item => item.id);
          const activeQueueOrderChanged = lastActiveIdSequence.length === newActiveIdSequence.length &&
            lastActiveIdSequence.some((id, index) => id !== newActiveIdSequence[index]);
          
          const lastPriorityIds = new Set(lastPriorityQueue.map(item => item.id));
          const newPriorityIds = new Set(newPriorityQueue.map(item => item.id));
          const priorityQueueContentChanged = lastPriorityIds.size !== newPriorityIds.size ||
            [...lastPriorityIds].some(id => !newPriorityIds.has(id));
          
          // Check if priority queue order changed
          const lastPriorityIdSequence = lastPriorityQueue.map(item => item.id);
          const newPriorityIdSequence = newPriorityQueue.map(item => item.id);
          const priorityQueueOrderChanged = lastPriorityIdSequence.length === newPriorityIdSequence.length &&
            lastPriorityIdSequence.some((id, index) => id !== newPriorityIdSequence[index]);
          
          // If queue content AND order haven't changed, check if other fields changed
          if (!activeQueueContentChanged && !activeQueueOrderChanged && 
              !priorityQueueContentChanged && !priorityQueueOrderChanged) {
            // Check if other fields changed (including now_playing_video, status, etc.)
            const otherFieldsChanged = Object.keys(updateData).some(key => {
              // Skip queue fields and last_updated in this check (already handled above)
              if (key === 'active_queue' || key === 'priority_queue' || key === 'last_updated') return false;
              // Check if field value actually changed (deep equality for objects like now_playing_video)
              const lastValue = this.lastSyncedState?.[key as keyof SupabasePlayerState];
              const newValue = updateData[key as keyof SupabasePlayerState];
              return !isEqual(lastValue, newValue);
            });
            
            // IMPORTANT: Even if nothing changed, we should still sync if we have queue data
            // This ensures Web Admin always receives the current queue state in Realtime updates
            // Only skip if truly no queue data AND no other fields changed
            if (!otherFieldsChanged && !hasQueueData) {
              logger.debug('[SupabaseService] Skipping state sync - queue content and order unchanged, no other fields changed');
              return;
            }
            
            // If we have queue data (even if unchanged), we should sync to ensure Web Admin receives it
            if (hasQueueData) {
              logger.debug('[SupabaseService] Syncing state - including queue data to ensure Web Admin receives current state');
            }
          }
          
          if (activeQueueOrderChanged || priorityQueueOrderChanged) {
            logger.debug('Syncing state with queue data (queue order changed)');
          } else {
            logger.debug('Syncing state with queue data (queue content changed or other fields changed)');
          }
        }
      } else if (this.lastSyncedState && isEqual(this.lastSyncedState, updateData)) {
        // Only skip if no queue data and everything else is identical
        // #region agent log
        if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:711',message:'Skipping sync - deep equality match',data:{hasQueueData,hasNowPlaying,updateDataKeys:Object.keys(updateData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'}).catch(()=>{});
        }
        // #endregion
        logger.debug('Skipping state sync - no changes detected (deep equality, no queue data)');
        return;
      }

      // Check again if request was cancelled before making the request
      if (abortSignal.aborted) {
        throw new DOMException('Request was cancelled', 'AbortError');
      }

      // #region agent log
      if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
        (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:624',message:'syncing state to Supabase',data:{nowPlaying:updateData.now_playing_video?.title,queueLength:updateData.active_queue?.length,queueIndex:state.queueIndex,priorityLength:updateData.priority_queue?.length,hasQueueData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}).catch(()=>{});
      }
      // #endregion
      logger.debug('Syncing state to Supabase', {
        now_playing: updateData.now_playing_video?.title,
        status: updateData.status,
        queue_length: updateData.active_queue?.length,
        // queue_index: updateData.queue_index, // Column doesn't exist in schema
        priority_length: updateData.priority_queue?.length,
        has_queue_data: hasQueueData,
        immediate: abortSignal.aborted ? false : 'checking...' // Will be set if immediate
      });
      
      // Log queue changes for debugging
      if (hasQueueData && this.lastSyncedState) {
        const prevActiveLength = this.lastSyncedState.active_queue?.length || 0;
        const prevPriorityLength = this.lastSyncedState.priority_queue?.length || 0;
        const newActiveLength = updateData.active_queue?.length || 0;
        const newPriorityLength = updateData.priority_queue?.length || 0;
        
        if (prevActiveLength !== newActiveLength || prevPriorityLength !== newPriorityLength) {
          logger.info(`[SupabaseService] Queue state changed: active ${prevActiveLength}→${newActiveLength}, priority ${prevPriorityLength}→${newPriorityLength}`);
        }
      }

      // Log IO event
      const requestStr = JSON.stringify({
        type: 'state_sync',
        status: updateData.status,
        queue_length: updateData.active_queue?.length,
        priority_length: updateData.priority_queue?.length
      }, null, 2);
      const requestId = await getIOLogger().logSent('supabase', requestStr, 'player_state');

      // ABSOLUTE FINAL CHECK: Ensure active_queue and priority_queue are ALWAYS included before sending to Supabase
      // This is the last line of defense to prevent missing queue data in Realtime updates
      if (updateData.active_queue === undefined || updateData.active_queue === null) {
        logger.warn('[SupabaseService] ⚠️ CRITICAL: active_queue missing right before DB update - using empty array');
        updateData.active_queue = [];
      }
      if (updateData.priority_queue === undefined || updateData.priority_queue === null) {
        logger.warn('[SupabaseService] ⚠️ CRITICAL: priority_queue missing right before DB update - using empty array');
        updateData.priority_queue = [];
      }

      // #region agent log
      if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
        (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:760',message:'Sending update to Supabase DB',data:{hasActiveQueue:updateData.active_queue!==undefined,activeQueueLength:updateData.active_queue?.length,hasPriorityQueue:updateData.priority_queue!==undefined,hasNowPlaying:updateData.now_playing_video!==undefined,nowPlayingId:updateData.now_playing_video?.id,updateDataKeys:Object.keys(updateData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'}).catch(()=>{});
      }
      // #endregion
      // Select updated_at after update to get the actual timestamp from database trigger
      const { data: updatedRow, error } = await this.client
        .from('player_state')
        .update(updateData)
        .eq('id', this.playerStateId)
        .select('updated_at, last_updated')
        .single();

      // Check if request was cancelled after the request
      if (abortSignal.aborted) {
        // Log cancelled request to IO logger
        await getIOLogger().logReceived('supabase', JSON.stringify({
          cancelled: true,
          reason: 'Request was cancelled before response'
        }, null, 2), 'player_state', requestId);
        throw new DOMException('Request was cancelled', 'AbortError');
      }

      if (error) {
        // Log error to IO logger
        await getIOLogger().logError('supabase', error.message || String(error), 'player_state', requestStr);
        
        this.consecutiveStateSyncErrors++;
        const now = Date.now();
        const shouldLog = (now - this.lastErrorLogTime) > this.ERROR_SUPPRESSION_MS;
        
        // Suppress 500 errors during long runtime - likely database issues, not app bugs
        if (error.code === '500' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
          if (shouldLog || this.consecutiveStateSyncErrors === 1) {
            logger.debug(`State sync failed (500 error - non-critical) [${this.consecutiveStateSyncErrors} consecutive]`);
            this.lastErrorLogTime = now;
          }
        } else {
          if (shouldLog || this.consecutiveStateSyncErrors === 1) {
            logger.warn(`State sync error (non-critical) [${this.consecutiveStateSyncErrors} consecutive]:`, error.message || error);
            this.lastErrorLogTime = now;
          }
        }
      } else {
        // Log successful response
        await getIOLogger().logReceived('supabase', JSON.stringify({
          success: true,
          updated_at: updatedRow?.updated_at,
          queue_length: updateData.active_queue?.length
        }, null, 2), 'player_state', requestId);
        if (this.consecutiveStateSyncErrors > 0) {
          logger.debug(`State sync recovered after ${this.consecutiveStateSyncErrors} errors`);
          this.consecutiveStateSyncErrors = 0;
        }
        logger.debug('State synced successfully to Supabase', {
          queue_length: updateData.active_queue?.length,
          priority_length: updateData.priority_queue?.length
        });
        // Merge updateData into lastSyncedState to preserve all fields from previous syncs
        // This ensures comparisons use complete state, not just fields from most recent update
        // CRITICAL: Never remove active_queue or priority_queue from lastSyncedState if updateData doesn't include them
        // This prevents losing queue data when partial updates (e.g., only now_playing_video) are sent
        const mergedState: Partial<SupabasePlayerState> = {
          ...this.lastSyncedState,
          ...updateData
        };
        
        // Preserve queue data if updateData doesn't include it (defensive - should already be handled above)
        if (updateData.active_queue === undefined && this.lastSyncedState?.active_queue !== undefined) {
          mergedState.active_queue = this.lastSyncedState.active_queue;
        }
        if (updateData.priority_queue === undefined && this.lastSyncedState?.priority_queue !== undefined) {
          mergedState.priority_queue = this.lastSyncedState.priority_queue;
        }
        
        this.lastSyncedState = mergedState;
        
        // #region agent log
        if (typeof window !== 'undefined' && (window as any).electronAPI?.writeDebugLog) {
          (window as any).electronAPI.writeDebugLog({location:'SupabaseService.ts:813',message:'lastSyncedState updated after DB write',data:{hasActiveQueue:this.lastSyncedState?.active_queue!==undefined,activeQueueLength:this.lastSyncedState?.active_queue?.length,hasPriorityQueue:this.lastSyncedState?.priority_queue!==undefined,hasNowPlaying:this.lastSyncedState?.now_playing_video!==undefined,nowPlayingId:this.lastSyncedState?.now_playing_video?.id,updateDataHadQueue:updateData.active_queue!==undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'}).catch(()=>{});
        }
        // #endregion
        
        // Update lastQueueUpdateTime if queue data was synced
        // Use the actual updated_at from database (set by trigger) for accurate conflict resolution
        if (updateData.active_queue !== undefined || updateData.priority_queue !== undefined) {
          // Prefer updated_at from database trigger, fallback to last_updated or current time
          this.lastQueueUpdateTime = updatedRow?.updated_at || updatedRow?.last_updated || new Date().toISOString();
        }
      }
    } catch (error) {
      // Handle aborted requests (cancelled) - log but don't treat as error
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Request was cancelled - this is expected when new syncs arrive
        logger.debug('[SupabaseService] State sync request was cancelled (expected)');
        return;
      }
      
      // Suppress exceptions during long runtime - Supabase errors shouldn't crash the app
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
        logger.debug('State sync exception (500 error - non-critical):', errorMsg.substring(0, 100));
      } else {
        logger.warn('State sync exception (non-critical):', errorMsg);
      }
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

    logger.info(`[SupabaseService] Setting up Broadcast command listener for player: ${this.playerId}`);

    // Use Broadcast channel for instant command delivery
    // Channel name includes player ID so each player gets its own channel
    this.commandChannel = this.client
      .channel(`djamms-commands:${this.playerId}`)
      .on('broadcast', { event: 'command' }, async (payload) => {
        try {
          logger.info(`[SupabaseService] 📨 Broadcast event received:`, payload);
          const message = payload.payload as {
            command: SupabaseCommand;
            timestamp: string;
          };
          
          if (!message || !message.command) {
            logger.warn('[SupabaseService] Received invalid broadcast message:', payload);
            return;
          }

          const command = message.command;
          logger.info(`[SupabaseService] 📦 Parsed command from broadcast:`, command.id, command.command_type);
          
          // CRITICAL: Verify command is for this player_id
          // Check both top-level player_id and action_data.player_id for compatibility
          const commandPlayerId = command.player_id || (command.command_data as any)?.player_id || (command.command_data as any)?.target_player_id;
          logger.info(`[SupabaseService] 🔍 Checking command player_id: ${commandPlayerId} vs this player: ${this.playerId}`);
          console.log(`[SupabaseService] 🔍 Checking command player_id: ${commandPlayerId} vs this player: ${this.playerId}`);
          logger.info(`[SupabaseService] Command object:`, JSON.stringify({ 
            id: command.id, 
            command_type: command.command_type, 
            player_id: command.player_id 
          }, null, 2));
          
          if (commandPlayerId && commandPlayerId !== this.playerId) {
            logger.warn(`[SupabaseService] ⚠️ Ignoring command for different player: ${commandPlayerId} (this player: ${this.playerId})`);
            console.warn(`[SupabaseService] ⚠️ Ignoring command for different player: ${commandPlayerId} (this player: ${this.playerId})`);
            // Still acknowledge the command to prevent timeout, but don't process it
            await this.markCommandExecuted(command.id, false, `Command for different player: ${commandPlayerId}`);
            return;
          }
          
          // If no player_id specified, process it (backward compatibility)
          if (!commandPlayerId) {
            logger.warn(`[SupabaseService] ⚠️ Command has no player_id - processing anyway (backward compatibility)`);
          }
          
          logger.info('[SupabaseService] 📥 Received command via Broadcast:', command.command_type, command.id, `(player: ${commandPlayerId || 'none'})`);
          console.log('[SupabaseService] 📥 Received command via Broadcast:', command.command_type, command.id, `(player: ${commandPlayerId || 'none'})`);
          logger.info('[SupabaseService] Command data:', JSON.stringify(command.command_data, null, 2));
          
          // Log received command
          await getIOLogger().logReceived('web-admin', JSON.stringify({
            command_type: command.command_type,
            command_id: command.id,
            command_data: command.command_data
          }, null, 2), 'broadcast');
          
          // Process the command
          logger.info(`[SupabaseService] 🚀 About to process command: ${command.command_type} (${command.id})`);
          await this.processCommand(command);
          logger.info(`[SupabaseService] ✅ Finished processing command: ${command.command_type} (${command.id})`);
        } catch (broadcastError) {
          logger.error(`[SupabaseService] ❌ Error in broadcast handler:`, broadcastError);
          // Don't re-throw - log and continue
        }
      })
      .subscribe((status, err) => {
        this.broadcastChannelStatus = status as typeof this.broadcastChannelStatus;
        if (status === 'SUBSCRIBED') {
          logger.info('[SupabaseService] ✅ Broadcast command listener SUBSCRIBED - ready to receive commands');
        } else if (status === 'CHANNEL_ERROR') {
          logger.error('[SupabaseService] ❌ Broadcast channel ERROR:', err);
          logger.warn('[SupabaseService] ⚠️ Command delivery may be delayed - Broadcast channel failed');
        } else if (status === 'TIMED_OUT') {
          logger.warn('[SupabaseService] ⚠️ Broadcast channel TIMED_OUT');
        } else if (status === 'CLOSED') {
          logger.warn('[SupabaseService] ⚠️ Broadcast channel CLOSED');
        } else {
          logger.debug(`[SupabaseService] Broadcast channel status: ${status}`);
        }
      });

    // Delay initial pending commands check to let Broadcast handle immediate delivery
    // Process any pending commands that may have been queued before Broadcast was ready
    // This is a one-time check, not polling
    setTimeout(async () => {
      await this.processPendingCommands();
    }, 500);
  }

  /**
   * Set connection status and notify callbacks
   */
  private setConnectionStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    if (this.connectionStatus === status) return;
    
    this.connectionStatus = status;
    logger.debug(`[SupabaseService] Connection status: ${status}`);
    
    // Notify all callbacks
    this.connectionStatusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        logger.warn('[SupabaseService] Error in connection status callback:', error);
      }
    });
    
    // Reset reconnection attempts on successful connection
    if (status === 'connected') {
      this.reconnectionAttempts = 0;
      this.reconnectionBackoffMs = 1000;
      // Flush queued queue updates on reconnect
      this.flushQueuedQueueUpdates().catch(err => {
        logger.warn('[SupabaseService] Error flushing queued updates on reconnect:', err);
      });
    }
  }

  /**
   * Subscribe to connection status changes
   */
  public onConnectionStatusChange(callback: (status: 'connected' | 'disconnected' | 'reconnecting') => void): () => void {
    this.connectionStatusCallbacks.add(callback);
    // Immediately call with current status
    callback(this.connectionStatus);
    
    return () => {
      this.connectionStatusCallbacks.delete(callback);
    };
  }

  /**
   * Get current connection status
   */
  public getConnectionStatus(): 'connected' | 'disconnected' | 'reconnecting' {
    return this.connectionStatus;
  }

  /**
   * Fetch current player state from Supabase (for polling when queue is empty)
   */
  public async fetchPlayerState(): Promise<SupabasePlayerState | null> {
    if (!this.client || !this.playerId) {
      logger.warn('[SupabaseService] Cannot fetch player state - client or playerId not initialized');
      return null;
    }

    try {
      const { data, error } = await this.client
        .from('player_state')
        .select('*')
        .eq('player_id', this.playerId)
        .maybeSingle();

      if (error) {
        logger.warn('[SupabaseService] Error fetching player state:', error.message);
        return null;
      }

      return data as SupabasePlayerState | null;
    } catch (error) {
      logger.error('[SupabaseService] Exception fetching player state:', error);
      return null;
    }
  }

  // ==================== Player State Realtime Subscription ====================

  /**
   * Start realtime subscription to player_state table changes
   * 
   * ⚠️ DISABLED FOR ELECTRON PLAYER ⚠️
   * 
   * The Electron Player should NOT subscribe to its own player_state updates because:
   * 1. It causes recursion loops: Player writes → Supabase broadcasts → Player receives own update → Processes → Writes again
   * 2. The Electron Player is the authoritative writer (per QUEUE_MANAGEMENT.md)
   * 3. Only Web Admin and Web Kiosk should subscribe to player_state updates (they use subscribeToPlayerState from web/shared/supabase-client.ts)
   * 
   * The Electron Player should only WRITE to Supabase, not read its own updates.
   * Web endpoints subscribe to see state changes from the Electron Player.
   */
  private async startPlayerStateSubscription(): Promise<void> {
    // DISABLED - Electron Player should not subscribe to its own state updates
    // This prevents recursion loops where the player receives its own writes
    logger.info(`[SupabaseService] ⚠️ Player state subscription DISABLED for Electron Player (prevents recursion)`);
    logger.info(`[SupabaseService] Only Web Admin/Kiosk should subscribe to player_state updates`);
    return;
    
    /* ORIGINAL CODE (DISABLED):
    if (!this.client) throw new Error('Client not initialized');

    logger.info(`[SupabaseService] Setting up player_state realtime subscription for player: ${this.playerId}`);

    this.playerStateChannel = this.client
      .channel(`player-state:${this.playerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'player_state',
          filter: `player_id=eq.${this.playerId}`
        },
        (payload) => {
          this.handlePlayerStateUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.info('[SupabaseService] ✅ Player state realtime subscription active');
          this.setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn('[SupabaseService] ⚠️ Player state subscription error:', err);
          this.setConnectionStatus('disconnected');
        } else if (status === 'CLOSED') {
          logger.warn('[SupabaseService] ⚠️ Player state subscription closed');
          this.setConnectionStatus('disconnected');
        } else {
          logger.debug(`[SupabaseService] Player state subscription status: ${status}`);
        }
      });
    */
  }

  /**
   * Handle player_state UPDATE event from realtime
   * Implements conflict resolution: last write wins based on updated_at
   */
  private handlePlayerStateUpdate(payload: any): void {
    try {
      const newState = payload.new as SupabasePlayerState;
      if (!newState) {
        logger.warn('[SupabaseService] Received invalid player_state update');
        return;
      }

      // CRITICAL: Verify this update is for the current player_id (prevent cross-player contamination)
      if (newState.player_id !== this.playerId) {
        logger.warn('[SupabaseService] Received player_state update for different player_id, ignoring', {
          received: newState.player_id,
          current: this.playerId
        });
        return;
      }

      const remoteUpdatedAt = (newState as any).updated_at || newState.last_updated;
      if (!remoteUpdatedAt) {
        logger.debug('[SupabaseService] Player state update missing updated_at, skipping conflict check');
        // Still notify callbacks but without conflict resolution
        this.notifyQueueUpdateCallbacks(newState.active_queue || [], newState.priority_queue || []);
        return;
      }

      // Conflict resolution: compare timestamps
      if (this.lastQueueUpdateTime) {
        const localTime = new Date(this.lastQueueUpdateTime).getTime();
        const remoteTime = new Date(remoteUpdatedAt).getTime();

        // If local write is newer, ignore remote update (last write wins)
        if (localTime > remoteTime) {
          logger.debug('[SupabaseService] Ignoring remote queue update - local write is newer', {
            localTime: this.lastQueueUpdateTime,
            remoteTime: remoteUpdatedAt
          });
          return;
        }
      }

      // Remote is newer or equal - apply merge strategy
      logger.info('[SupabaseService] 📥 Received remote queue update, applying merge', {
        remoteUpdatedAt,
        activeQueueLength: newState.active_queue?.length || 0,
        priorityQueueLength: newState.priority_queue?.length || 0,
        playerId: newState.player_id
      });

      // Set flag to prevent sync during remote update processing
      this.isProcessingRemoteUpdate = true;

      try {
        // Get current local state for merge
        const localActiveQueue = this.lastSyncedState?.active_queue || [];
        const localPriorityQueue = this.lastSyncedState?.priority_queue || [];
        const currentVideoId = this.lastSyncedState?.now_playing_video?.id || null;
        const isPlaying = this.lastSyncedState?.status === 'playing' || false;

        // Merge queues using utility function
        const mergedActiveQueue = mergeQueueUpdates({
          localQueue: localActiveQueue,
          remoteQueue: newState.active_queue || [],
          isPlaying,
          currentVideoId,
          isTransitioning: this.isTransitioning
        });

        // Priority queue: adopt remote entirely (no merge needed)
        // But ensure it's for this player_id (already verified above)
        // Also remove duplicates to prevent corruption
        let mergedPriorityQueue = newState.priority_queue || [];
        
        // Remove duplicates from remote priority queue (prevent corruption from other sources)
        const uniquePriorityQueue = mergedPriorityQueue.filter((video, index, self) => {
          const videoId = video.id || video.src;
          return index === self.findIndex(v => (v.id || v.src) === videoId);
        });
        
        if (uniquePriorityQueue.length !== mergedPriorityQueue.length) {
          logger.warn(`[SupabaseService] Removed ${mergedPriorityQueue.length - uniquePriorityQueue.length} duplicate(s) from remote priority queue`);
          mergedPriorityQueue = uniquePriorityQueue;
        }

        // Update lastSyncedState with merged queues and all other fields from remote update
        // This ensures now_playing_video and other fields are preserved
        this.lastSyncedState = {
          ...this.lastSyncedState,
          ...newState, // Include all fields from remote update (now_playing_video, status, etc.)
          active_queue: mergedActiveQueue, // Use merged active queue
          priority_queue: mergedPriorityQueue, // Use merged priority queue
          last_updated: remoteUpdatedAt
        };

        // Notify callbacks with merged queues (this will trigger PlayerWindow updates)
        this.notifyQueueUpdateCallbacks(mergedActiveQueue, mergedPriorityQueue);

        // Update lastQueueUpdateTime to prevent processing this update again
        this.lastQueueUpdateTime = remoteUpdatedAt;
      } finally {
        // Clear flag after a short delay to allow callbacks to complete
        // This prevents any syncState calls triggered by the callbacks from syncing back
        setTimeout(() => {
          this.isProcessingRemoteUpdate = false;
        }, 100);
      }

    } catch (error) {
      logger.error('[SupabaseService] Error handling player_state update:', error);
    }
  }

  /**
   * Notify all queue update callbacks
   */
  private notifyQueueUpdateCallbacks(activeQueue: QueueVideoItem[], priorityQueue: QueueVideoItem[]): void {
    this.queueUpdateCallbacks.forEach(callback => {
      try {
        callback(activeQueue, priorityQueue);
      } catch (error) {
        logger.error('[SupabaseService] Error in queue update callback:', error);
      }
    });
  }

  /**
   * Subscribe to queue updates from realtime
   * Callback receives merged queues after conflict resolution
   */
  public onQueueUpdate(callback: (activeQueue: QueueVideoItem[], priorityQueue: QueueVideoItem[]) => void): () => void {
    this.queueUpdateCallbacks.add(callback);
    return () => {
      this.queueUpdateCallbacks.delete(callback);
    };
  }

  // ==================== Transition Lock ====================

  /**
   * Set transition lock state (prevents writes during crossfade/swap)
   */
  public setTransitioning(isTransitioning: boolean): void {
    if (this.isTransitioning === isTransitioning) return;
    
    this.isTransitioning = isTransitioning;
    logger.debug(`[SupabaseService] Transition lock: ${isTransitioning ? 'LOCKED' : 'UNLOCKED'}`);
    
    // Notify callbacks
    this.transitionLockCallbacks.forEach(callback => {
      try {
        callback(isTransitioning);
      } catch (error) {
        logger.error('[SupabaseService] Error in transition lock callback:', error);
      }
    });
  }

  /**
   * Get current transition lock state
   */
  public getTransitioning(): boolean {
    return this.isTransitioning;
  }

  /**
   * Subscribe to transition lock state changes
   */
  public onTransitionLockChange(callback: (isTransitioning: boolean) => void): () => void {
    this.transitionLockCallbacks.add(callback);
    // Immediately call with current state
    callback(this.isTransitioning);
    return () => {
      this.transitionLockCallbacks.delete(callback);
    };
  }

  // ==================== Offline Queue Handling ====================

  /**
   * Check if an update should be queued (not a duplicate of the last queued update)
   */
  private shouldQueueUpdate(activeQueue?: Video[], priorityQueue?: Video[]): boolean {
    if (this.queuedQueueUpdates.length === 0) return true;
    
    // Get the last queued update
    const lastQueued = this.queuedQueueUpdates[this.queuedQueueUpdates.length - 1];
    if (!lastQueued) return true;
    
    // Convert new queues to QueueVideoItem format for comparison
    const newActiveQueue = (activeQueue || []).map(v => this.videoToQueueItem(v));
    const newPriorityQueue = (priorityQueue || []).map(v => this.videoToQueueItem(v));
    
    // Compare queue lengths first (quick check)
    if (lastQueued.activeQueue.length !== newActiveQueue.length ||
        lastQueued.priorityQueue.length !== newPriorityQueue.length) {
      return true; // Different lengths, queue it
    }
    
    // Compare queue content (compare sets of IDs, not order)
    const lastActiveIds = new Set(lastQueued.activeQueue.map(item => item.id));
    const newActiveIds = new Set(newActiveQueue.map(item => item.id));
    const activeQueueChanged = lastActiveIds.size !== newActiveIds.size ||
      [...lastActiveIds].some(id => !newActiveIds.has(id));
    
    const lastPriorityIds = new Set(lastQueued.priorityQueue.map(item => item.id));
    const newPriorityIds = new Set(newPriorityQueue.map(item => item.id));
    const priorityQueueChanged = lastPriorityIds.size !== newPriorityIds.size ||
      [...lastPriorityIds].some(id => !newPriorityIds.has(id));
    
    // Only queue if content actually changed
    return activeQueueChanged || priorityQueueChanged;
  }

  /**
   * Queue a queue update for retry when connection is restored
   */
  private queueQueueUpdate(activeQueue?: Video[], priorityQueue?: Video[]): void {
    if (activeQueue === undefined && priorityQueue === undefined) return;

    const queueItem: QueuedQueueUpdate = {
      activeQueue: activeQueue ? activeQueue.map(v => this.videoToQueueItem(v)) : [],
      priorityQueue: priorityQueue ? priorityQueue.map(v => this.videoToQueueItem(v)) : [],
      timestamp: Date.now(),
      retryCount: 0
    };

    // Replace the last queued update if it's identical (keep only latest)
    // This prevents the queue from filling up with identical updates
    if (this.queuedQueueUpdates.length > 0) {
      const lastQueued = this.queuedQueueUpdates[this.queuedQueueUpdates.length - 1];
      const lastActiveIds = new Set(lastQueued.activeQueue.map(item => item.id));
      const newActiveIds = new Set(queueItem.activeQueue.map(item => item.id));
      const lastPriorityIds = new Set(lastQueued.priorityQueue.map(item => item.id));
      const newPriorityIds = new Set(queueItem.priorityQueue.map(item => item.id));
      
      const isIdentical = lastActiveIds.size === newActiveIds.size &&
        [...lastActiveIds].every(id => newActiveIds.has(id)) &&
        lastPriorityIds.size === newPriorityIds.size &&
        [...lastPriorityIds].every(id => newPriorityIds.has(id));
      
      if (isIdentical) {
        // Replace the last update with this one (same content, newer timestamp)
        this.queuedQueueUpdates[this.queuedQueueUpdates.length - 1] = queueItem;
        logger.debug(`[SupabaseService] Replaced last queued update (identical content, ${this.queuedQueueUpdates.length} in queue)`);
        return;
      }
    }

    this.queuedQueueUpdates.push(queueItem);

    // Limit queue size
    const MAX_QUEUE_SIZE = 10;
    if (this.queuedQueueUpdates.length > MAX_QUEUE_SIZE) {
      this.queuedQueueUpdates.shift(); // Remove oldest
    }

    logger.debug(`[SupabaseService] Queued queue update (${this.queuedQueueUpdates.length} in queue)`);
  }

  /**
   * Retry queued queue updates with exponential backoff
   */
  private async retryQueuedQueueUpdates(): Promise<void> {
    if (this.queuedQueueUpdates.length === 0) return;
    if (this.connectionStatus !== 'connected') return;

    const update = this.queuedQueueUpdates[0];
    if (!update) return;

    try {
      // Convert queue items back to Video format for sync
      const activeQueueVideos = update.activeQueue.map(q => this.queueItemToVideo(q));
      const priorityQueueVideos = update.priorityQueue.map(q => this.queueItemToVideo(q));

      // Sync immediately (bypass debounce and transition lock for retries)
      // Use syncPlayerState with immediate flag
      this.syncPlayerState({
        activeQueue: activeQueueVideos,
        priorityQueue: priorityQueueVideos
      }, true);
      
      // Wait a bit for sync to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Success - remove from queue
      this.queuedQueueUpdates.shift();
      logger.info('[SupabaseService] ✅ Retried queued queue update successfully');

      // Retry next item if any
      if (this.queuedQueueUpdates.length > 0) {
        this.scheduleNextRetry();
      }
    } catch (error) {
      update.retryCount++;
      const maxRetries = 5;
      
      if (update.retryCount >= maxRetries) {
        // Max retries reached - remove from queue
        logger.warn(`[SupabaseService] Max retries reached for queued update, removing`);
        this.queuedQueueUpdates.shift();
      } else {
        // Schedule retry with exponential backoff
        logger.debug(`[SupabaseService] Retry failed (${update.retryCount}/${maxRetries}), scheduling retry`);
        this.scheduleNextRetry(update.retryCount);
      }
    }
  }

  /**
   * Schedule next retry with exponential backoff
   */
  private scheduleNextRetry(retryCount: number = 0): void {
    if (this.retryQueueTimeout) {
      clearTimeout(this.retryQueueTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // 1s, 2s, 4s, 8s, 16s, max 30s
    
    this.retryQueueTimeout = setTimeout(() => {
      this.retryQueuedQueueUpdates();
    }, delay);
  }

  /**
   * Flush queued queue updates on reconnect
   */
  private async flushQueuedQueueUpdates(): Promise<void> {
    if (this.queuedQueueUpdates.length === 0) return;
    if (this.connectionStatus !== 'connected') return;

    logger.info(`[SupabaseService] Flushing ${this.queuedQueueUpdates.length} queued queue updates`);
    
    // Fetch latest state first to merge correctly
    try {
      const latestState = await this.client!
        .from('player_state')
        .select('*')
        .eq('player_id', this.playerId)
        .single();

      if (latestState.data) {
        // Merge with latest remote state
        const remoteState = latestState.data as SupabasePlayerState;
        const lastUpdate = this.queuedQueueUpdates[this.queuedQueueUpdates.length - 1];
        
        if (lastUpdate) {
          const mergedActive = mergeQueueUpdates({
            localQueue: lastUpdate.activeQueue,
            remoteQueue: remoteState.active_queue || [],
            isPlaying: remoteState.status === 'playing',
            currentVideoId: remoteState.now_playing_video?.id,
            isTransitioning: false
          });

          // Sync merged state
          this.syncPlayerState({
            activeQueue: mergedActive.map(q => this.queueItemToVideo(q)),
            priorityQueue: lastUpdate.priorityQueue.map(q => this.queueItemToVideo(q))
          }, true);
          
          // Wait a bit for sync to complete
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      logger.warn('[SupabaseService] Error fetching latest state for merge:', error);
    }

    // Clear queue after flush
    this.queuedQueueUpdates = [];
  }

  /**
   * Convert QueueVideoItem back to Video (for retry)
   */
  private queueItemToVideo(item: QueueVideoItem): Video {
      return {
        id: item.id,
        title: item.title,
        artist: item.artist ?? null,
        src: item.src,
      path: item.path,
      duration: item.duration,
      playlist: item.playlist,
      playlistDisplayName: item.playlistDisplayName
    };
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
    }
    
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      logger.warn('[SupabaseService] Max reconnection attempts reached. Stopping reconnection.');
      return;
    }
    
    this.reconnectionAttempts++;
    this.setConnectionStatus('reconnecting');
    
    const delay = Math.min(this.reconnectionBackoffMs * Math.pow(2, this.reconnectionAttempts - 1), 30000);
    logger.debug(`[SupabaseService] Scheduling reconnection attempt ${this.reconnectionAttempts} in ${delay}ms`);
    
    this.reconnectionTimeout = setTimeout(async () => {
      try {
        // Attempt to reconnect by restarting the command listener
        if (this.commandChannel) {
          await this.commandChannel.unsubscribe();
          this.commandChannel = null;
        }
        await this.startCommandListener();
      } catch (error) {
        logger.warn('[SupabaseService] Reconnection attempt failed:', error);
        // Schedule another attempt
        this.scheduleReconnection();
      }
    }, delay);
  }

  /**
   * Queue a command for later execution when connection is restored
   */
  private queueCommand(command: SupabaseCommand): void {
    this.queuedCommands.push({
      command,
      timestamp: Date.now()
    });
    
    // Limit queue size to prevent memory issues
    const MAX_QUEUE_SIZE = 100;
    if (this.queuedCommands.length > MAX_QUEUE_SIZE) {
      this.queuedCommands.shift(); // Remove oldest
    }
    
    logger.debug(`[SupabaseService] Command queued (${this.queuedCommands.length} in queue):`, command.command_type);
  }

  /**
   * Flush queued commands when connection is restored
   */
  private async flushQueuedCommands(): Promise<void> {
    if (this.queuedCommands.length === 0) return;
    
    logger.info(`[SupabaseService] Flushing ${this.queuedCommands.length} queued commands`);
    
    // Process commands in order
    for (const { command } of this.queuedCommands) {
      try {
        await this.processCommand(command);
      } catch (error) {
        logger.warn('[SupabaseService] Error processing queued command:', error);
      }
    }
    
    this.queuedCommands = [];
  }

  /**
   * Process any pending commands (one-time catch-up on startup/reconnect)
   * This is NOT polling - it's a single check to catch commands that may have been
   * queued before Broadcast channel was ready. Broadcast channel is the primary delivery method.
   * @returns true if commands were found and processed, false otherwise
   */
  private async processPendingCommands(): Promise<boolean> {
    if (!this.client) return false;

    const expiryTime = new Date(Date.now() - COMMAND_EXPIRY_MS).toISOString();

    // Note: admin_commands table doesn't have player_id column - filter by action_data instead
    // Commands are sent to specific players via action_data.player_id or action_data.target_player_id field
    const { data: allPendingCommands, error } = await this.client
      .from('admin_commands')
      .select('*')
      .eq('status', 'pending')
      .gt('created_at', expiryTime)
      .order('created_at', { ascending: true });
    
    // Filter commands for this player_id in JavaScript (since column doesn't exist in schema)
    const pendingCommands = allPendingCommands?.filter(cmd => {
      const actionData = cmd.action_data as any;
      // Check if command is for this player (either player_id or target_player_id in action_data)
      return actionData?.player_id === this.playerId || 
             actionData?.target_player_id === this.playerId ||
             // If no player_id specified, assume it's for all players (broadcast)
             (!actionData?.player_id && !actionData?.target_player_id);
    }) || [];

    if (error) {
      // Log error but don't retry (Broadcast is primary, this is just a one-time catch-up)
      logger.warn('[SupabaseService] Error fetching pending commands (non-critical):', error.message || error);
      return false; // Error occurred, no commands processed
    }

    if (pendingCommands && pendingCommands.length > 0) {
      // Filter out commands we've already processed (prevents log spam)
      const newCommands = pendingCommands.filter(cmd => !this.processedCommandIds.has(cmd.id));
      
      if (newCommands.length > 0) {
        logger.info(`[SupabaseService] Processing ${newCommands.length} pending commands`);
        for (const command of newCommands) {
          await this.processCommand(command);
        }
        
        // Clean up stale commands that are stuck in 'pending' but we've already processed
        // This handles the case where the status update failed
        const staleCommands = pendingCommands.filter(cmd => this.processedCommandIds.has(cmd.id));
        if (staleCommands.length > 0) {
          // Batch update all stale commands to 'executed' status
          const staleIds = staleCommands.map(cmd => cmd.id);
          this.client
            .from('admin_commands')
            .update({ status: 'completed', executed_at: new Date().toISOString() })
            .in('id', staleIds)
            .then(({ error: updateError }) => {
              if (updateError) {
                logger.warn('[SupabaseService] Error cleaning up stale commands:', updateError.message);
              } else {
                logger.info(`[SupabaseService] 🧹 Cleaned up ${staleIds.length} stale commands`);
              }
            });
        }
        
        return true; // Commands were found and processed
      }
      return false; // No new commands (all already processed)
    }
    
    return false; // No pending commands
  }

  /**
   * Process a single command with deduplication
   * Ensures each command is only processed ONCE, even if received via both Broadcast and polling
   */
  private async processCommand(command: SupabaseCommand): Promise<void> {
    // Log connection status for debugging
    logger.info(`[SupabaseService] Processing command ${command.id} - connection status: ${this.connectionStatus}`);
    console.log(`[SupabaseService] Processing command ${command.id} - connection status: ${this.connectionStatus}`);
    
    // If disconnected, queue the command instead of processing
    // BUT: If we received via Broadcast, we're actually connected, so process it
    // Only queue if we're truly disconnected (no broadcast channel active)
    if ((this.connectionStatus === 'disconnected' || this.connectionStatus === 'reconnecting') && 
        this.broadcastChannelStatus !== 'SUBSCRIBED') {
      logger.warn(`[SupabaseService] Connection status is ${this.connectionStatus} and Broadcast not SUBSCRIBED - queuing command`);
      console.warn(`[SupabaseService] Connection status is ${this.connectionStatus} - queuing command`);
      this.queueCommand(command);
      return;
    }
    
    // If we got here via Broadcast, we're connected - process immediately
    logger.info(`[SupabaseService] Connection OK - processing command immediately`);
    console.log(`[SupabaseService] Connection OK - processing command immediately`);
    
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
    
    logger.info(`[SupabaseService] 🔍 Looking for handlers for command type: ${command.command_type}`);
    console.log(`[SupabaseService] 🔍 Looking for handlers for command type: ${command.command_type}`);
    logger.info(`[SupabaseService] Registered command types:`, Array.from(this.commandHandlers.keys()));
    console.log(`[SupabaseService] Registered command types:`, Array.from(this.commandHandlers.keys()));
    logger.info(`[SupabaseService] Handler count for ${command.command_type}:`, handlers?.length || 0);
    console.log(`[SupabaseService] Handler count for ${command.command_type}:`, handlers?.length || 0);
    
    try {
      if (handlers && handlers.length > 0) {
        logger.info(`[SupabaseService] ⚙️ Executing command: ${command.command_type} (${command.id})`);
        console.log(`[SupabaseService] ⚙️ Executing command: ${command.command_type} (${command.id})`);
        logger.info(`[SupabaseService] Command data:`, JSON.stringify(command.command_data, null, 2));
        // Execute only the FIRST handler to prevent duplicate actions from multiple registrations
        await handlers[0](command);
        logger.info(`[SupabaseService] ✅ Command executed: ${command.command_type}`);
        console.log(`[SupabaseService] ✅ Command executed: ${command.command_type}`);
        // Mark command as executed in database (await to ensure acknowledgment)
        await this.markCommandExecuted(command.id, true);
        logger.info(`[SupabaseService] ✅ Command ${command.id} marked as executed`);
        console.log(`[SupabaseService] ✅ Command ${command.id} marked as executed`);
      } else {
        logger.warn(`[SupabaseService] ⚠️ No handler for command type: ${command.command_type}`);
        logger.warn(`[SupabaseService] Available handlers:`, Array.from(this.commandHandlers.keys()));
        // Still acknowledge the command to prevent timeout, even if no handler
        await this.markCommandExecuted(command.id, false, `No handler registered for command type: ${command.command_type}`);
      }
    } catch (error) {
      logger.error(`[SupabaseService] ❌ Error processing command ${command.id}:`, error);
      await this.markCommandExecuted(command.id, false, String(error));
    } finally {
      // Remove from processing set (but keep in processed set to prevent re-execution)
      this.processingCommandIds.delete(command.id);
    }
  }

  /**
   * Mark a command as executed or failed
   * Updates database status for audit trail and broadcasts acknowledgment
   * CRITICAL: This must succeed for Web Admin to receive acknowledgment
   */
  private async markCommandExecuted(
    commandId: string, 
    success: boolean, 
    errorMessage?: string
  ): Promise<void> {
    if (!this.client) {
      logger.error('[SupabaseService] Cannot mark command executed - client not initialized');
      return;
    }

    logger.info(`[SupabaseService] 📝 Marking command ${commandId} as ${success ? 'executed' : 'failed'}`);
    console.log(`[SupabaseService] 📝 Marking command ${commandId} as ${success ? 'executed' : 'failed'}`);

    // Try to update database - this is critical for Web Admin acknowledgment
    try {
      const updatePayload: any = {
        status: success ? 'completed' : 'failed',
        executed_at: new Date().toISOString()
      };
      
      // Try to include execution_result if column exists
      if (success) {
        updatePayload.execution_result = { success: true };
      } else {
        updatePayload.execution_result = { error: errorMessage };
        updatePayload.error_message = errorMessage; // Also try error_message column
      }

      logger.info(`[SupabaseService] Updating admin_commands table for command ${commandId} with payload:`, JSON.stringify(updatePayload, null, 2));
      console.log(`[SupabaseService] Updating admin_commands table for command ${commandId}`);

      const { data, error } = await this.client
        .from('admin_commands')
        .update(updatePayload)
        .eq('id', commandId)
        .select();

      if (error) {
        // Log error but don't fail - try alternative acknowledgment methods
        logger.error(`[SupabaseService] ❌ Database update failed for command ${commandId}:`, error.message, error.code, error.details);
        console.error(`[SupabaseService] ❌ Database update failed for command ${commandId}:`, error);
        
        // If schema mismatch, try minimal update with only status
        if (error.code === 'PGRST204' || error.code === '42P01') {
          logger.debug('[SupabaseService] Schema mismatch detected, trying minimal update');
          const { error: minimalError } = await this.client
            .from('admin_commands')
            .update({
              status: success ? 'completed' : 'failed'
            })
            .eq('id', commandId);
          
          if (minimalError) {
            logger.error(`[SupabaseService] Minimal update also failed for command ${commandId}:`, minimalError.message);
          } else {
            logger.info(`[SupabaseService] ✅ Minimal update succeeded for command ${commandId}`);
          }
        }
      } else {
        logger.info(`[SupabaseService] ✅ Command ${commandId} marked as ${success ? 'executed' : 'failed'} in database`);
      }
    } catch (err) {
      logger.error(`[SupabaseService] Exception marking command ${commandId} as executed:`, err);
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
      logger.warn('[SupabaseService] Cannot send command - not initialized');
      return { success: false, error: 'Not initialized' };
    }

    logger.info(`[SupabaseService] 📤 Sending command: ${commandType} to player: ${targetPlayerId}`);

    // 1. Insert to database for persistence/audit
    const { data, error } = await this.client
      .from('admin_commands')
      .insert({
        player_id: targetPlayerId,
        command_type: commandType,
        command_data: payload || {},
        issued_by: source,
        status: 'pending',
        issued_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      logger.error('[SupabaseService] Error sending command:', error);
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
      
      // Log sent command
      const requestId = await getIOLogger().logSent('web-admin', JSON.stringify({
        command_type: commandType,
        command_id: commandId,
        command_data: payload
      }, null, 2), 'broadcast');
      
      await commandChannel.httpSend('command', { command, timestamp: new Date().toISOString() });
      
      // Log successful send
      await getIOLogger().logReceived('web-admin', JSON.stringify({
        success: true,
        command_id: commandId
      }, null, 2), 'broadcast', requestId);
    } catch (broadcastError) {
      logger.warn('[SupabaseService] Broadcast failed (command still in DB):', broadcastError);
      // Remove failed channel from cache so it can be recreated
      this.commandSendChannels.delete(targetPlayerId);
    }

    logger.info(`[SupabaseService] ✅ Command sent: ${commandType} (${commandId})`);
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
   * Uses RPC function for efficiency, falls back to direct update if RPC not available
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.client || !this.playerId) return;

    // Try RPC function first (if it exists), otherwise use direct update
    // RPC function may not exist in all database instances, so we always have a fallback
    try {
      const { error: rpcError } = await this.client.rpc('update_player_heartbeat', {
        p_player_id: this.playerId
      });

      if (rpcError) {
        // If RPC function doesn't exist (404/PGRST404), fall back to direct update
        // Suppress 404 errors in logs as they're expected if RPC not deployed
        if (rpcError.code === 'PGRST404' || rpcError.message?.includes('404')) {
          // RPC function not found, use fallback (silent - expected behavior)
          await this.fallbackHeartbeatUpdate();
        } else {
          // Other RPC errors should be logged
          logger.warn('[SupabaseService] Heartbeat RPC error (falling back to direct update):', rpcError.message);
          await this.fallbackHeartbeatUpdate();
        }
      }
      // RPC succeeded, no need for fallback
    } catch (error: any) {
      // Network errors, etc. - fall back to direct update
      if (error?.code === 'PGRST404' || error?.message?.includes('404')) {
        // Suppress 404 errors (RPC not deployed)
        await this.fallbackHeartbeatUpdate();
      } else {
        logger.warn('[SupabaseService] Heartbeat RPC exception (falling back):', error instanceof Error ? error.message : error);
        await this.fallbackHeartbeatUpdate();
      }
    }
  }

  /**
   * Fallback heartbeat update using direct UPDATE
   */
  private async fallbackHeartbeatUpdate(): Promise<void> {
    if (!this.client || !this.playerId) return;

    if (this.playerStateId) {
      // Use direct update by ID
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

      // Also check if metadata column exists
      if (this.metadataColumnExists === null) {
        const { error: metadataError } = await this.client
          .from('local_videos')
          .select('metadata')
          .limit(1);
        
        this.metadataColumnExists = !metadataError || metadataError.code !== 'PGRST204';
        logger.debug(`[SupabaseService] Metadata column exists: ${this.metadataColumnExists}`);
      }

      // Also check if path column exists
      if (this.pathColumnExists === null) {
        const { error: pathError } = await this.client
          .from('local_videos')
          .select('path')
          .limit(1);
        
        this.pathColumnExists = !pathError || pathError.code !== 'PGRST204';
        logger.debug(`[SupabaseService] Path column exists: ${this.pathColumnExists}`);
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
      logger.warn('[SupabaseService] Cannot index videos - not initialized');
      return;
    }

    if (this.indexingInProgress) {
      logger.debug('[SupabaseService] Skipping indexing - already in progress');
      return;
    }

    // Count local videos from playlists
    const localVideoCount = Object.values(playlists).reduce((total, videos) => total + videos.length, 0);
    
    // Check if indexing is needed by comparing counts (unless forced)
    // CRITICAL: Always log the player ID being used for indexing
    logger.info(`[SupabaseService] Starting video indexing for player: ${this.playerId}, local videos: ${localVideoCount}`);
    
    if (!forceIndex && localVideoCount > 0) {
      const supabaseCount = await this.getLocalVideosCount();
      logger.info(`[SupabaseService] Count check - Supabase has ${supabaseCount} videos for player ${this.playerId}, local has ${localVideoCount}`);
      
      if (supabaseCount === localVideoCount && supabaseCount > 0) {
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
    } else if (forceIndex) {
      logger.info(`[SupabaseService] Force indexing requested - will index ${localVideoCount} videos for player ${this.playerId}`);
    }

    this.indexingInProgress = true;

    try {
      // Check schema first
      const schemaOk = await this.checkSchema();
      if (!schemaOk) {
        // Only attempt fix once per session to prevent repeated network calls
        if (this.schemaFixFailed) {
          logger.debug('[SupabaseService] Schema fix already attempted and failed - skipping to prevent spam');
          if (onProgress) {
            onProgress(0, 0);
          }
          this.indexingInProgress = false;
          return;
        }
        
        if (!this.schemaFixAttempted) {
          logger.warn('[SupabaseService] Schema issue detected. Attempting to fix...');
          this.schemaFixAttempted = true;
          const fixed = await this.fixSchema();
          if (!fixed) {
            this.schemaFixFailed = true;
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
            this.schemaFixFailed = true;
            logger.error('[SupabaseService] Schema still incorrect after fix attempt. Please run SQL manually.');
            if (onProgress) {
              onProgress(0, 0);
            }
            this.indexingInProgress = false;
            return;
          }
          logger.info('[SupabaseService] ✅ Schema fixed successfully');
        }
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
        logger.info('[SupabaseService] No videos to index');
        this.indexingInProgress = false;
        return;
      }

      logger.info(`[SupabaseService] Indexing ${allVideos.length} unique local videos (${allVideosRaw.length - allVideos.length} duplicates removed)...`);

      // Fetch existing videos with their file_hash for comparison
      // CRITICAL: Use pagination to fetch ALL existing videos, not just first 1000
      // PostgREST defaults to 1000 rows, so we must paginate to get all videos
      const PAGE_SIZE = 1000;
      let allExistingVideos: any[] = [];
      let currentOffset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data: chunkData, error: fetchError } = await this.client
          .from('local_videos')
          .select('file_path, file_hash')
          .eq('player_id', this.playerId)
          .eq('is_available', true)
          .range(currentOffset, currentOffset + PAGE_SIZE - 1);
        
        if (fetchError) {
          logger.warn('[SupabaseService] Could not fetch existing videos for hash comparison:', fetchError.message);
          break; // Stop pagination on error
        }
        
        if (!chunkData || chunkData.length === 0) {
          hasMore = false;
        } else {
          allExistingVideos = [...allExistingVideos, ...chunkData];
          if (chunkData.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            currentOffset += PAGE_SIZE;
            logger.debug(`[SupabaseService] Fetched ${allExistingVideos.length} existing videos for hash comparison...`);
          }
        }
      }
      
      const existingVideos = allExistingVideos;

      // Create a map of existing file_path -> file_hash for quick lookup
      const existingHashes = new Map<string, string>();
      if (existingVideos && existingVideos.length > 0) {
        logger.debug(`[SupabaseService] Comparing against ${existingVideos.length} existing videos for hash matching`);
        for (const existing of existingVideos) {
          if (existing.file_path && existing.file_hash) {
            existingHashes.set(existing.file_path, existing.file_hash);
          }
        }
      }

      // Convert videos to Supabase format and filter out unchanged videos
      // Note: We'll check metadataColumnExists during checkSchema, but also handle it dynamically
      // during upsert errors to avoid including it if the column doesn't exist
      const localVideoRecords = allVideos
        .map(video => {
          const filePath = video.path || video.file_path || video.src;
          const fileHash = video.fileHash || null;
          
          // Skip if file hash matches existing (video hasn't changed)
          if (fileHash && existingHashes.has(filePath) && existingHashes.get(filePath) === fileHash) {
            return null; // Will be filtered out
          }
          
          // Extract playlist from file path if not provided in video object
          let playlistName = video.playlist;
          if (!playlistName && filePath) {
            // Match playlist folder name (PLxxxxxx.PlaylistName or PLxxxxxx_PlaylistName)
            const match = filePath.match(/PLAYLISTS\/([^/]+)\//);
            if (match) {
              playlistName = match[1];
            }
          }
          
          const record: any = {
            player_id: this.playerId,
            title: video.title,
            artist: video.artist || null,
            file_path: filePath,
            filename: video.filename || filePath.split('/').pop() || 'unknown',
            duration: video.duration || null,
            is_available: true,
            file_hash: fileHash || null // Include hash in record
          };
          
          // Always include metadata (column should exist after running SQL)
          // Ensure playlist is always set (extract from path if needed)
          record.metadata = {
            sourceType: 'local',
            playlist: playlistName || 'Unknown',
            playlistDisplayName: video.playlistDisplayName || playlistName || 'Unknown',
            filename: video.filename
          };
          
          // Include 'path' column for backward compatibility if database has it
          // Only include if column exists (checked during schema validation)
          if (this.pathColumnExists !== false) {
            record.path = filePath;
          }
          
          return record;
        })
        .filter((record): record is any => record !== null); // Remove nulls (unchanged videos)
      
      // If we know columns don't exist, remove them from all records now
      if (this.metadataColumnExists === false) {
        for (const record of localVideoRecords) {
          delete record.metadata;
        }
      }
      
      if (this.pathColumnExists === false) {
        for (const record of localVideoRecords) {
          delete record.path;
        }
      }

      const changedCount = localVideoRecords.length;
      const unchangedCount = allVideos.length - changedCount;
      
      if (unchangedCount > 0) {
        logger.info(`[SupabaseService] Skipping ${unchangedCount} unchanged videos (hash match)`);
      }
      
      if (changedCount === 0) {
        logger.info('[SupabaseService] No videos changed - indexing complete');
        if (onProgress) {
          onProgress(allVideos.length, allVideos.length);
        }
        this.indexingInProgress = false;
        return;
      }

      logger.info(`[SupabaseService] Upserting ${changedCount} changed/new videos...`);

      // Report initial progress with total count (include unchanged in total)
      const totalCount = allVideos.length;
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
          // Check if it's a metadata column error
          if (upsertError.code === 'PGRST204' && upsertError.message?.includes("'metadata'")) {
            logger.debug('[SupabaseService] Metadata column does not exist - removing from batch');
            this.metadataColumnExists = false;
            
            // Remove metadata from all records in batch and retry
            const batchWithoutMetadata = batch.map(record => {
              const { metadata, ...recordWithoutMetadata } = record;
              return recordWithoutMetadata;
            });
            
            const { error: retryError } = await this.client
              .from('local_videos')
              .upsert(batchWithoutMetadata, { onConflict: 'player_id,file_path' });
            
            if (retryError) {
              logger.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1} after removing metadata:`, retryError);
            } else {
              upsertedCount += batch.length;
            }
            continue; // Skip to next batch
          }
          
          // Check if it's a path column error
          if (upsertError.code === 'PGRST204' && upsertError.message?.includes("'path'")) {
            logger.debug('[SupabaseService] Path column does not exist - removing from batch');
            this.pathColumnExists = false;
            
            // Remove path from all records in batch and retry
            const batchWithoutPath = batch.map(record => {
              const { path, ...recordWithoutPath } = record;
              return recordWithoutPath;
            });
            
            const { error: retryError } = await this.client
              .from('local_videos')
              .upsert(batchWithoutPath, { onConflict: 'player_id,file_path' });
            
            if (retryError) {
              logger.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1} after removing path:`, retryError);
            } else {
              upsertedCount += batch.length;
            }
            continue; // Skip to next batch
          }
          
          // Other schema errors - try to fix (only once)
          if (upsertError.code === 'PGRST204' && !this.schemaFixAttempted) {
            logger.error('[SupabaseService] Schema error detected. Attempting to fix...');
            this.schemaFixAttempted = true;
            const fixed = await this.fixSchema();
            if (!fixed) {
              this.schemaFixFailed = true;
              logger.error('[SupabaseService] Failed to fix schema automatically. Please run SQL manually.');
              logger.debug('[SupabaseService] Will skip future schema fix attempts to prevent spam');
              break;
            }
            // Retry the upsert after schema fix
            const { error: retryError } = await this.client
              .from('local_videos')
              .upsert(batch, { onConflict: 'player_id,file_path' });
            if (retryError) {
              logger.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1} after schema fix:`, retryError);
            } else {
              upsertedCount += batch.length;
            }
          } else if (upsertError.code === 'PGRST204' && this.schemaFixFailed) {
            // Schema fix already failed - skip to prevent spam
            logger.debug('[SupabaseService] Schema error but fix already failed - skipping batch to prevent spam');
            break;
          } else {
            logger.error(`[SupabaseService] Error upserting batch ${i / batchSize + 1}:`, upsertError);
          }
        } else {
          upsertedCount += batch.length;
        }
        
        // Report progress after each batch (include unchanged videos in progress)
        if (onProgress) {
          onProgress(unchangedCount + upsertedCount, totalCount);
        }
      }

      logger.info(`[SupabaseService] Indexed (upserted) ${upsertedCount} changed videos, skipped ${unchangedCount} unchanged (total: ${allVideos.length})`);
    } catch (error) {
      logger.error('[SupabaseService] Video indexing exception:', error);
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

      // RPC function doesn't exist or failed - log once, then use debug level
      if (!this.schemaFixFailed) {
        logger.error('[SupabaseService] ❌ Schema fix RPC function not found or failed.');
        logger.error('[SupabaseService] To enable automatic schema fixes:');
        logger.error('[SupabaseService] 1. Run: db/create-schema-fix-rpc.sql in Supabase Dashboard');
        logger.error('[SupabaseService] 2. Then run: db/fix-local-videos-schema.sql to fix current schema');
        logger.error('[SupabaseService] After that, the app will auto-fix schema issues in the future.');
      } else {
        logger.debug('[SupabaseService] Schema fix RPC not available (already logged error)');
      }
      
      return false;
    } catch (error) {
      if (!this.schemaFixFailed) {
        logger.error('[SupabaseService] Error attempting schema fix:', error);
      } else {
        logger.debug('[SupabaseService] Schema fix error (already logged):', error);
      }
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
      logger.error('[SupabaseService] Error marking video unavailable:', error);
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
      logger.error('[SupabaseService] Client not initialized for search');
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
        // Only log as debug for known schema/function errors (to reduce console noise)
        const isSchemaError = error.code === 'PGRST203' || 
                            (error.message?.includes('Could not choose the best candidate function'));
        if (isSchemaError) {
          logger.debug('[SupabaseService] Search RPC unavailable (function error):', error.message);
        } else {
          logger.error('[SupabaseService] Search error:', error);
        }
        // Throw error to trigger fallback in useSearch
        throw new Error(`Search RPC failed: ${error.message}`);
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
    } catch (error: any) {
      // Only log as debug for known schema/function errors (to reduce console noise)
      const isSchemaError = error?.code === 'PGRST203' || 
                          (error?.message?.includes('Could not choose the best candidate function'));
      if (isSchemaError) {
        logger.debug('[SupabaseService] Search RPC exception (function error):', error?.message);
      } else {
        logger.error('[SupabaseService] Search exception:', error);
      }
      // Re-throw to trigger fallback in useSearch
      throw error;
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
      logger.error('[SupabaseService] Client not initialized for browse');
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
        // Only log as debug for known schema/function errors (to reduce console noise)
        const isSchemaError = error.code === '42703' || error.message?.includes('column') && error.message?.includes('does not exist');
        if (isSchemaError) {
          logger.debug('[SupabaseService] Browse RPC unavailable (schema error):', error.message);
        } else {
          logger.error('[SupabaseService] Browse error:', error);
        }
        // RPC function may not exist or have schema issues - return empty to trigger fallback
        throw new Error(`Browse RPC failed: ${error.message}`);
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
    } catch (error: any) {
      // Only log as debug for known schema/function errors (to reduce console noise)
      const isSchemaError = error?.code === '42703' || 
                          (error?.message?.includes('column') && error?.message?.includes('does not exist'));
      if (isSchemaError) {
        logger.debug('[SupabaseService] Browse RPC exception (schema error):', error?.message);
      } else {
        logger.error('[SupabaseService] Browse exception:', error);
      }
      // Re-throw to trigger fallback in useSearch
      throw error;
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
        // Only log as debug for known schema/function errors (to reduce console noise)
        const isSchemaError = error.code === '42703' || error.message?.includes('column') && error.message?.includes('does not exist');
        if (isSchemaError) {
          logger.debug('[SupabaseService] Count RPC unavailable (schema error):', error.message);
        } else {
          logger.error('[SupabaseService] Count error:', error);
        }
        // RPC function may not exist or have schema issues - return 0 to trigger fallback
        throw new Error(`Count RPC failed: ${error.message}`);
      }

      return data || 0;
    } catch (error: any) {
      // Only log as debug for known schema/function errors (to reduce console noise)
      const isSchemaError = error?.code === '42703' || 
                          (error?.message?.includes('column') && error?.message?.includes('does not exist'));
      if (isSchemaError) {
        logger.debug('[SupabaseService] Count RPC exception (schema error):', error?.message);
      } else {
        logger.error('[SupabaseService] Count exception:', error);
      }
      // Re-throw to trigger fallback in useSearch
      throw error;
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

