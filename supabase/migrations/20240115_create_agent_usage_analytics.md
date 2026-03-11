# Build Agent Usage Analytics Service

```markdown
# Agent Usage Analytics Service Database Migration

## Purpose
The Agent Usage Analytics Service Database Migration provides a structured way to track and analyze the usage of agents in real-time. It defines the necessary database schema to record various agent interactions, performance metrics, and user engagement data.

## Usage
This SQL migration script is intended to be run on a PostgreSQL database to set up the required tables, types, and extensions for tracking agent usage analytics. It is suitable for use within an application that leverages agent-based processes and needs to capture detailed analytics.

## Parameters/Props
This migration script does not take any run-time parameters but involves the following SQL constructs:

1. **Extensions:**
   - `uuid-ossp`: Provides functions to generate universally unique identifiers (UUIDs).
   - `pg_stat_statements`: Allows tracking of execution statistics for all SQL statements executed.

2. **Enum Types:**
   - `agent_event_type`: Defines types of events related to agent usage including 'execution_start', 'execution_complete', and 'user_interaction'.
   - `interaction_type`: Details types of user interactions like 'view', 'click', 'download'.
   - `performance_grade`: Grades the performance of agents from 'A+' to 'F'.

3. **Tables:**
   - `agent_usage_events`: A primary table to log events related to agent usage with fields for event types, timestamps, and user data. Partitioned by month for efficient querying and data management.

## Return Values
The migration does not return values but sets up the database schema necessary for future data insertion and analysis. It enables the following functionalities:
- Recording of agent usage events, including errors and interactions.
- Efficient querying via time-partitioned tables.
- Structured logging for various event types and performance metrics.

## Examples
To apply this migration, run the SQL script in your PostgreSQL environment:

```sql
-- Run the migration script
\i supabase/migrations/20240115_create_agent_usage_analytics.sql;
```

### Inserting Data Example
After running the migration, you can insert agent usage events like so:

```sql
INSERT INTO agent_usage_events (agent_id, user_id, event_type, session_id, duration_ms, ip_address, user_agent)
VALUES (uuid_generate_v4(), uuid_generate_v4(), 'execution_complete', uuid_generate_v4(), 250, '192.168.1.1', 'Mozilla/5.0');
```

### Querying Data Example
To retrieve all agent execution events:

```sql
SELECT * FROM agent_usage_events WHERE event_type = 'execution_complete';
```

This setup supports comprehensive analytics capabilities for tracking agent performance and user engagement, helping inform decision-making and improve agent functionalities.
```