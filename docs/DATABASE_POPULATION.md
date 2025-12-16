# Database Population: How Tables Are Populated

## Summary: Your Understanding is Correct ✅

This document confirms how all database tables are populated and how data flows.

---

## A) Initial Population on First Player Connect

### 1. Playlists and Video Metadata

**Flow:**
```
Player Startup → Scan PLAYLISTS Folder → Index Videos → Upload to Supabase
```

**Code:** `src/services/SupabaseService.ts` - `indexLocalVideos()`

**What Happens:**
1. **Player scans PLAYLISTS folder** on startup (or when initiated in Tools)
   ```typescript
   // src/pages/PlayerWindow.tsx
   const { playlists } = await electronAPI.getPlaylists();
   ```

2. **Indexes all videos** from all playlists
   - Extracts metadata: title, artist, file_path, duration, playlist name
   - Deduplicates by file path (same video may be in multiple playlists)
   - Calculates file hash for change detection

3. **Uploads to `local_videos` table** in Supabase
   ```typescript
   // src/services/SupabaseService.ts
   await this.client
     .from('local_videos')
     .upsert(localVideoRecords, {
       onConflict: 'player_id,file_path',
       ignoreDuplicates: false
     });
   ```

**Table:** `local_videos`
- `player_id` - Which player owns these videos
- `title` - Video title
- `artist` - Artist name
- `file_path` - Full path to video file
- `filename` - Just the filename
- `duration` - Duration in seconds
- `metadata` - JSONB with playlist info, sourceType, etc.
- `is_available` - Whether file still exists
- `file_hash` - For detecting file changes

**When It Happens:**
- ✅ **On startup** (automatic, when Supabase initializes)
- ✅ **When initiated in Tools** (manual re-index)
- ✅ **When Player ID changes** (re-indexes for new player)

**Optimization:**
- Skips indexing if count matches (fast startup if nothing changed)
- Only uploads changed videos (compares file_hash)

---

### 2. Player State Data

**Flow:**
```
Player Startup → Load from Local Storage → Sync to/from Supabase
```

**What Gets Uploaded to Supabase:**

#### `player_state` Table:

**Initial Creation:**
```typescript
// src/services/SupabaseService.ts - initializePlayerState()
await this.client.from('player_state').insert({
  player_id: this.playerId,
  status: 'idle',
  is_online: true,
  volume: 1.0,
  current_position: 0,
  active_queue: [],      // Empty initially
  priority_queue: [],    // Empty initially
  last_heartbeat: new Date().toISOString()
});
```

**Ongoing Updates (via `syncState()`):**
- ✅ **Player State** (Playing/Paused/Idle)
- ✅ **Now-Playing Video** (`now_playing_video` JSONB)
- ✅ **Current Position** (`current_position` in seconds)
- ✅ **Volume** (`volume` 0.0 to 1.0)
- ✅ **Active Queue** (`active_queue` JSONB array)
- ✅ **Priority Queue** (`priority_queue` JSONB array)
- ✅ **Queue Index** (`queue_index` - current position in active_queue)
- ✅ **Last Heartbeat** (`last_heartbeat` - for online status)

**Table:** `player_state`
- Single row per `player_id`
- All state stored in one row (not normalized)
- `updated_at` auto-updated by trigger on every UPDATE

---

## B) Local Storage (Player Side)

### What's Stored Locally:

**Code:** `src/pages/PlayerWindow.tsx` - Load/Save Queue State

```typescript
// Load saved queue state on startup
const savedQueueState = await electronAPI.getSetting('savedQueueState');
if (savedQueueState && savedQueueState.activeQueue) {
  setQueue(savedQueueState.activeQueue);
  setQueueIndex(savedQueueState.queueIndex);
  setPriorityQueue(savedQueueState.priorityQueue);
  setCurrentVideo(savedQueueState.currentVideo);
}
```

**Stored in Persistent Memory:**
- ✅ **Active Queue** - Full video list
- ✅ **Priority Queue** - Full video list
- ✅ **Queue Index** - Current position
- ✅ **Now-Playing Video** - Current video object
- ✅ **User Settings** - Volume, fade duration, etc.

**When Saved:**
- ✅ **On queue changes** (automatic)
- ✅ **On video change** (automatic)
- ✅ **On settings change** (automatic)

