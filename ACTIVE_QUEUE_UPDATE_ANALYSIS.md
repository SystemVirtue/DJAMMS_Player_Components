# Active Queue Update Analysis

## Problem
WEB_ADMIN is not receiving `active_queue` updates from ELECTRON player.

## Investigation Results

### ✅ ELECTRON IS Sending active_queue Updates

**Evidence:**
1. **PlayerWindow.tsx** (lines 2501, 2513): `syncState()` is called with `activeQueue: queue`
2. **SupabaseService.ts** (line 569): `activeQueue` is mapped to `updateData.active_queue`
3. **SupabaseService.ts** (line 714): Database update is executed with `updateData` containing `active_queue`

### ✅ WEB_ADMIN IS Subscribed

**Evidence:**
1. **App.tsx** (line 476): `subscribeToPlayerState()` is called
2. **supabase-client.ts** (lines 216-242): Realtime subscription is set up with proper filter
3. **App.tsx** (lines 347-372): `applyState()` properly handles `active_queue` updates

### ❌ ISSUE FOUND: lastSyncedState Management

**Problem Location:** `SupabaseService.ts` line 764

```typescript
this.lastSyncedState = updateData; // ❌ PROBLEM: Replaces entire state with partial update
```

**Root Cause:**
- `updateData` is a `Partial<SupabasePlayerState>` containing only fields that changed
- When `lastSyncedState` is replaced (not merged), it loses fields from previous syncs
- Subsequent comparisons use incomplete state, causing incorrect "no change" detection

**Example Scenario:**
1. **First sync:** `updateData = { active_queue: [A, B, C], status: 'playing' }`
   - `lastSyncedState = { active_queue: [A, B, C], status: 'playing' }` ✅
2. **Second sync:** `updateData = { status: 'paused' }` (only status changed, queue not provided)
   - Line 573-575: Preserves old queue ✅
   - Line 764: `lastSyncedState = { status: 'paused' }` ❌ **LOST active_queue!**
3. **Third sync:** `updateData = { active_queue: [A, B, C, D] }` (queue changed)
   - Line 623: `lastActiveQueue = lastSyncedState?.active_queue || []` = `[]` ❌
   - Comparison thinks queue changed from `[]` to `[A, B, C, D]`, but might skip if other logic interferes

**Additional Issue:**
- Line 656-658: Skips sync if queue content unchanged (same IDs, possibly reordered)
- This is intentional but might be too aggressive if queue order matters

## Fix Required

**File:** `DJAMMS_PLAYER_REACT_MIGRATION/src/services/SupabaseService.ts`

**Change line 764 from:**
```typescript
this.lastSyncedState = updateData;
```

**To:**
```typescript
// Merge updateData into lastSyncedState to preserve all fields
this.lastSyncedState = {
  ...this.lastSyncedState,
  ...updateData
} as Partial<SupabasePlayerState>;
```

This ensures `lastSyncedState` always contains the complete last synced state, not just the fields from the most recent update.

## Verification Steps

After fix:
1. Check ELECTRON logs for "Syncing queue to Supabase" messages
2. Check SupabaseService logs for "State synced successfully" with queue_length
3. Check WEB_ADMIN console for "Received player state update" with queue_length
4. Verify `active_queue` appears in Supabase database `player_state` table
5. Verify WEB_ADMIN UI shows updated queue

