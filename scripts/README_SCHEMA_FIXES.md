# Running Schema Fixes on Supabase

## Status: ⚠️ Manual Action Required

The Supabase CLI migration system has migration history conflicts, so the SQL needs to be run manually in the Supabase Dashboard.

## Quick Steps

### 1. Run Schema Fixes SQL

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/sql/new
2. Copy the contents of `db/schema-fixes.sql`
3. Paste into the SQL Editor
4. Click "Run" or press Cmd/Ctrl+Enter
5. Verify all statements executed successfully

### 2. Enable Realtime Filters

1. Go to: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/realtime/tables
2. For each table (`player_state`, `local_videos`, `admin_commands`):
   - Click on the table
   - Go to "Realtime" tab
   - Enable filter for `player_id` column
   - Save changes

### Alternative: Use Supabase CLI with psql

If you have the database connection string:

```bash
# Get connection string from Supabase Dashboard → Settings → Database → Connection string
# Then run:
psql "postgresql://postgres:[PASSWORD]@db.lfvhgdbnecjeuciadimx.supabase.co:5432/postgres" -f db/schema-fixes.sql
```

## What Gets Applied

✅ **Priority 1: Critical Fixes**
- Adds missing columns to `admin_commands` table
- Fixes RLS policies for multi-player isolation
- Creates indexes for performance

✅ **Priority 2: Performance**
- Creates FTS search function `search_videos()`
- Adds performance indexes

✅ **Priority 3: Features**
- Adds trigger for auto-updating `last_updated` timestamp

## Verification

After running, verify with these queries in SQL Editor:

```sql
-- Check admin_commands has new columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'admin_commands' 
AND column_name IN ('player_id', 'command_type', 'command_data');

-- Test search function
SELECT * FROM search_videos('test', 'all', 10, 0, 'DEMO_PLAYER');

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('admin_commands', 'player_state', 'local_videos');
```

