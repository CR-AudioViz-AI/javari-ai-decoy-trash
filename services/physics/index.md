# Deploy CRAIverse Physics Simulation Service

# CRAIverse Physics Simulation Service Documentation

## Purpose
The CRAIverse Physics Simulation Service is a high-performance microservice designed to handle realistic object interactions, environmental effects, and complex simulations across multiple concurrent virtual worlds. It supports a variety of physics entities including rigid bodies, soft bodies, and fluid dynamics, making it suitable for gaming, simulations, and other applications requiring advanced physics computations.

## Usage
The service provides an interface for creating and managing physics worlds, adding and removing entities, and synchronizing physics states across clients. It can be integrated into environments that require sophisticated physics engines.

## Parameters / Props
- **PhysicsServiceOptions**: Configuration options for initializing the physics service.
  - `maxWorlds`: The maximum number of concurrent worlds.
  - `gravity`: The default gravity vector for all worlds.
  - `simulationSteps`: Number of simulation steps per update cycle.
  
- **PhysicsWorld**: Represents a simulation world.
  - `worldId`: Unique identifier for the world.
  - `entities`: List of entities in the world.
  
- **PhysicsEntity**: Base type for all physics-related entities, including rigid bodies, soft bodies, and fluids.
  
- **SimulationState**: Contains the current state of the physics simulation.
  
- **PhysicsUpdateResult**: The result of a simulation update, including metrics like elapsed time.

## Return Values
- `initialize(options: PhysicsServiceOptions): Promise<void>`: Initializes the physics service with the provided options.
- `createWorld(worldId: string, config?: Partial<PhysicsWorld>): Promise<PhysicsWorld>`: Creates a new physics world and returns its representation.
- `destroyWorld(worldId: string): Promise<void>`: Destroys the specified world and frees associated resources.
- `addEntity(worldId: string, entity: PhysicsEntity): Promise<string>`: Adds an entity to the specified world and returns the new entity's ID.
- `removeEntity(worldId: string, entityId: string): Promise<void>`: Removes the specified entity from the world.

## Examples
### Initializing the Physics Service
```typescript
const physicsService = new PhysicsService();
await physicsService.initialize({
  maxWorlds: 10,
  gravity: new Vector3(0, -9.81, 0),
  simulationSteps: 60
});
```

### Creating a Physics World
```typescript
const world = await physicsService.createWorld('world1', {
  entities: []
});
```

### Adding an Entity to the World
```typescript
const rigidBody = new RigidBody({ mass: 2, position: new Vector3(0, 10, 0) });
const entityId = await physicsService.addEntity('world1', rigidBody);
```

### Removing an Entity from the World
```typescript
await physicsService.removeEntity('world1', entityId);
```

### Destroying a Physics World
```typescript
await physicsService.destroyWorld('world1');
```

This documentation outlines the essential operations available in the CRAIverse Physics Simulation Service, making it easy for developers to incorporate advanced physics simulation into their applications.