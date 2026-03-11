```sql
-- Marketplace Review Sentiment Analysis Migration
-- File: supabase/migrations/20241215_marketplace_review_sentiment_analysis.sql

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Sentiment Analysis Models Configuration
CREATE TABLE IF NOT EXISTS sentiment_analysis_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(100) NOT NULL, -- 'transformer', 'lstm', 'naive_bayes'
    config JSONB NOT NULL DEFAULT '{}',
    accuracy_metrics JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(name, version)
);

-- Review Sentiment Analysis Results
CREATE TABLE IF NOT EXISTS review_sentiment_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    model_id UUID REFERENCES sentiment_analysis_models(id),
    sentiment_score DECIMAL(3,2) NOT NULL CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
    sentiment_label VARCHAR(20) NOT NULL CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
    confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    emotion_scores JSONB DEFAULT '{}', -- joy, anger, fear, sadness, etc.
    keywords_extracted JSONB DEFAULT '[]',
    sentiment_explanation TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(review_id, model_id)
);

-- Review Helpfulness Scoring
CREATE TABLE IF NOT EXISTS review_helpfulness_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    helpful_votes INTEGER DEFAULT 0 CHECK (helpful_votes >= 0),
    total_votes INTEGER DEFAULT 0 CHECK (total_votes >= 0),
    helpfulness_ratio DECIMAL(4,3) DEFAULT 0 CHECK (helpfulness_ratio >= 0 AND helpfulness_ratio <= 1),
    feature_scores JSONB DEFAULT '{}', -- readability, specificity, relevance, etc.
    ml_helpfulness_score DECIMAL(4,3) CHECK (ml_helpfulness_score >= 0 AND ml_helpfulness_score <= 1),
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(review_id)
);

-- Fraud Detection Signals
CREATE TABLE IF NOT EXISTS fraud_detection_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    user_id UUID NOT NULL,
    signal_type VARCHAR(50) NOT NULL, -- 'fake_review', 'bot_activity', 'review_farm', 'sockpuppet'
    risk_score DECIMAL(4,3) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
    signal_details JSONB NOT NULL DEFAULT '{}',
    detection_method VARCHAR(100) NOT NULL, -- 'ml_model', 'rule_based', 'pattern_analysis'
    is_confirmed BOOLEAN,
    investigated_at TIMESTAMP WITH TIME ZONE,
    investigated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automated Moderation Actions
CREATE TABLE IF NOT EXISTS automated_moderation_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'flag', 'hide', 'delete', 'require_verification'
    trigger_reason VARCHAR(100) NOT NULL,
    confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    action_details JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    overridden_by UUID,
    override_reason TEXT,
    overridden_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review Moderation Queue
CREATE TABLE IF NOT EXISTS review_moderation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    priority_score INTEGER NOT NULL DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
    queue_reason VARCHAR(100) NOT NULL, -- 'high_fraud_risk', 'negative_sentiment', 'multiple_reports'
    assigned_to UUID,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'escalated')),
    escalation_level INTEGER DEFAULT 1 CHECK (escalation_level >= 1 AND escalation_level <= 5),
    metadata JSONB DEFAULT '{}',
    assigned_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reputation Impact Tracking
CREATE TABLE IF NOT EXISTS reputation_impact_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    review_id UUID,
    impact_type VARCHAR(50) NOT NULL, -- 'positive_review', 'negative_review', 'fraud_penalty', 'helpful_vote'
    reputation_delta INTEGER NOT NULL,
    previous_reputation INTEGER NOT NULL,
    new_reputation INTEGER NOT NULL,
    calculation_details JSONB DEFAULT '{}',
    applied_by VARCHAR(50) DEFAULT 'system', -- 'system', 'moderator', 'automated'
    is_reversible BOOLEAN DEFAULT true,
    reversed_at TIMESTAMP WITH TIME ZONE,
    reversal_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Helpfulness Training Data for ML Models
CREATE TABLE IF NOT EXISTS helpfulness_training_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL,
    review_text TEXT NOT NULL,
    review_features JSONB NOT NULL DEFAULT '{}', -- length, readability, specificity metrics
    actual_helpfulness_score DECIMAL(4,3) NOT NULL CHECK (actual_helpfulness_score >= 0 AND actual_helpfulness_score <= 1),
    predicted_helpfulness_score DECIMAL(4,3) CHECK (predicted_helpfulness_score >= 0 AND predicted_helpfulness_score <= 1),
    model_version VARCHAR(50),
    is_validated BOOLEAN DEFAULT false,
    validation_source VARCHAR(50), -- 'human_votes', 'expert_review', 'crowd_source'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(review_id)
);

-- Indexes for Performance Optimization
CREATE INDEX IF NOT EXISTS idx_sentiment_analysis_review_id ON review_sentiment_analysis(review_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_analysis_sentiment_score ON review_sentiment_analysis(sentiment_score DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_analysis_created_at ON review_sentiment_analysis(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_helpfulness_scores_review_id ON review_helpfulness_scores(review_id);
CREATE INDEX IF NOT EXISTS idx_helpfulness_scores_ratio ON review_helpfulness_scores(helpfulness_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_helpfulness_scores_ml_score ON review_helpfulness_scores(ml_helpfulness_score DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_review_id ON fraud_detection_signals(review_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user_id ON fraud_detection_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_risk_score ON fraud_detection_signals(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON fraud_detection_signals(signal_type);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_review_id ON automated_moderation_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_type ON automated_moderation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_active ON automated_moderation_actions(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON review_moderation_queue(status);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_priority ON review_moderation_queue(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_assigned ON review_moderation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_queue_created ON review_moderation_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_logs_user_id ON reputation_impact_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_logs_review_id ON reputation_impact_logs(review_id);
CREATE INDEX IF NOT EXISTS idx_reputation_logs_type ON reputation_impact_logs(impact_type);
CREATE INDEX IF NOT EXISTS idx_reputation_logs_created ON reputation_impact_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_data_validated ON helpfulness_training_data(is_validated) WHERE is_validated = true;
CREATE INDEX IF NOT EXISTS idx_training_data_model_version ON helpfulness_training_data(model_version);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_sentiment_keywords_gin ON review_sentiment_analysis USING GIN ((keywords_extracted::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fraud_details_gin ON fraud_detection_signals USING GIN (signal_details);

-- Row Level Security Policies
ALTER TABLE sentiment_analysis_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sentiment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpfulness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_detection_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_impact_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE helpfulness_training_data ENABLE ROW LEVEL SECURITY;

-- Policies for sentiment analysis models (admin only)
CREATE POLICY "Models readable by authenticated users" ON sentiment_analysis_models
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Models writable by service role" ON sentiment_analysis_models
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for sentiment analysis results
CREATE POLICY "Sentiment analysis readable by authenticated users" ON review_sentiment_analysis
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Sentiment analysis writable by service role" ON review_sentiment_analysis
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for helpfulness scores
CREATE POLICY "Helpfulness scores readable by authenticated users" ON review_helpfulness_scores
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Helpfulness scores writable by service role" ON review_helpfulness_scores
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for fraud detection (restricted access)
CREATE POLICY "Fraud signals readable by moderators" ON fraud_detection_signals
    FOR SELECT USING (
        auth.role() = 'service_role' OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    );

CREATE POLICY "Fraud signals writable by service role" ON fraud_detection_signals
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for moderation actions
CREATE POLICY "Moderation actions readable by moderators" ON automated_moderation_actions
    FOR SELECT USING (
        auth.role() = 'service_role' OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    );

CREATE POLICY "Moderation actions writable by service role" ON automated_moderation_actions
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for moderation queue
CREATE POLICY "Moderation queue readable by moderators" ON review_moderation_queue
    FOR SELECT USING (
        auth.role() = 'service_role' OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    );

CREATE POLICY "Moderation queue writable by moderators" ON review_moderation_queue
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    );

-- Policies for reputation logs (users can see their own)
CREATE POLICY "Reputation logs readable by owner or moderators" ON reputation_impact_logs
    FOR SELECT USING (
        user_id = auth.uid() OR
        auth.role() = 'service_role' OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    );

CREATE POLICY "Reputation logs writable by service role" ON reputation_impact_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for training data (research access)
CREATE POLICY "Training data readable by service role" ON helpfulness_training_data
    FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "Training data writable by service role" ON helpfulness_training_data
    FOR ALL USING (auth.role() = 'service_role');

-- Functions for automatic updates
CREATE OR REPLACE FUNCTION update_helpfulness_ratio()
RETURNS TRIGGER AS $$
BEGIN
    NEW.helpfulness_ratio = CASE 
        WHEN NEW.total_votes > 0 THEN NEW.helpful_votes::DECIMAL / NEW.total_votes
        ELSE 0
    END;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for helpfulness ratio calculation
CREATE TRIGGER trigger_update_helpfulness_ratio
    BEFORE UPDATE ON review_helpfulness_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_helpfulness_ratio();

-- Function to update moderation queue timestamps
CREATE OR REPLACE FUNCTION update_moderation_queue_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Set assigned_at when status changes to 'in_review'
    IF OLD.status != 'in_review' AND NEW.status = 'in_review' THEN
        NEW.assigned_at = NOW();
    END IF;
    
    -- Set resolved_at when status changes to 'resolved'
    IF OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
        NEW.resolved_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for moderation queue timestamps
CREATE TRIGGER trigger_update_moderation_queue_timestamps
    BEFORE UPDATE ON review_moderation_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_moderation_queue_timestamps();

-- Insert default sentiment analysis model
INSERT INTO sentiment_analysis_models (name, version, model_type, config, is_active)
VALUES (
    'default_transformer',
    '1.0.0',
    'transformer',
    '{"model_path": "sentiment/default", "max_length": 512, "batch_size": 32}',
    true
) ON CONFLICT (name, version) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE sentiment_analysis_models IS 'Configuration and metadata for sentiment analysis ML models';
COMMENT ON TABLE review_sentiment_analysis IS 'Sentiment analysis results for marketplace reviews';
COMMENT ON TABLE review_helpfulness_scores IS 'Helpfulness scoring and voting data for reviews';
COMMENT ON TABLE fraud_detection_signals IS 'Fraud detection signals and risk scores for reviews';
COMMENT ON TABLE automated_moderation_actions IS 'Automated moderation actions taken on reviews';
COMMENT ON TABLE review_moderation_queue IS 'Queue for manual review moderation tasks';
COMMENT ON TABLE reputation_impact_logs IS 'Log of reputation changes based on review activities';
COMMENT ON TABLE helpfulness_training_data IS 'Training data for improving helpfulness prediction models';
```