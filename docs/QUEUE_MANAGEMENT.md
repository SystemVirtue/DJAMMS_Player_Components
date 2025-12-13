# Queue Management Deep Dive

## Overview

The DJAMMS Player uses a **dual-queue system** with an **index-based active queue** and a **priority queue** for one-time requests. The queue management system is designed to provide continuous playback with automatic recycling of active queue items, while allowing priority items (from Kiosk/Admin) to interrupt and play immediately.

---

## Queue Indexing System

### Core Principle: Index 0 = Now-Playing, Index 1 = Up-Next

**Key Concept:** The active queue uses a **pointer-based indexing system** where:
- **`queueIndex`** points to the currently playing video in the active queue
- **Index 0** conceptually represents "now-playing" (the video at `queueIndex`)
- **Index 1** conceptually represents "up-next" (the video at `queueIndex + 1`)

However, the actual implementation uses a **circular index** that advances through the queue.

### How Queue Index Works

```typescript
// electron/main.cjs - Queue State Structure
let queueState = {
  activeQueue: [Video, Video, Video, ...],  // Array of videos
  priorityQueue: [Video, Video, ...],       // Priority requests
  nowPlaying: Video | null,                 // Currently playing video
  nowPlayingSource: 'active' | 'priority' | null,
  queueIndex: 0,                            // Pointer to current video in activeQueue
  isPlaying: boolean
};
```

**Important:** The `queueIndex` is **NOT always 0**. It's a pointer that:
- Starts at 0 when a playlist is loaded
- Advances when videos play (`queueIndex = (queueIndex + 1) % activeQueue.length`)
- Points to the video that should be playing from the active queue

### Visual Example

```
Initial State (playlist loaded):
activeQueue = [VideoA, VideoB, VideoC, VideoD]
queueIndex = 0
nowPlaying = VideoA (from activeQueue[0])

After VideoA ends:
activeQueue = [VideoB, VideoC, VideoD, VideoA]  // VideoA recycled to end
queueIndex = 1  // Points to VideoB (was at index 1, now at index 0 after shift)
nowPlaying = VideoB (from activeQueue[1])

After VideoB ends:
activeQueue = [VideoC, VideoD, VideoA, VideoB]  // VideoB recycled to end
queueIndex = 2  // Points to VideoC
nowPlaying = VideoC (from activeQueue[2])
```

**Note:** The actual implementation uses `shift()` and `push()` operations, so the array is constantly rotating. The `queueIndex` tracks which position in the original queue order we're at.

---

## Active Queue Population and Manipulation

### 1. Initial Population

**Source:** `src/pages/PlayerWindow.tsx` - `confirmLoadPlaylist()`

```typescript
// When a playlist is loaded:
1. Clear existing active queue
2. Add all videos from playlist to active queue
3. Optionally shuffle if auto-shuffle is enabled
4. Set queueIndex = 0
5. Play video at index 0 (or index 1 if already playing)
```

**Code Flow:**
```typescript
// src/pages/PlayerWindow.tsx:1618-1680
confirmLoadPlaylist() {
  // 1. Clear queue in main process
  electronAPI.sendQueueCommand({ action: 'clear_queue' });
  
  // 2. Add all videos
  finalTracks.forEach((video) => {
    electronAPI.sendQueueCommand({ 
      action: 'add_to_queue', 
      payload: { video } 
    });
  });
  
  // 3. Start playback
  const startIndex = (isPlaying && currentVideo) ? 1 : 0;
  electronAPI.sendQueueCommand({ 
    action: 'play_at_index', 
    payload: { index: startIndex } 
  });
}
```

### 2. Queue Advancement (Video End)

**Source:** `electron/main.cjs` - `'next'` command handler

**Flow:**
```
Video Ends → playNextVideo() → IPC 'next' command → Main Process Handler → Queue Rotation → Broadcast State
```

