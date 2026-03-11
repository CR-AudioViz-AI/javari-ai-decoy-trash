# Build Premium Content Gating System

```markdown
# Premium Content Gating System

## Purpose
The Premium Content Gating System is designed to provide a subscription-based model that restricts access to premium content for users based on their subscription tier. It allows creators to manage subscriptions, configure pricing tiers, and track revenue analytics.

## Usage
This system is implemented in a React component located at `app/(platform)/creators/premium/page.tsx`. It utilizes Supabase for authentication and data management, and includes UI components for interaction with the subscription system.

## Parameters / Props
The primary interfaces utilized in the system are:

### `PremiumTier`
Describes a subscription tier and its attributes:
- `id`: Unique identifier for the tier.
- `name`: Name of the tier.
- `description`: Brief overview of the tier benefits.
- `price_monthly`: Monthly subscription price.
- `price_yearly`: Annual subscription price.
- `features`: List of features included in this tier.
- `agent_access`: Access levels for agents.
- `max_agents`: Maximum number of agents allowed.
- `max_requests_per_month`: Maximum requests per month allowed.
- `priority_support`: Indicates if priority support is included.
- `custom_branding`: Indicates if custom branding is available.
- `analytics_access`: Access to analytics data.
- `api_access`: Access to API functionalities.
- `created_at`: Timestamp of tier creation.
- `updated_at`: Timestamp of last update.
- `is_active`: Status of the tier (active/inactive).
- `sort_order`: Order for display.

### `Subscription`
Holds information about user subscriptions:
- `id`: Unique identifier for the subscription.
- `user_id`: Identifier for the user.
- `tier_id`: Identifier for the premium tier associated with the subscription.
- `stripe_subscription_id`: Identifier used by Stripe for billing.
- `status`: Current status of the subscription (active, canceled, past_due, unpaid).
- `current_period_start`: Start date of the current billing period.
- `current_period_end`: End date of the current billing period.
- `tier`: Associated `PremiumTier` object.
- `user`: User information including `email` and `full_name`.

### `RevenueAnalytics`
Contains metrics regarding revenue:
- `total_revenue`: Total revenue generated from subscriptions.
- `monthly_recurring_revenue`: Revenue generated monthly from subscriptions.

## Return Values
The component does not return values explicitly as it manages state within the component itself, displaying subscription tiers and user details interactively.

## Examples
```jsx
// Example of how to render the Premium Content Gating System
import PremiumContentGating from '@/app/(platform)/creators/premium/page';

const App = () => {
  return (
    <div>
      <h1>Premium Content Management</h1>
      <PremiumContentGating />
    </div>
  );
};
```

The component will show options for users to subscribe to different premium tiers and will display subscription status and analytics when applicable.

### Notes
Ensure to set up Supabase client and UI components as per project requirements for full functionality.
```