-- ============================================================
-- DJAMMS Supabase Setup - Enable Realtime for Commands
-- Run this SQL in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Ensure player_id column exists in admin_commands
-- This is REQUIRED for filtering commands by player
ALTER TABLE admin_commands 
  ADD COLUMN IF NOT EXISTS player_id TEXT DEFAULT 'electron-player-1';

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_commands_player_pending 
  ON admin_commands(player_id, status) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_admin_commands_player_id 
  ON admin_commands(player_id);

-- 3. Enable Realtime for tables (skip if already enabled)
-- Using DO block to handle "already member" error gracefully
DO $$
BEGIN
  -- admin_commands
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_commands;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'admin_commands already in supabase_realtime publication';
  END;
  
  -- player_state
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'player_state already in supabase_realtime publication';
  END;
  
  -- local_videos
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE local_videos;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'local_videos already in supabase_realtime publication';
  END;
END $$;

-- ============================================================
-- Verification Queries - Run these to check the setup
-- ============================================================

-- Check admin_commands table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'admin_commands'
ORDER BY ordinal_position;

-- Check which tables have Realtime enabled
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Check for any pending commands (should be empty after Electron processes them)
SELECT id, player_id, command_type, status, issued_at, executed_at 
FROM admin_commands 
WHERE status = 'pending'
ORDER BY issued_at DESC
LIMIT 10;

-- ============================================================
-- Cleanup (Optional) - Remove old/stale commands
-- ============================================================

-- Delete commands older than 24 hours
-- DELETE FROM admin_commands WHERE created_at < NOW() - INTERVAL '24 hours';

-- Delete all executed commands older than 1 hour
-- DELETE FROM admin_commands WHERE status IN ('executed', 'failed') AND created_at < NOW() - INTERVAL '1 hour';
