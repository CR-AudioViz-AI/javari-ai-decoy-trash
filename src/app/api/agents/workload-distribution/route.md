# Build Agent Workload Distribution API

# Workload Distribution API Documentation

## Purpose
The Workload Distribution API is designed to efficiently assign tasks to agents based on their capabilities, current workload, and other configurable options. It ensures optimal distribution of tasks across available agents, enhancing performance and resource management.

## Usage
This API provides endpoints to distribute workload among agents and to rebalance agent workloads based on various strategies. It is intended for use in applications requiring task assignment and agent management related to audio processing, text analysis, data visualization, and report generation.

### Endpoint Overview
- **POST /api/agents/workload-distribution**: Assign a task to an agent.
- **POST /api/agents/rebalance**: Rebalance workloads across agents.

## Parameters/Props

### `taskDistributionSchema`
This schema validates the input for task distribution.

- `task`: An object containing:
    - `id`: (string) Unique identifier for the task.
    - `type`: (enum) Must be one of `['audio_processing', 'text_analysis', 'data_visualization', 'report_generation']`.
    - `priority`: (enum) Must be one of `['low', 'medium', 'high', 'urgent']`.
    - `complexity`: (number) A value between 1 and 10 representing task complexity.
    - `estimatedDuration`: (number) Estimated time in seconds to complete the task (must be positive).
    - `requiredCapabilities`: (array of strings) Capabilities required to complete the task.
    - `metadata`: (object, optional) Additional task-related data.

- `teamId`: (string) UUID of the team responsible for the tasks.

- `options`: (object, optional) Configuration options including:
    - `preferredAgent`: (string) UUID of a preferred agent (optional).
    - `excludeAgents`: (array of strings) UUIDs of agents to exclude from assignment (optional).
    - `maxWaitTime`: (number) Maximum allowable wait time for task assignment (optional).

### `rebalanceSchema`
This schema validates the input for workload rebalancing.

- `teamId`: (string) UUID of the team whose agents need rebalancing.
- `strategy`: (enum, optional) Must be one of `['performance', 'workload', 'capability']`.

## Return Values

### Distribution Result
The API returns a `DistributionResult` object upon successful task assignment, which includes:
- `assignedAgent`: The agent assigned to handle the task.
- `queuePosition`: The position of the task in the agent's queue.
- `estimatedStartTime`: An estimate of when the task will start.
- `reasoning`: The rationale behind the agent selection.

## Examples

### Task Assignment Example
```json
POST /api/agents/workload-distribution
{
  "task": {
    "id": "task-123",
    "type": "audio_processing",
    "priority": "high",
    "complexity": 5,
    "estimatedDuration": 30,
    "requiredCapabilities": ["audio", "processing"],
    "metadata": {
      "description": "Processing audio file"
    }
  },
  "teamId": "team-456",
  "options": {
    "preferredAgent": "agent-789",
    "excludeAgents": ["agent-000"],
    "maxWaitTime": 120
  }
}
```

### Rebalance Example
```json
POST /api/agents/rebalance
{
  "teamId": "team-456",
  "strategy": "performance"
}
```

This document provides a comprehensive overview of the Workload Distribution API, detailing its purpose, usage, input parameters, and expected outputs.