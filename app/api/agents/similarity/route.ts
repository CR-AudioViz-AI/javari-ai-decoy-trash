```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import { z } from 'zod';

// Validation schemas
const SimilarityRequestSchema = z.object({
  agent_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  filters: z.object({
    agent_type: z.string().optional(),
    min_performance_score: z.number().min(0).max(1).optional(),
    availability_status: z.enum(['active', 'busy', 'offline']).optional(),
    capabilities: z.array(z.string()).optional(),
  }).optional(),
  algorithm: z.enum(['content', 'collaborative', 'hybrid']).default('hybrid'),
  include_metrics: z.boolean().default(true),
});

type SimilarityRequest = z.infer<typeof SimilarityRequestSchema>;

interface AgentEmbedding {
  agent_id: string;
  embedding: number[];
  capabilities: string[];
  performance_metrics: {
    success_rate: number;
    response_time: number;
    user_satisfaction: number;
    completion_rate: number;
  };
  metadata: {
    agent_type: string;
    availability_status: string;
    created_at: string;
    updated_at: string;
  };
}

interface SimilarityResult {
  agent_id: string;
  similarity_score: number;
  content_score: number;
  collaborative_score: number;
  hybrid_score: number;
  agent_info: {
    name: string;
    type: string;
    capabilities: string[];
    performance_metrics?: any;
    availability_status: string;
  };
  match_reasons: string[];
}

class AgentSimilarityService {
  private supabase;
  private redis: Redis;
  private openai: OpenAI;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.redis = new Redis(process.env.REDIS_URL!);
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  async generateAgentEmbedding(agentId: string): Promise<number[]> {
    // Get agent capabilities and metadata
    const { data: agent, error } = await this.supabase
      .from('agents')
      .select(`
        *,
        agent_capabilities(capability),
        agent_metrics(*)
      `)
      .eq('id', agentId)
      .single();

    if (error || !agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Create feature text for embedding
    const capabilities = agent.agent_capabilities?.map((c: any) => c.capability) || [];
    const metrics = agent.agent_metrics?.[0] || {};
    
    const featureText = [
      `Agent type: ${agent.type}`,
      `Capabilities: ${capabilities.join(', ')}`,
      `Performance: success_rate=${metrics.success_rate || 0}, response_time=${metrics.avg_response_time || 0}`,
      `User satisfaction: ${metrics.user_satisfaction_score || 0}`,
      `Description: ${agent.description || ''}`,
    ].join('\n');

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: featureText,
    });

    return response.data[0].embedding;
  }

  async getOrCreateEmbedding(agentId: string): Promise<number[]> {
    const cacheKey = `agent_embedding:${agentId}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check database
    const { data: existing } = await this.supabase
      .from('agent_embeddings')
      .select('embedding')
      .eq('agent_id', agentId)
      .single();

    if (existing?.embedding) {
      await this.redis.setex(cacheKey, 3600, JSON.stringify(existing.embedding));
      return existing.embedding;
    }

    // Generate new embedding
    const embedding = await this.generateAgentEmbedding(agentId);
    
    // Store in database
    await this.supabase
      .from('agent_embeddings')
      .upsert({
        agent_id: agentId,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      });

    // Cache it
    await this.redis.setex(cacheKey, 3600, JSON.stringify(embedding));
    
    return embedding;
  }

  async findContentBasedSimilar(
    agentId: string,
    limit: number,
    threshold: number,
    filters?: any
  ): Promise<Array<{ agent_id: string; similarity: number }>> {
    const embedding = await this.getOrCreateEmbedding(agentId);
    
    // Use Supabase RPC for vector similarity
    let query = this.supabase.rpc('find_similar_agents', {
      target_embedding: JSON.stringify(embedding),
      similarity_threshold: threshold,
      match_limit: limit,
    });

    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Vector similarity search failed: ${error.message}`);
    }

    return data || [];
  }

  async calculateCollaborativeFiltering(
    agentId: string,
    limit: number
  ): Promise<Array<{ agent_id: string; score: number }>> {
    // Get users who interacted with the target agent
    const { data: targetUsers } = await this.supabase
      .from('user_agent_interactions')
      .select('user_id, rating, interaction_type')
      .eq('agent_id', agentId)
      .gte('rating', 4); // Only positive interactions

    if (!targetUsers?.length) {
      return [];
    }

    const userIds = targetUsers.map(u => u.user_id);

    // Find agents these users also liked
    const { data: similarAgents } = await this.supabase
      .from('user_agent_interactions')
      .select('agent_id, user_id, rating')
      .in('user_id', userIds)
      .neq('agent_id', agentId)
      .gte('rating', 4);

    if (!similarAgents?.length) {
      return [];
    }

    // Calculate collaborative filtering scores
    const agentScores: { [key: string]: number } = {};
    const agentCounts: { [key: string]: number } = {};

    similarAgents.forEach(interaction => {
      if (!agentScores[interaction.agent_id]) {
        agentScores[interaction.agent_id] = 0;
        agentCounts[interaction.agent_id] = 0;
      }
      agentScores[interaction.agent_id] += interaction.rating;
      agentCounts[interaction.agent_id]++;
    });

    // Calculate average scores and sort
    const results = Object.entries(agentScores)
      .map(([agentId, totalScore]) => ({
        agent_id: agentId,
        score: totalScore / agentCounts[agentId],
        interactions: agentCounts[agentId],
      }))
      .filter(item => item.interactions >= 2) // Minimum interactions threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  async getAgentDetails(agentIds: string[], includeMetrics: boolean = true) {
    let selectFields = `
      id, name, type, description, availability_status,
      agent_capabilities(capability)
    `;

    if (includeMetrics) {
      selectFields += `, agent_metrics(
        success_rate, avg_response_time, user_satisfaction_score,
        total_interactions, completion_rate
      )`;
    }

    const { data: agents } = await this.supabase
      .from('agents')
      .select(selectFields)
      .in('id', agentIds);

    return agents || [];
  }

  calculateHybridScore(
    contentScore: number,
    collaborativeScore: number,
    contentWeight: number = 0.7,
    collaborativeWeight: number = 0.3
  ): number {
    return (contentScore * contentWeight) + (collaborativeScore * collaborativeWeight);
  }

  generateMatchReasons(
    targetAgent: any,
    similarAgent: any,
    contentScore: number,
    collaborativeScore: number
  ): string[] {
    const reasons: string[] = [];

    // Content-based reasons
    if (contentScore > 0.8) {
      const sharedCapabilities = targetAgent.capabilities?.filter(
        (cap: string) => similarAgent.capabilities?.includes(cap)
      ) || [];
      
      if (sharedCapabilities.length > 0) {
        reasons.push(`Shares ${sharedCapabilities.length} capabilities: ${sharedCapabilities.slice(0, 3).join(', ')}`);
      }

      if (targetAgent.type === similarAgent.type) {
        reasons.push(`Same agent type: ${targetAgent.type}`);
      }
    }

    // Collaborative reasons
    if (collaborativeScore > 0.6) {
      reasons.push('Users who liked this agent also liked the similar agent');
    }

    // Performance reasons
    const targetPerf = targetAgent.performance_metrics;
    const similarPerf = similarAgent.performance_metrics;
    
    if (targetPerf && similarPerf) {
      const perfDiff = Math.abs(targetPerf.success_rate - similarPerf.success_rate);
      if (perfDiff < 0.1) {
        reasons.push('Similar performance metrics');
      }
    }

    return reasons.length > 0 ? reasons : ['General similarity match'];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = SimilarityRequestSchema.parse(body);
    
    const service = new AgentSimilarityService();
    const { agent_id, limit, threshold, filters, algorithm, include_metrics } = validatedData;

    // Verify agent exists
    const { data: targetAgent, error: targetError } = await service.supabase
      .from('agents')
      .select('*')
      .eq('id', agent_id)
      .single();

    if (targetError || !targetAgent) {
      return NextResponse.json(
        { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    const results: SimilarityResult[] = [];
    
    // Content-based similarity
    let contentResults: Array<{ agent_id: string; similarity: number }> = [];
    if (algorithm === 'content' || algorithm === 'hybrid') {
      contentResults = await service.findContentBasedSimilar(
        agent_id,
        limit * 2, // Get more for hybrid filtering
        threshold,
        filters
      );
    }

    // Collaborative filtering
    let collaborativeResults: Array<{ agent_id: string; score: number }> = [];
    if (algorithm === 'collaborative' || algorithm === 'hybrid') {
      collaborativeResults = await service.calculateCollaborativeFiltering(
        agent_id,
        limit * 2
      );
    }

    // Combine results based on algorithm
    const combinedResults = new Map<string, {
      content_score: number;
      collaborative_score: number;
    }>();

    // Process content-based results
    contentResults.forEach(result => {
      if (result.agent_id !== agent_id) {
        combinedResults.set(result.agent_id, {
          content_score: result.similarity,
          collaborative_score: 0,
        });
      }
    });

    // Process collaborative results
    collaborativeResults.forEach(result => {
      if (result.agent_id !== agent_id) {
        const existing = combinedResults.get(result.agent_id);
        if (existing) {
          existing.collaborative_score = result.score / 5; // Normalize to 0-1
        } else {
          combinedResults.set(result.agent_id, {
            content_score: 0,
            collaborative_score: result.score / 5,
          });
        }
      }
    });

    // Calculate hybrid scores and filter
    const hybridResults = Array.from(combinedResults.entries())
      .map(([agentId, scores]) => ({
        agent_id: agentId,
        content_score: scores.content_score,
        collaborative_score: scores.collaborative_score,
        hybrid_score: service.calculateHybridScore(
          scores.content_score,
          scores.collaborative_score
        ),
      }))
      .filter(item => {
        if (algorithm === 'content') return item.content_score >= threshold;
        if (algorithm === 'collaborative') return item.collaborative_score >= threshold;
        return item.hybrid_score >= threshold;
      })
      .sort((a, b) => {
        if (algorithm === 'content') return b.content_score - a.content_score;
        if (algorithm === 'collaborative') return b.collaborative_score - a.collaborative_score;
        return b.hybrid_score - a.hybrid_score;
      })
      .slice(0, limit);

    // Get agent details
    const agentIds = hybridResults.map(r => r.agent_id);
    const agentDetails = await service.getAgentDetails(agentIds, include_metrics);
    const agentDetailsMap = new Map(agentDetails.map(agent => [agent.id, agent]));

    // Build final results
    for (const result of hybridResults) {
      const agentInfo = agentDetailsMap.get(result.agent_id);
      if (!agentInfo) continue;

      // Apply filters if specified
      if (filters) {
        if (filters.agent_type && agentInfo.type !== filters.agent_type) continue;
        if (filters.availability_status && agentInfo.availability_status !== filters.availability_status) continue;
        if (filters.min_performance_score && include_metrics) {
          const perfScore = agentInfo.agent_metrics?.[0]?.success_rate || 0;
          if (perfScore < filters.min_performance_score) continue;
        }
        if (filters.capabilities?.length) {
          const agentCaps = agentInfo.agent_capabilities?.map((c: any) => c.capability) || [];
          const hasRequiredCaps = filters.capabilities.some(cap => agentCaps.includes(cap));
          if (!hasRequiredCaps) continue;
        }
      }

      const capabilities = agentInfo.agent_capabilities?.map((c: any) => c.capability) || [];
      const performance_metrics = include_metrics ? agentInfo.agent_metrics?.[0] : undefined;

      const matchReasons = service.generateMatchReasons(
        { ...targetAgent, capabilities: [] }, // Would need to fetch target capabilities
        { ...agentInfo, capabilities },
        result.content_score,
        result.collaborative_score
      );

      results.push({
        agent_id: result.agent_id,
        similarity_score: algorithm === 'content' ? result.content_score :
                         algorithm === 'collaborative' ? result.collaborative_score :
                         result.hybrid_score,
        content_score: result.content_score,
        collaborative_score: result.collaborative_score,
        hybrid_score: result.hybrid_score,
        agent_info: {
          name: agentInfo.name,
          type: agentInfo.type,
          capabilities,
          performance_metrics,
          availability_status: agentInfo.availability_status,
        },
        match_reasons: matchReasons,
      });
    }

    // Cache results
    const cacheKey = `similarity:${agent_id}:${JSON.stringify(validatedData)}`;
    await service.redis.setex(cacheKey, 300, JSON.stringify(results)); // Cache for 5 minutes

    return NextResponse.json({
      success: true,
      data: {
        target_agent_id: agent_id,
        algorithm_used: algorithm,
        total_results: results.length,
        results,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        cached: false,
      },
    });

  } catch (error) {
    console.error('Agent similarity API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data', 
          details: error.errors,
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to find similar agents.' },
    { status: 405 }
  );
}
```