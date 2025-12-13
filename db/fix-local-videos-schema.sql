-- ============================================================
-- Fix local_videos table schema - Add file_path column
-- Run this SQL in Supabase SQL Editor if file_path column is missing
-- ============================================================

-- Add file_path column if it doesn't exist
ALTER TABLE local_videos 
  ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Add filename column if it doesn't exist
ALTER TABLE local_videos 
  ADD COLUMN IF NOT EXISTS filename TEXT;

-- Migrate data from 'path' to 'file_path' if path column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'path'
  ) THEN
    UPDATE local_videos 
    SET file_path = path 
    WHERE file_path IS NULL AND path IS NOT NULL;
    
    RAISE NOTICE 'Migrated data from path to file_path';
  END IF;
END $$;

-- Ensure unique constraint exists on (player_id, file_path)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_file_per_player'
  ) THEN
    ALTER TABLE local_videos 
    ADD CONSTRAINT unique_file_per_player 
    UNIQUE (player_id, file_path);
    
    RAISE NOTICE 'Created unique constraint unique_file_per_player';
  ELSE
    RAISE NOTICE 'Unique constraint unique_file_per_player already exists';
  END IF;
END $$;

-- Make file_path NOT NULL if it's currently nullable
DO $$
DECLARE
  path_column_exists BOOLEAN;
BEGIN
  -- Check if 'path' column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'path'
  ) INTO path_column_exists;
  
  -- First, ensure no NULL values exist
  IF path_column_exists THEN
    UPDATE local_videos 
    SET file_path = COALESCE(
      file_path, 
      path, 
      'unknown_' || id::text
    )
    WHERE file_path IS NULL;
  ELSE
    UPDATE local_videos 
    SET file_path = COALESCE(
      file_path, 
      'unknown_' || id::text
    )
    WHERE file_path IS NULL;
  END IF;
  
  -- Then make it NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'file_path' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE local_videos 
    ALTER COLUMN file_path SET NOT NULL;
    
    RAISE NOTICE 'Set file_path to NOT NULL';
  END IF;
END $$;

-- Populate filename from file_path if filename is NULL
DO $$
DECLARE
  path_column_exists BOOLEAN;
BEGIN
  -- Check if 'path' column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'path'
  ) INTO path_column_exists;
  
  IF path_column_exists THEN
    UPDATE local_videos 
    SET filename = COALESCE(
      filename,
      SPLIT_PART(file_path, '/', -1),
      SPLIT_PART(path, '/', -1),
      'unknown'
    )
    WHERE filename IS NULL;
  ELSE
    UPDATE local_videos 
    SET filename = COALESCE(
      filename,
      SPLIT_PART(file_path, '/', -1),
      'unknown'
    )
    WHERE filename IS NULL;
  END IF;
END $$;

-- Make filename NOT NULL if it's currently nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'filename' 
    AND is_nullable = 'YES'
  ) THEN
    -- Ensure no NULL values
    UPDATE local_videos 
    SET filename = COALESCE(filename, 'unknown_' || id::text)
    WHERE filename IS NULL;
    
    ALTER TABLE local_videos 
    ALTER COLUMN filename SET NOT NULL;
    
    RAISE NOTICE 'Set filename to NOT NULL';
  END IF;
END $$;

-- Verify the fix
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'local_videos'
AND column_name IN ('file_path', 'path', 'filename')
ORDER BY column_name;

-- Check constraint exists
SELECT 
  conname as constraint_name,
  contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'local_videos'::regclass
AND conname = 'unique_file_per_player';

