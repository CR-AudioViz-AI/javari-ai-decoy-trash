# Deploy Oracle Database Connector Microservice

# Oracle Database Connector Microservice Migration Documentation

## Purpose
The Oracle Database Connector Microservice migration script sets up the necessary infrastructure and configuration for securely connecting to an Oracle database. It ensures compliance and provides audit trails, thereby enhancing security and management of database connections.

## Usage
To deploy the Oracle Database Connector Microservice, execute the following SQL migration script within your Supabase database environment. This script can be run using tools such as `psql`, or through the Supabase migration interface.

```sql
-- Run the migration script
\i supabase/migrations/20240315000000_oracle_connector_microservice.sql;
```

## Parameters/Props

### Extensions
- **uuid-ossp**: Extends PostgreSQL with functions to generate UUIDs.
- **pgcrypto**: For cryptographic functions, particularly to encrypt sensitive data.
- **pg_stat_statements**: Enables tracking of execution statistics for SQL statements.

### Enum Types
- **oracle_connection_status**: Represents the state of the Oracle connection. Possible values: `active`, `inactive`, `error`, `testing`.
- **query_operation_type**: Defines the type of operations that can be performed. Possible values: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DDL`, `PROCEDURE`.
- **access_level**: Specifies access levels for users. Possible values: `read`, `write`, `admin`, `restricted`.

### Tables
- **encryption_keys**: Contains information about encryption keys used for securing database credentials.
  - **id** (UUID): Primary key.
  - **key_name** (VARCHAR): Name of the encryption key.
  - **key_data** (TEXT): Encrypted key material.
  - **algorithm** (VARCHAR): Encryption algorithm used.
  - **created_at** (TIMESTAMPTZ): Timestamp of creation.
  - **created_by** (UUID): User who created the key. 
  - **expires_at** (TIMESTAMPTZ): Expiration timestamp of the key.
  - **is_active** (BOOLEAN): Indicates if the key is currently active.
  - **rotation_count** (INTEGER): Number of times the key has been rotated.
  - **metadata** (JSONB): Any associated metadata.

- **oracle_connections**: Manages connection configurations to Oracle databases.
  - **id** (UUID): Primary key.
  - **connection_name** (VARCHAR): User-defined name for the connection.
  - **tenant_id** (UUID): Identifier for the tenant or customer.
  - **host** (VARCHAR): Hostname or IP address of the Oracle Database.
  - **port** (INTEGER): Port number for connection (default: 1521).
  - **service_name** (VARCHAR): Oracle service name.
  - **sid** (VARCHAR): Oracle System ID.
  - **username_encrypted** (TEXT): Encrypted username for DB access.
  - **password_encrypted** (TEXT): Encrypted password for DB access.
  - **encryption_key_id** (UUID): Reference to the encryption key used.
  - **connection_string_template** (TEXT): Template for constructing the connection string.
  - **status** (oracle_connection_status): Connection status (default: `inactive`).
  - **max_connections** (INTEGER): Maximum number of active connections.

## Return Values
This script does not return values directly but sets up the specified tables and types in the database. Successful execution creates a secure framework for managing connections to Oracle databases.

## Examples
- To check if the migration was applied correctly, query the tables created:

```sql
SELECT * FROM encryption_keys;
SELECT * FROM oracle_connections;
```

By executing the above commands after running the migration, you will view the status of your tables.