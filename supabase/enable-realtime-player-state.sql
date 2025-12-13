-- ============================================================
-- Enable Realtime for player_state Table
-- Run this SQL in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable Realtime for player_state table
-- This allows Web Admin and Kiosk to receive real-time updates
-- when Electron Player syncs queue changes

DO $$
BEGIN
  -- Add player_state to Realtime publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
    RAISE NOTICE '✅ player_state added to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'ℹ️ player_state already in supabase_realtime publication';
  END;
END $$;

-- ============================================================
-- Verification Queries
-- ============================================================

-- 1. Check if player_state is in Realtime publication
SELECT 
  schemaname,
  tablename,
  pubname as publication_name
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'player_state';

-- Expected result: Should return 1 row showing player_state in supabase_realtime

-- 2. Check player_state table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'player_state'
ORDER BY ordinal_position;

-- 3. Check if there are any player_state rows (optional)
SELECT 
  player_id,
  status,
  now_playing_video->>'title' as now_playing_title,
  jsonb_array_length(active_queue) as active_queue_length,
  jsonb_array_length(priority_queue) as priority_queue_length,
  last_updated,
  is_online
FROM player_state
ORDER BY last_updated DESC
LIMIT 5;

-- ============================================================
-- Optional: Enable Realtime for Related Tables
-- ============================================================

-- Enable Realtime for local_videos (for playlist updates)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE local_videos;
    RAISE NOTICE '✅ local_videos added to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'ℹ️ local_videos already in supabase_realtime publication';
  END;
END $$;

-- Enable Realtime for admin_commands (for command status updates)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_commands;
    RAISE NOTICE '✅ admin_commands added to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'ℹ️ admin_commands already in supabase_realtime publication';
  END;
END $$;

-- ============================================================
-- View All Realtime-Enabled Tables
-- ============================================================

SELECT 
  schemaname,
  tablename,
  pubname as publication_name
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Expected result: Should show player_state, local_videos, and admin_commands

-- ============================================================
-- Troubleshooting
-- ============================================================

-- If Realtime is not working, check:
-- 1. Table is in publication (query above)
-- 2. RLS policies allow reads (if RLS is enabled)
-- 3. Client is using correct Supabase URL and keys
-- 4. Network/firewall allows WebSocket connections

-- Check RLS policies on player_state (if RLS is enabled)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'player_state';

-- ============================================================
-- Notes
-- ============================================================

-- After running this SQL:
-- 1. Web Admin should be able to subscribe to player_state changes
-- 2. Realtime updates will be received when Electron syncs
-- 3. Check browser console for subscription status:
--    - Look for: "[SupabaseClient] Player state subscription: SUBSCRIBED"
--    - If you see CHANNEL_ERROR or TIMED_OUT, check:
--      a. Table is in publication (run verification query above)
--      b. RLS policies allow reads
--      c. Supabase project has Realtime enabled (Dashboard > Settings > API)
