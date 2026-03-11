# Implement Immutable Transaction Ledger Database

# Immutable Transaction Ledger Database Migration

## Purpose
This SQL migration script is designed to create an immutable transaction ledger database for managing financial transactions securely and efficiently. It establishes core database structures, including enumerated types, accounts, transactions, and supports extensibility through the use of UUIDs for unique identification.

## Usage
To apply this migration to your Supabase PostgreSQL database, execute the script using a SQL client that connects to your database. Ensure you have the necessary permissions to create tables and extensions.

## Parameters/Props
This migration creates the following structures:

### Enums
- **transaction_status**: Defines the possible statuses of a transaction.
  - Values: `'pending'`, `'confirmed'`, `'failed'`, `'cancelled'`
  
- **transaction_type**: Represents different types of transactions.
  - Values: `'transfer'`, `'deposit'`, `'withdrawal'`, `'adjustment'`, `'fee'`
  
- **entry_type**: Indicates whether the transaction is a debit or credit entry.
  - Values: `'debit'`, `'credit'`
  
- **account_type**: Specifies the classification of accounts.
  - Values: `'asset'`, `'liability'`, `'equity'`, `'revenue'`, `'expense'`

### Tables
- **accounts**: Stores account details.
  - `id`: UUID (Primary Key)
  - `account_number`: VARCHAR (Unique)
  - `account_name`: VARCHAR (Not Null)
  - `account_type`: account_type (Not Null)
  - `parent_account_id`: UUID (References `accounts.id`)
  - `currency_code`: VARCHAR (Default: 'USD')
  - `is_active`: BOOLEAN (Default: true)
  - `metadata`: JSONB (Default: '{}')
  - `created_at`: TIMESTAMP (Default: NOW())
  - `updated_at`: TIMESTAMP (Default: NOW())
  - `created_by`: UUID
  - `tenant_id`: UUID (Not Null)

- **transactions**: (Partially shown) Intended to store transactional data with hash chain implementation for immutability.
  - `id`: UUID (Primary Key, defaults to random UUID)
  - `transaction_number`: VARCHAR (Unique, Not Null)
  - Additional fields for reference and transaction details (to be completed in the script)

## Return Values
This migration does not return any values but sets up the necessary database schema for a transaction ledger system. Upon successful execution, the `accounts` and `transactions` tables, along with their corresponding types and constraints, will be available in the database.

## Examples
To run the migration:

```bash
psql -U username -d database_name -f supabase/migrations/20240115000000_create_immutable_transaction_ledger.sql
```

After execution, you can confirm the creation of the `accounts` table by running:

```sql
SELECT * FROM information_schema.tables WHERE table_name = 'accounts';
```

This will list details about the `accounts` table, confirming successful migration. For checking the transaction types, run:

```sql
SELECT * FROM pg_enum WHERE enumtypid = 'transaction_type'::regtype;
```

This will return the defined types of transactions, ensuring the schema is correctly set.