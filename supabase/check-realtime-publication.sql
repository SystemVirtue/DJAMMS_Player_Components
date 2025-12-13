-- ============================================================
-- Check if player_state is in Realtime Publication
-- This is the CRITICAL check for Realtime to work
-- ============================================================

-- Check if player_state is in supabase_realtime publication
SELECT 
  schemaname,
  tablename,
  pubname as publication_name,
  '✅ IN PUBLICATION' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'player_state';

-- If the query above returns NO ROWS, run this to enable:
-- ALTER PUBLICATION supabase_realtime ADD TABLE player_state;

-- ============================================================
-- Check all tables in Realtime publication
-- ============================================================

SELECT 
  schemaname,
  tablename,
  pubname as publication_name
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Expected: Should show player_state, local_videos, and admin_commands

-- ============================================================
-- Detailed player_state data check
-- ============================================================

-- Check actual queue data structure for each player
SELECT 
  player_id,
  status,
  -- Check if active_queue is actually an array
  jsonb_typeof(active_queue) as active_queue_type,
  CASE 
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(COALESCE(active_queue, '[]'::jsonb))
    ELSE 0
  END as active_queue_length,
  -- Check if priority_queue is actually an array
  jsonb_typeof(priority_queue) as priority_queue_type,
  CASE 
    WHEN jsonb_typeof(priority_queue) = 'array' THEN jsonb_array_length(COALESCE(priority_queue, '[]'::jsonb))
    ELSE 0
  END as priority_queue_length,
  -- Check now_playing_video structure
  jsonb_typeof(now_playing_video) as now_playing_type,
  now_playing_video->>'title' as now_playing_title,
  now_playing_video->>'id' as now_playing_id,
  last_updated,
  is_online
FROM player_state
ORDER BY last_updated DESC;

-- ============================================================
-- Check for any data issues
-- ============================================================

-- Players with empty queues but playing videos (might indicate sync issue)
SELECT 
  player_id,
  status,
  jsonb_array_length(COALESCE(active_queue, '[]'::jsonb)) as active_queue_length,
  jsonb_array_length(COALESCE(priority_queue, '[]'::jsonb)) as priority_queue_length,
  now_playing_video->>'title' as now_playing_title,
  last_updated
FROM player_state
WHERE (
  jsonb_array_length(COALESCE(active_queue, '[]'::jsonb)) = 0 
  AND jsonb_array_length(COALESCE(priority_queue, '[]'::jsonb)) = 0
  AND now_playing_video IS NOT NULL
)
ORDER BY last_updated DESC;

-- This might indicate:
-- 1. Queue was cleared but video is still playing
-- 2. Sync issue where queue wasn't synced but video was
-- 3. Normal state if video finished and queue is empty
