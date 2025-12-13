# Apply Schema Fix for local_videos table

## Problem
The `local_videos` table is missing required columns (`file_path` and/or `filename`), causing PGRST204 errors when trying to index videos.

## Solution

### Step 1: Create RPC Function (One-time setup)
Run this SQL in Supabase Dashboard to enable automatic schema fixes:

**File:** `db/create-schema-fix-rpc.sql`

This creates a function that the app can call to automatically fix schema issues.

### Step 2: Fix Current Schema
Run this SQL in Supabase Dashboard to fix the schema immediately:

**File:** `db/fix-local-videos-schema.sql`

This will:
- Add `file_path` column if missing
- Add `filename` column if missing
- Migrate data from `path` to `file_path` if needed
- Populate `filename` from `file_path` if needed
- Create unique constraint `unique_file_per_player` on `(player_id, file_path)`
- Set `file_path` and `filename` to NOT NULL

### Step 3: Verify
After running the SQL, verify with:

```sql
-- Check required columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'local_videos'
AND column_name IN ('file_path', 'filename')
ORDER BY column_name;

-- Check unique constraint exists
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'local_videos'::regclass
AND conname = 'unique_file_per_player';
```

## Quick Fix (All-in-one)
If you want to do both steps at once, run both SQL files in order:
1. `db/create-schema-fix-rpc.sql` (creates RPC function - **UPDATE THIS FIRST** to include filename fix)
2. `db/fix-local-videos-schema.sql` (fixes current schema - **UPDATED** to include filename)

**OR** if you just need to add the filename column quickly:
- `db/add-filename-column.sql` (adds only the filename column)

## After Fix
Once the schema is fixed:
- The app will automatically detect and fix schema issues in the future (if RPC function exists)
- Video indexing will work correctly
- No more PGRST204 errors

