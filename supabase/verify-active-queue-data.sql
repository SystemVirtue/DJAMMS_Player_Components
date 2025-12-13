-- ============================================================
-- Verify active_queue Data in Database
-- Run this SQL in Supabase SQL Editor to check if player_state
-- table actually contains active_queue data
-- ============================================================

-- 1. Check if player_state table exists and has rows
SELECT 
  COUNT(*) as total_rows,
  COUNT(DISTINCT player_id) as unique_players
FROM player_state;

-- Expected: Should return at least 1 row if player has synced state

-- ============================================================
-- 2. Check active_queue column status for all players
-- ============================================================

SELECT 
  player_id,
  id as player_state_id,
  -- Check if active_queue exists and its type
  CASE 
    WHEN active_queue IS NULL THEN 'NULL'
    WHEN jsonb_typeof(active_queue) = 'null' THEN 'JSONB NULL'
    WHEN jsonb_typeof(active_queue) = 'array' THEN 'ARRAY'
    ELSE jsonb_typeof(active_queue)
  END as active_queue_status,
  -- Get queue length if it's an array
  CASE 
    WHEN active_queue IS NULL THEN 0
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)
    ELSE 0
  END as active_queue_length,
  -- Get first item ID (using array index instead of set-returning function)
  CASE 
    WHEN active_queue IS NULL THEN NULL
    WHEN jsonb_typeof(active_queue) = 'array' AND jsonb_array_length(active_queue) > 0 THEN 
      active_queue->0->>'id'
    ELSE NULL
  END as first_queue_item_id,
  -- Check priority_queue too
  CASE 
    WHEN priority_queue IS NULL THEN 'NULL'
    WHEN jsonb_typeof(priority_queue) = 'null' THEN 'JSONB NULL'
    WHEN jsonb_typeof(priority_queue) = 'array' THEN 'ARRAY'
    ELSE jsonb_typeof(priority_queue)
  END as priority_queue_status,
  CASE 
    WHEN priority_queue IS NULL THEN 0
    WHEN jsonb_typeof(priority_queue) = 'array' THEN jsonb_array_length(priority_queue)
    ELSE 0
  END as priority_queue_length,
  -- Check now_playing_video
  CASE 
    WHEN now_playing_video IS NULL THEN 'NULL'
    WHEN jsonb_typeof(now_playing_video) = 'null' THEN 'JSONB NULL'
    WHEN jsonb_typeof(now_playing_video) = 'object' THEN 'OBJECT'
    ELSE jsonb_typeof(now_playing_video)
  END as now_playing_status,
  now_playing_video->>'title' as now_playing_title,
  now_playing_video->>'id' as now_playing_id,
  -- Timestamps
  last_updated,
  updated_at,
  is_online,
  status
FROM player_state
ORDER BY last_updated DESC NULLS LAST, updated_at DESC NULLS LAST;

-- ============================================================
-- 3. Detailed inspection of active_queue for a specific player
-- ============================================================
-- Replace 'DEMO_PLAYER' with your actual player_id

-- First, show the full queue structure
SELECT 
  player_id,
  '=== ACTIVE QUEUE DETAILS ===' as section,
  active_queue,
  jsonb_pretty(active_queue) as active_queue_pretty,
  jsonb_array_length(COALESCE(active_queue, '[]'::jsonb)) as queue_length
FROM player_state
WHERE player_id = 'DEMO_PLAYER'  -- Change this to your player_id
  AND active_queue IS NOT NULL
  AND jsonb_typeof(active_queue) = 'array';

-- Then, show individual queue items (using LATERAL join)
SELECT 
  ps.player_id,
  '=== QUEUE ITEMS ===' as section,
  item.value->>'id' as item_id,
  item.value->>'title' as item_title,
  item.value->>'src' as item_src,
  item.ordinality as item_index
FROM player_state ps
CROSS JOIN LATERAL jsonb_array_elements(ps.active_queue) WITH ORDINALITY AS item
WHERE ps.player_id = 'DEMO_PLAYER'  -- Change this to your player_id
  AND ps.active_queue IS NOT NULL
  AND jsonb_typeof(ps.active_queue) = 'array'
ORDER BY item.ordinality
LIMIT 10;  -- Show first 10 items

-- ============================================================
-- 4. Check for players with NULL or missing active_queue
-- ============================================================

