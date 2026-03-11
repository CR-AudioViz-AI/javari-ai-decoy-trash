# Create Database Sharding Infrastructure

# Database Sharding Infrastructure Documentation

## Purpose
The `shard-manager.ts` script sets up the foundational structure for horizontal database sharding in PostgreSQL. This infrastructure allows for distributing database load across multiple shards, improving performance and scalability.

## Usage
This migration script is designed to be executed in a PostgreSQL environment. It establishes necessary extensions, schemas, and tables that facilitate sharding. It is intended for database administrators and developers who want to implement sharding in their applications.

## Parameters/Props
The script does not accept parameters directly but configures the following key components:

1. **Extensions**:
   - `uuid-ossp`: Enables generation of universally unique identifiers (UUIDs).
   - `pgcrypto`: Provides cryptographic functions.
   - `pg_stat_statements`: Allows tracking of execution statistics.

2. **Schema**:
   - **sharding**: A schema created to encapsulate sharding infrastructure components.

3. **Tables**:
   - **sharding.shards**:
     - `id`: UUID (Primary Key)
     - `shard_key`: Unique identifier for each shard.
     - `connection_string`: Connection details for the shard.
     - `status`: Current state of the shard (active, inactive, maintenance, migrating).
     - `weight`: Load balancing weight (0-1000).
     - `max_connections`: Maximum allowed concurrent connections.
     - `current_connections`: Currently established connections.
     - `cpu_usage_percent`: CPU usage tracking.
     - `memory_usage_percent`: Memory usage tracking.
     - `disk_usage_percent`: Disk usage tracking.
     - `read_replica_endpoints`: Array of read replica endpoints.
     - `metadata`: JSON object for custom shard metadata.
     - `created_at`: Timestamp for shard creation.
     - `updated_at`: Timestamp for last update.
     - `last_health_check`: Timestamp for the last health check.

   - **sharding.shard_routing_rules**:
     - `id`: UUID (Primary Key)
     - `table_name`: Name of the table being sharded.
     - `partition_column`: The column used for partitioning data.
     - `routing_strategy`: Statistical strategy for data distribution (hash, range, list, composite).
     - `shard_count`: Number of shards associated with the table.
     - `routing_config`: JSON object for specific routing configurations.
     - `is_active`: Status of the routing rule.
     - **Unique Constraint**: on `table_name` and `partition_column`.

4. **sharding.shard_key_mappings**:
   - Table definition incomplete; intended for tracking shard key distribution.

## Return Values
This migration does not return values but creates database structures necessary for implementing a sharding strategy. Success in running the script results in new schemas and tables in the database.

## Examples
To execute the migration, run the SQL script in your PostgreSQL client:

```sql
-- Run migration to create sharding infrastructure
\i path_to_your_migration_file.shard-manager.ts
```

Ensure necessary database permissions are granted to create schemas, extensions, and tables.

### Sample Usage of Shard Creation
Once the infrastructure is in place, you can insert into the `sharding.shards` table to establish a new shard:

```sql
INSERT INTO sharding.shards (shard_key, connection_string)
VALUES ('shard_1', 'postgres://user:password@shard1host:5432/dbname');
```

This populates the `shards` table while automatically generating a UUID for the `id` field.