# Deploy Advanced Agent Search Microservice

# Advanced Agent Search Microservice

## Purpose
The Advanced Agent Search Microservice provides Elasticsearch-based semantic search capabilities for querying agent descriptions, capabilities, and user reviews using natural language. It supports real-time indexing and caching along with faceted filtering for refined results.

## Usage
This microservice integrates with Elasticsearch, Supabase, Redis, and OpenAI to facilitate the search process. Deploy it in environments where comprehensive agent search functionality is needed, such as customer support systems and AI service directories.

## Parameters/Props

### AgentDocument
- **id**: `string` - Unique identifier for the agent.
- **name**: `string` - Agent's name.
- **description**: `string` - Detailed description of the agent.
- **capabilities**: `string[]` - List of capabilities offered by the agent.
- **category**: `string` - Category the agent belongs to.
- **tags**: `string[]` - Tags associated with the agent.
- **pricing_model**: `('free' | 'paid' | 'freemium')` - Pricing model of the agent.
- **rating**: `number` - Average rating of the agent.
- **review_count**: `number` - Number of reviews for the agent.
- **created_at**: `string` - Timestamp of when the agent was created.
- **updated_at**: `string` - Timestamp of when the agent was last updated.
- **owner_id**: `string` - Identifier of the agent owner.
- **semantic_vector**: `number[]` (optional) - Vector representation for semantic search.
- **reviews**: `AgentReview[]` - List of reviews associated with the agent.

### AgentReview
- **id**: `string` - Unique identifier for the review.
- **agent_id**: `string` - Identifier for the associated agent.
- **user_id**: `string` - Identifier of the user who wrote the review.
- **rating**: `number` - Rating given in the review.
- **comment**: `string` - Comment text of the review.
- **created_at**: `string` - Timestamp of review creation.

### SearchQuery
- **query**: `string` - Search query.
- **filters**: `SearchFilters` (optional) - Filters to apply to the search.
- **sort**: `SortOptions` (optional) - Sorting options for the search results.
- **pagination**: `PaginationOptions` (optional) - Pagination information.
- **semantic**: `boolean` (optional) - Whether to use semantic search.

### SearchFilters
- **category**: `string[]` (optional) - Categories to filter by.
- **pricing_model**: `('free' | 'paid' | 'freemium')[]` (optional) - Pricing models to filter by.
- **rating_min**: `number` (optional) - Minimum rating for the search results.
- **tags**: `string[]` (optional) - Tags to filter by.
- **created_after**: `string` (optional) - Date filter for agents created after a specified date.

### SortOptions
- **field**: `('relevance' | 'rating' | 'created_at' | 'review_count')` - Field to sort by.
- **order**: `('asc' | 'desc')` - Sort order.

### PaginationOptions
- **page**: `number` - Page number for pagination.
- **limit**: `number` - Number of results per page.

### SearchResult
- **agents**: `AgentSearchHit[]` - Array of search results.
- **total**: `number` - Total number of agents found.
- **facets**: `SearchFacets` - Facet data for additional filtering.
- **query_id**: `string` - Unique identifier for the search query.
- **processing_time**: `number` - Time taken to process the search request.

## Examples
```typescript
const searchQuery: SearchQuery = {
  query: "AI agent for customer support",
  filters: {
    category: ["customer support"],
    pricing_model: ["freemium"],
    rating_min: 4,
    tags: ["responsive", "helpful"]
  },
  sort: {
    field: "rating",
    order: "desc"
  },
  pagination: {
    page: 1,
    limit: 10
  },
  semantic: true
};
```

The above example demonstrates how to structure a search query for finding AI agents optimized for customer support with specific filters, sorting, and pagination options.