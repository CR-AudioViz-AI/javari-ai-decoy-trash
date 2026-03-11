```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schemas
const recommendationRequestSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(10),
  categories: z.array(z.string()).optional(),
  taskType: z.string().optional(),
  excludeAgentIds: z.array(z.string().uuid()).optional()
});

const feedbackSchema = z.object({
  userId: z.string().uuid(),
  agentId: z.string().uuid(),
  interaction: z.enum(['viewed', 'hired', 'rated', 'dismissed']),
  rating: z.number().min(1).max(5).optional(),
  taskId: z.string().uuid().optional()
});

// Interfaces
interface UserBehavior {
  userId: string;
  preferredCategories: string[];
  averageTaskDuration: number;
  budgetRange: [number, number];
  interactionPatterns: Record<string, number>;
}

interface AgentScore {
  agentId: string;
  collaborativeScore: number;
  contentScore: number;
  performanceScore: number;
  finalScore: number;
  reasons: string[];
}

interface Agent {
  id: string;
  name: string;
  description: string;
  categories: string[];
  averageRating: number;
  completionRate: number;
  responseTime: number;
  priceRange: [number, number];
  skills: string[];
  totalTasks: number;
}

class RecommendationEngine {
  private static CACHE_TTL = 3600; // 1 hour
  private static COLLABORATIVE_WEIGHT = 0.3;
  private static CONTENT_WEIGHT = 0.4;
  private static PERFORMANCE_WEIGHT = 0.3;

  static async getUserBehavior(userId: string): Promise<UserBehavior> {
    const [interactions, tasks, preferences] = await Promise.all([
      supabase
        .from('user_interactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
      
      supabase
        .from('task_completions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      
      supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()
    ]);

    if (interactions.error || tasks.error) {
      throw new Error('Failed to fetch user behavior data');
    }

    const preferredCategories = this.extractPreferredCategories(
      interactions.data || [],
      tasks.data || []
    );

    const averageTaskDuration = this.calculateAverageTaskDuration(tasks.data || []);
    const budgetRange = this.extractBudgetRange(tasks.data || []);
    const interactionPatterns = this.analyzeInteractionPatterns(interactions.data || []);

    return {
      userId,
      preferredCategories,
      averageTaskDuration,
      budgetRange,
      interactionPatterns
    };
  }

  static async getAgentPerformanceMetrics(): Promise<Agent[]> {
    const { data: agents, error } = await supabase
      .from('marketplace_agents')
      .select(`
        id,
        name,
        description,
        categories,
        skills,
        agent_ratings!inner(rating),
        agent_tasks!inner(
          id,
          status,
          completed_at,
          created_at,
          duration,
          price
        )
      `);

    if (error) {
      throw new Error('Failed to fetch agent performance data');
    }

    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      categories: agent.categories || [],
      skills: agent.skills || [],
      averageRating: this.calculateAverageRating(agent.agent_ratings),
      completionRate: this.calculateCompletionRate(agent.agent_tasks),
      responseTime: this.calculateResponseTime(agent.agent_tasks),
      priceRange: this.calculatePriceRange(agent.agent_tasks),
      totalTasks: agent.agent_tasks.length
    }));
  }

  static async runCollaborativeFiltering(
    userId: string,
    agents: Agent[]
  ): Promise<Record<string, number>> {
    // Find similar users based on task history and preferences
    const { data: similarUsers, error } = await supabase.rpc(
      'find_similar_users',
      { target_user_id: userId, limit: 50 }
    );

    if (error) {
      console.warn('Collaborative filtering failed, using fallback');
      return {};
    }

    const scores: Record<string, number> = {};

    for (const agent of agents) {
      let score = 0;
      let totalWeight = 0;

      for (const similarUser of similarUsers || []) {
        const userAgentScore = await this.getUserAgentAfinity(
          similarUser.user_id,
          agent.id
        );
        const similarity = similarUser.similarity_score;
        
        score += userAgentScore * similarity;
        totalWeight += similarity;
      }

      scores[agent.id] = totalWeight > 0 ? score / totalWeight : 0;
    }

    return scores;
  }

  static runContentBasedFiltering(
    userBehavior: UserBehavior,
    agents: Agent[]
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const agent of agents) {
      let score = 0;

      // Category matching
      const categoryOverlap = this.calculateCategoryOverlap(
        userBehavior.preferredCategories,
        agent.categories
      );
      score += categoryOverlap * 0.4;

      // Budget compatibility
      const budgetCompatibility = this.calculateBudgetCompatibility(
        userBehavior.budgetRange,
        agent.priceRange
      );
      score += budgetCompatibility * 0.3;

      // Skill matching based on interaction patterns
      const skillMatch = this.calculateSkillMatch(
        userBehavior.interactionPatterns,
        agent.skills
      );
      score += skillMatch * 0.3;

      scores[agent.id] = Math.min(score, 1.0);
    }

    return scores;
  }

  static calculatePerformanceScores(agents: Agent[]): Record<string, number> {
    const scores: Record<string, number> = {};

    // Normalize metrics
    const maxRating = Math.max(...agents.map(a => a.averageRating));
    const maxCompletionRate = Math.max(...agents.map(a => a.completionRate));
    const minResponseTime = Math.min(...agents.map(a => a.responseTime));

    for (const agent of agents) {
      const ratingScore = agent.averageRating / maxRating;
      const completionScore = agent.completionRate / maxCompletionRate;
      const responseScore = minResponseTime / agent.responseTime;
      
      // Weighted performance score
      scores[agent.id] = (
        ratingScore * 0.4 +
        completionScore * 0.4 +
        responseScore * 0.2
      );
    }

    return scores;
  }

  static async generateRecommendations(
    userId: string,
    limit: number = 10,
    filters?: {
      categories?: string[];
      taskType?: string;
      excludeAgentIds?: string[];
    }
  ): Promise<AgentScore[]> {
    const [userBehavior, agents] = await Promise.all([
      this.getUserBehavior(userId),
      this.getAgentPerformanceMetrics()
    ]);

    // Apply filters
    let filteredAgents = agents;
    if (filters?.categories?.length) {
      filteredAgents = filteredAgents.filter(agent =>
        agent.categories.some(cat => filters.categories!.includes(cat))
      );
    }
    if (filters?.excludeAgentIds?.length) {
      filteredAgents = filteredAgents.filter(agent =>
        !filters.excludeAgentIds!.includes(agent.id)
      );
    }

    const [collaborativeScores, contentScores, performanceScores] = await Promise.all([
      this.runCollaborativeFiltering(userId, filteredAgents),
      Promise.resolve(this.runContentBasedFiltering(userBehavior, filteredAgents)),
      Promise.resolve(this.calculatePerformanceScores(filteredAgents))
    ]);

    const recommendations: AgentScore[] = filteredAgents.map(agent => {
      const collaborativeScore = collaborativeScores[agent.id] || 0;
      const contentScore = contentScores[agent.id] || 0;
      const performanceScore = performanceScores[agent.id] || 0;

      const finalScore = (
        collaborativeScore * this.COLLABORATIVE_WEIGHT +
        contentScore * this.CONTENT_WEIGHT +
        performanceScore * this.PERFORMANCE_WEIGHT
      );

      const reasons = this.generateReasons(
        agent,
        userBehavior,
        collaborativeScore,
        contentScore,
        performanceScore
      );

      return {
        agentId: agent.id,
        collaborativeScore,
        contentScore,
        performanceScore,
        finalScore,
        reasons
      };
    });

    return recommendations
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
  }

  // Helper methods
  private static extractPreferredCategories(
    interactions: any[],
    tasks: any[]
  ): string[] {
    const categoryCount: Record<string, number> = {};
    
    interactions.forEach(interaction => {
      if (interaction.agent_categories) {
        interaction.agent_categories.forEach((cat: string) => {
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });
      }
    });

    tasks.forEach(task => {
      if (task.categories) {
        task.categories.forEach((cat: string) => {
          categoryCount[cat] = (categoryCount[cat] || 0) + 2; // Tasks weighted higher
        });
      }
    });

    return Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);
  }

  private static calculateAverageTaskDuration(tasks: any[]): number {
    if (tasks.length === 0) return 0;
    
    const durations = tasks
      .filter(task => task.duration)
      .map(task => task.duration);
    
    return durations.length > 0 
      ? durations.reduce((sum, dur) => sum + dur, 0) / durations.length
      : 0;
  }

  private static extractBudgetRange(tasks: any[]): [number, number] {
    if (tasks.length === 0) return [0, 1000];
    
    const prices = tasks
      .filter(task => task.price)
      .map(task => task.price);
    
    if (prices.length === 0) return [0, 1000];
    
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    return [Math.max(0, avg * 0.5), avg * 1.5];
  }

  private static analyzeInteractionPatterns(interactions: any[]): Record<string, number> {
    const patterns: Record<string, number> = {};
    
    interactions.forEach(interaction => {
      const pattern = interaction.interaction_type;
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });
    
    return patterns;
  }

  private static calculateAverageRating(ratings: any[]): number {
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length;
  }

  private static calculateCompletionRate(tasks: any[]): number {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(task => task.status === 'completed').length;
    return completed / tasks.length;
  }

  private static calculateResponseTime(tasks: any[]): number {
    const responseTimes = tasks
      .filter(task => task.first_response_at)
      .map(task => 
        new Date(task.first_response_at).getTime() - 
        new Date(task.created_at).getTime()
      );
    
    return responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 86400000; // Default 1 day
  }

  private static calculatePriceRange(tasks: any[]): [number, number] {
    const prices = tasks.filter(task => task.price).map(task => task.price);
    if (prices.length === 0) return [0, 1000];
    return [Math.min(...prices), Math.max(...prices)];
  }

  private static async getUserAgentAfinity(
    userId: string,
    agentId: string
  ): Promise<number> {
    const { data: interactions, error } = await supabase
      .from('user_interactions')
      .select('interaction_type')
      .eq('user_id', userId)
      .eq('agent_id', agentId);

    if (error || !interactions) return 0;

    const weights = { viewed: 0.1, hired: 0.8, rated: 0.6, dismissed: -0.3 };
    return interactions.reduce((sum, interaction) => 
      sum + (weights[interaction.interaction_type as keyof typeof weights] || 0), 0
    );
  }

  private static calculateCategoryOverlap(
    userCategories: string[],
    agentCategories: string[]
  ): number {
    if (userCategories.length === 0 || agentCategories.length === 0) return 0;
    
    const overlap = userCategories.filter(cat => 
      agentCategories.includes(cat)
    ).length;
    
    return overlap / Math.max(userCategories.length, agentCategories.length);
  }

  private static calculateBudgetCompatibility(
    userBudget: [number, number],
    agentPriceRange: [number, number]
  ): number {
    const [userMin, userMax] = userBudget;
    const [agentMin, agentMax] = agentPriceRange;
    
    // Check overlap
    const overlapMin = Math.max(userMin, agentMin);
    const overlapMax = Math.min(userMax, agentMax);
    
    if (overlapMin > overlapMax) return 0;
    
    const overlapSize = overlapMax - overlapMin;
    const userBudgetSize = userMax - userMin;
    
    return overlapSize / userBudgetSize;
  }

  private static calculateSkillMatch(
    interactionPatterns: Record<string, number>,
    agentSkills: string[]
  ): number {
    // Simple skill matching based on interaction patterns
    // This could be enhanced with NLP/vector similarity
    const patternKeys = Object.keys(interactionPatterns);
    const matches = agentSkills.filter(skill => 
      patternKeys.some(pattern => 
        skill.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(skill.toLowerCase())
      )
    ).length;
    
    return agentSkills.length > 0 ? matches / agentSkills.length : 0;
  }

  private static generateReasons(
    agent: Agent,
    userBehavior: UserBehavior,
    collaborativeScore: number,
    contentScore: number,
    performanceScore: number
  ): string[] {
    const reasons: string[] = [];
    
    if (collaborativeScore > 0.7) {
      reasons.push("Similar users highly recommend this agent");
    }
    
    if (contentScore > 0.7) {
      reasons.push("Matches your preferences and task history");
    }
    
    if (performanceScore > 0.8) {
      reasons.push("Excellent performance track record");
    }
    
    if (agent.averageRating > 4.5) {
      reasons.push(`Highly rated (${agent.averageRating.toFixed(1)}/5)`);
    }
    
    if (agent.completionRate > 0.9) {
      reasons.push("High task completion rate");
    }
    
    const categoryOverlap = this.calculateCategoryOverlap(
      userBehavior.preferredCategories,
      agent.categories
    );
    if (categoryOverlap > 0.5) {
      reasons.push("Specializes in your preferred categories");
    }
    
    return reasons;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const categories = searchParams.get('categories')?.split(',').filter(Boolean);
    const taskType = searchParams.get('taskType');
    const excludeAgentIds = searchParams.get('excludeAgentIds')?.split(',').filter(Boolean);

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `recommendations:${userId}:${limit}:${categories?.join(',')}:${taskType}:${excludeAgentIds?.join(',')}`;
    
    const recommendations = await RecommendationEngine.generateRecommendations(
      userId,
      limit,
      { categories, taskType, excludeAgentIds }
    );

    // Get agent details for the recommendations
    const agentIds = recommendations.map(r => r.agentId);
    const { data: agentDetails, error } = await supabase
      .from('marketplace_agents')
      .select('*')
      .in('id', agentIds);

    if (error) {
      throw new Error('Failed to fetch agent details');
    }

    const enrichedRecommendations = recommendations.map(rec => {
      const agent = agentDetails.find(a => a.id === rec.agentId);
      return {
        ...rec,
        agent: agent || null
      };
    });

    return NextResponse.json({
      recommendations: enrichedRecommendations,
      metadata: {
        userId,
        generatedAt: new Date().toISOString(),
        algorithm: 'hybrid',
        totalAgentsEvaluated: recommendations.length
      }
    });

  } catch (error) {
    console.error('Agent recommendation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = recommendationRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { userId, limit, categories, taskType, excludeAgentIds } = validation.data;

    const recommendations = await RecommendationEngine.generateRecommendations(
      userId,
      limit,
      { categories, taskType, excludeAgentIds }
    );

    // Get agent details
    const agentIds = recommendations.map(r => r.agentId);
    const { data: agentDetails, error } = await supabase
      .from('marketplace_agents')
      .select('*')
      .in('id', agentIds);

    if (error) {
      throw new Error('Failed to fetch agent details');
    }

    const enrichedRecommendations = recommendations.map(rec => {
      const agent = agentDetails.find(a => a.id === rec.agentId);
      return {
        ...rec,
        agent
      };
    });

    return NextResponse.json({
      recommendations: enrichedRecommendations,
      metadata: {
        userId,
        requestedLimit: limit,
        actualCount: enrichedRecommendations.length,
        generatedAt: new Date().toISOString(),
        filters: { categories, taskType, excludeAgentIds }
      }
    });

  } catch (error) {
    console.error('Agent recommendation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = feedbackSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid feedback data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { userId, agentId, interaction, rating, taskId } = validation.data;

    // Record user interaction
    const { error: interactionError } = await supabase
      .from('user_interactions')
      .insert({
        user_id: userId,
        agent_id: agentId,
        interaction_type: interaction,
        rating,
        task_id: taskId,
        created_at: new Date().toISOString()
      });

    if (interactionError) {
      throw new Error('Failed to record user interaction');
    }

    // Update user preferences based on feedback
    if (interaction === 'hired' || interaction === 'rated') {
      // Get agent details to update preferences
      const { data: agent } = await supabase
        .from('marketplace_agents')
        .select('categories, skills')
        .eq('id', agentId)
        .single();

      if (agent) {
        // Update or create user preferences
        await supabase
          .from('user_preferences')
          .upsert({
            user_id: userId,
            preferred_categories: agent.categories,
            updated_at