**When Loaded:**
- ✅ **On startup** (before Supabase sync)
- ✅ **Fast startup** - No network delay
- ✅ **Offline capability** - Can play from saved state

---

## C) Web Admin Initial Population

### Flow:
```
Web Admin Connects → Fetch Initial State → Subscribe to Realtime
```

**Code:** `web/admin/src/App.tsx`

```typescript
// 1. Fetch initial state (one-time)
const loadInitialState = async () => {
  const state = await getPlayerState(playerId);
  if (state) {
    applyState(state); // Populate UI
  }
};
loadInitialState();

// 2. Subscribe to realtime updates
const channel = subscribeToPlayerState(playerId, applyState);
```

**What Gets Loaded:**
- ✅ **Player State** (Playing/Paused/Idle)
- ✅ **Now-Playing Video**
- ✅ **Active Queue** (full list)
- ✅ **Priority Queue** (full list)
- ✅ **Queue Index**
- ✅ **Volume**
- ✅ **Current Position**

**Realtime Subscription:**
- ✅ **Subscribes immediately** after initial fetch
- ✅ **Receives all updates** automatically
- ✅ **No polling needed** - instant updates

---

## D) Realtime Updates

### How Realtime Works:

**All Clients Subscribe:**
```typescript
// Electron Player
this.playerStateChannel = this.client
  .channel(`player-state:${this.playerId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    table: 'player_state',
    filter: `player_id=eq.${this.playerId}`
  }, (payload) => {
    this.handlePlayerStateUpdate(payload);
  });

// Web Admin
subscribeToPlayerState(playerId, (state) => {
  applyState(state); // Update UI
});
```

**What Triggers Realtime:**
- ✅ **Any UPDATE** to `player_state` table
- ✅ **Automatic broadcast** to all subscribers
- ✅ **Instant delivery** (no polling)

**Who Receives Updates:**
- ✅ **Electron Player** (conflict resolution)
- ✅ **Web Admin** (UI refresh)
- ✅ **Kiosk** (UI refresh)
- ✅ **All connected clients** simultaneously

---

## E) Queue Advancement

### When Player Advances Queue:

**Flow:**
```
Video Ends → Advance Queue → Update Local State → Sync to Supabase → Realtime Broadcast
```

**Code:** `src/services/QueueService.ts` - `rotateQueue()`

```typescript
public rotateQueue(): RotateResult {
  // 1. Recycle previous "now playing" if from active queue
  if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
    // Move finished video to END of active queue (recycle)
    this.state.activeQueue.push(this.state.nowPlaying);
  }
  // Note: Priority queue items are NOT recycled (discarded)

  // 2. Get next video
  if (this.state.priorityQueue.length > 0) {
    nextVideo = this.state.priorityQueue.shift(); // Remove from front
    source = 'priority';
  } else if (this.state.activeQueue.length > 0) {
    nextVideo = this.state.activeQueue.shift(); // Remove from front
    source = 'active';
  }

  // 3. Update state
  this.state.nowPlaying = nextVideo;
  this.state.nowPlayingSource = source;

  // 4. Sync to Supabase
  this.syncToSupabase();
}
```

**What Happens:**

1. **If video was from `active_queue`:**
   - ✅ **Index 0 is moved to END** of active_queue (recycle)
   - ✅ **Index 1 becomes new Index 0** (next video)
   - ✅ **Queue length stays same** (unless it was the last video)

2. **If video was from `priority_queue`:**
   - ✅ **Index 0 is discarded** (no recycle)
   - ✅ **Index 1 becomes new Index 0** (next video)
   - ✅ **Queue length decreases** by 1

3. **Update to Supabase:**
   ```typescript
   // src/services/SupabaseService.ts - syncPlayerState()
   await this.client
     .from('player_state')
     .update({
       active_queue: newActiveQueue,      // Updated queue
       priority_queue: newPriorityQueue,  // Updated queue
       now_playing_video: nextVideo,      // New now-playing
       queue_index: 0,                    // Reset to 0 (new video at front)
       updated_at: new Date().toISOString() // Trigger will override
     })
     .eq('id', this.playerStateId);
   ```

4. **Realtime Broadcast:**
   - ✅ **Trigger fires** (sets `updated_at = NOW()`)
   - ✅ **Realtime broadcasts** UPDATE event
   - ✅ **All clients receive** new queue state instantly

---

## Complete Data Flow Diagram

### Initial Population (First Connect)

```
┌─────────────────┐
│ Player Startup  │
└────────┬────────┘
         │
         │ 1. Scan PLAYLISTS folder
         ▼
