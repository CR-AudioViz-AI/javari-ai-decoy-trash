```sql
-- Oracle Database Connector Microservice Migration
-- Creates infrastructure for secure Oracle database connections with compliance and audit trails

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create enum types for better type safety
DO $$ BEGIN
    CREATE TYPE oracle_connection_status AS ENUM ('active', 'inactive', 'error', 'testing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE query_operation_type AS ENUM ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'PROCEDURE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE access_level AS ENUM ('read', 'write', 'admin', 'restricted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Encryption keys table for credential security
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_name VARCHAR(100) UNIQUE NOT NULL,
    key_data TEXT NOT NULL, -- Encrypted key material
    algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    rotation_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Oracle connections table for connection management
CREATE TABLE IF NOT EXISTS oracle_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_name VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 1521,
    service_name VARCHAR(100),
    sid VARCHAR(100),
    username_encrypted TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    encryption_key_id UUID REFERENCES encryption_keys(id),
    connection_string_template TEXT,
    status oracle_connection_status DEFAULT 'inactive',
    max_connections INTEGER DEFAULT 10,
    timeout_seconds INTEGER DEFAULT 30,
    ssl_enabled BOOLEAN DEFAULT false,
    ssl_config JSONB DEFAULT '{}'::jsonb,
    connection_params JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    last_tested_at TIMESTAMPTZ,
    test_result JSONB,
    UNIQUE(tenant_id, connection_name)
);

-- Connection pools table for pool configuration
CREATE TABLE IF NOT EXISTS connection_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID REFERENCES oracle_connections(id) ON DELETE CASCADE,
    pool_name VARCHAR(255) NOT NULL,
    min_connections INTEGER DEFAULT 2,
    max_connections INTEGER DEFAULT 20,
    initial_connections INTEGER DEFAULT 5,
    connection_timeout_ms INTEGER DEFAULT 30000,
    idle_timeout_ms INTEGER DEFAULT 300000,
    max_lifetime_ms INTEGER DEFAULT 3600000,
    validation_query VARCHAR(500) DEFAULT 'SELECT 1 FROM DUAL',
    pool_config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oracle schemas table for schema mapping
CREATE TABLE IF NOT EXISTS oracle_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID REFERENCES oracle_connections(id) ON DELETE CASCADE,
    schema_name VARCHAR(128) NOT NULL,
    schema_owner VARCHAR(128),
    description TEXT,
    table_mappings JSONB DEFAULT '{}'::jsonb,
    procedure_mappings JSONB DEFAULT '{}'::jsonb,
    function_mappings JSONB DEFAULT '{}'::jsonb,
    access_restrictions JSONB DEFAULT '{}'::jsonb,
    last_discovered_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(oracle_connection_id, schema_name)
);

-- Access policies table for role-based access control
CREATE TABLE IF NOT EXISTS access_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL,
    oracle_connection_id UUID REFERENCES oracle_connections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    role_name VARCHAR(100),
    access_level access_level NOT NULL,
    allowed_schemas TEXT[] DEFAULT ARRAY[]::TEXT[],
    allowed_tables TEXT[] DEFAULT ARRAY[]::TEXT[],
    allowed_operations query_operation_type[] DEFAULT ARRAY[]::query_operation_type[],
    time_restrictions JSONB DEFAULT '{}'::jsonb, -- e.g., business hours only
    ip_restrictions INET[],
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Query audit logs table for compliance tracking
CREATE TABLE IF NOT EXISTS query_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID REFERENCES oracle_connections(id),
    user_id UUID REFERENCES auth.users(id),
    session_id UUID,
    query_hash VARCHAR(64), -- SHA-256 hash of the query for deduplication
    query_text TEXT NOT NULL,
    query_parameters JSONB,
    operation_type query_operation_type,
    affected_schemas TEXT[],
    affected_tables TEXT[],
    row_count INTEGER,
    execution_time_ms INTEGER,
    status VARCHAR(20) DEFAULT 'success', -- success, error, timeout
    error_message TEXT,
    client_ip INET,
    user_agent TEXT,
    ai_agent_id VARCHAR(255),
    request_id UUID,
    compliance_flags JSONB DEFAULT '{}'::jsonb,
    risk_score INTEGER DEFAULT 0, -- 0-100, higher = more risky
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Health checks table for connection monitoring
CREATE TABLE IF NOT EXISTS health_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID REFERENCES oracle_connections(id) ON DELETE CASCADE,
    check_type VARCHAR(50) DEFAULT 'connectivity', -- connectivity, performance, schema
    status VARCHAR(20) DEFAULT 'pending', -- pending, healthy, warning, critical
    response_time_ms INTEGER,
    error_message TEXT,
    metrics JSONB DEFAULT '{}'::jsonb,
    check_details JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    next_check_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_oracle_connections_tenant_id ON oracle_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oracle_connections_status ON oracle_connections(status);
CREATE INDEX IF NOT EXISTS idx_oracle_connections_updated_at ON oracle_connections(updated_at);

CREATE INDEX IF NOT EXISTS idx_connection_pools_oracle_connection_id ON connection_pools(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_pools_is_active ON connection_pools(is_active);

CREATE INDEX IF NOT EXISTS idx_oracle_schemas_connection_id ON oracle_schemas(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_oracle_schemas_schema_name ON oracle_schemas(schema_name);

CREATE INDEX IF NOT EXISTS idx_access_policies_tenant_id ON access_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_policies_user_id ON access_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_access_policies_connection_id ON access_policies(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_access_policies_active ON access_policies(is_active);

CREATE INDEX IF NOT EXISTS idx_query_audit_logs_connection_id ON query_audit_logs(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_user_id ON query_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_executed_at ON query_audit_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_operation_type ON query_audit_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_status ON query_audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_query_hash ON query_audit_logs(query_hash);

CREATE INDEX IF NOT EXISTS idx_health_checks_connection_id ON health_checks(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_health_checks_next_check_at ON health_checks(next_check_at);

-- Enable Row Level Security
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation and security

-- Encryption keys - only admins can access
CREATE POLICY IF NOT EXISTS "encryption_keys_admin_access" ON encryption_keys
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users u 
            WHERE u.id = auth.uid() 
            AND u.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Oracle connections - tenant isolation
CREATE POLICY IF NOT EXISTS "oracle_connections_tenant_isolation" ON oracle_connections
    FOR ALL USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
        OR EXISTS (
            SELECT 1 FROM auth.users u 
            WHERE u.id = auth.uid() 
            AND u.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Connection pools - access through oracle_connections
CREATE POLICY IF NOT EXISTS "connection_pools_access" ON connection_pools
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM oracle_connections oc
            WHERE oc.id = connection_pools.oracle_connection_id
            AND (oc.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
                OR EXISTS (
                    SELECT 1 FROM auth.users u 
                    WHERE u.id = auth.uid() 
                    AND u.raw_user_meta_data->>'role' = 'admin'
                ))
        )
    );

-- Oracle schemas - access through oracle_connections
CREATE POLICY IF NOT EXISTS "oracle_schemas_access" ON oracle_schemas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM oracle_connections oc
            WHERE oc.id = oracle_schemas.oracle_connection_id
            AND (oc.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
                OR EXISTS (
                    SELECT 1 FROM auth.users u 
                    WHERE u.id = auth.uid() 
                    AND u.raw_user_meta_data->>'role' = 'admin'
                ))
        )
    );

-- Access policies - tenant isolation and user access
CREATE POLICY IF NOT EXISTS "access_policies_access" ON access_policies
    FOR ALL USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
        OR user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM auth.users u 
            WHERE u.id = auth.uid() 
            AND u.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Query audit logs - users can see their own queries, admins see all
CREATE POLICY IF NOT EXISTS "query_audit_logs_access" ON query_audit_logs
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM auth.users u 
            WHERE u.id = auth.uid() 
            AND u.raw_user_meta_data->>'role' = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM oracle_connections oc
            WHERE oc.id = query_audit_logs.oracle_connection_id
            AND oc.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
        )
    );

-- Query audit logs - insert policy for logging
CREATE POLICY IF NOT EXISTS "query_audit_logs_insert" ON query_audit_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM auth.users u 
            WHERE u.id = auth.uid() 
            AND u.raw_user_meta_data->>'role' IN ('admin', 'service')
        )
    );

-- Health checks - access through oracle_connections
CREATE POLICY IF NOT EXISTS "health_checks_access" ON health_checks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM oracle_connections oc
            WHERE oc.id = health_checks.oracle_connection_id
            AND (oc.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
                OR EXISTS (
                    SELECT 1 FROM auth.users u 
                    WHERE u.id = auth.uid() 
                    AND u.raw_user_meta_data->>'role' = 'admin'
                ))
        )
    );

-- Create functions for encryption/decryption
CREATE OR REPLACE FUNCTION encrypt_credential(
    credential TEXT,
    key_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    SELECT key_data INTO encryption_key
    FROM encryption_keys
    WHERE id = key_id AND is_active = true;
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive encryption key';
    END IF;
    
    -- Using pgcrypto for encryption
    RETURN encode(
        pgp_sym_encrypt(credential, encryption_key),
        'base64'
    );
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_credential(
    encrypted_credential TEXT,
    key_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encryption_key TEXT;
    decrypted_value TEXT;
BEGIN
    SELECT key_data INTO encryption_key
    FROM encryption_keys
    WHERE id = key_id AND is_active = true;
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive encryption key';
    END IF;
    
    -- Using pgcrypto for decryption
    BEGIN
        decrypted_value := pgp_sym_decrypt(
            decode(encrypted_credential, 'base64'),
            encryption_key
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to decrypt credential: %', SQLERRM;
    END;
    
    RETURN decrypted_value;
END;
$$;

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER IF NOT EXISTS update_oracle_connections_updated_at
    BEFORE UPDATE ON oracle_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_connection_pools_updated_at
    BEFORE UPDATE ON connection_pools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_oracle_schemas_updated_at
    BEFORE UPDATE ON oracle_schemas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_access_policies_updated_at
    BEFORE UPDATE ON access_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to validate Oracle connection
CREATE OR REPLACE FUNCTION validate_oracle_connection(connection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    conn_record oracle_connections%ROWTYPE;
    result JSONB;
BEGIN
    SELECT * INTO conn_record
    FROM oracle_connections
    WHERE id = connection_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Connection not found'
        );
    END IF;
    
    -- Basic validation logic (extend with actual Oracle connection test)
    result := jsonb_build_object(
        'valid', true,
        'host', conn_record.host,
        'port', conn_record.port,
        'service_name', conn_record.service_name,
        'status', conn_record.status,
        'tested_at', NOW()
    );
    
    -- Update connection test result
    UPDATE oracle_connections
    SET 
        last_tested_at = NOW(),
        test_result = result
    WHERE id = connection_id;
    
    RETURN result;
END;
$$;

-- Function to log query execution
CREATE OR REPLACE FUNCTION log_oracle_query(
    p_connection_id UUID,
    p_query_text TEXT,
    p_operation_type query_operation_type,
    p_execution_time_ms INTEGER DEFAULT NULL,
    p_row_count INTEGER DEFAULT NULL,
    p_status VARCHAR DEFAULT 'success',
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id UUID;
    query_hash_value VARCHAR(64);
BEGIN
    -- Generate query hash
    query_hash_value := encode(digest(p_query_text, 'sha256'), 'hex');
    
    INSERT INTO query_audit_logs (
        oracle_connection_id,
        user_id,
        query_hash,
        query_text,
        operation_type,
        row_count,
        execution_time_ms,
        status,
        error_message,
        client_ip,
        user_agent,
        metadata
    ) VALUES (
        p_connection_id,
        auth.uid(),
        query_hash_value,
        p_query_text,
        p_operation_type,
        p_row_count,
        p_execution_time_ms,
        p_status,
        p_error_message,
        inet_client_addr(),
        current_setting('request.headers', true)::jsonb->>'user-agent',
        p_metadata
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Insert default encryption key (should be replaced in production)
INSERT INTO encryption_keys (key_name, key_data, algorithm, metadata)
VALUES (
    'default-oracle-key',
    encode(gen_random_bytes(32), 'base64'),
    'AES-256-GCM',
    jsonb_build_object('description', 'Default encryption key for Oracle credentials')
) ON CONFLICT (key_name) DO NOTHING;

-- Create view for connection health summary
CREATE OR REPLACE VIEW oracle_connection_health AS
SELECT 
    oc.id,
    oc.connection_name,
    oc.tenant_id,
    oc.status,
    oc.last_tested_at,
    hc.status as health_status,
    hc.response_time_ms,
    hc.checked_at as last_health_check,
    cp.pool_name,
    cp.min_connections,
    cp.max_connections,
    cp.is_active as pool_active
FROM oracle_connections oc
LEFT JOIN LATERAL (
    SELECT status, response_time_ms, checked_at
    FROM health_checks hc2
    WHERE hc2.oracle_connection_id = oc.id
    ORDER BY checked_at DESC
    LIMIT 1
) hc ON true
LEFT JOIN connection_pools cp ON cp.oracle_connection_id = oc.id AND cp.is_active = true;

COMMENT ON TABLE encryption_keys IS 'Stores encryption keys for securing Oracle database credentials';
COMMENT ON TABLE oracle_connections IS 'Manages Oracle database connection configurations with encrypted credentials';
COMMENT ON TABLE connection_pools IS 'Configures connection pooling settings for Oracle connections';
COMMENT ON TABLE oracle_schemas IS 'Maps and catalogs Oracle database schemas and objects';
COMMENT ON TABLE access_policies IS 'Defines role-based access control policies for Oracle connections';
COMMENT ON TABLE query_audit_logs IS 'Comprehensive audit trail of all Oracle database queries for compliance';
COMMENT ON TABLE health_checks IS 'Monitors Oracle connection health and performance metrics';
```