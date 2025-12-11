-- Migration: Add updated_at column with auto-update trigger and index for conflict resolution
-- This enables efficient conflict resolution based on last write wins strategy

-- 1. Ensure updated_at column exists with automatic timestamp updates
-- If column doesn't exist, add it. If it exists, ensure it has DEFAULT now()
DO $$
BEGIN
  -- Check if updated_at column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_state' AND column_name = 'updated_at'
  ) THEN
    -- Add column with default
    ALTER TABLE player_state 
    ADD COLUMN updated_at timestamp with time zone DEFAULT now();
    
    RAISE NOTICE 'Added updated_at column to player_state';
  ELSE
    -- Column exists, ensure it has default
    ALTER TABLE player_state 
    ALTER COLUMN updated_at SET DEFAULT now();
    
    RAISE NOTICE 'updated_at column already exists, ensured DEFAULT now()';
  END IF;
END $$;

-- 2. Create or replace trigger function to auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger to auto-update updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_player_state_updated_at ON player_state;
CREATE TRIGGER update_player_state_updated_at
  BEFORE UPDATE ON player_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Add index on player_id and updated_at for efficient conflict resolution queries
-- This index helps when querying for latest state by player_id and updated_at
CREATE INDEX IF NOT EXISTS idx_player_state_player_updated 
  ON player_state(player_id, updated_at DESC);

-- 5. Update existing rows to have updated_at = last_updated (if last_updated exists)
-- This ensures existing data has proper timestamps
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_state' AND column_name = 'last_updated'
  ) THEN
    UPDATE player_state 
    SET updated_at = COALESCE(
      (last_updated::timestamp with time zone),
      now()
    )
    WHERE updated_at IS NULL;
    
    RAISE NOTICE 'Updated existing rows with updated_at from last_updated';
  ELSE
    -- No last_updated column, just set to now() for existing rows
    UPDATE player_state 
    SET updated_at = now()
    WHERE updated_at IS NULL;
    
    RAISE NOTICE 'Set updated_at to now() for existing rows';
  END IF;
END $$;

