```typescript
/**
 * Intelligent Team Load Balancer Service
 * 
 * Dynamically distributes tasks across team members based on:
 * - Real-time workload analysis
 * - Agent capability matching
 * - Performance metrics optimization
 * 
 * @author CR AudioViz AI
 * @version 1.0.0
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';

/**
 * Agent capability and performance data
 */
export interface Agent {
  id: string;
  name: string;
  email: string;
  capabilities: AgentCapability[];
  currentWorkload: number;
  maxCapacity: number;
  performance: PerformanceMetrics;
  isActive: boolean;
  lastActiveAt: Date;
  timezone: string;
}

/**
 * Agent capability definition
 */
export interface AgentCapability {
  skill: string;
  level: number; // 1-10 scale
  experience: number; // years
  successRate: number; // 0-1
  lastUsed: Date;
}

/**
 * Performance metrics for load balancing decisions
 */
export interface PerformanceMetrics {
  averageCompletionTime: number; // minutes
  taskSuccessRate: number; // 0-1
  qualityScore: number; // 1-10
  collaborationRating: number; // 1-10
  availabilityScore: number; // 0-1
  burnoutRisk: number; // 0-1
}

/**
 * Task to be distributed
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration: number; // minutes
  deadline?: Date;
  requiredCapabilities: RequiredCapability[];
  complexity: number; // 1-10
  collaborationLevel: 'solo' | 'pair' | 'team';
  dependencies: string[];
}

/**
 * Required capability for a task
 */
export interface RequiredCapability {
  skill: string;
  minimumLevel: number;
  weight: number; // importance weight 0-1
  required: boolean;
}

/**
 * Load balancing assignment result
 */
export interface Assignment {
  taskId: string;
  agentId: string;
  assignedAt: Date;
  estimatedCompletion: Date;
  confidenceScore: number; // 0-1
  reasoning: string[];
  alternativeAgents: string[];
}

/**
 * Team workload metrics
 */
export interface TeamMetrics {
  totalWorkload: number;
  averageWorkload: number;
  workloadDistribution: number; // standard deviation
  overloadedAgents: number;
  underutilizedAgents: number;
  teamEfficiency: number; // 0-1
  burnoutRisk: number; // 0-1
  lastUpdated: Date;
}

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  maxWorkloadThreshold: number;
  overloadPenalty: number;
  capabilityWeight: number;
  performanceWeight: number;
  workloadWeight: number;
  timeZoneWeight: number;
  rebalanceInterval: number; // minutes
  enableRealtime: boolean;
}

/**
 * Workload analysis result
 */
export interface WorkloadAnalysis {
  agentId: string;
  currentLoad: number;
  projectedLoad: number;
  capacity: number;
  utilizationRate: number;
  isOverloaded: boolean;
  canAcceptNewTasks: boolean;
  recommendedMaxTasks: number;
}

/**
 * Capability matching score
 */
export interface CapabilityMatch {
  agentId: string;
  taskId: string;
  overallScore: number;
  capabilityScores: { [skill: string]: number };
  missingCapabilities: string[];
  strengthCapabilities: string[];
}

/**
 * Workload analyzer for real-time load calculation
 */
class WorkloadAnalyzer {
  private redis: Redis;
  private supabase: SupabaseClient;

  constructor(redis: Redis, supabase: SupabaseClient) {
    this.redis = redis;
    this.supabase = supabase;
  }

  /**
   * Analyzes current and projected workload for all agents
   */
  async analyzeTeamWorkload(): Promise<WorkloadAnalysis[]> {
    const agents = await this.getActiveAgents();
    const analyses: WorkloadAnalysis[] = [];

    for (const agent of agents) {
      const analysis = await this.analyzeAgentWorkload(agent);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Analyzes workload for a specific agent
   */
  async analyzeAgentWorkload(agent: Agent): Promise<WorkloadAnalysis> {
    const currentTasks = await this.getAgentActiveTasks(agent.id);
    const currentLoad = currentTasks.reduce((sum, task) => sum + task.estimatedDuration, 0);
    
    const projectedLoad = await this.calculateProjectedLoad(agent.id);
    const utilizationRate = currentLoad / agent.maxCapacity;
    
    return {
      agentId: agent.id,
      currentLoad,
      projectedLoad,
      capacity: agent.maxCapacity,
      utilizationRate,
      isOverloaded: utilizationRate > 0.8,
      canAcceptNewTasks: utilizationRate < 0.7,
      recommendedMaxTasks: Math.floor(agent.maxCapacity * 0.8)
    };
  }

  private async getActiveAgents(): Promise<Agent[]> {
    const cacheKey = 'team:active_agents';
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const { data, error } = await this.supabase
      .from('agents')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    await this.redis.setex(cacheKey, 300, JSON.stringify(data));
    return data;
  }

  private async getAgentActiveTasks(agentId: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('task_assignments')
      .select(`
        tasks (*)
      `)
      .eq('agent_id', agentId)
      .eq('status', 'active');

    if (error) throw error;
    return data.map(item => item.tasks);
  }

  private async calculateProjectedLoad(agentId: string): Promise<number> {
    // Calculate projected load based on current tasks and their estimated completion times
    const { data, error } = await this.supabase
      .from('task_assignments')
      .select('estimated_completion, tasks(estimated_duration)')
      .eq('agent_id', agentId)
      .eq('status', 'active');

    if (error) throw error;

    const now = new Date();
    return data.reduce((sum, assignment) => {
      const completionTime = new Date(assignment.estimated_completion);
      const remainingTime = Math.max(0, completionTime.getTime() - now.getTime()) / (1000 * 60);
      return sum + Math.min(remainingTime, assignment.tasks.estimated_duration);
    }, 0);
  }
}

/**
 * Capability matcher for agent-task compatibility scoring
 */
class CapabilityMatcher {
  private redis: Redis;
  private supabase: SupabaseClient;

  constructor(redis: Redis, supabase: SupabaseClient) {
    this.redis = redis;
    this.supabase = supabase;
  }

  /**
   * Calculates capability match scores for all agents against a task
   */
  async matchTask(task: Task, agents: Agent[]): Promise<CapabilityMatch[]> {
    const matches: CapabilityMatch[] = [];

    for (const agent of agents) {
      const match = await this.calculateCapabilityMatch(agent, task);
      matches.push(match);
    }

    return matches.sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Calculates capability match score for specific agent-task pair
   */
  async calculateCapabilityMatch(agent: Agent, task: Task): Promise<CapabilityMatch> {
    const capabilityScores: { [skill: string]: number } = {};
    const missingCapabilities: string[] = [];
    const strengthCapabilities: string[] = [];
    
    let totalWeight = 0;
    let weightedScore = 0;

    for (const required of task.requiredCapabilities) {
      const agentCapability = agent.capabilities.find(c => c.skill === required.skill);
      
      if (!agentCapability) {
        if (required.required) {
          capabilityScores[required.skill] = 0;
          missingCapabilities.push(required.skill);
        } else {
          capabilityScores[required.skill] = 0.1; // Small penalty for missing optional skills
        }
      } else {
        const levelScore = Math.min(agentCapability.level / required.minimumLevel, 1);
        const experienceBonus = Math.min(agentCapability.experience * 0.1, 0.3);
        const successRateBonus = agentCapability.successRate * 0.2;
        
        const skillScore = Math.min(levelScore + experienceBonus + successRateBonus, 1);
        capabilityScores[required.skill] = skillScore;
        
        if (skillScore > 0.8) {
          strengthCapabilities.push(required.skill);
        }
      }
      
      totalWeight += required.weight;
      weightedScore += capabilityScores[required.skill] * required.weight;
    }

    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    return {
      agentId: agent.id,
      taskId: task.id,
      overallScore,
      capabilityScores,
      missingCapabilities,
      strengthCapabilities
    };
  }
}

/**
 * Performance tracker for agent efficiency monitoring
 */
class PerformanceTracker {
  private redis: Redis;
  private supabase: SupabaseClient;

  constructor(redis: Redis, supabase: SupabaseClient) {
    this.redis = redis;
    this.supabase = supabase;
  }

  /**
   * Updates performance metrics for an agent
   */
  async updatePerformanceMetrics(agentId: string): Promise<PerformanceMetrics> {
    const metrics = await this.calculatePerformanceMetrics(agentId);
    
    // Cache the metrics
    const cacheKey = `agent:${agentId}:performance`;
    await this.redis.setex(cacheKey, 1800, JSON.stringify(metrics));

    // Update database
    await this.supabase
      .from('agent_performance')
      .upsert({
        agent_id: agentId,
        ...metrics,
        updated_at: new Date().toISOString()
      });

    return metrics;
  }

  /**
   * Calculates comprehensive performance metrics
   */
  private async calculatePerformanceMetrics(agentId: string): Promise<PerformanceMetrics> {
    const [completionTime, successRate, quality, collaboration, availability, burnout] = 
      await Promise.all([
        this.calculateAverageCompletionTime(agentId),
        this.calculateSuccessRate(agentId),
        this.calculateQualityScore(agentId),
        this.calculateCollaborationRating(agentId),
        this.calculateAvailabilityScore(agentId),
        this.calculateBurnoutRisk(agentId)
      ]);

    return {
      averageCompletionTime: completionTime,
      taskSuccessRate: successRate,
      qualityScore: quality,
      collaborationRating: collaboration,
      availabilityScore: availability,
      burnoutRisk: burnout
    };
  }

  private async calculateAverageCompletionTime(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('task_assignments')
      .select('estimated_duration, actual_duration')
      .eq('agent_id', agentId)
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 120; // Default 2 hours

    const avgDuration = data.reduce((sum, task) => 
      sum + (task.actual_duration || task.estimated_duration), 0) / data.length;
    
    return avgDuration;
  }

  private async calculateSuccessRate(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('task_assignments')
      .select('status')
      .eq('agent_id', agentId)
      .in('status', ['completed', 'failed'])
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 0.8; // Default success rate

    const completed = data.filter(task => task.status === 'completed').length;
    return completed / data.length;
  }

  private async calculateQualityScore(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('task_reviews')
      .select('quality_rating')
      .eq('agent_id', agentId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 7.5; // Default quality score

    const avgQuality = data.reduce((sum, review) => sum + review.quality_rating, 0) / data.length;
    return avgQuality;
  }

  private async calculateCollaborationRating(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('collaboration_ratings')
      .select('rating')
      .eq('agent_id', agentId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 8.0; // Default collaboration rating

    const avgRating = data.reduce((sum, rating) => sum + rating.rating, 0) / data.length;
    return avgRating;
  }

  private async calculateAvailabilityScore(agentId: string): Promise<number> {
    // Calculate based on working hours vs total hours in the period
    const { data, error } = await this.supabase
      .from('agent_activity')
      .select('active_hours')
      .eq('agent_id', agentId)
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 0.75; // Default availability

    const totalActiveHours = data.reduce((sum, day) => sum + day.active_hours, 0);
    const expectedHours = data.length * 8; // 8 hours per day expected
    
    return Math.min(totalActiveHours / expectedHours, 1);
  }

  private async calculateBurnoutRisk(agentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('workload_history')
      .select('daily_workload, overtime_hours')
      .eq('agent_id', agentId)
      .gte('date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data.length) return 0.2; // Default low risk

    const avgWorkload = data.reduce((sum, day) => sum + day.daily_workload, 0) / data.length;
    const avgOvertime = data.reduce((sum, day) => sum + (day.overtime_hours || 0), 0) / data.length;
    
    const workloadRisk = Math.min(avgWorkload / 480, 1); // 8 hours = 480 minutes
    const overtimeRisk = Math.min(avgOvertime / 120, 1); // 2 hours overtime threshold
    
    return (workloadRisk * 0.7 + overtimeRisk * 0.3);
  }
}

/**
 * Task distributor using intelligent load balancing algorithms
 */
class TaskDistributor {
  private workloadAnalyzer: WorkloadAnalyzer;
  private capabilityMatcher: CapabilityMatcher;
  private performanceTracker: PerformanceTracker;
  private config: LoadBalancerConfig;

  constructor(
    workloadAnalyzer: WorkloadAnalyzer,
    capabilityMatcher: CapabilityMatcher,
    performanceTracker: PerformanceTracker,
    config: LoadBalancerConfig
  ) {
    this.workloadAnalyzer = workloadAnalyzer;
    this.capabilityMatcher = capabilityMatcher;
    this.performanceTracker = performanceTracker;
    this.config = config;
  }

  /**
   * Distributes a task to the most suitable agent
   */
  async distributeTask(task: Task, availableAgents: Agent[]): Promise<Assignment> {
    // Filter agents that can accept new tasks
    const workloadAnalyses = await this.workloadAnalyzer.analyzeTeamWorkload();
    const eligibleAgents = availableAgents.filter(agent => {
      const analysis = workloadAnalyses.find(a => a.agentId === agent.id);
      return analysis?.canAcceptNewTasks || false;
    });

    if (eligibleAgents.length === 0) {
      throw new Error('No agents available to accept new tasks');
    }

    // Calculate capability matches
    const capabilityMatches = await this.capabilityMatcher.matchTask(task, eligibleAgents);

    // Calculate final scores for each agent
    const scoredAgents = await this.calculateFinalScores(
      task,
      eligibleAgents,
      workloadAnalyses,
      capabilityMatches
    );

    // Select the best agent
    const selectedAgent = scoredAgents[0];
    if (!selectedAgent) {
      throw new Error('Failed to select suitable agent for task');
    }

    // Create assignment
    const assignment = await this.createAssignment(task, selectedAgent.agent, selectedAgent.score);
    
    return assignment;
  }

  /**
   * Calculates final weighted scores for agent selection
   */
  private async calculateFinalScores(
    task: Task,
    agents: Agent[],
    workloadAnalyses: WorkloadAnalysis[],
    capabilityMatches: CapabilityMatch[]
  ) {
    const scoredAgents = [];

    for (const agent of agents) {
      const workload = workloadAnalyses.find(w => w.agentId === agent.id);
      const capability = capabilityMatches.find(c => c.agentId === agent.id);
      
      if (!workload || !capability) continue;

      // Capability score (0-1)
      const capabilityScore = capability.overallScore;

      // Performance score (0-1)
      const performanceScore = this.calculatePerformanceScore(agent.performance);

      // Workload score (0-1, higher is better = less loaded)
      const workloadScore = Math.max(0, 1 - workload.utilizationRate);

      // Priority boost for high priority tasks
      const priorityBoost = task.priority === 'critical' ? 0.2 : 
                           task.priority === 'high' ? 0.1 : 0;

      // Time zone compatibility (simple implementation)
      const timeZoneScore = this.calculateTimeZoneScore(agent.timezone);

      // Calculate weighted final score
      const finalScore = 
        (capabilityScore * this.config.capabilityWeight) +
        (performanceScore * this.config.performanceWeight) +
        (workloadScore * this.config.workloadWeight) +
        (timeZoneScore * this.config.timeZoneWeight) +
        priorityBoost;

      scoredAgents.push({
        agent,
        score: finalScore,
        breakdown: {
          capability: capabilityScore,
          performance: performanceScore,
          workload: workloadScore,
          timeZone: timeZoneScore,
          priority: priorityBoost
        }
      });
    }

    return scoredAgents.sort((a, b) => b.score - a.score);
  }

  private calculatePerformanceScore(performance: PerformanceMetrics): number {
    const successWeight = 0.3;
    const qualityWeight = 0.25;
    const speedWeight = 0.2;
    const collaborationWeight = 0.15;
    const availabilityWeight = 0.1;

    const speedScore = Math.max(0, 1 - (performance.averageCompletionTime / 240)); // 4 hours baseline
    const qualityScore = performance.qualityScore / 10;
    const collaborationScore = performance.collaborationRating / 10;

    return (
      performance.taskSuccessRate * successWeight +
      qualityScore * qualityWeight +
      speedScore * speedWeight +
      collaborationScore * collaborationWeight +
      performance.availabilityScore * availabilityWeight
    );
  }

  private calculateTimeZoneScore(agentTimeZone: string): number {
    // Simple time zone compatibility - would be more sophisticated in production
    const currentHour = new Date().getHours();
    const isBusinessHours = currentHour >= 9 && currentHour <= 17;
    return isBusinessHours ? 1.0 : 0.7;
  }

  private async createAssignment(task: Task, agent: Agent, confidenceScore: number): Promise<Assignment> {
    const estimatedCompletion = new Date(
      Date.now() + (task.estimatedDuration * 60 * 1000)
    );

    const reasoning = [
      `Selected based on ${(confidenceScore * 100).toFixed(1)}% confidence score`,
      `Agent has ${agent.capabilities.length} relevant capabilities`,
      `Current workload: ${agent.currentWorkload}/${agent.maxCapacity} minutes`,
      `Performance rating: ${(agent.performance.taskSuccessRate * 100).toFixed(1)}% success rate`
    ];

    return {
      taskId: task.id,
      agentId: agent.id,
      assignedAt: new Date(),
      estimatedCompletion,
      confidenceScore,
      reasoning,