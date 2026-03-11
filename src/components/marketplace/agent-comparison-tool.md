# Build Agent Side-by-Side Comparison Tool

# Agent Side-by-Side Comparison Tool Documentation

## Purpose
The Agent Side-by-Side Comparison Tool is a React component designed to facilitate the comparison of various agents across different metrics, features, and user reviews. It presents the information in a visually organized format, allowing users to make informed decisions when selecting agents based on their needs.

## Usage
To utilize the `AgentComparisonTool` component, import it into your React application. Ensure that your environment is set up for a Next.js project and that the required dependencies (e.g., Supabase, Recharts) are installed.

```tsx
import AgentComparisonTool from 'src/components/marketplace/agent-comparison-tool';

// Usage in a Next.js component
const MyComponent = () => {
  return (
    <div>
      <AgentComparisonTool />
    </div>
  );
};
```

## Parameters/Props

The `AgentComparisonTool` accepts no props directly. It leverages several internal states and React Query for fetching and managing data pertaining to agents, metrics, features, and reviews. It relies on the Next.js routing and authentication mechanisms for client-side navigation and data privacy.

### Key UI Elements:
- **Card**: Structure to hold agent details.
- **Table**: Display agent metrics and features in a tabular format.
- **Select**: Dropdowns to filter agents and compare specific features.
- **Tabs**: Navigation among different comparison categories (metrics, features, and reviews).
  
## Return Values
The `AgentComparisonTool` does not return values as a standard function would. Instead, it renders UI elements directly onto the page, comprising information about the available agents fetched from a database.

## Examples

### Basic Setup
To include the comparison tool in your application:

```tsx
import AgentComparisonTool from 'src/components/marketplace/agent-comparison-tool';

export default function MarketplacePage() {
  return (
    <div>
      <h1>Agent Comparison</h1>
      <AgentComparisonTool />
    </div>
  );
}
```

### Fetching and Displaying Data
The component utilizes React Query to fetch agent details based on user interaction, i.e., selecting specific agents to compare:

```tsx
// Inside the AgentComparisonTool implementation
const { data: agentsData, isLoading } = useQuery(['agents'], fetchAgents);

if (isLoading) {
  return <div>Loading...</div>;
}

// Render the agents’ comparison based on the fetched data
return (
  <div>
    {/* Logic to map and display agents info in tables and charts */}
  </div>
);
```

## Conclusion
The Agent Side-by-Side Comparison Tool streamlines the process of evaluating different agents through an interactive and user-friendly interface. By utilizing various UI components and hooks from React and Next.js, it enhances the user experience while providing essential data for making comparison-based decisions.