┌─────────────────┐
│ Local Playlists │
│ (in memory)     │
└────────┬────────┘
         │
         │ 2. Index videos
         │    - Extract metadata
         │    - Calculate file_hash
         ▼
┌─────────────────┐
│ Supabase        │
│ local_videos    │
│ (uploaded)      │
└─────────────────┘

┌─────────────────┐
│ Player Startup  │
└────────┬────────┘
         │
         │ 1. Load from localStorage
         ▼
┌─────────────────┐
│ Local State     │
│ - active_queue  │
│ - priority_queue│
│ - now_playing   │
└────────┬────────┘
         │
         │ 2. Sync to Supabase
         ▼
┌─────────────────┐
│ Supabase        │
│ player_state    │
│ (initialized)   │
└─────────────────┘
```

### Web Admin Connect

```
┌─────────────────┐
│ Web Admin       │
│ Connects        │
└────────┬────────┘
         │
         │ 1. Fetch initial state
         │    getPlayerState(playerId)
         ▼
┌─────────────────┐
│ Supabase        │
│ player_state    │
│ (fetched)       │
└────────┬────────┘
         │
         │ 2. Populate UI
         ▼
┌─────────────────┐
│ Web Admin UI    │
│ (populated)     │
└────────┬────────┘
         │
         │ 3. Subscribe to realtime
         ▼
┌─────────────────┐
│ Realtime        │
│ Subscription    │
│ (active)        │
└─────────────────┘
```

### Queue Advancement

```
┌─────────────────┐
│ Video Ends      │
└────────┬────────┘
         │
         │ 1. Advance queue
         │    - Recycle if active_queue
         │    - Discard if priority_queue
         ▼
┌─────────────────┐
│ Local State     │
│ (updated)       │
└────────┬────────┘
         │
         │ 2. Sync to Supabase
         │    syncState({ activeQueue, priorityQueue })
         ▼
┌─────────────────┐
│ Supabase        │
│ player_state    │
│ UPDATE          │
└────────┬────────┘
         │
         │ 3. Trigger fires
         │    updated_at = NOW()
         │
         │ 4. Realtime broadcasts
         ▼
┌─────────────────┐
│ All Clients     │
│ Receive Update  │
│ - Electron      │
│ - Web Admin     │
│ - Kiosk         │
└─────────────────┘
```

---

## Summary Table

| Data Type | Source | Destination | When | How |
|-----------|--------|-------------|------|-----|
| **Playlists/Videos** | PLAYLISTS folder | `local_videos` table | Startup, Tools menu | `indexLocalVideos()` |
| **Player State** | Local storage | `player_state` table | Startup, state changes | `syncState()` |
| **Active Queue** | Local storage | `player_state.active_queue` | Startup, queue changes | `syncState()` |
| **Priority Queue** | Local storage | `player_state.priority_queue` | Startup, queue changes | `syncState()` |
| **Now-Playing** | Local storage | `player_state.now_playing_video` | Startup, video changes | `syncState()` |
| **Web Admin Initial** | `player_state` table | Web Admin UI | On connect | `getPlayerState()` |
| **Web Admin Updates** | Realtime | Web Admin UI | On any change | `subscribeToPlayerState()` |
| **Queue Advancement** | Local state | `player_state` table | Video ends | `rotateQueue()` → `syncState()` |

---

## Key Points

✅ **Your understanding is correct!**

1. **Playlists/Videos:** Scanned on startup, uploaded to `local_videos` table
2. **Player State:** Loaded from local storage, synced to `player_state` table
3. **Web Admin:** Fetches initial state, then subscribes to realtime
4. **Queue Advancement:** Electron updates local state, syncs to Supabase, broadcasts to all clients
5. **Realtime:** All changes automatically pushed to all subscribers

The architecture ensures:
- ✅ Fast startup (local storage first)
- ✅ Offline capability (local playback)
- ✅ Multi-client sync (Supabase realtime)
- ✅ Data persistence (Supabase database)

