# Race Condition Analysis: Web Admin Commands vs Electron Player Sync

## Overview

This document clarifies how Supabase handles concurrent updates to `player_state.active_queue` when:
1. **Web Admin** sends commands (queue_move, queue_remove, queue_shuffle)
2. **Electron Player** auto-advances or syncs state

## Current Architecture

### 1. Web Admin Flow (Commands Only)

**Web Admin NEVER directly writes to `player_state` table.**

Instead, Web Admin:
1. Sends commands via Supabase Broadcast channel (instant delivery)
2. Optionally persists command to `admin_commands` table (for audit)
3. Waits for Electron to process command and update `player_state`

**Example: Queue Reorder**
```typescript
// web/admin/src/App.tsx
await sendCommand('queue_move', { fromIndex: 2, toIndex: 5 });
```

**Flow:**
```
Web Admin → Broadcast Channel → Electron Player → Process Command → Update Local Queue → syncState() → Supabase DB
```

### 2. Electron Player Flow

**Electron Player is the ONLY source that writes to `player_state.active_queue`.**

When Electron processes a command:
1. Receives command via Broadcast channel
2. Modifies local queue state
3. Calls `syncState({ activeQueue: newQueue })`
4. Writes to `player_state` table with `updated_at` timestamp (auto-updated by trigger)

**Example: Processing queue_move**
```typescript
// src/pages/PlayerWindow.tsx
onQueueMove: (fromIndex, toIndex) => {
  setQueue(prev => {
    const newQueue = [...prev];
    const [movedItem] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedItem);
    syncState({ activeQueue: newQueue, queueIndex: newQueueIdx }, true);
    return newQueue;
  });
}
```

## Conflict Resolution Mechanism

### Database Level: Last Write Wins

**PostgreSQL `updated_at` Trigger:**
```sql
-- From migration 20241205_add_updated_at_index.sql
CREATE TRIGGER update_player_state_updated_at
  BEFORE UPDATE ON player_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**How it works:**
- Every UPDATE to `player_state` automatically sets `updated_at = NOW()`
- The last write to the database wins (PostgreSQL handles concurrent writes)
- If two writes happen simultaneously, PostgreSQL serializes them

### Application Level: Timestamp Comparison

**Electron Player's Conflict Resolution:**
```typescript
// src/services/SupabaseService.ts - handlePlayerStateUpdate()
private handlePlayerStateUpdate(payload: any): void {
  const remoteUpdatedAt = newState.updated_at;
  
  // Compare timestamps
  if (this.lastQueueUpdateTime) {
    const localTime = new Date(this.lastQueueUpdateTime).getTime();
    const remoteTime = new Date(remoteUpdatedAt).getTime();
    
    // If local write is newer, ignore remote update
    if (localTime > remoteTime) {
      logger.debug('Ignoring remote queue update - local write is newer');
      return; // Last write wins
    }
  }
  
  // Remote is newer - merge queues
  const mergedActiveQueue = mergeQueueUpdates({
    localQueue: localActiveQueue,
    remoteQueue: newState.active_queue || [],
    isPlaying,
    currentVideoId,
    isTransitioning: this.isTransitioning
  });
}
```

**Key Points:**
- `lastQueueUpdateTime` tracks when Electron last wrote to DB
- If Electron's write is newer, it ignores remote updates (prevents overwriting own changes)
- If remote is newer, it merges using `mergeQueueUpdates()` strategy

## Potential Race Conditions

### Scenario 1: Command Processing vs Auto-Advance

**Timeline:**
```
T0: Web Admin sends queue_move command
T1: Electron receives command, processes it, writes queue to DB (updated_at = T1)
T2: Video ends, Electron auto-advances, writes queue to DB (updated_at = T2)
```

**What happens:**
- If T2 > T1: Auto-advance overwrites queue_move change ❌
- If T1 > T2: Queue_move change is preserved ✅

**Mitigation:**
- `isTransitioning` lock prevents writes during crossfade/swap
- Auto-advance waits for transition to complete
- Commands are processed immediately (not during transitions)

**Current Protection:**
```typescript
// src/services/SupabaseService.ts - syncPlayerState()
if (this.isTransitioning && (state.activeQueue !== undefined || state.priorityQueue !== undefined)) {
  logger.debug('Transition in progress, queueing queue update');
  this.queueQueueUpdate(state.activeQueue, state.priorityQueue);
  return; // Queue update for later
}
```

### Scenario 2: Multiple Commands in Quick Succession

**Timeline:**
```
T0: Web Admin sends queue_move (index 2 → 5)
T1: Electron processes command, writes queue (updated_at = T1)
T2: Web Admin sends queue_remove (index 3)
T3: Electron processes command, writes queue (updated_at = T3)
```

**What happens:**
- Each command is processed sequentially
- Last command wins at database level
- No conflict - commands are queued and processed in order

**Current Protection:**
- Commands are processed synchronously via IPC
- Each command waits for previous to complete
- `syncState()` is debounced (except for immediate syncs)

### Scenario 3: Remote Update During Command Processing

**Timeline:**
```
T0: Web Admin sends queue_move command
T1: Electron receives command, modifies local queue
T2: Electron receives remote update (from another source?) with older timestamp
T3: Electron writes local queue to DB (updated_at = T3)
```

**What happens:**
- Electron compares `remoteUpdatedAt` vs `lastQueueUpdateTime`
- If local write (T3) is newer than remote (T2), remote is ignored ✅
- If remote (T2) is newer, merge happens (but shouldn't happen in this scenario)

**Current Protection:**
- `lastQueueUpdateTime` is updated after successful DB write
- Remote updates with older timestamps are ignored
- Merge strategy preserves now-playing video

## How Supabase Handles Concurrent Writes

### PostgreSQL Concurrency Control

**Row-Level Locking:**
- When Electron writes to `player_state`, PostgreSQL locks the row
- Concurrent writes are serialized (one at a time)
- The last write wins (based on `updated_at` timestamp)

**Example:**
```sql
-- Write 1 (from Electron command processing)
UPDATE player_state 
SET active_queue = [...], updated_at = NOW()
WHERE id = 'player-state-id';

