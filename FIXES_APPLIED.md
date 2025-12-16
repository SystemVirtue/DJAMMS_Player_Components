# Fixes Applied - Player ID "NEW_PLAYER" Video Sync Issue

## Problem Identified
- Electron app uses player ID "NEW_PLAYER"
- Videos in Supabase are stored with player ID "DJAMMS_DEMO"
- Web Admin shows 0 videos for "NEW_PLAYER"
- Videos are not being re-indexed when player ID changes

## Root Causes
1. **SupabaseService not re-initializing**: When player ID changed, SupabaseService stayed initialized with old player ID
2. **Videos not re-indexed**: When player ID changed, videos weren't re-uploaded to Supabase with new player ID
3. **useSupabase hook not watching playerId**: The autoInit effect didn't re-initialize when playerId changed

## Fixes Applied

### 1. SupabaseService.initialize() - Re-initialize on Player ID Change
**File**: `src/services/SupabaseService.ts`
- Now detects when player ID changes and re-initializes
- Clears existing subscriptions before re-initializing
- Updates `this.playerId` with new player ID

### 2. useSupabase Hook - Watch playerId Changes
**File**: `src/hooks/useSupabase.ts`
- AutoInit effect now watches `playerId` changes
- Re-initializes when player ID changes (even if already initialized)
- Tracks last player ID to detect changes

### 3. PlayerWindow - Force Re-index on Player ID Change
**File**: `src/pages/PlayerWindow.tsx`
- When player ID changes, now explicitly calls `indexLocalVideos()` with `forceIndex = true`
- Ensures videos are uploaded to Supabase with new player ID
- No longer relies on playlist change effect (which may not trigger)

## SQL Query to Verify Data

Run this in Supabase SQL Editor:

```sql
-- Check if NEW_PLAYER has videos and player_state
SELECT 
  'NEW_PLAYER' as player_id,
  (SELECT COUNT(*) FROM local_videos WHERE player_id = 'NEW_PLAYER') as video_count,
  (SELECT COUNT(*) FROM player_state WHERE player_id = 'NEW_PLAYER') as has_player_state,
  (SELECT jsonb_array_length(active_queue) FROM player_state WHERE player_id = 'NEW_PLAYER') as active_queue_length
UNION ALL
SELECT 
  'DJAMMS_DEMO' as player_id,
  (SELECT COUNT(*) FROM local_videos WHERE player_id = 'DJAMMS_DEMO') as video_count,
  (SELECT COUNT(*) FROM player_state WHERE player_id = 'DJAMMS_DEMO') as has_player_state,
  (SELECT jsonb_array_length(active_queue) FROM player_state WHERE player_id = 'DJAMMS_DEMO') as active_queue_length;
```

See `supabase/check-new-player-data.sql` for detailed queries.

## Expected Behavior After Fix

1. When player ID changes to "NEW_PLAYER":
   - SupabaseService re-initializes with new player ID
   - Videos are re-indexed and uploaded to Supabase with player_id = "NEW_PLAYER"
   - Web Admin should see videos for "NEW_PLAYER"

2. When app starts with "NEW_PLAYER":
   - Videos should be indexed automatically on startup
   - Videos should appear in Supabase local_videos table with player_id = "NEW_PLAYER"

## Testing

1. Change player ID to "NEW_PLAYER" in Electron app
2. Check Electron logs for: "Player ID changed - re-indexing videos with new player ID"
3. Wait for indexing to complete
4. Run SQL query to verify videos exist for "NEW_PLAYER"
5. Check Web Admin - should show videos for "NEW_PLAYER"
