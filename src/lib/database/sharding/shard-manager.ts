```sql
-- Database Sharding Infrastructure Migration
-- This migration creates the foundation for horizontal database sharding

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schema for sharding infrastructure
CREATE SCHEMA IF NOT EXISTS sharding;

-- Shard registry table
CREATE TABLE IF NOT EXISTS sharding.shards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_key VARCHAR(100) NOT NULL UNIQUE,
    connection_string TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'migrating')),
    weight INTEGER NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 1000),
    max_connections INTEGER NOT NULL DEFAULT 100,
    current_connections INTEGER NOT NULL DEFAULT 0,
    cpu_usage_percent DECIMAL(5,2) DEFAULT 0.00,
    memory_usage_percent DECIMAL(5,2) DEFAULT 0.00,
    disk_usage_percent DECIMAL(5,2) DEFAULT 0.00,
    read_replica_endpoints TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_health_check TIMESTAMPTZ DEFAULT NOW()
);

-- Shard routing rules table
CREATE TABLE IF NOT EXISTS sharding.shard_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    partition_column VARCHAR(100) NOT NULL,
    routing_strategy VARCHAR(50) NOT NULL DEFAULT 'hash' CHECK (routing_strategy IN ('hash', 'range', 'list', 'composite')),
    shard_count INTEGER NOT NULL DEFAULT 1,
    routing_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(table_name, partition_column)
);

-- Shard key mappings for tracking data distribution
CREATE TABLE IF NOT EXISTS sharding.shard_key_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    partition_key_hash BIGINT NOT NULL,
    shard_id UUID NOT NULL REFERENCES sharding.shards(id),
    record_count BIGINT DEFAULT 0,
    data_size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    INDEX(table_name, partition_key_hash),
    INDEX(shard_id)
);

-- Cross-shard query execution log
CREATE TABLE IF NOT EXISTS sharding.cross_shard_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id VARCHAR(100) NOT NULL UNIQUE,
    original_query TEXT NOT NULL,
    decomposed_queries JSONB NOT NULL,
    involved_shards UUID[] NOT NULL,
    execution_plan JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'timeout')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    total_duration_ms INTEGER,
    result_count BIGINT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100),
    INDEX(query_id),
    INDEX(status, start_time)
);

-- Data rebalancing operations
CREATE TABLE IF NOT EXISTS sharding.rebalancing_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('migrate', 'split', 'merge', 'redistribute')),
    source_shard_id UUID REFERENCES sharding.shards(id),
    target_shard_id UUID REFERENCES sharding.shards(id),
    table_name VARCHAR(100) NOT NULL,
    partition_key_range JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    records_migrated BIGINT DEFAULT 0,
    total_records BIGINT,
    bytes_migrated BIGINT DEFAULT 0,
    total_bytes BIGINT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    INDEX(status, created_at),
    INDEX(table_name, status)
);

-- Distributed locks for coordination
CREATE TABLE IF NOT EXISTS sharding.distributed_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lock_name VARCHAR(200) NOT NULL UNIQUE,
    lock_type VARCHAR(50) NOT NULL CHECK (lock_type IN ('exclusive', 'shared')),
    owner_id VARCHAR(100) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    INDEX(lock_name, is_active),
    INDEX(expires_at)
);

-- Shard performance metrics
CREATE TABLE IF NOT EXISTS sharding.shard_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id UUID NOT NULL REFERENCES sharding.shards(id),
    metric_type VARCHAR(50) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(20),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    INDEX(shard_id, metric_type, recorded_at),
    INDEX(recorded_at)
);

-- Query routing cache
CREATE TABLE IF NOT EXISTS sharding.routing_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL UNIQUE,
    table_name VARCHAR(100) NOT NULL,
    partition_value TEXT NOT NULL,
    shard_id UUID NOT NULL REFERENCES sharding.shards(id),
    hit_count BIGINT DEFAULT 1,
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    INDEX(cache_key),
    INDEX(expires_at),
    INDEX(table_name, partition_value)
);

-- Shard connection pool tracking
CREATE TABLE IF NOT EXISTS sharding.connection_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shard_id UUID NOT NULL REFERENCES sharding.shards(id),
    pool_type VARCHAR(20) NOT NULL CHECK (pool_type IN ('read', 'write', 'read_replica')),
    max_connections INTEGER NOT NULL,
    active_connections INTEGER NOT NULL DEFAULT 0,
    idle_connections INTEGER NOT NULL DEFAULT 0,
    waiting_connections INTEGER NOT NULL DEFAULT 0,
    pool_status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (pool_status IN ('healthy', 'warning', 'critical', 'down')),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    INDEX(shard_id, pool_type),
    INDEX(pool_status)
);

-- Transaction coordination log
CREATE TABLE IF NOT EXISTS sharding.distributed_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    coordinator_id VARCHAR(100) NOT NULL,
    involved_shards UUID[] NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'prepared', 'committed', 'aborted', 'timeout')),
    isolation_level VARCHAR(20) NOT NULL DEFAULT 'read_committed',
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prepare_time TIMESTAMPTZ,
    commit_time TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    INDEX(transaction_id),
    INDEX(status, start_time),
    INDEX(coordinator_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shards_status_weight ON sharding.shards(status, weight DESC);
CREATE INDEX IF NOT EXISTS idx_shards_health_check ON sharding.shards(last_health_check) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON sharding.shard_routing_rules(table_name, is_active);
CREATE INDEX IF NOT EXISTS idx_key_mappings_composite ON sharding.shard_key_mappings(table_name, shard_id, record_count);
CREATE INDEX IF NOT EXISTS idx_rebalancing_active ON sharding.rebalancing_operations(status, created_at) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_metrics_time_series ON sharding.shard_metrics(shard_id, metric_type, recorded_at DESC);

-- Create functions for shard management
CREATE OR REPLACE FUNCTION sharding.calculate_shard_hash(partition_value TEXT, shard_count INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN abs(hashtext(partition_value)) % shard_count;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION sharding.get_shard_for_key(
    p_table_name VARCHAR(100),
    p_partition_value TEXT
) RETURNS UUID AS $$
DECLARE
    shard_id UUID;
    routing_rule RECORD;
    shard_hash INTEGER;
BEGIN
    -- Get routing rule for table
    SELECT * INTO routing_rule 
    FROM sharding.shard_routing_rules 
    WHERE table_name = p_table_name AND is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No routing rule found for table %', p_table_name;
    END IF;
    
    -- Calculate shard hash
    shard_hash := sharding.calculate_shard_hash(p_partition_value, routing_rule.shard_count);
    
    -- Find shard mapping
    SELECT skm.shard_id INTO shard_id
    FROM sharding.shard_key_mappings skm
    WHERE skm.table_name = p_table_name 
    AND skm.partition_key_hash = shard_hash
    LIMIT 1;
    
    -- If no mapping exists, assign to least loaded active shard
    IF shard_id IS NULL THEN
        SELECT s.id INTO shard_id
        FROM sharding.shards s
        WHERE s.status = 'active'
        ORDER BY (s.current_connections::FLOAT / s.max_connections::FLOAT), s.weight DESC
        LIMIT 1;
        
        -- Create mapping
        INSERT INTO sharding.shard_key_mappings (table_name, partition_key_hash, shard_id)
        VALUES (p_table_name, shard_hash, shard_id);
    END IF;
    
    RETURN shard_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sharding.update_shard_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sharding.shards 
    SET updated_at = NOW()
    WHERE id = NEW.shard_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sharding.cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sharding.distributed_locks 
    WHERE expires_at < NOW() OR is_active = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sharding.cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sharding.routing_cache 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS tr_shard_metrics_updated ON sharding.shard_metrics;
CREATE TRIGGER tr_shard_metrics_updated
    AFTER INSERT ON sharding.shard_metrics
    FOR EACH ROW
    EXECUTE FUNCTION sharding.update_shard_metrics();

DROP TRIGGER IF EXISTS tr_shards_updated ON sharding.shards;
CREATE TRIGGER tr_shards_updated
    BEFORE UPDATE ON sharding.shards
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS tr_routing_rules_updated ON sharding.shard_routing_rules;
CREATE TRIGGER tr_routing_rules_updated
    BEFORE UPDATE ON sharding.shard_routing_rules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE sharding.shards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.shard_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.shard_key_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.cross_shard_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.rebalancing_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.distributed_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.shard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.routing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.connection_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharding.distributed_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for service role access
CREATE POLICY "Allow service role full access to shards" ON sharding.shards
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to routing rules" ON sharding.shard_routing_rules
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to key mappings" ON sharding.shard_key_mappings
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to cross shard queries" ON sharding.cross_shard_queries
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to rebalancing ops" ON sharding.rebalancing_operations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to distributed locks" ON sharding.distributed_locks
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to shard metrics" ON sharding.shard_metrics
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to routing cache" ON sharding.routing_cache
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to connection pools" ON sharding.connection_pools
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to distributed transactions" ON sharding.distributed_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Insert default shard configuration
INSERT INTO sharding.shards (shard_key, connection_string, status, weight, max_connections) 
VALUES ('primary', 'postgresql://localhost:5432/primary', 'active', 1000, 100)
ON CONFLICT (shard_key) DO NOTHING;

-- Create maintenance procedures
CREATE OR REPLACE FUNCTION sharding.maintenance_cleanup()
RETURNS TABLE(
    locks_cleaned INTEGER,
    cache_cleaned INTEGER,
    old_queries_cleaned INTEGER
) AS $$
DECLARE
    locks_count INTEGER;
    cache_count INTEGER;
    queries_count INTEGER;
BEGIN
    -- Clean expired locks
    SELECT sharding.cleanup_expired_locks() INTO locks_count;
    
    -- Clean expired cache entries
    SELECT sharding.cleanup_expired_cache() INTO cache_count;
    
    -- Clean old completed queries (older than 7 days)
    DELETE FROM sharding.cross_shard_queries 
    WHERE status IN ('completed', 'failed') 
    AND created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS queries_count = ROW_COUNT;
    
    RETURN QUERY SELECT locks_count, cache_count, queries_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA sharding TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sharding TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sharding TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sharding TO service_role;

-- Create view for shard health monitoring
CREATE OR REPLACE VIEW sharding.shard_health_summary AS
SELECT 
    s.id,
    s.shard_key,
    s.status,
    s.weight,
    s.current_connections,
    s.max_connections,
    ROUND((s.current_connections::NUMERIC / s.max_connections::NUMERIC) * 100, 2) as connection_usage_percent,
    s.cpu_usage_percent,
    s.memory_usage_percent,
    s.disk_usage_percent,
    COUNT(skm.id) as managed_partitions,
    SUM(skm.record_count) as total_records,
    SUM(skm.data_size_bytes) as total_data_bytes,
    s.last_health_check,
    CASE 
        WHEN s.last_health_check < NOW() - INTERVAL '5 minutes' THEN 'stale'
        WHEN s.cpu_usage_percent > 80 OR s.memory_usage_percent > 80 THEN 'warning'
        WHEN s.status != 'active' THEN 'inactive'
        ELSE 'healthy'
    END as health_status
FROM sharding.shards s
LEFT JOIN sharding.shard_key_mappings skm ON s.id = skm.shard_id
GROUP BY s.id, s.shard_key, s.status, s.weight, s.current_connections, 
         s.max_connections, s.cpu_usage_percent, s.memory_usage_percent, 
         s.disk_usage_percent, s.last_health_check;

COMMENT ON SCHEMA sharding IS 'Database sharding infrastructure for horizontal scaling';
COMMENT ON TABLE sharding.shards IS 'Registry of database shards with connection and health information';
COMMENT ON TABLE sharding.shard_routing_rules IS 'Configuration for routing data to appropriate shards';
COMMENT ON TABLE sharding.shard_key_mappings IS 'Mapping of partition keys to specific shards';
COMMENT ON TABLE sharding.cross_shard_queries IS 'Log of distributed queries across multiple shards';
COMMENT ON TABLE sharding.rebalancing_operations IS 'Tracking of data rebalancing and migration operations';
COMMENT ON TABLE sharding.distributed_locks IS 'Distributed locking for cross-shard coordination';
COMMENT ON FUNCTION sharding.get_shard_for_key IS 'Determines appropriate shard for a given partition key';
COMMENT ON VIEW sharding.shard_health_summary IS 'Consolidated health and performance metrics for all shards';
```