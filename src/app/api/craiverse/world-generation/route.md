# Build Procedural World Generation API

# Procedural World Generation API Documentation

## Purpose
The Procedural World Generation API provides an endpoint to generate procedurally created worlds for applications, ranging from games to simulations. This API employs various algorithms to create terrain, place buildings, and establish ecosystems based on user-defined parameters.

## Usage
To use this API, send a POST request to the endpoint with the necessary world generation parameters in the request body. Ensure that the user is authenticated and rate limits are observed.

## Endpoint
```
POST /api/craiverse/world-generation
```

## Parameters/Props
The request body must be a JSON object conforming to the `worldParamsSchema`. Here are the key parameters:

- **worldSize** (string): Defines the size of the world. Accepted values are "small", "medium", "large", and "xl".
- **terrainType** (string): Specifies the type of terrain to generate (e.g., mountains, plains).
- **buildingDensity** (number): A value from 0 to 1 indicating the density of buildings in the generated world.
- **ecosystemType** (string): Defines the type of ecosystem to create (e.g., forest, desert).
  
These parameters are validated against the schema and must meet specified criteria.

## Return Values
The API responds with a JSON object containing the following fields on success:

- **worldId** (string): Unique identifier for the generated world.
- **terrainData** (TerrainData): Contains details about the generated terrain.
- **biomeType** (BiomeType): The type of biome represented in the world.
- **metadata** (WorldMetadata): Additional information about the generated world, such as dimensions, creation date, and user information.

On error, the API will return a JSON object with an **error** field detailing the problem and an appropriate HTTP status code.

## Examples

### Successful World Generation
```http
POST /api/craiverse/world-generation
Content-Type: application/json
Authorization: Bearer <token>

{
  "worldSize": "large",
  "terrainType": "mountains",
  "buildingDensity": 0.5,
  "ecosystemType": "forest"
}
```
**Response:**
```json
{
  "worldId": "12345",
  "terrainData": {
    "heightMap": [...],
    "textureMap": [...]
  },
  "biomeType": "mixed",
  "metadata": {
    "creationDate": "2023-10-01T12:00:00Z",
    "userId": "user_abc"
  }
}
```

### Rate Limit Exceeded
```http
POST /api/craiverse/world-generation
Content-Type: application/json
Authorization: Bearer <token>

{
  "worldSize": "medium",
  "terrainType": "plains",
  "buildingDensity": 0.3,
  "ecosystemType": "savanna"
}
```
**Response:**
```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

### Authentication Required
```http
POST /api/craiverse/world-generation
Content-Type: application/json

{
  "worldSize": "small",
  "terrainType": "desert",
  "buildingDensity": 0.1,
  "ecosystemType": "desert"
}
```
**Response:**
```json
{
  "error": "Authentication required"
}
```

This API enables developers to create diverse and dynamic worlds using procedural generation techniques, enhancing user experiences and engagement in their applications.