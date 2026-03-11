# Build Avatar Genetics and Evolution API

# Avatar Genetics and Evolution API Documentation

## Purpose
The Avatar Genetics and Evolution API provides functionality for managing and simulating genetic traits and evolutionary processes of avatars. It allows the creation of genetic profiles, updates based on environmental interactions, and simulation of traits and mutations over generations.

## Usage
This API handles three primary operations: creating a genetic profile, triggering evolutionary changes, and breeding avatars. It utilizes schemas for validation and ensures data integrity throughout its operations.

## Parameters / Props

### CreateGeneticsSchema
- **avatarId**: `string` (uuid) - Unique identifier of the avatar.
- **parentGenetics**: `array` (optional) - Array of parent genetics IDs of the avatar (uuid).
- **environmentalFactors**: `object` (optional) - Key-value pairs of environmental factors influencing genetics.
- **initialTraits**: `object` (optional) - Initial trait definitions for the avatar.

### EvolutionTriggerSchema
- **avatarId**: `string` (uuid) - Unique identifier of the avatar to be evolved.
- **interactionType**: `string` (enum) - Type of interaction: 'social', 'environmental', 'challenge', 'time'.
- **intensity**: `number` - Intensity of the evolutionary trigger, between 0 and 1.
- **context**: `object` (optional) - Additional context for the interaction.

### BreedingSchema
- **parent1Id**: `string` (uuid) - Unique identifier of the first parent.
- **parent2Id**: `string` (uuid) - Unique identifier of the second parent.
- **environmentalContext**: `object` (optional) - Key-value pairs representing environmental context during breeding.

### Trait Interface
- **id**: `string` - Unique identifier for the trait.
- **name**: `string` - Name of the trait.
- **type**: `string` (enum) - Trait type: 'dominant', 'recessive', 'codominant', 'polygenic'.
- **category**: `string` (enum) - Trait category: 'physical', 'behavioral', 'cognitive', 'special'.
- **dominance**: `number` - Value representing the trait's dominance.
- **mutationRate**: `number` - Rate of mutation for the trait.
- **environmentalSensitivity**: `number` - Sensitivity of the trait to environmental changes.
- **expressionRules**: `object` - Rules for trait expression.

## Return Values
- **CreateGeneticsResponse**: Confirms the creation of a genetic profile with its details.
- **EvolutionTriggerResponse**: Confirms the evolutionary changes made to an avatar.
- **BreedingResponse**: Confirms successful breeding and the creation of a new avatar with inherited traits.

## Examples

### Create Genetic Profile
```javascript
const createResponse = await createGeneticProfile({
  avatarId: "123e4567-e89b-12d3-a456-426614174000",
  parentGenetics: ["123e4567-e89b-12d3-a456-426614174001"],
  environmentalFactors: { sunlight: 0.8, water: 0.5 },
  initialTraits: { strength: "high", agility: "medium" }
});
```

### Trigger Evolution
```javascript
const evolveResponse = await triggerEvolution({
  avatarId: "123e4567-e89b-12d3-a456-426614174000",
  interactionType: "environmental",
  intensity: 0.6,
  context: { weather: "rainy" }
});
```

### Breed Avatars
```javascript
const breedResponse = await breedAvatars({
  parent1Id: "123e4567-e89b-12d3-a456-426614174000",
  parent2Id: "123e4567-e89b-12d3-a456-426614174002",
  environmentalContext: { terrain: "hilly" }
});
```

This API is designed to be flexible and extensible, allowing developers to build complex genetic simulations for avatars in various applications.