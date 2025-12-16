# Supabase Manual Setup Guide

## Required Manual Configuration Steps

### 1. Apply Schema Fixes

**File**: `db/schema-fixes.sql`

**Location**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/schema-fixes.sql`

**What it does**:
- Adds missing columns to `admin_commands` table (`player_id`, `command_type`, `command_data`, etc.)
- Creates indexes for performance
- Fixes RLS policies for multi-player isolation

**How to apply**:
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `db/schema-fixes.sql`
5. Click **Run**

**Direct file path**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/schema-fixes.sql`

---

### 2. Deploy Missing RPC Functions

**File**: `db/schema.sql` (lines 254-259)

**Location**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/schema.sql`

**What it does**:
- Creates `update_player_heartbeat` RPC function
- Currently returns 404 errors, falls back to direct UPDATE

**SQL to run**:
```sql
CREATE OR REPLACE FUNCTION update_player_heartbeat(p_player_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE player_state
  SET 
    last_heartbeat = NOW(),
    is_online = true,
    last_updated = NOW()
  WHERE player_id = p_player_id;
END;
$$ LANGUAGE plpgsql;
```

**How to apply**:
1. Open Supabase Dashboard → **SQL Editor**
2. Paste the SQL above
3. Click **Run**

**Direct file path**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/schema.sql`

---

### 3. Enable Realtime Filters

**What it does**:
- Enables server-side filtering for `player_id` column
- Reduces network traffic and processing overhead
- Code already uses filters, but they need to be enabled in Dashboard

**How to apply**:
1. Open Supabase Dashboard
2. Navigate to **Database** → **Replication**
3. Find these tables:
   - `player_state`
   - `local_videos`
   - `admin_commands`
4. For each table, click the **...** menu
5. Select **Edit Realtime**
6. Enable **Realtime** toggle
7. Add filter: `player_id`
8. Click **Save**

**Alternative (via SQL)**:
```sql
-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE player_state;
ALTER PUBLICATION supabase_realtime ADD TABLE local_videos;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_commands;

-- Note: Filters must be enabled via Dashboard UI
-- Go to Database → Replication → Edit Realtime → Add filter: player_id
```

**Direct SQL file**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/enable-realtime-filters.sql`

---

### 4. Fix Local Videos Schema (if needed)

**File**: `db/fix-local-videos-schema.sql`

**Location**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/fix-local-videos-schema.sql`

**What it does**:
- Adds `file_path` column if missing
- Adds `filename` column if missing
- Creates unique constraint on `(player_id, file_path)`
- Makes columns NOT NULL

**When to apply**:
- If you see `PGRST204` errors about missing `file_path` or `filename` columns
- The app will attempt auto-fix via RPC, but manual fix may be needed

**How to apply**:
1. Open Supabase Dashboard → **SQL Editor**
2. Copy contents of `db/fix-local-videos-schema.sql`
3. Click **Run**

**Direct file path**: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/fix-local-videos-schema.sql`

---

## Quick Reference: All SQL Files

| File | Purpose | Priority |
|------|---------|----------|
| `db/schema-fixes.sql` | Fix admin_commands schema, RLS policies, indexes | **HIGH** |
| `db/schema.sql` (lines 254-259) | Create update_player_heartbeat RPC | **MEDIUM** |
| `db/enable-realtime-filters.sql` | Enable Realtime publication (filters via UI) | **HIGH** |
| `db/fix-local-videos-schema.sql` | Fix local_videos schema if PGRST204 errors | **LOW** (as needed) |
| `db/create-schema-fix-rpc.sql` | Auto-fix RPC function | **LOW** (optional) |

## Verification Steps

After applying changes, verify:

1. **Schema fixes**:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'admin_commands' AND column_name IN ('player_id', 'command_type', 'command_data');
   ```

2. **RPC function**:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'update_player_heartbeat';
   ```

3. **Realtime filters**: Check Dashboard → Database → Replication → verify filters are enabled

---

## Notes

- All SQL files are in: `/Users/mikeclarkin/Music/DJAMMS/DJAMMS_Electron/db/`
- The app will continue to work without these changes (with fallbacks), but performance and reliability will be improved
- Realtime filters **must** be enabled via Dashboard UI (SQL alone is not sufficient)

