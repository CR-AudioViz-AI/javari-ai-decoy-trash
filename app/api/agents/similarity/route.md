# Build Agent Similarity Matching API

```markdown
# Agent Similarity Matching API

## Purpose
The Agent Similarity Matching API is designed to find and return similar agents based on specified criteria and metrics. It leverages machine learning algorithms to evaluate agent embeddings and performance metrics, helping to identify agents that share similar characteristics for enhanced matchmaking in applications.

## Usage
The API endpoint responds to similarity requests by providing a list of agents with their corresponding similarity scores and details based on the provided input parameters.

## Parameters/Props

### Request Schema
The API accepts a JSON object structured according to the following schema:

- **agent_id**: `string` (required) - The unique identifier of the agent being compared.
- **limit**: `number` (optional) - Maximum number of similar agents to return. Default is `10`. Minimum is `1`, maximum is `50`.
- **threshold**: `number` (optional) - Similarity score threshold for filtering results. Default is `0.7`. Range is `0` to `1`.
- **filters**: `object` (optional) - Criteria to filter similar agents:
  - **agent_type**: `string` - Optional type of the agent.
  - **min_performance_score**: `number` - Minimum score for performance metrics. Range is `0` to `1`.
  - **availability_status**: `enum` - Agent availability status (`active`, `busy`, `offline`).
  - **capabilities**: `array<string>` - List of specific agent capabilities.
- **algorithm**: `enum` (optional) - Similarity calculation method. Default is `hybrid`. Options are:
  - `content`
  - `collaborative`
  - `hybrid`
- **include_metrics**: `boolean` (optional) - Indicates if performance metrics should be included in the response. Default is `true`.

### Response Schema
The API returns an array of similarity results, each structured as follows:

- **agent_id**: `string` - ID of the similar agent found.
- **similarity_score**: `number` - Overall similarity score.
- **content_score**: `number` - Score based on content similarity.
- **collaborative_score**: `number` - Score based on collaborative metrics.
- **hybrid_score**: `number` - Combined score from both content and collaborative.
- **agent_info**: `object` - Information about the similar agent:
  - **name**: `string` - Name of the agent.
  - **type**: `string` - Type of the agent.
  - **capabilities**: `array<string>` - List of capabilities.
  - **performance_metrics**: `any` - Optional performance metrics.
  - **availability_status**: `string` - Current availability status.
- **match_reasons**: `array<string>` - Reasons for the similarity match.

## Example

### Request Example
```json
{
  "agent_id": "123e4567-e89b-12d3-a456-426614174000",
  "limit": 5,
  "threshold": 0.8,
  "filters": {
    "agent_type": "support",
    "availability_status": "active"
  },
  "algorithm": "hybrid",
  "include_metrics": true
}
```

### Response Example
```json
[
  {
    "agent_id": "456e4567-e89b-12d3-a456-426614174001",
    "similarity_score": 0.85,
    "content_score": 0.75,
    "collaborative_score": 0.9,
    "hybrid_score": 0.8,
    "agent_info": {
      "name": "Agent A",
      "type": "support",
      "capabilities": ["chat", "email"],
      "performance_metrics": {
        "success_rate": 0.95,
        "response_time": 1.2,
        "user_satisfaction": 0.88,
        "completion_rate": 0.91
      },
      "availability_status": "active"
    },
    "match_reasons": ["Similar capabilities", "High collaborative score"]
  }
]
```
```