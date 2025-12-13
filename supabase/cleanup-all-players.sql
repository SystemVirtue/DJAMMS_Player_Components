-- ============================================================================
-- CLEANUP SCRIPT: Delete All Player Data from Supabase
-- ============================================================================
-- WARNING: This script will DELETE ALL player data including:
--   - All player_state records (queues, now-playing, etc.)
--   - All local_videos records (video library index)
--   - All admin_commands records
--   - All io_logs and io_log_sessions
--   - All other player-related data
--
-- USE WITH CAUTION - This is a destructive operation!
-- ============================================================================

-- Disable foreign key checks temporarily (if needed)
-- SET session_replication_role = 'replica';

-- 1. Delete all IO logs and sessions (player-specific logging)
DELETE FROM public.io_logs;
DELETE FROM public.io_log_sessions;

-- 2. Delete all admin commands (player commands)
DELETE FROM public.admin_commands;

-- 3. Delete all local videos (video library index)
DELETE FROM public.local_videos;

-- 4. Delete all player state records (queues, now-playing, etc.)
DELETE FROM public.player_state;

-- 5. Delete any other player-related tables (if they exist)
-- Uncomment if you have these tables:
-- DELETE FROM public.priority_requests;
-- DELETE FROM public.player_settings;
-- DELETE FROM public.player_heartbeats;

-- Verify deletion
SELECT 
  'player_state' as table_name, COUNT(*) as remaining_rows FROM public.player_state
UNION ALL
SELECT 'local_videos', COUNT(*) FROM public.local_videos
UNION ALL
SELECT 'admin_commands', COUNT(*) FROM public.admin_commands
UNION ALL
SELECT 'io_logs', COUNT(*) FROM public.io_logs
UNION ALL
SELECT 'io_log_sessions', COUNT(*) FROM public.io_log_sessions;

-- Expected result: All counts should be 0

-- ============================================================================
-- ALTERNATIVE: Delete specific player_id only
-- ============================================================================
-- If you want to delete a specific player instead of all players:
--
-- DELETE FROM public.io_logs WHERE player_id = 'YOUR_PLAYER_ID';
-- DELETE FROM public.io_log_sessions WHERE player_id = 'YOUR_PLAYER_ID';
-- DELETE FROM public.admin_commands WHERE player_id = 'YOUR_PLAYER_ID';
-- DELETE FROM public.local_videos WHERE player_id = 'YOUR_PLAYER_ID';
-- DELETE FROM public.player_state WHERE player_id = 'YOUR_PLAYER_ID';
--
-- ============================================================================

