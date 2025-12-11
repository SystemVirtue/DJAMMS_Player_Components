# DJAMMS Supabase Schema Requirements

This document lists all required tables, columns, indexes, functions, and triggers for the DJAMMS application.

## Required Tables

### 1. `player_state`
**Purpose**: Stores real-time player state (queue, now playing, status)

**Required Columns**:
- `id` (UUID, PRIMARY KEY)
- `player_id` (VARCHAR/TEXT, required for filtering)
- `status` (VARCHAR, values: 'idle' | 'playing' | 'paused' | 'buffering' | 'error')
- `is_online` (BOOLEAN, default: false)
- `is_playing` (BOOLEAN, optional - code uses `status` instead)
- `now_playing_video` (JSONB, nullable)
- `current_position` (NUMERIC/REAL, playback position in seconds)
- `video_duration` (NUMERIC/REAL, optional)
- `playback_position` (NUMERIC/REAL, optional - code uses `current_position`)
- `volume` (NUMERIC/REAL, 0.0 to 1.0)
- `volume_level` (NUMERIC/REAL, optional - code uses `volume`)
- `active_queue` (JSONB, array of QueueVideoItem)
- `priority_queue` (JSONB, array of QueueVideoItem)
- `queue_index` (INTEGER, current position in active_queue, default: 0)
- `updated_at` (TIMESTAMP WITH TIME ZONE, auto-updated on change)
- `last_updated` (TIMESTAMP WITH TIME ZONE, optional - legacy)
- `last_heartbeat` (TIMESTAMP WITH TIME ZONE)
- `session_start` (TIMESTAMP WITH TIME ZONE, optional)
- `created_at` (TIMESTAMP WITH TIME ZONE, default: now())

**Required Indexes**:
- Index on `player_id` (for filtering)
- Index on `(player_id, updated_at DESC)` for conflict resolution (idx_player_state_player_updated)

**Required Triggers**:
- `update_player_state_updated_at` - Auto-updates `updated_at` on UPDATE

**Realtime**: Must be enabled with filter on `player_id`

---

### 2. `local_videos`
**Purpose**: Stores indexed video library for search/browse

**Required Columns**:
- `id` (UUID, PRIMARY KEY)
- `player_id` (VARCHAR/TEXT, required for filtering)
- `title` (TEXT, required)
- `artist` (TEXT, nullable)
- `file_path` (TEXT, required - full path to video file)
- `path` (TEXT, optional - backward compatibility, same as file_path)
- `filename` (TEXT, optional)
- `duration` (NUMERIC/REAL, nullable - duration in seconds)
- `is_available` (BOOLEAN, default: true)
- `metadata` (JSONB, nullable - stores playlist, sourceType, etc.)
- `file_hash` (TEXT, nullable - for change detection)
- `created_at` (TIMESTAMP WITH TIME ZONE, default: now())
- `updated_at` (TIMESTAMP WITH TIME ZONE, optional)

**Required Indexes**:
- Index on `player_id` (for filtering)
- Index on `is_available` (for filtering available videos)
- GIN index on `title` and `artist` for full-text search (pg_trgm)
- Partial index on `is_available = true` (for faster queries)

**Realtime**: Must be enabled with filter on `player_id`

---

### 3. `admin_commands`
**Purpose**: Command queue from Web Admin/Kiosk to Electron Player

**Required Columns**:
- `id` (UUID, PRIMARY KEY)
- `player_id` (TEXT, required for filtering)
- `admin_id` (TEXT, required - who issued the command)
- `action_type` (TEXT, required - command type: 'skip', 'resume', etc.)
- `action_data` (JSONB, required - command payload)
- `command_type` (TEXT, optional - new schema, same as action_type)
- `command_data` (JSONB, optional - new schema, same as action_data)
- `issued_by` (TEXT, optional - new schema, same as admin_id)
- `issued_at` (TIMESTAMP WITH TIME ZONE, optional)
- `status` (TEXT, default: 'pending', values: 'pending' | 'executed' | 'failed')
- `executed_at` (TIMESTAMP WITH TIME ZONE, nullable)
- `execution_result` (JSONB, nullable)
- `created_at` (TIMESTAMP WITH TIME ZONE, default: now())

**Required Indexes**:
- Index on `player_id` (idx_admin_commands_player_id)
- Index on `(player_id, status)` WHERE `status = 'pending'` (idx_admin_commands_player_pending)

**Realtime**: Must be enabled with filter on `player_id`

---

### 4. `players` (Optional)
**Purpose**: Player registry/validation

**Required Columns** (if exists):
- `id` (UUID, PRIMARY KEY)
- `player_id` (VARCHAR/TEXT, UNIQUE)
- `name` (TEXT, optional)
- `created_at` (TIMESTAMP WITH TIME ZONE)

---

## Required Functions

### 1. `update_updated_at_column()`
**Purpose**: Trigger function to auto-update `updated_at` column

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 2. `update_player_heartbeat(p_player_id TEXT)`
**Purpose**: Update player heartbeat (optional - code has fallback)

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

---

### 3. `search_videos(...)` (Optional)
**Purpose**: Full-text search RPC function (code has ILIKE fallback)

**Parameters**:
- `search_query` (TEXT)
- `scope` (TEXT, default: 'all')
- `result_limit` (INTEGER, default: 50)
- `result_offset` (INTEGER, default: 0)
- `p_player_id` (TEXT)

**Returns**: Array of local_videos rows

**Note**: Code falls back to ILIKE search if RPC doesn't exist

---

## Required Triggers

### 1. `update_player_state_updated_at`
**Table**: `player_state`
**When**: BEFORE UPDATE
**Function**: `update_updated_at_column()`
**Purpose**: Auto-update `updated_at` timestamp on any UPDATE

---

## Realtime Configuration

All three tables must be in the `supabase_realtime` publication:
- `player_state`
- `local_videos`
- `admin_commands`

**Filter Configuration** (in Supabase Dashboard):
- Enable Realtime for each table
- Add filter on `player_id` column for server-side filtering

---

## Migration Files

1. `20241204_add_queue_index.sql` - Adds `queue_index` column
2. `20241205_add_updated_at_index.sql` - Adds `updated_at` column, trigger, and index

---

## Verification

Run `supabase/verify-schema.sql` in Supabase SQL Editor to check all requirements.

