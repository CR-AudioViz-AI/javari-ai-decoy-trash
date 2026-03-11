```typescript
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Types
interface CanaryConfig {
  id: string;
  deploymentId: string;
  trafficPercentage: number;
  duration: number;
  successThresholds: {
    errorRate: number;
    responseTime: number;
    cpuUsage: number;
    memoryUsage: number;
    userSatisfaction: number;
  };
  rollbackThresholds: {
    errorRate: number;
    responseTime: number;
    cpuUsage: number;
    memoryUsage: number;
    userSatisfaction: number;
  };
}

interface MetricData {
  timestamp: number;
  errorRate: number;
  responseTime: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  activeUsers: number;
}

interface UserFeedback {
  userId: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  timestamp: number;
  version: string;
}

interface CanaryStatus {
  id: string;
  status: 'pending' | 'active' | 'promoting' | 'rolling_back' | 'completed' | 'failed';
  currentTraffic: number;
  metrics: MetricData;
  decision: string;
  confidence: number;
}

// Core Services
class MetricsCollector {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async collectMetrics(deploymentId: string): Promise<MetricData> {
    try {
      // Simulate metrics collection from various sources
      const prometheusMetrics = await this.fetchPrometheusMetrics(deploymentId);
      const apmMetrics = await this.fetchAPMMetrics(deploymentId);
      const k8sMetrics = await this.fetchKubernetesMetrics(deploymentId);

      const metrics: MetricData = {
        timestamp: Date.now(),
        errorRate: prometheusMetrics.errorRate || 0,
        responseTime: apmMetrics.avgResponseTime || 0,
        throughput: prometheusMetrics.requestsPerSecond || 0,
        cpuUsage: k8sMetrics.cpuPercentage || 0,
        memoryUsage: k8sMetrics.memoryPercentage || 0,
        activeUsers: apmMetrics.activeUsers || 0
      };

      // Store metrics in Supabase
      await this.supabase
        .from('canary_metrics')
        .insert({
          deployment_id: deploymentId,
          metrics: metrics,
          created_at: new Date().toISOString()
        });

      return metrics;
    } catch (error) {
      console.error('Metrics collection failed:', error);
      throw new Error('Failed to collect metrics');
    }
  }

  private async fetchPrometheusMetrics(deploymentId: string) {
    // Mock Prometheus API call
    return {
      errorRate: Math.random() * 5, // 0-5% error rate
      requestsPerSecond: 100 + Math.random() * 50
    };
  }

  private async fetchAPMMetrics(deploymentId: string) {
    // Mock APM metrics
    return {
      avgResponseTime: 200 + Math.random() * 300,
      activeUsers: Math.floor(1000 + Math.random() * 500)
    };
  }

  private async fetchKubernetesMetrics(deploymentId: string) {
    // Mock K8s metrics
    return {
      cpuPercentage: Math.random() * 80,
      memoryPercentage: Math.random() * 70
    };
  }
}

class PerformanceAnalyzer {
  analyzePerformance(metrics: MetricData[], thresholds: any): {
    score: number;
    issues: string[];
    recommendation: 'promote' | 'continue' | 'rollback';
  } {
    const issues: string[] = [];
    let score = 100;

    // Analyze error rate
    const avgErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;
    if (avgErrorRate > thresholds.errorRate) {
      issues.push(`Error rate (${avgErrorRate.toFixed(2)}%) exceeds threshold (${thresholds.errorRate}%)`);
      score -= 30;
    }

    // Analyze response time
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    if (avgResponseTime > thresholds.responseTime) {
      issues.push(`Response time (${avgResponseTime.toFixed(0)}ms) exceeds threshold (${thresholds.responseTime}ms)`);
      score -= 20;
    }

    // Analyze resource usage
    const avgCpuUsage = metrics.reduce((sum, m) => sum + m.cpuUsage, 0) / metrics.length;
    if (avgCpuUsage > thresholds.cpuUsage) {
      issues.push(`CPU usage (${avgCpuUsage.toFixed(1)}%) exceeds threshold (${thresholds.cpuUsage}%)`);
      score -= 15;
    }

    const avgMemoryUsage = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
    if (avgMemoryUsage > thresholds.memoryUsage) {
      issues.push(`Memory usage (${avgMemoryUsage.toFixed(1)}%) exceeds threshold (${thresholds.memoryUsage}%)`);
      score -= 15;
    }

    let recommendation: 'promote' | 'continue' | 'rollback';
    if (score >= 80) recommendation = 'promote';
    else if (score >= 60) recommendation = 'continue';
    else recommendation = 'rollback';

    return { score, issues, recommendation };
  }
}

class UserFeedbackAnalyzer {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async analyzeFeedback(deploymentId: string, timeWindow: number = 3600000): Promise<{
    averageSentiment: number;
    totalFeedback: number;
    positivePercentage: number;
    recommendation: 'promote' | 'continue' | 'rollback';
  }> {
    try {
      const { data: feedback, error } = await this.supabase
        .from('user_feedback')
        .select('*')
        .eq('deployment_id', deploymentId)
        .gte('created_at', new Date(Date.now() - timeWindow).toISOString());

      if (error) throw error;

      if (!feedback || feedback.length === 0) {
        return {
          averageSentiment: 0.5,
          totalFeedback: 0,
          positivePercentage: 50,
          recommendation: 'continue'
        };
      }

      const totalFeedback = feedback.length;
      const averageSentiment = feedback.reduce((sum: number, f: any) => sum + f.score, 0) / totalFeedback;
      const positiveCount = feedback.filter((f: any) => f.sentiment === 'positive').length;
      const positivePercentage = (positiveCount / totalFeedback) * 100;

      let recommendation: 'promote' | 'continue' | 'rollback';
      if (positivePercentage >= 80 && averageSentiment >= 0.7) recommendation = 'promote';
      else if (positivePercentage >= 60 && averageSentiment >= 0.5) recommendation = 'continue';
      else recommendation = 'rollback';

      return {
        averageSentiment,
        totalFeedback,
        positivePercentage,
        recommendation
      };
    } catch (error) {
      console.error('Feedback analysis failed:', error);
      return {
        averageSentiment: 0.5,
        totalFeedback: 0,
        positivePercentage: 50,
        recommendation: 'continue'
      };
    }
  }
}

class TrafficSplitter {
  async updateTrafficSplit(deploymentId: string, canaryPercentage: number): Promise<boolean> {
    try {
      // Mock traffic splitting implementation
      console.log(`Updating traffic split for ${deploymentId}: ${canaryPercentage}% to canary`);
      
      // In real implementation, this would call:
      // - Kubernetes ingress controller
      // - Istio service mesh
      // - Load balancer APIs (nginx, HAProxy)
      // - CDN routing rules
      
      await this.updateLoadBalancer(deploymentId, canaryPercentage);
      await this.updateServiceMesh(deploymentId, canaryPercentage);
      
      return true;
    } catch (error) {
      console.error('Traffic split update failed:', error);
      return false;
    }
  }

  private async updateLoadBalancer(deploymentId: string, percentage: number) {
    // Mock load balancer update
    console.log(`Load balancer updated: ${percentage}% traffic to canary`);
  }

  private async updateServiceMesh(deploymentId: string, percentage: number) {
    // Mock service mesh update
    console.log(`Service mesh updated: ${percentage}% traffic to canary`);
  }
}

class AlertingService {
  async sendAlert(type: 'promotion' | 'rollback' | 'warning', deploymentId: string, details: any) {
    try {
      // Send Slack notification
      await this.sendSlackNotification(type, deploymentId, details);
      
      // Send Discord notification
      await this.sendDiscordNotification(type, deploymentId, details);
      
      // Update GitHub deployment status
      await this.updateGitHubStatus(deploymentId, type, details);
      
    } catch (error) {
      console.error('Alerting failed:', error);
    }
  }

  private async sendSlackNotification(type: string, deploymentId: string, details: any) {
    if (!process.env.SLACK_WEBHOOK_URL) return;

    const color = type === 'promotion' ? 'good' : type === 'rollback' ? 'danger' : 'warning';
    const message = {
      attachments: [{
        color,
        title: `Canary Deployment ${type.toUpperCase()}`,
        fields: [
          { title: 'Deployment ID', value: deploymentId, short: true },
          { title: 'Status', value: type, short: true },
          { title: 'Details', value: JSON.stringify(details, null, 2), short: false }
        ],
        timestamp: Math.floor(Date.now() / 1000)
      }]
    };

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
  }

  private async sendDiscordNotification(type: string, deploymentId: string, details: any) {
    if (!process.env.DISCORD_WEBHOOK_URL) return;

    const embed = {
      title: `Canary Deployment ${type.toUpperCase()}`,
      description: `Deployment ${deploymentId} has been ${type}`,
      color: type === 'promotion' ? 0x00ff00 : type === 'rollback' ? 0xff0000 : 0xffff00,
      fields: [
        { name: 'Deployment ID', value: deploymentId, inline: true },
        { name: 'Action', value: type, inline: true },
        { name: 'Details', value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  }

  private async updateGitHubStatus(deploymentId: string, type: string, details: any) {
    // Mock GitHub API call
    console.log(`GitHub deployment status updated: ${deploymentId} - ${type}`);
  }
}

class CanaryReleaseOrchestrator {
  private metricsCollector = new MetricsCollector();
  private performanceAnalyzer = new PerformanceAnalyzer();
  private feedbackAnalyzer = new UserFeedbackAnalyzer();
  private trafficSplitter = new TrafficSplitter();
  private alertingService = new AlertingService();
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async startCanaryRelease(config: CanaryConfig): Promise<CanaryStatus> {
    try {
      // Initialize canary release
      const status: CanaryStatus = {
        id: config.id,
        status: 'active',
        currentTraffic: config.trafficPercentage,
        metrics: await this.metricsCollector.collectMetrics(config.deploymentId),
        decision: 'monitoring',
        confidence: 0.5
      };

      // Store initial status
      await this.supabase
        .from('canary_releases')
        .insert({
          id: config.id,
          deployment_id: config.deploymentId,
          config: config,
          status: status,
          created_at: new Date().toISOString()
        });

      // Start traffic split
      await this.trafficSplitter.updateTrafficSplit(config.deploymentId, config.trafficPercentage);

      // Send initial alert
      await this.alertingService.sendAlert('warning', config.deploymentId, {
        action: 'canary_started',
        traffic_percentage: config.trafficPercentage,
        config
      });

      return status;
    } catch (error) {
      console.error('Canary release start failed:', error);
      throw new Error('Failed to start canary release');
    }
  }

  async evaluateCanaryRelease(canaryId: string): Promise<CanaryStatus> {
    try {
      // Get canary configuration
      const { data: canaryData, error } = await this.supabase
        .from('canary_releases')
        .select('*')
        .eq('id', canaryId)
        .single();

      if (error || !canaryData) throw new Error('Canary not found');

      const config: CanaryConfig = canaryData.config;
      
      // Collect recent metrics
      const { data: recentMetrics } = await this.supabase
        .from('canary_metrics')
        .select('metrics')
        .eq('deployment_id', config.deploymentId)
        .gte('created_at', new Date(Date.now() - 300000).toISOString()) // Last 5 minutes
        .order('created_at', { ascending: false })
        .limit(10);

      const metrics = recentMetrics?.map(m => m.metrics) || [];
      
      // Analyze performance
      const performanceResult = this.performanceAnalyzer.analyzePerformance(
        metrics, 
        config.successThresholds
      );

      // Analyze user feedback
      const feedbackResult = await this.feedbackAnalyzer.analyzeFeedback(config.deploymentId);

      // Make decision
      const decision = this.makePromotionDecision(performanceResult, feedbackResult, config);
      
      const status: CanaryStatus = {
        id: canaryId,
        status: decision.action === 'promote' ? 'promoting' : 
                decision.action === 'rollback' ? 'rolling_back' : 'active',
        currentTraffic: config.trafficPercentage,
        metrics: metrics[0] || await this.metricsCollector.collectMetrics(config.deploymentId),
        decision: decision.reason,
        confidence: decision.confidence
      };

      // Execute decision
      if (decision.action === 'promote') {
        await this.promoteCanary(config.deploymentId);
        await this.alertingService.sendAlert('promotion', config.deploymentId, decision);
      } else if (decision.action === 'rollback') {
        await this.rollbackCanary(config.deploymentId);
        await this.alertingService.sendAlert('rollback', config.deploymentId, decision);
      }

      // Update status
      await this.supabase
        .from('canary_releases')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', canaryId);

      return status;
    } catch (error) {
      console.error('Canary evaluation failed:', error);
      throw new Error('Failed to evaluate canary release');
    }
  }

  private makePromotionDecision(
    performance: any, 
    feedback: any, 
    config: CanaryConfig
  ): { action: 'promote' | 'rollback' | 'continue'; reason: string; confidence: number } {
    
    const performanceWeight = 0.6;
    const feedbackWeight = 0.4;
    
    const performanceScore = performance.score / 100;
    const feedbackScore = feedback.averageSentiment;
    
    const overallScore = (performanceScore * performanceWeight) + (feedbackScore * feedbackWeight);
    const confidence = Math.min(overallScore + 0.2, 1.0);

    if (performance.recommendation === 'rollback' || feedback.recommendation === 'rollback') {
      return {
        action: 'rollback',
        reason: `Critical issues detected. Performance: ${performance.recommendation}, Feedback: ${feedback.recommendation}`,
        confidence
      };
    }

    if (performance.recommendation === 'promote' && feedback.recommendation === 'promote' && overallScore >= 0.8) {
      return {
        action: 'promote',
        reason: `All metrics are healthy. Performance score: ${(performanceScore * 100).toFixed(1)}%, Feedback: ${(feedbackScore * 100).toFixed(1)}%`,
        confidence
      };
    }

    return {
      action: 'continue',
      reason: `Monitoring continues. Overall score: ${(overallScore * 100).toFixed(1)}%`,
      confidence
    };
  }

  private async promoteCanary(deploymentId: string): Promise<void> {
    // Gradually increase traffic to 100%
    await this.trafficSplitter.updateTrafficSplit(deploymentId, 100);
    console.log(`Canary promoted: ${deploymentId}`);
  }

  private async rollbackCanary(deploymentId: string): Promise<void> {
    // Redirect all traffic back to stable version
    await this.trafficSplitter.updateTrafficSplit(deploymentId, 0);
    console.log(`Canary rolled back: ${deploymentId}`);
  }

  async getCanaryStatus(canaryId: string): Promise<CanaryStatus | null> {
    try {
      const { data, error } = await this.supabase
        .from('canary_releases')
        .select('status')
        .eq('id', canaryId)
        .single();

      if (error) return null;
      return data.status;
    } catch (error) {
      console.error('Failed to get canary status:', error);
      return null;
    }
  }

  async listActiveCanaries(): Promise<CanaryStatus[]> {
    try {
      const { data, error } = await this.supabase
        .from('canary_releases')
        .select('status')
        .in('status->status', ['active', 'promoting', 'rolling_back']);

      if (error) throw error;
      return data?.map(d => d.status) || [];
    } catch (error) {
      console.error('Failed to list canaries:', error);
      return [];
    }
  }
}

// API Routes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const canaryId = searchParams.get('canaryId');

    const orchestrator = new CanaryReleaseOrchestrator();

    switch (action) {
      case 'health':
        return NextResponse.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        });

      case 'status':
        if (!canaryId) {
          return NextResponse.json({ error: 'canaryId required' }, { status: 400 });
        }
        const status = await orchestrator.getCanaryStatus(canaryId);
        return NextResponse.json({ status });

      case 'list':
        const canaries = await orchestrator.listActiveCanaries();
        return NextResponse.json({ canaries });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GET request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const orchestrator = new CanaryReleaseOrchestrator();

    switch (action) {
      case 'start':
        const { config } = body;
        if (!config) {
          return NextResponse.json({ error: 'config required' }, { status: 400 });
        }
        const status = await orchestrator.startCanaryRelease(config);
        return NextResponse.json({ status });

      case 'evaluate':
        const { canaryId } = body;
        if (!canaryId) {
          return NextResponse.json({ error: 'canaryId required' }, { status: 400 });
        }
        const evaluation = await orchestrator.evaluateCanaryRelease(canaryId);
        return NextResponse.json({ evaluation });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('POST request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```