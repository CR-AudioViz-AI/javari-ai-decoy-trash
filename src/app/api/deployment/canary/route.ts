```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { WebSocket } from 'ws';

// Types and Schemas
const CanaryConfigSchema = z.object({
  deployment_id: z.string().uuid(),
  project_id: z.string().uuid(),
  version_new: z.string(),
  version_current: z.string(),
  traffic_config: z.object({
    initial_percentage: z.number().min(0).max(100).default(5),
    increment_percentage: z.number().min(1).max(50).default(10),
    max_percentage: z.number().min(10).max(100).default(50),
    increment_interval_minutes: z.number().min(1).max(60).default(10)
  }),
  success_criteria: z.object({
    error_rate_threshold: z.number().min(0).max(1).default(0.01),
    response_time_threshold_ms: z.number().min(100).default(1000),
    cpu_threshold_percentage: z.number().min(0).max(100).default(80),
    memory_threshold_percentage: z.number().min(0).max(100).default(85),
    min_success_rate: z.number().min(0).max(1).default(0.99)
  }),
  monitoring_config: z.object({
    metrics_interval_seconds: z.number().min(10).max(300).default(30),
    feedback_analysis_interval_minutes: z.number().min(5).max(60).default(15),
    auto_rollback_enabled: z.boolean().default(true),
    notification_webhook: z.string().url().optional()
  })
});

interface DeploymentMetrics {
  error_rate: number;
  avg_response_time: number;
  cpu_usage: number;
  memory_usage: number;
  request_count: number;
  success_rate: number;
  timestamp: string;
}

interface FeedbackData {
  user_id: string;
  rating: number;
  comment: string;
  feature_flags: string[];
  timestamp: string;
}

interface CanaryDeployment {
  id: string;
  project_id: string;
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'rolled_back' | 'failed';
  current_traffic_percentage: number;
  config: z.infer<typeof CanaryConfigSchema>;
  metrics: DeploymentMetrics[];
  feedback: FeedbackData[];
  created_at: string;
  updated_at: string;
}

class CanaryDeploymentManager {
  private supabase;
  private activeDeployments = new Map<string, NodeJS.Timeout>();
  private wsConnections = new Map<string, WebSocket[]>();

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  async createDeployment(config: z.infer<typeof CanaryConfigSchema>): Promise<CanaryDeployment> {
    try {
      const deployment: Partial<CanaryDeployment> = {
        id: crypto.randomUUID(),
        project_id: config.project_id,
        status: 'initializing',
        current_traffic_percentage: 0,
        config,
        metrics: [],
        feedback: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('canary_deployments')
        .insert(deployment)
        .select()
        .single();

      if (error) throw error;

      // Initialize traffic routing
      await this.initializeTrafficRouting(data.id, config);
      
      // Start monitoring
      this.startMonitoring(data.id);
      
      // Update status to running
      await this.updateDeploymentStatus(data.id, 'running');

      return data;
    } catch (error) {
      throw new Error(`Failed to create canary deployment: ${error}`);
    }
  }

  async getDeployment(deploymentId: string): Promise<CanaryDeployment | null> {
    try {
      const { data, error } = await this.supabase
        .from('canary_deployments')
        .select('*')
        .eq('id', deploymentId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      throw new Error(`Failed to get deployment: ${error}`);
    }
  }

  async updateTrafficPercentage(deploymentId: string, percentage: number): Promise<void> {
    try {
      const deployment = await this.getDeployment(deploymentId);
      if (!deployment) throw new Error('Deployment not found');

      // Validate percentage within config limits
      const maxPercentage = deployment.config.traffic_config.max_percentage;
      if (percentage > maxPercentage) {
        throw new Error(`Traffic percentage exceeds maximum allowed: ${maxPercentage}%`);
      }

      await this.updateLoadBalancer(deploymentId, percentage);

      const { error } = await this.supabase
        .from('canary_deployments')
        .update({
          current_traffic_percentage: percentage,
          updated_at: new Date().toISOString()
        })
        .eq('id', deploymentId);

      if (error) throw error;

      // Broadcast update to WebSocket clients
      this.broadcastUpdate(deploymentId, { traffic_percentage: percentage });

    } catch (error) {
      throw new Error(`Failed to update traffic percentage: ${error}`);
    }
  }

  async rollbackDeployment(deploymentId: string, reason: string): Promise<void> {
    try {
      // Set traffic to 0% for canary version
      await this.updateLoadBalancer(deploymentId, 0);

      // Update deployment status
      await this.updateDeploymentStatus(deploymentId, 'rolled_back');

      // Stop monitoring
      this.stopMonitoring(deploymentId);

      // Log rollback event
      await this.logRollbackEvent(deploymentId, reason);

      // Send notifications
      await this.sendRollbackNotification(deploymentId, reason);

      this.broadcastUpdate(deploymentId, { 
        status: 'rolled_back', 
        reason,
        traffic_percentage: 0 
      });

    } catch (error) {
      throw new Error(`Failed to rollback deployment: ${error}`);
    }
  }

  private async initializeTrafficRouting(deploymentId: string, config: z.infer<typeof CanaryConfigSchema>): Promise<void> {
    // Initialize with 0% traffic, will be incremented by monitoring
    await this.updateLoadBalancer(deploymentId, 0);
    
    // Wait before starting traffic
    setTimeout(async () => {
      await this.updateTrafficPercentage(deploymentId, config.traffic_config.initial_percentage);
    }, 5000);
  }

  private startMonitoring(deploymentId: string): void {
    const interval = setInterval(async () => {
      try {
        const deployment = await this.getDeployment(deploymentId);
        if (!deployment || !['running', 'initializing'].includes(deployment.status)) {
          this.stopMonitoring(deploymentId);
          return;
        }

        // Collect metrics
        const metrics = await this.collectMetrics(deploymentId);
        await this.storeMetrics(deploymentId, metrics);

        // Analyze performance
        const decision = await this.analyzePerformance(deployment, metrics);
        
        if (decision.action === 'rollback') {
          await this.rollbackDeployment(deploymentId, decision.reason);
        } else if (decision.action === 'increment_traffic') {
          const newPercentage = Math.min(
            deployment.current_traffic_percentage + deployment.config.traffic_config.increment_percentage,
            deployment.config.traffic_config.max_percentage
          );
          await this.updateTrafficPercentage(deploymentId, newPercentage);
        } else if (decision.action === 'complete') {
          await this.completeDeployment(deploymentId);
        }

      } catch (error) {
        console.error(`Monitoring error for deployment ${deploymentId}:`, error);
      }
    }, 30000); // 30 second intervals

    this.activeDeployments.set(deploymentId, interval);
  }

  private stopMonitoring(deploymentId: string): void {
    const interval = this.activeDeployments.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.activeDeployments.delete(deploymentId);
    }
  }

  private async collectMetrics(deploymentId: string): Promise<DeploymentMetrics> {
    // Mock metrics collection - replace with actual monitoring service calls
    return {
      error_rate: Math.random() * 0.02, // 0-2% error rate
      avg_response_time: 200 + Math.random() * 800, // 200-1000ms
      cpu_usage: 30 + Math.random() * 50, // 30-80%
      memory_usage: 40 + Math.random() * 40, // 40-80%
      request_count: Math.floor(Math.random() * 1000),
      success_rate: 0.95 + Math.random() * 0.05, // 95-100%
      timestamp: new Date().toISOString()
    };
  }

  private async storeMetrics(deploymentId: string, metrics: DeploymentMetrics): Promise<void> {
    const { error } = await this.supabase
      .from('deployment_metrics')
      .insert({
        deployment_id: deploymentId,
        ...metrics
      });

    if (error) throw error;
  }

  private async analyzePerformance(deployment: CanaryDeployment, metrics: DeploymentMetrics): Promise<{
    action: 'continue' | 'increment_traffic' | 'rollback' | 'complete';
    reason: string;
  }> {
    const criteria = deployment.config.success_criteria;

    // Check for immediate rollback conditions
    if (metrics.error_rate > criteria.error_rate_threshold) {
      return { action: 'rollback', reason: `Error rate too high: ${(metrics.error_rate * 100).toFixed(2)}%` };
    }

    if (metrics.avg_response_time > criteria.response_time_threshold_ms) {
      return { action: 'rollback', reason: `Response time too high: ${metrics.avg_response_time.toFixed(0)}ms` };
    }

    if (metrics.cpu_usage > criteria.cpu_threshold_percentage) {
      return { action: 'rollback', reason: `CPU usage too high: ${metrics.cpu_usage.toFixed(1)}%` };
    }

    if (metrics.memory_usage > criteria.memory_threshold_percentage) {
      return { action: 'rollback', reason: `Memory usage too high: ${metrics.memory_usage.toFixed(1)}%` };
    }

    if (metrics.success_rate < criteria.min_success_rate) {
      return { action: 'rollback', reason: `Success rate too low: ${(metrics.success_rate * 100).toFixed(2)}%` };
    }

    // Check if we've reached maximum traffic
    const maxTraffic = deployment.config.traffic_config.max_percentage;
    if (deployment.current_traffic_percentage >= maxTraffic) {
      return { action: 'complete', reason: 'Maximum traffic reached, deployment successful' };
    }

    // Check if enough time has passed to increment traffic
    const lastUpdate = new Date(deployment.updated_at).getTime();
    const intervalMs = deployment.config.traffic_config.increment_interval_minutes * 60 * 1000;
    if (Date.now() - lastUpdate > intervalMs && deployment.current_traffic_percentage < maxTraffic) {
      return { action: 'increment_traffic', reason: 'Performance stable, incrementing traffic' };
    }

    return { action: 'continue', reason: 'Performance stable, continuing monitoring' };
  }

  private async updateLoadBalancer(deploymentId: string, percentage: number): Promise<void> {
    // Mock load balancer update - replace with actual implementation
    console.log(`Updating load balancer for deployment ${deploymentId} to ${percentage}%`);
    
    // Example: Kubernetes service weight update
    // Example: AWS ALB target group weight update
    // Example: Nginx upstream weight update
  }

  private async updateDeploymentStatus(deploymentId: string, status: CanaryDeployment['status']): Promise<void> {
    const { error } = await this.supabase
      .from('canary_deployments')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', deploymentId);

    if (error) throw error;
  }

  private async completeDeployment(deploymentId: string): Promise<void> {
    await this.updateDeploymentStatus(deploymentId, 'completed');
    this.stopMonitoring(deploymentId);
    
    // Set traffic to 100% for new version
    await this.updateLoadBalancer(deploymentId, 100);
    
    this.broadcastUpdate(deploymentId, { 
      status: 'completed', 
      traffic_percentage: 100 
    });
  }

  private async logRollbackEvent(deploymentId: string, reason: string): Promise<void> {
    await this.supabase
      .from('deployment_events')
      .insert({
        deployment_id: deploymentId,
        event_type: 'rollback',
        reason,
        timestamp: new Date().toISOString()
      });
  }

  private async sendRollbackNotification(deploymentId: string, reason: string): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment?.config.monitoring_config.notification_webhook) return;

    try {
      await fetch(deployment.config.monitoring_config.notification_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_id: deploymentId,
          event: 'rollback',
          reason,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  private broadcastUpdate(deploymentId: string, update: any): void {
    const connections = this.wsConnections.get(deploymentId) || [];
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'deployment_update',
          deployment_id: deploymentId,
          data: update,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
}

const manager = new CanaryDeploymentManager();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = CanaryConfigSchema.parse(body);

    const deployment = await manager.createDeployment(config);

    return NextResponse.json({
      success: true,
      data: deployment
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deploymentId = searchParams.get('id');

    if (!deploymentId) {
      return NextResponse.json({
        success: false,
        error: 'Deployment ID is required'
      }, { status: 400 });
    }

    const deployment = await manager.getDeployment(deploymentId);

    if (!deployment) {
      return NextResponse.json({
        success: false,
        error: 'Deployment not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: deployment
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { deployment_id, traffic_percentage, action } = body;

    if (!deployment_id) {
      return NextResponse.json({
        success: false,
        error: 'Deployment ID is required'
      }, { status: 400 });
    }

    if (action === 'update_traffic' && typeof traffic_percentage === 'number') {
      await manager.updateTrafficPercentage(deployment_id, traffic_percentage);
    } else if (action === 'rollback') {
      await manager.rollbackDeployment(deployment_id, body.reason || 'Manual rollback');
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action or missing parameters'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Action ${action} completed successfully`
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deploymentId = searchParams.get('id');

    if (!deploymentId) {
      return NextResponse.json({
        success: false,
        error: 'Deployment ID is required'
      }, { status: 400 });
    }

    await manager.rollbackDeployment(deploymentId, 'Deployment terminated');

    return NextResponse.json({
      success: true,
      message: 'Deployment terminated and rolled back'
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```