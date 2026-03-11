# Build Creator Engagement Metrics API

```markdown
# Creator Engagement Metrics API

## Purpose
The Creator Engagement Metrics API provides functionalities to retrieve and manage engagement metrics for content creators. It enables developers to query engagement statistics and track engagement events, such as views and likes, across various content types.

## Usage
This API is designed to be used within Next.js applications, utilizing Supabase for data storage and Redis for caching. The provided routes allow for retrieving engagement metrics and tracking user engagement events.

## Endpoints
1. **Get Engagement Metrics**
2. **Track Engagement Events**

### 1. Get Engagement Metrics
- **Method:** GET
- **Route:** `/api/creator/engagement`

#### Parameters
- `creatorId` (string, required): UUID of the content creator.
- `timeRange` (string, optional): Defines the time period for the metrics. Options: `24h`, `7d`, `30d`, `90d`. Default is `30d`.
- `contentType` (string, optional): Type of content to retrieve metrics for. Options: `all`, `audio`, `video`, `live`. Default is `all`.
- `metrics` (array, optional): Types of metrics to retrieve. Options: `performance`, `audience`, `conversion`, `insights`. Default is `performance`.

#### Return Values
Returns an object containing:
- `contentPerformance`: Metrics related to content performance.
- `audienceEngagement`: Data about audience engagement.
- `revenueConversion`: Insights into revenue conversion rates.
- `monetizationInsights`: Array of monetization opportunities.

### 2. Track Engagement Events
- **Method:** POST
- **Route:** `/api/creator/engagement/track`

#### Parameters/Props
- `creatorId` (string, required): UUID of the content creator.
- `contentId` (string, required): UUID of the specific piece of content.
- `eventType` (string, required): Type of event. Options: `view`, `like`, `share`, `comment`, `subscribe`, `purchase`, `tip`.
- `userId` (string, optional): UUID of the user. Defaults to `undefined`.
- `sessionId` (string, required): Unique session identifier.
- `metadata` (object, optional): Additional data related to the event. Defaults to `undefined`.
- `timestamp` (string, optional): Event timestamp in ISO 8601 format. Defaults to current time.

#### Return Values
Returns a confirmation of the tracked event, including:
- Status of the tracking operation.
- Any relevant error messages.

## Examples

### Get Engagement Metrics
```javascript
const response = await fetch('/api/creator/engagement?creatorId=123e4567-e89b-12d3-a456-426614174000');
const data = await response.json();
console.log(data);
```

### Track Engagement Event
```javascript
const eventData = {
  creatorId: '123e4567-e89b-12d3-a456-426614174000',
  contentId: '987e6543-e21b-45d6-a789-1234567890ab',
  eventType: 'like',
  sessionId: 'session_id_example'
};

const response = await fetch('/api/creator/engagement/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(eventData),
});
const confirmation = await response.json();
console.log(confirmation);
```

## Notes
Ensure that the necessary environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `REDIS_URL`) are set up before using this API.

```