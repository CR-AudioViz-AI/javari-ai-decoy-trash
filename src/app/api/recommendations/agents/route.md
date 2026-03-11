# Build Agent Recommendation Engine API

```markdown
# Agent Recommendation Engine API

## Purpose
The Agent Recommendation Engine API provides functionality to recommend agents to users based on their preferences and historical interactions. It leverages user behavior data and applies scoring mechanisms to generate tailored recommendations.

## Usage
This API can be integrated into web applications that require personalized agent recommendations. It allows users to specify their preferences for recommendations, and also supports feedback mechanisms for interaction tracking.

## Parameters/Props

### Request Body for Recommendations
- **userId** (string, required): A UUID string representing the user's unique ID.
- **limit** (number, optional): The maximum number of agent recommendations to return (default is 10, maximum is 50).
- **categories** (array of strings, optional): An array of category strings to filter agents.
- **taskType** (string, optional): The specific task type for which to find an agent.
- **excludeAgentIds** (array of strings, optional): An array of UUID strings representing agents to exclude from the recommendations.

### Request Body for Feedback
- **userId** (string, required): A UUID string representing the user's unique ID.
- **agentId** (string, required): A UUID string representing the agent's unique ID.
- **interaction** (enum, required): The type of interaction ('viewed', 'hired', 'rated', 'dismissed').
- **rating** (number, optional): A rating between 1 and 5.
- **taskId** (string, optional): A UUID string representing the task ID related to the feedback.

## Return Values
The API returns a JSON response containing:
- An array of recommended agents based on the user's input in the recommendation request.
- Each agent includes details such as ID, name, description, categories, average rating, and performance metrics.
- For the feedback request, the response confirms the recording of the feedback but does not include additional data.

## Examples

### Example Request for Recommendations
```json
POST /api/recommendations/agents
{
  "userId": "e2f16a36-0c25-4ac8-9db3-100b0bf2a9f8",
  "limit": 5,
  "categories": ["design", "development"],
  "taskType": "mobile app",
  "excludeAgentIds": ["c3b28530-1e34-4ee1-bb1e-175d3df671ee"]
}
```

### Example Response for Recommendations
```json
{
  "recommendedAgents": [
    {
      "id": "a1b17ac0-458f-4c62-8043-97c0d2cb6d97",
      "name": "John Doe",
      "description": "Expert in mobile app development.",
      "categories": ["development"],
      "averageRating": 4.5,
      "completionRate": 95,
      "responseTime": 12,
      "priceRange": [100, 200],
      "skills": ["React Native", "Flutter"],
      "totalTasks": 30
    },
    ...
  ]
}
```

### Example Feedback Submission
```json
POST /api/recommendations/agents/feedback
{
  "userId": "e2f16a36-0c25-4ac8-9db3-100b0bf2a9f8",
  "agentId": "a1b17ac0-458f-4c62-8043-97c0d2cb6d97",
  "interaction": "rated",
  "rating": 5,
  "taskId": "d1e8a83f-eebc-4c2e-aa29-52e1303a80f2"
}
```
```