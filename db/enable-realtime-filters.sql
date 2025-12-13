-- ============================================================
-- Enable Realtime Filters for player_id Column
-- This ensures tables are in the Realtime publication
-- ============================================================

-- Ensure all tables are in the supabase_realtime publication
DO $$
BEGIN
  -- player_state
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'player_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
    RAISE NOTICE 'Added player_state to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'player_state already in supabase_realtime publication';
  END IF;

  -- local_videos
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'local_videos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE local_videos;
    RAISE NOTICE 'Added local_videos to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'local_videos already in supabase_realtime publication';
  END IF;

  -- admin_commands
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'admin_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_commands;
    RAISE NOTICE 'Added admin_commands to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'admin_commands already in supabase_realtime publication';
  END IF;
END $$;

-- Verify tables are in the publication
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('player_state', 'local_videos', 'admin_commands') THEN '✅ Enabled'
    ELSE '❌ Not enabled'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN ('player_state', 'local_videos', 'admin_commands')
ORDER BY tablename;

-- ============================================================
-- Note: Realtime filters work via the filter parameter in code
-- The code already uses: filter: 'player_id=eq.${playerId}'
-- This SQL ensures tables are in the publication
-- ============================================================

