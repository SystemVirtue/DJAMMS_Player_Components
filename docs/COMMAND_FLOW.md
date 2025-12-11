# Command Flow: How Web Admin Commands Are Processed

## Answer: **Option 1** ✅

**Web Admin sends command → Electron Player receives → Electron interprets and executes → Electron updates Supabase**

The database (`admin_commands` table) is **NOT** used to make direct changes. It's only for:
- Audit trail (optional)
- Fallback polling (if Broadcast fails)

---

## Detailed Flow

### Step 1: Web Admin Sends Command

**Code:** `web/shared/supabase-client.ts` - `insertCommand()`

```typescript
// 1. Build command object
const command: SupabaseCommand = {
  id: commandId,
  player_id: playerId,
  command_type: 'queue_move',
  command_data: { fromIndex: 2, toIndex: 5 },
  issued_by: 'web-admin',
  status: 'pending',
  ...
};

// 2. Broadcast via Supabase Broadcast channel (INSTANT delivery)
const commandChannel = await getCommandChannel(playerId);
await commandChannel.send({
  type: 'broadcast',
  event: 'command',
  payload: { command, timestamp: new Date().toISOString() }
});

// 3. Insert to admin_commands table (OPTIONAL, fire-and-forget)
// This is for audit trail and fallback polling only
supabase.from('admin_commands').insert(insertPayload);
```

**Key Points:**
- ✅ **Broadcast is primary** - instant delivery via Supabase Realtime Broadcast
- ⚠️ **Database insert is optional** - only for audit/fallback
- ❌ **NO direct changes to `player_state` table**

---

### Step 2: Electron Player Receives Command

**Code:** `src/services/SupabaseService.ts` - `startCommandListener()`

```typescript
// Subscribe to Broadcast channel
this.commandChannel = this.client
  .channel(`djamms-commands:${this.playerId}`)
  .on('broadcast', { event: 'command' }, async (payload) => {
    const command = payload.payload.command;
    
    // Verify command is for this player
    if (command.player_id !== this.playerId) {
      return; // Ignore
    }
    
    // Process the command
    await this.processCommand(command);
  });
```

**Fallback:** If Broadcast fails, Electron polls `admin_commands` table:
```typescript
// Poll for pending commands
const { data: pendingCommands } = await this.client
  .from('admin_commands')
  .select('*')
  .eq('player_id', this.playerId)
  .eq('status', 'pending')
  .order('created_at', { ascending: true });
```

**Key Points:**
- ✅ **Primary:** Broadcast channel (instant)
- ⚠️ **Fallback:** Polling `admin_commands` table (if Broadcast fails)
- ❌ **NOT:** Reading from `player_state` table

---

### Step 3: Electron Player Processes Command

**Code:** `src/services/SupabaseService.ts` - `processCommand()`

```typescript
// Register command handlers
service.onCommand('queue_move', (cmd) => {
  const payload = cmd.command_data as { fromIndex: number; toIndex: number };
  onQueueMove(payload.fromIndex, payload.toIndex);
});
```

**Code:** `src/pages/PlayerWindow.tsx` - `onQueueMove()`

```typescript
onQueueMove: (fromIndex, toIndex) => {
  // 1. Modify LOCAL queue state
  setQueue(prev => {
    const newQueue = [...prev];
    const [movedItem] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedItem);
    
    // 2. Sync to Supabase
    syncState({ activeQueue: newQueue, queueIndex: newQueueIdx }, true);
    
    return newQueue;
  });
}
```

**Key Points:**
- ✅ **Electron interprets** the command
- ✅ **Electron executes** the change (modifies local state)
- ✅ **Electron writes** to Supabase after execution

---

### Step 4: Electron Player Updates Supabase

**Code:** `src/services/SupabaseService.ts` - `performStateSync()`

```typescript
// Write to player_state table
const { data: updatedRow, error } = await this.client
  .from('player_state')
  .update({
    active_queue: newQueue.map(v => this.videoToQueueItem(v)),
    updated_at: new Date().toISOString() // Trigger will override this
  })
  .eq('id', this.playerStateId)
  .select('updated_at, last_updated')
  .single();

// Update conflict resolution timestamp
this.lastQueueUpdateTime = updatedRow?.updated_at || new Date().toISOString();
```

