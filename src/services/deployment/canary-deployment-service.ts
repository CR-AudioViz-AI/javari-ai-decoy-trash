```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { z } from 'zod';
import { Redis } from 'ioredis';
import axios from 'axios';

// Types and Interfaces
interface DeploymentConfig {
  id: string;
  serviceName: string;
  version: string;
  canaryPercentage: number;
  strategy: 'linear' | 'exponential' | 'blue-green';
  duration: number;
  healthCheckEndpoint: string;
  rollbackThresholds: {
    errorRate: number;
    responseTime: number;
    availability: number;
  };
}

interface MetricData {
  timestamp: number;
  errorRate: number;
  responseTime: number;
  throughput: number;
  availability: number;
  cpuUsage: number;
  memoryUsage: number;
}

interface DeploymentState {
  id: string;
  status: 'pending' | 'active' | 'promoting' | 'completed' | 'failed' | 'rolled-back';
  currentTraffic: number;
  targetTraffic: number;
  startTime: number;
  lastUpdate: number;
  metrics: MetricData[];
  aiRecommendation?: 'promote' | 'rollback' | 'hold';
  confidence?: number;
}

interface AIAnalysis {
  recommendation: 'promote' | 'rollback' | 'hold';
  confidence: number;
  reasoning: string;
  riskScore: number;
}

// Validation Schemas
const deploymentConfigSchema = z.object({
  serviceName: z.string().min(1),
  version: z.string().min(1),
  canaryPercentage: z.number().min(1).max(100),
  strategy: z.enum(['linear', 'exponential', 'blue-green']),
  duration: z.number().min(60),
  healthCheckEndpoint: z.string().url(),
  rollbackThresholds: z.object({
    errorRate: z.number().min(0).max(1),
    responseTime: z.number().min(0),
    availability: z.number().min(0).max(1),
  }),
});

const metricsSchema = z.object({
  deploymentId: z.string(),
  metrics: z.object({
    errorRate: z.number(),
    responseTime: z.number(),
    throughput: z.number(),
    availability: z.number(),
    cpuUsage: z.number(),
    memoryUsage: z.number(),
  }),
});

class CanaryDeploymentService {
  private supabase;
  private openai;
  private redis;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  async createCanaryDeployment(config: DeploymentConfig): Promise<DeploymentState> {
    try {
      // Initialize deployment state
      const deploymentState: DeploymentState = {
        id: config.id,
        status: 'pending',
        currentTraffic: 0,
        targetTraffic: config.canaryPercentage,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        metrics: [],
      };

      // Store in Supabase
      const { error: supabaseError } = await this.supabase
        .from('canary_deployments')
        .insert({
          id: config.id,
          service_name: config.serviceName,
          version: config.version,
          config: config,
          state: deploymentState,
        });

      if (supabaseError) throw supabaseError;

      // Store in Redis for fast access
      await this.redis.setex(
        `deployment:${config.id}`,
        3600,
        JSON.stringify(deploymentState)
      );

      // Configure traffic splitting
      await this.configureTrafficSplit(config.id, 0, config.canaryPercentage);

      // Start health checks
      this.startHealthChecks(config);

      return deploymentState;
    } catch (error) {
      console.error('Failed to create canary deployment:', error);
      throw new Error('Failed to create canary deployment');
    }
  }

  async updateMetrics(deploymentId: string, metrics: MetricData): Promise<void> {
    try {
      // Get current state
      const stateData = await this.redis.get(`deployment:${deploymentId}`);
      if (!stateData) throw new Error('Deployment not found');

      const state: DeploymentState = JSON.parse(stateData);
      
      // Add new metrics
      state.metrics.push(metrics);
      
      // Keep only last 100 metric points
      if (state.metrics.length > 100) {
        state.metrics = state.metrics.slice(-100);
      }

      state.lastUpdate = Date.now();

      // Check for immediate rollback triggers
      const config = await this.getDeploymentConfig(deploymentId);
      if (this.shouldTriggerRollback(metrics, config.rollbackThresholds)) {
        await this.executeRollback(deploymentId, 'Threshold breach detected');
        return;
      }

      // Get AI analysis if we have enough data
      if (state.metrics.length >= 5) {
        const analysis = await this.analyzeMetricsWithAI(state.metrics, config);
        state.aiRecommendation = analysis.recommendation;
        state.confidence = analysis.confidence;

        // Execute AI recommendation if confidence is high
        if (analysis.confidence > 0.8) {
          switch (analysis.recommendation) {
            case 'promote':
              await this.promoteDeployment(deploymentId);
              break;
            case 'rollback':
              await this.executeRollback(deploymentId, analysis.reasoning);
              break;
            // 'hold' - do nothing, continue monitoring
          }
        }
      }

      // Update state
      await this.redis.setex(
        `deployment:${deploymentId}`,
        3600,
        JSON.stringify(state)
      );

      // Update Supabase
      await this.supabase
        .from('canary_deployments')
        .update({ state })
        .eq('id', deploymentId);

      // Send real-time update
      await this.supabase
        .channel(`deployment:${deploymentId}`)
        .send({
          type: 'broadcast',
          event: 'metrics_update',
          payload: { deploymentId, metrics, state },
        });

    } catch (error) {
      console.error('Failed to update metrics:', error);
      throw new Error('Failed to update deployment metrics');
    }
  }

  private async analyzeMetricsWithAI(metrics: MetricData[], config: DeploymentConfig): Promise<AIAnalysis> {
    try {
      const recentMetrics = metrics.slice(-10);
      const baseline = metrics.slice(0, 5);

      const prompt = `
