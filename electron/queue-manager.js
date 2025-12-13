/**
 * QueueManager - Centralized queue state management for DJAMMS Player
 * 
 * Consolidates all queue operations into a single class for:
 * - Clearer API
 * - Easier testing
 * - Single source of truth
 * 
 * This replaces scattered queue logic across command handlers.
 */

class QueueManager {
  constructor() {
    this.state = {
      activeQueue: [],
      priorityQueue: [],
      nowPlaying: null,
      nowPlayingSource: null, // 'active' | 'priority' | null
      queueIndex: 0,
      isPlaying: false
    };
    
    // Callbacks for state changes
    this.stateChangeCallbacks = [];
  }

  /**
   * Get current queue state (immutable copy)
   */
  getState() {
    return {
      activeQueue: [...this.state.activeQueue],
      priorityQueue: [...this.state.priorityQueue],
      nowPlaying: this.state.nowPlaying ? { ...this.state.nowPlaying } : null,
      nowPlayingSource: this.state.nowPlayingSource,
      queueIndex: this.state.queueIndex,
      isPlaying: this.state.isPlaying
    };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback) {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all subscribers of state change
   */
  notifyStateChange() {
    const state = this.getState();
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('[QueueManager] Error in state change callback:', error);
      }
    });
  }

  /**
   * Add video to active queue
   */
  addToQueue(video) {
    // Check if adding this video would create a duplicate at the next position after now-playing
    if (this.state.activeQueue.length > 0) {
      const videoId = video.id || video.src;
      const currentVideoId = this.state.activeQueue[this.state.queueIndex]?.id || 
                            this.state.activeQueue[this.state.queueIndex]?.src;
      
      if (videoId === currentVideoId) {
        console.log('[QueueManager] ⚠️ Video is same as now-playing, skipping add to prevent duplicate up-next');
        return;
      }
    }
    
    this.state.activeQueue.push(video);
    this.notifyStateChange();
  }

  /**
   * Add video to priority queue
   */
  addToPriorityQueue(video) {
    // Check if video already exists in priority queue (prevent duplicates)
    const videoId = video.id || video.src;
    const alreadyExists = this.state.priorityQueue.some(
      v => (v.id || v.src) === videoId
    );
    
    if (alreadyExists) {
      console.log('[QueueManager] ⚠️ Video already in priority queue, skipping duplicate:', video.title);
      return;
    }
    
    this.state.priorityQueue.push(video);
    console.log('[QueueManager] ✅ Added video to priority queue:', video.title);
    this.notifyStateChange();
  }

  /**
   * Remove video from active queue by index
   */
  removeFromQueue(index) {
    if (index < 0 || index >= this.state.activeQueue.length) {
      return;
    }
    
    // Don't remove currently playing video
    if (index === this.state.queueIndex) {
      console.log('[QueueManager] ⚠️ Cannot remove currently playing video');
      return;
    }
    
    this.state.activeQueue.splice(index, 1);
    
    // Adjust queueIndex if we removed a video before the current one
    if (index < this.state.queueIndex) {
      this.state.queueIndex--;
    }
    
    this.notifyStateChange();
  }

  /**
   * Move queue item from one position to another
   */
  moveQueueItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.state.activeQueue.length ||
        toIndex < 0 || toIndex > this.state.activeQueue.length) {
      return;
    }
    
    const [movedVideo] = this.state.activeQueue.splice(fromIndex, 1);
    const adjustedTarget = fromIndex < toIndex ? toIndex - 1 : toIndex;
    this.state.activeQueue.splice(adjustedTarget, 0, movedVideo);
    
    // Update queueIndex if needed
    if (fromIndex === this.state.queueIndex) {
      this.state.queueIndex = adjustedTarget;
    } else if (fromIndex < this.state.queueIndex && toIndex > this.state.queueIndex) {
      this.state.queueIndex--;
    } else if (fromIndex > this.state.queueIndex && toIndex <= this.state.queueIndex) {
      this.state.queueIndex++;
    }
    
    this.notifyStateChange();
  }

  /**
   * Shuffle the active queue
   */
  shuffleQueue(keepFirst = false) {
    if (this.state.activeQueue.length === 0) {
      return;
    }
    
    if (this.state.activeQueue.length === 1) {
      this.state.queueIndex = 0;
      this.notifyStateChange();
      return;
    }
    
    // Find the currently playing video in the queue (if any)
    let currentPlayingIndex = -1;
    if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
      currentPlayingIndex = this.state.activeQueue.findIndex(
        v => v && this.state.nowPlaying && 
        (v.path === this.state.nowPlaying.path || v.id === this.state.nowPlaying.id)
      );
    }
    
    if (keepFirst && currentPlayingIndex >= 0) {
      // Keep the currently playing video at its position, shuffle the rest
      const currentVideo = this.state.activeQueue[currentPlayingIndex];
      const before = this.state.activeQueue.slice(0, currentPlayingIndex);
      const after = this.state.activeQueue.slice(currentPlayingIndex + 1);
      const rest = [...before, ...after];
      
      // Shuffle the rest
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      
      // Reconstruct queue with current video at its position
      this.state.activeQueue = [...rest.slice(0, currentPlayingIndex), currentVideo, ...rest.slice(currentPlayingIndex)];
      // queueIndex stays the same since we kept the current video at its position
    } else if (keepFirst) {
      // Keep first item, shuffle the rest
      const first = this.state.activeQueue[0];
      const rest = this.state.activeQueue.slice(1);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      this.state.activeQueue = [first, ...rest];
      this.state.queueIndex = 0;
    } else {
      // Full shuffle - find where current video ends up
      for (let i = this.state.activeQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.state.activeQueue[i], this.state.activeQueue[j]] = [this.state.activeQueue[j], this.state.activeQueue[i]];
      }
      
      // Update queueIndex to point to currently playing video (if it exists)
      if (currentPlayingIndex >= 0 && this.state.nowPlaying) {
        const newIndex = this.state.activeQueue.findIndex(
          v => v && this.state.nowPlaying && 
          (v.path === this.state.nowPlaying.path || v.id === this.state.nowPlaying.id)
        );
        this.state.queueIndex = newIndex >= 0 ? newIndex : 0;
      } else {
        this.state.queueIndex = 0;
      }
    }
    
    this.notifyStateChange();
  }

  /**
   * Clear both queues
   */
  clearQueue() {
    this.state.activeQueue = [];
    this.state.priorityQueue = [];
    this.state.queueIndex = 0;
    this.state.nowPlaying = null;
    this.state.nowPlayingSource = null;
    this.state.isPlaying = false;
    console.log('[QueueManager] ✅ Cleared both active queue and priority queue');
    this.notifyStateChange();
  }

  /**
   * Play video at specific index
   */
  playAtIndex(index) {
    if (index < 0 || index >= this.state.activeQueue.length) {
      return;
    }
    
    this.state.queueIndex = index;
    this.state.nowPlaying = this.state.activeQueue[index];
    this.state.nowPlayingSource = 'active';
    this.state.isPlaying = true;
    this.notifyStateChange();
  }

  /**
   * Advance to next video (priority queue takes precedence)
   */
  advanceQueue() {
    // Priority queue takes precedence - ALWAYS check first before active queue
    if (this.state.priorityQueue.length > 0) {
      console.log('[QueueManager] ✅ Playing from priority queue (has', this.state.priorityQueue.length, 'items)');
      
      // Recycle current active queue video if it was playing (before priority interrupts)
      if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
        console.log('[QueueManager] Recycling active queue video:', this.state.nowPlaying.title);
        this.state.activeQueue.push(this.state.nowPlaying);
      }
      
      // Play next priority video (one-time, not recycled)
      const nextVideo = this.state.priorityQueue.shift();
      console.log('[QueueManager] 🎬 Priority queue video:', nextVideo?.title, 'Remaining priority:', this.state.priorityQueue.length);
      this.state.nowPlaying = nextVideo || null;
      this.state.nowPlayingSource = nextVideo ? 'priority' : null;
      this.state.isPlaying = !!nextVideo;
      this.notifyStateChange();
      return nextVideo;
    }
    
    // No priority queue items - play from active queue
    if (this.state.activeQueue.length > 0) {
      console.log('[QueueManager] ⚠️ Priority queue is empty, playing from active queue');
      
      // Recycle the current video to the end if it was from active queue
      if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
        // Recycle current video to end
        const prevQueueIndex = this.state.queueIndex;
        const prevQueueLength = this.state.activeQueue.length;
        this.state.activeQueue.push(this.state.nowPlaying);
        // Advance index to next video (circular, using new length after recycling)
        this.state.queueIndex = (this.state.queueIndex + 1) % this.state.activeQueue.length;
      } else if (this.state.nowPlaying && this.state.nowPlayingSource === 'priority') {
        // Current video was from priority queue (just finished) - don't recycle it
        // Priority videos are one-time, so just continue with active queue
        // queueIndex should already point to the next active queue video to play
      } else if (!this.state.nowPlaying || this.state.nowPlayingSource === null) {
        // No video currently playing (state was lost/reset) - advance queueIndex to next video
        this.state.queueIndex = (this.state.queueIndex + 1) % this.state.activeQueue.length;
      }
      
      // Use queueIndex to get the next video to play
      let nextVideo = this.state.activeQueue[this.state.queueIndex];
      
      // Check if index 1 (up-next) is the same as index 0 (now-playing)
      // This can happen if the queue only has 1 video and it was recycled
      if (nextVideo && this.state.activeQueue.length > 1) {
        const currentVideoId = nextVideo.id || nextVideo.src;
        const nextIndex = (this.state.queueIndex + 1) % this.state.activeQueue.length;
        const upNextVideo = this.state.activeQueue[nextIndex];
        
        if (upNextVideo && (upNextVideo.id || upNextVideo.src) === currentVideoId) {
          console.log('[QueueManager] ⚠️ Up-next video (index', nextIndex, ') is same as now-playing (index', this.state.queueIndex, '), skipping to next');
          // Skip to the video after the duplicate
          this.state.queueIndex = (nextIndex + 1) % this.state.activeQueue.length;
          nextVideo = this.state.activeQueue[this.state.queueIndex];
        }
      }
      
      if (nextVideo) {
        this.state.nowPlaying = nextVideo;
        this.state.nowPlayingSource = 'active';
        this.state.isPlaying = true;
        this.notifyStateChange();
        return nextVideo;
      } else {
        // Shouldn't happen, but handle gracefully
        this.state.nowPlaying = null;
        this.state.nowPlayingSource = null;
        this.state.isPlaying = false;
        this.state.queueIndex = 0;
        this.notifyStateChange();
        return null;
      }
    } else {
      // No videos in either queue
      this.state.nowPlaying = null;
      this.state.nowPlayingSource = null;
      this.state.isPlaying = false;
      this.state.queueIndex = 0;
      this.notifyStateChange();
      return null;
    }
  }

  /**
   * Set playing state
   */
  setPlaying(isPlaying) {
    this.state.isPlaying = isPlaying;
    this.notifyStateChange();
  }
}

module.exports = QueueManager;
