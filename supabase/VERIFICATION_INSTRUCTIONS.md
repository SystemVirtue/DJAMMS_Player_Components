# Supabase Schema Verification Instructions

## Quick Verification

Since `db pull` requires Docker, use the SQL verification script instead:

### Option 1: Run SQL Script in Supabase Dashboard

1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `supabase/verify-schema.sql`
5. Click **Run**
6. Review the results - look for any `✗ MISSING:` entries

### Option 2: Use Supabase CLI (if Docker is available)

```bash
# Start local Supabase (requires Docker)
npx supabase start

# Pull schema
npx supabase db pull --schema public
```

---

## Required Schema Elements

### Tables

1. **player_state** - Player state and queue
2. **local_videos** - Video library for search
3. **admin_commands** - Command queue
4. **players** - Player registry (optional)

### Key Columns to Verify

#### player_state
- ✓ `player_id` (VARCHAR/TEXT)
- ✓ `active_queue` (JSONB)
- ✓ `priority_queue` (JSONB)
- ✓ `queue_index` (INTEGER)
- ✓ `updated_at` (TIMESTAMP WITH TIME ZONE)
- ✓ `now_playing_video` (JSONB)
- ✓ `current_position` (NUMERIC/REAL)
- ✓ `volume` (NUMERIC/REAL)
- ✓ `status` (VARCHAR)
- ✓ `is_online` (BOOLEAN)
- ✓ `last_heartbeat` (TIMESTAMP WITH TIME ZONE)

#### local_videos
- ✓ `player_id` (VARCHAR/TEXT)
- ✓ `title` (TEXT)
- ✓ `artist` (TEXT)
- ✓ `file_path` (TEXT)
- ✓ `metadata` (JSONB)
- ✓ `is_available` (BOOLEAN)

#### admin_commands
- ✓ `player_id` (TEXT)
- ✓ `admin_id` (TEXT)
- ✓ `action_type` (TEXT)
- ✓ `action_data` (JSONB)
- ✓ `status` (TEXT)

### Functions

- ✓ `update_updated_at_column()` - Trigger function
- ⚠️ `update_player_heartbeat(p_player_id TEXT)` - Optional (code has fallback)
- ⚠️ `search_videos(...)` - Optional (code has ILIKE fallback)

### Triggers

- ✓ `update_player_state_updated_at` on `player_state` table

### Indexes

- ✓ `idx_player_state_player_updated` on `(player_id, updated_at DESC)`
- ✓ `idx_admin_commands_player_pending` on `(player_id, status)` WHERE `status = 'pending'`
- ✓ GIN indexes on `local_videos.title` and `local_videos.artist` (for search)

### Realtime

All three tables must be in `supabase_realtime` publication:
- ✓ `player_state`
- ✓ `local_videos`
- ✓ `admin_commands`

---

## Migration Status

Current migrations:
- ✅ `20241204_add_queue_index.sql` - Applied
- ✅ `20241205_add_updated_at_index.sql` - Applied

---

## Next Steps

1. Run `supabase/verify-schema.sql` in Supabase SQL Editor
2. Check for any missing columns/functions
3. Apply missing migrations if needed
4. Verify Realtime is enabled for all three tables

