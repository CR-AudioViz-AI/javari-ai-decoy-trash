# Build Advanced Subscription Billing Engine

# Subscription Billing Engine

## Purpose
The Subscription Billing Engine is designed to manage subscription billing processes, including subscription creation, updates, cancellations, and pricing management. It supports various pricing models and billing intervals, enabling businesses to tailor their subscription services to different customer needs.

## Usage
To utilize the Subscription Billing Engine, you need to import it into your TypeScript project and create instances as required. You will typically interact with subscription plans and manage user subscriptions through the provided methods.

## Parameters/Props
The following enums and schemas are pivotal for setting up and managing the subscription system:

### Enums
- **SubscriptionStatus**: Represents the current state of a subscription.
    - `ACTIVE`
    - `TRIALING`
    - `PAST_DUE`
    - `CANCELED`
    - `UNPAID`
    - `PAUSED`

- **BillingInterval**: Specifies the frequency of billing intervals.
    - `MONTHLY`
    - `QUARTERLY`
    - `ANNUALLY`
    - `WEEKLY`

- **PricingModel**: Defines the pricing strategy for a subscription plan.
    - `FLAT_RATE`
    - `TIERED`
    - `USAGE_BASED`
    - `HYBRID`
    - `PER_SEAT`

- **RevenueRecognitionMethod**: Indicates how revenue is recognized.
    - `IMMEDIATE`
    - `DEFERRED`
    - `MILESTONE`

- **TaxProvider**: Options for tax calculation methods.
    - `AVALARA`
    - `TAXJAR`
    - `INTERNAL`

### Schemas
- **SubscriptionPlanSchema**: Validation schema for a subscription plan, including properties:
    - `id`: Unique identifier for the plan (string).
    - `name`: Name of the plan (string).
    - `description`: Optional description of the plan (string).
    - `pricing_model`: Pricing model type (PricingModel).
    - `base_price`: Base price of the subscription (number).
    - `billing_interval`: Billing interval (BillingInterval).
    - `trial_period_days`: Number of trial days (number).
    - `setup_fee`: Setup fee for the subscription (number).
    - `features`: List of key features (array of strings).
    - `usage_limits`: Optional usage limits (record of number).
    - `tier_config`: Optional tier configuration (array of objects).
    - `metadata`: Optional metadata (record of any).

- **SubscriptionSchema**: Validation schema for subscription configuration with properties:
    - `id`: Unique identifier for the subscription (string).
    - `customer_id`: ID of the customer (string).
    - `plan_id`: ID of the associated plan (string).
    - `status`: Current status (SubscriptionStatus).
    - `current_period_start`: Start date of the current billing period.

## Return Values
The engine methods typically return promises that resolve to the created or updated subscription details, or status messages in the case of actions such as cancellation. 

## Examples

### Creating a Subscription Plan
```typescript
const newPlan = {
  id: "basic-plan",
  name: "Basic Plan",
  description: "A basic subscription plan with limited features.",
  pricing_model: PricingModel.FLAT_RATE,
  base_price: 9.99,
  billing_interval: BillingInterval.MONTHLY,
  trial_period_days: 14,
  setup_fee: 0,
  features: ["Feature 1", "Feature 2"],
};

const validatedPlan = SubscriptionPlanSchema.parse(newPlan);
// Proceed with creating the subscription plan in the database
```

### Managing a Subscription
```typescript
const subscriptionData = {
  id: "sub_123456",
  customer_id: "cust_123456",
  plan_id: "basic-plan",
  status: SubscriptionStatus.ACTIVE,
  current_period_start: new Date().toISOString(),
};

// Validate and create the subscription
const validatedSubscription = SubscriptionSchema.parse(subscriptionData);
// Call method to save validatedSubscription to database
```

This documentation serves as a concise guide to understanding the architecture and usage of the Subscription Billing Engine.