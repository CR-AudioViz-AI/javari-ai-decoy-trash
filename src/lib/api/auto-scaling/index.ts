```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import * as tf from '@tensorflow/tfjs-node';

// Types
interface ScalingMetrics {
  timestamp: number;
  cpu_usage: number;
  memory_usage: number;
  network_io: number;
  queue_depth: number;
  custom_metrics: Record<string, number>;
  instance_count: number;
}

interface ScalingPolicy {
  id: string;
  name: string;
  min_instances: number;
  max_instances: number;
  target_cpu: number;
  target_memory: number;
  scale_up_threshold: number;
  scale_down_threshold: number;
  cooldown_period: number;
  predictive_enabled: boolean;
  custom_rules: CustomRule[];
}

interface CustomRule {
  metric: string;
  operator: 'gt' | 'lt' | 'eq';
  threshold: number;
  action: 'scale_up' | 'scale_down';
  weight: number;
}

interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'no_action';
  current_instances: number;
  target_instances: number;
  confidence: number;
  reason: string;
  metrics_snapshot: ScalingMetrics;
}

interface PredictionResult {
  predicted_load: number;
  recommended_instances: number;
  confidence_interval: [number, number];
  time_horizon: number;
}

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);

class MetricsCollector {
  async collectSystemMetrics(): Promise<Omit<ScalingMetrics, 'timestamp'>> {
    try {
      // Simulate metrics collection from various sources
      const cpuUsage = await this.getCPUUsage();
      const memoryUsage = await this.getMemoryUsage();
      const networkIO = await this.getNetworkIO();
      const queueDepth = await this.getQueueDepth();
      const customMetrics = await this.getCustomMetrics();
      const instanceCount = await this.getCurrentInstanceCount();

      return {
        cpu_usage: cpuUsage,
        memory_usage: memoryUsage,
        network_io: networkIO,
        queue_depth: queueDepth,
        custom_metrics: customMetrics,
        instance_count: instanceCount
      };
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw new Error('Failed to collect system metrics');
    }
  }

  private async getCPUUsage(): Promise<number> {
    // Integration with CloudWatch/DataDog/Prometheus
    const cached = await redis.get('metrics:cpu');
    if (cached) return parseFloat(cached);
    
    // Simulate API call
    const usage = Math.random() * 100;
    await redis.setex('metrics:cpu', 30, usage.toString());
    return usage;
  }

  private async getMemoryUsage(): Promise<number> {
    const cached = await redis.get('metrics:memory');
    if (cached) return parseFloat(cached);
    
    const usage = Math.random() * 100;
    await redis.setex('metrics:memory', 30, usage.toString());
    return usage;
  }

  private async getNetworkIO(): Promise<number> {
    const cached = await redis.get('metrics:network');
    if (cached) return parseFloat(cached);
    
    const io = Math.random() * 1000;
    await redis.setex('metrics:network', 30, io.toString());
    return io;
  }

  private async getQueueDepth(): Promise<number> {
    const cached = await redis.get('metrics:queue');
    if (cached) return parseFloat(cached);
    
    const depth = Math.floor(Math.random() * 100);
    await redis.setex('metrics:queue', 30, depth.toString());
    return depth;
  }

  private async getCustomMetrics(): Promise<Record<string, number>> {
    const cached = await redis.get('metrics:custom');
    if (cached) return JSON.parse(cached);
    
    const metrics = {
      requests_per_second: Math.random() * 1000,
      error_rate: Math.random() * 5,
      response_time: Math.random() * 500,
      active_connections: Math.floor(Math.random() * 1000)
    };
    
    await redis.setex('metrics:custom', 30, JSON.stringify(metrics));
    return metrics;
  }

  private async getCurrentInstanceCount(): Promise<number> {
    const cached = await redis.get('scaling:current_instances');
    return cached ? parseInt(cached) : 3; // Default to 3 instances
  }
}

class PredictiveModel {
  private model: tf.LayersModel | null = null;

  async initialize(): Promise<void> {
    try {
      // Load pre-trained model or create a simple one
      this.model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [6], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'linear' })
        ]
      });

      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });
    } catch (error) {
      console.error('Error initializing predictive model:', error);
      throw new Error('Failed to initialize predictive model');
    }
  }

  async predict(historicalMetrics: ScalingMetrics[]): Promise<PredictionResult> {
    if (!this.model || historicalMetrics.length < 5) {
      return {
        predicted_load: 0,
        recommended_instances: 3,
        confidence_interval: [2, 5],
        time_horizon: 300
      };
    }

    try {
      // Prepare input features
      const features = historicalMetrics.slice(-10).map(m => [
        m.cpu_usage / 100,
        m.memory_usage / 100,
        m.network_io / 1000,
        m.queue_depth / 100,
        Object.values(m.custom_metrics)[0] / 1000,
        m.instance_count / 10
      ]);

      const inputTensor = tf.tensor2d(features);
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const predictionData = await prediction.data();
      
      const predictedLoad = predictionData[0] * 100;
      const recommendedInstances = Math.max(1, Math.min(10, Math.ceil(predictedLoad / 25)));
      
      inputTensor.dispose();
      prediction.dispose();

      return {
        predicted_load: predictedLoad,
        recommended_instances: recommendedInstances,
        confidence_interval: [
          Math.max(1, recommendedInstances - 2),
          Math.min(10, recommendedInstances + 2)
        ],
        time_horizon: 300
      };
    } catch (error) {
      console.error('Error making prediction:', error);
      return {
        predicted_load: 50,
        recommended_instances: 3,
        confidence_interval: [2, 5],
        time_horizon: 300
      };
    }
  }
}

class ScalingEngine {
  private metricsCollector: MetricsCollector;
  private predictiveModel: PredictiveModel;

  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.predictiveModel = new PredictiveModel();
  }

  async initialize(): Promise<void> {
    await this.predictiveModel.initialize();
  }

  async makeScalingDecision(policyId: string): Promise<ScalingDecision> {
    try {
      // Get current metrics
      const currentMetrics = await this.metricsCollector.collectSystemMetrics();
      const metricsWithTimestamp: ScalingMetrics = {
        ...currentMetrics,
        timestamp: Date.now()
      };

      // Get scaling policy
      const { data: policy, error } = await supabase
        .from('scaling_policies')
        .select('*')
        .eq('id', policyId)
        .single();

      if (error || !policy) {
        throw new Error('Scaling policy not found');
      }

      // Get historical metrics for prediction
      const { data: historicalData } = await supabase
        .from('scaling_metrics')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      let decision: ScalingDecision = {
        action: 'no_action',
        current_instances: currentMetrics.instance_count,
        target_instances: currentMetrics.instance_count,
        confidence: 1.0,
        reason: 'No scaling required',
        metrics_snapshot: metricsWithTimestamp
      };

      // Check cooldown period
      const lastScaling = await redis.get(`scaling:last_action:${policyId}`);
      const cooldownActive = lastScaling && 
        (Date.now() - parseInt(lastScaling)) < (policy.cooldown_period * 1000);

      if (cooldownActive) {
        decision.reason = 'Cooldown period active';
        return decision;
      }

      // Rule-based scaling
      const ruleDecision = this.evaluateRules(policy, metricsWithTimestamp);
      
      // Predictive scaling (if enabled)
      let predictiveDecision = null;
      if (policy.predictive_enabled && historicalData) {
        const prediction = await this.predictiveModel.predict(historicalData);
        predictiveDecision = this.evaluatePredictiveScaling(policy, prediction);
      }

      // Combine decisions
      decision = this.combineDecisions(ruleDecision, predictiveDecision);

      // Store metrics and decision
      await this.storeMetrics(metricsWithTimestamp);
      await this.storeDecision(policyId, decision);

      return decision;
    } catch (error) {
      console.error('Error making scaling decision:', error);
      throw new Error('Failed to make scaling decision');
    }
  }

  private evaluateRules(policy: ScalingPolicy, metrics: ScalingMetrics): ScalingDecision {
    let scaleScore = 0;
    const reasons: string[] = [];

    // CPU evaluation
    if (metrics.cpu_usage > policy.target_cpu + policy.scale_up_threshold) {
      scaleScore += 2;
      reasons.push(`High CPU: ${metrics.cpu_usage.toFixed(1)}%`);
    } else if (metrics.cpu_usage < policy.target_cpu - policy.scale_down_threshold) {
      scaleScore -= 1;
      reasons.push(`Low CPU: ${metrics.cpu_usage.toFixed(1)}%`);
    }

    // Memory evaluation
    if (metrics.memory_usage > policy.target_memory + policy.scale_up_threshold) {
      scaleScore += 2;
      reasons.push(`High Memory: ${metrics.memory_usage.toFixed(1)}%`);
    } else if (metrics.memory_usage < policy.target_memory - policy.scale_down_threshold) {
      scaleScore -= 1;
      reasons.push(`Low Memory: ${metrics.memory_usage.toFixed(1)}%`);
    }

    // Custom rules evaluation
    policy.custom_rules.forEach(rule => {
      const metricValue = metrics.custom_metrics[rule.metric];
      if (metricValue !== undefined) {
        const threshold = rule.threshold;
        let ruleMatched = false;

        switch (rule.operator) {
          case 'gt':
            ruleMatched = metricValue > threshold;
            break;
          case 'lt':
            ruleMatched = metricValue < threshold;
            break;
          case 'eq':
            ruleMatched = Math.abs(metricValue - threshold) < 0.01;
            break;
        }

        if (ruleMatched) {
          const weight = rule.weight;
          if (rule.action === 'scale_up') {
            scaleScore += weight;
          } else {
            scaleScore -= weight;
          }
          reasons.push(`${rule.metric} ${rule.operator} ${threshold}`);
        }
      }
    });

    let action: 'scale_up' | 'scale_down' | 'no_action' = 'no_action';
    let targetInstances = metrics.instance_count;

    if (scaleScore >= 2 && metrics.instance_count < policy.max_instances) {
      action = 'scale_up';
      targetInstances = Math.min(policy.max_instances, metrics.instance_count + 1);
    } else if (scaleScore <= -2 && metrics.instance_count > policy.min_instances) {
      action = 'scale_down';
      targetInstances = Math.max(policy.min_instances, metrics.instance_count - 1);
    }

    return {
      action,
      current_instances: metrics.instance_count,
      target_instances: targetInstances,
      confidence: Math.min(1.0, Math.abs(scaleScore) / 4),
      reason: reasons.join(', ') || 'No scaling triggers',
      metrics_snapshot: metrics
    };
  }

  private evaluatePredictiveScaling(
    policy: ScalingPolicy, 
    prediction: PredictionResult
  ): ScalingDecision {
    const currentInstances = policy.min_instances; // Simplified
    const recommendedInstances = Math.max(
      policy.min_instances,
      Math.min(policy.max_instances, prediction.recommended_instances)
    );

    let action: 'scale_up' | 'scale_down' | 'no_action' = 'no_action';
    
    if (recommendedInstances > currentInstances) {
      action = 'scale_up';
    } else if (recommendedInstances < currentInstances) {
      action = 'scale_down';
    }

    return {
      action,
      current_instances: currentInstances,
      target_instances: recommendedInstances,
      confidence: prediction.confidence_interval[1] - prediction.confidence_interval[0] < 2 ? 0.8 : 0.6,
      reason: `Predictive: Expected load ${prediction.predicted_load.toFixed(1)}%`,
      metrics_snapshot: {
        timestamp: Date.now(),
        cpu_usage: 0,
        memory_usage: 0,
        network_io: 0,
        queue_depth: 0,
        custom_metrics: {},
        instance_count: currentInstances
      }
    };
  }

  private combineDecisions(
    ruleDecision: ScalingDecision,
    predictiveDecision: ScalingDecision | null
  ): ScalingDecision {
    if (!predictiveDecision) {
      return ruleDecision;
    }

    // Weighted combination
    const ruleWeight = 0.7;
    const predictiveWeight = 0.3;

    const combinedConfidence = 
      ruleDecision.confidence * ruleWeight + 
      predictiveDecision.confidence * predictiveWeight;

    // If both suggest the same action, high confidence
    if (ruleDecision.action === predictiveDecision.action) {
      return {
        ...ruleDecision,
        confidence: Math.min(1.0, combinedConfidence + 0.2),
        reason: `${ruleDecision.reason} | ${predictiveDecision.reason}`
      };
    }

    // If conflicting, prefer rule-based with lower confidence
    return {
      ...ruleDecision,
      confidence: combinedConfidence * 0.8,
      reason: `${ruleDecision.reason} (conflicting with prediction)`
    };
  }

  private async storeMetrics(metrics: ScalingMetrics): Promise<void> {
    await supabase.from('scaling_metrics').insert([metrics]);
  }

  private async storeDecision(policyId: string, decision: ScalingDecision): Promise<void> {
    await supabase.from('scaling_decisions').insert([{
      policy_id: policyId,
      ...decision,
      timestamp: Date.now()
    }]);

    if (decision.action !== 'no_action') {
      await redis.set(`scaling:last_action:${policyId}`, Date.now().toString());
    }
  }
}

class PolicyManager {
  async getPolicy(policyId: string): Promise<ScalingPolicy | null> {
    const { data, error } = await supabase
      .from('scaling_policies')
      .select('*')
      .eq('id', policyId)
      .single();

    if (error) {
      console.error('Error fetching policy:', error);
      return null;
    }

    return data;
  }

  async createPolicy(policy: Omit<ScalingPolicy, 'id'>): Promise<ScalingPolicy> {
    const { data, error } = await supabase
      .from('scaling_policies')
      .insert([policy])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create policy: ${error.message}`);
    }

    return data;
  }

  async updatePolicy(policyId: string, updates: Partial<ScalingPolicy>): Promise<ScalingPolicy> {
    const { data, error } = await supabase
      .from('scaling_policies')
      .update(updates)
      .eq('id', policyId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update policy: ${error.message}`);
    }

    return data;
  }

  async deletePolicy(policyId: string): Promise<void> {
    const { error } = await supabase
      .from('scaling_policies')
      .delete()
      .eq('id', policyId);

    if (error) {
      throw new Error(`Failed to delete policy: ${error.message}`);
    }
  }

  async listPolicies(): Promise<ScalingPolicy[]> {
    const { data, error } = await supabase
      .from('scaling_policies')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to list policies: ${error.message}`);
    }

    return data || [];
  }
}

