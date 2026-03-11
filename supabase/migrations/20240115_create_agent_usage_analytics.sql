```sql
-- Agent Usage Analytics Service Database Migration
-- Created: 2024-01-15
-- Description: Comprehensive agent usage analytics tracking with real-time metrics aggregation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create enum types for usage analytics
CREATE TYPE IF NOT EXISTS agent_event_type AS ENUM (
    'execution_start',
    'execution_complete',
    'execution_error',
    'execution_timeout',
    'user_interaction',
    'agent_install',
    'agent_uninstall',
    'subscription_change'
);

CREATE TYPE IF NOT EXISTS interaction_type AS ENUM (
    'view',
    'click',
    'download',
    'share',
    'rate',
    'review',
    'bookmark'
);

CREATE TYPE IF NOT EXISTS performance_grade AS ENUM (
    'A+', 'A', 'A-',
    'B+', 'B', 'B-',
    'C+', 'C', 'C-',
    'D', 'F'
);

-- Create agent usage events table (time-series partitioned)
CREATE TABLE IF NOT EXISTS agent_usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    user_id UUID NOT NULL,
    event_type agent_event_type NOT NULL,
    session_id UUID,
    execution_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    duration_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
) PARTITION BY RANGE (timestamp);

-- Create partitions for agent_usage_events (current and next month)
CREATE TABLE IF NOT EXISTS agent_usage_events_2024_01 
PARTITION OF agent_usage_events 
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS agent_usage_events_2024_02 
PARTITION OF agent_usage_events 
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS agent_usage_events_2024_03 
PARTITION OF agent_usage_events 
FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Create agent execution metrics table
CREATE TABLE IF NOT EXISTS agent_execution_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    execution_id UUID UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    memory_usage_mb DECIMAL(10,2),
    cpu_usage_percent DECIMAL(5,2),
    tokens_consumed INTEGER DEFAULT 0,
    api_calls_made INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 1.0,
    error_count INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    input_size_bytes INTEGER,
    output_size_bytes INTEGER,
    cost_credits DECIMAL(10,6) DEFAULT 0.0,
    performance_score DECIMAL(5,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create user interaction analytics table
CREATE TABLE IF NOT EXISTS user_interaction_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    user_id UUID NOT NULL,
    interaction_type interaction_type NOT NULL,
    session_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    page_url TEXT,
    referrer_url TEXT,
    interaction_data JSONB DEFAULT '{}',
    device_type TEXT,
    browser_info TEXT,
    location_data JSONB DEFAULT '{}',
    engagement_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create agent performance aggregates table
CREATE TABLE IF NOT EXISTS agent_performance_aggregates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    aggregation_level TEXT NOT NULL CHECK (aggregation_level IN ('hour', 'day', 'week', 'month')),
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    avg_duration_ms DECIMAL(10,2),
    median_duration_ms DECIMAL(10,2),
    p95_duration_ms DECIMAL(10,2),
    total_tokens_consumed BIGINT DEFAULT 0,
    total_api_calls BIGINT DEFAULT 0,
    avg_memory_usage_mb DECIMAL(10,2),
    avg_cpu_usage_percent DECIMAL(5,2),
    total_cost_credits DECIMAL(12,6) DEFAULT 0.0,
    unique_users INTEGER DEFAULT 0,
    total_interactions INTEGER DEFAULT 0,
    avg_performance_score DECIMAL(5,2),
    performance_grade performance_grade,
    error_rate DECIMAL(5,4) DEFAULT 0.0,
    reliability_score DECIMAL(5,2) DEFAULT 100.0,
    user_satisfaction_score DECIMAL(5,2),
    recommendation_score DECIMAL(5,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(agent_id, period_start, aggregation_level)
);

-- Create usage pricing insights table
CREATE TABLE IF NOT EXISTS usage_pricing_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    current_price_credits DECIMAL(10,6),
    suggested_price_credits DECIMAL(10,6),
    price_elasticity DECIMAL(8,4),
    demand_score DECIMAL(5,2),
    competition_index DECIMAL(5,2),
    value_perception_score DECIMAL(5,2),
    optimal_pricing_tier TEXT,
    revenue_potential DECIMAL(12,2),
    market_position TEXT CHECK (market_position IN ('premium', 'standard', 'budget', 'freemium')),
    pricing_confidence DECIMAL(5,2),
    recommendations JSONB DEFAULT '{}',
    market_analysis JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(agent_id, period_start)
);

-- Create user behavior patterns table
CREATE TABLE IF NOT EXISTS user_behavior_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    agent_id UUID,
    behavior_type TEXT NOT NULL,
    pattern_data JSONB NOT NULL DEFAULT '{}',
    frequency_score DECIMAL(5,2),
    engagement_level TEXT CHECK (engagement_level IN ('high', 'medium', 'low')),
    usage_trends JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    predicted_churn_risk DECIMAL(5,4) DEFAULT 0.0,
    lifetime_value DECIMAL(10,2),
    segment_tags TEXT[] DEFAULT '{}',
    last_activity TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create real-time metrics cache table
CREATE TABLE IF NOT EXISTS real_time_metrics_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('agent', 'user', 'global')),
    metric_value DECIMAL(15,6),
    metric_data JSONB DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(metric_type, entity_id, entity_type)
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_agent_id ON agent_usage_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_user_id ON agent_usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_timestamp ON agent_usage_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_event_type ON agent_usage_events (event_type);
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_session ON agent_usage_events (session_id);
CREATE INDEX IF NOT EXISTS idx_agent_usage_events_metadata ON agent_usage_events USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_agent_execution_metrics_agent_id ON agent_execution_metrics (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_metrics_user_id ON agent_execution_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_metrics_started_at ON agent_execution_metrics (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_execution_metrics_duration ON agent_execution_metrics (duration_ms);
CREATE INDEX IF NOT EXISTS idx_agent_execution_metrics_performance ON agent_execution_metrics (performance_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_interaction_analytics_agent_id ON user_interaction_analytics (agent_id);
CREATE INDEX IF NOT EXISTS idx_user_interaction_analytics_user_id ON user_interaction_analytics (user_id);
CREATE INDEX IF NOT EXISTS idx_user_interaction_analytics_timestamp ON user_interaction_analytics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_interaction_analytics_type ON user_interaction_analytics (interaction_type);

CREATE INDEX IF NOT EXISTS idx_agent_performance_aggregates_agent_id ON agent_performance_aggregates (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_aggregates_period ON agent_performance_aggregates (period_start DESC, aggregation_level);
CREATE INDEX IF NOT EXISTS idx_agent_performance_aggregates_performance ON agent_performance_aggregates (performance_grade, recommendation_score DESC);

CREATE INDEX IF NOT EXISTS idx_usage_pricing_insights_agent_id ON usage_pricing_insights (agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_pricing_insights_period ON usage_pricing_insights (period_start DESC);
CREATE INDEX IF NOT EXISTS idx_usage_pricing_insights_demand ON usage_pricing_insights (demand_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_behavior_patterns_user_id ON user_behavior_patterns (user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_patterns_agent_id ON user_behavior_patterns (agent_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_patterns_behavior ON user_behavior_patterns (behavior_type);
CREATE INDEX IF NOT EXISTS idx_user_behavior_patterns_engagement ON user_behavior_patterns (engagement_level);

CREATE INDEX IF NOT EXISTS idx_real_time_metrics_cache_type_entity ON real_time_metrics_cache (metric_type, entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_real_time_metrics_cache_updated ON real_time_metrics_cache (last_updated DESC);

-- Create materialized views for common aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_agent_metrics AS
SELECT 
    agent_id,
    DATE(timestamp) as date,
    COUNT(*) as total_events,
    COUNT(CASE WHEN event_type = 'execution_complete' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN event_type = 'execution_error' THEN 1 END) as failed_executions,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(duration_ms) as avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms
FROM agent_usage_events
WHERE event_type IN ('execution_complete', 'execution_error')
GROUP BY agent_id, DATE(timestamp);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_agent_metrics_unique ON daily_agent_metrics (agent_id, date);

-- Create trigger functions for real-time updates
CREATE OR REPLACE FUNCTION update_real_time_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update agent execution count
    INSERT INTO real_time_metrics_cache (
        metric_type, entity_id, entity_type, metric_value, last_updated
    ) VALUES (
        'execution_count', NEW.agent_id, 'agent', 1, NOW()
    ) ON CONFLICT (metric_type, entity_id, entity_type)
    DO UPDATE SET 
        metric_value = real_time_metrics_cache.metric_value + 1,
        last_updated = NOW();
    
    -- Update user activity count
    INSERT INTO real_time_metrics_cache (
        metric_type, entity_id, entity_type, metric_value, last_updated
    ) VALUES (
        'activity_count', NEW.user_id, 'user', 1, NOW()
    ) ON CONFLICT (metric_type, entity_id, entity_type)
    DO UPDATE SET 
        metric_value = real_time_metrics_cache.metric_value + 1,
        last_updated = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_agent_performance_score()
RETURNS TRIGGER AS $$
DECLARE
    success_rate DECIMAL(5,4);
    avg_duration DECIMAL(10,2);
    performance_score DECIMAL(5,2);
BEGIN
    -- Calculate performance metrics for the agent
    SELECT 
        COALESCE(
            COUNT(CASE WHEN event_type = 'execution_complete' THEN 1 END)::DECIMAL / 
            NULLIF(COUNT(CASE WHEN event_type IN ('execution_complete', 'execution_error') THEN 1 END), 0),
            0
        ),
        AVG(duration_ms)
    INTO success_rate, avg_duration
    FROM agent_usage_events
    WHERE agent_id = NEW.agent_id 
    AND timestamp >= NOW() - INTERVAL '1 hour';
    
    -- Calculate performance score (0-100 scale)
    performance_score := LEAST(100, 
        (success_rate * 50) + 
        (CASE 
            WHEN avg_duration <= 1000 THEN 50
            WHEN avg_duration <= 5000 THEN 40
            WHEN avg_duration <= 10000 THEN 30
            ELSE 20
        END)
    );
    
    -- Update real-time cache
    INSERT INTO real_time_metrics_cache (
        metric_type, entity_id, entity_type, metric_value, last_updated
    ) VALUES (
        'performance_score', NEW.agent_id, 'agent', performance_score, NOW()
    ) ON CONFLICT (metric_type, entity_id, entity_type)
    DO UPDATE SET 
        metric_value = performance_score,
        last_updated = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_real_time_metrics
    AFTER INSERT ON agent_usage_events
    FOR EACH ROW EXECUTE FUNCTION update_real_time_metrics();

CREATE TRIGGER trigger_update_agent_performance
    AFTER INSERT ON agent_usage_events
    FOR EACH ROW EXECUTE FUNCTION update_agent_performance_score();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trigger_agent_execution_metrics_updated_at
    BEFORE UPDATE ON agent_execution_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_agent_performance_aggregates_updated_at
    BEFORE UPDATE ON agent_performance_aggregates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_usage_pricing_insights_updated_at
    BEFORE UPDATE ON usage_pricing_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_user_behavior_patterns_updated_at
    BEFORE UPDATE ON user_behavior_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE agent_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_execution_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interaction_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_performance_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_pricing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_time_metrics_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for agent_usage_events
CREATE POLICY "Users can insert their own usage events" ON agent_usage_events
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own usage events" ON agent_usage_events
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to usage events" ON agent_usage_events
    FOR ALL TO service_role USING (true);

-- Create RLS policies for agent_execution_metrics
CREATE POLICY "Users can view their own execution metrics" ON agent_execution_metrics
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to execution metrics" ON agent_execution_metrics
    FOR ALL TO service_role USING (true);

-- Create RLS policies for user_interaction_analytics
CREATE POLICY "Users can insert their own interaction data" ON user_interaction_analytics
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own interaction data" ON user_interaction_analytics
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to interaction analytics" ON user_interaction_analytics
    FOR ALL TO service_role USING (true);

-- Create RLS policies for agent_performance_aggregates
CREATE POLICY "Anyone can view performance aggregates" ON agent_performance_aggregates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role has full access to performance aggregates" ON agent_performance_aggregates
    FOR ALL TO service_role USING (true);

-- Create RLS policies for usage_pricing_insights
CREATE POLICY "Service role has full access to pricing insights" ON usage_pricing_insights
    FOR ALL TO service_role USING (true);

-- Create RLS policies for user_behavior_patterns
CREATE POLICY "Users can view their own behavior patterns" ON user_behavior_patterns
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to behavior patterns" ON user_behavior_patterns
    FOR ALL TO service_role USING (true);

-- Create RLS policies for real_time_metrics_cache
CREATE POLICY "Anyone can view real-time metrics" ON real_time_metrics_cache
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role has full access to metrics cache" ON real_time_metrics_cache
    FOR ALL TO service_role USING (true);

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_agent_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for cleanup of old partitions and expired cache
CREATE OR REPLACE FUNCTION cleanup_analytics_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired cache entries
    DELETE FROM real_time_metrics_cache 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    -- Clean up old usage events (keep 90 days)
    DELETE FROM agent_usage_events 
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Clean up old interaction data (keep 180 days)
    DELETE FROM user_interaction_analytics 
    WHERE timestamp < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT ON agent_usage_events TO authenticated;
GRANT SELECT ON agent_execution_metrics TO authenticated;
GRANT SELECT, INSERT ON user_interaction_analytics TO authenticated;
GRANT SELECT ON agent_performance_aggregates TO authenticated;
GRANT SELECT ON user_behavior_patterns TO authenticated;
GRANT SELECT ON real_time_metrics_cache TO authenticated;

-- Create comment documentation
COMMENT ON TABLE agent_usage_events IS 'Time-series event tracking for all agent interactions and executions';
COMMENT ON TABLE agent_execution_metrics IS 'Detailed metrics for individual agent execution sessions';
COMMENT ON TABLE user_interaction_analytics IS 'User interaction patterns and engagement metrics';
COMMENT ON TABLE agent_performance_aggregates IS 'Pre-computed performance metrics aggregated by time periods';
COMMENT ON TABLE usage_pricing_insights IS 'AI-driven pricing optimization recommendations based on usage patterns';
COMMENT ON TABLE user_behavior_patterns IS 'Machine learning insights into user behavior and preferences';
COMMENT ON TABLE real_time_metrics_cache IS 'High-frequency metrics cache for real-time dashboard updates';
```