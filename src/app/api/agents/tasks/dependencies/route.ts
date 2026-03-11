```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Types and Schemas
const TaskDependencySchema = z.object({
  task_id: z.string().uuid(),
  depends_on_task_id: z.string().uuid(),
  dependency_type: z.enum(['hard', 'soft', 'conditional']),
  blocking_condition: z.string().optional(),
  weight: z.number().min(0).max(100).default(50),
  metadata: z.record(z.any()).optional()
});

const DependencyValidationSchema = z.object({
  task_ids: z.array(z.string().uuid()),
  dependency_graph: z.record(z.array(z.string()))
});

const ExecutionOrderSchema = z.object({
  agent_id: z.string().uuid(),
  include_parallel: z.boolean().default(true),
  max_parallel: z.number().min(1).max(10).default(3)
});

const BlockingResolutionSchema = z.object({
  task_id: z.string().uuid(),
  resolution_action: z.enum(['force_continue', 'skip_dependency', 'retry', 'cancel']),
  reason: z.string().min(1)
});

interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'hard' | 'soft' | 'conditional';
  blocking_condition?: string;
  weight: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface TaskNode {
  id: string;
  agent_id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  priority: number;
  estimated_duration: number;
  dependencies: string[];
  dependents: string[];
}

interface ExecutionPlan {
  execution_order: string[][];
  parallel_groups: string[][];
  blocked_tasks: string[];
  estimated_completion_time: number;
  critical_path: string[];
}

class TaskDependencyManager {
  private supabase;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async createDependency(dependency: Omit<TaskDependency, 'id' | 'created_at' | 'updated_at'>): Promise<TaskDependency> {
    // Validate tasks exist
    const { data: tasks, error: tasksError } = await this.supabase
      .from('agent_tasks')
      .select('id, agent_id, status')
      .in('id', [dependency.task_id, dependency.depends_on_task_id]);

    if (tasksError) throw new Error(`Failed to validate tasks: ${tasksError.message}`);
    if (tasks.length !== 2) throw new Error('One or both tasks not found');

    // Check for circular dependencies
    const wouldCreateCycle = await this.checkForCircularDependency(
      dependency.task_id,
      dependency.depends_on_task_id
    );

    if (wouldCreateCycle) {
      throw new Error('Cannot create dependency: would result in circular dependency');
    }

    // Create dependency
    const { data, error } = await this.supabase
      .from('task_dependencies')
      .insert(dependency)
      .select()
      .single();

    if (error) throw new Error(`Failed to create dependency: ${error.message}`);

    // Update dependency graph in tasks table
    await this.updateTaskDependencyGraph(dependency.task_id);
    await this.updateTaskDependencyGraph(dependency.depends_on_task_id);

    return data;
  }

  async getDependencies(taskId: string): Promise<{
    dependencies: TaskDependency[];
    dependents: TaskDependency[];
    task_details: TaskNode;
  }> {
    const [dependenciesResult, dependentsResult, taskResult] = await Promise.all([
      this.supabase
        .from('task_dependencies')
        .select(`
          *,
          depends_on_task:agent_tasks!task_dependencies_depends_on_task_id_fkey(
            id, title, status, agent_id, priority
          )
        `)
        .eq('task_id', taskId),
      
      this.supabase
        .from('task_dependencies')
        .select(`
          *,
          dependent_task:agent_tasks!task_dependencies_task_id_fkey(
            id, title, status, agent_id, priority
          )
        `)
        .eq('depends_on_task_id', taskId),

      this.supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', taskId)
        .single()
    ]);

    if (dependenciesResult.error) throw new Error(`Failed to fetch dependencies: ${dependenciesResult.error.message}`);
    if (dependentsResult.error) throw new Error(`Failed to fetch dependents: ${dependentsResult.error.message}`);
    if (taskResult.error) throw new Error(`Failed to fetch task: ${taskResult.error.message}`);

    return {
      dependencies: dependenciesResult.data,
      dependents: dependentsResult.data,
      task_details: taskResult.data
    };
  }

  async validateDependencyGraph(taskIds: string[]): Promise<{
    is_valid: boolean;
    cycles: string[][];
    unreachable_tasks: string[];
    analysis: Record<string, any>;
  }> {
    const { data: dependencies, error } = await this.supabase
      .from('task_dependencies')
      .select('task_id, depends_on_task_id')
      .in('task_id', taskIds);

    if (error) throw new Error(`Failed to fetch dependencies: ${error.message}`);

    const graph = this.buildDependencyGraph(dependencies);
    const cycles = this.detectCycles(graph);
    const unreachableTransitive = this.findUnreachableTasks(graph, taskIds);

    return {
      is_valid: cycles.length === 0,
      cycles,
      unreachable_tasks: unreachableTransitive,
      analysis: {
        total_tasks: taskIds.length,
        total_dependencies: dependencies.length,
        max_depth: this.calculateMaxDepth(graph),
        parallelism_potential: this.calculateParallelismPotential(graph)
      }
    };
  }

  async generateExecutionOrder(agentId: string, includeParallel: boolean = true, maxParallel: number = 3): Promise<ExecutionPlan> {
    const { data: tasks, error } = await this.supabase
      .from('agent_tasks')
      .select(`
        *,
        dependencies:task_dependencies!task_dependencies_task_id_fkey(
          depends_on_task_id, dependency_type, weight
        )
      `)
      .eq('agent_id', agentId)
      .in('status', ['pending', 'blocked']);

    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);

    const dependencyGraph = this.buildTaskDependencyGraph(tasks);
    const topologicalOrder = this.topologicalSort(dependencyGraph);
    
    let executionOrder: string[][];
    let parallelGroups: string[][] = [];

    if (includeParallel) {
      const result = this.optimizeParallelExecution(topologicalOrder, dependencyGraph, maxParallel);
      executionOrder = result.execution_order;
      parallelGroups = result.parallel_groups;
    } else {
      executionOrder = topologicalOrder.map(taskId => [taskId]);
    }

    const blockedTasks = this.identifyBlockedTasks(tasks, dependencyGraph);
    const criticalPath = this.calculateCriticalPath(dependencyGraph, tasks);
    const estimatedTime = this.estimateCompletionTime(executionOrder, tasks);

    return {
      execution_order: executionOrder,
      parallel_groups: parallelGroups,
      blocked_tasks: blockedTasks,
      estimated_completion_time: estimatedTime,
      critical_path: criticalPath
    };
  }

  async resolveBlockingCondition(taskId: string, resolutionAction: string, reason: string): Promise<{
    success: boolean;
    updated_dependencies: TaskDependency[];
    next_executable_tasks: string[];
  }> {
    const { data: task, error: taskError } = await this.supabase
      .from('agent_tasks')
      .select('*, dependencies:task_dependencies(*)')
      .eq('id', taskId)
      .single();

    if (taskError) throw new Error(`Failed to fetch task: ${taskError.message}`);

    let updatedDependencies: TaskDependency[] = [];
    let nextExecutableTasks: string[] = [];

    switch (resolutionAction) {
      case 'force_continue':
        await this.supabase
          .from('agent_tasks')
          .update({ status: 'pending' })
          .eq('id', taskId);
        
        nextExecutableTasks = [taskId];
        break;

      case 'skip_dependency':
        const { data: softDeps, error: softDepsError } = await this.supabase
          .from('task_dependencies')
          .update({ dependency_type: 'soft' })
          .eq('task_id', taskId)
          .eq('dependency_type', 'hard')
          .select();

        if (softDepsError) throw new Error(`Failed to update dependencies: ${softDepsError.message}`);
        
        updatedDependencies = softDeps || [];
        nextExecutableTasks = await this.getNextExecutableTasks(taskId);
        break;

      case 'retry':
        // Reset failed dependencies
        await this.supabase
          .from('agent_tasks')
          .update({ status: 'pending' })
          .in('id', task.dependencies?.map((d: any) => d.depends_on_task_id) || [])
          .eq('status', 'failed');
        break;

      case 'cancel':
        await this.supabase
          .from('agent_tasks')
          .update({ status: 'cancelled' })
          .eq('id', taskId);
        break;
    }

    // Log resolution action
    await this.supabase
      .from('agent_task_execution_log')
      .insert({
        task_id: taskId,
        action: 'dependency_resolution',
        details: { resolution_action: resolutionAction, reason },
        timestamp: new Date().toISOString()
      });

    return {
      success: true,
      updated_dependencies: updatedDependencies,
      next_executable_tasks: nextExecutableTasks
    };
  }

  private async checkForCircularDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
    const visited = new Set<string>();
    const path = new Set<string>();

    const dfs = async (currentTaskId: string): Promise<boolean> => {
      if (path.has(currentTaskId)) return true;
      if (visited.has(currentTaskId)) return false;

      visited.add(currentTaskId);
      path.add(currentTaskId);

      const { data: dependencies } = await this.supabase
        .from('task_dependencies')
        .select('depends_on_task_id')
        .eq('task_id', currentTaskId);

      if (dependencies) {
        for (const dep of dependencies) {
          if (await dfs(dep.depends_on_task_id)) {
            return true;
          }
        }
      }

      path.delete(currentTaskId);
      return false;
    };

    // Check if adding this dependency would create a cycle
    const mockDependencies = await this.supabase
      .from('task_dependencies')
      .select('depends_on_task_id')
      .eq('task_id', dependsOnTaskId);

    if (mockDependencies.data) {
      for (const dep of mockDependencies.data) {
        if (dep.depends_on_task_id === taskId) return true;
      }
    }

    return await dfs(dependsOnTaskId);
  }

  private async updateTaskDependencyGraph(taskId: string): Promise<void> {
    const { data: dependencies } = await this.supabase
      .from('task_dependencies')
      .select('depends_on_task_id, dependency_type, weight')
      .eq('task_id', taskId);

    const dependencyGraph = dependencies?.reduce((acc, dep) => {
      acc[dep.depends_on_task_id] = {
        type: dep.dependency_type,
        weight: dep.weight
      };
      return acc;
    }, {} as Record<string, any>) || {};

    await this.supabase
      .from('agent_tasks')
      .update({ dependency_graph: dependencyGraph })
      .eq('id', taskId);
  }

  private buildDependencyGraph(dependencies: any[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    dependencies.forEach(dep => {
      if (!graph.has(dep.task_id)) {
        graph.set(dep.task_id, []);
      }
      graph.get(dep.task_id)!.push(dep.depends_on_task_id);
    });

    return graph;
  }

  private detectCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path = new Set<string>();
    const pathArray: string[] = [];

    const dfs = (node: string) => {
      if (path.has(node)) {
        const cycleStart = pathArray.indexOf(node);
        cycles.push(pathArray.slice(cycleStart));
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      path.add(node);
      pathArray.push(node);

      const neighbors = graph.get(node) || [];
      neighbors.forEach(neighbor => dfs(neighbor));

      path.delete(node);
      pathArray.pop();
    };

    graph.forEach((_, node) => {
      if (!visited.has(node)) {
        dfs(node);
      }
    });

    return cycles;
  }

  private findUnreachableTasks(graph: Map<string, string[]>, allTaskIds: string[]): string[] {
    const reachable = new Set<string>();
    
    const dfs = (node: string) => {
      if (reachable.has(node)) return;
      reachable.add(node);
      
      const neighbors = graph.get(node) || [];
      neighbors.forEach(neighbor => dfs(neighbor));
    };

    // Start DFS from nodes with no dependencies
    allTaskIds.forEach(taskId => {
      if (!graph.has(taskId) || graph.get(taskId)!.length === 0) {
        dfs(taskId);
      }
    });

    return allTaskIds.filter(taskId => !reachable.has(taskId));
  }

  private calculateMaxDepth(graph: Map<string, string[]>): number {
    const depths = new Map<string, number>();
    
    const calculateDepth = (node: string): number => {
      if (depths.has(node)) return depths.get(node)!;
      
      const dependencies = graph.get(node) || [];
      if (dependencies.length === 0) {
        depths.set(node, 0);
        return 0;
      }
      
      const maxDepth = Math.max(...dependencies.map(dep => calculateDepth(dep))) + 1;
      depths.set(node, maxDepth);
      return maxDepth;
    };

    let maxDepth = 0;
    graph.forEach((_, node) => {
      maxDepth = Math.max(maxDepth, calculateDepth(node));
    });

    return maxDepth;
  }

  private calculateParallelismPotential(graph: Map<string, string[]>): number {
    const levels = new Map<number, string[]>();
    const taskLevels = new Map<string, number>();

    const calculateLevel = (node: string): number => {
      if (taskLevels.has(node)) return taskLevels.get(node)!;
      
      const dependencies = graph.get(node) || [];
      const level = dependencies.length === 0 ? 0 : Math.max(...dependencies.map(dep => calculateLevel(dep))) + 1;
      
      taskLevels.set(node, level);
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level)!.push(node);
      
      return level;
    };

    graph.forEach((_, node) => calculateLevel(node));

    return Math.max(...Array.from(levels.values()).map(level => level.length));
  }

  private buildTaskDependencyGraph(tasks: any[]): Map<string, any> {
    const graph = new Map();
    
    tasks.forEach(task => {
      graph.set(task.id, {
        ...task,
        dependencies: task.dependencies?.map((d: any) => d.depends_on_task_id) || []
      });
    });

    return graph;
  }

  private topologicalSort(graph: Map<string, any>): string[] {
    const inDegree = new Map<string, number>();
    const result: string[] = [];
    const queue: string[] = [];

    // Initialize in-degrees
    graph.forEach((_, taskId) => inDegree.set(taskId, 0));
    graph.forEach(task => {
      task.dependencies.forEach((depId: string) => {
        inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
      });
    });

    // Find tasks with no dependencies
    inDegree.forEach((degree, taskId) => {
      if (degree === 0) queue.push(taskId);
    });

    // Process queue
    while (queue.length > 0) {
      const taskId = queue.shift()!;
      result.push(taskId);

      graph.forEach((task, id) => {
        if (task.dependencies.includes(taskId)) {
          const newDegree = inDegree.get(id)! - 1;
          inDegree.set(id, newDegree);
          if (newDegree === 0) queue.push(id);
        }
      });
    }

    return result;
  }

  private optimizeParallelExecution(order: string[], graph: Map<string, any>, maxParallel: number): {
    execution_order: string[][];
    parallel_groups: string[][];
  } {
    const executionOrder: string[][] = [];
    const parallelGroups: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(order);

    while (remaining.size > 0) {
      const available = Array.from(remaining).filter(taskId => {
        const task = graph.get(taskId);
        return task.dependencies.every((dep: string) => completed.has(dep));
      });

      if (available.length === 0) break; // Deadlock

      const batch = available.slice(0, maxParallel);
      executionOrder.push(batch);
      
      if (batch.length > 1) {
        parallelGroups.push(batch);
      }

      batch.forEach(taskId => {
        completed.add(taskId);
        remaining.delete(taskId);
      });
    }

    return { execution_order: executionOrder, parallel_groups: parallelGroups };
  }

  private identifyBlockedTasks(tasks: any[], graph: Map<string, any>): string[] {
    return tasks
      .filter(task => task.status === 'blocked')
      .map(task => task.id);
  }

  private calculateCriticalPath(graph: Map<string, any>, tasks: any[]): string[] {
    // Simplified critical path calculation based on estimated durations
    const taskDurations = new Map(tasks.map(t => [t.id, t.estimated_duration || 60]));
    const criticalPath: string[] = [];
    
    // Find the path with maximum total duration
    const findLongestPath = (taskId: string, visited: Set<string>): { path: string[], duration: number } => {
      if (visited.has(taskId)) return { path: [], duration: 0 };
      
      visited.add(taskId);
      const task = graph.get(taskId);
      const taskDuration = taskDurations.get(taskId) || 0;
      
      if (!task.dependencies || task.dependencies.length === 0) {
        visited.delete(taskId);
        return { path: [taskId], duration: taskDuration };
      }
      
      let longestPath = { path: [], duration: 0 };
      task.dependencies.forEach((depId: string) => {
        const depPath = findLongestPath(depId, visited);
        if (depPath.duration > longestPath.duration) {
          longestPath = depPath;
        }
      });
      
      visited.delete(taskId);
      return {
        path: [...longestPath.path, taskId],
        duration: longestPath.duration + taskDuration
      };
    };

    let globalLongestPath = { path: [], duration: 0 };
    graph.forEach((_, taskId) => {
      const pathResult = findLongestPath(taskId, new Set());
      if (pathResult.duration > globalLongestPath.duration) {
        globalLongestPath = pathResult;
      }
    });

    return globalLongestPath.path;
  }

  private estimateCompletionTime(executionOrder: string[][], tasks: any[]): number {
    const taskDurations = new Map(tasks.map(t => [t.id, t.estimated_duration || 60]));
    
    return executionOrder.reduce((totalTime, batch) => {
      const batchMaxDuration = Math.max(...batch.map(taskId => taskDurations.get(taskId) || 0));
      return totalTime + batchMaxDuration;
    }, 0);
  }

  private async getNextExecutableTasks(taskId: string): Promise<string[]> {
    const { data: dependentTasks } = await this.supabase
      .from('task_dependencies')
      .select('task_id')
      .eq('depends_on_task_id', taskId);

    return dependentTasks?.map(d => d.task_id) || [];
  }
}

// Main route handlers
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const manager = new TaskDependencyManager(supabase);
    
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'validate') {
      const body = await request.json();
      const { task_ids, dependency_graph } = DependencyValidationSchema.parse(body);
      
      const result = await manager.validateDependencyGraph(