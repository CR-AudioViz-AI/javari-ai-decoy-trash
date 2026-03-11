# Build Creator Engagement Analytics API

# Creator Engagement Analytics API

## Purpose
The Creator Engagement Analytics API provides insights into creator engagement metrics, audience behavior, and content optimization recommendations. It allows developers to track and analyze engagement events for content such as audio visuals, livestreams, and uploads.

## Usage
The API can be utilized in a Next.js application to handle requests related to creator engagement analytics data. It connects to Supabase for data storage and Upstash Redis for caching, ensuring efficient data retrieval and processing.

## Parameters/Props
The API accepts engagement event data and allows for analytics queries with the following schemas:

### Engagement Event Schema
```typescript
const engagementEventSchema = z.object({
  contentId: z.string().uuid(), // Unique identifier for the content
  eventType: z.enum(['view', 'like', 'share', 'comment', 'watch_time', 'complete']), // Type of engagement event
  userId: z.string().uuid().optional(), // Identifier for the user (optional)
  sessionId: z.string(), // ID of the session
  timestamp: z.number(), // Event timestamp
  metadata: z.record(z.any()).optional(), // Additional event metadata (optional)
  value: z.number().optional() // Event-specific value (optional)
});
```

### Analytics Query Schema
```typescript
const analyticsQuerySchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'), // Time period for analytics
  contentType: z.enum(['audio_viz', 'livestream', 'upload', 'all']).default('all'), // Type of content
  groupBy: z.enum(['hour', 'day', 'week']).optional(), // Aggregation granularity (optional)
});
```

## Return Values
- For engagement events, the API returns a success message upon storing the event data.
- For analytics queries, it returns an object containing:
  - `engagementMetrics`: Metrics such as total engagements, views, likes, shares, comments, average watch time, engagement rate, unique viewers, and retention rate.
  - `audienceBehavior`: Data on audience demographics, engagement patterns, and retention.
  - `contentOptimization`: Recommendations, best-performing content details, and actionable insights.

## Examples
### Storing Engagement Event
```typescript
const event = {
  contentId: "123e4567-e89b-12d3-a456-426614174000",
  eventType: "view",
  userId: "987e6543-e21c-32d4-b456-426614174000",
  sessionId: "session123",
  timestamp: Date.now(),
  metadata: { someKey: 'someValue' },
  value: 1
};

// Call the API to store the event (example)
await fetch('/api/creator/engagement', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(event)
});
```

### Querying Analytics
```typescript
const query = {
  period: "7d",
  contentType: "audio_viz",
  groupBy: "day"
};

// Call the API to retrieve analytics
const response = await fetch('/api/creator/engagement/analytics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(query)
});
const data = await response.json();
```

This API is aimed at providing robust engagement analytics to enhance content-related strategies for creators.