/**
 * Queue Merge Utility
 * Handles merging of remote queue updates with local queue state
 * Implements conflict resolution strategy: preserve index 0 if playing, adopt 1+
 */

import { QueueVideoItem } from '../types/supabase';

export interface MergeQueueOptions {
  /** Local queue array */
  localQueue: QueueVideoItem[];
  /** Remote queue array from Supabase */
  remoteQueue: QueueVideoItem[];
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** ID of currently playing video (to match against localQueue[0]) */
  currentVideoId?: string | null;
  /** Whether player is mid-transition (crossfade/swap in progress) */
  isTransitioning?: boolean;
}

/**
 * Merge remote queue updates with local queue
 * 
 * Strategy:
 * - If playing and currentVideoId matches localQueue[0].id: Preserve localQueue[0]
 * - If mid-transition: Preserve localQueue[0] and localQueue[1] (now-playing and preloaded)
 * - Always adopt remoteQueue[1:] for upcoming videos
 * 
 * @param options - Merge options
 * @returns Merged queue array
 */
export function mergeQueueUpdates(options: MergeQueueOptions): QueueVideoItem[] {
  const {
    localQueue,
    remoteQueue,
    isPlaying,
    currentVideoId,
    isTransitioning = false
  } = options;

  // If no remote queue, return local queue unchanged
  if (!remoteQueue || remoteQueue.length === 0) {
    return localQueue;
  }

  // If no local queue, adopt entire remote queue
  if (!localQueue || localQueue.length === 0) {
    return [...remoteQueue];
  }

  // Determine how many items to preserve from local queue
  let preserveCount = 0;

  if (isTransitioning) {
    // Mid-transition: preserve index 0 (now-playing) and index 1 (preloaded)
    preserveCount = Math.min(2, localQueue.length);
  } else if (isPlaying && currentVideoId) {
    // Check if current video matches localQueue[0]
    const localNowPlaying = localQueue[0];
    if (localNowPlaying && localNowPlaying.id === currentVideoId) {
      // Preserve index 0 (now-playing)
      preserveCount = 1;
    }
  }

  // Build merged queue: preserve local items [0:preserveCount], then adopt remote [1:]
  const preserved = localQueue.slice(0, preserveCount);
  const remoteUpcoming = remoteQueue.slice(1); // Skip remote index 0 (may be different now-playing)

  // If we preserved local index 0, we want remote index 1+ as upcoming
  // If we didn't preserve anything, we want remote index 0+ (entire remote queue)
  const merged = preserveCount > 0
    ? [...preserved, ...remoteUpcoming]
    : [...remoteQueue];

  return merged;
}

/**
 * Check if two queue arrays are effectively the same
 * (ignoring order differences that don't affect playback)
 * 
 * @param queue1 - First queue
 * @param queue2 - Second queue
 * @returns True if queues are effectively the same
 */
export function queuesAreEquivalent(
  queue1: QueueVideoItem[],
  queue2: QueueVideoItem[]
): boolean {
  if (queue1.length !== queue2.length) {
    return false;
  }

  // Compare by ID (order matters for queue)
  for (let i = 0; i < queue1.length; i++) {
    if (queue1[i]?.id !== queue2[i]?.id) {
      return false;
    }
  }

  return true;
}