class ResourceManager {
  async scaleResource(decision: ScalingDecision): Promise<boolean> {
    try {
      if (decision.action === 'no_action') {
        return true;
      }

      // Simulate Kubernetes/Docker API calls
      console.log(`Scaling ${decision.action}: ${decision.current_instances} → ${decision.target_instances}`);
      
      // Update instance count in Redis
      await redis.set('scaling:current_instances', decision.target_instances.toString());
      
      // Simulate scaling operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Error scaling resource:', error);
      return false;
    }
  }

  async getResourceStatus(): Promise<{
    current_instances: number;
    status: string;
    last_scaling: number | null;
  }> {
    const currentInstances = await redis.get('scaling:current_instances');
    const lastScaling = await redis.get('scaling:last_action:default');

    return {
      current_instances: currentInstances ? parseInt(currentInstances) : 3,
      status: 'healthy',
      last_scaling: lastScaling ? parseInt(lastScaling) : null
    };
  }
}

// Initialize services
const scalingEngine = new ScalingEngine();
const policyManager = new PolicyManager();
const resourceManager = new ResourceManager();

// Initialize on startup
scalingEngine.initialize().catch(console.error);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const policyId = searchParams.get('policy_id') || 'default';

    switch (action) {
      case 'metrics': {
        const collector = new MetricsCollector();
        const metrics = await collector.collectSystemMetrics();
        return NextResponse.json({
          success: true,
          data: {
            ...metrics,
            timestamp: Date.now()
          }
        });
      }

      case 'status': {
        const status = await resourceManager.getResourceStatus();
        return NextResponse.json({
          success: true,
          data: status
        });
      }

      case 'policies': {
        const policies = await policyManager.listPolicies();
        return NextResponse.json({
          success: true,
          data: policies
        });
      }

      case 'predict': {
        const { data: historicalData } = await supabase
          .from('scaling_metrics')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (!historicalData || historicalData.length < 5) {
          return NextResponse.json({
            success: false,
            error: 'Insufficient historical data for prediction'
          }, { status: 400 });
        }

        const predictiveModel = new PredictiveModel();
        await predictiveModel.initialize();
        const prediction = await predictiveModel.predict(historicalData);

        return NextResponse.json({
          success: true,
          data: prediction
        });
      }

      default: {
        return NextResponse.json({
          success: false,
          error: 'Invalid action parameter'
        }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Auto-scaling API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json();

    switch (action) {
      case 'scale': {
        const { policy_id } = data;
        if (!policy_id) {
          return NextResponse.json({
            success: false,
            error: 'Policy ID is required'
          }, { status: 400 });
        }

        const decision = await scalingEngine.makeScalingDecision(policy_id);
        const scaleSuccess = await resourceManager.scaleResource(decision);

        return NextResponse.json({
          success: scaleSuccess,
          data: decision
        });
      }

      case 'create_policy': {
        const policy = await policyManager.createPolicy(data);
        return NextResponse.json({
          success: true,
          data: policy
        });
      }

      case 'webhook': {
        const { event_type, resource_id, metrics } = data;
        
        // Process webhook event
        console.log(`Webhook received: ${event_type} for ${resource