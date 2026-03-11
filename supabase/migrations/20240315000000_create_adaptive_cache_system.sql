```sql
-- Adaptive Cache Management System Migration
-- File: supabase/migrations/20240315000000_create_adaptive_cache_system.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create enum types for cache system
DO $$ BEGIN
    CREATE TYPE cache_layer_type AS ENUM ('cdn', 'application', 'database', 'edge', 'memory');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cache_strategy_type AS ENUM ('lru', 'lfu', 'ttl', 'adaptive', 'write_through', 'write_back', 'write_around');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cache_invalidation_type AS ENUM ('manual', 'ttl_expired', 'capacity_exceeded', 'dependency_changed', 'pattern_based');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Cache layers configuration table
CREATE TABLE IF NOT EXISTS cache_layers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    layer_type cache_layer_type NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    max_capacity_mb BIGINT,
    current_usage_mb BIGINT DEFAULT 0,
    ttl_default_seconds INTEGER DEFAULT 3600,
    strategy cache_strategy_type DEFAULT 'lru',
    is_active BOOLEAN DEFAULT true,
    endpoint_url TEXT,
    api_credentials JSONB,
    configuration JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache entries tracking table
CREATE TABLE IF NOT EXISTS cache_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_layer_id UUID NOT NULL REFERENCES cache_layers(id) ON DELETE CASCADE,
    cache_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    content_hash VARCHAR(64),
    size_bytes BIGINT DEFAULT 0,
    ttl_seconds INTEGER,
    expires_at TIMESTAMPTZ,
    hit_count INTEGER DEFAULT 0,
    miss_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_valid BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Access patterns tracking table
CREATE TABLE IF NOT EXISTS access_patterns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_key VARCHAR(500) NOT NULL,
    cache_layer_id UUID REFERENCES cache_layers(id) ON DELETE SET NULL,
    user_id UUID,
    session_id VARCHAR(100),
    request_path TEXT,
    request_method VARCHAR(10),
    hit_miss_status VARCHAR(10) NOT NULL CHECK (hit_miss_status IN ('hit', 'miss')),
    response_time_ms INTEGER,
    content_size_bytes BIGINT,
    geographic_region VARCHAR(50),
    user_agent_category VARCHAR(50),
    access_timestamp TIMESTAMPTZ DEFAULT NOW(),
    request_headers JSONB DEFAULT '{}',
    response_headers JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache optimization rules table
CREATE TABLE IF NOT EXISTS cache_optimization_rules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    priority INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    applies_to_layers UUID[] DEFAULT '{}',
    applies_to_content_types TEXT[] DEFAULT '{}',
    min_hit_ratio DECIMAL(5,4),
    max_response_time_ms INTEGER,
    effectiveness_score DECIMAL(5,4) DEFAULT 0,
    last_applied_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache performance metrics table
CREATE TABLE IF NOT EXISTS cache_performance_metrics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_layer_id UUID NOT NULL REFERENCES cache_layers(id) ON DELETE CASCADE,
    metric_timestamp TIMESTAMPTZ DEFAULT NOW(),
    time_window_minutes INTEGER NOT NULL DEFAULT 5,
    total_requests BIGINT DEFAULT 0,
    cache_hits BIGINT DEFAULT 0,
    cache_misses BIGINT DEFAULT 0,
    hit_ratio DECIMAL(5,4) GENERATED ALWAYS AS (
        CASE WHEN total_requests > 0 
        THEN ROUND(cache_hits::decimal / total_requests::decimal, 4)
        ELSE 0 END
    ) STORED,
    avg_response_time_ms DECIMAL(8,2),
    p95_response_time_ms DECIMAL(8,2),
    p99_response_time_ms DECIMAL(8,2),
    total_bytes_served BIGINT DEFAULT 0,
    bandwidth_saved_bytes BIGINT DEFAULT 0,
    invalidations_count INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    memory_usage_mb DECIMAL(10,2),
    cpu_usage_percent DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache invalidation events table
CREATE TABLE IF NOT EXISTS cache_invalidation_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cache_layer_id UUID REFERENCES cache_layers(id) ON DELETE SET NULL,
    invalidation_type cache_invalidation_type NOT NULL,
    cache_keys TEXT[] DEFAULT '{}',
    cache_tags TEXT[] DEFAULT '{}',
    pattern_regex TEXT,
    reason TEXT,
    triggered_by VARCHAR(100),
    triggered_by_user_id UUID,
    entries_affected INTEGER DEFAULT 0,
    bytes_freed BIGINT DEFAULT 0,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache dependency graph table
CREATE TABLE IF NOT EXISTS cache_dependencies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    parent_cache_key VARCHAR(500) NOT NULL,
    dependent_cache_key VARCHAR(500) NOT NULL,
    dependency_type VARCHAR(50) DEFAULT 'content',
    cache_layer_id UUID REFERENCES cache_layers(id) ON DELETE CASCADE,
    strength DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_cache_key, dependent_cache_key, cache_layer_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cache_entries_layer_key ON cache_entries(cache_layer_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cache_entries_last_accessed ON cache_entries(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_cache_entries_tags ON cache_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_cache_entries_hash ON cache_entries(content_hash);

CREATE INDEX IF NOT EXISTS idx_access_patterns_timestamp ON access_patterns(access_timestamp);
CREATE INDEX IF NOT EXISTS idx_access_patterns_cache_key ON access_patterns(cache_key);
CREATE INDEX IF NOT EXISTS idx_access_patterns_layer_id ON access_patterns(cache_layer_id);
CREATE INDEX IF NOT EXISTS idx_access_patterns_user_session ON access_patterns(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_layer_timestamp ON cache_performance_metrics(cache_layer_id, metric_timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_hit_ratio ON cache_performance_metrics(hit_ratio);

CREATE INDEX IF NOT EXISTS idx_invalidation_events_timestamp ON cache_invalidation_events(created_at);
CREATE INDEX IF NOT EXISTS idx_invalidation_events_layer_type ON cache_invalidation_events(cache_layer_id, invalidation_type);

CREATE INDEX IF NOT EXISTS idx_optimization_rules_active ON cache_optimization_rules(is_active, priority);

-- Function to calculate cache hit ratio
CREATE OR REPLACE FUNCTION calculate_cache_hit_ratio(
    p_cache_layer_id UUID,
    p_time_window_minutes INTEGER DEFAULT 60
) RETURNS DECIMAL(5,4) AS $$
DECLARE
    v_hit_ratio DECIMAL(5,4);
BEGIN
    SELECT 
        CASE WHEN COUNT(*) > 0 
        THEN ROUND(
            COUNT(*) FILTER (WHERE hit_miss_status = 'hit')::decimal / 
            COUNT(*)::decimal, 4
        )
        ELSE 0 END
    INTO v_hit_ratio
    FROM access_patterns
    WHERE cache_layer_id = p_cache_layer_id
      AND access_timestamp >= NOW() - INTERVAL '1 minute' * p_time_window_minutes;
    
    RETURN COALESCE(v_hit_ratio, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get cache efficiency score
CREATE OR REPLACE FUNCTION get_cache_efficiency_score(
    p_cache_layer_id UUID,
    p_time_window_minutes INTEGER DEFAULT 60
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_hit_ratio DECIMAL(5,4);
    v_avg_response_time DECIMAL(8,2);
    v_bandwidth_saved BIGINT;
BEGIN
    -- Calculate metrics
    SELECT 
        calculate_cache_hit_ratio(p_cache_layer_id, p_time_window_minutes),
        AVG(response_time_ms),
        SUM(CASE WHEN hit_miss_status = 'hit' THEN content_size_bytes ELSE 0 END)
    INTO v_hit_ratio, v_avg_response_time, v_bandwidth_saved
    FROM access_patterns
    WHERE cache_layer_id = p_cache_layer_id
      AND access_timestamp >= NOW() - INTERVAL '1 minute' * p_time_window_minutes;
    
    v_result := jsonb_build_object(
        'hit_ratio', COALESCE(v_hit_ratio, 0),
        'avg_response_time_ms', COALESCE(v_avg_response_time, 0),
        'bandwidth_saved_bytes', COALESCE(v_bandwidth_saved, 0),
        'efficiency_score', COALESCE(v_hit_ratio * 0.7 + (1000.0 / GREATEST(v_avg_response_time, 1)) * 0.3, 0)
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-expire cache entries
CREATE OR REPLACE FUNCTION expire_cache_entries() RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    UPDATE cache_entries 
    SET is_valid = false, updated_at = NOW()
    WHERE expires_at <= NOW() AND is_valid = true;
    
    GET DIAGNOSTICS v_expired_count = ROW_COUNT;
    
    -- Log invalidation event
    IF v_expired_count > 0 THEN
        INSERT INTO cache_invalidation_events (
            invalidation_type,
            reason,
            entries_affected,
            triggered_by
        ) VALUES (
            'ttl_expired',
            'Automatic TTL expiration',
            v_expired_count,
            'system_scheduler'
        );
    END IF;
    
    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update cache entry statistics
CREATE OR REPLACE FUNCTION update_cache_entry_stats() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.hit_miss_status = 'hit' THEN
        UPDATE cache_entries 
        SET 
            hit_count = hit_count + 1,
            last_accessed_at = NOW()
        WHERE cache_key = NEW.cache_key 
          AND cache_layer_id = NEW.cache_layer_id;
    ELSIF NEW.hit_miss_status = 'miss' THEN
        UPDATE cache_entries 
        SET miss_count = miss_count + 1
        WHERE cache_key = NEW.cache_key 
          AND cache_layer_id = NEW.cache_layer_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to aggregate performance metrics
CREATE OR REPLACE FUNCTION aggregate_performance_metrics() RETURNS TRIGGER AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_window_minutes INTEGER := 5;
BEGIN
    v_window_start := date_trunc('hour', NOW()) + 
                      (EXTRACT(minute FROM NOW())::INTEGER / v_window_minutes) * 
                      (v_window_minutes || ' minutes')::INTERVAL;
    
    INSERT INTO cache_performance_metrics (
        cache_layer_id,
        metric_timestamp,
        time_window_minutes,
        total_requests,
        cache_hits,
        cache_misses,
        avg_response_time_ms,
        total_bytes_served
    )
    SELECT 
        NEW.cache_layer_id,
        v_window_start,
        v_window_minutes,
        COUNT(*),
        COUNT(*) FILTER (WHERE hit_miss_status = 'hit'),
        COUNT(*) FILTER (WHERE hit_miss_status = 'miss'),
        AVG(response_time_ms),
        SUM(content_size_bytes)
    FROM access_patterns
    WHERE cache_layer_id = NEW.cache_layer_id
      AND access_timestamp >= v_window_start
      AND access_timestamp < v_window_start + (v_window_minutes || ' minutes')::INTERVAL
    ON CONFLICT (cache_layer_id, metric_timestamp) DO UPDATE SET
        total_requests = EXCLUDED.total_requests,
        cache_hits = EXCLUDED.cache_hits,
        cache_misses = EXCLUDED.cache_misses,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        total_bytes_served = EXCLUDED.total_bytes_served;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_cache_stats ON access_patterns;
CREATE TRIGGER trigger_update_cache_stats
    AFTER INSERT ON access_patterns
    FOR EACH ROW EXECUTE FUNCTION update_cache_entry_stats();

DROP TRIGGER IF EXISTS trigger_aggregate_metrics ON access_patterns;
CREATE TRIGGER trigger_aggregate_metrics
    AFTER INSERT ON access_patterns
    FOR EACH ROW EXECUTE FUNCTION aggregate_performance_metrics();

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update timestamp triggers
DROP TRIGGER IF EXISTS trigger_cache_layers_updated_at ON cache_layers;
CREATE TRIGGER trigger_cache_layers_updated_at
    BEFORE UPDATE ON cache_layers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_cache_entries_updated_at ON cache_entries;
CREATE TRIGGER trigger_cache_entries_updated_at
    BEFORE UPDATE ON cache_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_optimization_rules_updated_at ON cache_optimization_rules;
CREATE TRIGGER trigger_optimization_rules_updated_at
    BEFORE UPDATE ON cache_optimization_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE cache_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_optimization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_invalidation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_dependencies ENABLE ROW LEVEL SECURITY;

-- Policies for cache_layers (admin access)
CREATE POLICY "Cache layers admin access" ON cache_layers
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin')
    );

-- Policies for cache_entries (read for authenticated, write for system)
CREATE POLICY "Cache entries read access" ON cache_entries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Cache entries write access" ON cache_entries
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin', 'system')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin', 'system')
    );

-- Policies for access_patterns (system write, admin read)
CREATE POLICY "Access patterns write access" ON access_patterns
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Access patterns read access" ON access_patterns
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin')
        OR user_id = auth.uid()::UUID
    );

-- Policies for other tables (admin access)
CREATE POLICY "Optimization rules admin access" ON cache_optimization_rules
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin')
    );

CREATE POLICY "Performance metrics read access" ON cache_performance_metrics
    FOR SELECT USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin', 'viewer')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin', 'viewer')
    );

CREATE POLICY "Invalidation events admin access" ON cache_invalidation_events
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin')
    );

CREATE POLICY "Cache dependencies admin access" ON cache_dependencies
    FOR ALL USING (
        auth.jwt() ->> 'role' IN ('admin', 'cache_admin')
        OR auth.jwt() ->> 'user_role' IN ('admin', 'cache_admin')
    );

-- Create materialized view for cache analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS cache_analytics_summary AS
SELECT 
    cl.name AS cache_layer_name,
    cl.layer_type,
    COUNT(ce.id) AS total_entries,
    SUM(ce.size_bytes) AS total_size_bytes,
    AVG(ce.hit_count) AS avg_hit_count,
    COUNT(ce.id) FILTER (WHERE ce.is_valid = false) AS invalid_entries,
    calculate_cache_hit_ratio(cl.id, 1440) AS daily_hit_ratio,
    MAX(ap.access_timestamp) AS last_access,
    cl.updated_at
FROM cache_layers cl
LEFT JOIN cache_entries ce ON cl.id = ce.cache_layer_id
LEFT JOIN access_patterns ap ON cl.id = ap.cache_layer_id
WHERE cl.is_active = true
GROUP BY cl.id, cl.name, cl.layer_type, cl.updated_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_analytics_summary_name ON cache_analytics_summary(cache_layer_name);

-- Comments for documentation
COMMENT ON TABLE cache_layers IS 'Configuration and metadata for different cache layers (CDN, app, db)';
COMMENT ON TABLE cache_entries IS 'Individual cached items with metadata and statistics';
COMMENT ON TABLE access_patterns IS 'Historical access patterns for cache optimization';
COMMENT ON TABLE cache_optimization_rules IS 'Dynamic rules for cache strategy optimization';
COMMENT ON TABLE cache_performance_metrics IS 'Aggregated performance metrics by time windows';
COMMENT ON TABLE cache_invalidation_events IS 'Log of cache invalidation events and their effects';
COMMENT ON TABLE cache_dependencies IS 'Dependencies between cached items for cascading invalidation';

COMMENT ON FUNCTION calculate_cache_hit_ratio IS 'Calculates hit ratio for a cache layer over specified time window';
COMMENT ON FUNCTION get_cache_efficiency_score IS 'Returns comprehensive efficiency metrics for a cache layer';
COMMENT ON FUNCTION expire_cache_entries IS 'Automatically expires TTL-based cache entries';
```