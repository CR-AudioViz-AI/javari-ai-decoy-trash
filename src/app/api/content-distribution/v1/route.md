# Build Multi-Region Content Distribution API

```markdown
# Multi-Region Content Distribution API

## Purpose
The Multi-Region Content Distribution API enables efficient delivery of various content types (audio, video, images, data) across multiple geographic regions, optimizing for latency, health status, and cache efficiency.

## Usage
This API handles incoming content distribution requests, determines the optimal CDN endpoint based on user's location, and returns the appropriate content URL along with distribution metrics.

## Parameters/Props

### ContentRequest
- **contentId**: `string` - Unique identifier for the content (Min Length: 1, Max Length: 255).
- **contentType**: `enum` - Type of content, must be one of `'audio'`, `'video'`, `'image'`, `'data'`.
- **quality**: `string` (optional) - Desired quality setting for the content.
- **format**: `string` (optional) - Desired format for the content (e.g., 'mp4', 'mp3').
- **userAgent**: `string` (optional) - The user agent string of the client making the request.
- **acceptLanguage**: `string` (optional) - Language preferences of the user.

### DistributionResult
- **edgeLocation**: `EdgeLocation` - Selected CDN edge location details.
- **contentUrl**: `string` - URL to fetch the requested content.
- **cdnUrl**: `string` - URL to the Content Delivery Network.
- **estimatedLatency**: `number` - Estimated time in milliseconds to retrieve content from the edge location.
- **fallbackUrls**: `string[]` - List of fallback URLs in case the primary request fails.
- **cacheStatus**: `enum` - Cache status can be `'hit'`, `'miss'`, or `'stale'`.
- **region**: `string` - Geographic region where the content is served.

## Return Values
On successful processing of a content request, the API returns a `DistributionResult` containing the edge location and content delivery information. In case of errors, appropriate HTTP status codes and messages are returned.

## Examples

### Successful Request
```json
{
  "edgeLocation": {
    "id": "edge1",
    "region": "us-east",
    "endpoint": "https://cdn.example.com/edge1",
    "isHealthy": true,
    "latency": 25,
    "load": 10,
    "capacity": 100,
    "lastHealthCheck": "2023-10-01T12:00:00Z",
    "coordinates": {
      "lat": 40.7128,
      "lng": -74.0060
    }
  },
  "contentUrl": "https://cdn.example.com/content/12345",
  "cdnUrl": "https://cdn.example.com",
  "estimatedLatency": 25,
  "fallbackUrls": ["https://cdn.example.com/fallback1", "https://cdn.example.com/fallback2"],
  "cacheStatus": "hit",
  "region": "us-east"
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Invalid content type provided."
}
```

## Dependencies
- **Next.js** for server-side routing.
- **Supabase** for database interactions.
- **Upstash Redis** for caching and state management.
- **Zod** for schema validation.
```