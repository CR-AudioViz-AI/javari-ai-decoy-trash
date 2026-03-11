```typescript
import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

/**
 * Agent profile interface representing AI agent capabilities
 */
interface AgentProfile {
  id: string;
  name: string;
  type: 'creative' | 'analytical' | 'technical' | 'collaborative' | 'specialist';
  capabilities: {
    [key: string]: number; // 0-1 scale
  };
  availability: boolean;
  performanceScore: number;
  specializations: string[];
  workload: number;
  lastActive: Date;
}

/**
 * Task requirements interface
 */
interface TaskRequirement {
  id: string;
  name: string;
  requiredCapabilities: {
    [key: string]: {
      importance: number; // 0-1 scale
      minimumLevel: number; // 0-1 scale
    };
  };
  teamSize: {
    min: number;
    max: number;
    optimal: number;
  };
  deadline: Date;
  complexity: number; // 0-1 scale
  priority: 'low' | 'medium' | 'high' | 'critical';
  collaboration: 'low' | 'medium' | 'high';
}

/**
 * Team composition interface
 */
interface TeamComposition {
  id: string;
  taskId: string;
  agents: AgentProfile[];
  fitnessScore: number;
  capabilityCoverage: { [key: string]: number };
  estimatedPerformance: number;
  compositionRationale: string;
  createdAt: Date;
}

/**
 * Performance history entry
 */
interface PerformanceHistory {
  teamId: string;
  taskId: string;
  agents: string[];
  actualPerformance: number;
  completionTime: number;
  qualityScore: number;
  collaborationScore: number;
  timestamp: Date;
}

/**
 * Genetic algorithm chromosome representing a team
 */
interface Chromosome {
  genes: string[]; // Agent IDs
  fitness: number;
  age: number;
}

/**
 * Optimization parameters
 */
interface OptimizationParams {
  populationSize: number;
  generations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismRate: number;
  convergenceThreshold: number;
}

/**
 * Task requirement parser that analyzes and structures task requirements
 */
class TaskRequirementParser {
  /**
   * Parse raw task description into structured requirements
   * @param taskData Raw task data
   * @returns Parsed task requirements
   */
  parseRequirements(taskData: any): TaskRequirement {
    try {
      const capabilities = this.extractCapabilities(taskData.description);
      const complexity = this.assessComplexity(taskData);
      const collaboration = this.assessCollaborationNeeds(taskData);

      return {
        id: taskData.id,
        name: taskData.name,
        requiredCapabilities: capabilities,
        teamSize: this.determineTeamSize(taskData, complexity),
        deadline: new Date(taskData.deadline),
        complexity,
        priority: taskData.priority || 'medium',
        collaboration
      };
    } catch (error) {
      throw new Error(`Failed to parse task requirements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract capability requirements from task description
   * @private
   */
  private extractCapabilities(description: string): { [key: string]: { importance: number; minimumLevel: number } } {
    const capabilityKeywords = {
      creativity: ['creative', 'design', 'innovative', 'brainstorm', 'artistic'],
      analysis: ['analyze', 'data', 'research', 'investigate', 'study'],
      technical: ['code', 'implement', 'technical', 'programming', 'development'],
      communication: ['present', 'communicate', 'report', 'document', 'collaborate'],
      problem_solving: ['solve', 'troubleshoot', 'debug', 'fix', 'resolve'],
      project_management: ['manage', 'coordinate', 'organize', 'plan', 'schedule']
    };

    const capabilities: { [key: string]: { importance: number; minimumLevel: number } } = {};
    const lowerDesc = description.toLowerCase();

    for (const [capability, keywords] of Object.entries(capabilityKeywords)) {
      const matches = keywords.filter(keyword => lowerDesc.includes(keyword)).length;
      if (matches > 0) {
        capabilities[capability] = {
          importance: Math.min(matches / keywords.length, 1),
          minimumLevel: 0.3 + (matches / keywords.length) * 0.5
        };
      }
    }

    return capabilities;
  }

  /**
   * Assess task complexity
   * @private
   */
  private assessComplexity(taskData: any): number {
    let complexity = 0.5; // Base complexity

    // Adjust based on task characteristics
    if (taskData.subtasks && taskData.subtasks.length > 5) complexity += 0.2;
    if (taskData.dependencies && taskData.dependencies.length > 3) complexity += 0.15;
    if (taskData.estimatedHours > 40) complexity += 0.1;
    if (taskData.priority === 'critical') complexity += 0.1;

    return Math.min(complexity, 1);
  }

  /**
   * Assess collaboration needs
   * @private
   */
  private assessCollaborationNeeds(taskData: any): 'low' | 'medium' | 'high' {
    const collabKeywords = ['collaborate', 'team', 'coordinate', 'together', 'jointly'];
    const description = (taskData.description || '').toLowerCase();
    const matches = collabKeywords.filter(keyword => description.includes(keyword)).length;

    if (matches >= 3) return 'high';
    if (matches >= 1) return 'medium';
    return 'low';
  }

  /**
   * Determine optimal team size
   * @private
   */
  private determineTeamSize(taskData: any, complexity: number): { min: number; max: number; optimal: number } {
    const baseSize = 3;
    const complexityMultiplier = 1 + complexity;
    
    const optimal = Math.round(baseSize * complexityMultiplier);
    return {
      min: Math.max(2, optimal - 1),
      max: optimal + 2,
      optimal
    };
  }
}

