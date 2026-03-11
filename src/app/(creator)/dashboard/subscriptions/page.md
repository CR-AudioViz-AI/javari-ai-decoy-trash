# Build Creator Subscription Dashboard

# Creator Subscription Dashboard Documentation

## Purpose
The `Creator Subscription Dashboard` provides a user interface for creators to manage their subscription offerings, including subscription tiers, A/B testing features, and performance insights. It allows creators to visualize subscription metrics, edit existing tiers, and observe subscriber feedback.

## Usage
Import the component into your application as follows:

```tsx
import SubscriptionDashboard from 'src/app/(creator)/dashboard/subscriptions/page';
```

Use the component as part of your JSX:

```tsx
<SubscriptionDashboard />
```

## Parameters/Props
The component does not accept any external props. It manages its state internally and handles the interaction with the data through hooks provided by `react-query`.

## Return Values
The `SubscriptionDashboard` component does not return any specific values but renders a complete UI for managing subscriptions. It encompasses various UI elements such as cards, buttons, forms, and charts to facilitate user interactions and display data effectively.

### Internal Interfaces

- `SubscriptionTier`:
  - `id`: Unique identifier for the subscription tier.
  - `name`: Name of the subscription tier.
  - `description`: Description of the tier features.
  - `price`: Cost of the tier.
  - `billing_interval`: Frequency of payment ('monthly' or 'yearly').
  - `features`: List of features included in the tier.
  - `is_active`: Indicates if the tier is currently active.
  - `subscriber_count`: Number of subscribers currently using this tier.
  - `stripe_product_id`: The Stripe product ID associated with the tier.
  - `stripe_price_id`: The Stripe price ID associated with the tier.
  - `created_at`: Timestamp of when the tier was created.
  - `updated_at`: Timestamp of when the tier was last updated.

- `ABTest`:
  - `id`: Unique identifier for the A/B test.
  - `name`: Name of the A/B test.
  - `description`: Description of the test.
  - `test_type`: Type of the test (e.g., 'price', 'features', 'description').
  - `status`: Current status of the test (e.g., 'draft', 'running', 'completed').

## Example
Here is a code snippet demonstrating the integration of the `SubscriptionDashboard`:

```tsx
import React from 'react';
import SubscriptionDashboard from 'src/app/(creator)/dashboard/subscriptions/page';

const CreatorPage = () => {
  return (
    <div>
      <h1>My Subscription Dashboard</h1>
      <SubscriptionDashboard />
    </div>
  );
};

export default CreatorPage;
```

This example illustrates how to include the dashboard within a larger creator-focused page, allowing for management of subscriptions seamlessly.