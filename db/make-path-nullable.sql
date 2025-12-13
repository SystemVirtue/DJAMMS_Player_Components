-- ============================================================
-- Make path column nullable in local_videos table
-- The table now uses file_path as the primary column
-- Run this SQL in Supabase Dashboard
-- ============================================================

-- Make path column nullable (if it exists and is NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'path'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE local_videos 
    ALTER COLUMN path DROP NOT NULL;
    
    RAISE NOTICE 'Made path column nullable';
  ELSE
    RAISE NOTICE 'path column does not exist or is already nullable';
  END IF;
END $$;

-- Verify
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'local_videos'
AND column_name = 'path';

