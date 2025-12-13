-- ============================================================
-- Create RPC function to automatically fix local_videos schema
-- Run this FIRST, then the app can auto-fix schema issues
-- ============================================================

CREATE OR REPLACE FUNCTION fix_local_videos_schema()
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{"fixed": false, "changes": []}'::jsonb;
  changes text[] := ARRAY[]::text[];
BEGIN
  -- Add file_path column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'file_path'
  ) THEN
    ALTER TABLE local_videos ADD COLUMN file_path TEXT;
    changes := array_append(changes, 'Added file_path column');
    
    -- Migrate data from 'path' to 'file_path' if path column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'local_videos' 
      AND column_name = 'path'
    ) THEN
      UPDATE local_videos 
      SET file_path = path 
      WHERE file_path IS NULL AND path IS NOT NULL;
      changes := array_append(changes, 'Migrated data from path to file_path');
    END IF;
  END IF;
  
  -- Add filename column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'filename'
  ) THEN
    ALTER TABLE local_videos ADD COLUMN filename TEXT;
    changes := array_append(changes, 'Added filename column');
    
    -- Populate filename from file_path or path
    UPDATE local_videos 
    SET filename = COALESCE(
      filename,
      SPLIT_PART(COALESCE(file_path, path), '/', -1),
      'unknown'
    )
    WHERE filename IS NULL;
    changes := array_append(changes, 'Populated filename from file_path');
  END IF;
  
  -- Make filename NOT NULL if it's currently nullable
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
    changes := array_append(changes, 'Set filename to NOT NULL');
  END IF;
  
  -- Ensure unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_file_per_player'
  ) THEN
    -- First, ensure no duplicate (player_id, file_path) pairs exist
    DELETE FROM local_videos a
    USING local_videos b
    WHERE a.id > b.id
    AND a.player_id = b.player_id
    AND COALESCE(a.file_path, '') = COALESCE(b.file_path, '');
    
    ALTER TABLE local_videos 
    ADD CONSTRAINT unique_file_per_player 
    UNIQUE (player_id, file_path);
    changes := array_append(changes, 'Created unique constraint unique_file_per_player');
  END IF;
  
  -- Make file_path NOT NULL if it's currently nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'local_videos' 
    AND column_name = 'file_path' 
    AND is_nullable = 'YES'
  ) THEN
    -- First, set any NULL values
    UPDATE local_videos 
    SET file_path = COALESCE(
      file_path, 
      path, 
      'unknown_' || id::text
    )
    WHERE file_path IS NULL;
    
    ALTER TABLE local_videos 
    ALTER COLUMN file_path SET NOT NULL;
    changes := array_append(changes, 'Set file_path to NOT NULL');
  END IF;
  
  -- Return result
  result := jsonb_build_object(
    'fixed', true,
    'changes', changes
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'fixed', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon role (for client calls)
GRANT EXECUTE ON FUNCTION fix_local_videos_schema() TO anon;

-- Verify function was created
SELECT 
  routine_name, 
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'fix_local_videos_schema';

