# Web Admin Realtime Subscription Verification

## ✅ YES - Web Admin IS Subscribed to Realtime

### Subscription Setup

**Location:** `web/admin/src/App.tsx` line 476

```typescript
const channel = subscribeToPlayerState(playerId, (state) => {
  console.log('[WebAdmin] Realtime subscription callback fired with state:', {
    hasState: !!state,
    hasActiveQueue: !!state?.active_queue,
    activeQueueLength: state?.active_queue?.length,
    // ...
  });
  applyState(state); // Processes active_queue updates
});
```

### Subscription Implementation

**Location:** `web/shared/supabase-client.ts` lines 219-244

```typescript
const channel = supabase
  .channel(`player_state:${playerId}`)
  .on(
    'postgres_changes',
    {
      event: '*',  // All events (INSERT, UPDATE, DELETE)
      schema: 'public',
      table: 'player_state',
      filter: `player_id=eq.${playerId}`  // Server-side filter
    },
    (payload) => {
      const newState = payload.new as SupabasePlayerState;
      if (newState) {
        console.log(`[SupabaseClient] Received Realtime update:`, {
          queue_length: newState.active_queue?.length,
          // ...
        });
        callback(newState); // Calls applyState in Web Admin
      }
    }
  )
  .subscribe((status) => {
    console.log(`[SupabaseClient] Player state subscription: ${status}`);
    // Status: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, etc.
  });
```

### How It Works

1. **Web Admin subscribes** when component mounts (line 476)
2. **Supabase Realtime** listens for `player_state` table changes
3. **Filter applied** - Only receives updates for matching `player_id`
4. **Callback fires** - Receives `newState` with `active_queue`
5. **applyState() called** - Processes `active_queue` and updates UI (lines 347-372)

---

## ⚠️ Potential Issues & Verification

### Issue 1: Realtime Not Enabled in Supabase Dashboard

**Symptom:** Subscription status shows `CHANNEL_ERROR` or `TIMED_OUT`

**Check:**
1. Open Supabase Dashboard → Realtime → Tables
2. Verify `player_state` table has Realtime enabled
3. Check if `player_id` filter is enabled (optional but recommended)

**Fix:**
```sql
-- Ensure table is in Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
```

### Issue 2: Subscription Status Not SUBSCRIBED

**Check Browser Console:**
```javascript
// Look for these logs:
[SupabaseClient] Player state subscription: SUBSCRIBED  // ✅ Good
[SupabaseClient] Player state subscription: CHANNEL_ERROR  // ❌ Bad
[SupabaseClient] Player state subscription: TIMED_OUT  // ❌ Bad
```

**If CHANNEL_ERROR or TIMED_OUT:**
- Fallback polling activates (every 2 seconds)
- Check console for: `[SupabaseClient] Realtime subscription failed, starting fallback polling`
- Polling should still work, but with 2-second delay instead of real-time

### Issue 3: Filter Not Working

**Symptom:** Receiving updates for wrong `player_id`

**Check:**
- Verify `playerId` in Web Admin matches Electron's `player_id`
- Check console logs for `player_id` values
- Filter should be: `player_id=eq.${playerId}`

### Issue 4: Callback Not Receiving active_queue

**Check Browser Console:**
```javascript
// Look for these logs when Electron syncs:
[SupabaseClient] Received Realtime update for player ${playerId}: {
  queue_length: 5,  // ✅ Should show queue length
  // ...
}

[WebAdmin] Realtime subscription callback fired with state: {
  hasActiveQueue: true,  // ✅ Should be true
  activeQueueLength: 5,  // ✅ Should show length
  // ...
}
```

**If `hasActiveQueue: false` or `activeQueueLength: 0`:**
- Check if Electron is actually syncing `active_queue`
- Verify Supabase database has `active_queue` data
- Check if sync is being skipped (see sync issues remediation)

---

## Verification Steps

### Step 1: Check Subscription Status

1. **Open Web Admin** in browser
2. **Open Browser Console** (F12)
3. **Look for:**
   ```
   [WebAdmin] Setting up realtime subscription for player: [PLAYER_ID]
   [SupabaseClient] Player state subscription: SUBSCRIBED
   ```

