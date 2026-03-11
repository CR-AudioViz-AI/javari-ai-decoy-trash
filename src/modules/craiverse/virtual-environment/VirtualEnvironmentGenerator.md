# Build CRAIverse Virtual Environment Generator

# CRAIverse Virtual Environment Generator

## Purpose
The CRAIverse Virtual Environment Generator is designed to create immersive 3D environments for the CRAIverse platform using specifications defined through interfaces. It integrates with Three.js for rendering and Cannon.js for physics, providing customizable presets for scenery, interactivity, and performance settings.

## Usage
To use the Virtual Environment Generator, instantiate it with configurations and invoke methods to generate the 3D environment as per your specifications. You'll need to ensure the required libraries (Three.js and Cannon.js) are properly imported and available in your project.

### Example Initialization
```typescript
import { VirtualEnvironmentGenerator } from './src/modules/craiverse/virtual-environment/VirtualEnvironmentGenerator';

const generator = new VirtualEnvironmentGenerator();
// Pass configurations to the generator to create the environment
generator.createEnvironment(environmentConfig);
```

## Parameters/Props

### EnvironmentPreset
The `EnvironmentPreset` interface defines the structure to configure the environment:

- **id**: Unique identifier for the preset (string)
- **name**: Display name (string)
- **skybox**: Array of skybox images (string[])
- **lighting**: Object defining lighting settings
  - **ambient**: Ambient light settings (color, intensity)
  - **directional**: Directional light settings (color, intensity, position)
  - **fog**: Optional fog settings (color, near, far)
- **terrain**: Optional terrain configuration
  - **type**: Terrain type ('plane', 'heightmap', 'custom')
  - **texture**: Texture URL (string)
  - **scale**: Scaling factors (number[])
- **objects**: Array of objects to include in the scene
- **physics**: Physics settings including gravity and material properties
- **particles**: Optional particle effects (snow, rain, etc.)
- **audio**: Optional audio settings for ambient and spatial sounds

### InteractiveElement
Defines interactive elements within the environment:

- **id**: Unique identifier (string)
- **mesh**: Three.js mesh object
- **body**: Optional Cannon.js body
- **interactions**: Interaction behavior (hover, click, collision)
- **audioSource**: Audio component associated with the interactive element

### PerformanceSettings
Specifies optimization settings for rendering:

- **enableLOD**: Enable Level of Detail (boolean)
- **enableFrustumCulling**: Enable frustum culling (boolean)
- **maxDrawCalls**: Maximum number of draw calls (number)
- **shadowMapSize**: Size of the shadow map (number)
- **antialias**: Enable anti-aliasing (boolean)
- **pixelRatio**: Pixel ratio for rendering (number)

## Return Values
The generator functions will return promissory structures or the created 3D environment object upon successful execution. This object can then be rendered in a Three.js scene.

## Example Environment Configuration
```typescript
const environmentConfig: EnvironmentPreset = {
  id: 'example_env',
  name: 'Example Environment',
  skybox: ['path/to/skybox1.jpg', 'path/to/skybox2.jpg'],
  lighting: {
    ambient: { color: '#ffffff', intensity: 0.5 },
    directional: { color: '#ffffff', intensity: 1, position: [10, 20, 10] },
  },
  terrain: {
    type: 'heightmap',
    texture: 'path/to/terrain_texture.jpg',
    scale: [1, 1, 1],
  },
  objects: [{ type: 'tree', position: [0, 0, 0] }],
  physics: {
    gravity: [0, -9.81, 0],
    materials: { default: { friction: 0.5, restitution: 0.2 } },
  },
};
```

This documentation serves as a concise guide for developers integrating the CRAIverse Virtual Environment Generator into their applications.