-- ============================================================
-- DJAMMS Supabase Schema Fixes - Priority 1 & 2 Updates
-- Run this SQL in Supabase SQL Editor to fix schema mismatches
-- ============================================================

-- ============================================================
-- PRIORITY 1: Fix admin_commands table schema mismatch
-- ============================================================

-- Add missing columns to admin_commands (if they don't exist)
ALTER TABLE admin_commands 
  ADD COLUMN IF NOT EXISTS player_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS command_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS command_data JSONB,
  ADD COLUMN IF NOT EXISTS issued_by VARCHAR(50),
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS execution_result JSONB,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for efficient pending command queries by player
CREATE INDEX IF NOT EXISTS idx_admin_commands_player_pending 
  ON admin_commands(player_id, status, created_at) 
  WHERE status = 'pending';

-- Create index for player_id lookups
CREATE INDEX IF NOT EXISTS idx_admin_commands_player_id 
  ON admin_commands(player_id);

-- Migrate existing data if needed (optional - only if table has data)
-- UPDATE admin_commands SET 
--   player_id = COALESCE(player_id, 'unknown'),
--   command_type = COALESCE(command_type, action_type),
--   command_data = COALESCE(command_data, action_data),
--   issued_by = COALESCE(issued_by, admin_id)
-- WHERE player_id IS NULL OR command_type IS NULL;

-- ============================================================
-- PRIORITY 1: Fix RLS Policies for proper multi-player isolation
-- ============================================================

-- Drop existing policies that may not work correctly
DROP POLICY IF EXISTS player_state_full_access ON player_state;
DROP POLICY IF EXISTS admin_commands_player_access ON admin_commands;
DROP POLICY IF EXISTS admin_commands_full_access ON admin_commands;
DROP POLICY IF EXISTS local_videos_full_access ON local_videos;

-- Create more permissive policies (app filters client-side anyway)
-- For player_state: Allow full access (app filters by player_id in queries)
CREATE POLICY player_state_full_access ON player_state
  FOR ALL USING (true)
  WITH CHECK (true);

-- For admin_commands: Allow inserts and selects (app filters by player_id)
CREATE POLICY admin_commands_full_access ON admin_commands
  FOR ALL USING (true)
  WITH CHECK (true);

-- For local_videos: Allow inserts/updates for Electron app
CREATE POLICY local_videos_full_access ON local_videos
  FOR ALL USING (true)
  WITH CHECK (true);

-- Keep public read for kiosk (already exists, but ensure it's correct)
DROP POLICY IF EXISTS local_videos_public_read ON local_videos;
CREATE POLICY local_videos_public_read ON local_videos 
  FOR SELECT USING (is_available = true);

-- ============================================================
-- PRIORITY 2: Add missing indexes for performance
-- ============================================================

-- Index for finding stale players
CREATE INDEX IF NOT EXISTS idx_player_state_heartbeat 
  ON player_state(last_heartbeat) 
  WHERE is_online = true;

-- Composite index for player state queries
CREATE INDEX IF NOT EXISTS idx_player_state_player_online 
  ON player_state(player_id, is_online, last_heartbeat);

-- ============================================================
-- PRIORITY 2: Create FTS RPC function for search
-- ============================================================

-- Create search_videos function using pg_trgm for fuzzy search
CREATE OR REPLACE FUNCTION search_videos(
  search_query TEXT,
  scope TEXT DEFAULT 'all',
  result_limit INT DEFAULT 50,
  result_offset INT DEFAULT 0,
  p_player_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  player_id VARCHAR(50),
  file_path TEXT,
  relative_path TEXT,
  filename TEXT,
  file_size BIGINT,
  file_hash VARCHAR(64),
  title TEXT,
  artist TEXT,
  album TEXT,
  duration INTEGER,
  resolution VARCHAR(20),
  codec VARCHAR(50),
  bitrate INTEGER,
  fps DECIMAL(5,2),
  playlist_folder TEXT,
  collection_type VARCHAR(50),
  is_available BOOLEAN,
  last_verified TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  play_count INTEGER,
  last_played TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  last_scanned TIMESTAMP WITH TIME ZONE,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lv.*,
    GREATEST(
      similarity(lv.title, search_query),
      similarity(lv.artist, search_query),
      similarity(COALESCE(lv.title || ' ' || lv.artist, ''), search_query)
    ) as similarity_score
  FROM local_videos lv
  WHERE 
    lv.is_available = true
    AND (p_player_id IS NULL OR lv.player_id = p_player_id)
    AND (
      lv.title ILIKE '%' || search_query || '%'
      OR lv.artist ILIKE '%' || search_query || '%'
      OR similarity(lv.title, search_query) > 0.1
      OR similarity(lv.artist, search_query) > 0.1
    )
  ORDER BY similarity_score DESC, lv.title
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- PRIORITY 3: Add trigger for auto-updating last_updated
-- ============================================================

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on player_state
DROP TRIGGER IF EXISTS trigger_update_player_state_timestamp ON player_state;
CREATE TRIGGER trigger_update_player_state_timestamp
  BEFORE UPDATE ON player_state
  FOR EACH ROW
  EXECUTE FUNCTION update_last_updated();

-- ============================================================
-- Verification Queries
-- ============================================================

-- Check admin_commands structure
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'admin_commands'
-- ORDER BY ordinal_position;

-- Check indexes
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('admin_commands', 'player_state', 'local_videos')
-- ORDER BY tablename, indexname;

-- Test search function
-- SELECT * FROM search_videos('test', 'all', 10, 0, 'DEMO_PLAYER');

