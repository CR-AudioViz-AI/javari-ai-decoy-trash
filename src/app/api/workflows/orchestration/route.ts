```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

// Environment validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const redisUrl = process.env.REDIS_URL!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const redis = new Redis(redisUrl);

// Validation schemas
const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['task', 'condition', 'parallel', 'merge', 'start', 'end']),
  name: z.string(),
  agentRequirements: z.object({
    capabilities: z.array(z.string()),
    minSkillLevel: z.number().min(1).max(10),
    preferredAgents: z.array(z.string()).optional()
  }).optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'greater_than', 'less_than', 'contains']),
    value: z.any(),
    nextNodeId: z.string()
  })).optional(),
  parallelBranches: z.array(z.string()).optional(),
  taskConfig: z.record(z.any()).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional()
});

const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    condition: z.string().optional()
  })),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  maxExecutionTime: z.number().optional(),
  tags: z.array(z.string()).optional()
});

const WorkflowExecutionSchema = z.object({
  workflowId: z.string().uuid(),
  inputData: z.record(z.any()),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  executionMode: z.enum(['sync', 'async']).default('async')
});

const WorkflowControlSchema = z.object({
  action: z.enum(['pause', 'resume', 'abort', 'retry']),
  reason: z.string().optional()
});

// Types
interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  skillLevel: number;
  status: 'available' | 'busy' | 'offline';
  currentLoad: number;
  maxConcurrentTasks: number;
  endpoint: string;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
  currentNodes: string[];
  completedNodes: string[];
  failedNodes: string[];
  agentAssignments: Record<string, string>;
  executionData: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// Core orchestration classes
class AgentManager {
  async getAvailableAgents(): Promise<Agent[]> {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'available');

    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
    return agents || [];
  }

  async matchAgentToTask(requirements: any): Promise<string | null> {
    const agents = await this.getAvailableAgents();
    
    const compatibleAgents = agents.filter(agent => 
      requirements.capabilities.every((cap: string) => agent.capabilities.includes(cap)) &&
      agent.skillLevel >= requirements.minSkillLevel &&
      agent.currentLoad < agent.maxConcurrentTasks
    );

    if (compatibleAgents.length === 0) return null;

    // Prefer agents with lower load and higher skill level
    compatibleAgents.sort((a, b) => {
      const aScore = (a.skillLevel * 10) - a.currentLoad;
      const bScore = (b.skillLevel * 10) - b.currentLoad;
      return bScore - aScore;
    });

    return compatibleAgents[0].id;
  }

  async assignAgentToTask(agentId: string, taskId: string, executionId: string): Promise<void> {
    const { error } = await supabase
      .from('task_assignments')
      .insert({
        agent_id: agentId,
        task_id: taskId,
        execution_id: executionId,
        assigned_at: new Date().toISOString(),
        status: 'assigned'
      });

    if (error) throw new Error(`Failed to assign agent: ${error.message}`);

    // Update agent load
    await supabase.rpc('increment_agent_load', { agent_id: agentId });
  }
}

class ConditionalBranchEngine {
  evaluateCondition(condition: any, data: any): boolean {
    const { field, operator, value } = condition;
    const fieldValue = this.getNestedValue(data, field);

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  getNextNodes(node: any, executionData: any): string[] {
    if (node.type === 'condition') {
      for (const condition of node.conditions || []) {
        if (this.evaluateCondition(condition, executionData)) {
          return [condition.nextNodeId];
        }
      }
      return [];
    }

    if (node.type === 'parallel') {
      return node.parallelBranches || [];
    }

    return [];
  }
}

class ParallelExecutor {
  async executeParallelTasks(nodeIds: string[], execution: WorkflowExecution, workflow: any): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const tasks = nodeIds.map(async (nodeId) => {
      try {
        const result = await this.executeNode(nodeId, execution, workflow);
        results[nodeId] = result;
      } catch (error) {
        results[nodeId] = { error: (error as Error).message };
      }
    });

    await Promise.allSettled(tasks);
    return results;
  }

  private async executeNode(nodeId: string, execution: WorkflowExecution, workflow: any): Promise<any> {
    const node = workflow.nodes.find((n: any) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    // Implementation would delegate to specific node executor
    // This is a simplified version
    return { nodeId, status: 'completed', result: 'mock_result' };
  }
}

class WorkflowStateManager {
  async saveExecutionState(execution: WorkflowExecution): Promise<void> {
    const cacheKey = `workflow:execution:${execution.id}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(execution));

    const { error } = await supabase
      .from('workflow_executions')
      .upsert({
        id: execution.id,
        workflow_id: execution.workflowId,
        status: execution.status,
        current_nodes: execution.currentNodes,
        completed_nodes: execution.completedNodes,
        failed_nodes: execution.failedNodes,
        agent_assignments: execution.agentAssignments,
        execution_data: execution.executionData,
        started_at: execution.startedAt.toISOString(),
        completed_at: execution.completedAt?.toISOString(),
        error: execution.error
      });

    if (error) throw new Error(`Failed to save execution state: ${error.message}`);
  }

  async getExecutionState(executionId: string): Promise<WorkflowExecution | null> {
    const cacheKey = `workflow:execution:${executionId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const execution = JSON.parse(cached);
      execution.startedAt = new Date(execution.startedAt);
      if (execution.completedAt) execution.completedAt = new Date(execution.completedAt);
      return execution;
    }

    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', executionId)
      .single();

    if (error || !data) return null;

    const execution: WorkflowExecution = {
      id: data.id,
      workflowId: data.workflow_id,
      status: data.status,
      currentNodes: data.current_nodes || [],
      completedNodes: data.completed_nodes || [],
      failedNodes: data.failed_nodes || [],
      agentAssignments: data.agent_assignments || {},
      executionData: data.execution_data || {},
      startedAt: new Date(data.started_at),
      completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
      error: data.error
    };

    await redis.setex(cacheKey, 3600, JSON.stringify(execution));
    return execution;
  }
}

class WorkflowOrchestrator {
  private agentManager = new AgentManager();
  private branchEngine = new ConditionalBranchEngine();
  private parallelExecutor = new ParallelExecutor();
  private stateManager = new WorkflowStateManager();

  async executeWorkflow(workflowId: string, inputData: any, priority: string): Promise<string> {
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (error || !workflow) {
      throw new Error('Workflow not found');
    }

    const executionId = uuidv4();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'pending',
      currentNodes: [this.findStartNode(workflow.definition.nodes)],
      completedNodes: [],
      failedNodes: [],
      agentAssignments: {},
      executionData: { input: inputData },
      startedAt: new Date()
    };

    await this.stateManager.saveExecutionState(execution);
    
    // Start execution asynchronously
    this.processExecution(execution, workflow.definition).catch(console.error);

    return executionId;
  }

  private async processExecution(execution: WorkflowExecution, workflow: any): Promise<void> {
    try {
      execution.status = 'running';
      await this.stateManager.saveExecutionState(execution);

      while (execution.currentNodes.length > 0 && execution.status === 'running') {
        const currentNode = workflow.nodes.find((n: any) => n.id === execution.currentNodes[0]);
        
        if (!currentNode) {
          throw new Error(`Node ${execution.currentNodes[0]} not found`);
        }

        if (currentNode.type === 'end') {
          execution.status = 'completed';
          execution.completedAt = new Date();
          break;
        }

        await this.executeNode(currentNode, execution, workflow);
        await this.stateManager.saveExecutionState(execution);
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = (error as Error).message;
      execution.completedAt = new Date();
      await this.stateManager.saveExecutionState(execution);
    }
  }

  private async executeNode(node: any, execution: WorkflowExecution, workflow: any): Promise<void> {
    const nodeId = node.id;

    try {
      let result: any = null;

      switch (node.type) {
        case 'task':
          result = await this.executeTaskNode(node, execution);
          break;
        case 'condition':
          result = await this.executeConditionalNode(node, execution);
          break;
        case 'parallel':
          result = await this.executeParallelNode(node, execution, workflow);
          break;
        default:
          result = { status: 'skipped' };
      }

      execution.executionData[nodeId] = result;
      execution.completedNodes.push(nodeId);
      execution.currentNodes = execution.currentNodes.filter(id => id !== nodeId);

      // Determine next nodes
      const nextNodes = this.getNextNodes(node, execution, workflow);
      execution.currentNodes.push(...nextNodes);

    } catch (error) {
      execution.failedNodes.push(nodeId);
      execution.currentNodes = execution.currentNodes.filter(id => id !== nodeId);
      throw error;
    }
  }

  private async executeTaskNode(node: any, execution: WorkflowExecution): Promise<any> {
    if (node.agentRequirements) {
      const agentId = await this.agentManager.matchAgentToTask(node.agentRequirements);
      if (!agentId) {
        throw new Error(`No suitable agent found for task ${node.id}`);
      }

      await this.agentManager.assignAgentToTask(agentId, node.id, execution.id);
      execution.agentAssignments[node.id] = agentId;
    }

    // Simulate task execution - in reality, this would call the agent's endpoint
    return { status: 'completed', result: `Task ${node.id} completed` };
  }

  private async executeConditionalNode(node: any, execution: WorkflowExecution): Promise<any> {
    const nextNodes = this.branchEngine.getNextNodes(node, execution.executionData);
    return { status: 'completed', nextNodes };
  }

  private async executeParallelNode(node: any, execution: WorkflowExecution, workflow: any): Promise<any> {
    const results = await this.parallelExecutor.executeParallelTasks(
      node.parallelBranches || [],
      execution,
      workflow
    );
    return { status: 'completed', parallelResults: results };
  }

  private findStartNode(nodes: any[]): string {
    const startNode = nodes.find(n => n.type === 'start');
    return startNode?.id || nodes[0]?.id;
  }

  private getNextNodes(node: any, execution: WorkflowExecution, workflow: any): string[] {
    const edges = workflow.edges.filter((e: any) => e.from === node.id);
    return edges.map((e: any) => e.to);
  }
}

// Initialize orchestrator
const orchestrator = new WorkflowOrchestrator();
const stateManager = new WorkflowStateManager();
const agentManager = new AgentManager();

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Create workflow definition
    if (pathname === '/api/workflows/orchestration') {
      const body = await request.json();
      const validated = WorkflowDefinitionSchema.parse(body);

      const { data: workflow, error } = await supabase
        .from('workflows')
        .insert({
          id: uuidv4(),
          name: validated.name,
          description: validated.description,
          definition: {
            nodes: validated.nodes,
            edges: validated.edges
          },
          priority: validated.priority,
          max_execution_time: validated.maxExecutionTime,
          tags: validated.tags,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create workflow: ${error.message}`);
      }

      return NextResponse.json({
        success: true,
        data: {
          workflowId: workflow.id,
          message: 'Workflow created successfully'
        }
      });
    }

    // Execute workflow
    if (pathname === '/api/workflows/orchestration/execute') {
      const body = await request.json();
      const validated = WorkflowExecutionSchema.parse(body);

      const executionId = await orchestrator.executeWorkflow(
        validated.workflowId,
        validated.inputData,
        validated.priority
      );

      return NextResponse.json({
        success: true,
        data: {
          executionId,
          message: 'Workflow execution started'
        }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid endpoint' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Workflow orchestration error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Get workflow execution status
    const statusMatch = pathname.match(/\/api\/workflows\/orchestration\/(.+)\/status/);
    if (statusMatch) {
      const executionId = statusMatch[1];
      
      if (!executionId || !/^[0-9a-f-]+$/i.test(executionId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid execution ID format' },
          { status: 400 }
        );
      }

      const execution = await stateManager.getExecutionState(executionId);
      
      if (!execution) {
        return NextResponse.json(
          { success: false, error: 'Execution not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: execution.id,
          workflowId: execution.workflowId,
          status: execution.status,
          currentNodes: execution.currentNodes,
          completedNodes: execution.completedNodes,
          failedNodes: execution.failedNodes,
          agentAssignments: execution.agentAssignments,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          error: execution.error
        }
      });
    }

    // Get agent availability
    if (pathname === '/api/workflows/orchestration/agents/availability') {
      const agents = await agentManager.getAvailableAgents();
      
      return NextResponse.json({
        success: true,
        data: {
          agents,
          totalAvailable: agents.length,
          totalCapacity: agents.reduce((sum, agent) => sum + agent.maxConcurrentTasks, 0),
          currentLoad: agents.reduce((sum, agent) => sum + agent.currentLoad, 0)
        }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid endpoint' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Workflow orchestration GET error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Control workflow execution
    const controlMatch = pathname.match(/\/api\/workflows\/orchestration\/(.+)\/control/);
    if (controlMatch) {
      const executionId = controlMatch[1];
      
      if (!executionId || !/^[0-9a-f-]+$/i.test(executionId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid execution ID format' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const validated = WorkflowControlSchema.parse(body);

      const execution = await stateManager.getExecutionState(executionId);
      if (!execution) {
        return NextResponse.json(
          { success: false, error: 'Execution not found' },
          { status: 404 }
        );
      }

      switch (validated.action) {
        case 'pause':
          execution.status = 'paused';
          break;
        case 'resume':
          if (execution.status === 'paused') {
            execution.status = 'running';
          }
          break;
        case 'abort':
          execution.status = 'aborted';
          execution.completedAt = new Date();
          break;
        case 'retry':
          if (execution.status === 'failed') {
            execution.status = 'running';
            execution.error = undefined;
          }
          break;
      }

      await stateManager.saveExecutionState(execution);

      return NextResponse.json({
        success: true,
        data: {
          message: `Workflow ${validated.action} successful`,
          newStatus: execution.status
        }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid endpoint' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Workflow orchestration PUT error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
```