Analyze this canary deployment performance data and provide a recommendation:

Service: ${config.serviceName}
Current Traffic: ${config.canaryPercentage}%
Rollback Thresholds: Error Rate: ${config.rollbackThresholds.errorRate}, Response Time: ${config.rollbackThresholds.responseTime}ms, Availability: ${config.rollbackThresholds.availability}

Baseline Metrics (first 5 data points):
${baseline.map(m => `Error Rate: ${m.errorRate}, Response Time: ${m.responseTime}ms, Availability: ${m.availability}`).join('\n')}

Recent Metrics (last 10 data points):
${recentMetrics.map(m => `Error Rate: ${m.errorRate}, Response Time: ${m.responseTime}ms, Availability: ${m.availability}, CPU: ${m.cpuUsage}%, Memory: ${m.memoryUsage}%`).join('\n')}

Provide your analysis in JSON format:
{
  "recommendation": "promote|rollback|hold",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "riskScore": 0.0-1.0
}
      `;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });

      const analysis = JSON.parse(completion.choices[0].message.content || '{}');
      return analysis as AIAnalysis;
    } catch (error) {
      console.error('AI analysis failed:', error);
      return {
        recommendation: 'hold',
        confidence: 0.5,
        reasoning: 'AI analysis failed, maintaining current state',
        riskScore: 0.5,
      };
    }
  }

  private shouldTriggerRollback(metrics: MetricData, thresholds: DeploymentConfig['rollbackThresholds']): boolean {
    return (
      metrics.errorRate > thresholds.errorRate ||
      metrics.responseTime > thresholds.responseTime ||
      metrics.availability < thresholds.availability
    );
  }

  private async configureTrafficSplit(deploymentId: string, current: number, target: number): Promise<void> {
    try {
      // Configure Kubernetes ingress or service mesh for traffic splitting
      const config = {
        deploymentId,
        canaryWeight: target,
        stableWeight: 100 - target,
      };

      // Store traffic configuration
      await this.redis.setex(
        `traffic:${deploymentId}`,
        3600,
        JSON.stringify(config)
      );

      // In a real implementation, this would update Istio, NGINX, or K8s ingress
      console.log(`Traffic split configured: ${target}% to canary`);
    } catch (error) {
      console.error('Failed to configure traffic split:', error);
      throw new Error('Failed to configure traffic routing');
    }
  }

  private async promoteDeployment(deploymentId: string): Promise<void> {
    try {
      // Get current state
      const stateData = await this.redis.get(`deployment:${deploymentId}`);
      if (!stateData) throw new Error('Deployment not found');

      const state: DeploymentState = JSON.parse(stateData);
      state.status = 'promoting';
      
      // Gradually increase traffic to 100%
      await this.configureTrafficSplit(deploymentId, state.currentTraffic, 100);
      
      state.currentTraffic = 100;
      state.status = 'completed';

      // Update state
      await this.redis.setex(
        `deployment:${deploymentId}`,
        3600,
        JSON.stringify(state)
      );

      await this.supabase
        .from('canary_deployments')
        .update({ state })
        .eq('id', deploymentId);

      // Send notification
      await this.sendAlert(deploymentId, 'success', 'Canary deployment promoted successfully');
    } catch (error) {
      console.error('Failed to promote deployment:', error);
      throw new Error('Failed to promote deployment');
    }
  }

  private async executeRollback(deploymentId: string, reason: string): Promise<void> {
    try {
      // Get current state
      const stateData = await this.redis.get(`deployment:${deploymentId}`);
      if (!stateData) throw new Error('Deployment not found');

      const state: DeploymentState = JSON.parse(stateData);
      state.status = 'rolled-back';
      
      // Route all traffic back to stable version
      await this.configureTrafficSplit(deploymentId, state.currentTraffic, 0);
      
      state.currentTraffic = 0;

      // Update state
      await this.redis.setex(
        `deployment:${deploymentId}`,
        3600,
        JSON.stringify(state)
      );

      await this.supabase
        .from('canary_deployments')
        .update({ state })
        .eq('id', deploymentId);

      // Send alert
      await this.sendAlert(deploymentId, 'error', `Canary deployment rolled back: ${reason}`);
    } catch (error) {
      console.error('Failed to execute rollback:', error);
      throw new Error('Failed to rollback deployment');
    }
  }

  private async startHealthChecks(config: DeploymentConfig): Promise<void> {
    // Start periodic health checks
    const checkInterval = setInterval(async () => {
      try {
        const response = await axios.get(config.healthCheckEndpoint, { timeout: 5000 });
        const isHealthy = response.status === 200;

        if (!isHealthy) {
          await this.executeRollback(config.id, 'Health check failed');
          clearInterval(checkInterval);
        }
      } catch (error) {
        console.error('Health check failed:', error);
        await this.executeRollback(config.id, 'Health check endpoint unreachable');
        clearInterval(checkInterval);
      }
    }, 30000); // Check every 30 seconds

    // Store interval ID for cleanup
    await this.redis.setex(`healthcheck:${config.id}`, 3600, checkInterval.toString());
  }

  private async getDeploymentConfig(deploymentId: string): Promise<DeploymentConfig> {
    const { data, error } = await this.supabase
      .from('canary_deployments')
      .select('config')
      .eq('id', deploymentId)
      .single();

    if (error) throw error;
    return data.config;
  }

  private async sendAlert(deploymentId: string, level: 'info' | 'warning' | 'error' | 'success', message: string): Promise<void> {
    try {
      // Send to notification service
      await axios.post(process.env.WEBHOOK_URL || '', {
        deploymentId,
        level,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  async getDeploymentStatus(deploymentId: string): Promise<DeploymentState | null> {
    try {
      const stateData = await this.redis.get(`deployment:${deploymentId}`);
      return stateData ? JSON.parse(stateData) : null;
    } catch (error) {
      console.error('Failed to get deployment status:', error);
      return null;
    }
  }

  async listActiveDeployments(): Promise<DeploymentState[]> {
    try {
      const { data, error } = await this.supabase
        .from('canary_deployments')
        .select('state')
        .in('state->status', ['pending', 'active', 'promoting']);

      if (error) throw error;
      return data.map(d => d.state);
    } catch (error) {
      console.error('Failed to list deployments:', error);
      return [];
    }
  }
}

// API Route Handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const service = new CanaryDeploymentService();

    switch (action) {
      case 'create': {
        const config = deploymentConfigSchema.parse(body.config);
        const deploymentConfig: DeploymentConfig = {
          id: `canary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...config,
        };

        const deployment = await service.createCanaryDeployment(deploymentConfig);
        return NextResponse.json({ success: true, deployment });
      }

      case 'update-metrics': {
        const { deploymentId, metrics } = metricsSchema.parse(body);
        await service.updateMetrics(deploymentId, {
          timestamp: Date.now(),
          ...metrics,
        });
        return NextResponse.json({ success: true });
      }

      case 'get-status': {
        const { deploymentId } = z.object({ deploymentId: z.string() }).parse(body);
        const status = await service.getDeploymentStatus(deploymentId);
        return NextResponse.json({ success: true, status });
      }

      case 'list-active': {
        const deployments = await service.listActiveDeployments();
        return NextResponse.json({ success: true, deployments });
      }

      case 'rollback': {
        const { deploymentId, reason } = z.object({
          deploymentId: z.string(),
          reason: z.string().optional().default('Manual rollback'),
        }).parse(body);
        
        await service['executeRollback'](deploymentId, reason);
        return NextResponse.json({ success: true });
      }

      case 'promote': {
        const { deploymentId } = z.object({ deploymentId: z.string() }).parse(body);
        await service['promoteDeployment'](deploymentId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Canary deployment service error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'health') {
      return NextResponse.json({
        status: 'healthy',
        service: 'canary-deployment',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    }

    const service = new CanaryDeploymentService();

    switch (action) {
      case 'list-active': {
        const deployments = await service.listActiveDeployments();
        return NextResponse.json({ success: true, deployments });
      }

      case 'status': {
        const deploymentId = searchParams.get('deploymentId');
        if (!deploymentId) {
          return NextResponse.json(
            { success: false, error: 'deploymentId parameter required' },
            { status: 400 }
          );
        }

        const status = await service.getDeploymentStatus(deploymentId);
        return NextResponse.json({ success: true, status });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GET request error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
```