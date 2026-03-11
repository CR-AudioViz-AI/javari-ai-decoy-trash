```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { z } from 'zod';

// Environment validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const redisUrl = process.env.REDIS_URL!;

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseKey);
const redis = new Redis(redisUrl);

// Validation schemas
const taskDistributionSchema = z.object({
  task: z.object({
    id: z.string(),
    type: z.enum(['audio_processing', 'text_analysis', 'data_visualization', 'report_generation']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    complexity: z.number().min(1).max(10),
    estimatedDuration: z.number().positive(),
    requiredCapabilities: z.array(z.string()),
    metadata: z.record(z.any()).optional()
  }),
  teamId: z.string().uuid(),
  options: z.object({
    preferredAgent: z.string().uuid().optional(),
    excludeAgents: z.array(z.string().uuid()).optional(),
    maxWaitTime: z.number().positive().optional()
  }).optional()
});

const rebalanceSchema = z.object({
  teamId: z.string().uuid(),
  strategy: z.enum(['performance', 'workload', 'capability']).optional()
});

// Types
interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  max_concurrent_tasks: number;
  current_workload: number;
  performance_score: number;
  status: 'active' | 'busy' | 'offline';
  last_active: string;
}

interface Task {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  complexity: number;
  estimatedDuration: number;
  requiredCapabilities: string[];
  metadata?: Record<string, any>;
}

interface DistributionResult {
  assignedAgent: Agent;
  queuePosition: number;
  estimatedStartTime: number;
  reasoning: string;
}

class WorkloadDistributor {
  private capabilityMatcher = new CapabilityMatcher();
  private loadBalancer = new LoadBalancer();
  private queueManager = new QueueManager();
  private performanceTracker = new PerformanceTracker();
  private taskPrioritizer = new TaskPrioritizer();

  async distributeTask(task: Task, teamId: string, options?: any): Promise<DistributionResult> {
    // Get eligible agents
    const agents = await this.getEligibleAgents(teamId, task.requiredCapabilities, options);
    
    if (agents.length === 0) {
      throw new Error('No eligible agents available for this task');
    }

    // Calculate scores for each agent
    const agentScores = await Promise.all(
      agents.map(agent => this.calculateAgentScore(agent, task))
    );

    // Select best agent
    const bestAgentIndex = agentScores.indexOf(Math.max(...agentScores));
    const selectedAgent = agents[bestAgentIndex];

    // Add to queue and get position
    const queuePosition = await this.queueManager.addTask(selectedAgent.id, task);
    
    // Calculate estimated start time
    const estimatedStartTime = await this.calculateEstimatedStartTime(selectedAgent, queuePosition);

    // Update agent workload
    await this.updateAgentWorkload(selectedAgent.id, task.estimatedDuration);

    return {
      assignedAgent: selectedAgent,
      queuePosition,
      estimatedStartTime,
      reasoning: this.generateReasoningExplanation(selectedAgent, task, agentScores[bestAgentIndex])
    };
  }

  private async getEligibleAgents(teamId: string, requiredCapabilities: string[], options?: any): Promise<Agent[]> {
    const { data: agents, error } = await supabase
      .from('agents')
      .select(`
        id, name, capabilities, max_concurrent_tasks, 
        current_workload, performance_score, status, last_active
      `)
      .eq('team_id', teamId)
      .eq('status', 'active')
      .not('id', 'in', `(${(options?.excludeAgents || []).join(',')})`)
      .order('performance_score', { ascending: false });

    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);

    return (agents || []).filter(agent => 
      this.capabilityMatcher.hasRequiredCapabilities(agent.capabilities, requiredCapabilities)
    );
  }

  private async calculateAgentScore(agent: Agent, task: Task): Promise<number> {
    const capabilityScore = this.capabilityMatcher.calculateMatch(agent.capabilities, task.requiredCapabilities);
    const workloadScore = this.loadBalancer.calculateWorkloadScore(agent);
    const performanceScore = agent.performance_score / 100;
    const availabilityScore = this.calculateAvailabilityScore(agent);

    return (capabilityScore * 0.3) + (workloadScore * 0.25) + 
           (performanceScore * 0.25) + (availabilityScore * 0.2);
  }

  private calculateAvailabilityScore(agent: Agent): number {
    const utilizationRatio = agent.current_workload / agent.max_concurrent_tasks;
    return Math.max(0, 1 - utilizationRatio);
  }

  private async calculateEstimatedStartTime(agent: Agent, queuePosition: number): Promise<number> {
    const queuedTasks = await this.queueManager.getAgentQueue(agent.id);
    let totalWaitTime = 0;

    for (let i = 0; i < Math.min(queuePosition, queuedTasks.length); i++) {
      totalWaitTime += queuedTasks[i].estimatedDuration;
    }

    return Date.now() + (totalWaitTime * 1000);
  }

  private async updateAgentWorkload(agentId: string, taskDuration: number): Promise<void> {
    await supabase
      .from('agents')
      .update({ 
        current_workload: supabase.sql`current_workload + 1`,
        last_active: new Date().toISOString()
      })
      .eq('id', agentId);
  }

  private generateReasoningExplanation(agent: Agent, task: Task, score: number): string {
    return `Agent ${agent.name} selected with score ${score.toFixed(2)} based on capability match, current workload (${agent.current_workload}/${agent.max_concurrent_tasks}), and performance history (${agent.performance_score}%).`;
  }
}

class CapabilityMatcher {
  hasRequiredCapabilities(agentCapabilities: string[], requiredCapabilities: string[]): boolean {
    return requiredCapabilities.every(required => 
      agentCapabilities.includes(required)
    );
  }

  calculateMatch(agentCapabilities: string[], requiredCapabilities: string[]): number {
    if (requiredCapabilities.length === 0) return 1;
    
    const matchCount = requiredCapabilities.filter(required => 
      agentCapabilities.includes(required)
    ).length;

    return matchCount / requiredCapabilities.length;
  }
}

class LoadBalancer {
  calculateWorkloadScore(agent: Agent): number {
    const utilizationRatio = agent.current_workload / agent.max_concurrent_tasks;
    return Math.max(0, 1 - utilizationRatio);
  }

  async rebalanceTasks(teamId: string, strategy: string = 'workload'): Promise<any> {
    const agents = await this.getTeamAgents(teamId);
    const rebalanceActions = [];

    switch (strategy) {
      case 'workload':
        rebalanceActions.push(...await this.rebalanceByWorkload(agents));
        break;
      case 'performance':
        rebalanceActions.push(...await this.rebalanceByPerformance(agents));
        break;
      case 'capability':
        rebalanceActions.push(...await this.rebalanceByCapability(agents));
        break;
    }

    return { actions: rebalanceActions, timestamp: Date.now() };
  }

  private async getTeamAgents(teamId: string): Promise<Agent[]> {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (error) throw new Error(`Failed to fetch team agents: ${error.message}`);
    return agents || [];
  }

  private async rebalanceByWorkload(agents: Agent[]): Promise<any[]> {
    const overloadedAgents = agents.filter(agent => 
      agent.current_workload > agent.max_concurrent_tasks * 0.8
    );
    const underutilizedAgents = agents.filter(agent => 
      agent.current_workload < agent.max_concurrent_tasks * 0.4
    );

    const actions = [];
    
    for (const overloaded of overloadedAgents) {
      const suitable = underutilizedAgents.find(agent => 
        agent.capabilities.some(cap => overloaded.capabilities.includes(cap))
      );
      
      if (suitable) {
        actions.push({
          type: 'reassign',
          fromAgent: overloaded.id,
          toAgent: suitable.id,
          reason: 'workload_balancing'
        });
      }
    }

    return actions;
  }

  private async rebalanceByPerformance(agents: Agent[]): Promise<any[]> {
    const lowPerformers = agents.filter(agent => agent.performance_score < 70);
    const highPerformers = agents.filter(agent => agent.performance_score > 90);

    return lowPerformers.map(low => ({
      type: 'performance_adjustment',
      agent: low.id,
      newPriority: 'low',
      reason: 'performance_optimization'
    }));
  }

  private async rebalanceByCapability(agents: Agent[]): Promise<any[]> {
    // Implement capability-based rebalancing logic
    return [];
  }
}

class QueueManager {
  async addTask(agentId: string, task: Task): Promise<number> {
    const queueKey = `agent_queue:${agentId}`;
    const priorityScore = this.calculatePriorityScore(task);
    
    await redis.zadd(queueKey, priorityScore, JSON.stringify(task));
    return await redis.zcard(queueKey);
  }

  async getAgentQueue(agentId: string): Promise<Task[]> {
    const queueKey = `agent_queue:${agentId}`;
    const tasks = await redis.zrevrange(queueKey, 0, -1);
    return tasks.map(task => JSON.parse(task));
  }

  private calculatePriorityScore(task: Task): number {
    const priorityValues = { urgent: 4, high: 3, medium: 2, low: 1 };
    const priorityScore = priorityValues[task.priority] * 1000;
    const complexityBonus = task.complexity * 10;
    const timeBonus = Date.now() / 1000; // Earlier submissions get higher scores
    
    return priorityScore + complexityBonus + timeBonus;
  }
}

class PerformanceTracker {
  async updateAgentPerformance(agentId: string, taskId: string, metrics: any): Promise<void> {
    const performanceData = {
      agent_id: agentId,
      task_id: taskId,
      completion_time: metrics.completionTime,
      quality_score: metrics.qualityScore,
      efficiency_score: metrics.efficiencyScore,
      timestamp: new Date().toISOString()
    };

    const { error } = await supabase
      .from('agent_performance')
      .insert(performanceData);

    if (error) throw new Error(`Failed to update performance: ${error.message}`);

    // Update agent's overall performance score
    await this.recalculateAgentPerformance(agentId);
  }

  private async recalculateAgentPerformance(agentId: string): Promise<void> {
    const { data: recentPerformance, error } = await supabase
      .from('agent_performance')
      .select('quality_score, efficiency_score')
      .eq('agent_id', agentId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error || !recentPerformance?.length) return;

    const avgQuality = recentPerformance.reduce((sum, p) => sum + p.quality_score, 0) / recentPerformance.length;
    const avgEfficiency = recentPerformance.reduce((sum, p) => sum + p.efficiency_score, 0) / recentPerformance.length;
    const overallScore = (avgQuality + avgEfficiency) / 2;

    await supabase
      .from('agents')
      .update({ performance_score: Math.round(overallScore) })
      .eq('id', agentId);
  }
}

class TaskPrioritizer {
  prioritizeTasks(tasks: Task[]): Task[] {
    return tasks.sort((a, b) => {
      const aScore = this.calculateTaskPriority(a);
      const bScore = this.calculateTaskPriority(b);
      return bScore - aScore;
    });
  }

  private calculateTaskPriority(task: Task): number {
    const priorityValues = { urgent: 4, high: 3, medium: 2, low: 1 };
    return priorityValues[task.priority] * task.complexity;
  }
}

// Initialize services
const workloadDistributor = new WorkloadDistributor();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, teamId, options } = taskDistributionSchema.parse(body);

    const result = await workloadDistributor.distributeTask(task, teamId, options);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Workload distribution error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Get team agents and their current status
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, name, current_workload, max_concurrent_tasks, status, performance_score')
      .eq('team_id', teamId);

    if (agentsError) {
      throw new Error(`Failed to fetch agents: ${agentsError.message}`);
    }

    // Get queue statistics
    const queueStats = await Promise.all(
      (agents || []).map(async (agent) => {
        const queueLength = await redis.zcard(`agent_queue:${agent.id}`);
        return {
          agentId: agent.id,
          queueLength,
          utilization: (agent.current_workload / agent.max_concurrent_tasks) * 100
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        agents: agents || [],
        queueStats,
        totalActiveAgents: agents?.filter(a => a.status === 'active').length || 0,
        averageUtilization: queueStats.reduce((sum, stat) => sum + stat.utilization, 0) / queueStats.length || 0
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Status fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, strategy } = rebalanceSchema.parse(body);

    const loadBalancer = new LoadBalancer();
    const result = await loadBalancer.rebalanceTasks(teamId, strategy);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Rebalance error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```