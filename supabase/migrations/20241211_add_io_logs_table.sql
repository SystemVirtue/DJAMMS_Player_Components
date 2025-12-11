-- Migration: Add IO logs table for capturing all commands and CRUD operations
-- Each session gets a unique session_id (created when player connects/refreshes)

-- Create io_logs table
CREATE TABLE IF NOT EXISTS public.io_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(50) NOT NULL,
  player_id VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('supabase', 'web-admin', 'web-kiosk', 'error')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('sent', 'received')),
  endpoint VARCHAR(100),
  request_data JSONB,
  response_data JSONB,
  error_data JSONB,
  is_recursion BOOLEAN DEFAULT FALSE,
  recursion_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_io_logs_session_id ON public.io_logs(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_io_logs_player_id ON public.io_logs(player_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_io_logs_event_type ON public.io_logs(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_io_logs_recursion ON public.io_logs(is_recursion) WHERE is_recursion = TRUE;

-- Create sessions table to track active sessions
CREATE TABLE IF NOT EXISTS public.io_log_sessions (
  session_id VARCHAR(50) PRIMARY KEY,
  player_id VARCHAR(50) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  log_count INTEGER DEFAULT 0
);

-- Create index on sessions
CREATE INDEX IF NOT EXISTS idx_io_log_sessions_player_active ON public.io_log_sessions(player_id, is_active, started_at DESC);

-- Function to create a new session
CREATE OR REPLACE FUNCTION create_io_log_session(p_player_id VARCHAR(50))
RETURNS VARCHAR(50) AS $$
DECLARE
  v_session_id VARCHAR(50);
BEGIN
  -- Generate session ID: player_id_timestamp
  v_session_id := p_player_id || '_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
  
  -- End any active sessions for this player
  UPDATE public.io_log_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE player_id = p_player_id AND is_active = TRUE;
  
  -- Create new session
  INSERT INTO public.io_log_sessions (session_id, player_id, started_at, is_active)
  VALUES (v_session_id, p_player_id, NOW(), TRUE)
  ON CONFLICT (session_id) DO NOTHING;
  
  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log an IO event
CREATE OR REPLACE FUNCTION log_io_event(
  p_session_id VARCHAR(50),
  p_player_id VARCHAR(50),
  p_event_type VARCHAR(20),
  p_direction VARCHAR(10),
  p_endpoint VARCHAR(100),
  p_request_data JSONB DEFAULT NULL,
  p_response_data JSONB DEFAULT NULL,
  p_error_data JSONB DEFAULT NULL,
  p_is_recursion BOOLEAN DEFAULT FALSE,
  p_recursion_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.io_logs (
    session_id,
    player_id,
    event_type,
    direction,
    endpoint,
    request_data,
    response_data,
    error_data,
    is_recursion,
    recursion_reason
  )
  VALUES (
    p_session_id,
    p_player_id,
    p_event_type,
    p_direction,
    p_endpoint,
    p_request_data,
    p_response_data,
    p_error_data,
    p_is_recursion,
    p_recursion_reason
  )
  RETURNING id INTO v_log_id;
  
  -- Update session log count
  UPDATE public.io_log_sessions
  SET log_count = log_count + 1
  WHERE session_id = p_session_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get sessions for a player
CREATE OR REPLACE FUNCTION get_io_log_sessions(p_player_id VARCHAR(50))
RETURNS TABLE (
  session_id VARCHAR(50),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN,
  log_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.session_id,
    s.started_at,
    s.ended_at,
    s.is_active,
    s.log_count
  FROM public.io_log_sessions s
  WHERE s.player_id = p_player_id
  ORDER BY s.started_at DESC
  LIMIT 100; -- Last 100 sessions
END;
$$ LANGUAGE plpgsql;

-- Function to get logs for a session
CREATE OR REPLACE FUNCTION get_io_logs_for_session(
  p_session_id VARCHAR(50),
  p_event_types VARCHAR[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  id UUID,
  log_timestamp TIMESTAMP WITH TIME ZONE,
  event_type VARCHAR(20),
  direction VARCHAR(10),
  endpoint VARCHAR(100),
  request_data JSONB,
  response_data JSONB,
  error_data JSONB,
  is_recursion BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.timestamp AS log_timestamp,
    l.event_type,
    l.direction,
    l.endpoint,
    l.request_data,
    l.response_data,
    l.error_data,
    l.is_recursion
  FROM public.io_logs l
  WHERE l.session_id = p_session_id
    AND (p_event_types IS NULL OR l.event_type = ANY(p_event_types))
  ORDER BY l.timestamp ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Enable Realtime for io_logs (optional, for live updates)
-- ALTER PUBLICATION supabase_realtime ADD TABLE io_logs;

