```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as tf from '@tensorflow/tfjs-node';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { authenticate } from '@/lib/auth';

// Validation schemas
const PredictRequestSchema = z.object({
  timeframe: z.enum(['1h', '6h', '24h', '7d', '30d', '90d']),
  resource_type: z.enum(['cpu', 'memory', 'storage', 'bandwidth', 'requests']),
  confidence_level: z.number().min(0.8).max(0.99).default(0.95),
  include_cost_analysis: z.boolean().default(true),
  scaling_strategy: z.enum(['conservative', 'aggressive', 'balanced']).default('balanced')
});

// Types
interface UsageMetric {
  timestamp: string;
  value: number;
  resource_type: string;
  metadata?: Record<string, any>;
}

interface SeasonalPattern {
  daily: number[];
  weekly: number[];
  monthly: number[];
  yearly: number[];
}

interface PredictionResult {
  timestamp: string;
  predicted_value: number;
  confidence_interval: {
    lower: number;
    upper: number;
  };
  trend_component: number;
  seasonal_component: number;
  residual_component: number;
}

interface ScalingRecommendation {
  action: 'scale_up' | 'scale_down' | 'maintain';
  target_capacity: number;
  confidence: number;
  estimated_cost_impact: number;
  reasoning: string[];
  urgency: 'low' | 'medium' | 'high';
  implementation_window: string;
}

class PredictiveScalingEngine {
  private supabase: any;
  private redis: Redis;
  private model: tf.LayersModel | null = null;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  async loadModel(resourceType: string): Promise<tf.LayersModel> {
    const cacheKey = `ml_model:${resourceType}`;
    
    try {
      // Try to load from cache first
      const cachedModel = await this.redis.get(cacheKey);
      if (cachedModel && this.model) {
        return this.model;
      }

      // Load or create model
      const modelPath = `/models/scaling/${resourceType}/model.json`;
      try {
        this.model = await tf.loadLayersModel(modelPath);
      } catch {
        // Create new model if none exists
        this.model = this.createTimeSeriesModel();
      }

      return this.model;
    } catch (error) {
      console.error('Error loading ML model:', error);
      throw new Error('Failed to initialize prediction model');
    }
  }

  private createTimeSeriesModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 64,
          returnSequences: true,
          inputShape: [24, 5] // 24 time steps, 5 features
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({
          units: 32,
          returnSequences: false
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'linear' })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['meanAbsoluteError']
    });

    return model;
  }

  async getHistoricalData(
    resourceType: string,
    timeframe: string,
    userId: string
  ): Promise<UsageMetric[]> {
    const timeframeHours = this.parseTimeframe(timeframe);
    const startTime = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from('resource_usage_metrics')
      .select('*')
      .eq('user_id', userId)
      .eq('resource_type', resourceType)
      .gte('timestamp', startTime.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch historical data: ${error.message}`);
    }

    return data || [];
  }

  private parseTimeframe(timeframe: string): number {
    const mapping: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168,
      '30d': 720,
      '90d': 2160
    };
    return mapping[timeframe] || 24;
  }
}

