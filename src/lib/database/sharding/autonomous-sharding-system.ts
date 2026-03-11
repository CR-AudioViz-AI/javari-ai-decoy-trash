```sql
-- Autonomous Database Sharding System Migration
-- Comprehensive sharding infrastructure for multi-instance Supabase deployments

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- SHARD REGISTRY TABLES
-- =============================================

-- Main shard registry storing all shard instances
CREATE TABLE IF NOT EXISTS shard_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id TEXT NOT NULL UNIQUE,
    shard_name TEXT NOT NULL,
    connection_string TEXT NOT NULL,
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    supabase_service_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'failed')),
    health_score DECIMAL(3,2) DEFAULT 1.0 CHECK (health_score >= 0 AND health_score <= 1),
    cpu_usage DECIMAL(5,2) DEFAULT 0,
    memory_usage DECIMAL(5,2) DEFAULT 0,
    connection_count INTEGER DEFAULT 0,
    query_latency_ms DECIMAL(10,2) DEFAULT 0,
    throughput_qps INTEGER DEFAULT 0,
    storage_used_gb DECIMAL(10,2) DEFAULT 0,
    storage_limit_gb DECIMAL(10,2) DEFAULT 100,
    region TEXT NOT NULL DEFAULT 'us-east-1',
    availability_zone TEXT,
    is_primary BOOLEAN DEFAULT false,
    weight INTEGER DEFAULT 100 CHECK (weight > 0),
    max_connections INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_health_check TIMESTAMPTZ DEFAULT NOW()
);

-- Shard partitions mapping data ranges to shards
CREATE TABLE IF NOT EXISTS shard_partitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id TEXT NOT NULL REFERENCES shard_registry(shard_id) ON DELETE CASCADE,
    partition_key TEXT NOT NULL,
    hash_start BIGINT NOT NULL,
    hash_end BIGINT NOT NULL,
    table_name TEXT NOT NULL,
    row_count BIGINT DEFAULT 0,
    size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(partition_key, hash_start, hash_end, table_name)
);

-- Shard routing rules for query distribution
CREATE TABLE IF NOT EXISTS shard_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name TEXT NOT NULL UNIQUE,
    table_pattern TEXT NOT NULL,
    sharding_key TEXT NOT NULL,
    sharding_strategy TEXT NOT NULL DEFAULT 'consistent_hash' CHECK (
        sharding_strategy IN ('consistent_hash', 'range', 'directory', 'geographic')
    ),
    routing_function TEXT,
    priority INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LOAD BALANCING & HEALTH MONITORING
-- =============================================

-- Shard health metrics history
CREATE TABLE IF NOT EXISTS shard_health_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id TEXT NOT NULL REFERENCES shard_registry(shard_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    cpu_usage DECIMAL(5,2) NOT NULL,
    memory_usage DECIMAL(5,2) NOT NULL,
    disk_usage DECIMAL(5,2) NOT NULL,
    connection_count INTEGER NOT NULL,
    active_queries INTEGER NOT NULL,
    query_latency_p50 DECIMAL(10,2),
    query_latency_p95 DECIMAL(10,2),
    query_latency_p99 DECIMAL(10,2),
    throughput_qps INTEGER NOT NULL,
    error_rate DECIMAL(5,2) DEFAULT 0,
    availability_score DECIMAL(3,2) DEFAULT 1.0
);

-- Query routing logs for performance analysis
CREATE TABLE IF NOT EXISTS query_routing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT NOT NULL,
    session_id TEXT,
    query_hash TEXT NOT NULL,
    table_name TEXT,
    sharding_key_value TEXT,
    source_shard_id TEXT REFERENCES shard_registry(shard_id),
    target_shard_id TEXT REFERENCES shard_registry(shard_id),
    routing_strategy TEXT NOT NULL,
    query_type TEXT NOT NULL CHECK (query_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRANSACTION')),
    execution_time_ms DECIMAL(10,2),
    row_count INTEGER,
    cache_hit BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- DATA MIGRATION & REBALANCING
-- =============================================

-- Shard rebalancing operations
CREATE TABLE IF NOT EXISTS shard_rebalancing_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL CHECK (
        operation_type IN ('split_shard', 'merge_shards', 'move_partition', 'add_shard', 'remove_shard')
    ),
    source_shard_id TEXT REFERENCES shard_registry(shard_id),
    target_shard_id TEXT REFERENCES shard_registry(shard_id),
    affected_tables TEXT[] NOT NULL,
    partition_range_start BIGINT,
    partition_range_end BIGINT,
    estimated_rows BIGINT,
    estimated_size_gb DECIMAL(10,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'in_progress', 'paused', 'completed', 'failed', 'cancelled')
    ),
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    migration_strategy JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data migration jobs for background processing
CREATE TABLE IF NOT EXISTS data_migration_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id TEXT NOT NULL UNIQUE,
    rebalancing_operation_id UUID REFERENCES shard_rebalancing_operations(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    source_shard_id TEXT NOT NULL REFERENCES shard_registry(shard_id),
    target_shard_id TEXT NOT NULL REFERENCES shard_registry(shard_id),
    batch_size INTEGER DEFAULT 1000,
    current_offset BIGINT DEFAULT 0,
    total_rows BIGINT,
    migrated_rows BIGINT DEFAULT 0,
    failed_rows BIGINT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'running', 'paused', 'completed', 'failed')
    ),
    priority INTEGER DEFAULT 1000,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONNECTION POOLING & CACHING
-- =============================================

-- Connection pool statistics
CREATE TABLE IF NOT EXISTS connection_pool_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id TEXT NOT NULL REFERENCES shard_registry(shard_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    total_connections INTEGER NOT NULL,
    active_connections INTEGER NOT NULL,
    idle_connections INTEGER NOT NULL,
    waiting_connections INTEGER NOT NULL,
    connection_errors INTEGER DEFAULT 0,
    avg_checkout_time_ms DECIMAL(10,2),
    avg_connection_lifetime_ms DECIMAL(10,2)
);

-- Query result cache for frequently accessed data
CREATE TABLE IF NOT EXISTS query_result_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key TEXT NOT NULL UNIQUE,
    query_hash TEXT NOT NULL,
    shard_id TEXT REFERENCES shard_registry(shard_id),
    result_data JSONB NOT NULL,
    result_count INTEGER,
    ttl_seconds INTEGER DEFAULT 300,
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes',
    last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYSTEM CONFIGURATION
-- =============================================

-- Sharding system configuration
CREATE TABLE IF NOT EXISTS sharding_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key TEXT NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO sharding_config (config_key, config_value, description) VALUES
('auto_rebalancing', '{"enabled": true, "trigger_threshold": 0.8, "check_interval_minutes": 15}', 'Automatic rebalancing settings'),
('health_monitoring', '{"enabled": true, "check_interval_seconds": 30, "failure_threshold": 3}', 'Health monitoring configuration'),
('connection_pooling', '{"min_connections": 5, "max_connections": 50, "idle_timeout_ms": 30000}', 'Connection pool settings'),
('query_caching', '{"enabled": true, "default_ttl_seconds": 300, "max_cache_size_mb": 100}', 'Query result caching'),
('consistent_hashing', '{"virtual_nodes": 150, "replication_factor": 3}', 'Consistent hashing parameters')
ON CONFLICT (config_key) DO NOTHING;

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Shard registry indexes
CREATE INDEX IF NOT EXISTS idx_shard_registry_status ON shard_registry(status);
CREATE INDEX IF NOT EXISTS idx_shard_registry_region ON shard_registry(region);
CREATE INDEX IF NOT EXISTS idx_shard_registry_health ON shard_registry(health_score DESC);
CREATE INDEX IF NOT EXISTS idx_shard_registry_updated ON shard_registry(updated_at DESC);

-- Shard partitions indexes
CREATE INDEX IF NOT EXISTS idx_shard_partitions_shard_id ON shard_partitions(shard_id);
CREATE INDEX IF NOT EXISTS idx_shard_partitions_table ON shard_partitions(table_name);
CREATE INDEX IF NOT EXISTS idx_shard_partitions_hash_range ON shard_partitions(hash_start, hash_end);
CREATE INDEX IF NOT EXISTS idx_shard_partitions_key ON shard_partitions(partition_key);

-- Health metrics indexes
CREATE INDEX IF NOT EXISTS idx_health_metrics_shard_time ON shard_health_metrics(shard_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_timestamp ON shard_health_metrics(timestamp DESC);

-- Query routing logs indexes
CREATE INDEX IF NOT EXISTS idx_routing_logs_request ON query_routing_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_shard_time ON query_routing_logs(target_shard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_logs_table ON query_routing_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_routing_logs_query_hash ON query_routing_logs(query_hash);

-- Rebalancing operations indexes
CREATE INDEX IF NOT EXISTS idx_rebalancing_status ON shard_rebalancing_operations(status);
CREATE INDEX IF NOT EXISTS idx_rebalancing_created ON shard_rebalancing_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rebalancing_source_shard ON shard_rebalancing_operations(source_shard_id);

-- Migration jobs indexes
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON data_migration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_priority ON data_migration_jobs(priority ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_rebalancing ON data_migration_jobs(rebalancing_operation_id);

-- Cache indexes
CREATE INDEX IF NOT EXISTS idx_query_cache_key ON query_result_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_result_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_query_cache_shard ON query_result_cache(shard_id);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_shard_registry_updated_at 
    BEFORE UPDATE ON shard_registry 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shard_partitions_updated_at 
    BEFORE UPDATE ON shard_partitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routing_rules_updated_at 
    BEFORE UPDATE ON shard_routing_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rebalancing_operations_updated_at 
    BEFORE UPDATE ON shard_rebalancing_operations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_migration_jobs_updated_at 
    BEFORE UPDATE ON data_migration_jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sharding_config_updated_at 
    BEFORE UPDATE ON sharding_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS POLICIES FOR SECURITY
-- =============================================

-- Enable RLS on sensitive tables
ALTER TABLE shard_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE shard_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding_config ENABLE ROW LEVEL SECURITY;

-- Admin access policies
CREATE POLICY "Admin full access to shard_registry" ON shard_registry
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access to routing_rules" ON shard_routing_rules
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access to sharding_config" ON sharding_config
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Service access policies for system operations
CREATE POLICY "Service read access to shard_registry" ON shard_registry
    FOR SELECT USING (auth.jwt() ->> 'role' IN ('service', 'admin'));

CREATE POLICY "Service read access to routing_rules" ON shard_routing_rules
    FOR SELECT USING (auth.jwt() ->> 'role' IN ('service', 'admin'));

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

-- Function to calculate consistent hash
CREATE OR REPLACE FUNCTION calculate_consistent_hash(input_value TEXT)
RETURNS BIGINT AS $$
BEGIN
    RETURN ('x' || substr(md5(input_value), 1, 15))::bit(60)::BIGINT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get shard for hash value
CREATE OR REPLACE FUNCTION get_shard_for_hash(hash_value BIGINT, table_name TEXT)
RETURNS TEXT AS $$
DECLARE
    shard_result TEXT;
BEGIN
    SELECT shard_id INTO shard_result
    FROM shard_partitions 
    WHERE table_name = get_shard_for_hash.table_name
    AND hash_value >= hash_start 
    AND hash_value <= hash_end
    LIMIT 1;
    
    RETURN COALESCE(shard_result, 'default');
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to update shard health score
CREATE OR REPLACE FUNCTION update_shard_health_score(
    input_shard_id TEXT,
    cpu DECIMAL,
    memory DECIMAL,
    latency DECIMAL,
    error_rate DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    health_score DECIMAL;
BEGIN
    -- Calculate weighted health score
    health_score := GREATEST(0, 
        1.0 - 
        (cpu / 100 * 0.3) - 
        (memory / 100 * 0.3) - 
        (LEAST(latency, 1000) / 1000 * 0.2) - 
        (error_rate * 0.2)
    );
    
    UPDATE shard_registry 
    SET health_score = update_shard_health_score.health_score,
        cpu_usage = cpu,
        memory_usage = memory,
        query_latency_ms = latency,
        last_health_check = NOW()
    WHERE shard_id = input_shard_id;
    
    RETURN health_score;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- PARTITIONING FOR SCALABILITY
-- =============================================

-- Partition health metrics by month
CREATE TABLE IF NOT EXISTS shard_health_metrics_template (
    LIKE shard_health_metrics INCLUDING ALL
);

-- Create monthly partitions function
CREATE OR REPLACE FUNCTION create_monthly_health_partition(partition_date DATE)
RETURNS VOID AS $$
DECLARE
    table_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    table_name := 'shard_health_metrics_' || to_char(partition_date, 'YYYY_MM');
    start_date := date_trunc('month', partition_date);
    end_date := start_date + interval '1 month';
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF shard_health_metrics 
         FOR VALUES FROM (%L) TO (%L)',
        table_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- CLEANUP AND MAINTENANCE
-- =============================================

-- Function to cleanup old metrics
CREATE OR REPLACE FUNCTION cleanup_old_metrics(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM shard_health_metrics 
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old routing logs
CREATE OR REPLACE FUNCTION cleanup_old_routing_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM query_routing_logs 
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM query_result_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE shard_registry IS 'Registry of all database shards with health and connection information';
COMMENT ON TABLE shard_partitions IS 'Mapping of data partitions to shards using consistent hashing';
COMMENT ON TABLE shard_routing_rules IS 'Rules for determining how queries are routed to shards';
COMMENT ON TABLE shard_health_metrics IS 'Historical health metrics for all shards';
COMMENT ON TABLE query_routing_logs IS 'Audit log of all query routing decisions';
COMMENT ON TABLE shard_rebalancing_operations IS 'Track shard rebalancing operations';
COMMENT ON TABLE data_migration_jobs IS 'Background jobs for data migration during rebalancing';
COMMENT ON TABLE connection_pool_stats IS 'Connection pool statistics per shard';
COMMENT ON TABLE query_result_cache IS 'Cache for frequently accessed query results';
COMMENT ON TABLE sharding_config IS 'System-wide sharding configuration parameters';

COMMENT ON FUNCTION calculate_consistent_hash IS 'Calculate consistent hash value for sharding key';
COMMENT ON FUNCTION get_shard_for_hash IS 'Determine target shard for given hash value';
COMMENT ON FUNCTION update_shard_health_score IS 'Update shard health score based on metrics';
COMMENT ON FUNCTION cleanup_old_metrics IS 'Remove old health metrics beyond retention period';
COMMENT ON FUNCTION cleanup_old_routing_logs IS 'Remove old routing logs beyond retention period';
COMMENT ON FUNCTION cleanup_expired_cache IS 'Remove expired cache entries';
```