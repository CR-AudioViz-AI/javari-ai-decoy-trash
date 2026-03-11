# Build Agent Review Sentiment Analysis API

# Agent Review Sentiment Analysis API

## Purpose
The Agent Review Sentiment Analysis API provides endpoints for analyzing the sentiment of agent reviews. It utilizes OpenAI for natural language processing to return sentiment scores, themes, and feedback based on provided reviews.

## Usage
To use this API, send a POST request to the relevant endpoint with the required parameters. The API will return sentiment analysis results based on the reviews provided.

## Parameters/Props

### Request Body
There are two main schemas depending on the analysis type.

1. **Sentiment Analysis Schema**
   ```json
   {
     "reviewIds": ["string_uuid"],
     "options": {
       "includeThemes": "boolean",
       "includeFeedback": "boolean",
       "forceRefresh": "boolean"
     }
   }
   ```
   - `reviewIds` (Array of strings): Required. An array of UUIDs representing the reviews to analyze. Minimum of 1, maximum of 50.
   - `options` (Object): Optional. Configuration for the analysis.
     - `includeThemes` (Boolean): Default is true. If the response should include theme analysis.
     - `includeFeedback` (Boolean): Default is true. If feedback analysis should be included.
     - `forceRefresh` (Boolean): Default is false. If the API should bypass cache and refresh results.

2. **Batch Analysis Schema**
   ```json
   {
     "agentId": "string_uuid",
     "limit": "integer",
     "offset": "integer"
   }
   ```
   - `agentId` (String): Required. The UUID of the agent for whom reviews are being fetched.
   - `limit` (Integer): Default is 20. The number of reviews to return (minimum 1, maximum 100).
   - `offset` (Integer): Default is 0. The number of reviews to skip in the response.

### Response Structure
The API returns an array of objects containing:
```json
{
  "reviewId": "string_uuid",
  "sentiment": {
    "score": "number",
    "confidence": "number",
    "label": "string"
  },
  "themes": {
    "themes": ["string"],
    "keywords": [{"word": "string", "relevance": "number"}],
    "categories": ["string"]
  },
  "feedback": {
    "strengths": ["string"],
    "improvements": ["string"],
    "actionableItems": ["string"],
    "priority": "string"
  },
  "processedAt": "string",
  "processingTime": "number"
}
```
- `reviewId`: UUID of the analyzed review.
- `sentiment`: Object containing the sentiment analysis details.
- `themes`: Optional themes identified in the review.
- `feedback`: Optional feedback extracted from the review.
- `processedAt`: Timestamp of when the analysis was processed.
- `processingTime`: Time taken to process the analysis in milliseconds.

## Examples

### Example Request
```json
POST /api/agent-reviews/sentiment
{
  "reviewIds": ["123e4567-e89b-12d3-a456-426614174000"],
  "options": {
    "includeThemes": true,
    "includeFeedback": false
  }
}
```

### Example Response
```json
[
  {
    "reviewId": "123e4567-e89b-12d3-a456-426614174000",
    "sentiment": {
      "score": 0.75,
      "confidence": 0.9,
      "label": "positive"
    },
    "themes": {
      "themes": ["Customer Service", "Efficiency"],
      "keywords": [{"word": "friendly", "relevance": 0.8}, {"word": "quick", "relevance": 0.6}],
      "categories": ["Service Quality"]
    },
    "feedback": null,
    "processedAt": "2023-10-02T12:00:00Z",
    "processingTime": 123
  }
]
```

This documentation provides a comprehensive overview of how to use the Agent Review Sentiment Analysis API for effective sentiment evaluation of agent reviews.