class UsagePatternAnalyzer {
  static analyzePatterns(data: UsageMetric[]): {
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
    peaks: Date[];
    baseline: number;
  } {
    if (data.length === 0) {
      return {
        trend: 'stable',
        volatility: 0,
        peaks: [],
        baseline: 0
      };
    }

    const values = data.map(d => d.value);
    const timestamps = data.map(d => new Date(d.timestamp));
    
    // Calculate trend using linear regression
    const n = values.length;
    const sumX = timestamps.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = timestamps.reduce((sum, _, i) => sum + (i * i), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const trend = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';
    
    // Calculate volatility
    const mean = sumY / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const volatility = Math.sqrt(variance) / mean;
    
    // Detect peaks (values > 1.5 * standard deviation above mean)
    const stdDev = Math.sqrt(variance);
    const peakThreshold = mean + (1.5 * stdDev);
    const peaks = timestamps.filter((_, i) => values[i] > peakThreshold);
    
    return {
      trend,
      volatility,
      peaks,
      baseline: mean
    };
  }
}

class SeasonalTrendDetector {
  static detectSeasonality(data: UsageMetric[]): SeasonalPattern {
    const hourlyData = new Array(24).fill(0);
    const dailyData = new Array(7).fill(0);
    const monthlyData = new Array(12).fill(0);
    const yearlyData = new Array(1).fill(0);
    
    const hourlyCounts = new Array(24).fill(0);
    const dailyCounts = new Array(7).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    
    data.forEach(metric => {
      const date = new Date(metric.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      const month = date.getMonth();
      
      hourlyData[hour] += metric.value;
      hourlyCounts[hour]++;
      
      dailyData[day] += metric.value;
      dailyCounts[day]++;
      
      monthlyData[month] += metric.value;
      monthlyCounts[month]++;
      
      yearlyData[0] += metric.value;
    });
    
    // Calculate averages
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = hourlyCounts[i] > 0 ? hourlyData[i] / hourlyCounts[i] : 0;
    }
    
    for (let i = 0; i < 7; i++) {
      dailyData[i] = dailyCounts[i] > 0 ? dailyData[i] / dailyCounts[i] : 0;
    }
    
    for (let i = 0; i < 12; i++) {
      monthlyData[i] = monthlyCounts[i] > 0 ? monthlyData[i] / monthlyCounts[i] : 0;
    }
    
    yearlyData[0] = data.length > 0 ? yearlyData[0] / data.length : 0;
    
    return {
      daily: hourlyData,
      weekly: dailyData,
      monthly: monthlyData,
      yearly: yearlyData
    };
  }
}

class ScalingCostEstimator {
  private static readonly COST_PER_UNIT: Record<string, number> = {
    cpu: 0.05, // per CPU hour
    memory: 0.01, // per GB hour
    storage: 0.001, // per GB hour
    bandwidth: 0.08, // per GB
    requests: 0.0000002 // per request
  };

  static estimateCost(
    resourceType: string,
    currentCapacity: number,
    targetCapacity: number,
    timeframe: string
  ): {
    current_cost: number;
    projected_cost: number;
    cost_difference: number;
    roi_estimate: number;
  } {
    const hours = this.parseTimeframeToHours(timeframe);
    const unitCost = this.COST_PER_UNIT[resourceType] || 0;
    
    const currentCost = currentCapacity * unitCost * hours;
    const projectedCost = targetCapacity * unitCost * hours;
    const costDifference = projectedCost - currentCost;
    
    // Simple ROI calculation based on performance improvement
    const capacityRatio = targetCapacity / Math.max(currentCapacity, 1);
    const performanceImprovement = Math.min(capacityRatio * 0.8, 2.0);
    const roiEstimate = performanceImprovement - (costDifference / currentCost);
    
    return {
      current_cost: Math.round(currentCost * 100) / 100,
      projected_cost: Math.round(projectedCost * 100) / 100,
      cost_difference: Math.round(costDifference * 100) / 100,
      roi_estimate: Math.round(roiEstimate * 100) / 100
    };
  }

  private static parseTimeframeToHours(timeframe: string): number {
    const mapping: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168,
      '30d': 720,
      '90d': 2160
    };
    return mapping[timeframe] || 24;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      max: 10 // 10 requests per minute
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Authentication
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // Parse and validate request
    const body = await request.json();
    const validation = PredictRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request parameters',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const {
      timeframe,
      resource_type,
      confidence_level,
      include_cost_analysis,
      scaling_strategy
    } = validation.data;

    // Initialize scaling engine
    const scalingEngine = new PredictiveScalingEngine();
    
    // Load ML model
    await scalingEngine.loadModel(resource_type);

    // Get historical data
    const historicalData = await scalingEngine.getHistoricalData(
      resource_type,
      timeframe,
      userId
    );

    if (historicalData.length < 10) {
      return NextResponse.json(
        { error: 'Insufficient historical data for prediction' },
        { status: 400 }
      );
    }

    // Analyze usage patterns
    const patterns = UsagePatternAnalyzer.analyzePatterns(historicalData);
    
    // Detect seasonal trends
    const seasonality = SeasonalTrendDetector.detectSeasonality(historicalData);

    // Generate predictions using simple exponential smoothing
    // (In production, use the loaded TensorFlow model)
    const predictions: PredictionResult[] = [];
    const predictionHours = Math.min(scalingEngine['parseTimeframe'](timeframe), 168); // Max 7 days
    
    let lastValue = historicalData[historicalData.length - 1].value;
    const alpha = 0.3; // Smoothing factor
    
