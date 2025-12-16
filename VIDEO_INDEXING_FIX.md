# Video Indexing Fix for "NEW_PLAYER"

## Current Status
- ✅ Supabase has **5681 videos** for `DJAMMS_DEMO`
- ❌ Supabase has **0 videos** for `NEW_PLAYER`
- ⚠️ Electron app is using `NEW_PLAYER` but videos haven't been indexed yet

## Root Cause
When player ID changes from `DJAMMS_DEMO` to `NEW_PLAYER`, videos need to be re-indexed with the new player ID. The indexing should happen automatically, but may not be triggering.

## Solution: Manual Re-Index

### Option 1: Use Tools Menu (Recommended)
1. Open Electron app
2. Go to **Settings** → **Tools** tab
3. Click **"Re-Index Music Database"** button
4. Wait for indexing to complete (progress bar will show)
5. Check Supabase - videos should appear for `NEW_PLAYER`

### Option 2: Change Player ID Back and Forth
1. Change player ID to something else (e.g., `DJAMMS_DEMO`)
2. Wait for it to initialize
3. Change player ID back to `NEW_PLAYER`
4. This should trigger re-indexing automatically

### Option 3: Restart App with NEW_PLAYER
1. Make sure player ID is set to `NEW_PLAYER` in settings
2. Close the app completely
3. Restart the app
4. On startup, it should detect the player ID and index videos

## Verification SQL

Run this in Supabase SQL Editor to check if indexing worked:

```sql
-- Check video count for NEW_PLAYER
SELECT 
  player_id,
  COUNT(*) as video_count,
  MAX(last_scanned) as most_recent_scan
FROM local_videos
WHERE player_id = 'NEW_PLAYER'
GROUP BY player_id;
```

Expected result after indexing:
- `video_count` should be **5681** (or close to it, depending on your playlists)
- `most_recent_scan` should be recent (within last few minutes)

## Code Changes Applied

1. **SupabaseService.initialize()** - Now re-initializes when player ID changes
2. **useSupabase hook** - Watches playerId and re-initializes automatically
3. **PlayerWindow** - Forces re-indexing when player ID changes
4. **Better logging** - Added logs to show which player ID is being used for indexing

## Debugging

Check Electron logs for:
- `[SupabaseService] Starting video indexing for player: NEW_PLAYER`
- `[SupabaseService] Count check - Supabase has X videos for player NEW_PLAYER`
- `[PlayerWindow] Player ID changed - re-indexing videos with new player ID: NEW_PLAYER`

If you don't see these logs, indexing isn't being triggered. Use the manual re-index option.
