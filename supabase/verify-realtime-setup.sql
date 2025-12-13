-- ============================================================
-- Complete Realtime Setup Verification for player_state
-- Run this to verify everything is configured correctly
-- ============================================================

-- 1. Check if player_state is in Realtime publication
SELECT 
  'Realtime Publication' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'player_state'
    ) THEN '✅ ENABLED'
    ELSE '❌ NOT ENABLED - Run: ALTER PUBLICATION supabase_realtime ADD TABLE player_state;'
  END as status;

-- 2. Check if RLS is enabled on player_state
SELECT 
  'RLS Status' as check_type,
  CASE 
    WHEN relrowsecurity THEN '✅ ENABLED'
    ELSE '⚠️ DISABLED (RLS not enabled - policies won''t apply)'
  END as status
FROM pg_class 
WHERE relname = 'player_state';

-- 3. List all RLS policies on player_state
SELECT 
  'RLS Policies' as check_type,
  policyname,
  permissive,
  roles,
  cmd as command,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has filter'
    ELSE 'No filter (allows all)'
  END as filter_status
FROM pg_policies 
WHERE tablename = 'player_state'
ORDER BY policyname;

-- 4. Check if public role can SELECT (required for Realtime)
SELECT 
  'Public Access' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'player_state' 
      AND roles = '{public}' 
      AND (cmd = 'SELECT' OR cmd = 'ALL')
    ) THEN '✅ Public role can SELECT (good for Realtime)'
    ELSE '❌ Public role cannot SELECT - Realtime may not work'
  END as status;

-- 5. Verify table structure (check for required columns)
SELECT 
  'Table Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'player_state'
  AND column_name IN ('player_id', 'active_queue', 'priority_queue', 'now_playing_video', 'last_updated')
ORDER BY column_name;

-- 6. Check for indexes (performance)
SELECT 
  'Indexes' as check_type,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'player_state'
ORDER BY indexname;

-- ============================================================
-- Summary Query - All checks in one view
-- ============================================================

SELECT 
  '=== REALTIME SETUP SUMMARY ===' as summary;

-- Realtime Publication Status
SELECT 
  '1. Realtime Publication' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'player_state'
    ) THEN '✅ ENABLED'
    ELSE '❌ NOT ENABLED'
  END as status;

-- RLS Status
SELECT 
  '2. RLS Enabled' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'player_state' 
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
    ) THEN '✅ ENABLED'
    ELSE '⚠️ DISABLED'
  END as status;

-- Public Access
SELECT 
  '3. Public Role Access' as check_item,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'player_state' 
      AND roles = '{public}' 
      AND (cmd = 'SELECT' OR cmd = 'ALL')
    ) THEN '✅ Public can SELECT'
    ELSE '❌ Public cannot SELECT'
  END as status;

-- Required Columns
SELECT 
  '4. Required Columns' as check_item,
  CASE 
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'player_state'
      AND column_name IN ('player_id', 'active_queue', 'priority_queue', 'now_playing_video', 'last_updated')
    ) = 5 THEN '✅ All required columns exist'
    ELSE '⚠️ Some columns missing'
  END as status;

-- ============================================================
-- Quick Fix Commands (if needed)
-- ============================================================

-- If Realtime is NOT enabled, run:
-- ALTER PUBLICATION supabase_realtime ADD TABLE player_state;

-- If RLS is enabled but public can't SELECT, check policies:
-- The policy "player_state_full_access" should allow public role ALL operations
-- If missing, you may need to create it (but it looks like it exists based on your results)

-- ============================================================
-- Test Query - Verify you can read player_state
-- ============================================================

-- This should work if policies are correct
SELECT 
  player_id,
  status,
  jsonb_array_length(COALESCE(active_queue, '[]'::jsonb)) as active_queue_length,
  jsonb_array_length(COALESCE(priority_queue, '[]'::jsonb)) as priority_queue_length,
  now_playing_video->>'title' as now_playing_title,
  last_updated,
  is_online
FROM player_state
ORDER BY last_updated DESC
LIMIT 5;

-- If this query works, Realtime subscriptions should work too!
