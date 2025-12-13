-- ============================================================
-- Fix admin_commands table schema to match code expectations
-- Run this SQL in Supabase SQL Editor to fix console errors
-- ============================================================

-- Step 1: Add missing columns to admin_commands (if they don't exist)
-- Do this one at a time to avoid issues
DO $$
BEGIN
  -- Add player_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'player_id'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN player_id VARCHAR(50);
  END IF;

  -- Add command_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'command_type'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN command_type VARCHAR(50);
  END IF;

  -- Add command_data column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'command_data'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN command_data JSONB;
  END IF;

  -- Add issued_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'issued_by'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN issued_by VARCHAR(50);
  END IF;

  -- Add executed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'executed_at'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN executed_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add execution_result column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'execution_result'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN execution_result JSONB;
  END IF;

  -- Add issued_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'issued_at'
  ) THEN
    ALTER TABLE admin_commands ADD COLUMN issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- Step 2: Create indexes only if player_id column exists
DO $$
BEGIN
  -- Check if player_id column exists before creating index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_commands' AND column_name = 'player_id'
  ) THEN
    -- Create index for efficient pending command queries by player
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'admin_commands' AND indexname = 'idx_admin_commands_player_pending'
    ) THEN
      CREATE INDEX idx_admin_commands_player_pending 
        ON admin_commands(player_id, status, created_at) 
        WHERE status = 'pending';
    END IF;

    -- Create index for player_id lookups
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'admin_commands' AND indexname = 'idx_admin_commands_player_id'
    ) THEN
      CREATE INDEX idx_admin_commands_player_id 
        ON admin_commands(player_id);
    END IF;
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE admin_commands ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "admin_commands_player_access" ON admin_commands;
DROP POLICY IF EXISTS "admin_commands_player_insert" ON admin_commands;
DROP POLICY IF EXISTS "admin_commands_player_update" ON admin_commands;
DROP POLICY IF EXISTS "admin_commands_full_access" ON admin_commands;

-- Create permissive policies for admin_commands
CREATE POLICY "admin_commands_player_access" ON admin_commands
  FOR SELECT USING (true);

CREATE POLICY "admin_commands_player_insert" ON admin_commands
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_commands_player_update" ON admin_commands
  FOR UPDATE USING (true) WITH CHECK (true);

