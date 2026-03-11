```sql
-- =====================================================
-- Immutable Transaction Ledger Database Migration
-- File: supabase/migrations/20240115000000_create_immutable_transaction_ledger.sql
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUMS AND TYPES
-- =====================================================

CREATE TYPE transaction_status AS ENUM ('pending', 'confirmed', 'failed', 'cancelled');
CREATE TYPE transaction_type AS ENUM ('transfer', 'deposit', 'withdrawal', 'adjustment', 'fee');
CREATE TYPE entry_type AS ENUM ('debit', 'credit');
CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- =====================================================
-- ACCOUNTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number VARCHAR(50) UNIQUE NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type account_type NOT NULL,
    parent_account_id UUID REFERENCES accounts(id),
    currency_code VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    tenant_id UUID NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT no_self_parent CHECK (id != parent_account_id)
);

-- =====================================================
-- TRANSACTIONS TABLE (Hash Chain Implementation)
-- =====================================================

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    reference_number VARCHAR(100),
    description TEXT NOT NULL,
    transaction_type transaction_type NOT NULL,
    status transaction_status DEFAULT 'pending',
    amount DECIMAL(20,8) NOT NULL,
    currency_code VARCHAR(3) DEFAULT 'USD',
    
    -- Blockchain-inspired hash chain
    current_hash VARCHAR(64) UNIQUE NOT NULL,
    previous_hash VARCHAR(64),
    block_height BIGINT NOT NULL DEFAULT 0,
    nonce VARCHAR(32) DEFAULT encode(gen_random_bytes(16), 'hex'),
    
    -- Timestamps
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_by UUID,
    tenant_id UUID NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Immutability constraints
    is_immutable BOOLEAN DEFAULT false,
    hash_verified BOOLEAN DEFAULT false,
    
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT valid_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT confirmed_transactions_immutable CHECK (
        status != 'confirmed' OR is_immutable = true
    )
);

-- =====================================================
-- TRANSACTION ENTRIES TABLE (Double-Entry Bookkeeping)
-- =====================================================

CREATE TABLE IF NOT EXISTS transaction_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    entry_type entry_type NOT NULL,
    amount DECIMAL(20,8) NOT NULL,
    currency_code VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    entry_sequence INTEGER NOT NULL,
    
    -- Hash for entry integrity
    entry_hash VARCHAR(64) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    tenant_id UUID NOT NULL,
    
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT valid_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT unique_entry_sequence UNIQUE (transaction_id, entry_sequence)
);

-- =====================================================
-- AUDIT TRAIL TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    change_hash VARCHAR(64) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    tenant_id UUID NOT NULL,
    user_agent TEXT,
    ip_address INET,
    
    CONSTRAINT valid_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- =====================================================
-- ACCOUNT BALANCES MATERIALIZED VIEW
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS account_balances AS
WITH balance_calculations AS (
    SELECT 
        te.account_id,
        a.account_number,
        a.account_name,
        a.account_type,
        te.currency_code,
        SUM(CASE 
            WHEN te.entry_type = 'debit' AND a.account_type IN ('asset', 'expense') THEN te.amount
            WHEN te.entry_type = 'credit' AND a.account_type IN ('liability', 'equity', 'revenue') THEN te.amount
            WHEN te.entry_type = 'credit' AND a.account_type IN ('asset', 'expense') THEN -te.amount
            WHEN te.entry_type = 'debit' AND a.account_type IN ('liability', 'equity', 'revenue') THEN -te.amount
            ELSE 0
        END) as balance,
        COUNT(te.id) as transaction_count,
        MAX(te.created_at) as last_transaction_at,
        a.tenant_id
    FROM transaction_entries te
    JOIN accounts a ON te.account_id = a.id
    JOIN transactions t ON te.transaction_id = t.id
    WHERE t.status = 'confirmed'
    GROUP BY te.account_id, a.account_number, a.account_name, a.account_type, te.currency_code, a.tenant_id
)
SELECT 
    uuid_generate_v4() as id,
    account_id,
    account_number,
    account_name,
    account_type,
    currency_code,
    balance,
    transaction_count,
    last_transaction_at,
    tenant_id,
    NOW() as calculated_at
FROM balance_calculations;

-- =====================================================
-- INDEXES
-- =====================================================

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_hash_chain ON transactions(previous_hash, current_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_number);

-- Transaction entries indexes
CREATE INDEX IF NOT EXISTS idx_transaction_entries_transaction_id ON transaction_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_entries_account_id ON transaction_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_entries_tenant_id ON transaction_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transaction_entries_currency ON transaction_entries(currency_code);

-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_audit_trail_table_record ON audit_trail(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_id ON audit_trail(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at);

-- Account balances materialized view index
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_balances_unique ON account_balances(account_id, currency_code);

-- =====================================================
-- CRYPTOGRAPHIC FUNCTIONS
-- =====================================================

-- Function to generate transaction hash
CREATE OR REPLACE FUNCTION generate_transaction_hash(
    p_transaction_id UUID,
    p_amount DECIMAL,
    p_previous_hash VARCHAR,
    p_nonce VARCHAR,
    p_timestamp TIMESTAMP WITH TIME ZONE
)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    hash_input TEXT;
    result_hash VARCHAR(64);
BEGIN
    hash_input := p_transaction_id::TEXT || '|' || 
                  p_amount::TEXT || '|' || 
                  COALESCE(p_previous_hash, '') || '|' || 
                  p_nonce || '|' || 
                  EXTRACT(epoch FROM p_timestamp)::TEXT;
    
    result_hash := encode(digest(hash_input, 'sha256'), 'hex');
    RETURN result_hash;
END;
$$;

-- Function to generate entry hash
CREATE OR REPLACE FUNCTION generate_entry_hash(
    p_transaction_id UUID,
    p_account_id UUID,
    p_entry_type entry_type,
    p_amount DECIMAL,
    p_sequence INTEGER
)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    hash_input TEXT;
    result_hash VARCHAR(64);
BEGIN
    hash_input := p_transaction_id::TEXT || '|' || 
                  p_account_id::TEXT || '|' || 
                  p_entry_type::TEXT || '|' || 
                  p_amount::TEXT || '|' || 
                  p_sequence::TEXT;
    
    result_hash := encode(digest(hash_input, 'sha256'), 'hex');
    RETURN result_hash;
END;
$$;

-- Function to verify transaction hash chain
CREATE OR REPLACE FUNCTION verify_transaction_hash_chain(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_tx RECORD;
    calculated_hash VARCHAR(64);
    is_valid BOOLEAN := true;
BEGIN
    SELECT * INTO current_tx FROM transactions WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Calculate expected hash
    calculated_hash := generate_transaction_hash(
        current_tx.id,
        current_tx.amount,
        current_tx.previous_hash,
        current_tx.nonce,
        current_tx.created_at
    );
    
    -- Verify hash matches
    IF calculated_hash != current_tx.current_hash THEN
        is_valid := false;
    END IF;
    
    -- Update verification status
    UPDATE transactions 
    SET hash_verified = is_valid 
    WHERE id = p_transaction_id;
    
    RETURN is_valid;
END;
$$;

-- Function to validate double-entry bookkeeping
CREATE OR REPLACE FUNCTION validate_double_entry(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_debits DECIMAL(20,8);
    total_credits DECIMAL(20,8);
    entry_count INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0),
        COUNT(*)
    INTO total_debits, total_credits, entry_count
    FROM transaction_entries 
    WHERE transaction_id = p_transaction_id;
    
    -- Must have at least 2 entries and debits must equal credits
    RETURN entry_count >= 2 AND total_debits = total_credits;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Function to set transaction hash before insert
CREATE OR REPLACE FUNCTION set_transaction_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    prev_hash VARCHAR(64);
    block_num BIGINT;
BEGIN
    -- Get previous hash and increment block height
    SELECT current_hash, block_height + 1 
    INTO prev_hash, block_num
    FROM transactions 
    WHERE tenant_id = NEW.tenant_id
    ORDER BY block_height DESC 
    LIMIT 1;
    
    -- Set previous hash and block height
    NEW.previous_hash := prev_hash;
    NEW.block_height := COALESCE(block_num, 1);
    
    -- Generate current hash
    NEW.current_hash := generate_transaction_hash(
        NEW.id,
        NEW.amount,
        NEW.previous_hash,
        NEW.nonce,
        NEW.created_at
    );
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_transaction_hash
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_transaction_hash();

-- Function to set entry hash before insert
CREATE OR REPLACE FUNCTION set_entry_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.entry_hash := generate_entry_hash(
        NEW.transaction_id,
        NEW.account_id,
        NEW.entry_type,
        NEW.amount,
        NEW.entry_sequence
    );
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_entry_hash
    BEFORE INSERT ON transaction_entries
    FOR EACH ROW
    EXECUTE FUNCTION set_entry_hash();

-- Audit trail trigger function
CREATE OR REPLACE FUNCTION create_audit_trail()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_record JSONB;
    new_record JSONB;
    changed_fields TEXT[];
    change_hash VARCHAR(64);
BEGIN
    -- Convert records to JSONB
    IF TG_OP = 'DELETE' THEN
        old_record := to_jsonb(OLD);
        new_record := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        old_record := NULL;
        new_record := to_jsonb(NEW);
    ELSE -- UPDATE
        old_record := to_jsonb(OLD);
        new_record := to_jsonb(NEW);
        
        -- Find changed fields
        SELECT array_agg(key)
        INTO changed_fields
        FROM jsonb_each(old_record) old_kv
        JOIN jsonb_each(new_record) new_kv ON old_kv.key = new_kv.key
        WHERE old_kv.value IS DISTINCT FROM new_kv.value;
    END IF;
    
    -- Generate change hash
    change_hash := encode(
        digest(
            TG_TABLE_NAME || '|' || 
            COALESCE(OLD.id::TEXT, NEW.id::TEXT) || '|' || 
            TG_OP || '|' || 
            EXTRACT(epoch FROM NOW())::TEXT,
            'sha256'
        ),
        'hex'
    );
    
    -- Insert audit record
    INSERT INTO audit_trail (
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        changed_fields,
        change_hash,
        tenant_id
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(OLD.id, NEW.id),
        TG_OP,
        old_record,
        new_record,
        changed_fields,
        change_hash,
        COALESCE(OLD.tenant_id, NEW.tenant_id)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create audit triggers
CREATE TRIGGER trigger_transactions_audit
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION create_audit_trail();

CREATE TRIGGER trigger_transaction_entries_audit
    AFTER INSERT OR UPDATE OR DELETE ON transaction_entries
    FOR EACH ROW
    EXECUTE FUNCTION create_audit_trail();

CREATE TRIGGER trigger_accounts_audit
    AFTER INSERT OR UPDATE OR DELETE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_audit_trail();

-- Function to refresh account balances
CREATE OR REPLACE FUNCTION refresh_account_balances()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY account_balances;
    RETURN NULL;
END;
$$;

-- Trigger to refresh balances when transactions are confirmed
CREATE TRIGGER trigger_refresh_balances
    AFTER UPDATE OF status ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'confirmed' AND OLD.status != 'confirmed')
    EXECUTE FUNCTION refresh_account_balances();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Accounts policies
CREATE POLICY accounts_tenant_isolation ON accounts
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Transactions policies
CREATE POLICY transactions_tenant_isolation ON transactions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Transaction entries policies
CREATE POLICY transaction_entries_tenant_isolation ON transaction_entries
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Audit trail policies
CREATE POLICY audit_trail_tenant_isolation ON audit_trail
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to get account balance
CREATE OR REPLACE FUNCTION get_account_balance(
    p_account_id UUID,
    p_currency_code VARCHAR(3) DEFAULT 'USD',
    p_as_of_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS DECIMAL(20,8)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    account_balance DECIMAL(20,8) := 0;
    account_type_val account_type;
BEGIN
    -- Get account type
    SELECT account_type INTO account_type_val
    FROM accounts 
    WHERE id = p_account_id;
    
    -- Calculate balance based on account type
    SELECT COALESCE(SUM(
        CASE 
            WHEN te.entry_type = 'debit' AND account_type_val IN ('asset', 'expense') THEN te.amount
            WHEN te.entry_type = 'credit' AND account_type_val IN ('liability', 'equity', 'revenue') THEN te.amount
            WHEN te.entry_type = 'credit' AND account_type_val IN ('asset', 'expense') THEN -te.amount
            WHEN te.entry_type = 'debit' AND account_type_val IN ('liability', 'equity', 'revenue') THEN -te.amount
            ELSE 0
        END
    ), 0)
    INTO account_balance
    FROM transaction_entries te
    JOIN transactions t ON te.transaction_id = t.id
    WHERE te.account_id = p_account_id
      AND te.currency_code = p_currency_code
      AND t.status = 'confirmed'
      AND t.confirmed_at <= p_as_of_date;
    
    RETURN account_balance;
END;
$$;

-- Function to create a transaction with entries
CREATE OR REPLACE FUNCTION create_transaction_with_entries(
    p_description TEXT,
    p_transaction_type transaction_type,
    p_reference_number VARCHAR(100),
    p_entries JSONB,
    p_metadata JSONB DEFAULT '{}',
    p_tenant_id UUID DEFAULT current_setting('app.current_tenant_id')::UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_transaction_id UUID;
    entry_record JSONB;
    total_amount DECIMAL(20,8) := 0;
    sequence_num INTEGER := 1;
BEGIN
    -- Calculate total amount
    FOR entry_record IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        total_amount := total_amount + (entry_record->>'amount')::DECIMAL(20,8);
    END LOOP;
    
    -- Create transaction
    INSERT INTO transactions (
        transaction_number,
        reference_number,
        description,
        transaction_type,
        amount,
        metadata,
        tenant_id
    ) VALUES (
        'TXN-' || extract(epoch from now())::bigint || '-' || encode(gen_random_bytes(4), 'hex'),
        p_reference_number,
        p_description,
        p_transaction_type,
        total_amount / 2, -- Divide by 2 since we count both debit and credit
        p_metadata,
        p_tenant_id
    ) RETURNING id INTO new_transaction_id;
    
    -- Create entries
    FOR entry_record IN SELECT * FROM jsonb_array_elements(p_entries)
    LOOP
        INSERT INTO transaction_entries (
            transaction_id,
            account_id,
            entry_type,
            amount,
            currency_code,
            description,
            entry_sequence,
            tenant_id
        ) VALUES (
            new_transaction_id,
            (entry_record->>'account_id')::UUID,
            (entry_record->>'entry_type')::entry_type,
            (entry_record->>'amount')::DECIMAL(20,8),
            COALESCE(entry_record->>'currency_code', 'USD'),
            entry_record->>'description',
            sequence_num,
            p_tenant_id
        );
        
        sequence_num := sequence_num + 1;
    END LOOP;
    
    -- Validate double entry
    IF NOT validate_double_entry(new_transaction_id) THEN
        RAISE EXCEPTION 'Transaction does not balance: debits must equal credits';
    END IF;
    
    RETURN new_transaction_id;
END;
$$;

-- =====================================================
-- INITIAL DATA AND COMMENTS
-- =====================================================

COMMENT ON TABLE accounts IS 'Chart of accounts for the ledger system';
COMMENT ON TABLE transactions IS 'Immutable transaction log with hash chain verification';
COMMENT ON TABLE transaction_entries IS 'Double-entry bookkeeping entries for each transaction';
COMMENT ON TABLE audit_trail IS 'Immutable audit trail for all changes';
COMMENT ON MATERIALIZED VIEW account_balances IS 'Real-time account balances calculated from entries';

COMMENT ON COLUMN transactions.current_hash IS 'SHA-256 hash of transaction data for integrity verification';
COMMENT ON COLUMN transactions.previous_hash IS 'Hash of previous transaction in the chain for blockchain-style verification';
COMMENT ON COLUMN transactions.block_height IS 'Sequential block number for ordering and verification';
COMMENT ON COLUMN transaction_entries.entry_hash IS 'Hash of entry data for integrity