### Step 2: Test Realtime Updates

1. **In Electron Player:** Change queue (add/remove/reorder)
2. **Watch Browser Console:**
   ```
   [SupabaseClient] Received Realtime update for player [PLAYER_ID]: {
     queue_length: [NEW_LENGTH],
     ...
   }
   [WebAdmin] Realtime subscription callback fired with state: {
     hasActiveQueue: true,
     activeQueueLength: [NEW_LENGTH],
     ...
   }
   [WebAdmin] Setting active queue: [NEW_LENGTH] items
   ```

### Step 3: Verify Database Updates

1. **Check Supabase Dashboard:**
   - Go to Table Editor → `player_state`
   - Find row with matching `player_id`
   - Verify `active_queue` column has data (JSONB array)

### Step 4: Check Fallback Polling

If Realtime fails, polling should activate:
```
[SupabaseClient] Realtime subscription failed, starting fallback polling
[SupabaseClient] Polled state update for player [PLAYER_ID]: {
  queue_length: [LENGTH],
  ...
}
```

**Note:** Polling works but has 2-second delay instead of real-time

---

## Troubleshooting

### Problem: No Realtime Updates Received

**Possible Causes:**
1. ❌ Realtime not enabled in Supabase Dashboard
2. ❌ Table not in Realtime publication
3. ❌ Subscription failed (check status logs)
4. ❌ Electron not syncing (check Electron logs)
5. ❌ Wrong `player_id` (filter mismatch)

**Solutions:**
1. Enable Realtime in Dashboard (see Issue 1)
2. Run SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE player_state;`
3. Check subscription status in console
4. Verify Electron is syncing (check `SupabaseService.ts` logs)
5. Verify `player_id` matches between Electron and Web Admin

### Problem: Receiving Updates But active_queue is Empty

**Possible Causes:**
1. ❌ Electron syncing empty queue
2. ❌ Sync being skipped (see sync issues remediation)
3. ❌ `lastSyncedState` bug (should be fixed now)

**Solutions:**
1. Check Electron logs for sync messages
2. Verify sync fixes are applied (see `SYNC_ISSUES_REMEDIATION.md`)
3. Check if `active_queue` is in `updateData` when syncing

### Problem: Updates Delayed (2+ seconds)

**Possible Causes:**
1. ❌ Realtime subscription failed, using fallback polling
2. ❌ Network latency

**Solutions:**
1. Check subscription status (should be `SUBSCRIBED`)
2. Enable Realtime in Dashboard if not enabled
3. Check network connection

---

## Expected Behavior

### ✅ Working Correctly

1. **On Web Admin Load:**
   - Fetches initial state (line 444-468)
   - Sets up Realtime subscription (line 476)
   - Subscription status: `SUBSCRIBED`

2. **When Electron Syncs:**
   - Realtime update received within ~100-500ms
   - Console logs show `active_queue` data
   - UI updates immediately

3. **When Realtime Fails:**
   - Fallback polling activates (2-second intervals)
   - Updates still received, but delayed

### ❌ Not Working

1. **No subscription logs:**
   - Check if `subscribeToPlayerState` is called
   - Check if Supabase client is initialized

2. **CHANNEL_ERROR or TIMED_OUT:**
   - Check Realtime configuration in Dashboard
   - Verify table is in publication

3. **Updates not received:**
   - Check Electron sync logs
   - Verify `player_id` matches
   - Check database for actual updates

---

## Summary

✅ **Web Admin IS subscribed to Realtime**  
✅ **Subscription is correctly configured**  
✅ **Filter is applied (player_id)**  
✅ **Fallback polling exists if Realtime fails**  
✅ **Callback processes active_queue correctly**

**If not receiving updates:**
1. Check subscription status in console
2. Verify Realtime is enabled in Supabase Dashboard
3. Verify Electron is syncing `active_queue`
4. Check `player_id` matches between Electron and Web Admin
5. Review sync issues remediation fixes


