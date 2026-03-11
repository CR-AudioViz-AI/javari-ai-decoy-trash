# Create Procedural World Generation Service

```markdown
# Procedural World Generation Service

## Purpose
The Procedural World Generation Service is designed for generating infinite and diverse virtual worlds for the CR AudioViz Craiverse platform. It leverages AI to ensure narrative coherence and variety, allowing for the creation of richly detailed environments suitable for audio-visual experiences.

## Usage
To use the service, import the necessary interfaces and functions into your application. Utilize the provided types and methods to configure and generate different biomes and terrain features within the virtual worlds.

## Parameters/Props

### WorldCoordinate
Defines the coordinates of a point in the world.
```typescript
interface WorldCoordinate {
  x: number; // X-axis coordinate
  y: number; // Y-axis coordinate
  z: number; // Z-axis coordinate
}
```

### ChunkDimensions
Specifies the dimensions of the world chunks.
```typescript
interface ChunkDimensions {
  width: number;     // Width of the chunk
  height: number;    // Height of the chunk
  depth: number;     // Depth of the chunk
  resolution: number; // Resolution of the chunk
}
```

### BiomeType
Represents various biomes that can be generated.
```typescript
type BiomeType = 
  | 'forest' 
  | 'desert' 
  | 'ocean' 
  | 'mountain' 
  | 'arctic' 
  | 'swamp'
  | 'grassland' 
  | 'volcanic' 
  | 'crystal_cave' 
  | 'floating_islands'
  | 'underwater' 
  | 'cloud_realm' 
  | 'void_space' 
  | 'dreamscape';
```

### BiomeConfig
Configuration parameters for each biome.
```typescript
interface BiomeConfig {
  id: string;                     // Unique identifier for the biome
  type: BiomeType;                // Type of the biome
  name: string;                   // Name of the biome
  temperature: number;            // Temperature (-1 to 1)
  humidity: number;               // Humidity (0 to 1)
  elevation: number;              // Elevation (0 to 1)
  fertility: number;              // Fertility (0 to 1)
  danger_level: number;           // Danger level (0 to 1)
  audio_environment: string[];    // List of audio environments
  color_palette: string[];        // Color palette for the biome
  weather_patterns: WeatherPattern[]; // Array of weather patterns
  landmark_probability: number;   // Probability of landmarks appearing
}
```

### WeatherPattern
Definition of weather patterns affecting the biome.
```typescript
interface WeatherPattern {
  type: 'clear' | 'rain' | 'storm' | 'fog' | 'snow' | 'wind' | 'magical'; // Weather type
  intensity: number;                // Intensity (0 to 1)
  duration_minutes: number;         // Duration of the weather effect in minutes
  audio_effects: string[];          // Associated audio effects
  visibility_modifier: number;      // Visibility adjustment (0 to 1)
}
```

### HeightMap
Structure for terrain height data.
```typescript
interface HeightMap {
  width: number;      // Width of the height map
  height: number;     // Height of the height map
  data: Float32Array; // Array of height values
  min_height: number; // Minimum height value
  max_height: number; // Maximum height value
}
```

### WorldChunk
Represents a section of the world.
```typescript
interface WorldChunk {
  id: string;              // Unique identifier
  coordinates: WorldCoordinate; // Coordinates of the chunk
  // Additional properties may be defined here
}
```

## Return Values
The service generates world data based on the parameters specified. The output includes biome configurations, height maps, and specific world chunks.

## Examples
Generate a new forest biome with a unique configuration:

```typescript
const forestBiome: BiomeConfig = {
  id: "1",
  type: "forest",
  name: "Enchanted Forest",
  temperature: 0.5,
  humidity: 0.7,
  elevation: 0.2,
  fertility: 0.8,
  danger_level: 0.3,
  audio_environment: ["birds_chirping", "wind_rustling"],
  color_palette: ["#228B22", "#006400", "#8B4513"],
  weather_patterns: [
    { type: "clear", intensity: 0.9, duration_minutes: 60, audio_effects: [], visibility_modifier: 1 },
    { type: "rain", intensity: 0.