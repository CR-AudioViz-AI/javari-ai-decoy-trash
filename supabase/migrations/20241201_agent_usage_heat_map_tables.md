# Build Agent Usage Heat Map Generator

# Agent Usage Heat Map Generator Migration

## Purpose
The Agent Usage Heat Map Generator Migration creates the necessary tables and views to facilitate real-time visualization of agent usage patterns. It is designed to track individual sessions of agent usage, storing relevant metrics and geographical data to generate detailed heat maps for performance analysis.

## Usage
This migration script is intended for use within a Postgres database that has the PostGIS extension enabled. It should be executed during the setup of the database schema to ensure that the required tables and indexes are available for future queries and applications.

## Parameters/Props
The migration script defines a single table:

### `agent_usage_sessions`
- **id**: `UUID` - Unique identifier for the session (Primary Key).
- **agent_execution_id**: `UUID` - Foreign key linking to the agent executions.
- **user_id**: `UUID` - (Optional) Unique identifier for the user.
- **agent_id**: `UUID` - Unique identifier of the agent being used.
- **agent_category**: `TEXT` - The category/type of the agent.
- **session_start_time**: `TIMESTAMP WITH TIME ZONE` - The exact time when the session started (Defaults to current time).
- **session_end_time**: `TIMESTAMP WITH TIME ZONE` - The exact time when the session ended.
- **session_duration_seconds**: `INTEGER` - Duration of the session in seconds.
- **geographical_coordinates**: `GEOMETRY(POINT, 4326)` - Geographic coordinates of the session's location (if available).
- **country_code**: `VARCHAR(2)` - ISO code representing the country of the session.
- **region_name**: `TEXT` - Name of the region associated with the session.
- **city_name**: `TEXT` - Name of the city where the session occurred.
- **timezone_name**: `TEXT` - Name of the timezone for the session.
- **timezone_offset**: `INTEGER` - Offset in minutes from UTC for the session's timezone.
- **ip_address**: `INET` - IP address used in the session.
- **user_agent**: `TEXT` - Information about the browser or client used.
- **performance_score**: `DECIMAL(5,2)` - Score indicating the performance of the session (Range 0-100).
- **success_rate**: `DECIMAL(5,2)` - Rate of successful interactions within the session (Range 0-100).
- **error_count**: `INTEGER` - Number of errors encountered during the session (Defaults to 0).
- **created_at**: `TIMESTAMP WITH TIME ZONE` - Record creation timestamp (Defaults to current time).
- **updated_at**: `TIMESTAMP WITH TIME ZONE` - Record update timestamp (Defaults to current time).

### Constraints
- Foreign key constraints to ensure referential integrity.
- Checks to validate scores, durations, and geographical coordinates.

## Return Values
The migration does not return any values directly but establishes the framework (in the form of a table) necessary for future data processing and visualization tasks.

## Examples
To apply the migration, execute the SQL script in a PostgreSQL environment equipped with the required extensions. Example command:

```sql
psql -d your_database -f supabase/migrations/20241201_agent_usage_heat_map_tables.sql
```

This command will create the `agent_usage_sessions` table along with necessary indexes to facilitate querying of agent usage data for heat map generation.