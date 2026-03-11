```sql
-- Agent Usage Heat Map Generator Migration
-- Creates tables and views for real-time heat map visualization of agent usage patterns

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create agent_usage_sessions table for tracking individual usage sessions
CREATE TABLE IF NOT EXISTS agent_usage_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_execution_id UUID NOT NULL,
    user_id UUID,
    agent_id UUID NOT NULL,
    agent_category TEXT NOT NULL,
    session_start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    session_end_time TIMESTAMP WITH TIME ZONE,
    session_duration_seconds INTEGER,
    geographical_coordinates GEOMETRY(POINT, 4326),
    country_code VARCHAR(2),
    region_name TEXT,
    city_name TEXT,
    timezone_name TEXT NOT NULL,
    timezone_offset INTEGER NOT NULL,
    ip_address INET,
    user_agent TEXT,
    performance_score DECIMAL(5,2),
    success_rate DECIMAL(5,2),
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_agent_usage_sessions_execution 
        FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE CASCADE,
    CONSTRAINT valid_performance_score 
        CHECK (performance_score >= 0 AND performance_score <= 100),
    CONSTRAINT valid_success_rate 
        CHECK (success_rate >= 0 AND success_rate <= 100),
    CONSTRAINT valid_session_duration 
        CHECK (session_duration_seconds >= 0),
    CONSTRAINT valid_coordinates 
        CHECK (ST_IsValid(geographical_coordinates) OR geographical_coordinates IS NULL)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_agent_id 
    ON agent_usage_sessions(agent_id);
    
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_category 
    ON agent_usage_sessions(agent_category);
    
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_session_start 
    ON agent_usage_sessions(session_start_time);
    
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_timezone 
    ON agent_usage_sessions(timezone_name);
    
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_country 
    ON agent_usage_sessions(country_code);
    
-- Spatial index for geographical queries
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_geo 
    ON agent_usage_sessions USING GIST(geographical_coordinates);

-- Composite indexes for heat map queries
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_category_time 
    ON agent_usage_sessions(agent_category, session_start_time);
    
CREATE INDEX IF NOT EXISTS idx_agent_usage_sessions_country_category 
    ON agent_usage_sessions(country_code, agent_category);

-- Create materialized view for geographical statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS agent_geographical_stats AS
SELECT 
    country_code,
    region_name,
    city_name,
    agent_category,
    ST_Centroid(ST_Collect(geographical_coordinates)) as center_point,
    COUNT(*) as total_sessions,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT agent_id) as unique_agents,
    AVG(session_duration_seconds) as avg_session_duration,
    AVG(performance_score) as avg_performance_score,
    AVG(success_rate) as avg_success_rate,
    SUM(error_count) as total_errors,
    DATE_TRUNC('hour', session_start_time) as time_bucket,
    MIN(session_start_time) as earliest_session,
    MAX(session_start_time) as latest_session
FROM agent_usage_sessions
WHERE geographical_coordinates IS NOT NULL
    AND session_start_time >= NOW() - INTERVAL '7 days'
GROUP BY 
    country_code, 
    region_name, 
    city_name, 
    agent_category,
    DATE_TRUNC('hour', session_start_time);

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_geographical_stats_unique
    ON agent_geographical_stats(country_code, region_name, city_name, agent_category, time_bucket);

-- Create materialized view for timezone usage patterns
CREATE MATERIALIZED VIEW IF NOT EXISTS agent_timezone_usage AS
SELECT 
    timezone_name,
    timezone_offset,
    agent_category,
    EXTRACT(hour FROM (session_start_time AT TIME ZONE timezone_name)) as local_hour,
    EXTRACT(dow FROM (session_start_time AT TIME ZONE timezone_name)) as day_of_week,
    COUNT(*) as session_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(session_duration_seconds) as avg_duration,
    AVG(performance_score) as avg_performance,
    AVG(success_rate) as avg_success_rate,
    DATE_TRUNC('hour', session_start_time) as time_bucket
FROM agent_usage_sessions
WHERE session_start_time >= NOW() - INTERVAL '7 days'
GROUP BY 
    timezone_name,
    timezone_offset,
    agent_category,
    EXTRACT(hour FROM (session_start_time AT TIME ZONE timezone_name)),
    EXTRACT(dow FROM (session_start_time AT TIME ZONE timezone_name)),
    DATE_TRUNC('hour', session_start_time);

-- Create unique index on timezone usage view
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_timezone_usage_unique
    ON agent_timezone_usage(timezone_name, agent_category, local_hour, day_of_week, time_bucket);

-- Create function to calculate geographical clusters
CREATE OR REPLACE FUNCTION calculate_geographical_clusters(
    cluster_radius_km FLOAT DEFAULT 50.0,
    min_sessions INTEGER DEFAULT 5
) RETURNS TABLE (
    cluster_id INTEGER,
    center_coordinates GEOMETRY,
    country_code VARCHAR(2),
    session_count BIGINT,
    avg_performance DECIMAL,
    dominant_category TEXT
) 
LANGUAGE SQL
SECURITY DEFINER
AS $$
    WITH clustered_sessions AS (
        SELECT 
            ST_ClusterDBSCAN(geographical_coordinates, cluster_radius_km * 1000, min_sessions) 
                OVER() as cluster_id,
            *
        FROM agent_usage_sessions 
        WHERE geographical_coordinates IS NOT NULL
            AND session_start_time >= NOW() - INTERVAL '24 hours'
    )
    SELECT 
        cs.cluster_id,
        ST_Centroid(ST_Collect(cs.geographical_coordinates)) as center_coordinates,
        mode() WITHIN GROUP (ORDER BY cs.country_code) as country_code,
        COUNT(*) as session_count,
        AVG(cs.performance_score) as avg_performance,
        mode() WITHIN GROUP (ORDER BY cs.agent_category) as dominant_category
    FROM clustered_sessions cs
    WHERE cs.cluster_id IS NOT NULL
    GROUP BY cs.cluster_id
    ORDER BY session_count DESC;
$$;

-- Create function for real-time heat map data
CREATE OR REPLACE FUNCTION get_realtime_heat_map_data(
    time_window_hours INTEGER DEFAULT 1,
    category_filter TEXT DEFAULT NULL
) RETURNS TABLE (
    latitude DECIMAL,
    longitude DECIMAL,
    session_count BIGINT,
    avg_performance DECIMAL,
    country_code VARCHAR(2),
    agent_category TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        ST_Y(geographical_coordinates) as latitude,
        ST_X(geographical_coordinates) as longitude,
        COUNT(*) as session_count,
        AVG(performance_score) as avg_performance,
        country_code,
        agent_category
    FROM agent_usage_sessions
    WHERE geographical_coordinates IS NOT NULL
        AND session_start_time >= NOW() - (time_window_hours || ' hours')::INTERVAL
        AND (category_filter IS NULL OR agent_category = category_filter)
    GROUP BY 
        ST_Y(geographical_coordinates),
        ST_X(geographical_coordinates),
        country_code,
        agent_category
    HAVING COUNT(*) > 0
    ORDER BY session_count DESC;
$$;

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_heat_map_views()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY agent_geographical_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY agent_timezone_usage;
END;
$$;

-- Create trigger function for real-time updates
CREATE OR REPLACE FUNCTION notify_heat_map_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Notify about new session data
    PERFORM pg_notify(
        'heat_map_update', 
        json_build_object(
            'action', TG_OP,
            'session_id', COALESCE(NEW.id, OLD.id),
            'agent_category', COALESCE(NEW.agent_category, OLD.agent_category),
            'country_code', COALESCE(NEW.country_code, OLD.country_code),
            'timestamp', NOW()
        )::text
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for real-time notifications
CREATE TRIGGER trigger_heat_map_insert
    AFTER INSERT ON agent_usage_sessions
    FOR EACH ROW
    EXECUTE FUNCTION notify_heat_map_update();

CREATE TRIGGER trigger_heat_map_update
    AFTER UPDATE ON agent_usage_sessions
    FOR EACH ROW
    EXECUTE FUNCTION notify_heat_map_update();

-- Create trigger to automatically calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.session_end_time IS NOT NULL AND NEW.session_start_time IS NOT NULL THEN
        NEW.session_duration_seconds := EXTRACT(epoch FROM (NEW.session_end_time - NEW.session_start_time));
    END IF;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_calculate_session_duration
    BEFORE INSERT OR UPDATE ON agent_usage_sessions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_session_duration();

-- Enable Row Level Security
ALTER TABLE agent_usage_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own sessions or public aggregate data
CREATE POLICY "Users can view own usage sessions" ON agent_usage_sessions
    FOR SELECT USING (
        auth.uid() = user_id 
        OR auth.jwt() ->> 'role' = 'admin'
        OR auth.jwt() ->> 'role' = 'analytics_viewer'
    );

-- RLS Policy: Service role can insert/update sessions
CREATE POLICY "Service role can manage sessions" ON agent_usage_sessions
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Grant permissions for materialized views
GRANT SELECT ON agent_geographical_stats TO authenticated;
GRANT SELECT ON agent_timezone_usage TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION calculate_geographical_clusters TO authenticated;
GRANT EXECUTE ON FUNCTION get_realtime_heat_map_data TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_heat_map_views TO service_role;

-- Create scheduled job to refresh materialized views every 5 minutes
SELECT cron.schedule(
    'refresh-heat-map-views',
    '*/5 * * * *',
    'SELECT refresh_heat_map_views();'
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- Add comments for documentation
COMMENT ON TABLE agent_usage_sessions IS 'Tracks individual agent usage sessions with geographical and temporal data for heat map visualization';
COMMENT ON MATERIALIZED VIEW agent_geographical_stats IS 'Aggregated geographical statistics for agent usage patterns';
COMMENT ON MATERIALIZED VIEW agent_timezone_usage IS 'Aggregated timezone-based usage patterns showing temporal distribution';
COMMENT ON FUNCTION calculate_geographical_clusters IS 'Calculates geographical clusters of agent usage for heat map density visualization';
COMMENT ON FUNCTION get_realtime_heat_map_data IS 'Returns real-time data for heat map visualization with optional filtering';
COMMENT ON FUNCTION refresh_heat_map_views IS 'Refreshes materialized views for updated heat map data';
```