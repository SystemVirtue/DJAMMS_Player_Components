-- ============================================================
-- DJAMMS Supabase Schema Verification Script
-- Run this in Supabase SQL Editor to verify all required schema elements
-- ============================================================

-- 1. Check player_state table structure
SELECT 
    'player_state' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'player_state' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check local_videos table structure
SELECT 
    'local_videos' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'local_videos' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check admin_commands table structure
SELECT 
    'admin_commands' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'admin_commands' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check players table structure (if exists)
SELECT 
    'players' as table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'players' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Check indexes on player_state
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'player_state' AND schemaname = 'public'
ORDER BY indexname;

-- 6. Check indexes on local_videos
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'local_videos' AND schemaname = 'public'
ORDER BY indexname;

-- 7. Check indexes on admin_commands
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'admin_commands' AND schemaname = 'public'
ORDER BY indexname;

-- 8. Check for required functions
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name IN (
        'update_updated_at_column',
        'update_player_heartbeat',
        'search_videos',
        'browse_videos',
        'count_videos',
        'fix_local_videos_schema'
    )
ORDER BY routine_name;

-- 9. Check triggers on player_state
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'player_state' AND event_object_schema = 'public'
ORDER BY trigger_name;

-- 10. Check Realtime publication status
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 11. Verify required columns exist in player_state
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'player_id') THEN '✓ player_id'
        ELSE '✗ MISSING: player_id'
    END as player_id_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'active_queue') THEN '✓ active_queue'
        ELSE '✗ MISSING: active_queue'
    END as active_queue_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'priority_queue') THEN '✓ priority_queue'
        ELSE '✗ MISSING: priority_queue'
    END as priority_queue_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'now_playing_video') THEN '✓ now_playing_video'
        ELSE '✗ MISSING: now_playing_video'
    END as now_playing_video_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'queue_index') THEN '✓ queue_index'
        ELSE '✗ MISSING: queue_index'
    END as queue_index_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'updated_at') THEN '✓ updated_at'
        ELSE '✗ MISSING: updated_at'
    END as updated_at_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'current_position') THEN '✓ current_position'
        ELSE '✗ MISSING: current_position'
    END as current_position_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'volume') THEN '✓ volume'
        ELSE '✗ MISSING: volume'
    END as volume_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'status') THEN '✓ status'
        ELSE '✗ MISSING: status'
    END as status_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'is_online') THEN '✓ is_online'
        ELSE '✗ MISSING: is_online'
    END as is_online_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_state' AND column_name = 'last_heartbeat') THEN '✓ last_heartbeat'
        ELSE '✗ MISSING: last_heartbeat'
    END as last_heartbeat_check;

-- 12. Verify required columns exist in local_videos
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'player_id') THEN '✓ player_id'
        ELSE '✗ MISSING: player_id'
    END as player_id_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'title') THEN '✓ title'
        ELSE '✗ MISSING: title'
    END as title_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'artist') THEN '✓ artist'
        ELSE '✗ MISSING: artist'
    END as artist_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'file_path') THEN '✓ file_path'
        ELSE '✗ MISSING: file_path'
    END as file_path_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'metadata') THEN '✓ metadata'
        ELSE '✗ MISSING: metadata'
    END as metadata_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'local_videos' AND column_name = 'is_available') THEN '✓ is_available'
        ELSE '✗ MISSING: is_available'
    END as is_available_check;

-- 13. Verify required columns exist in admin_commands
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_commands' AND column_name = 'player_id') THEN '✓ player_id'
        ELSE '✗ MISSING: player_id'
    END as player_id_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_commands' AND column_name = 'admin_id') THEN '✓ admin_id'
        ELSE '✗ MISSING: admin_id'
    END as admin_id_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_commands' AND column_name = 'action_type') THEN '✓ action_type'
        ELSE '✗ MISSING: action_type'
    END as action_type_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_commands' AND column_name = 'action_data') THEN '✓ action_data'
        ELSE '✗ MISSING: action_data'
    END as action_data_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_commands' AND column_name = 'status') THEN '✓ status'
        ELSE '✗ MISSING: status'
    END as status_check;

-- 14. Verify critical indexes exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'player_state' 
            AND indexname = 'idx_player_state_player_updated'
        ) THEN '✓ idx_player_state_player_updated'
        ELSE '✗ MISSING: idx_player_state_player_updated'
    END as player_state_index_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'admin_commands' 
            AND indexname = 'idx_admin_commands_player_pending'
        ) THEN '✓ idx_admin_commands_player_pending'
        ELSE '✗ MISSING: idx_admin_commands_player_pending'
    END as admin_commands_pending_index_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = 'admin_commands' 
            AND indexname = 'idx_admin_commands_player_id'
        ) THEN '✓ idx_admin_commands_player_id'
        ELSE '✗ MISSING: idx_admin_commands_player_id'
    END as admin_commands_player_id_index_check;

-- 15. Verify trigger exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE event_object_table = 'player_state' 
            AND trigger_name = 'update_player_state_updated_at'
        ) THEN '✓ update_player_state_updated_at trigger'
        ELSE '✗ MISSING: update_player_state_updated_at trigger'
    END as trigger_check;

-- 16. Summary: Count missing elements
SELECT 
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = 'player_state' 
     AND column_name IN ('player_id', 'active_queue', 'priority_queue', 'queue_index', 'updated_at', 'now_playing_video', 'current_position', 'volume', 'status', 'is_online', 'last_heartbeat')
    ) as player_state_required_columns_found,
    11 as player_state_required_columns_total,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = 'local_videos' 
     AND column_name IN ('player_id', 'title', 'artist', 'file_path', 'metadata', 'is_available')
    ) as local_videos_required_columns_found,
    6 as local_videos_required_columns_total,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = 'admin_commands' 
     AND column_name IN ('player_id', 'admin_id', 'action_type', 'action_data', 'status')
    ) as admin_commands_required_columns_found,
    5 as admin_commands_required_columns_total;

