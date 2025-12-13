-- DJAMMS Obie Electron Player - Complete Supabase Schema
-- From manifesto PAGE 36

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. PLAYER STATE MANAGEMENT
DROP TABLE IF EXISTS player_state CASCADE;
CREATE TABLE player_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(50) DEFAULT 'electron-player-1' UNIQUE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('playing', 'paused', 'stopped', 'loading', 'error', 'idle')) DEFAULT 'idle',
    now_playing_video JSONB,
    current_position DECIMAL(8,2) DEFAULT 0,
    duration DECIMAL(8,2),
    active_queue JSONB DEFAULT '[]'::jsonb,
    priority_queue JSONB DEFAULT '[]'::jsonb,
    available_playlists JSONB DEFAULT '[]'::jsonb,
    total_videos_scanned INTEGER DEFAULT 0,
    volume DECIMAL(3,2) DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1),
    crossfade_enabled BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    electron_version VARCHAR(20),
    os_info JSONB,
    CONSTRAINT valid_queue_format CHECK (
        jsonb_typeof(active_queue) = 'array' AND
        jsonb_typeof(priority_queue) = 'array'
    )
);

DROP INDEX IF EXISTS idx_player_state_player_id;
CREATE INDEX idx_player_state_player_id ON player_state(player_id);
DROP INDEX IF EXISTS idx_player_state_online;
CREATE INDEX idx_player_state_online ON player_state(is_online);

-- 2. LOCAL VIDEO CATALOG
DROP TABLE IF EXISTS local_videos CASCADE;
CREATE TABLE local_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(50) NOT NULL REFERENCES player_state(player_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    relative_path TEXT,
    filename TEXT NOT NULL,
    file_size BIGINT,
    file_hash VARCHAR(64),
    title TEXT,
    artist TEXT,
    album TEXT,
    duration INTEGER,
    resolution VARCHAR(20),
    codec VARCHAR(50),
    bitrate INTEGER,
    fps DECIMAL(5,2),
    playlist_folder TEXT,
    collection_type VARCHAR(50),
    is_available BOOLEAN DEFAULT TRUE,
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    play_count INTEGER DEFAULT 0,
    last_played TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_scanned TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_file_per_player UNIQUE (player_id, file_path)
);

DROP INDEX IF EXISTS idx_local_videos_player;
CREATE INDEX idx_local_videos_player ON local_videos(player_id);
DROP INDEX IF EXISTS idx_local_videos_available;
CREATE INDEX idx_local_videos_available ON local_videos(is_available) WHERE is_available = TRUE;
DROP INDEX IF EXISTS idx_local_videos_playlist;
CREATE INDEX idx_local_videos_playlist ON local_videos(playlist_folder);
DROP INDEX IF EXISTS idx_local_videos_artist;
CREATE INDEX idx_local_videos_artist ON local_videos(artist);
DROP INDEX IF EXISTS idx_local_videos_title_trgm;
CREATE INDEX idx_local_videos_title_trgm ON local_videos USING gin(title gin_trgm_ops);
DROP INDEX IF EXISTS idx_local_videos_artist_trgm;
CREATE INDEX idx_local_videos_artist_trgm ON local_videos USING gin(artist gin_trgm_ops);

-- 3. PLAYLIST MANAGEMENT
DROP TABLE IF EXISTS playlist_videos CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(50) NOT NULL REFERENCES player_state(player_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    relative_path TEXT,
    video_count INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    shuffle_enabled BOOLEAN DEFAULT FALSE,
    repeat_mode VARCHAR(20) CHECK (repeat_mode IN ('none', 'all', 'one')) DEFAULT 'all',
    thumbnail_url TEXT,
    description TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_playlist_per_player UNIQUE (player_id, folder_path)
);

DROP INDEX IF EXISTS idx_playlists_player;
CREATE INDEX idx_playlists_player ON playlists(player_id);
DROP INDEX IF EXISTS idx_playlists_name;
CREATE INDEX idx_playlists_name ON playlists(name);

CREATE TABLE playlist_videos (
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    video_id UUID REFERENCES local_videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (playlist_id, video_id)
);

DROP INDEX IF EXISTS idx_playlist_videos_playlist;
CREATE INDEX idx_playlist_videos_playlist ON playlist_videos(playlist_id);
DROP INDEX IF EXISTS idx_playlist_videos_position;
CREATE INDEX idx_playlist_videos_position ON playlist_videos(playlist_id, position);

-- 4. ADMIN COMMAND QUEUE
DROP TABLE IF EXISTS admin_commands CASCADE;
CREATE TABLE admin_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(50) NOT NULL,
    admin_name TEXT,
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB,
    status VARCHAR(20) CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'timeout')) DEFAULT 'pending',
    priority INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_duration_ms INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes'
);

