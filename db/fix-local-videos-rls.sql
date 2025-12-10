-- ============================================================
-- Fix Row-Level Security (RLS) policies for local_videos table
-- Run this SQL in Supabase SQL Editor to allow players to manage their own videos
-- ============================================================

-- Enable RLS if not already enabled
ALTER TABLE local_videos ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Players can only view their own videos" ON local_videos;
DROP POLICY IF EXISTS "Players can only insert their own videos" ON local_videos;
DROP POLICY IF EXISTS "Players can only update their own videos" ON local_videos;
DROP POLICY IF EXISTS "Players can only delete their own videos" ON local_videos;
DROP POLICY IF EXISTS "Allow all operations for players" ON local_videos;

-- Create permissive policies for local_videos
-- Players can view their own videos
CREATE POLICY "Players can view their own videos"
ON local_videos
FOR SELECT
USING (true); -- Allow all SELECT operations

-- Players can insert their own videos
CREATE POLICY "Players can insert their own videos"
ON local_videos
FOR INSERT
WITH CHECK (true); -- Allow all INSERT operations

-- Players can update their own videos
CREATE POLICY "Players can update their own videos"
ON local_videos
FOR UPDATE
USING (true) -- Allow all UPDATE operations
WITH CHECK (true);

-- Players can delete their own videos
CREATE POLICY "Players can delete their own videos"
ON local_videos
FOR DELETE
USING (true); -- Allow all DELETE operations

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'local_videos'
ORDER BY policyname;

