# Implement Tiered Subscription Service

# SubscriptionService Documentation

## Purpose
The `SubscriptionService` provides an implementation for managing tiered subscription services, including tier configuration, subscription status tracking, and usage analytics. It integrates with Supabase for database operations and Stripe for payment processing.

## Usage
The `SubscriptionService` class facilitates interactions related to subscription tiers and user subscriptions. Its methods support creating, updating, and retrieving subscriptions, as well as handling associated usage records.

## Parameters / Props

### Interface: `SubscriptionTier`
Defines the properties for each subscription tier.

- `id`: Unique identifier for the subscription tier.
- `name`: Display name of the tier.
- `slug`: URL-friendly identifier.
- `description`: Description of the tier features.
- `monthlyPrice`: Price per month.
- `annualPrice`: Price per year.
- `stripePriceId`: Stripe price ID for monthly billing.
- `stripeAnnualPriceId`: Stripe price ID for annual billing.
- `features`: List of features included in the tier.
- `limits`: `Limits` object encapsulating:
  - `maxProjects`
  - `maxStorageGB`
  - `maxBandwidthGB`
  - `maxCollaborators`
  - `maxExportsPerMonth`
  - `maxAICredits`
- `usageBased`: Configurations for usage-based pricing.
- `autoUpgrade`: Rules for automatic tier upgrades based on thresholds.
- `priority`: Integer indicating tier priority.

### Interface: `Subscription`
Represents a user's subscription instance.

- `id`: Unique identifier for the subscription.
- `userId`: Identifier for the associated user.
- `tierId`: Identifier for the subscription tier.
- `status`: Current status of the subscription.
- `stripeSubscriptionId`: Stripe subscription ID.
- `stripeCustomerId`: Stripe customer ID.
- `currentPeriodStart`: Start date for the billing period.
- `currentPeriodEnd`: End date for the billing period.
- `cancelAtPeriodEnd`: Boolean flag indicating end-of-period cancellation.
- `trialEnd`: End date of the trial period (if applicable).
- `usage`: Current usage record.
- `metadata`: Additional metadata related to the subscription.
- `createdAt`: Creation timestamp.
- `updatedAt`: Last updated timestamp.

### Interface: `UsageRecord`
Tracks usage for a specific subscription.

- `subscriptionId`: Identifier for the related subscription.
- `periodStart`: Start date of the usage period.
- `periodEnd`: End date of the usage period.
- `usage`: Object containing usage metrics.
- `overages`: Object detailing any overages incurred.

## Return Values
The methods in `SubscriptionService` typically return:
- Successful operation results, often including the newly created or updated subscription object.
- Error responses in case of issues like invalid input or failed payments.

## Examples

### Creating a Subscription Tier
```typescript
const newTier: SubscriptionTier = {
  id: 'basic',
  name: 'Basic Plan',
  slug: 'basic',
  description: 'Basic features for new users.',
  monthlyPrice: 10,
  annualPrice: 100,
  stripePriceId: 'price_123',
  stripeAnnualPriceId: 'price_456',
  features: ['Email support', '10GB Storage'],
  limits: {
    maxProjects: 5,
    maxStorageGB: 10,
    maxBandwidthGB: 100,
    maxCollaborators: 2,
    maxExportsPerMonth: 10,
    maxAICredits: 50,
  },
  usageBased: {
    enabled: false,
    overageRates: {
      storage: 0.1,
      bandwidth: 0.05,
      exports: 2,
      aiCredits: 0.5,
    }
  },
  autoUpgrade: {
    enabled: true,
    revenueThreshold: 1000,
  },
  priority: 1,
};
```

### Creating a New Subscription
```typescript
const userId = 'user_123';
const subscription: Subscription = await subscriptionService.createSubscription(userId, 'basic');
```

This documentation provides a concise overview of the `SubscriptionService`, its interfaces, usage, parameters, return values, and examples.