DROP INDEX IF EXISTS idx_admin_commands_status_priority;
CREATE INDEX idx_admin_commands_status_priority ON admin_commands(status, priority DESC, created_at);
DROP INDEX IF EXISTS idx_admin_commands_pending;
CREATE INDEX idx_admin_commands_pending ON admin_commands(created_at) WHERE status = 'pending';

-- 5. ADMIN SESSION MANAGEMENT
DROP TABLE IF EXISTS admin_sessions CASCADE;
CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(50) NOT NULL UNIQUE,
    session_token VARCHAR(100) UNIQUE NOT NULL,
    user_email TEXT,
    user_role VARCHAR(20) DEFAULT 'admin',
    session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    user_agent TEXT,
    ip_address INET,
    commands_issued INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

DROP INDEX IF EXISTS idx_admin_sessions_active;
CREATE INDEX idx_admin_sessions_active ON admin_sessions(is_active, last_seen DESC);

-- 6. PRIORITY REQUEST QUEUE
DROP TABLE IF EXISTS priority_requests CASCADE;
CREATE TABLE priority_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_source TEXT NOT NULL,
    source_type VARCHAR(20) CHECK (source_type IN ('local', 'youtube', 'url')) DEFAULT 'local',
    video_metadata JSONB,
    user_id TEXT,
    user_context JSONB,
    status VARCHAR(20) CHECK (status IN ('queued', 'approved', 'playing', 'played', 'rejected', 'expired')) DEFAULT 'queued',
    priority_score INTEGER DEFAULT 0,
    moderation_status VARCHAR(20) CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
    moderation_reason TEXT,
    moderated_by VARCHAR(50),
    moderated_at TIMESTAMP WITH TIME ZONE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    played_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_priority_requests_status;
CREATE INDEX idx_priority_requests_status ON priority_requests(status, priority_score DESC, created_at);

-- 7. METUBE DOWNLOAD TRACKING
DROP TABLE IF EXISTS metube_downloads CASCADE;
CREATE TABLE metube_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url TEXT NOT NULL,
    requested_by VARCHAR(50),
    status VARCHAR(20) CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    output_filename TEXT,
    output_path TEXT,
    file_size BIGINT,
    video_title TEXT,
    video_artist TEXT,
    video_duration INTEGER,
    thumbnail_url TEXT,
    auto_queue BOOLEAN DEFAULT TRUE,
    target_folder TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    download_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

DROP INDEX IF EXISTS idx_metube_downloads_status;
CREATE INDEX idx_metube_downloads_status ON metube_downloads(status, requested_at DESC);

-- 8. ANALYTICS & LOGGING
DROP TABLE IF EXISTS playback_history CASCADE;
CREATE TABLE playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(50) NOT NULL,
    video_id UUID REFERENCES local_videos(id) ON DELETE SET NULL,
    video_title TEXT,
    video_artist TEXT,
    video_path TEXT,
    queue_type VARCHAR(20),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_played INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    session_id UUID,
    added_by VARCHAR(50)
);

DROP INDEX IF EXISTS idx_playback_history_player;
CREATE INDEX idx_playback_history_player ON playback_history(player_id, started_at DESC);

DROP TABLE IF EXISTS system_events CASCADE;
CREATE TABLE system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(50),
    event_type VARCHAR(50) NOT NULL,
    event_level VARCHAR(20) CHECK (event_level IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
    event_message TEXT NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_system_events_player;
CREATE INDEX idx_system_events_player ON system_events(player_id, timestamp DESC);

-- Enable RLS on all tables (customize policies later)
ALTER TABLE player_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE metube_downloads ENABLE ROW LEVEL SECURITY;

-- Player policies (app full access)
DROP POLICY IF EXISTS player_state_full_access ON player_state;
CREATE POLICY player_state_full_access ON player_state
    FOR ALL USING (player_id = current_setting('app.player_id', true))
    WITH CHECK (player_id = current_setting('app.player_id', true));

DROP POLICY IF EXISTS player_state_admin_read ON player_state;
CREATE POLICY player_state_admin_read ON player_state
    FOR SELECT TO authenticated USING (true);

-- Public read for kiosk
DROP POLICY IF EXISTS local_videos_public_read ON local_videos;
CREATE POLICY local_videos_public_read ON local_videos FOR SELECT USING (is_available = true);

-- Admin commands
DROP POLICY IF EXISTS admin_commands_insert ON admin_commands;
CREATE POLICY admin_commands_insert ON admin_commands FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS admin_commands_player_access ON admin_commands;
CREATE POLICY admin_commands_player_access ON admin_commands FOR ALL USING (true);

-- Seed default player
INSERT INTO player_state (player_id, status) VALUES ('electron-player-1', 'idle') ON CONFLICT DO NOTHING;

-- Database functions (heartbeat, cleanup)
CREATE OR REPLACE FUNCTION update_player_heartbeat(p_player_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE player_state SET last_heartbeat = NOW(), is_online = TRUE WHERE player_id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
