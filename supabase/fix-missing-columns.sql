-- ============================================================
-- Fix Missing Columns in player_state
-- Run this AFTER identifying which columns are missing
-- ============================================================

-- Add queue_index if missing (from migration 20241204)
ALTER TABLE player_state 
ADD COLUMN IF NOT EXISTS queue_index integer DEFAULT 0;

-- Add updated_at if missing (from migration 20241205)
-- This migration should have been applied, but if not, add it here
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_state' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE player_state 
    ADD COLUMN updated_at timestamp with time zone DEFAULT now();
    
    RAISE NOTICE 'Added updated_at column to player_state';
  ELSE
    RAISE NOTICE 'updated_at column already exists';
  END IF;
END $$;

-- Verify the trigger exists (from migration 20241205)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_player_state_updated_at ON player_state;
CREATE TRIGGER update_player_state_updated_at
  BEFORE UPDATE ON player_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verify the index exists (from migration 20241205)
CREATE INDEX IF NOT EXISTS idx_player_state_player_updated 
  ON player_state(player_id, updated_at DESC);

-- Update existing rows to have updated_at = now() if it was just added
UPDATE player_state 
SET updated_at = now()
WHERE updated_at IS NULL;

