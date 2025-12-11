-- ============================================================
-- Identify Missing Columns in player_state
-- Run this to see exactly which columns are missing
-- ============================================================

-- Check each required column individually
SELECT 
    'player_id' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'player_id') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'active_queue' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'active_queue') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'priority_queue' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'priority_queue') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'queue_index' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'queue_index') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'updated_at' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'updated_at') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'now_playing_video' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'now_playing_video') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'current_position' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'current_position') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'volume' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'volume') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'status' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'status') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'is_online' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'is_online') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
UNION ALL
SELECT 
    'last_heartbeat' as column_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'last_heartbeat') THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
ORDER BY status DESC, column_name;

-- Also show all existing columns in player_state for reference
SELECT 
    '--- ALL COLUMNS IN player_state ---' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'player_state' AND table_schema = 'public'
ORDER BY ordinal_position;

