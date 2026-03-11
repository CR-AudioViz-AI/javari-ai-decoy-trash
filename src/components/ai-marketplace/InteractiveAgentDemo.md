# Build Interactive Agent Demo Environment

# InteractiveAgentDemo Component Documentation

## Purpose
The `InteractiveAgentDemo` component provides an interactive environment for users to explore and engage with AI agents. It allows users to view agent details, initiate demos, and handle purchasing, all while maintaining an engaging user interface.

## Usage
To use the `InteractiveAgentDemo` component, include it in your React application by providing the required props. This component is designed to be used where interactive AI agent functionality is desired.

```javascript
import InteractiveAgentDemo from 'src/components/ai-marketplace/InteractiveAgentDemo';

// Example usage within a parent component
<InteractiveAgentDemo
  agentId="agent-123"
  onPurchase={(id) => console.log(`Purchased agent with ID: ${id}`)}
  onClose={() => console.log('Demo closed')}
/>
```

## Parameters/Props
The `InteractiveAgentDemo` component accepts the following props:

| Prop         | Type          | Description                                                  |
|--------------|---------------|--------------------------------------------------------------|
| `agentId`    | string        | Unique identifier of the agent to be demonstrated.          |
| `onPurchase` | function      | Callback function to handle agent purchase, receives `agentId` as an argument. |
| `onClose`    | function      | Callback function called when the demo is closed.           |
| `className`  | string        | Optional additional CSS classes for custom styling.         |

## Return Values
The `InteractiveAgentDemo` component does not return any values directly. It renders the interactive demo interface for the specified agent. It invokes the `onPurchase` and `onClose` callbacks based on user actions (e.g., button clicks).

## Examples
Here are some example use cases for the `InteractiveAgentDemo` component:

### Basic Demo
```javascript
<InteractiveAgentDemo
  agentId="agent-123"
/>
```

### With Callbacks
```javascript
<InteractiveAgentDemo
  agentId="agent-456"
  onPurchase={(agentId) => alert(`Congratulations on purchasing agent ${agentId}!`)}
  onClose={() => console.log('Thank you for trying the demo!')}
/>
```

### Styling with ClassName
```javascript
<InteractiveAgentDemo
  agentId="agent-789"
  className="custom-demo-class"
/>
```

## Summary
The `InteractiveAgentDemo` component is a versatile tool for showcasing AI agents, providing an interface for users to interact, demo, and purchase agents seamlessly. It can be easily integrated into any React application with minimal configuration.