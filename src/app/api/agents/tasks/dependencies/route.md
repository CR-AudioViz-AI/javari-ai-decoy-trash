# Create Agent Task Dependency API

```markdown
# Task Dependency API

## Purpose
The Task Dependency API is designed to manage dependencies between tasks in an agent-based system. It allows for the establishment of relationships between tasks, validation of dependency graphs, and execution planning based on task dependencies.

## Usage
This API provides methods for creating task dependencies, validating dependency graphs, and generating execution orders based on the defined dependencies. It leverages Supabase for data handling and uses Zod for schema validation.

## Parameters/Props

### TaskDependencySchema
Defines the structure for creating a task dependency.
- **task_id** (string): UUID of the task.
- **depends_on_task_id** (string): UUID of the task that this task depends on.
- **dependency_type** (enum): Type of dependency (options: 'hard', 'soft', 'conditional').
- **blocking_condition** (string, optional): Condition under which the task is blocked.
- **weight** (number): A value between 0 and 100 indicating the importance of this dependency. Defaults to 50.
- **metadata** (object, optional): Additional metadata for the dependency.

### DependencyValidationSchema
Validates the task dependency graph.
- **task_ids** (array of strings): List of UUIDs of tasks involved.
- **dependency_graph** (object): A record mapping task IDs to arrays of task IDs they depend on.

### ExecutionOrderSchema
Specifies parameters for generating the execution order.
- **agent_id** (string): UUID of the agent.
- **include_parallel** (boolean): Whether to include parallel execution. Defaults to true.
- **max_parallel** (number): Maximum number of tasks to run in parallel. Defaults to 3, within the range of 1 to 10.

### BlockingResolutionSchema
Defines the resolution for blocked tasks.
- **task_id** (string): UUID of the blocked task.
- **resolution_action** (enum): Action to take (options: 'force_continue', 'skip_dependency', 'retry', 'cancel').
- **reason** (string): Reason for the resolution that must have at least one character.

## Return Values
- **createDependency**: Returns a promise that resolves to an object of type `TaskDependency`, representing the created dependency.
- **validateGraph**: Returns validation results for the dependency graph.
- **generateExecutionOrder**: Returns an execution plan conforming to the `ExecutionPlan` interface.

## Examples

### Creating a Task Dependency
```typescript
const newDependency = {
  task_id: "123e4567-e89b-12d3-a456-426614174000",
  depends_on_task_id: "123e4567-e89b-12d3-a456-426614174001",
  dependency_type: 'hard',
  blocking_condition: "awaiting approval",
  weight: 60,
  metadata: { comments: "High priority" }
};

const created = await taskDependencyManager.createDependency(newDependency);
console.log(created);
```

### Validating a Dependency Graph
```typescript
const validationResult = await taskDependencyManager.validateGraph({
  task_ids: ["123e4567-e89b-12d3-a456-426614174000", "123e4567-e89b-12d3-a456-426614174001"],
  dependency_graph: {
    "123e4567-e89b-12d3-a456-426614174000": ["123e4567-e89b-12d3-a456-426614174001"]
  }
});
console.log(validationResult);
```

### Generating Execution Order
```typescript
const executionPlan = await taskDependencyManager.generateExecutionOrder({
  agent_id: "123e4567-e89b-12d3-a456-426614174002",
  include_parallel: true,
  max_parallel: 4
});
console.log(executionPlan);
```
```