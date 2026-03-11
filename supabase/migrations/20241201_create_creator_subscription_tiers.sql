```sql
-- Migration: Create Creator Subscription Tier Management System
-- Created: 2024-12-01
-- Description: Comprehensive schema for creator subscription tiers with automated billing and analytics

BEGIN;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscription tiers configuration
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('weekly', 'monthly', 'yearly')),
    trial_days INTEGER DEFAULT 0 CHECK (trial_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    max_subscribers INTEGER CHECK (max_subscribers > 0),
    stripe_price_id VARCHAR(255),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(creator_id, name),
    UNIQUE(creator_id, position)
);

-- Feature definitions for subscription tiers
CREATE TABLE IF NOT EXISTS subscription_tier_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    feature_value TEXT, -- JSON string for complex values
    feature_limit INTEGER, -- For numeric limits (posts per month, etc.)
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tier_id, feature_name)
);

-- Active creator subscriptions
CREATE TABLE IF NOT EXISTS creator_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscriber_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE RESTRICT,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (
        status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
    ),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    trial_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(subscriber_id, creator_id)
);

-- Tier migration tracking for upgrades/downgrades
CREATE TABLE IF NOT EXISTS tier_migrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES creator_subscriptions(id) ON DELETE CASCADE,
    from_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL,
    to_tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE RESTRICT,
    migration_type VARCHAR(20) NOT NULL CHECK (migration_type IN ('upgrade', 'downgrade', 'lateral')),
    proration_amount_cents INTEGER DEFAULT 0,
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reason TEXT,
    stripe_invoice_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing cycle management
CREATE TABLE IF NOT EXISTS billing_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES creator_subscriptions(id) ON DELETE CASCADE,
    cycle_start TIMESTAMP WITH TIME ZONE NOT NULL,
    cycle_end TIMESTAMP WITH TIME ZONE NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'paid', 'failed', 'refunded')
    ),
    stripe_invoice_id VARCHAR(255),
    paid_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pricing history for tier changes
CREATE TABLE IF NOT EXISTS tier_pricing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE CASCADE,
    old_price_cents INTEGER,
    new_price_cents INTEGER NOT NULL,
    change_reason VARCHAR(100),
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription analytics for creator dashboard
CREATE TABLE IF NOT EXISTS subscription_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    tier_id UUID REFERENCES subscription_tiers(id) ON DELETE CASCADE,
    
    -- Subscription metrics
    new_subscriptions INTEGER DEFAULT 0,
    canceled_subscriptions INTEGER DEFAULT 0,
    active_subscriptions INTEGER DEFAULT 0,
    trial_subscriptions INTEGER DEFAULT 0,
    
    -- Revenue metrics
    gross_revenue_cents INTEGER DEFAULT 0,
    net_revenue_cents INTEGER DEFAULT 0,
    refunded_amount_cents INTEGER DEFAULT 0,
    
    -- Engagement metrics
    churn_rate DECIMAL(5,4) DEFAULT 0,
    upgrade_count INTEGER DEFAULT 0,
    downgrade_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(creator_id, date, tier_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_creator_active ON subscription_tiers(creator_id, is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_position ON subscription_tiers(creator_id, position);
CREATE INDEX IF NOT EXISTS idx_tier_features_tier ON subscription_tier_features(tier_id);
CREATE INDEX IF NOT EXISTS idx_creator_subscriptions_subscriber ON creator_subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_creator_subscriptions_creator ON creator_subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subscriptions_status ON creator_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_creator_subscriptions_period_end ON creator_subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_tier_migrations_subscription ON tier_migrations(subscription_id);
CREATE INDEX IF NOT EXISTS idx_tier_migrations_date ON tier_migrations(effective_date);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_subscription ON billing_cycles(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_status ON billing_cycles(status);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_cycle_end ON billing_cycles(cycle_end);
CREATE INDEX IF NOT EXISTS idx_tier_pricing_history_tier ON tier_pricing_history(tier_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_subscription_analytics_creator_date ON subscription_analytics(creator_id, date);

-- Enable Row Level Security
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tier_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_tiers
CREATE POLICY "Creators can manage their own subscription tiers" ON subscription_tiers
    FOR ALL USING (auth.uid() = creator_id);

CREATE POLICY "Public can view active subscription tiers" ON subscription_tiers
    FOR SELECT USING (is_active = true);

-- RLS Policies for subscription_tier_features
CREATE POLICY "Features follow tier access" ON subscription_tier_features
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM subscription_tiers st 
            WHERE st.id = tier_id AND st.creator_id = auth.uid()
        )
    );

CREATE POLICY "Public can view active tier features" ON subscription_tier_features
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM subscription_tiers st 
            WHERE st.id = tier_id AND st.is_active = true
        )
    );

-- RLS Policies for creator_subscriptions
CREATE POLICY "Users can view their own subscriptions" ON creator_subscriptions
    FOR SELECT USING (auth.uid() = subscriber_id);

CREATE POLICY "Creators can view their subscribers" ON creator_subscriptions
    FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "System can manage subscriptions" ON creator_subscriptions
    FOR ALL USING (
        auth.uid() = subscriber_id OR 
        auth.uid() = creator_id OR
        auth.jwt()->>'role' = 'service_role'
    );

-- RLS Policies for tier_migrations
CREATE POLICY "Users can view their migration history" ON tier_migrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM creator_subscriptions cs 
            WHERE cs.id = subscription_id AND cs.subscriber_id = auth.uid()
        )
    );

CREATE POLICY "Creators can view subscriber migrations" ON tier_migrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM creator_subscriptions cs 
            WHERE cs.id = subscription_id AND cs.creator_id = auth.uid()
        )
    );

-- RLS Policies for billing_cycles
CREATE POLICY "Users can view their billing cycles" ON billing_cycles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM creator_subscriptions cs 
            WHERE cs.id = subscription_id AND cs.subscriber_id = auth.uid()
        )
    );

CREATE POLICY "Creators can view subscriber billing" ON billing_cycles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM creator_subscriptions cs 
            WHERE cs.id = subscription_id AND cs.creator_id = auth.uid()
        )
    );

-- RLS Policies for tier_pricing_history
CREATE POLICY "Creators can manage pricing history" ON tier_pricing_history
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM subscription_tiers st 
            WHERE st.id = tier_id AND st.creator_id = auth.uid()
        )
    );

-- RLS Policies for subscription_analytics
CREATE POLICY "Creators can view their analytics" ON subscription_analytics
    FOR SELECT USING (auth.uid() = creator_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_subscription_tiers_updated_at 
    BEFORE UPDATE ON subscription_tiers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creator_subscriptions_updated_at 
    BEFORE UPDATE ON creator_subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_cycles_updated_at 
    BEFORE UPDATE ON billing_cycles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_analytics_updated_at 
    BEFORE UPDATE ON subscription_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate tier migration type
CREATE OR REPLACE FUNCTION determine_migration_type(
    from_price_cents INTEGER,
    to_price_cents INTEGER
) RETURNS TEXT AS $$
BEGIN
    IF from_price_cents IS NULL THEN
        RETURN 'upgrade';
    ELSIF to_price_cents > from_price_cents THEN
        RETURN 'upgrade';
    ELSIF to_price_cents < from_price_cents THEN
        RETURN 'downgrade';
    ELSE
        RETURN 'lateral';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- View for creator revenue analytics
CREATE OR REPLACE VIEW creator_revenue_analytics AS
SELECT 
    creator_id,
    DATE_TRUNC('month', date) as month,
    SUM(gross_revenue_cents) as monthly_gross_revenue_cents,
    SUM(net_revenue_cents) as monthly_net_revenue_cents,
    SUM(new_subscriptions) as monthly_new_subscriptions,
    SUM(canceled_subscriptions) as monthly_canceled_subscriptions,
    AVG(churn_rate) as average_churn_rate,
    SUM(active_subscriptions) / COUNT(DISTINCT date) as average_active_subscriptions
FROM subscription_analytics 
GROUP BY creator_id, DATE_TRUNC('month', date);

-- View for tier performance metrics
CREATE OR REPLACE VIEW tier_performance_metrics AS
SELECT 
    st.id as tier_id,
    st.creator_id,
    st.name as tier_name,
    st.price_cents,
    COUNT(cs.id) as total_subscribers,
    COUNT(CASE WHEN cs.status = 'active' THEN 1 END) as active_subscribers,
    COUNT(CASE WHEN cs.status = 'trialing' THEN 1 END) as trial_subscribers,
    AVG(EXTRACT(DAYS FROM (cs.updated_at - cs.created_at))) as avg_subscription_days,
    SUM(CASE WHEN cs.status = 'active' THEN st.price_cents ELSE 0 END) as monthly_recurring_revenue_cents
FROM subscription_tiers st
LEFT JOIN creator_subscriptions cs ON cs.tier_id = st.id
WHERE st.is_active = true
GROUP BY st.id, st.creator_id, st.name, st.price_cents;

COMMIT;
```