**Key Logic:**
```typescript
// electron/main.cjs:667-738
case 'next': {
  // 1. Check priority queue FIRST (always takes precedence)
  if (queueState.priorityQueue.length > 0) {
    // Recycle current active queue video if it was playing
    if (queueState.nowPlaying && queueState.nowPlayingSource === 'active') {
      queueState.activeQueue.push(queueState.nowPlaying);  // Recycle to end
    }
    // Play priority video (one-time, not recycled)
    const nextVideo = queueState.priorityQueue.shift();
    queueState.nowPlaying = nextVideo;
    queueState.nowPlayingSource = 'priority';
  }
  // 2. Fall back to active queue
  else if (queueState.activeQueue.length > 0) {
    // Recycle current video if it was from active queue
    if (queueState.nowPlaying && queueState.nowPlayingSource === 'active') {
      queueState.activeQueue.push(queueState.nowPlaying);  // Recycle to end
      // Advance index (circular)
      queueState.queueIndex = (queueState.queueIndex + 1) % queueState.activeQueue.length;
    }
    // Get next video at queueIndex
    const nextVideo = queueState.activeQueue[queueState.queueIndex];
    queueState.nowPlaying = nextVideo;
    queueState.nowPlayingSource = 'active';
  }
  
  // 3. Broadcast updated state to renderer
  broadcastQueueState();
}
```

**Important Behaviors:**
- **Active queue videos are recycled** (moved to end after playing)
- **Priority queue videos are NOT recycled** (discarded after playing)
- **Queue index advances circularly** using modulo arithmetic
- **Priority queue always interrupts** active queue playback

### 3. Queue Manipulation Operations

#### A. Shuffle Queue
**Source:** `electron/main.cjs` - `'shuffle_queue'` command

```typescript
case 'shuffle_queue': {
  const keepFirst = payload?.keepFirst ?? false;
  
  if (keepFirst && queueState.activeQueue.length > 1) {
    // Keep first video, shuffle the rest
    const first = queueState.activeQueue[0];
    const rest = queueState.activeQueue.slice(1);
    shuffleArrayInPlace(rest);
    queueState.activeQueue = [first, ...rest];
    // Find where current video ended up
    const newIndex = queueState.activeQueue.findIndex(v => v.id === queueState.nowPlaying?.id);
    queueState.queueIndex = newIndex >= 0 ? newIndex : 0;
  } else {
    // Full shuffle
    shuffleArrayInPlace(queueState.activeQueue);
    // Find where current video ended up
    const newIndex = queueState.activeQueue.findIndex(v => v.id === queueState.nowPlaying?.id);
    queueState.queueIndex = newIndex >= 0 ? newIndex : 0;
  }
}
```

#### B. Move Queue Item
**Source:** `electron/main.cjs` - `'move_queue_item'` command

```typescript
case 'move_queue_item': {
  const { fromIndex, toIndex } = payload;
  const [movedItem] = queueState.activeQueue.splice(fromIndex, 1);
  queueState.activeQueue.splice(toIndex, 0, movedItem);
  
  // Adjust queueIndex if current video was moved
  if (fromIndex === queueState.queueIndex) {
    queueState.queueIndex = toIndex;
  } else if (fromIndex < queueState.queueIndex && toIndex > queueState.queueIndex) {
    queueState.queueIndex--;  // Moved before current, current shifted back
  } else if (fromIndex > queueState.queueIndex && toIndex <= queueState.queueIndex) {
    queueState.queueIndex++;  // Moved after current, current shifted forward
  }
}
```

#### C. Remove from Queue
**Source:** `electron/main.cjs` - `'remove_from_queue'` command

```typescript
case 'remove_from_queue': {
  const idx = payload?.index;
  if (idx === queueState.queueIndex) {
    // Can't remove currently playing video
    break;
  }
  queueState.activeQueue.splice(idx, 1);
  // Adjust queueIndex if we removed a video before the current one
  if (idx < queueState.queueIndex) {
    queueState.queueIndex--;
  }
}
```

#### D. Play at Index
**Source:** `electron/main.cjs` - `'play_at_index'` command

```typescript
case 'play_at_index': {
  const idx = payload?.index ?? 0;
  if (queueState.activeQueue[idx]) {
    queueState.queueIndex = idx;
    queueState.nowPlaying = queueState.activeQueue[idx];
    queueState.nowPlayingSource = 'active';
    queueState.isPlaying = true;
    // Send play command to video player
    fullscreenWindow.webContents.send('control-player', { 
      action: 'play', 
      data: queueState.nowPlaying 
    });
  }
}
```

### 4. Priority Queue Operations

