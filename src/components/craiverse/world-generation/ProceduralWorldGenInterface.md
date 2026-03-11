# Build Procedural World Generation Interface

# Procedural World Generation Interface

## Purpose
The `ProceduralWorldGenInterface` component provides a graphical user interface (GUI) for generating procedural worlds. It enables users to manipulate various settings and parameters to create custom landscapes, including terrain types, biomes, and world objects.

## Usage
To use the `ProceduralWorldGenInterface`, import it into your component and render it within the React tree. Ensure you have the necessary styles and dependencies from the UI components specified in this component.

```tsx
import ProceduralWorldGenInterface from 'src/components/craiverse/world-generation/ProceduralWorldGenInterface';

const App = () => {
  return (
    <div>
      <h1>World Generator</h1>
      <ProceduralWorldGenInterface />
    </div>
  );
};

export default App;
```

## Parameters/Props
The `ProceduralWorldGenInterface` does not accept any props directly but manages its internal state and handles user interactions for world generation settings.

### Internal State
- **worldObjects**: An array of `WorldObject` that defines the objects in the generated world.
- **terrainSettings**: An object of type `TerrainSettings` for configuring procedural terrain generation.
- **biomeRules**: An array of `BiomeRule` defining the properties and types of biomes available.

### Interfaces
- **WorldObject**: 
  - `id: string`
  - `type: string`
  - `name: string`
  - `icon: React.ReactNode`
  - `position: { x: number; y: number }`
  - `scale: number`
  - `rotation: number`
  - `properties: Record<string, any>`
  
- **TerrainSettings**: 
  - `seed: number`
  - `scale: number`
  - `octaves: number`
  - `persistence: number`
  - `lacunarity: number`
  - `heightMultiplier: number`
  - `waterLevel: number`
  
- **BiomeRule**: 
  - `id: string`
  - `name: string`
  - `heightRange: [number, number]`
  - `moistureRange: [number, number]`
  - `temperatureRange: [number, number]`
  - `color: string`
  - `objects: string[]`

## Return Values
The component does not return values in a typical sense but handles state internally. The user can generate a procedural world based on their input, and the internal state can be accessed via potential callbacks or context providers as needed.

## Examples
### Generating a Random World
When the user changes the settings via sliders or inputs, the component uses the updated parameters to regenerate the world whenever the settings change. 

```tsx
<Slider 
  value={terrainSettings.scale} 
  onValueChange={(value) => setTerrainSettings({ ...terrainSettings, scale: value })} 
/>
<Button onClick={generateWorld}>Generate World</Button>
```

### Applying Biome Rules
Users can select from different biome rules, which can influence the final outcome of the procedural generation.

```tsx
<Select onValueChange={(value) => applyBiomeRule(value)}>
  {biomeRules.map((rule) => (
    <SelectItem key={rule.id} value={rule.id}>
      {rule.name}
    </SelectItem>
  ))}
</Select>
```
This interface is designed to work seamlessly with state management practices in React, ensuring that the procedural world generation is both dynamic and responsive to user interactions.