/**
 * QueueService - Queue rotation and management logic for DJAMMS Player
 * 
 * Implements the custom rotation logic:
 * 1. Priority queue items play BEFORE active queue items
 * 2. Active queue items are recycled (move to end after playing)
 * 3. Priority queue items are NOT recycled (one-time play)
 * 
 * This service can work standalone (local queue) or sync with Supabase.
 */

import { Video } from '../types';
import { getSupabaseService } from './SupabaseService';

export interface QueueState {
  /** Active queue - continuously rotates */
  activeQueue: Video[];
  /** Priority queue - one-time requests from Kiosk/Admin */
  priorityQueue: Video[];
  /** Currently playing video */
  nowPlaying: Video | null;
  /** Source of current video: 'active' | 'priority' */
  nowPlayingSource: 'active' | 'priority' | null;
}

export interface RotateResult {
  /** Next video to play */
  nextVideo: Video | null;
  /** Source of next video */
  source: 'active' | 'priority' | null;
  /** Updated queue state */
  newState: QueueState;
}

/**
 * QueueService - Manages queue rotation logic
 */
class QueueService {
  private static instance: QueueService | null = null;
  
  private state: QueueState = {
    activeQueue: [],
    priorityQueue: [],
    nowPlaying: null,
    nowPlayingSource: null
  };

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Initialize queue with videos
   */
  public initialize(activeQueue: Video[], priorityQueue: Video[] = []): void {
    this.state = {
      activeQueue: [...activeQueue],
      priorityQueue: [...priorityQueue],
      nowPlaying: null,
      nowPlayingSource: null
    };
  }

  /**
   * Set the entire active queue (replaces existing)
   */
  public setActiveQueue(videos: Video[]): void {
    this.state.activeQueue = [...videos];
    this.syncToSupabase();
  }

  /**
   * Set the entire priority queue (replaces existing)
   */
  public setPriorityQueue(videos: Video[]): void {
    this.state.priorityQueue = [...videos];
    this.syncToSupabase();
  }

  /**
   * Add a video to the active queue
   */
  public addToActiveQueue(video: Video, position?: number): void {
    if (position !== undefined && position >= 0 && position <= this.state.activeQueue.length) {
      this.state.activeQueue.splice(position, 0, video);
    } else {
      this.state.activeQueue.push(video);
    }
    this.syncToSupabase();
  }

  /**
   * Add a video to the priority queue
   * @param video - Video to add
   * @param user - Optional user/kiosk identifier who requested
   */
  public addToPriorityQueue(video: Video, user?: string): void {
    const priorityVideo = {
      ...video,
      requestedBy: user // Store who requested it
    };
    this.state.priorityQueue.push(priorityVideo as Video);
    this.syncToSupabase();
  }

  /**
   * Remove a video from the active queue by index
   */
  public removeFromActiveQueue(index: number): Video | null {
    if (index >= 0 && index < this.state.activeQueue.length) {
      const [removed] = this.state.activeQueue.splice(index, 1);
      this.syncToSupabase();
      return removed;
    }
    return null;
  }

  /**
   * Remove a video from the priority queue by index
   */
  public removeFromPriorityQueue(index: number): Video | null {
    if (index >= 0 && index < this.state.priorityQueue.length) {
      const [removed] = this.state.priorityQueue.splice(index, 1);
      this.syncToSupabase();
      return removed;
    }
    return null;
  }

  /**
   * Clear the active queue
   */
  public clearActiveQueue(): void {
    this.state.activeQueue = [];
    this.syncToSupabase();
  }

  /**
   * Clear the priority queue
   */
  public clearPriorityQueue(): void {
    this.state.priorityQueue = [];
    this.syncToSupabase();
  }

  /**
   * Shuffle the active queue
   * @param keepFirst - If true, keeps the first item in place (current playing)
   */
  public shuffleActiveQueue(keepFirst = false): void {
    if (this.state.activeQueue.length <= 1) return;

    if (keepFirst) {
      const first = this.state.activeQueue[0];
      const rest = this.state.activeQueue.slice(1);
      this.shuffleArray(rest);
      this.state.activeQueue = [first, ...rest];
    } else {
      this.shuffleArray(this.state.activeQueue);
    }
    this.syncToSupabase();
  }

