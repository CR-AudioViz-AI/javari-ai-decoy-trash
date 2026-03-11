# Build Creator Subscription Tier Management

# Creator Subscription Tier Management System

## Purpose
The Creator Subscription Tier Management System provides a structured schema for managing subscription tiers for content creators. It facilitates automated billing, subscription tracking, and feature management, enabling creators to offer varied subscription options to their subscribers.

## Usage
This SQL migration file creates the necessary database tables to manage subscription tiers, features, and active subscriptions. It can be executed in a Supabase PostgreSQL environment to set up the database schema required for a subscription system.

## Parameters/Props

### Tables Created

1. **subscription_tiers**
    - **id** (UUID): Primary key, auto-generated.
    - **creator_id** (UUID): Foreign key referencing `auth.users(id)`, identifies the creator.
    - **name** (VARCHAR): Name of the subscription tier.
    - **description** (TEXT): Description of the subscription tier.
    - **price_cents** (INTEGER): Price of the subscription in cents, must be non-negative.
    - **currency** (VARCHAR): Currency code (default: 'USD').
    - **billing_interval** (VARCHAR): Subscription billing frequency (options: 'weekly', 'monthly', 'yearly').
    - **trial_days** (INTEGER): Number of trial days offered (default: 0, must be non-negative).
    - **is_active** (BOOLEAN): Indicates if the subscription tier is active (default: true).
    - **max_subscribers** (INTEGER): Maximum number of subscribers (must be positive).
    - **stripe_price_id** (VARCHAR): Stripe pricing identifier for integration.
    - **position** (INTEGER): Order of subscription tiers (default: 0).
    - **created_at** (TIMESTAMP): Automatically set creation time.
    - **updated_at** (TIMESTAMP): Automatically set update time.

2. **subscription_tier_features**
    - **id** (UUID): Primary key, auto-generated.
    - **tier_id** (UUID): Foreign key referencing `subscription_tiers(id)`.
    - **feature_name** (VARCHAR): Name of the feature.
    - **feature_value** (TEXT): Value of the feature, can store complex JSON.
    - **feature_limit** (INTEGER): Numeric limits associated with the feature.
    - **is_enabled** (BOOLEAN): Indicates if the feature is enabled (default: true).
    - **created_at** (TIMESTAMP): Automatically set creation time.

3. **creator_subscriptions**
    - **id** (UUID): Primary key, auto-generated.
    - **subscriber_id** (UUID): Foreign key referencing `auth.users(id)`, identifies the subscriber.
    - **creator_id** (UUID): Foreign key referencing `auth.users(id)`, identifies the creator.
    - *(Additional fields expected to be defined)*

## Return Values
This migration does not return values directly. Instead, it sets up the database schema required for managing creator subscriptions and their features.

## Examples
To create the necessary tables in a Supabase database, execute the following SQL statement from your migration management system:

```sql
-- Execute migration script
\i path/to/supabase/migrations/20241201_create_creator_subscription_tiers.sql
```

After execution, the database will contain the tables `subscription_tiers`, `subscription_tier_features`, and `creator_subscriptions`, ready for use in a subscription management application.