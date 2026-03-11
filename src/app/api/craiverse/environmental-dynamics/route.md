# Build Environmental Dynamics API

# Environmental Dynamics API Documentation

## Purpose
The Environmental Dynamics API is designed to manage and query dynamic environmental parameters for a virtual environment called "Craiverse". This API allows users to update environmental data such as weather, day-night cycles, and seasonal changes, as well as query the current state of these dynamics.

## Usage
This API serves two main purposes:
1. **Updating the Environment**: Send environmental data updates related to weather systems, day-night cycles, and seasonal changes.
2. **Querying the Environment**: Retrieve current environmental parameters for a specified "Craiverse".

## Parameters / Props

### Update Environment
- **Request Body:**
  - `craiverse_id` (string, required): The UUID of the Craiverse.
  - `weather` (object, optional): Weather system parameters.
    - `temperature` (number): Temperature in °C (-100 to 100).
    - `humidity` (number): Humidity percentage (0 to 100).
    - `pressure` (number): Atmospheric pressure in hPa (800 to 1200).
    - `windSpeed` (number): Wind speed in km/h (0 to 200).
    - `windDirection` (number): Wind direction in degrees (0 to 360).
    - `precipitation` (number): Precipitation percentage (0 to 100).
    - `cloudCover` (number): Cloud cover percentage (0 to 100).
    - `visibility` (number): Visibility percentage (0 to 100).
  - `dayNight` (object, optional): Day-night cycle parameters.
    - `currentTime` (number): Current time (0 to 24).
    - `sunPosition` (object):
      - `elevation` (number): Sun elevation in degrees (-90 to 90).
      - `azimuth` (number): Sun azimuth in degrees (0 to 360).
    - `lightIntensity` (number): Light intensity percentage (0 to 100).
    - `ambientColor` (string): HEX color code for ambient light (e.g., `#FFFFFF`).
    - `shadowLength` (number): Shadow length in percentage (0 to 100).
  - `seasonal` (object, optional): Seasonal data parameters.
    - `season` (string): Current season (values: 'spring', 'summer', 'autumn', 'winter').
    - `dayOfYear` (number): Day of the year (1 to 365).
    - `seasonProgress` (number): Progress in the current season (0 to 1).
    - `temperatureModifier` (number): Temperature adjustment for the season (-50 to 50).
    - `vegetationDensity` (number): Density of vegetation (0 to 100).
  - `physics` (object, optional): Physics parameters.
    - `gravity` (number): Gravity value (0 to 20).
    - `airDensity` (number): Air density (0 to 2).
    - `windResistance` (number): Wind resistance (0 to 10).
  - `timeScale` (number, optional): Time scale multiplier (0.1 to 100).

### Query Environment
- **Request Body:**
  - `craiverse_id` (string, required): The UUID of the Craiverse.
  - `include` (array, optional): List of parameters to include in the response:
    - `'weather'`
    - `'daynight'`
    - `'seasonal'`
    - `'physics'`
    - `'ai_effects'`

## Return Values
- For both updating and querying, the API will respond with a status indicating the success or failure of the operation. Successful updates will return confirmation, while queries will return the currently stored environmental data for the specified `craiverse_id`.

## Examples

### Update Environment Example
```json
{
  "craiverse_id": "123e4567-e89b-12d3-a456-426614174000",
  "weather": {
    "temperature": 20,
    "humidity": 60,
    "pressure": 1013,
    "windSpeed": 15,
    "windDirection": 180,
    "precipitation": 10,
    "cloudCover": 70,
    "visibility": 90
  },
  "dayNight": {
    "currentTime": 14,
    "sunPosition": {
      "elevation": 45,
      "azimuth": 180
    },
    "lightIntensity": 80,
    "ambientColor": "#FFD700",
    "shadowLength": 30
  }
}
```

### Query Environment Example
```json
{
  "craiverse_id": "123e4567-e89b-12d3-a456-426614174