  /**
   * Get the next video to play (peek without rotating)
   */
  public peekNext(): { video: Video | null; source: 'active' | 'priority' | null } {
    // Priority queue takes precedence
    if (this.state.priorityQueue.length > 0) {
      return { video: this.state.priorityQueue[0], source: 'priority' };
    }
    
    // Fall back to active queue
    if (this.state.activeQueue.length > 0) {
      return { video: this.state.activeQueue[0], source: 'active' };
    }
    
    return { video: null, source: null };
  }

  /**
   * Rotate the queue - get next video and update state
   * 
   * Logic:
   * 1. If priority queue has items -> play from priority (no recycle)
   * 2. If only active queue -> play from active, recycle to end
   * 3. Update nowPlaying state
   */
  public rotateQueue(): RotateResult {
    let nextVideo: Video | null = null;
    let source: 'active' | 'priority' | null = null;

    // First, recycle the previous "now playing" if it was from active queue
    if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
      // Move finished video to the END of active queue (recycle)
      this.state.activeQueue.push(this.state.nowPlaying);
    }
    // Note: Priority queue items are NOT recycled

    // Check priority queue first
    if (this.state.priorityQueue.length > 0) {
      nextVideo = this.state.priorityQueue.shift() || null;
      source = 'priority';
    } 
    // Fall back to active queue
    else if (this.state.activeQueue.length > 0) {
      nextVideo = this.state.activeQueue.shift() || null;
      source = 'active';
    }

    // Update state
    this.state.nowPlaying = nextVideo;
    this.state.nowPlayingSource = source;

    // Sync to Supabase
    this.syncToSupabase();

    return {
      nextVideo,
      source,
      newState: this.getState()
    };
  }

  /**
   * Start playback (initial video without rotation)
   */
  public startPlayback(): RotateResult {
    // Don't recycle on initial start - just get the first video
    let nextVideo: Video | null = null;
    let source: 'active' | 'priority' | null = null;

    // Check priority queue first
    if (this.state.priorityQueue.length > 0) {
      nextVideo = this.state.priorityQueue.shift() || null;
      source = 'priority';
    } 
    // Fall back to active queue
    else if (this.state.activeQueue.length > 0) {
      nextVideo = this.state.activeQueue.shift() || null;
      source = 'active';
    }

    // Update state
    this.state.nowPlaying = nextVideo;
    this.state.nowPlayingSource = source;

    // Sync to Supabase
    this.syncToSupabase();

    return {
      nextVideo,
      source,
      newState: this.getState()
    };
  }

  /**
   * Get current queue state (immutable copy)
   */
  public getState(): QueueState {
    return {
      activeQueue: [...this.state.activeQueue],
      priorityQueue: [...this.state.priorityQueue],
      nowPlaying: this.state.nowPlaying ? { ...this.state.nowPlaying } : null,
      nowPlayingSource: this.state.nowPlayingSource
    };
  }

  /**
   * Get active queue length
   */
  public get activeQueueLength(): number {
    return this.state.activeQueue.length;
  }

  /**
   * Get priority queue length
   */
  public get priorityQueueLength(): number {
    return this.state.priorityQueue.length;
  }

  /**
   * Get total queue length (active + priority)
   */
  public get totalQueueLength(): number {
    return this.state.activeQueue.length + this.state.priorityQueue.length;
  }

  /**
   * Get currently playing video
   */
  public get currentVideo(): Video | null {
    return this.state.nowPlaying;
  }

  // ==================== Private Helpers ====================

  /**
   * Shuffle array in place (Fisher-Yates algorithm)
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Sync current state to Supabase
   */
  private syncToSupabase(): void {
    const supabaseService = getSupabaseService();
    if (supabaseService.initialized) {
      supabaseService.syncPlayerState({
        currentVideo: this.state.nowPlaying,
        activeQueue: this.state.activeQueue,
        priorityQueue: this.state.priorityQueue
      });
    }
  }
}

// Export singleton getter
export const getQueueService = () => QueueService.getInstance();

// Export the class for typing
export { QueueService };

// Default export
export default QueueService;