-- Write 2 (from Electron auto-advance) - happens 100ms later
UPDATE player_state 
SET active_queue = [...], updated_at = NOW()  -- This timestamp is newer
WHERE id = 'player-state-id';
```

**Result:** Write 2 overwrites Write 1 (last write wins)

### Realtime Subscription Behavior

**How Realtime Broadcasts Updates:**
1. Any UPDATE to `player_state` triggers Realtime event
2. All subscribers (Electron Player, Web Admin) receive `postgres_changes` event
3. Event includes `payload.new` with full row data including `updated_at`

**Electron's Realtime Subscription:**
```typescript
// src/services/SupabaseService.ts - startPlayerStateSubscription()
this.playerStateChannel = this.client
  .channel(`player-state:${this.playerId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'player_state',
    filter: `player_id=eq.${this.playerId}`
  }, (payload) => {
    this.handlePlayerStateUpdate(payload); // Conflict resolution here
  });
```

**Key Point:** Electron receives its own writes via Realtime, but ignores them if local timestamp is newer.

## Merge Strategy

### `mergeQueueUpdates()` Function

**Strategy:**
1. **If mid-transition:** Preserve localQueue[0] and localQueue[1] (now-playing and preloaded)
2. **If playing:** Preserve localQueue[0] if it matches currentVideoId
3. **Always:** Adopt remoteQueue[1:] for upcoming videos

**Rationale:**
- Prevents disrupting current playback
- Adopts Admin's queue changes for upcoming videos
- Handles transitions gracefully

**Example:**
```typescript
// Local queue: [VideoA, VideoB, VideoC, VideoD]
// Remote queue: [VideoA, VideoE, VideoF] (Admin removed VideoB, VideoC, VideoD)
// Result: [VideoA, VideoE, VideoF] (preserves now-playing, adopts upcoming)
```

## Recommendations

### Current Implementation is Correct ✅

The current architecture handles race conditions well:

1. **Single Source of Truth:** Only Electron writes to `player_state.active_queue`
2. **Timestamp-Based Conflict Resolution:** Last write wins at DB level
3. **Application-Level Protection:** Electron ignores older remote updates
4. **Transition Lock:** Prevents writes during crossfade/swap
5. **Merge Strategy:** Preserves now-playing, adopts upcoming changes

### Potential Improvements

1. **Command Acknowledgment:** Web Admin could wait for command execution before showing UI update
   - Currently: Web Admin updates UI optimistically
   - Improvement: Wait for `executed_at` timestamp in command response

2. **Optimistic UI Updates:** Web Admin could show pending state
   - Show "Processing..." indicator while command executes
   - Revert if command fails

3. **Queue Version Tracking:** Add `queue_version` column for better conflict detection
   - Increment on each queue change
   - Compare versions instead of timestamps (more reliable)

4. **Debounce Command Processing:** Batch rapid commands
   - If multiple commands arrive within 100ms, process as batch
   - Reduces number of DB writes

## Summary

**How Supabase Handles Concurrent Writes:**
- PostgreSQL serializes concurrent writes (row-level locking)
- Last write wins (based on `updated_at` timestamp)
- Realtime broadcasts all updates to subscribers
- Application-level conflict resolution ignores older updates

**Race Condition Mitigation:**
- ✅ Single source of truth (Electron only writes)
- ✅ Timestamp-based conflict resolution
- ✅ Transition lock prevents writes during playback changes
- ✅ Merge strategy preserves now-playing video
- ✅ Commands processed sequentially

**Current Status:** The implementation correctly handles race conditions. The "last write wins" strategy ensures data consistency, and the merge strategy prevents playback disruption.