**Priority queue is separate from active queue:**
- **Add to Priority:** `electronAPI.sendQueueCommand({ action: 'add_to_priority_queue', payload: { video } })`
- **Priority queue is checked FIRST** on every queue advancement
- **Priority videos are NOT recycled** (one-time play)
- **Priority queue persists** even when active queue is cleared

---

## State Synchronization with Supabase

### Architecture: Electron Player is Authoritative Writer

**Key Principle:** Only the Electron Player writes to Supabase `player_state` table. Web Admin and Kiosk send commands, but never write directly.

### Sync Flow

```
Local State Change → syncState() → SupabaseService.performStateSync() → Supabase DB → Realtime Broadcast → All Clients
```

**Source:** `src/services/SupabaseService.ts` - `syncPlayerState()`

```typescript
// 1. Debounce sync calls (prevent excessive writes)
const syncKey = JSON.stringify({ activeQueue, priorityQueue, queueIndex });
if (syncKey === lastSyncKey) {
  return;  // Skip duplicate sync
}

// 2. Deep equality check (prevent unnecessary updates)
if (isEqual(currentState, lastSyncedState)) {
  return;  // No changes, skip sync
}

// 3. Write to Supabase
await this.client
  .from('player_state')
  .update({
    active_queue: activeQueue.map(v => this.videoToQueueItem(v)),
    priority_queue: priorityQueue.map(v => this.videoToQueueItem(v)),
    now_playing_video: currentVideo,
    status: isPlaying ? 'playing' : 'paused',
    updated_at: new Date().toISOString()  // Trigger will override
  })
  .eq('id', this.playerStateId);

// 4. Database trigger fires → sets updated_at = NOW()
// 5. Realtime subscription broadcasts to all clients
```

### Remote Update Handling

**Source:** `src/services/SupabaseService.ts` - `handlePlayerStateUpdate()`

When a remote update is received (from another client or Supabase sync):

```typescript
handlePlayerStateUpdate(payload) {
  // 1. Set flag to prevent recursive sync
  this.isProcessingRemoteUpdate = true;
  
  // 2. Compare timestamps (conflict resolution)
  const remoteTime = new Date(payload.new.updated_at);
  const localTime = this.lastQueueUpdateTime;
  
  if (localTime > remoteTime) {
    // Local is newer - ignore remote update
    return;
  }
  
  // 3. Merge queues (preserve now-playing, adopt upcoming)
  const mergedActiveQueue = mergeQueueUpdates(
    this.lastSyncedState.active_queue,
    payload.new.active_queue,
    currentVideo
  );
  
  // 4. Update local state
  this.notifyQueueUpdateCallbacks(mergedActiveQueue, mergedPriorityQueue);
  
  // 5. Clear flag after delay
  setTimeout(() => {
    this.isProcessingRemoteUpdate = false;
  }, 100);
}
```

---

## Race Conditions and Mitigations

### 1. Recursion Loops (State Sync)

**Problem:** Local state change → Sync to Supabase → Realtime update → Local state change → Sync to Supabase → Loop

**Mitigation:**
- **Flag-based prevention:** `isUpdatingFromMainProcessRef` and `isProcessingRemoteUpdate`
- **Deep equality checks:** Skip sync if state hasn't actually changed
- **Debouncing:** Prevent rapid-fire sync calls
- **Timestamp comparison:** Ignore stale remote updates

**Code:**
```typescript
// src/pages/PlayerWindow.tsx:1984-2096
// Set flag when receiving update from main process
isUpdatingFromMainProcessRef.current = true;

// Skip syncState if flag is set
if (isUpdatingFromMainProcessRef.current) {
  console.log('[PlayerWindow] Skipping syncState - update came from remote source');
  return;
}

// Clear flag after delay
setTimeout(() => {
  isUpdatingFromMainProcessRef.current = false;
}, 100);
```

### 2. Stale Queue Index from Remote Updates

**Problem:** Remote Supabase update arrives without `nowPlaying`, code derives video from `queueIndex`, but `queueIndex` is stale (e.g., always 0)

**Mitigation:**
- **Only derive from queueIndex if:** We don't have a current video AND the remote queueIndex matches our local queueIndex
- **Preserve current video** if queueIndex doesn't match (stale update)
- **Don't clear current video** if queue has items and we're transitioning

