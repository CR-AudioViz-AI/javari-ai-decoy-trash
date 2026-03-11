# Build CRAIverse NPC Behavior Tree Service

# CRAIverse NPC Behavior Tree Service Documentation

## Purpose
The `npc-behavior-tree.service.ts` provides a framework for implementing Non-Player Character (NPC) behavior using a behavior tree structure. It facilitates decision-making processes for NPCs in a game environment, enabling them to interact contextually with their world and other NPCs.

## Usage
The service encapsulates behavior tree nodes, NPC context management, memory handling, and world state tracking. It aims to streamline NPC interactions and state management through asynchronous decision-making processes that can adapt to gameplay dynamics.

## Parameters / Props

### `BehaviorStatus`
- Enum to represent the status of a behavior tree node execution.
  - **SUCCESS**: The behavior executed successfully.
  - **FAILURE**: The behavior failed to execute.
  - **RUNNING**: The behavior is still in progress.

### `IBehaviorTreeNode`
- Interface for defining behavior tree nodes.
  - `id: string`: Unique identifier for the node.
  - `type: string`: Type of behavior (e.g., action, condition).
  - `tick(context: NPCContext): Promise<BehaviorStatus>`: Method for executing the behavior against the provided NPC context.
  - `reset(): void`: Resets the state of the node.
  - `getChildren(): IBehaviorTreeNode[]`: Retrieves child nodes.
  - `addChild(node: IBehaviorTreeNode): void`: Adds a child node.
  - `removeChild(nodeId: string): void`: Removes a child node by ID.

### `NPCContext`
- Contains the state information for the NPC.
  - `npcId: string`: Identifier for the NPC.
  - `position: { x: number; y: number; z: number }`: NPC's spatial coordinates.
  - `health: number`: Current health of the NPC.
  - `energy: number`: Available energy for activities.
  - `mood: string`: Current emotional state.
  - `memory: NPCMemory`: Reference to the NPC's memory system.
  - `worldState: WorldState`: Current environmental state.
  - `deltaTime: number`: Time since the last update.
  - `blackboard: Map<string, any>`: A data structure for temporary information sharing.

### `NPCMemory`
- Interface to handle NPC memory.
  - Methods include:
    - `addMemory(key: string, value: any, importance: number, type: 'short' | 'long')`: Adds a memory item.
    - `getMemory(key: string): MemoryItem | null`: Retrieves a memory item by key.
    - `forgetMemory(key: string): void`: Deletes a memory item.
    - `decay(deltaTime: number): void`: Decays memories over time.

### `WorldState`
- Represents the dynamic state of the game world.
  - `nearbyNPCs`: List of nearby NPCs with their states.
  - `nearbyObjects`: List of nearby objects.
  - `currentEvents`: List of active story events.
  - `environmentData`: Additional environmental data as key-value pairs.

## Return Values
- Each behavior node's `tick` method returns a `Promise<BehaviorStatus>` indicating how the node handled execution based on the provided `NPCContext`.

## Examples
```typescript
const npcContext: NPCContext = {
  npcId: "npc1",
  position: { x: 10, y: 5, z: 0 },
  health: 100,
  energy: 75,
  mood: "happy",
  memory: new NPCMemory(),
  worldState: new WorldState(),
  deltaTime: 0.016, // 16 ms for a frame
  blackboard: new Map(),
};

const behaviorNode: IBehaviorTreeNode = new SomeBehaviorNode();
behaviorNode.tick(npcContext).then(status => {
  console.log(`Behavior Node Status: ${status}`);
});
```

This example demonstrates how to define an `NPCContext` and invoke a behavior node's `tick` method, observing its status.