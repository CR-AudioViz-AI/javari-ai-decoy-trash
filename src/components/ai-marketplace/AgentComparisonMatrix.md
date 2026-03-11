# Create Agent Comparison Matrix Interface

# Agent Comparison Matrix Interface Documentation

## Purpose
The `AgentComparisonMatrix` component provides an interactive interface to compare AI agents based on various attributes such as features, pricing, metrics, and reviews. Users can drag and drop agents to customize their view, enabling them to make informed decisions when selecting an agent for their needs.

## Usage
To include the `AgentComparisonMatrix` in your React application, import the component and pass required data as props such as the list of agents. You can customize the display of features and metrics, as well as enable drag-and-drop functionality for arranging the agents.

```tsx
import AgentComparisonMatrix from './src/components/ai-marketplace/AgentComparisonMatrix';

const agents = [/* Array of Agent objects */];

const App = () => {
  return (
    <AgentComparisonMatrix agents={agents} />
  );
};
```

## Parameters / Props

| Prop      | Type                 | Required | Description                                                  |
|-----------|----------------------|----------|--------------------------------------------------------------|
| `agents`  | `Agent[]`            | Yes      | An array of agent objects to be compared.                    |

### Agent Interface
The `Agent` interface represents each agent's data structure, outlined as follows:

```tsx
interface Agent {
  id: string;         // Unique identifier for the agent
  name: string;       // Name of the agent
  description: string; // Brief description of the agent
  logo: string;       // Logo URL for the agent
  category: string;   // Category under which the agent belongs
  provider: string;   // Name of the provider
  version: string;    // Version of the agent
  features: AgentFeature[]; // List of features associated with the agent
  pricing: PricingTier[];   // Pricing details
  metrics: AgentMetrics;     // Performance metrics
  reviews: ReviewSummary;     // Summary of reviews
  tags: string[];          // Tags for categorization
  verified: boolean;       // Verification status
  lastUpdated: Date;      // Last updated timestamp
}
```

### AgentFeature Interface
```tsx
interface AgentFeature {
  id: string;       // Unique identifier for the feature
  category: string; // Category to which the feature belongs
  name: string;     // Name of the feature
  description: string; // Description of the feature
  supported: boolean | 'partial'; // Support status of the feature
  value?: string;       // Optional value related to the feature
  icon?: string;        // Optional icon representing the feature
}
```

### PricingTier Interface
```tsx
interface PricingTier {
  name: string;       // Name of the pricing tier
  price: number;      // Price amount for the tier
  period: 'month' | 'year' | 'usage'; // Billing period
  currency: string;   // Currency of the price
}
```

## Return Values
The `AgentComparisonMatrix` component does not return any values but renders a user interface that allows interaction with the provided agents' data.

## Examples
Basic usage to create a comparison matrix:

```tsx
const agents: Agent[] = [
  {
    id: 'agent1',
    name: 'Agent One',
    description: 'This is agent one.',
    logo: '/path/to/logo1.png',
    category: 'Category A',
    provider: 'Provider A',
    version: '1.0',
    features: [
      { id: 'feature1', name: 'Feature A', description: 'Description of feature A', category: 'Category A', supported: true },
    ],
    pricing: [{ name: 'Basic', price: 10, period: 'month', currency: 'USD' }],
    metrics: {}, // Add metrics object here
    reviews: {}, // Add reviews summary here
    tags: ['tag1', 'tag2'],
    verified: true,
    lastUpdated: new Date(),
  },
  // Add more agents...
];

<AgentComparisonMatrix agents={agents} />
```

This example showcases how to use the `AgentComparisonMatrix` component with a list of agents and their features. The component handles drag-and-drop functionality and presents a comparison matrix suitable for user interactions.