**Code:**
```typescript
// src/pages/PlayerWindow.tsx:2016-2025
// Only derive from queue index if:
// 1. We don't currently have a video (currentVideoRef is null)
// 2. The queueIndex matches our local queueIndex (prevents stale updates)
if (!currentVideoRef.current && state.activeQueue && typeof state.queueIndex === 'number') {
  const queueIndex = state.queueIndex >= 0 && state.queueIndex < state.activeQueue.length 
    ? state.queueIndex 
    : null;
  // Only use derived video if queueIndex matches our local state
  if (queueIndex !== null && queueIndex === queueIndexRef.current) {
    newVideo = state.activeQueue[queueIndex] || null;
  } else if (queueIndex !== null && queueIndex !== queueIndexRef.current) {
    console.log('[PlayerWindow] Ignoring derived video (queueIndex mismatch)');
  }
}
```

### 3. Concurrent Queue Modifications

**Problem:** Web Admin sends queue_move command while Electron is advancing queue

**Mitigation:**
- **Command-based architecture:** Web Admin sends commands, Electron processes them sequentially
- **Last-write-wins:** Database timestamp comparison resolves conflicts
- **Command queue:** Commands are processed in order (via Broadcast channel)

**Flow:**
```
Web Admin: queue_move(2, 5) → Command → Electron processes → Updates local queue → Syncs to Supabase
Electron: Video ends → Advances queue → Updates local queue → Syncs to Supabase
Conflict: Timestamp comparison → Newer write wins
```

### 4. Video Player State Desync

**Problem:** Video player thinks it's playing VideoA, but queue state says VideoB

**Mitigation:**
- **Authoritative source:** Main process queue state is source of truth
- **State broadcasting:** Main process broadcasts state to all renderers
- **Video player listens:** Video player receives play commands from main process
- **State reconciliation:** Renderer updates local state from main process state

**Code:**
```typescript
// electron/main.cjs:32-45
function broadcastQueueState() {
  const stateToSend = {
    ...queueState,
    currentVideo: queueState.nowPlaying  // Alias for renderer compatibility
  };
  mainWindow.webContents.send('queue-state', stateToSend);
  fullscreenWindow.webContents.send('queue-state', stateToSend);
}

// src/pages/PlayerWindow.tsx:1982-2097
// Subscribe to authoritative queue state from main orchestrator
electronAPI.onQueueState((state) => {
  // Update local state from authoritative main process state
  setQueue(state.activeQueue);
  setQueueIndex(state.queueIndex);
  setCurrentVideo(state.nowPlaying || state.currentVideo);
  setIsPlaying(state.isPlaying);
});
```

---

## Video Player Interactions

### 1. Playback Initiation

**Flow:**
```
User Action / Video End → playNextVideo() → IPC 'next' command → Main Process → Queue Rotation → Broadcast State → Renderer Updates → sendPlayCommand() → Video Player
```

**Source:** `src/pages/PlayerWindow.tsx:1510-1536`

```typescript
const playNextVideo = useCallback(() => {
  // Debounce: Prevent rapid-fire calls
  const now = Date.now();
  if (now - lastPlayNextTimeRef.current < 500) {
    return;  // Too soon, debounce
  }
  lastPlayNextTimeRef.current = now;
  
  // Send IPC command to main orchestrator
  if (isElectron) {
    electronAPI.sendQueueCommand({ action: 'next' });
  }
  // Main process will:
  // 1. Rotate queue (check priority first, then active)
  // 2. Update queueIndex
  // 3. Broadcast state update
  // 4. Renderer receives state → updates currentVideo → sends play command
}, [isElectron]);
```

### 2. Video End Handling

**Source:** `src/pages/PlayerWindow.tsx:1829-1871`

```typescript
const handleVideoEnd = useCallback(() => {
  // Check if video actually played (not failed immediately)
  if (playbackTime < 1 && playbackDuration > 0) {
    // Video failed to play - still advance (don't get stuck)
    setTimeout(() => playNextVideo(), 100);
    return;
  }
  
  // Normal video end - advance to next
  playNextVideo();
}, [playNextVideo, currentVideo, playbackDuration, playbackTime]);
```

### 3. Play Command to Video Player

**Source:** `src/pages/PlayerWindow.tsx:1441-1509`

