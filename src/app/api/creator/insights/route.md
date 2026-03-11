# Build Creator Performance Insights API

# Creator Performance Insights API Documentation

## Purpose
The Creator Performance Insights API provides detailed performance metrics, engagement insights, and revenue recommendations for social media creators. This API helps creators understand their content performance over specified time ranges and guides them in making informed decisions for future content strategies.

## Usage
This API can be accessed through the specified endpoint and requires a GET request with appropriate query parameters. The API responds with aggregated insights for the specified creator.

## Parameters/Props

### Query Parameters
- **creator_id** (string, required): A unique identifier for the creator (UUID format).
- **time_range** (string, optional): The period for which insights are gathered. Valid values are:
  - `7d`: Last 7 days
  - `30d`: Last 30 days (default)
  - `90d`: Last 90 days
  - `1y`: Last year
- **metrics** (string, optional): A comma-separated list of specific metrics to retrieve. If not provided, all available metrics are returned.
- **include_recommendations** (string, optional): Indicates whether to include revenue recommendations in the response. Accepts `true` or `false`. Defaults to `true`.

### Response Structure
The API returns an object containing the following data:

- **performance_metrics** (object): Key performance metrics such as views, likes, shares, comments, engagement rates, etc.
- **engagement_insights** (array): Insights on audience engagement patterns, trends, peak hours, and retention statistics.
- **revenue_recommendations** (array): Suggestions for monetization, content changes, audience engagement strategies, and timing improvements.
- **period_comparison** (object): Comparisons of performance metrics over specified time ranges (views change, engagement change, revenue change).
- **top_performing_content** (array): A list of content that performed best, including content IDs, titles, scores, and success factors.

## Return Values
The API produces a structured response containing the `CreatorInsights` object as described in the Response Structure section.

## Examples

### Example Request
```http
GET /api/creator/insights?creator_id=123e4567-e89b-12d3-a456-426614174000&time_range=30d
```

### Example Response
```json
{
  "performance_metrics": {
    "views": 15000,
    "likes": 1200,
    "shares": 300,
    "comments": 200,
    "engagement_rate": 10.5,
    "watch_time": 20000,
    "completion_rate": 75,
    "click_through_rate": 8.5
  },
  "engagement_insights": [
    {
      "pattern": "weekend engagement spike",
      "trend": "increasing",
      "peak_hours": [18, 19, 20],
      "audience_retention": 85,
      "interaction_types": {
        "likes": 1200,
        "shares": 300,
        "comments": 200
      }
    }
  ],
  "revenue_recommendations": [
    {
      "type": "monetization",
      "title": "Consider Sponsorships",
      "description": "Explore sponsorship opportunities for popular content.",
      "potential_impact": "high",
      "estimated_revenue_lift": 5000,
      "implementation_difficulty": "medium"
    }
  ],
  "period_comparison": {
    "views_change": 20,
    "engagement_change": 15,
    "revenue_change": 25
  },
  "top_performing_content": [
    {
      "content_id": "abcd1234",
      "title": "Engaging Video Title",
      "performance_score": 92,
      "key_success_factors": ["high engagement", "optimized timing"]
    }
  ]
}
```
This API enables creators to derive actionable insights that drive content evolution and maximize audience engagement.