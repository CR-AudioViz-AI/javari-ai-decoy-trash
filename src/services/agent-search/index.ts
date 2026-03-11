```typescript
/**
 * Advanced Agent Search Microservice
 * Elasticsearch-based semantic search with natural language queries and faceted filtering
 * 
 * @fileoverview Provides comprehensive search capabilities across agent descriptions,
 * capabilities, and user reviews with real-time indexing and caching
 */

import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import { z } from 'zod';

// Type definitions
export interface AgentDocument {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  category: string;
  tags: string[];
  pricing_model: 'free' | 'paid' | 'freemium';
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
  owner_id: string;
  semantic_vector?: number[];
  reviews: AgentReview[];
}

export interface AgentReview {
  id: string;
  agent_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  sort?: SortOptions;
  pagination?: PaginationOptions;
  semantic?: boolean;
}

export interface SearchFilters {
  category?: string[];
  pricing_model?: ('free' | 'paid' | 'freemium')[];
  rating_min?: number;
  tags?: string[];
  created_after?: string;
}

export interface SortOptions {
  field: 'relevance' | 'rating' | 'created_at' | 'review_count';
  order: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SearchResult {
  agents: AgentSearchHit[];
  total: number;
  facets: SearchFacets;
  query_id: string;
  processing_time: number;
}

export interface AgentSearchHit extends Omit<AgentDocument, 'semantic_vector'> {
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SearchFacets {
  categories: FacetBucket[];
  pricing_models: FacetBucket[];
  rating_ranges: FacetBucket[];
  tags: FacetBucket[];
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchAnalytics {
  query: string;
  user_id?: string;
  results_count: number;
  processing_time: number;
  clicked_agents?: string[];
  timestamp: Date;
}

// Validation schemas
const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    category: z.array(z.string()).optional(),
    pricing_model: z.array(z.enum(['free', 'paid', 'freemium'])).optional(),
    rating_min: z.number().min(0).max(5).optional(),
    tags: z.array(z.string()).optional(),
    created_after: z.string().datetime().optional(),
  }).optional(),
  sort: z.object({
    field: z.enum(['relevance', 'rating', 'created_at', 'review_count']),
    order: z.enum(['asc', 'desc']),
  }).optional(),
  pagination: z.object({
    page: z.number().min(1),
    limit: z.number().min(1).max(100),
  }).optional(),
  semantic: z.boolean().optional(),
});

/**
 * Main Agent Search Service
 * Orchestrates search operations across multiple engines and data sources
 */
class AgentSearchService {
  private elasticsearch: ElasticsearchClient;
  private supabase: ReturnType<typeof createClient>;
  private redis: Redis;
  private openai: OpenAI;
  private readonly indexName = 'agents';
  private readonly cachePrefix = 'search:';
  private readonly cacheTTL = 300; // 5 minutes

  constructor() {
    // Initialize Elasticsearch client
    this.elasticsearch = new ElasticsearchClient({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
      },
      maxRetries: 3,
      requestTimeout: 30000,
    });

    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Initialize Redis client
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Perform comprehensive agent search with semantic understanding
   */
  async search(searchQuery: SearchQuery, userId?: string): Promise<SearchResult> {
    try {
      // Validate input
      const validatedQuery = searchQuerySchema.parse(searchQuery);
      
      const startTime = Date.now();
      const queryId = this.generateQueryId();

      // Check cache first
      const cacheKey = this.getCacheKey(validatedQuery);
      const cachedResult = await this.getCachedResult(cacheKey);
      
      if (cachedResult) {
        await this.recordAnalytics({
          query: validatedQuery.query,
          user_id: userId,
          results_count: cachedResult.total,
          processing_time: Date.now() - startTime,
          timestamp: new Date(),
        });
        
        return { ...cachedResult, query_id: queryId };
      }

      // Build Elasticsearch query
      const esQuery = await this.buildElasticsearchQuery(validatedQuery);
      
      // Execute search
      const response = await this.elasticsearch.search({
        index: this.indexName,
        body: esQuery,
        size: validatedQuery.pagination?.limit || 20,
        from: ((validatedQuery.pagination?.page || 1) - 1) * (validatedQuery.pagination?.limit || 20),
      });

      // Process results
      const result = await this.processSearchResults(response, validatedQuery, queryId, startTime);

      // Cache results
      await this.cacheResult(cacheKey, result);

      // Record analytics
      await this.recordAnalytics({
        query: validatedQuery.query,
        user_id: userId,
        results_count: result.total,
        processing_time: result.processing_time,
        timestamp: new Date(),
      });

      return result;

    } catch (error) {
      console.error('Search error:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build comprehensive Elasticsearch query with semantic search support
   */
  private async buildElasticsearchQuery(query: SearchQuery): Promise<any> {
    const mustClauses: any[] = [];
    const filterClauses: any[] = [];
    const shouldClauses: any[] = [];

    // Text search queries
    if (query.query.trim()) {
      // Multi-match query for text fields
      mustClauses.push({
        multi_match: {
          query: query.query,
          fields: [
            'name^3',
            'description^2',
            'capabilities^2',
            'tags',
            'reviews.comment',
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });

      // Semantic search if enabled
      if (query.semantic !== false) {
        try {
          const embedding = await this.getQueryEmbedding(query.query);
          shouldClauses.push({
            script_score: {
              query: { match_all: {} },
              script: {
                source: "cosineSimilarity(params.query_vector, 'semantic_vector') + 1.0",
                params: { query_vector: embedding },
              },
            },
          });
        } catch (error) {
          console.warn('Semantic search failed, falling back to text search:', error);
        }
      }
    }

    // Apply filters
    if (query.filters) {
      if (query.filters.category?.length) {
        filterClauses.push({
          terms: { category: query.filters.category },
        });
      }

      if (query.filters.pricing_model?.length) {
        filterClauses.push({
          terms: { pricing_model: query.filters.pricing_model },
        });
      }

      if (query.filters.rating_min !== undefined) {
        filterClauses.push({
          range: { rating: { gte: query.filters.rating_min } },
        });
      }

      if (query.filters.tags?.length) {
        filterClauses.push({
          terms: { tags: query.filters.tags },
        });
      }

      if (query.filters.created_after) {
        filterClauses.push({
          range: { created_at: { gte: query.filters.created_after } },
        });
      }
    }

    // Build sort
    const sort: any[] = [];
    if (query.sort?.field === 'relevance') {
      sort.push('_score');
    } else if (query.sort?.field) {
      sort.push({
        [query.sort.field]: { order: query.sort.order || 'desc' },
      });
    } else {
      sort.push('_score', { rating: 'desc' });
    }

    return {
      query: {
        bool: {
          must: mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
          should: shouldClauses,
          filter: filterClauses,
          minimum_should_match: shouldClauses.length > 0 ? 1 : 0,
        },
      },
      sort,
      highlight: {
        fields: {
          name: {},
          description: { fragment_size: 150 },
          capabilities: {},
          'reviews.comment': { fragment_size: 100 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      aggs: {
        categories: {
          terms: { field: 'category', size: 20 },
        },
        pricing_models: {
          terms: { field: 'pricing_model', size: 10 },
        },
        rating_ranges: {
          range: {
            field: 'rating',
            ranges: [
              { from: 0, to: 2, key: '0-2' },
              { from: 2, to: 3, key: '2-3' },
              { from: 3, to: 4, key: '3-4' },
              { from: 4, to: 5, key: '4-5' },
            ],
          },
        },
        tags: {
          terms: { field: 'tags', size: 50 },
        },
      },
    };
  }

  /**
   * Process Elasticsearch response into structured search results
   */
  private async processSearchResults(
    response: any,
    query: SearchQuery,
    queryId: string,
    startTime: number
  ): Promise<SearchResult> {
    const hits = response.body.hits.hits.map((hit: any) => ({
      ...hit._source,
      score: hit._score,
      highlights: hit.highlight,
    }));

    const facets: SearchFacets = {
      categories: response.body.aggregations.categories.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
      pricing_models: response.body.aggregations.pricing_models.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
      rating_ranges: response.body.aggregations.rating_ranges.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
      tags: response.body.aggregations.tags.buckets.map((bucket: any) => ({
        key: bucket.key,
        count: bucket.doc_count,
      })),
    };

    return {
      agents: hits,
      total: response.body.hits.total.value,
      facets,
      query_id: queryId,
      processing_time: Date.now() - startTime,
    };
  }

  /**
   * Get semantic embedding for query text
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to get query embedding:', error);
      throw error;
    }
  }

  /**
   * Sync agent data from Supabase to Elasticsearch
   */
  async syncAgentData(agentId?: string): Promise<void> {
    try {
      let query = this.supabase
        .from('agents')
        .select(`
          *,
          reviews:agent_reviews(*)
        `);

      if (agentId) {
        query = query.eq('id', agentId);
      }

      const { data: agents, error } = await query;

      if (error) throw error;

      if (!agents?.length) return;

      // Process agents in batches
      const batchSize = 100;
      for (let i = 0; i < agents.length; i += batchSize) {
        const batch = agents.slice(i, i + batchSize);
        await this.indexAgentBatch(batch);
      }

      console.log(`Synced ${agents.length} agents to Elasticsearch`);
    } catch (error) {
      console.error('Agent sync failed:', error);
      throw new Error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Index a batch of agents with semantic vectors
   */
  private async indexAgentBatch(agents: any[]): Promise<void> {
    const operations: any[] = [];

    for (const agent of agents) {
      // Generate semantic vector
      const textForEmbedding = [
        agent.name,
        agent.description,
        ...(agent.capabilities || []),
        ...(agent.tags || []),
      ].join(' ');

      let semanticVector: number[] | undefined;
      try {
        const embedding = await this.getQueryEmbedding(textForEmbedding);
        semanticVector = embedding;
      } catch (error) {
        console.warn(`Failed to generate embedding for agent ${agent.id}:`, error);
      }

      const document: AgentDocument = {
        ...agent,
        semantic_vector: semanticVector,
      };

      operations.push(
        { index: { _index: this.indexName, _id: agent.id } },
        document
      );
    }

    if (operations.length > 0) {
      await this.elasticsearch.bulk({ body: operations });
    }
  }

  /**
   * Initialize Elasticsearch index with proper mappings
   */
  async initializeIndex(): Promise<void> {
    try {
      const indexExists = await this.elasticsearch.indices.exists({
        index: this.indexName,
      });

      if (!indexExists.body) {
        await this.elasticsearch.indices.create({
          index: this.indexName,
          body: {
            settings: {
              number_of_shards: 2,
              number_of_replicas: 1,
              analysis: {
                analyzer: {
                  agent_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'stop', 'stemmer'],
                  },
                },
              },
            },
            mappings: {
              properties: {
                id: { type: 'keyword' },
                name: {
                  type: 'text',
                  analyzer: 'agent_analyzer',
                  fields: { keyword: { type: 'keyword' } },
                },
                description: {
                  type: 'text',
                  analyzer: 'agent_analyzer',
                },
                capabilities: {
                  type: 'text',
                  analyzer: 'agent_analyzer',
                },
                category: { type: 'keyword' },
                tags: { type: 'keyword' },
                pricing_model: { type: 'keyword' },
                rating: { type: 'float' },
                review_count: { type: 'integer' },
                created_at: { type: 'date' },
                updated_at: { type: 'date' },
                owner_id: { type: 'keyword' },
                semantic_vector: {
                  type: 'dense_vector',
                  dims: 1536,
                  index: true,
                  similarity: 'cosine',
                },
                reviews: {
                  type: 'nested',
                  properties: {
                    id: { type: 'keyword' },
                    user_id: { type: 'keyword' },
                    rating: { type: 'float' },
                    comment: {
                      type: 'text',
                      analyzer: 'agent_analyzer',
                    },
                    created_at: { type: 'date' },
                  },
                },
              },
            },
          },
        });

        console.log('Elasticsearch index created successfully');
      }
    } catch (error) {
      console.error('Failed to initialize index:', error);
      throw error;
    }
  }

  /**
   * Record search analytics for optimization
   */
  private async recordAnalytics(analytics: SearchAnalytics): Promise<void> {
    try {
      await this.supabase.from('search_analytics').insert([analytics]);
    } catch (error) {
      console.error('Failed to record analytics:', error);
      // Don't throw - analytics failure shouldn't break search
    }
  }

  /**
   * Cache management utilities
   */
  private getCacheKey(query: SearchQuery): string {
    const queryHash = Buffer.from(JSON.stringify(query)).toString('base64');
    return `${this.cachePrefix}${queryHash}`;
  }

  private async getCachedResult(cacheKey: string): Promise<SearchResult | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheResult(cacheKey: string, result: SearchResult): Promise<void> {
    try {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    } catch (error) {
      console.warn('Failed to cache result:', error);
    }
  }

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Health check for all service dependencies
   */
  async healthCheck(): Promise<{
    elasticsearch: boolean;
    supabase: boolean;
    redis: boolean;
    openai: boolean;
  }> {
    const health = {
      elasticsearch: false,
      supabase: false,
      redis: false,
      openai: false,
    };

    try {
      await this.elasticsearch.ping();
      health.elasticsearch = true;
    } catch {}

    try {
      const { error } = await this.supabase.from('agents').select('id').limit(1);
      health.supabase = !error;
    } catch {}

    try {
      await this.redis.ping();
      health.redis = true;
    } catch {}

    try {
      // Test with minimal embedding request
      await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test',
      });
      health.openai = true;
    } catch {}

    return health;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await Promise.allSettled([
      this.elasticsearch.close(),
      this.redis.disconnect(),
    ]);
  }
}

// Export singleton instance
export const agentSearchService = new AgentSearchService();

// Export types for external use
export type {
  SearchQuery,
  SearchResult,
  AgentDocument,
  SearchFilters,
  SearchFacets,
  AgentSearchHit,
};
```