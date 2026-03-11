# Build Interactive Agent Demo Playground

# AgentDemoPlayground Documentation

## Purpose
The `AgentDemoPlayground` component facilitates an interactive environment for users to demo AI agents. Users can input parameters, observe agent behavior, and analyze outputs in a user-friendly interface. The component supports various UI elements to enhance user interaction and visual feedback.

## Usage
To implement the `AgentDemoPlayground` component, import it into your React application and use it within your JSX. Ensure that the necessary dependencies are installed and that your application is set up to manage state appropriately. 

### Example
```tsx
import AgentDemoPlayground from '@/components/marketplace/AgentDemoPlayground';

function App() {
  return (
    <div>
      <h1>AI Agent Demo</h1>
      <AgentDemoPlayground />
    </div>
  );
}
```

## Parameters/Props
The `AgentDemoPlayground` may accept the following props, defined as types based on the implementation:

- **agent**: An object of type `Agent` representing the AI agent to be demoed.
- **session**: An object of type `DemoSession` to manage the current state and data of the demo session.
- **onRun**: A callback function that triggers when the demo is executed.
- **user**: An object representing the current user to track session data.

### Type Definitions
- **Agent**: 
  - `id: string`
  - `name: string`
  - `description: string`
  - `category: string`
  - `parameters: AgentParameter[]`
  - `pricing: Pricing`
  - `capabilities: string[]`
  - `version: string`
  - `publisher: Publisher`

- **Pricing**:
  - `type: 'free' | 'usage' | 'subscription'`
  - `rate?: number`
  - `unit?: string`

- **AgentParameter**:
  - `name: string`
  - `type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect'`
  - `description: string`
  - `required: boolean`
  - `default?: any`
  - `options?: string[]`
  - `min?: number`
  - `max?: number`
  - `validation?: string`

- **DemoSession**:
  - `id: string`
  - `agentId: string`
  - `userId?: string`
  - `parameters: Record<string, any>`
  - `input: string`
  - `output?: string`
  - `status: 'idle' | 'running' | 'completed' | 'error'`
  - `startTime: Date`
  - `endTime?: Date`
  - `duration?: number`
  - `tokensUsed?: number`
  - `cost?: number`
  - `error?: string`

## Return Values
The `AgentDemoPlayground` component does not return a value but renders a complete interactive playground for demonstrating the AI agent. It manages internal state for demo sessions, input/output handling, and provides visual components like buttons, sliders, and tabs to enrich user experience.

## Key Features
- Interactive input fields for agent parameters.
- Visual state indicators (e.g., Progress) to show session status.
- Error handling and display to manage failed interactions.
- Data tracking for session metrics like duration and cost.

This component is integral to showcasing the capabilities of AI agents in a real-time demonstration setting, allowing users to engage efficiently with advanced technologies.