```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Validation schemas
const predictionRequestSchema = z.object({
  timeframe: z.enum(['1_week', '1_month', '3_months', '6_months', '1_year']),
  metrics: z.array(z.enum(['cpu', 'memory', 'storage', 'bandwidth', 'requests', 'users'])).optional(),
  includeCosts: z.boolean().default(true),
  includeSeasonality: z.boolean().default(true),
  featureReleases: z.array(z.object({
    name: z.string(),
    expectedDate: z.string(),
    expectedImpact: z.enum(['low', 'medium', 'high'])
  })).optional()
});

// Types
interface UsagePattern {
  metric: string;
  historicalData: Array<{
    timestamp: string;
    value: number;
    trend: number;
  }>;
  seasonalFactors: Record<string, number>;
  growthRate: number;
}

interface PredictionResult {
  metric: string;
  predictions: Array<{
    timestamp: string;
    predictedValue: number;
    confidence: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  recommendations: Array<{
    type: 'scale_up' | 'scale_down' | 'optimize';
    resource: string;
    timing: string;
    impact: string;
    costSavings?: number;
  }>;
}

interface CostOptimization {
  currentCost: number;
  predictedCost: number;
  potentialSavings: number;
  optimizations: Array<{
    resource: string;
    action: string;
    savings: number;
    risk: 'low' | 'medium' | 'high';
  }>;
}

class PredictionEngine {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async getHistoricalUsage(timeframe: string, metrics: string[]) {
    const timeframeHours = this.getTimeframeHours(timeframe) * 2; // Get 2x data for better analysis
    
    const { data, error } = await this.supabase
      .from('infrastructure_metrics')
      .select('*')
      .in('metric_type', metrics.length > 0 ? metrics : ['cpu', 'memory', 'storage', 'bandwidth', 'requests', 'users'])
      .gte('timestamp', new Date(Date.now() - timeframeHours * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getSeasonalTrends(metric: string) {
    const { data, error } = await this.supabase
      .from('seasonal_patterns')
      .select('*')
      .eq('metric_type', metric)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.patterns || {};
  }

  private getTimeframeHours(timeframe: string): number {
    const mapping = {
      '1_week': 24 * 7,
      '1_month': 24 * 30,
      '3_months': 24 * 90,
      '6_months': 24 * 180,
      '1_year': 24 * 365
    };
    return mapping[timeframe as keyof typeof mapping] || 24 * 30;
  }

  private calculateMovingAverage(data: number[], window: number): number[] {
    return data.map((_, index) => {
      if (index < window - 1) return data[index];
      const slice = data.slice(index - window + 1, index + 1);
      return slice.reduce((sum, val) => sum + val, 0) / window;
    });
  }

  private detectSeasonality(data: Array<{ timestamp: string; value: number }>) {
    const hourlyPatterns: Record<number, number[]> = {};
    const dailyPatterns: Record<number, number[]> = {};
    const weeklyPatterns: Record<number, number[]> = {};

    data.forEach(point => {
      const date = new Date(point.timestamp);
      const hour = date.getUTCHours();
      const day = date.getUTCDay();
      const dayOfMonth = date.getUTCDate();

      if (!hourlyPatterns[hour]) hourlyPatterns[hour] = [];
      if (!dailyPatterns[day]) dailyPatterns[day] = [];
      if (!weeklyPatterns[Math.floor(dayOfMonth / 7)]) weeklyPatterns[Math.floor(dayOfMonth / 7)] = [];

      hourlyPatterns[hour].push(point.value);
      dailyPatterns[day].push(point.value);
      weeklyPatterns[Math.floor(dayOfMonth / 7)].push(point.value);
    });

    const calculateAverage = (arr: number[]) => arr.reduce((sum, val) => sum + val, 0) / arr.length;

    return {
      hourly: Object.fromEntries(
        Object.entries(hourlyPatterns).map(([hour, values]) => [hour, calculateAverage(values)])
      ),
      daily: Object.fromEntries(
        Object.entries(dailyPatterns).map(([day, values]) => [day, calculateAverage(values)])
      ),
      weekly: Object.fromEntries(
        Object.entries(weeklyPatterns).map(([week, values]) => [week, calculateAverage(values)])
      )
    };
  }

  private calculateGrowthRate(data: number[]): number {
    if (data.length < 2) return 0;
    
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    return (secondAvg - firstAvg) / firstAvg;
  }

  private applyFeatureImpact(baseValue: number, timestamp: string, featureReleases: any[] = []): number {
    const targetDate = new Date(timestamp);
    let impactMultiplier = 1;

    featureReleases.forEach(feature => {
      const releaseDate = new Date(feature.expectedDate);
      const daysDiff = (targetDate.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff >= 0 && daysDiff <= 30) {
        const impactValues = { low: 1.1, medium: 1.3, high: 1.6 };
        const decayFactor = Math.exp(-daysDiff / 14); // Impact decays over 2 weeks
        impactMultiplier *= 1 + (impactValues[feature.expectedImpact as keyof typeof impactValues] - 1) * decayFactor;
      }
    });

    return baseValue * impactMultiplier;
  }

  async generatePredictions(
    timeframe: string,
    metrics: string[],
    includeSeasonality: boolean,
    featureReleases: any[] = []
  ): Promise<PredictionResult[]> {
    const historicalData = await this.getHistoricalUsage(timeframe, metrics);
    const groupedData = this.groupDataByMetric(historicalData);
    const predictions: PredictionResult[] = [];

    for (const [metric, data] of Object.entries(groupedData)) {
      const values = data.map(d => d.value);
      const movingAvg = this.calculateMovingAverage(values, Math.min(24, values.length));
      const growthRate = this.calculateGrowthRate(values);
      const seasonalPatterns = includeSeasonality ? this.detectSeasonality(data) : null;

      const predictionHours = this.getTimeframeHours(timeframe);
      const hourlyPredictions = [];

      for (let i = 0; i < predictionHours; i++) {
        const futureTimestamp = new Date(Date.now() + i * 60 * 60 * 1000);
        const baseValue = movingAvg[movingAvg.length - 1] * (1 + growthRate * (i / (24 * 30)));
        
        let seasonalMultiplier = 1;
        if (seasonalPatterns) {
          const hour = futureTimestamp.getUTCHours();
          const day = futureTimestamp.getUTCDay();
          const overallAvg = values.reduce((sum, val) => sum + val, 0) / values.length;
          
          if (seasonalPatterns.hourly[hour]) {
            seasonalMultiplier *= seasonalPatterns.hourly[hour] / overallAvg;
          }
          if (seasonalPatterns.daily[day]) {
            seasonalMultiplier *= seasonalPatterns.daily[day] / overallAvg;
          }
        }

        const seasonalValue = baseValue * seasonalMultiplier;
        const finalValue = this.applyFeatureImpact(seasonalValue, futureTimestamp.toISOString(), featureReleases);

        const confidence = Math.max(0.3, Math.min(0.95, 0.9 - (i / predictionHours) * 0.4));
        const trend = growthRate > 0.05 ? 'increasing' : growthRate < -0.05 ? 'decreasing' : 'stable';

        hourlyPredictions.push({
          timestamp: futureTimestamp.toISOString(),
          predictedValue: Math.max(0, finalValue),
          confidence,
          trend
        });
      }

      const recommendations = this.generateRecommendations(metric, hourlyPredictions, values);

      predictions.push({
        metric,
        predictions: hourlyPredictions.filter((_, index) => index % 24 === 0), // Return daily predictions
        recommendations
      });
    }

    return predictions;
  }

  private groupDataByMetric(data: any[]) {
    return data.reduce((acc, item) => {
      if (!acc[item.metric_type]) acc[item.metric_type] = [];
      acc[item.metric_type].push({
        timestamp: item.timestamp,
        value: item.value
      });
      return acc;
    }, {} as Record<string, Array<{ timestamp: string; value: number }>>);
  }

  private generateRecommendations(metric: string, predictions: any[], historicalValues: number[]) {
    const recommendations = [];
    const avgHistorical = historicalValues.reduce((sum, val) => sum + val, 0) / historicalValues.length;
    const maxPredicted = Math.max(...predictions.map(p => p.predictedValue));
    const avgPredicted = predictions.reduce((sum, p) => sum + p.predictedValue, 0) / predictions.length;

    const resourceMappings = {
      cpu: 'CPU cores',
      memory: 'RAM GB',
      storage: 'Storage GB',
      bandwidth: 'Network bandwidth',
      requests: 'Request capacity',
      users: 'User capacity'
    };

    const resource = resourceMappings[metric as keyof typeof resourceMappings] || metric;

    if (maxPredicted > avgHistorical * 1.5) {
      recommendations.push({
        type: 'scale_up' as const,
        resource,
        timing: 'Next 1-2 weeks',
        impact: `Peak usage expected to increase by ${Math.round((maxPredicted - avgHistorical) / avgHistorical * 100)}%`,
        costSavings: 0
      });
    }

    if (avgPredicted < avgHistorical * 0.7) {
      recommendations.push({
        type: 'scale_down' as const,
        resource,
        timing: 'Next month',
        impact: `Average usage expected to decrease by ${Math.round((avgHistorical - avgPredicted) / avgHistorical * 100)}%`,
        costSavings: Math.round((avgHistorical - avgPredicted) * 0.1 * 24 * 30) // Estimated monthly savings
      });
    }

    const variance = predictions.reduce((sum, p) => sum + Math.pow(p.predictedValue - avgPredicted, 2), 0) / predictions.length;
    if (variance > avgPredicted * 0.5) {
      recommendations.push({
        type: 'optimize' as const,
        resource,
        timing: 'Ongoing',
        impact: 'High variability detected - consider auto-scaling',
        costSavings: Math.round(avgPredicted * 0.15 * 24 * 30)
      });
    }

    return recommendations;
  }

  async calculateCostOptimization(predictions: PredictionResult[]): Promise<CostOptimization> {
    const costPerUnit = {
      cpu: 0.05, // per core per hour
      memory: 0.01, // per GB per hour
      storage: 0.001, // per GB per hour
      bandwidth: 0.1, // per GB
      requests: 0.0001, // per request
      users: 0.02 // per user per hour
    };

    let currentCost = 0;
    let predictedCost = 0;
    const optimizations = [];

    for (const prediction of predictions) {
      const unitCost = costPerUnit[prediction.metric as keyof typeof costPerUnit] || 0;
      
      // Get current usage from last prediction point
      const { data: currentData } = await this.supabase
        .from('infrastructure_metrics')
        .select('value')
        .eq('metric_type', prediction.metric)
        .order('timestamp', { ascending: false })
        .limit(24);

      const currentAvg = currentData?.reduce((sum, d) => sum + d.value, 0) / (currentData?.length || 1) || 0;
      const predictedAvg = prediction.predictions.reduce((sum, p) => sum + p.predictedValue, 0) / prediction.predictions.length;

      currentCost += currentAvg * unitCost * 24 * 30; // Monthly cost
      predictedCost += predictedAvg * unitCost * 24 * 30;

      // Generate optimization suggestions
      prediction.recommendations.forEach(rec => {
        if (rec.type === 'scale_down' || rec.type === 'optimize') {
          optimizations.push({
            resource: prediction.metric,
            action: rec.type === 'scale_down' ? 'Reduce capacity' : 'Enable auto-scaling',
            savings: rec.costSavings || 0,
            risk: rec.type === 'scale_down' ? 'medium' as const : 'low' as const
          });
        }
      });
    }

    const potentialSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);

    return {
      currentCost: Math.round(currentCost * 100) / 100,
      predictedCost: Math.round(predictedCost * 100) / 100,
      potentialSavings: Math.round(potentialSavings * 100) / 100,
      optimizations
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '1_month';
    const metrics = searchParams.get('metrics')?.split(',') || [];
    const includeCosts = searchParams.get('includeCosts') !== 'false';
    const includeSeasonality = searchParams.get('includeSeasonality') !== 'false';

    const validation = predictionRequestSchema.safeParse({
      timeframe,
      metrics: metrics.length > 0 ? metrics : undefined,
      includeCosts,
      includeSeasonality
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validation.error.issues },
        { status: 400 }
      );
    }

    const engine = new PredictionEngine();
    const predictions = await engine.generatePredictions(
      timeframe,
      metrics,
      includeSeasonality
    );

    let costOptimization = null;
    if (includeCosts) {
      costOptimization = await engine.calculateCostOptimization(predictions);
    }

    return NextResponse.json({
      success: true,
      data: {
        timeframe,
        generatedAt: new Date().toISOString(),
        predictions,
        costOptimization,
        summary: {
          totalMetrics: predictions.length,
          totalRecommendations: predictions.reduce((sum, p) => sum + p.recommendations.length, 0),
          highConfidencePredictions: predictions.reduce((sum, p) => 
            sum + p.predictions.filter(pred => pred.confidence > 0.8).length, 0
          )
        }
      }
    });

  } catch (error: any) {
    console.error('Infrastructure prediction error:', error);

    if (error.message?.includes('PGRST')) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validation = predictionRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { timeframe, metrics = [], includeCosts, includeSeasonality, featureReleases = [] } = validation.data;

    const engine = new PredictionEngine();
    const predictions = await engine.generatePredictions(
      timeframe,
      metrics,
      includeSeasonality,
      featureReleases
    );

    let costOptimization = null;
    if (includeCosts) {
      costOptimization = await engine.calculateCostOptimization(predictions);
    }

    // Store prediction results for future analysis
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase
      .from('prediction_history')
      .insert({
        timeframe,
        metrics,
        predictions: JSON.stringify(predictions),
        cost_optimization: costOptimization ? JSON.stringify(costOptimization) : null,
        feature_releases: JSON.stringify(featureReleases),
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      data: {
        timeframe,
        generatedAt: new Date().toISOString(),
        predictions,
        costOptimization,
        featureImpact: featureReleases.length > 0,
        summary: {
          totalMetrics: predictions.length,
          totalRecommendations: predictions.reduce((sum, p) => sum + p.recommendations.length, 0),
          highConfidencePredictions: predictions.reduce((sum, p) => 
            sum + p.predictions.filter(pred => pred.confidence > 0.8).length, 0
          ),
          potentialSavings: costOptimization?.potentialSavings || 0
        }
      }
    });

  } catch (error: any) {
    console.error('Infrastructure prediction error:', error);

    if (error.message?.includes('PGRST')) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```