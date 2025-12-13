-- ============================================================
-- Check Supabase Data for "NEW_PLAYER"
-- Run this SQL in Supabase SQL Editor to verify data
-- ============================================================

-- 1. Check if NEW_PLAYER exists in player_state
SELECT 
  player_id,
  id as player_state_id,
  CASE 
    WHEN active_queue IS NULL THEN 'NULL'
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)::text || ' items'
    ELSE jsonb_typeof(active_queue)
  END as active_queue_status,
  CASE 
    WHEN priority_queue IS NULL THEN 'NULL'
    WHEN jsonb_typeof(priority_queue) = 'array' THEN jsonb_array_length(priority_queue)::text || ' items'
    ELSE jsonb_typeof(priority_queue)
  END as priority_queue_status,
  now_playing_video->>'title' as now_playing_title,
  last_updated,
  updated_at,
  is_online,
  status
FROM player_state
WHERE player_id = 'NEW_PLAYER';

-- 2. Check how many videos exist for NEW_PLAYER in local_videos
SELECT 
  COUNT(*) as video_count,
  COUNT(DISTINCT player_id) as player_count,
  MIN(created_at) as first_video_added,
  MAX(last_scanned) as last_scan_time
FROM local_videos
WHERE player_id = 'NEW_PLAYER';

-- 3. Check all player IDs that have videos
SELECT 
  player_id,
  COUNT(*) as video_count,
  MIN(created_at) as first_video_added,
  MAX(last_scanned) as last_scan_time
FROM local_videos
GROUP BY player_id
ORDER BY video_count DESC;

-- 4. Check if NEW_PLAYER has any videos (detailed)
SELECT 
  player_id,
  title,
  artist,
  filename,
  file_path,
  duration,
  metadata->>'playlist' as playlist,
  is_available,
  created_at,
  last_scanned
FROM local_videos
WHERE player_id = 'NEW_PLAYER'
ORDER BY created_at DESC
LIMIT 20;

-- 5. Compare NEW_PLAYER vs DJAMMS_DEMO
SELECT 
  'NEW_PLAYER' as player_id,
  COUNT(*) as video_count
FROM local_videos
WHERE player_id = 'NEW_PLAYER'
UNION ALL
SELECT 
  'DJAMMS_DEMO' as player_id,
  COUNT(*) as video_count
FROM local_videos
WHERE player_id = 'DJAMMS_DEMO';

-- 6. Check player_state for both players
SELECT 
  player_id,
  CASE 
    WHEN active_queue IS NULL THEN 0
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)
    ELSE 0
  END as active_queue_length,
  CASE 
    WHEN priority_queue IS NULL THEN 0
    WHEN jsonb_typeof(priority_queue) = 'array' THEN jsonb_array_length(priority_queue)
    ELSE 0
  END as priority_queue_length,
  now_playing_video->>'title' as now_playing,
  last_updated,
  is_online
FROM player_state
WHERE player_id IN ('NEW_PLAYER', 'DJAMMS_DEMO')
ORDER BY player_id;

-- 7. Check if videos were indexed recently (check timestamps)
SELECT 
  player_id,
  COUNT(*) as total_videos,
  COUNT(CASE WHEN last_scanned > NOW() - INTERVAL '1 hour' THEN 1 END) as scanned_last_hour,
  COUNT(CASE WHEN last_scanned > NOW() - INTERVAL '24 hours' THEN 1 END) as scanned_last_24h,
  MAX(last_scanned) as most_recent_scan
FROM local_videos
WHERE player_id IN ('NEW_PLAYER', 'DJAMMS_DEMO')
GROUP BY player_id;
