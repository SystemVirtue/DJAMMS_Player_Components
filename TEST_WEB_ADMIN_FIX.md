# Web Admin Fix - Testing Instructions

## Issues Fixed

1. **SupabaseService re-initializes when player ID changes**
   - Added `forceReinit` parameter to `initialize()` method
   - Service now detects player ID changes and re-initializes automatically

2. **useSupabase hook re-initializes when player ID changes**
   - Hook now watches for player ID changes and re-initializes SupabaseService

3. **Videos are re-indexed when player ID changes**
   - When player ID changes, videos are now force re-indexed with the new player ID
   - This ensures videos appear in Web Admin for the new player ID

## Root Cause

When the Electron player's player ID changed from "DJAMMS_DEMO" to "M_BIGGA_IMAC4":
- SupabaseService was initialized with "DJAMMS_DEMO"
- Videos were indexed with `player_id = 'DJAMMS_DEMO'`
- When player ID changed to "M_BIGGA_IMAC4", SupabaseService didn't re-initialize
- Videos weren't re-indexed with the new player ID
- Web Admin looked for videos with `player_id = 'M_BIGGA_IMAC4'` but found none

## Testing Steps

1. **Start Electron Player**
   - Ensure player ID is set to "M_BIGGA_IMAC4"
   - Wait for playlists to load and index

2. **Check Electron Console**
   - Look for: `[PlayerWindow] ✅ Re-indexed videos with new player ID: M_BIGGA_IMAC4`
   - Verify: `[SupabaseService] Indexed X videos from Y playlists`

3. **Open Web Admin** (http://localhost:5176/)
   - Connect with player ID "M_BIGGA_IMAC4"
   - Check browser console for:
     - `[SupabaseClient] ✅ getAllLocalVideos returned X videos for playerId: M_BIGGA_IMAC4`
     - Should NOT see: `⚠️ WARNING: No videos found for playerId "M_BIGGA_IMAC4"`

4. **Verify Playlists Display**
   - Sidebar should show playlists with correct counts
   - Counts should match Electron Admin (or be close, accounting for grouping differences)

5. **Verify Queue Display**
   - "Now Playing" section should show current video
   - "UP NEXT" section should show active queue

## Expected Results

- ✅ Web Admin finds videos for player ID "M_BIGGA_IMAC4"
- ✅ Playlists display with correct counts
- ✅ Queue and "Now Playing" sync correctly
- ✅ No console errors about missing videos

## If Issues Persist

1. **Manual Re-index**: In Electron Player → Tools tab → "Re-index Playlists"
2. **Check Supabase**: Verify videos exist in `local_videos` table with `player_id = 'M_BIGGA_IMAC4'`
3. **Check Console**: Look for indexing logs in Electron console