SELECT 
  player_id,
  id as player_state_id,
  CASE 
    WHEN active_queue IS NULL THEN '❌ NULL'
    WHEN jsonb_typeof(active_queue) = 'null' THEN '❌ JSONB NULL'
    WHEN jsonb_typeof(active_queue) = 'array' AND jsonb_array_length(active_queue) = 0 THEN '⚠️ EMPTY ARRAY'
    WHEN jsonb_typeof(active_queue) = 'array' THEN '✅ HAS DATA (' || jsonb_array_length(active_queue) || ' items)'
    ELSE '⚠️ UNEXPECTED TYPE: ' || jsonb_typeof(active_queue)
  END as active_queue_status,
  last_updated,
  updated_at
FROM player_state
WHERE active_queue IS NULL 
   OR jsonb_typeof(active_queue) = 'null'
   OR (jsonb_typeof(active_queue) = 'array' AND jsonb_array_length(active_queue) = 0)
ORDER BY last_updated DESC NULLS LAST;

-- ============================================================
-- 5. Summary Statistics
-- ============================================================

SELECT 
  'SUMMARY' as report_type,
  COUNT(*) as total_player_states,
  COUNT(CASE WHEN active_queue IS NOT NULL AND jsonb_typeof(active_queue) = 'array' THEN 1 END) as states_with_active_queue,
  COUNT(CASE WHEN active_queue IS NULL OR jsonb_typeof(active_queue) = 'null' THEN 1 END) as states_with_null_queue,
  COUNT(CASE WHEN jsonb_typeof(active_queue) = 'array' AND jsonb_array_length(active_queue) > 0 THEN 1 END) as states_with_non_empty_queue,
  AVG(CASE 
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)
    ELSE 0
  END) as avg_queue_length,
  MAX(CASE 
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)
    ELSE 0
  END) as max_queue_length
FROM player_state;

-- ============================================================
-- 6. Check recent updates to see if active_queue is being written
-- ============================================================

SELECT 
  player_id,
  last_updated,
  updated_at,
  CASE 
    WHEN active_queue IS NULL THEN 'NULL'
    WHEN jsonb_typeof(active_queue) = 'array' THEN jsonb_array_length(active_queue)::text || ' items'
    ELSE jsonb_typeof(active_queue)
  END as active_queue_at_update,
  now_playing_video->>'title' as now_playing,
  status
FROM player_state
ORDER BY COALESCE(updated_at, last_updated) DESC
LIMIT 10;

-- ============================================================
-- 7. Verify column exists and type
-- ============================================================

SELECT 
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'player_state'
  AND column_name IN ('active_queue', 'priority_queue', 'now_playing_video')
ORDER BY column_name;

-- Expected: 
-- - active_queue should be type: jsonb
-- - is_nullable: should be true (allows NULL)
-- - No default value (NULL is default)

-- ============================================================
-- 8. Check if Realtime is enabled (required for WEBADMIN to receive updates)
-- ============================================================

SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Realtime ENABLED'
    ELSE '❌ Realtime NOT ENABLED - Run: ALTER PUBLICATION supabase_realtime ADD TABLE player_state;'
  END as realtime_status,
  COUNT(*) as tables_in_publication
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'player_state';

-- ============================================================
-- Troubleshooting Guide
-- ============================================================

-- If active_queue is NULL or missing:
-- 1. Check if Electron Player has synced state (look at last_updated timestamp)
-- 2. Check Electron Player logs for sync errors
-- 3. Verify that syncState() is being called with activeQueue parameter
-- 4. Check SupabaseService.ts logs for "updateData before DB write" - should show hasActiveQueue: true

-- If active_queue exists but WEBADMIN shows undefined:
-- 1. Check Realtime subscription status (should be SUBSCRIBED)
-- 2. Check browser console for "[SupabaseClient] Received Realtime update"
-- 3. Verify that payload.new.active_queue is present in Realtime callback
-- 4. Check if RLS policies allow reads (if RLS is enabled)

-- If Realtime is not working:
-- 1. Run: ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
-- 2. Check Supabase Dashboard > Settings > API > Realtime is enabled
-- 3. Check network/firewall allows WebSocket connections
-- 4. WEBADMIN will fall back to polling every 2 seconds (slower but works)