    for (let i = 1; i <= predictionHours; i++) {
      const futureTime = new Date(Date.now() + i * 60 * 60 * 1000);
      const hour = futureTime.getHours();
      const seasonalFactor = seasonality.daily[hour] / patterns.baseline;
      
      const predictedValue = lastValue * alpha + (1 - alpha) * lastValue * seasonalFactor;
      const uncertainty = patterns.volatility * Math.sqrt(i);
      
      predictions.push({
        timestamp: futureTime.toISOString(),
        predicted_value: Math.max(0, predictedValue),
        confidence_interval: {
          lower: Math.max(0, predictedValue - uncertainty),
          upper: predictedValue + uncertainty
        },
        trend_component: patterns.trend === 'increasing' ? 0.1 : patterns.trend === 'decreasing' ? -0.1 : 0,
        seasonal_component: seasonalFactor - 1,
        residual_component: 0
      });
      
      lastValue = predictedValue;
    }

    // Generate scaling recommendations
    const currentCapacity = patterns.baseline;
    const maxPredicted = Math.max(...predictions.map(p => p.predicted_value));
    const avgPredicted = predictions.reduce((sum, p) => sum + p.predicted_value, 0) / predictions.length;
    
    let targetCapacity: number;
    let action: 'scale_up' | 'scale_down' | 'maintain';
    
    switch (scaling_strategy) {
      case 'conservative':
        targetCapacity = Math.max(currentCapacity, maxPredicted * 1.1);
        break;
      case 'aggressive':
        targetCapacity = maxPredicted * 1.3;
        break;
      default: // balanced
        targetCapacity = Math.max(currentCapacity, avgPredicted * 1.2);
    }

    if (targetCapacity > currentCapacity * 1.1) {
      action = 'scale_up';
    } else if (targetCapacity < currentCapacity * 0.9) {
      action = 'scale_down';
    } else {
      action = 'maintain';
    }

    const recommendation: ScalingRecommendation = {
      action,
      target_capacity: Math.round(targetCapacity * 100) / 100,
      confidence: Math.max(0.6, Math.min(0.95, 1 - patterns.volatility)),
      estimated_cost_impact: 0,
      reasoning: [
        `Current ${resource_type} usage trending ${patterns.trend}`,
        `Peak usage expected: ${Math.round(maxPredicted * 100) / 100}`,
        `Volatility level: ${Math.round(patterns.volatility * 100)}%`
      ],
      urgency: patterns.volatility > 0.5 ? 'high' : patterns.volatility > 0.2 ? 'medium' : 'low',
      implementation_window: action === 'scale_up' && patterns.trend === 'increasing' ? '1h' : '6h'
    };

    // Cost analysis
    let costAnalysis = null;
    if (include_cost_analysis) {
      costAnalysis = ScalingCostEstimator.estimateCost(
        resource_type,
        currentCapacity,
        targetCapacity,
        timeframe
      );
      recommendation.estimated_cost_impact = costAnalysis.cost_difference;
    }

    // Cache results
    const cacheKey = `prediction:${userId}:${resource_type}:${timeframe}`;
    await scalingEngine['redis'].setex(
      cacheKey,
      300, // 5 minutes
      JSON.stringify({
        predictions: predictions.slice(0, 24), // Only cache first 24 hours
        recommendation,
        patterns,
        seasonality
      })
    );

    const response = {
      success: true,
      data: {
        resource_type,
        timeframe,
        confidence_level,
        current_metrics: {
          baseline: Math.round(patterns.baseline * 100) / 100,
          trend: patterns.trend,
          volatility: Math.round(patterns.volatility * 100) / 100,
          peak_count: patterns.peaks.length
        },
        predictions: predictions.slice(0, 48), // Return up to 48 hours
        recommendation,
        seasonality_detected: {
          has_daily_pattern: seasonality.daily.some(v => v > patterns.baseline * 1.1),
          has_weekly_pattern: seasonality.weekly.some(v => v > patterns.baseline * 1.1),
          peak_hours: seasonality.daily
            .map((value, hour) => ({ hour, value }))
            .filter(item => item.value > patterns.baseline * 1.2)
            .map(item => item.hour)
        },
        ...(costAnalysis && { cost_analysis: costAnalysis }),
        metadata: {
          model_version: '1.0',
          data_points_analyzed: historicalData.length,
          prediction_generated_at: new Date().toISOString(),
          cache_ttl: 300
        }
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Prediction API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      status: 'healthy',
      service: 'predictive-scaling',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
```