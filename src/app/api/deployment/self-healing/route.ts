```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Validation schemas
const HealthCheckSchema = z.object({
  deploymentId: z.string().uuid(),
  service: z.string().min(1),
  environment: z.enum(['development', 'staging', 'production']),
  metrics: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    responseTime: z.number().min(0),
    errorRate: z.number().min(0).max(100),
    requestsPerSecond: z.number().min(0),
    activeConnections: z.number().min(0)
  }).optional(),
  thresholds: z.object({
    maxCpu: z.number().min(0).max(100).default(80),
    maxMemory: z.number().min(0).max(100).default(85),
    maxResponseTime: z.number().min(0).default(5000),
    maxErrorRate: z.number().min(0).max(100).default(5),
    minHealthScore: z.number().min(0).max(100).default(70)
  }).optional()
});

const RemediationSchema = z.object({
  deploymentId: z.string().uuid(),
  action: z.enum(['rollback', 'scale_up', 'scale_down', 'restart', 'circuit_break']),
  reason: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  autoApprove: z.boolean().default(false),
  metadata: z.record(z.any()).optional()
});

interface HealthMetrics {
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
  requestsPerSecond: number;
  activeConnections: number;
  timestamp: string;
}

interface DeploymentHealth {
  deploymentId: string;
  service: string;
  environment: string;
  healthScore: number;
  status: 'healthy' | 'degraded' | 'critical' | 'failed';
  metrics: HealthMetrics;
  anomalies: string[];
  lastCheck: string;
}

interface RemediationAction {
  id: string;
  deploymentId: string;
  action: string;
  reason: string;
  severity: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  triggeredAt: string;
  completedAt?: string;
  metadata: Record<string, any>;
}

class HealthMonitor {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async checkHealth(deploymentId: string, metrics: HealthMetrics, thresholds: any): Promise<DeploymentHealth> {
    const healthScore = this.calculateHealthScore(metrics, thresholds);
    const anomalies = this.detectAnomalies(metrics, thresholds);
    const status = this.determineStatus(healthScore, anomalies.length);

    const health: DeploymentHealth = {
      deploymentId,
      service: 'unknown', // Will be populated from deployment data
      environment: 'production', // Will be populated from deployment data
      healthScore,
      status,
      metrics,
      anomalies,
      lastCheck: new Date().toISOString()
    };

    // Store health check in database
    await this.supabase
      .from('deployment_health_checks')
      .insert({
        deployment_id: deploymentId,
        health_score: healthScore,
        status,
        metrics,
        anomalies,
        checked_at: new Date().toISOString()
      });

    return health;
  }

  private calculateHealthScore(metrics: HealthMetrics, thresholds: any): number {
    let score = 100;
    
    // CPU penalty
    if (metrics.cpu > thresholds.maxCpu) {
      score -= Math.min(30, (metrics.cpu - thresholds.maxCpu) * 2);
    }

    // Memory penalty
    if (metrics.memory > thresholds.maxMemory) {
      score -= Math.min(25, (metrics.memory - thresholds.maxMemory) * 2);
    }

    // Response time penalty
    if (metrics.responseTime > thresholds.maxResponseTime) {
      score -= Math.min(25, (metrics.responseTime - thresholds.maxResponseTime) / 100);
    }

    // Error rate penalty
    if (metrics.errorRate > thresholds.maxErrorRate) {
      score -= Math.min(20, metrics.errorRate * 4);
    }

    return Math.max(0, Math.round(score));
  }

  private detectAnomalies(metrics: HealthMetrics, thresholds: any): string[] {
    const anomalies: string[] = [];

    if (metrics.cpu > thresholds.maxCpu) {
      anomalies.push(`High CPU usage: ${metrics.cpu}%`);
    }

    if (metrics.memory > thresholds.maxMemory) {
      anomalies.push(`High memory usage: ${metrics.memory}%`);
    }

    if (metrics.responseTime > thresholds.maxResponseTime) {
      anomalies.push(`Slow response time: ${metrics.responseTime}ms`);
    }

    if (metrics.errorRate > thresholds.maxErrorRate) {
      anomalies.push(`High error rate: ${metrics.errorRate}%`);
    }

    // Detect sudden spikes or drops
    if (metrics.requestsPerSecond < 1 && Date.now() % 1000 > 500) {
      anomalies.push('Very low request volume detected');
    }

    return anomalies;
  }

  private determineStatus(healthScore: number, anomalyCount: number): 'healthy' | 'degraded' | 'critical' | 'failed' {
    if (healthScore >= 80 && anomalyCount === 0) return 'healthy';
    if (healthScore >= 60 && anomalyCount <= 2) return 'degraded';
    if (healthScore >= 30 || anomalyCount <= 4) return 'critical';
    return 'failed';
  }
}

class RemediationEngine {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async executeRemediation(deploymentId: string, action: string, reason: string, severity: string, metadata: any = {}): Promise<RemediationAction> {
    const remediationId = crypto.randomUUID();
    
    const remediation: RemediationAction = {
      id: remediationId,
      deploymentId,
      action,
      reason,
      severity,
      status: 'pending',
      triggeredAt: new Date().toISOString(),
      metadata
    };

    // Store remediation action
    await this.supabase
      .from('remediation_actions')
      .insert({
        id: remediationId,
        deployment_id: deploymentId,
        action,
        reason,
        severity,
        status: 'pending',
        triggered_at: new Date().toISOString(),
        metadata
      });

    // Execute the remediation action
    try {
      await this.performRemediationAction(remediation);
      remediation.status = 'completed';
      remediation.completedAt = new Date().toISOString();
    } catch (error) {
      remediation.status = 'failed';
      remediation.metadata.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Update status
    await this.supabase
      .from('remediation_actions')
      .update({
        status: remediation.status,
        completed_at: remediation.completedAt,
        metadata: remediation.metadata
      })
      .eq('id', remediationId);

    return remediation;
  }

  private async performRemediationAction(remediation: RemediationAction): Promise<void> {
    switch (remediation.action) {
      case 'rollback':
        await this.performRollback(remediation.deploymentId, remediation.metadata);
        break;
      case 'scale_up':
        await this.performScaleUp(remediation.deploymentId, remediation.metadata);
        break;
      case 'scale_down':
        await this.performScaleDown(remediation.deploymentId, remediation.metadata);
        break;
      case 'restart':
        await this.performRestart(remediation.deploymentId, remediation.metadata);
        break;
      case 'circuit_break':
        await this.performCircuitBreak(remediation.deploymentId, remediation.metadata);
        break;
      default:
        throw new Error(`Unknown remediation action: ${remediation.action}`);
    }
  }

  private async performRollback(deploymentId: string, metadata: any): Promise<void> {
    // Simulate rollback operation
    console.log(`Performing rollback for deployment ${deploymentId}`);
    
    // In a real implementation, this would:
    // 1. Get previous stable version from database
    // 2. Update container orchestration (Kubernetes/Docker)
    // 3. Update load balancer configuration
    // 4. Monitor rollback success
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate async operation
  }

  private async performScaleUp(deploymentId: string, metadata: any): Promise<void> {
    console.log(`Scaling up deployment ${deploymentId}`);
    
    // In a real implementation, this would:
    // 1. Increase replica count in orchestrator
    // 2. Monitor resource allocation
    // 3. Update load balancer pool
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  private async performScaleDown(deploymentId: string, metadata: any): Promise<void> {
    console.log(`Scaling down deployment ${deploymentId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async performRestart(deploymentId: string, metadata: any): Promise<void> {
    console.log(`Restarting deployment ${deploymentId}`);
    
    // In a real implementation, this would:
    // 1. Perform rolling restart of containers
    // 2. Ensure zero-downtime restart
    // 3. Verify health after restart
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  private async performCircuitBreak(deploymentId: string, metadata: any): Promise<void> {
    console.log(`Activating circuit breaker for deployment ${deploymentId}`);
    
    // In a real implementation, this would:
    // 1. Redirect traffic to fallback service
    // 2. Isolate failing service
    // 3. Set up monitoring for recovery
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

class SelfHealingOrchestrator {
  private healthMonitor: HealthMonitor;
  private remediationEngine: RemediationEngine;
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
    this.healthMonitor = new HealthMonitor(supabase);
    this.remediationEngine = new RemediationEngine(supabase);
  }

  async evaluateAndHeal(deploymentId: string, metrics: HealthMetrics, thresholds: any): Promise<{
    health: DeploymentHealth;
    remediation?: RemediationAction;
  }> {
    const health = await this.healthMonitor.checkHealth(deploymentId, metrics, thresholds);

    let remediation: RemediationAction | undefined;

    // Determine if remediation is needed
    if (health.status === 'critical' || health.status === 'failed') {
      const action = this.selectRemediationAction(health);
      const severity = health.status === 'failed' ? 'critical' : 'high';
      const reason = `Health score: ${health.healthScore}%, Anomalies: ${health.anomalies.join(', ')}`;

      remediation = await this.remediationEngine.executeRemediation(
        deploymentId,
        action,
        reason,
        severity,
        { healthScore: health.healthScore, anomalies: health.anomalies }
      );

      // Send alert for critical issues
      if (severity === 'critical') {
        await this.sendAlert(deploymentId, health, remediation);
      }
    }

    return { health, remediation };
  }

  private selectRemediationAction(health: DeploymentHealth): string {
    // Simple heuristic-based action selection
    // In a real implementation, this would use ML models or more sophisticated logic

    const highCpu = health.anomalies.some(a => a.includes('High CPU'));
    const highMemory = health.anomalies.some(a => a.includes('High memory'));
    const slowResponse = health.anomalies.some(a => a.includes('Slow response'));
    const highErrors = health.anomalies.some(a => a.includes('High error rate'));

    if (health.healthScore < 30) {
      return 'rollback'; // Emergency rollback
    } else if (highCpu || highMemory) {
      return 'scale_up'; // Resource constraints
    } else if (slowResponse && !highCpu && !highMemory) {
      return 'restart'; // Possible memory leaks or connection issues
    } else if (highErrors) {
      return 'circuit_break'; // Protect downstream services
    }

    return 'restart'; // Default action
  }

  private async sendAlert(deploymentId: string, health: DeploymentHealth, remediation: RemediationAction): Promise<void> {
    // Store alert in database
    await this.supabase
      .from('deployment_alerts')
      .insert({
        deployment_id: deploymentId,
        severity: remediation.severity,
        message: `Self-healing triggered: ${remediation.action} due to ${remediation.reason}`,
        health_score: health.healthScore,
        status: 'sent',
        created_at: new Date().toISOString()
      });

    // In a real implementation, this would also:
    // - Send to PagerDuty/Slack
    // - Email notifications
    // - SMS for critical alerts
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();

    // Validate request body
    const validatedData = HealthCheckSchema.parse(body);
    const { deploymentId, service, environment, metrics, thresholds } = validatedData;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify deployment ownership
    const { data: deployment } = await supabase
      .from('deployments')
      .select('id, service, environment, owner_id')
      .eq('id', deploymentId)
      .single();

    if (!deployment || deployment.owner_id !== user.id) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // If no metrics provided, simulate current metrics (in real impl, fetch from monitoring system)
    const currentMetrics: HealthMetrics = metrics || {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      responseTime: Math.random() * 10000,
      errorRate: Math.random() * 10,
      requestsPerSecond: Math.random() * 1000,
      activeConnections: Math.random() * 500,
      timestamp: new Date().toISOString()
    };

    const defaultThresholds = {
      maxCpu: 80,
      maxMemory: 85,
      maxResponseTime: 5000,
      maxErrorRate: 5,
      minHealthScore: 70,
      ...thresholds
    };

    // Initialize self-healing orchestrator
    const orchestrator = new SelfHealingOrchestrator(supabase);

    // Evaluate health and trigger remediation if needed
    const result = await orchestrator.evaluateAndHeal(deploymentId, currentMetrics, defaultThresholds);

    return NextResponse.json({
      success: true,
      deployment: {
        id: deploymentId,
        service: deployment.service,
        environment: deployment.environment
      },
      health: result.health,
      remediation: result.remediation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Self-healing API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const deploymentId = searchParams.get('deploymentId');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (deploymentId) {
      // Get specific deployment health history
      const { data: healthChecks } = await supabase
        .from('deployment_health_checks')
        .select('*')
        .eq('deployment_id', deploymentId)
        .order('checked_at', { ascending: false })
        .limit(limit);

      const { data: remediations } = await supabase
        .from('remediation_actions')
        .select('*')
        .eq('deployment_id', deploymentId)
        .order('triggered_at', { ascending: false })
        .limit(limit);

      return NextResponse.json({
        deploymentId,
        healthChecks: healthChecks || [],
        remediations: remediations || []
      });
    } else {
      // Get all deployments health overview
      const { data: deployments } = await supabase
        .from('deployments')
        .select(`
          id,
          service,
          environment,
          deployment_health_checks!inner(
            health_score,
            status,
            checked_at
          )
        `)
        .eq('owner_id', user.id)
        .order('deployment_health_checks.checked_at', { ascending: false });

      return NextResponse.json({
        deployments: deployments || [],
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Self-healing GET API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();

    // Validate remediation request
    const validatedData = RemediationSchema.parse(body);
    const { deploymentId, action, reason, severity, autoApprove, metadata } = validatedData;

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify deployment ownership
    const { data: deployment } = await supabase
      .from('deployments')
      .select('id, owner_id')
      .eq('id', deploymentId)
      .single();

    if (!deployment || deployment.owner_id !== user.id) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // Initialize remediation engine
    const remediationEngine = new RemediationEngine(supabase);

    // Execute manual remediation
    const remediation = await remediationEngine.executeRemediation(
      deploymentId,
      action,
      reason,
      severity,
      { ...metadata, manual: true, triggeredBy: user.id }
    );

    return NextResponse.json({
      success: true,
      remediation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Manual remediation API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```