/**
 * Agent capability analyzer
 */
class AgentCapabilityAnalyzer {
  /**
   * Calculate fitness score for agent relative to task requirements
   * @param agent Agent profile
   * @param requirements Task requirements
   * @returns Fitness score (0-1)
   */
  calculateAgentFitness(agent: AgentProfile, requirements: TaskRequirement): number {
    try {
      let totalFitness = 0;
      let totalWeight = 0;

      // Capability matching
      for (const [capability, requirement] of Object.entries(requirements.requiredCapabilities)) {
        const agentCapability = agent.capabilities[capability] || 0;
        const weight = requirement.importance;
        
        let capabilityScore = 0;
        if (agentCapability >= requirement.minimumLevel) {
          capabilityScore = Math.min(agentCapability / requirement.minimumLevel, 1);
        }

        totalFitness += capabilityScore * weight;
        totalWeight += weight;
      }

      // Normalize by weight
      let baseFitness = totalWeight > 0 ? totalFitness / totalWeight : 0;

      // Apply modifiers
      baseFitness *= this.getAvailabilityModifier(agent);
      baseFitness *= this.getPerformanceModifier(agent);
      baseFitness *= this.getWorkloadModifier(agent);

      return Math.max(0, Math.min(1, baseFitness));
    } catch (error) {
      throw new Error(`Failed to calculate agent fitness: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze team synergy
   * @param team Array of agents
   * @returns Synergy score (0-1)
   */
  analyzeTeamSynergy(team: AgentProfile[]): number {
    if (team.length < 2) return 1;

    let synergyScore = 0;
    let pairCount = 0;

    // Analyze all agent pairs
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        synergyScore += this.calculatePairSynergy(team[i], team[j]);
        pairCount++;
      }
    }

    return pairCount > 0 ? synergyScore / pairCount : 1;
  }

  /**
   * Calculate capability coverage for team
   * @param team Array of agents
   * @param requirements Task requirements
   * @returns Coverage scores by capability
   */
  calculateCapabilityCoverage(team: AgentProfile[], requirements: TaskRequirement): { [key: string]: number } {
    const coverage: { [key: string]: number } = {};

    for (const capability of Object.keys(requirements.requiredCapabilities)) {
      const teamCapability = Math.max(...team.map(agent => agent.capabilities[capability] || 0));
      coverage[capability] = teamCapability;
    }

    return coverage;
  }

  /**
   * Get availability modifier
   * @private
   */
  private getAvailabilityModifier(agent: AgentProfile): number {
    return agent.availability ? 1 : 0.1;
  }

  /**
   * Get performance modifier
   * @private
   */
  private getPerformanceModifier(agent: AgentProfile): number {
    return 0.8 + (agent.performanceScore * 0.2);
  }

  /**
   * Get workload modifier
   * @private
   */
  private getWorkloadModifier(agent: AgentProfile): number {
    return Math.max(0.3, 1 - (agent.workload * 0.7));
  }

  /**
   * Calculate synergy between two agents
   * @private
   */
  private calculatePairSynergy(agent1: AgentProfile, agent2: AgentProfile): number {
    // Different agent types work well together
    const typeCompatibility = agent1.type !== agent2.type ? 1.2 : 0.8;
    
    // Complementary capabilities
    let complementarity = 0;
    const allCapabilities = new Set([
      ...Object.keys(agent1.capabilities),
      ...Object.keys(agent2.capabilities)
    ]);

    for (const capability of allCapabilities) {
      const cap1 = agent1.capabilities[capability] || 0;
      const cap2 = agent2.capabilities[capability] || 0;
      
      // Reward complementary strengths
      if ((cap1 > 0.7 && cap2 < 0.3) || (cap2 > 0.7 && cap1 < 0.3)) {
        complementarity += 0.1;
      }
    }

    return Math.min(1, (typeCompatibility + complementarity) / 2);
  }
}

/**
 * Performance history tracker
 */
class PerformanceHistoryTracker {
  private supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
  );

  /**
   * Get historical performance for agents
   * @param agentIds Array of agent IDs
   * @returns Performance history entries
   */
  async getAgentPerformanceHistory(agentIds: string[]): Promise<PerformanceHistory[]> {
    try {
      const { data, error } = await this.supabase
        .from('team_performance_history')
        .select('*')
        .overlaps('agents', agentIds)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Failed to fetch performance history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate performance metrics for agent combinations
   * @param agentIds Array of agent IDs
   * @returns Performance metrics
   */
  async calculatePerformanceMetrics(agentIds: string[]): Promise<{
    averagePerformance: number;
    successRate: number;
    averageCompletionTime: number;
    collaborationScore: number;
  }> {
    try {
      const history = await this.getAgentPerformanceHistory(agentIds);
      
      if (history.length === 0) {
        return {
          averagePerformance: 0.5,
          successRate: 0.5,
          averageCompletionTime: 1,
          collaborationScore: 0.5
        };
      }

      const totalPerformance = history.reduce((sum, entry) => sum + entry.actualPerformance, 0);
      const totalCollaboration = history.reduce((sum, entry) => sum + entry.collaborationScore, 0);
      const totalCompletionTime = history.reduce((sum, entry) => sum + entry.completionTime, 0);
      const successfulTasks = history.filter(entry => entry.actualPerformance > 0.7).length;

      return {
        averagePerformance: totalPerformance / history.length,
        successRate: successfulTasks / history.length,
        averageCompletionTime: totalCompletionTime / history.length,
        collaborationScore: totalCollaboration / history.length
      };
    } catch (error) {
      throw new Error(`Failed to calculate performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Record team performance
   * @param performance Performance data
   */
  async recordPerformance(performance: Omit<PerformanceHistory, 'timestamp'>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('team_performance_history')
        .insert({
          ...performance,
          timestamp: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      throw new Error(`Failed to record performance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Genetic algorithm optimizer for team formation
 */
class GeneticAlgorithmOptimizer extends EventEmitter {
  private taskRequirement: TaskRequirement;
  private availableAgents: AgentProfile[];
  private capabilityAnalyzer: AgentCapabilityAnalyzer;
  private performanceTracker: PerformanceHistoryTracker;
  private worker: Worker | null = null;

  constructor(
    taskRequirement: TaskRequirement,
    availableAgents: AgentProfile[],
    capabilityAnalyzer: AgentCapabilityAnalyzer,
    performanceTracker: PerformanceHistoryTracker
  ) {
    super();
    this.taskRequirement = taskRequirement;
    this.availableAgents = availableAgents;
    this.capabilityAnalyzer = capabilityAnalyzer;
    this.performanceTracker = performanceTracker;
  }

  /**
   * Optimize team composition using genetic algorithm
   * @param params Optimization parameters
   * @returns Best team composition
   */
  async optimize(params: OptimizationParams): Promise<TeamComposition> {
    try {
      return new Promise((resolve, reject) => {
        // Create worker for genetic algorithm computation
        this.worker = new Worker(__filename, {
          workerData: {
            taskRequirement: this.taskRequirement,
            availableAgents: this.availableAgents,
            params,
            isWorker: true
          }
        });

        this.worker.on('message', (message) => {
          if (message.type === 'progress') {
            this.emit('progress', message.data);
          } else if (message.type === 'result') {
            const bestChromosome = message.data;
            const teamComposition = this.createTeamComposition(bestChromosome);
            resolve(teamComposition);
          } else if (message.type === 'error') {
            reject(new Error(message.data));
          }
        });

        this.worker.on('error', (error) => {
          reject(new Error(`Worker error: ${error.message}`));
        });
      });
    } catch (error) {
      throw new Error(`Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop optimization process
   */
  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Create team composition from chromosome
   * @private
   */
  private createTeamComposition(chromosome: Chromosome): TeamComposition {
    const agents = chromosome.genes.map(id => 
      this.availableAgents.find(agent => agent.id === id)
    ).filter(Boolean) as AgentProfile[];

    const capabilityCoverage = this.capabilityAnalyzer.calculateCapabilityCoverage(
      agents, 
      this.taskRequirement
    );

    return {
      id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskId: this.taskRequirement.id,
      agents,
      fitnessScore: chromosome.fitness,
      capabilityCoverage,
      estimatedPerformance: chromosome.fitness * 0.8 + 0.2, // Conservative estimate
      compositionRationale: this.generateRationale(agents, capabilityCoverage),
      createdAt: new Date()
    };
  }

  /**
   * Generate human-readable rationale for team composition
   * @private
   */
  private generateRationale(agents: AgentProfile[], coverage: { [key: string]: number }): string {
    const agentTypes = agents.map(agent => agent.type);
    const uniqueTypes = [...new Set(agentTypes)];
    const strongCapabilities = Object.entries(coverage)
      .filter(([_, score]) => score > 0.7)
      .map(([capability, _]) => capability);

    return `Team composed of ${uniqueTypes.join(', ')} agents with strong coverage in ${strongCapabilities.join(', ')}. Team synergy score: ${this.capabilityAnalyzer.analyzeTeamSynergy(agents).toFixed(2)}.`;
  }
}

/**
 * Team composition validator
 */
class TeamCompositionValidator {
  /**
   * Validate team composition against requirements
   * @param composition Team composition
   * @param requirements Task requirements
   * @returns Validation result
   */
  validateComposition(
    composition: TeamComposition, 
    requirements: TaskRequirement
  ): { isValid: boolean; issues: string[]; score: number } {
    const issues: string[] = [];
    let validationScore = 1;

    try {
      // Check team size
      const teamSize = composition.agents.length;
      if (teamSize < requirements.teamSize.min) {
        issues.push(`Team too small: ${teamSize} < ${requirements.teamSize.min}`);
        validationScore -= 0.3;
      } else if (teamSize > requirements.teamSize.max) {
        issues.push(`Team too large: ${teamSize} > ${requirements.teamSize.max}`);
        validationScore -= 0.2;
      }

      // Check capability coverage
      for (const [capability, requirement] of Object.entries(requirements.requiredCapabilities)) {
        const coverage = composition.capabilityCoverage[capability] || 0;
        if (coverage < requirement.minimumLevel) {
          issues.push(`Insufficient ${capability}: ${coverage.toFixed(2)} < ${requirement.minimumLevel}`);
          validationScore -= requirement.importance * 0.2;
        }
      }

      // Check agent availability
      const unavailableAgents = composition.agents.filter(agent => !agent.availability);
      if (unavailableAgents.length > 0) {
        issues.push(`Unavailable agents: ${unavailableAgents.map(a => a.name).join(', ')}`);
        validationScore -= unavailableAgents.length * 0.1;
      }

      // Check fitness threshold
      if (composition.fitnessScore < 0.5) {
        issues.push(`Low fitness score: ${composition.fitnessScore.toFixed(2)}`);
        validationScore -= 0.2;
      }

      return {
        isValid: issues.length === 0 && validationScore > 0.6,
        issues,
        score: Math.max(0, validationScore)
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        score: 0
      };
    }
  }

  /**
   * Suggest improvements for team composition
   * @param composition Team composition
   * @param requirements Task requirements
   * @param availableAgents Available agents
   * @returns Improvement suggestions
   */
  suggestImprovements(
    composition: TeamComposition,
    requirements: TaskRequirement,
    availableAgents: AgentProfile[]
  ): string[] {
    const suggestions: string[] = [];

    try {
      // Identify capability gaps
      for (const [capability, requirement] of Object.entries(requirements.requiredCapabilities)) {
        const coverage = composition.capabilityCoverage[capability] || 0;
        if (coverage < requirement.minimumLevel) {
          const betterAgents = availableAgents
            .filter(agent => 
              agent.availability && 
              !composition.agents.find(teamAgent => teamAgent.id === agent.id) &&
              (agent.capabilities[capability] || 0) > coverage
            )
            .sort((a, b) => (b.capabilities[capability] || 0) - (a.capabilities[capability] || 0))
            .slice(0, 3);

          if (betterAgents.length > 0) {
            suggestions.push(
              `Consider adding ${betterAgents[0].name} for better ${capability} coverage`
            );
          }
        }
      }

      // Check for redundancy
      const capabilities = Object.keys(requirements.requiredCapabilities);
      for (const capability of capabilities) {
        const strongAgents = composition.agents.filter(
          agent => (agent.capabilities[capability] || 0) > 0.8
        );
        if (strongAgents.length > 2) {
          suggestions.push(
            `Consider replacing one of the ${capability} specialists with a more balanced agent`
          );
        }
      }

      return suggestions;
    } catch (error) {
      return [`Error generating suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`];
    }
  }
}

/**
 * Main team formation engine
 */
class TeamFormationEngine extends EventEmitter {
  private supabase = createClient(
    process.env.SUPABASE_URL || '',