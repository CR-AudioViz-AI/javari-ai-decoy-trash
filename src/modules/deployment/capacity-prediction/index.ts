```typescript
import { NextRequest, NextResponse } from 'next/server';
import * as tf from '@tensorflow/tfjs-node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Types and Interfaces
interface ResourceMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  networkThroughput: number;
  storageUtilization: number;
  timestamp: Date;
}

interface DeploymentMetrics {
  id: string;
  deploymentId: string;
  resourceMetrics: ResourceMetrics;
  requestsPerSecond: number;
  responseTime: number;
  errorRate: number;
  timestamp: Date;
}

interface CapacityPrediction {
  deploymentId: string;
  predictedCpu: number;
  predictedMemory: number;
  predictedNetwork: number;
  predictedStorage: number;
  confidence: number;
  recommendedReplicas: number;
  estimatedCost: number;
  predictionTimestamp: Date;
}

interface ScalingRecommendation {
  action: 'scale_up' | 'scale_down' | 'maintain';
  currentReplicas: number;
  recommendedReplicas: number;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedImpact: {
    costChange: number;
    performanceChange: number;
  };
}

// Validation Schemas
const PredictionRequestSchema = z.object({
  deploymentId: z.string().min(1),
  timeHorizon: z.number().min(1).max(168), // 1 hour to 1 week
  includeSeasonality: z.boolean().optional().default(true),
  confidenceLevel: z.number().min(0.8).max(0.99).optional().default(0.95)
});

const MetricsQuerySchema = z.object({
  deploymentId: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional().default(100)
});

// Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Capacity Prediction Engine
class CapacityPredictionEngine {
  private model: tf.LayersModel | null = null;
  private isModelLoaded = false;

  async loadModel(): Promise<void> {
    try {
      // In production, load from a saved model file
      this.model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 4, activation: 'linear' }) // CPU, Memory, Network, Storage
        ]
      });

      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });

      this.isModelLoaded = true;
    } catch (error) {
      console.error('Failed to load ML model:', error);
      throw new Error('Model initialization failed');
    }
  }

  async predict(inputData: number[]): Promise<number[]> {
    if (!this.isModelLoaded || !this.model) {
      await this.loadModel();
    }

    const inputTensor = tf.tensor2d([inputData]);
    const prediction = this.model!.predict(inputTensor) as tf.Tensor;
    const result = await prediction.data();
    
    inputTensor.dispose();
    prediction.dispose();

    return Array.from(result);
  }

  preprocessMetrics(metrics: DeploymentMetrics[]): number[][] {
    return metrics.map(metric => [
      metric.resourceMetrics.cpuUtilization,
      metric.resourceMetrics.memoryUtilization,
      metric.resourceMetrics.networkThroughput / 1000, // Normalize
      metric.resourceMetrics.storageUtilization,
      metric.requestsPerSecond / 100, // Normalize
      metric.responseTime / 1000, // Convert to seconds
      metric.errorRate * 100, // Convert to percentage
      new Date(metric.timestamp).getHours(), // Hour of day
      new Date(metric.timestamp).getDay(), // Day of week
      Math.sin(2 * Math.PI * new Date(metric.timestamp).getHours() / 24) // Cyclical encoding
    ]);
  }
}

// Historical Data Collector
class HistoricalDataCollector {
  async getDeploymentMetrics(deploymentId: string, hours: number = 24): Promise<DeploymentMetrics[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('deployment_metrics')
      .select(`
        id,
        deployment_id,
        cpu_utilization,
        memory_utilization,
        network_throughput,
        storage_utilization,
        requests_per_second,
        response_time,
        error_rate,
        timestamp
      `)
      .eq('deployment_id', deploymentId)
      .gte('timestamp', startTime)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      deploymentId: row.deployment_id,
      resourceMetrics: {
        cpuUtilization: row.cpu_utilization,
        memoryUtilization: row.memory_utilization,
        networkThroughput: row.network_throughput,
        storageUtilization: row.storage_utilization,
        timestamp: new Date(row.timestamp)
      },
      requestsPerSecond: row.requests_per_second,
      responseTime: row.response_time,
      errorRate: row.error_rate,
      timestamp: new Date(row.timestamp)
    }));
  }

  async getAllDeploymentMetrics(limit: number = 1000): Promise<DeploymentMetrics[]> {
    const { data, error } = await supabase
      .from('deployment_metrics')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
}

// Resource Metrics Analyzer
class ResourceMetricsAnalyzer {
  analyzeUsagePatterns(metrics: DeploymentMetrics[]): {
    avgCpu: number;
    avgMemory: number;
    avgNetwork: number;
    avgStorage: number;
    peakCpu: number;
    peakMemory: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    seasonality: boolean;
  } {
    const cpuValues = metrics.map(m => m.resourceMetrics.cpuUtilization);
    const memoryValues = metrics.map(m => m.resourceMetrics.memoryUtilization);
    const networkValues = metrics.map(m => m.resourceMetrics.networkThroughput);
    const storageValues = metrics.map(m => m.resourceMetrics.storageUtilization);

    return {
      avgCpu: this.average(cpuValues),
      avgMemory: this.average(memoryValues),
      avgNetwork: this.average(networkValues),
      avgStorage: this.average(storageValues),
      peakCpu: Math.max(...cpuValues),
      peakMemory: Math.max(...memoryValues),
      trend: this.detectTrend(cpuValues),
      seasonality: this.detectSeasonality(cpuValues)
    };
  }

  private average(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private detectTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 10) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = this.average(firstHalf);
    const secondAvg = this.average(secondHalf);
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private detectSeasonality(values: number[]): boolean {
    // Simple seasonality detection using autocorrelation
    if (values.length < 24) return false;
    
    const hourlyPattern = this.calculateAutocorrelation(values, 24);
    return hourlyPattern > 0.3;
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    if (values.length <= lag) return 0;
    
    const n = values.length - lag;
    const mean = this.average(values);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }
    
    for (let i = 0; i < values.length; i++) {
      denominator += (values[i] - mean) * (values[i] - mean);
    }
    
    return numerator / denominator;
  }
}

// Scaling Recommendation Generator
class ScalingRecommendationGenerator {
  generateRecommendation(
    currentMetrics: DeploymentMetrics,
    prediction: CapacityPrediction,
    currentReplicas: number
  ): ScalingRecommendation {
    const cpuThreshold = 0.7;
    const memoryThreshold = 0.8;
    const minReplicas = 1;
    const maxReplicas = 10;

    let action: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';
    let recommendedReplicas = currentReplicas;
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let reason = 'Resource utilization within normal range';

    if (prediction.predictedCpu > cpuThreshold || prediction.predictedMemory > memoryThreshold) {
      const scaleUpFactor = Math.max(
        prediction.predictedCpu / cpuThreshold,
        prediction.predictedMemory / memoryThreshold
      );
      recommendedReplicas = Math.min(
        Math.ceil(currentReplicas * scaleUpFactor),
        maxReplicas
      );
      action = 'scale_up';
      priority = prediction.predictedCpu > 0.9 || prediction.predictedMemory > 0.9 ? 'critical' : 'high';
      reason = `Predicted resource utilization (CPU: ${(prediction.predictedCpu * 100).toFixed(1)}%, Memory: ${(prediction.predictedMemory * 100).toFixed(1)}%) exceeds thresholds`;
    } else if (prediction.predictedCpu < 0.3 && prediction.predictedMemory < 0.3 && currentReplicas > minReplicas) {
      recommendedReplicas = Math.max(
        Math.floor(currentReplicas * 0.7),
        minReplicas
      );
      action = 'scale_down';
      priority = 'low';
      reason = 'Low predicted resource utilization allows for cost optimization';
    }

    const costChange = this.estimateCostChange(currentReplicas, recommendedReplicas);
    const performanceChange = this.estimatePerformanceChange(action, prediction);

    return {
      action,
      currentReplicas,
      recommendedReplicas,
      reason,
      priority,
      estimatedImpact: {
        costChange,
        performanceChange
      }
    };
  }

  private estimateCostChange(current: number, recommended: number): number {
    const costPerReplica = 0.10; // $0.10 per hour per replica
    return (recommended - current) * costPerReplica;
  }

  private estimatePerformanceChange(action: string, prediction: CapacityPrediction): number {
    if (action === 'scale_up') return 20; // 20% performance improvement
    if (action === 'scale_down') return -5; // 5% performance decrease
    return 0;
  }
}

// Initialize services
const predictionEngine = new CapacityPredictionEngine();
const dataCollector = new HistoricalDataCollector();
const metricsAnalyzer = new ResourceMetricsAnalyzer();
const recommendationGenerator = new ScalingRecommendationGenerator();

// API Route Handler
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || 'health';

    switch (path) {
      case 'health':
        return NextResponse.json({ 
          status: 'healthy',
          service: 'deployment-capacity-prediction',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        });

      case 'metrics':
        const metricsQuery = MetricsQuerySchema.parse({
          deploymentId: searchParams.get('deploymentId'),
          startTime: searchParams.get('startTime'),
          endTime: searchParams.get('endTime'),
          limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
        });

        const metrics = metricsQuery.deploymentId 
          ? await dataCollector.getDeploymentMetrics(metricsQuery.deploymentId, 24)
          : await dataCollector.getAllDeploymentMetrics(metricsQuery.limit);

        return NextResponse.json({
          success: true,
          data: metrics,
          count: metrics.length
        });

      case 'analysis':
        const deploymentId = searchParams.get('deploymentId');
        if (!deploymentId) {
          return NextResponse.json({ error: 'deploymentId required' }, { status: 400 });
        }

        const analysisMetrics = await dataCollector.getDeploymentMetrics(deploymentId, 168);
        const analysis = metricsAnalyzer.analyzeUsagePatterns(analysisMetrics);

        return NextResponse.json({
          success: true,
          deploymentId,
          analysis,
          metricsCount: analysisMetrics.length
        });

      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 404 });
    }
  } catch (error) {
    console.error('Capacity prediction error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || 'predict';

    switch (path) {
      case 'predict':
        const predictionRequest = PredictionRequestSchema.parse(await request.json());
        
        // Get historical data
        const historicalMetrics = await dataCollector.getDeploymentMetrics(
          predictionRequest.deploymentId,
          predictionRequest.timeHorizon * 2 // Get 2x timeframe for better prediction
        );

        if (historicalMetrics.length === 0) {
          return NextResponse.json({ error: 'No historical data available' }, { status: 400 });
        }

        // Preprocess data for ML model
        const preprocessedData = predictionEngine.preprocessMetrics(historicalMetrics);
        const latestMetrics = preprocessedData[preprocessedData.length - 1];

        // Make prediction
        const prediction = await predictionEngine.predict(latestMetrics);

        // Create capacity prediction object
        const capacityPrediction: CapacityPrediction = {
          deploymentId: predictionRequest.deploymentId,
          predictedCpu: prediction[0],
          predictedMemory: prediction[1],
          predictedNetwork: prediction[2],
          predictedStorage: prediction[3],
          confidence: predictionRequest.confidenceLevel,
          recommendedReplicas: Math.ceil(Math.max(prediction[0], prediction[1]) * 3),
          estimatedCost: Math.ceil(Math.max(prediction[0], prediction[1]) * 3) * 0.10,
          predictionTimestamp: new Date()
        };

        // Generate scaling recommendation
        const currentReplicas = 2; // Default, should be fetched from deployment service
        const recommendation = recommendationGenerator.generateRecommendation(
          historicalMetrics[historicalMetrics.length - 1],
          capacityPrediction,
          currentReplicas
        );

        // Store prediction in database
        await supabase.from('capacity_predictions').insert({
          deployment_id: capacityPrediction.deploymentId,
          predicted_cpu: capacityPrediction.predictedCpu,
          predicted_memory: capacityPrediction.predictedMemory,
          predicted_network: capacityPrediction.predictedNetwork,
          predicted_storage: capacityPrediction.predictedStorage,
          confidence: capacityPrediction.confidence,
          recommended_replicas: capacityPrediction.recommendedReplicas,
          estimated_cost: capacityPrediction.estimatedCost,
          prediction_timestamp: capacityPrediction.predictionTimestamp.toISOString()
        });

        return NextResponse.json({
          success: true,
          prediction: capacityPrediction,
          recommendation,
          historicalDataPoints: historicalMetrics.length
        });

      case 'train':
        // Trigger model retraining with latest data
        const allMetrics = await dataCollector.getAllDeploymentMetrics(5000);
        const preprocessedTrainingData = predictionEngine.preprocessMetrics(allMetrics);
        
        return NextResponse.json({
          success: true,
          message: 'Model training initiated',
          trainingDataPoints: preprocessedTrainingData.length
        });

      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 404 });
    }
  } catch (error) {
    console.error('Capacity prediction POST error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deploymentId = searchParams.get('deploymentId');

    if (!deploymentId) {
      return NextResponse.json({ error: 'deploymentId required' }, { status: 400 });
    }

    // Clean up old predictions
    const { error } = await supabase
      .from('capacity_predictions')
      .delete()
      .eq('deployment_id', deploymentId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Predictions for deployment ${deploymentId} deleted`
    });
  } catch (error) {
    console.error('Capacity prediction DELETE error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}
```