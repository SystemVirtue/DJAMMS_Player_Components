# Apply Supabase Schema Fixes - Quick Guide

## ⚠️ Status: Manual Action Required

The Supabase CLI migration system has conflicts, and the REST API doesn't support DDL statements directly. **You need to run the SQL manually in the Supabase Dashboard.**

## ✅ Quick Solution (2 minutes)

### Step 1: Run SQL in Dashboard

1. **Open SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/sql/new
   - Or: Dashboard → SQL Editor → New Query

2. **Copy SQL:**
   ```bash
   cat db/schema-fixes.sql
   ```
   Or open the file: `db/schema-fixes.sql`

3. **Paste and Run:**
   - Paste the entire SQL into the editor
   - Click "Run" button (or Cmd/Ctrl+Enter)
   - Verify all statements executed successfully (green checkmarks)

### Step 2: Enable Realtime Filters

1. **Go to Realtime Settings:**
   - https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx/realtime/tables
   - Or: Dashboard → Realtime → Tables

2. **For each table, enable `player_id` filter:**
   - Click on `player_state` table
   - Go to "Realtime" tab
   - Find `player_id` column
   - Enable filter checkbox
   - Click "Save"
   
   - Repeat for:
     - `local_videos`
     - `admin_commands` (optional, for command status subscriptions)

## ✅ Alternative: Use psql (If you have database password)

1. **Get Connection String:**
   - Dashboard → Settings → Database → Connection string
   - Copy the "Connection string" (URI format)

2. **Run SQL:**
   ```bash
   psql "postgresql://postgres:[YOUR-PASSWORD]@db.lfvhgdbnecjeuciadimx.supabase.co:5432/postgres" -f db/schema-fixes.sql
   ```

## 📋 What Gets Applied

The schema fixes include:

✅ **Priority 1: Critical Fixes**
- Adds missing columns to `admin_commands` table (`player_id`, `command_type`, `command_data`, etc.)
- Fixes RLS policies for proper multi-player isolation
- Creates performance indexes

✅ **Priority 2: Performance**
- Creates `search_videos()` FTS function for better search
- Adds composite indexes for faster queries

✅ **Priority 3: Features**
- Adds trigger to auto-update `last_updated` timestamp

## ✅ Verification

After running, verify with these queries in SQL Editor:

```sql
-- Check admin_commands has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'admin_commands' 
AND column_name IN ('player_id', 'command_type', 'command_data', 'issued_by')
ORDER BY column_name;

-- Test search function
SELECT * FROM search_videos('test', 'all', 10, 0, 'DEMO_PLAYER')
LIMIT 5;

-- Check indexes were created
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('admin_commands', 'player_state', 'local_videos')
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_player_state_timestamp';
```

All queries should return results if the fixes were applied successfully.

## 🚨 Troubleshooting

**If you get errors:**
- Check that you're using the correct project (lfvhgdbnecjeuciadimx)
- Ensure you have admin/owner permissions
- Some statements may fail if columns already exist (that's OK, they use `IF NOT EXISTS`)
- Check the error message for specific issues

**If Realtime filters don't appear:**
- Make sure Realtime is enabled for the tables (already done in `enable-realtime.sql`)
- The filter option may be in a different location in newer Supabase versions
- Check: Dashboard → Realtime → Settings → Table Filters

## 📝 Next Steps

After applying the fixes:
1. ✅ Test the application - commands should work correctly
2. ✅ Test search - should use FTS function
3. ✅ Monitor Realtime subscriptions - should be more efficient
4. ✅ Check logs - heartbeat should use database function

---

**File Location:** `db/schema-fixes.sql`  
**Dashboard URL:** https://supabase.com/dashboard/project/lfvhgdbnecjeuciadimx

