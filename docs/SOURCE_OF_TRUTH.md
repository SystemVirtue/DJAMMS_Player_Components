# Source of Truth Architecture

## Answer: **Hybrid Approach - Supabase is Persistent, Player is Authoritative**

### Quick Answer

**Supabase is the persistent source of truth** (database), but **Electron Player is the authoritative writer** (only thing that writes to Supabase).

However, **on startup, Electron Player loads from LOCAL saved state first**, then syncs to/from Supabase.

---

## Detailed Architecture

### 1. **Supabase Database** = Persistent Source of Truth

**Role:**
- Stores `player_state` table with `active_queue`, `priority_queue`, `now_playing_video`, etc.
- Provides realtime subscriptions for multi-client sync
- Persists state across restarts (when online)

**Who writes:**
- ✅ **Electron Player only** (via `syncState()`)
- ❌ Web Admin never writes directly
- ❌ Kiosk never writes directly

**Who reads:**
- ✅ Electron Player (realtime subscription)
- ✅ Web Admin (realtime subscription)
- ✅ Kiosk (realtime subscription)

---

### 2. **Electron Player** = Authoritative Writer + Local Cache

**Role:**
- **Authoritative writer** - Only component that writes to Supabase
- **Local cache** - Maintains local state for offline playback
- **Command processor** - Processes commands from Web Admin/Kiosk

**On Startup:**
1. **Loads from LOCAL saved state first** (localStorage/settings)
   ```typescript
   // src/pages/PlayerWindow.tsx
   const savedQueueState = await electronAPI.getSetting('savedQueueState');
   if (savedQueueState && savedQueueState.activeQueue) {
     setQueue(savedQueueState.activeQueue);
     // ... restore local state
   }
   ```

2. **Then syncs to/from Supabase** (if online)
   - Subscribes to realtime updates
   - Writes local state to Supabase
   - Receives remote updates via conflict resolution

**During Runtime:**
- Writes local state changes to Supabase
- Receives remote updates via Realtime subscription
- Applies conflict resolution (last write wins)

---

### 3. **Web Admin** = Read-Only Consumer

**Role:**
- Reads from Supabase (realtime subscription)
- Sends commands to Electron Player (via Broadcast channel)
- Never writes directly to `player_state`

**Flow:**
```
Web Admin → Send Command → Electron Player → Process Command → Write to Supabase → Realtime Update → Web Admin
```

---

## Data Flow Diagram

### Startup Sequence

```
1. Electron Player Starts
   ↓
2. Load LOCAL saved state (localStorage)
   ↓
3. Initialize Supabase connection
   ↓
4. Subscribe to realtime updates
   ↓
5. Write local state to Supabase (if online)
   ↓
6. Receive remote updates (if any) via conflict resolution
```

### Runtime Sequence

```
Web Admin Action (e.g., reorder queue)
   ↓
Send Command via Broadcast
   ↓
Electron Player Receives Command
   ↓
Process Command (modify local queue)
   ↓
Write to Supabase (syncState)
   ↓
Supabase Trigger Sets updated_at = NOW()
   ↓
Realtime Broadcasts Update
   ↓
All Clients Receive Update (Electron, Web Admin, Kiosk)
   ↓
Conflict Resolution (if needed)
```

---

## Why This Architecture?

### Benefits

1. **Offline Capability**
   - Player can start and play from local saved state
   - Doesn't require Supabase connection on startup
   - Queues updates when offline, syncs on reconnect

2. **Fast Startup**
   - No network delay on startup
   - Local state loads instantly
   - Supabase sync happens in background

3. **Multi-Client Sync**
   - Supabase provides realtime sync
   - All clients see same state
   - Conflict resolution handles concurrent updates

4. **Single Source of Truth**
   - Supabase is the persistent database
   - All clients read from same source
   - Electron Player is the only writer (prevents conflicts)

### Trade-offs

1. **Startup State May Differ**
   - Local state might be older than Supabase
   - Sync happens after startup (may cause brief inconsistency)
   - Conflict resolution merges on first sync

2. **Potential Race Conditions**
   - Local state changes vs remote updates
   - Mitigated by conflict resolution (last write wins)
   - Transition lock prevents writes during playback changes

---

## Conflict Resolution Strategy

### When Local and Remote State Differ

**Scenario:** Electron Player starts with local state, but Supabase has newer state

**Resolution:**
1. Electron writes local state to Supabase
2. Receives remote update via Realtime
3. Compares timestamps (`updated_at`)
4. If remote is newer: Merge queues (preserve now-playing, adopt upcoming)
5. If local is newer: Ignore remote update

**Code:**
```typescript
// src/services/SupabaseService.ts - handlePlayerStateUpdate()
if (localTime > remoteTime) {
  // Local write is newer - ignore remote
  return;
}
// Remote is newer - merge
const mergedQueue = mergeQueueUpdates({...});
```

---

## Summary

| Component | Role | Writes to Supabase? | Reads from Supabase? | Source of Truth |
|-----------|------|---------------------|----------------------|-----------------|
| **Supabase** | Database | N/A | N/A | ✅ **Persistent** |
| **Electron Player** | Authoritative writer | ✅ Yes (only writer) | ✅ Yes (realtime) | ✅ **Authoritative** |
| **Web Admin** | Command sender | ❌ No | ✅ Yes (realtime) | ❌ Read-only |
| **Kiosk** | Command sender | ❌ No | ✅ Yes (realtime) | ❌ Read-only |

### Answer to Question

**Q: The single source of truth for all data is: SUPABASE? PLAYER?**

**A: Both, in different contexts:**
- **Supabase** = Persistent source of truth (database)
- **Electron Player** = Authoritative writer (only thing that writes)
- **Local State** = Fast startup cache (loaded first, then synced)

**In practice:**
- **On startup:** Local state → Supabase sync
- **During runtime:** Electron Player writes → Supabase → All clients read
- **Offline:** Local state only (queues updates for later sync)

---

## Recommendations

### Current Implementation is Correct ✅

The hybrid approach provides:
- ✅ Fast startup (local state)
- ✅ Offline capability (local playback)
- ✅ Multi-client sync (Supabase realtime)
- ✅ Conflict resolution (timestamp-based)

### Potential Improvements

1. **Startup Sync Priority**
   - Option: Fetch from Supabase first, fallback to local if offline
   - Trade-off: Slower startup, but more consistent

2. **State Versioning**
   - Add `queue_version` column for better conflict detection
   - Increment on each queue change
   - More reliable than timestamp comparison

3. **Explicit Sync on Startup**
   - After loading local state, explicitly fetch from Supabase
   - Compare and merge if different
   - Ensure consistency before starting playback

