# Supabase Cleanup Instructions

## Problem
The priority queue has been corrupted with thousands of duplicate entries of "Air Supply - All Out Of Love". This script will delete all player data from Supabase to start fresh.

## Solution Implemented

### 1. Priority Queue Player-Specific Protection
- Added `player_id` verification in `handlePlayerStateUpdate()` to ensure updates are only processed for the current player
- Added duplicate removal when syncing priority queue to Supabase
- Added duplicate removal when receiving remote priority queue updates
- The duplicate prevention we added earlier (in main.cjs) will prevent new duplicates from being added

### 2. Cleanup Scripts

Two cleanup methods are available:

#### Method 1: SQL Script (Recommended for Supabase Dashboard)
1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/cleanup-all-players.sql`
4. Run the script
5. Verify all counts are 0

#### Method 2: Node.js Script (Command Line)
```bash
# Make sure you have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
cd /Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/DJAMMS_PLAYER_REACT_MIGRATION
node scripts/cleanup-supabase-players.js
```

**Required Environment Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for admin access)

## What Gets Deleted

The cleanup script deletes:
- ✅ `player_state` - All player queues, now-playing, status (this clears the corrupted priority queue)
- ✅ `local_videos` - All video library indexes
- ✅ `admin_commands` - All command history
- ✅ `io_logs` - All IO event logs
- ✅ `io_log_sessions` - All logging sessions

## After Cleanup

1. Restart your Electron Player
2. It will create a fresh `player_state` row with empty queues
3. Load a playlist to populate the active queue
4. The priority queue will now be properly player-specific and duplicate-free

## Prevention

The following safeguards are now in place:
1. ✅ Duplicate check when adding to priority queue (main.cjs)
2. ✅ Player ID verification when receiving remote updates (SupabaseService.ts)
3. ✅ Duplicate removal when syncing priority queue (SupabaseService.ts)
4. ✅ Duplicate removal when receiving remote priority queue (SupabaseService.ts)

These should prevent the issue from happening again.