```typescript
const sendPlayCommand = useCallback((video: Video) => {
  // Convert file:// URLs to djamms:// in dev mode
  let videoToSend = { ...video };
  if (isDevMode) {
    const cleanPath = extractPathFromFileUrl(video.src || video.path);
    videoToSend.src = `djamms://${cleanPath}`;
  }
  
  // Send play command to Player Window (fullscreen window)
  if (isElectron) {
    electronAPI.controlPlayerWindow('play', videoToSend);
  }
}, [isElectron]);
```

### 4. State Reconciliation

**Problem:** Video player might be out of sync with queue state

**Solution:** Main process broadcasts state, renderer reconciles:

```typescript
// src/pages/PlayerWindow.tsx:1982-2097
electronAPI.onQueueState((state) => {
  // Update local state from authoritative main process state
  if (state.activeQueue) {
    setQueue(state.activeQueue);
    queueRef.current = state.activeQueue;
  }
  if (typeof state.queueIndex === 'number') {
    setQueueIndex(state.queueIndex);
    queueIndexRef.current = state.queueIndex;
  }
  
  // Handle current video change
  let newVideo = state.currentVideo || state.nowPlaying;
  if (!newVideo && state.activeQueue && state.queueIndex !== undefined) {
    // Derive from queue index (only if queueIndex matches local)
    if (state.queueIndex === queueIndexRef.current) {
      newVideo = state.activeQueue[state.queueIndex];
    }
  }
  
  if (newVideo && newVideo.id !== currentVideoRef.current?.id) {
    setCurrentVideo(newVideo);
    if (state.isPlaying) {
      sendPlayCommand(newVideo);
    }
  }
});
```

---

## Key Design Decisions

### 1. Why Index-Based Instead of Shift-Based?

**Answer:** The current implementation actually uses **both**:
- **Shift-based rotation:** Videos are `shift()`ed from front and `push()`ed to end
- **Index tracking:** `queueIndex` tracks position in the original queue order

This allows:
- **Efficient rotation:** O(1) operations for queue advancement
- **Position tracking:** Know which video in the original order is playing
- **Click-to-play:** Users can click any video in the queue to play it

### 2. Why Priority Queue Doesn't Recycle?

**Answer:** Priority queue items are **one-time requests** (e.g., Kiosk user pays for a song). They should play once and be discarded, not loop forever.

### 3. Why Active Queue Recycles?

**Answer:** Active queue represents a **playlist** that should loop continuously. Videos are recycled to the end so the playlist never ends.

### 4. Why Main Process is Authoritative?

**Answer:** 
- **Single source of truth:** Prevents conflicts from multiple writers
- **Offline capability:** Main process can operate without Supabase
- **Command validation:** Main process can validate and merge commands intelligently

---

## Common Issues and Solutions

### Issue 1: "Now-Playing" Shows Wrong Video

**Cause:** Stale queueIndex from remote update, or state desync

**Solution:** 
- Check that `queueIndex` matches local state before deriving video
- Preserve current video if queueIndex doesn't match
- Always use `nowPlaying` from main process state when available

### Issue 2: Queue Doesn't Advance After Skip

**Cause:** `playNextVideo()` debounce, or main process not receiving command

**Solution:**
- Check debounce timing (500ms minimum)
- Verify IPC command is sent: `electronAPI.sendQueueCommand({ action: 'next' })`
- Check main process logs for 'next' command receipt

### Issue 3: Priority Queue Items Don't Play

**Cause:** Priority queue not checked first, or empty priority queue

**Solution:**
- Verify priority queue is checked BEFORE active queue in 'next' handler
- Check that priority queue items are added correctly
- Verify `queueState.priorityQueue.length > 0` condition

### Issue 4: Recursion Warnings in Logs

**Cause:** State sync loop (local → Supabase → remote update → local → ...)

**Solution:**
- Check `isUpdatingFromMainProcessRef` flag is set correctly
- Verify deep equality check prevents duplicate syncs
- Ensure `isProcessingRemoteUpdate` flag prevents sync during remote updates

---

## Summary

The queue management system uses:
- **Index-based active queue** with circular advancement
- **Priority queue** for one-time interruptions
- **Main process as authoritative source** for queue state
- **Supabase for persistence and multi-client sync**
- **Multiple mitigations** for race conditions and state desync

The system is designed to be **resilient**, **efficient**, and **consistent** across multiple clients while maintaining offline capability.

