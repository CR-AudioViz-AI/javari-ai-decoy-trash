```sql
-- Enterprise Data Synchronization Service Migration
-- File: supabase/migrations/20240115000000_enterprise_sync_service.sql

-- Create custom enum types
CREATE TYPE sync_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'retrying'
);

CREATE TYPE sync_direction AS ENUM (
  'inbound',
  'outbound',
  'bidirectional'
);

CREATE TYPE conflict_resolution_strategy AS ENUM (
  'source_wins',
  'target_wins',
  'last_modified_wins',
  'manual_resolution',
  'merge_fields',
  'skip_record'
);

CREATE TYPE connection_status AS ENUM (
  'healthy',
  'degraded',
  'down',
  'maintenance'
);

CREATE TYPE entity_operation AS ENUM (
  'create',
  'update',
  'delete',
  'upsert'
);

-- Sync Configurations Table
CREATE TABLE IF NOT EXISTS sync_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_system VARCHAR(100) NOT NULL,
  target_system VARCHAR(100) NOT NULL,
  source_connection_params JSONB NOT NULL,
  target_connection_params JSONB NOT NULL,
  sync_direction sync_direction NOT NULL DEFAULT 'bidirectional',
  is_active BOOLEAN NOT NULL DEFAULT true,
  retry_count INTEGER NOT NULL DEFAULT 3,
  retry_delay_seconds INTEGER NOT NULL DEFAULT 300,
  batch_size INTEGER NOT NULL DEFAULT 1000,
  timeout_seconds INTEGER NOT NULL DEFAULT 3600,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT sync_configurations_tenant_name_unique UNIQUE (tenant_id, name)
);

-- Sync Mappings Table
CREATE TABLE IF NOT EXISTS sync_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_configuration_id UUID NOT NULL REFERENCES sync_configurations(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  source_entity_name VARCHAR(255) NOT NULL,
  target_entity_name VARCHAR(255) NOT NULL,
  field_mappings JSONB NOT NULL,
  filter_conditions JSONB,
  transformation_rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Sync Schedules Table
CREATE TABLE IF NOT EXISTS sync_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_configuration_id UUID NOT NULL REFERENCES sync_configurations(id) ON DELETE CASCADE,
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Data Transformations Table
CREATE TABLE IF NOT EXISTS data_transformations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  transformation_type VARCHAR(50) NOT NULL,
  source_field VARCHAR(255) NOT NULL,
  target_field VARCHAR(255) NOT NULL,
  transformation_logic JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT data_transformations_tenant_name_unique UNIQUE (tenant_id, name)
);

-- Sync Jobs Table
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_configuration_id UUID NOT NULL REFERENCES sync_configurations(id) ON DELETE CASCADE,
  job_name VARCHAR(255) NOT NULL,
  status sync_status NOT NULL DEFAULT 'pending',
  sync_direction sync_direction NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  successful_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  skipped_records INTEGER DEFAULT 0,
  error_message TEXT,
  execution_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enterprise Entities Table
CREATE TABLE IF NOT EXISTS enterprise_entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  source_entity_id VARCHAR(255) NOT NULL,
  entity_data JSONB NOT NULL,
  metadata JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_entities_unique_source UNIQUE (tenant_id, entity_type, source_system, source_entity_id)
);

-- Sync Conflicts Table
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_job_id UUID NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  conflict_type VARCHAR(100) NOT NULL,
  source_data JSONB NOT NULL,
  target_data JSONB NOT NULL,
  conflicting_fields JSONB NOT NULL,
  resolution_strategy conflict_resolution_strategy NOT NULL DEFAULT 'manual_resolution',
  resolved_data JSONB,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync Audit Log Table
CREATE TABLE IF NOT EXISTS sync_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
  sync_configuration_id UUID NOT NULL REFERENCES sync_configurations(id) ON DELETE CASCADE,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  operation entity_operation NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  target_system VARCHAR(100) NOT NULL,
  operation_details JSONB,
  before_data JSONB,
  after_data JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Connection Health Table
CREATE TABLE IF NOT EXISTS connection_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_configuration_id UUID NOT NULL REFERENCES sync_configurations(id) ON DELETE CASCADE,
  system_name VARCHAR(100) NOT NULL,
  status connection_status NOT NULL DEFAULT 'healthy',
  last_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INTEGER,
  error_message TEXT,
  health_details JSONB,
  uptime_percentage DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_sync_configurations_tenant_id ON sync_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_configurations_active ON sync_configurations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sync_configurations_systems ON sync_configurations(source_system, target_system);

CREATE INDEX IF NOT EXISTS idx_sync_mappings_config_id ON sync_mappings(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_entity_type ON sync_mappings(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_active ON sync_mappings(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sync_schedules_config_id ON sync_schedules(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_next_run ON sync_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sync_schedules_active ON sync_schedules(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_data_transformations_tenant_id ON data_transformations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_transformations_type ON data_transformations(transformation_type);
CREATE INDEX IF NOT EXISTS idx_data_transformations_active ON data_transformations(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_config_id ON sync_jobs(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created ON sync_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_enterprise_entities_tenant_id ON enterprise_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_entities_type ON enterprise_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_enterprise_entities_source ON enterprise_entities(source_system);
CREATE INDEX IF NOT EXISTS idx_enterprise_entities_last_synced ON enterprise_entities(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_enterprise_entities_composite ON enterprise_entities(tenant_id, entity_type, source_system);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_job_id ON sync_conflicts(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity ON sync_conflicts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolution ON sync_conflicts(resolution_strategy);

CREATE INDEX IF NOT EXISTS idx_sync_audit_log_job_id ON sync_audit_log(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_config_id ON sync_audit_log(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_created_at ON sync_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_operation ON sync_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_success ON sync_audit_log(success);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_entity ON sync_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_connection_health_config_id ON connection_health(sync_configuration_id);
CREATE INDEX IF NOT EXISTS idx_connection_health_status ON connection_health(status);
CREATE INDEX IF NOT EXISTS idx_connection_health_last_check ON connection_health(last_check_at);
CREATE INDEX IF NOT EXISTS idx_connection_health_system ON connection_health(system_name);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_sync_configurations_updated_at
  BEFORE UPDATE ON sync_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sync_mappings_updated_at
  BEFORE UPDATE ON sync_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sync_schedules_updated_at
  BEFORE UPDATE ON sync_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_data_transformations_updated_at
  BEFORE UPDATE ON data_transformations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sync_jobs_updated_at
  BEFORE UPDATE ON sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_enterprise_entities_updated_at
  BEFORE UPDATE ON enterprise_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sync_conflicts_updated_at
  BEFORE UPDATE ON sync_conflicts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_connection_health_updated_at
  BEFORE UPDATE ON connection_health
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE sync_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_transformations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_health ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY "sync_configurations_tenant_isolation" ON sync_configurations
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "sync_mappings_tenant_isolation" ON sync_mappings
  FOR ALL USING (
    sync_configuration_id IN (
      SELECT id FROM sync_configurations 
      WHERE tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

CREATE POLICY "sync_schedules_tenant_isolation" ON sync_schedules
  FOR ALL USING (
    sync_configuration_id IN (
      SELECT id FROM sync_configurations 
      WHERE tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

CREATE POLICY "data_transformations_tenant_isolation" ON data_transformations
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "sync_jobs_tenant_isolation" ON sync_jobs
  FOR ALL USING (
    sync_configuration_id IN (
      SELECT id FROM sync_configurations 
      WHERE tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

CREATE POLICY "enterprise_entities_tenant_isolation" ON enterprise_entities
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id'::text);

CREATE POLICY "sync_conflicts_tenant_isolation" ON sync_conflicts
  FOR ALL USING (
    sync_job_id IN (
      SELECT sj.id FROM sync_jobs sj
      JOIN sync_configurations sc ON sj.sync_configuration_id = sc.id
      WHERE sc.tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

CREATE POLICY "sync_audit_log_tenant_isolation" ON sync_audit_log
  FOR ALL USING (
    sync_configuration_id IN (
      SELECT id FROM sync_configurations 
      WHERE tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

CREATE POLICY "connection_health_tenant_isolation" ON connection_health
  FOR ALL USING (
    sync_configuration_id IN (
      SELECT id FROM sync_configurations 
      WHERE tenant_id = auth.jwt() ->> 'tenant_id'::text
    )
  );

-- Grant permissions to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments for documentation
COMMENT ON TABLE sync_configurations IS 'Configuration settings for enterprise system synchronization';
COMMENT ON TABLE sync_mappings IS 'Field mapping definitions between source and target systems';
COMMENT ON TABLE sync_schedules IS 'Scheduling configuration for automated synchronization jobs';
COMMENT ON TABLE data_transformations IS 'Custom transformation rules for data processing during sync';
COMMENT ON TABLE sync_jobs IS 'Tracking and status information for synchronization operations';
COMMENT ON TABLE enterprise_entities IS 'Unified storage for synchronized enterprise entities';
COMMENT ON TABLE sync_conflicts IS 'Detection and resolution of data conflicts during synchronization';
COMMENT ON TABLE sync_audit_log IS 'Comprehensive audit trail of all synchronization activities';
COMMENT ON TABLE connection_health IS 'Health monitoring and status tracking for system connections';
```