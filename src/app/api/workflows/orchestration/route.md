# Build Multi-Agent Workflow Orchestration API

# Multi-Agent Workflow Orchestration API Documentation

## Purpose
The Multi-Agent Workflow Orchestration API facilitates the orchestration of complex workflows involving multiple agents. It allows users to define workflows, execute them, and manage their state through a structured API.

## Usage
This API is built using TypeScript and integrates with Supabase for database operations and Redis for caching and state management. It allows creating, executing, and controlling workflows through defined endpoints.

## Parameters/Props

### Workflow Node Schema
- **id**: `string` - Unique identifier for the node.
- **type**: `enum` - Type of the node, options: `task`, `condition`, `parallel`, `merge`, `start`, `end`.
- **name**: `string` - Friendly name of the node.
- **agentRequirements**: `object` (optional) - Specifications for agent capabilities.
  - **capabilities**: `array<string>` - List of required capabilities.
  - **minSkillLevel**: `number` (1-10) - Minimum skill level for the agents.
  - **preferredAgents**: `array<string>` - List of preferred agents (optional).
- **conditions**: `array<object>` (optional) - List of conditions for node execution.
- **parallelBranches**: `array<string>` (optional) - Nodes to execute in parallel.
- **taskConfig**: `object` (optional) - Configuration specific to the task.
- **timeout**: `number` - Timeout for the node execution (optional).
- **retries**: `number` - Number of retries on failure (optional).

### Workflow Definition Schema
- **name**: `string` (1-255 characters) - Name of the workflow.
- **description**: `string` (optional) - Description of the workflow.
- **nodes**: `array<WorkflowNodeSchema>` - List of nodes in the workflow.
- **edges**: `array<object>` - Connections between nodes.
  - **from**: `string` - Node to connect from.
  - **to**: `string` - Node to connect to.
  - **condition**: `string` (optional) - Condition for transition.
- **priority**: `enum` - Execution priority: `low`, `medium`, `high`, `urgent` (default: `medium`).
- **maxExecutionTime**: `number` - Maximum execution time in seconds (optional).
- **tags**: `array<string>` - Tags associated with the workflow (optional).

### Workflow Execution Schema
- **workflowId**: `string` (UUID) - Identifier for the workflow to execute.
- **inputData**: `object` - Input data for the workflow execution.
- **priority**: `enum` - Execution priority (default: `medium`).
- **executionMode**: `enum` - Execution mode: `sync` or `async` (default: `async`).

### Workflow Control Schema
- **action**: `enum` - Control actions such as pause, resume, or cancel.

## Return Values
The API returns:
- **Success**: Workflow execution details including status, execution ID, and any output data.
- **Error**: Error details with specific messages if validation or execution fails.

## Examples

### Create Workflow
```typescript
const createWorkflowResponse = await createWorkflow({
  name: "Example Workflow",
  nodes: [...],
  edges: [...]
});
```

### Execute Workflow
```typescript
const executeResponse = await executeWorkflow({
  workflowId: "91de08b7-1e92-4a4f-9b35-56f1426c84a1",
  inputData: { key: "value" }
});
```

### Control Workflow
```typescript
const controlResponse = await controlWorkflow({ action: "pause" });
```

This documentation provides an overview of how to utilize the Multi-Agent Workflow Orchestration API for defining, executing, and managing workflows.