**Database Trigger:**
```sql
-- Automatically sets updated_at = NOW() on every UPDATE
CREATE TRIGGER update_player_state_updated_at
  BEFORE UPDATE ON player_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Key Points:**
- ✅ **Electron writes** to `player_state.active_queue`
- ✅ **Trigger sets** `updated_at = NOW()`
- ✅ **Realtime broadcasts** update to all subscribers

---

### Step 5: Realtime Update Broadcasts to All Clients

**Code:** `src/services/SupabaseService.ts` - `startPlayerStateSubscription()`

```typescript
// Subscribe to player_state changes
this.playerStateChannel = this.client
  .channel(`player-state:${this.playerId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'player_state',
    filter: `player_id=eq.${this.playerId}`
  }, (payload) => {
    // Receive update (including own writes)
    this.handlePlayerStateUpdate(payload);
  });
```

**All Clients Receive:**
- ✅ Electron Player (conflict resolution)
- ✅ Web Admin (UI update)
- ✅ Kiosk (UI update)

---

## Complete Flow Diagram

```
┌─────────────┐
│ Web Admin   │
└──────┬──────┘
       │
       │ 1. Send Command
       │    insertCommand('queue_move', { fromIndex: 2, toIndex: 5 })
       │
       ▼
┌─────────────────────────────────────┐
│ Supabase Broadcast Channel          │
│ (Instant delivery, no DB round-trip) │
└──────┬──────────────────────────────┘
       │
       │ 2. Broadcast
       │    (Also: Optional insert to admin_commands for audit)
       │
       ▼
┌──────────────────────┐
│ Electron Player       │
│ Receives Command      │
└──────┬───────────────┘
       │
       │ 3. Process Command
       │    onQueueMove(2, 5)
       │    - Modify local queue state
       │    - Reorder queue array
       │
       ▼
┌──────────────────────┐
│ Electron Player       │
│ Executes Change       │
│ - Local state updated │
└──────┬───────────────┘
       │
       │ 4. Sync to Supabase
       │    syncState({ activeQueue: newQueue })
       │
       ▼
┌──────────────────────┐
│ Supabase Database    │
│ player_state table    │
│ - UPDATE active_queue │
│ - Trigger sets        │
│   updated_at = NOW()  │
└──────┬───────────────┘
       │
       │ 5. Realtime Broadcast
       │    postgres_changes event
       │
       ▼
┌─────────────────────────────────────┐
│ All Subscribers Receive Update      │
│ - Electron Player (conflict check)  │
│ - Web Admin (UI refresh)            │
│ - Kiosk (UI refresh)                │
└─────────────────────────────────────┘
```

---

## Key Differences from Option 2

### ❌ Option 2 (NOT how it works):
```
Web Admin → Supabase (direct DB changes) → Realtime → Player
```

**Why this doesn't happen:**
- Web Admin **never writes** to `player_state` table
- Commands are **not executed** in the database
- Database **does not interpret** commands

### ✅ Option 1 (Actual flow):
```
Web Admin → Command → Electron (interprets & executes) → Supabase (stores result)
```

**Why this works:**
- Electron has **full control** over queue state
- Commands are **interpreted** by Electron (can validate, merge, etc.)
- Database only **stores the result**, not the command execution

---

## Why This Architecture?

### Benefits

1. **Single Source of Truth**
   - Only Electron writes to `player_state`
   - Prevents conflicts from multiple writers
   - Electron is authoritative

2. **Command Validation**
   - Electron can validate commands before execution
   - Can merge with current state intelligently
   - Can reject invalid commands

3. **Offline Capability**
   - Commands can be queued when offline
   - Electron processes when online
   - No database dependency for command execution

4. **Audit Trail**
   - `admin_commands` table stores all commands
   - Can track who sent what, when
   - Can replay commands if needed

### Trade-offs

1. **Latency**
   - Command → Electron → Supabase → Realtime → Web Admin
   - Slightly slower than direct DB write
   - But more reliable and controlled

2. **Complexity**
   - Requires Electron to be running
   - Command processing logic in Electron
   - But provides more flexibility

---

## Summary

**Answer: Option 1** ✅

**Flow:**
1. Web Admin sends command via Broadcast channel
2. Electron Player receives command
3. Electron Player **interprets and executes** command (modifies local state)
4. Electron Player **writes result** to Supabase `player_state` table
5. Supabase Realtime broadcasts update to all clients

**Database Role:**
- `admin_commands` table: Audit trail + fallback polling (NOT for execution)
- `player_state` table: Stores final state (written by Electron only)

**Key Point:** The database does NOT execute commands. Electron Player does.

