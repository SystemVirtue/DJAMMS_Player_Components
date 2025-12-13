-- ============================================================
-- Add filename column to local_videos table
-- Run this SQL in Supabase SQL Editor to fix the missing filename column
-- ============================================================

-- Add filename column if it doesn't exist
ALTER TABLE local_videos 
  ADD COLUMN IF NOT EXISTS filename TEXT;

-- Populate filename from file_path if filename is NULL
UPDATE local_videos 
SET filename = COALESCE(
  filename,
  SPLIT_PART(file_path, '/', -1),
  SPLIT_PART(COALESCE(path, ''), '/', -1),
  'unknown'
)
WHERE filename IS NULL;

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
    -- Ensure no NULL values exist
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
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'local_videos'
AND column_name = 'filename';

