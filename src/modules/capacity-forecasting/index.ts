```typescript
/**
 * Capacity Forecasting Module
 * 
 * Intelligent capacity forecasting system that analyzes growth patterns,
 * feature adoption rates, and market trends to predict future capacity needs
 * with automated resource provisioning and cost optimization.
 * 
 * @module CapacityForecasting
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { z } from 'zod';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * Time series data point for forecasting
 */
export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

/**
 * Growth pattern analysis result
 */
export interface GrowthPattern {
  trend: 'exponential' | 'linear' | 'logarithmic' | 'seasonal' | 'declining';
  confidence: number;
  growthRate: number;
  seasonalityFactor?: number;
  cycleDuration?: number;
}

/**
 * Feature adoption metrics
 */
export interface FeatureAdoption {
  featureId: string;
  featureName: string;
  adoptionRate: number;
  totalUsers: number;
  activeUsers: number;
  churnRate: number;
  timeToAdoption: number;
  impactOnCapacity: number;
}

/**
 * Market trend data
 */
export interface MarketTrend {
  indicator: string;
  value: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  impactWeight: number;
  source: string;
}

/**
 * Capacity prediction result
 */
export interface CapacityPrediction {
  timeHorizon: Date;
  predictedCapacity: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  contributingFactors: {
    growthTrend: number;
    featureAdoption: number;
    marketTrends: number;
    seasonal: number;
  };
  recommendedActions: string[];
}

/**
 * Resource provisioning configuration
 */
export interface ProvisioningConfig {
  resourceType: 'compute' | 'storage' | 'network' | 'database';
  minCapacity: number;
  maxCapacity: number;
  scalingPolicy: 'reactive' | 'predictive' | 'hybrid';
  costConstraints: {
    maxBudget: number;
    preferredRegions: string[];
    instanceTypes: string[];
  };
}

/**
 * Cost optimization recommendation
 */
export interface CostOptimizationRecommendation {
  type: 'right_sizing' | 'reserved_instances' | 'spot_instances' | 'scheduling';
  description: string;
  potentialSavings: number;
  riskLevel: 'low' | 'medium' | 'high';
  implementation: {
    difficulty: 'easy' | 'medium' | 'complex';
    timeToImplement: number;
    prerequisites: string[];
  };
}

/**
 * Forecasting model configuration
 */
export interface ForecastingModelConfig {
  algorithm: 'arima' | 'exponential_smoothing' | 'neural_network' | 'ensemble';
  parameters: Record<string, number>;
  trainingPeriod: number;
  validationSplit: number;
  updateFrequency: number;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const TimeSeriesDataSchema = z.object({
  timestamp: z.date(),
  value: z.number().min(0),
  metadata: z.record(z.unknown()).optional()
});

const ForecastingConfigSchema = z.object({
  algorithm: z.enum(['arima', 'exponential_smoothing', 'neural_network', 'ensemble']),
  parameters: z.record(z.number()),
  trainingPeriod: z.number().min(1),
  validationSplit: z.number().min(0.1).max(0.5),
  updateFrequency: z.number().min(1)
});

const ProvisioningConfigSchema = z.object({
  resourceType: z.enum(['compute', 'storage', 'network', 'database']),
  minCapacity: z.number().min(0),
  maxCapacity: z.number().min(1),
  scalingPolicy: z.enum(['reactive', 'predictive', 'hybrid']),
  costConstraints: z.object({
    maxBudget: z.number().min(0),
    preferredRegions: z.array(z.string()),
    instanceTypes: z.array(z.string())
  })
});

// ============================================================================
// PREDICTION ALGORITHMS
// ============================================================================

/**
 * Analyzes time series data to identify growth patterns
 */
class GrowthPatternAnalyzer {
  /**
   * Analyzes growth pattern from historical data
   */
  public analyzePattern(data: TimeSeriesDataPoint[]): GrowthPattern {
    if (data.length < 3) {
      throw new Error('Insufficient data points for pattern analysis');
    }

    const values = data.map(d => d.value);
    const timestamps = data.map(d => d.timestamp.getTime());
    
    const trend = this.detectTrend(values, timestamps);
    const confidence = this.calculateConfidence(values, trend);
    const growthRate = this.calculateGrowthRate(values);
    
    const seasonality = this.detectSeasonality(values);
    
    return {
      trend,
      confidence,
      growthRate,
      seasonalityFactor: seasonality.factor,
      cycleDuration: seasonality.cycleDuration
    };
  }

  private detectTrend(values: number[], timestamps: number[]): GrowthPattern['trend'] {
    const n = values.length;
    const avgX = timestamps.reduce((a, b) => a + b, 0) / n;
    const avgY = values.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = timestamps[i] - avgX;
      const yDiff = values[i] - avgY;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }
    
    const slope = numerator / denominator;
    const acceleration = this.calculateAcceleration(values);
    
    if (Math.abs(acceleration) > Math.abs(slope) * 0.1) {
      return acceleration > 0 ? 'exponential' : 'declining';
    }
    
    if (Math.abs(slope) < 0.01) {
      return 'seasonal';
    }
    
    return slope > 0 ? 'linear' : 'declining';
  }

  private calculateAcceleration(values: number[]): number {
    if (values.length < 3) return 0;
    
    const differences = [];
    for (let i = 1; i < values.length; i++) {
      differences.push(values[i] - values[i - 1]);
    }
    
    let acceleration = 0;
    for (let i = 1; i < differences.length; i++) {
      acceleration += differences[i] - differences[i - 1];
    }
    
    return acceleration / (differences.length - 1);
  }

  private calculateConfidence(values: number[], trend: GrowthPattern['trend']): number {
    const variance = this.calculateVariance(values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    const coefficientOfVariation = variance > 0 ? Math.sqrt(variance) / mean : 0;
    
    const baseConfidence = Math.max(0, 1 - coefficientOfVariation);
    
    const trendConfidenceBoost = trend === 'seasonal' ? 0.8 : 1.0;
    
    return Math.min(1, baseConfidence * trendConfidenceBoost);
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;
    
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const periods = values.length - 1;
    
    if (firstValue <= 0) return 0;
    
    return Math.pow(lastValue / firstValue, 1 / periods) - 1;
  }

  private detectSeasonality(values: number[]): { factor: number; cycleDuration: number } {
    if (values.length < 12) {
      return { factor: 0, cycleDuration: 0 };
    }
    
    const autocorrelations = this.calculateAutocorrelations(values, Math.min(values.length / 2, 24));
    
    let maxCorrelation = 0;
    let bestLag = 0;
    
    for (let lag = 2; lag < autocorrelations.length; lag++) {
      if (autocorrelations[lag] > maxCorrelation && autocorrelations[lag] > 0.3) {
        maxCorrelation = autocorrelations[lag];
        bestLag = lag;
      }
    }
    
    return {
      factor: maxCorrelation,
      cycleDuration: bestLag
    };
  }

  private calculateAutocorrelations(values: number[], maxLag: number): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = this.calculateVariance(values);
    
    const autocorrelations: number[] = [];
    
    for (let lag = 0; lag <= maxLag; lag++) {
      let covariance = 0;
      let count = 0;
      
      for (let i = 0; i < values.length - lag; i++) {
        covariance += (values[i] - mean) * (values[i + lag] - mean);
        count++;
      }
      
      const autocorr = count > 0 ? covariance / count / variance : 0;
      autocorrelations.push(autocorr);
    }
    
    return autocorrelations;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((variance, value) => variance + Math.pow(value - mean, 2), 0) / values.length;
  }
}

/**
 * Feature adoption tracking and analysis
 */
class FeatureAdoptionTracker {
  private adoptionData: Map<string, FeatureAdoption> = new Map();

  /**
   * Updates feature adoption metrics
   */
  public updateAdoptionMetrics(featureId: string, metrics: Partial<FeatureAdoption>): void {
    const existing = this.adoptionData.get(featureId) || {
      featureId,
      featureName: metrics.featureName || featureId,
      adoptionRate: 0,
      totalUsers: 0,
      activeUsers: 0,
      churnRate: 0,
      timeToAdoption: 0,
      impactOnCapacity: 0
    };

    this.adoptionData.set(featureId, { ...existing, ...metrics });
  }

  /**
   * Gets adoption metrics for a feature
   */
  public getAdoptionMetrics(featureId: string): FeatureAdoption | null {
    return this.adoptionData.get(featureId) || null;
  }

  /**
   * Calculates adoption velocity
   */
  public calculateAdoptionVelocity(featureId: string, timeWindow: number): number {
    const metrics = this.adoptionData.get(featureId);
    if (!metrics) return 0;

    return metrics.adoptionRate / timeWindow;
  }

  /**
   * Predicts feature impact on capacity
   */
  public predictCapacityImpact(featureId: string, forecastPeriod: number): number {
    const metrics = this.adoptionData.get(featureId);
    if (!metrics) return 0;

    const velocity = this.calculateAdoptionVelocity(featureId, 30);
    const projectedAdoption = metrics.adoptionRate + (velocity * forecastPeriod);
    
    return projectedAdoption * metrics.impactOnCapacity;
  }
}

/**
 * Market trend monitoring and analysis
 */
class MarketTrendMonitor {
  private trends: Map<string, MarketTrend[]> = new Map();

  /**
   * Records market trend data
   */
  public recordTrend(category: string, trend: MarketTrend): void {
    const categoryTrends = this.trends.get(category) || [];
    categoryTrends.push(trend);
    
    const maxHistory = 100;
    if (categoryTrends.length > maxHistory) {
      categoryTrends.splice(0, categoryTrends.length - maxHistory);
    }
    
    this.trends.set(category, categoryTrends);
  }

  /**
   * Gets weighted market impact score
   */
  public getMarketImpactScore(categories: string[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const category of categories) {
      const categoryTrends = this.trends.get(category) || [];
      if (categoryTrends.length === 0) continue;

      const recent = categoryTrends.slice(-10);
      const avgValue = recent.reduce((sum, trend) => sum + trend.value, 0) / recent.length;
      const avgWeight = recent.reduce((sum, trend) => sum + trend.impactWeight, 0) / recent.length;
      const avgConfidence = recent.reduce((sum, trend) => sum + trend.confidence, 0) / recent.length;

      const weightedScore = avgValue * avgWeight * avgConfidence;
      totalScore += weightedScore;
      totalWeight += avgWeight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Analyzes trend momentum
   */
  public analyzeTrendMomentum(category: string): { momentum: number; direction: 'up' | 'down' | 'stable' } {
    const categoryTrends = this.trends.get(category) || [];
    if (categoryTrends.length < 3) {
      return { momentum: 0, direction: 'stable' };
    }

    const recent = categoryTrends.slice(-5);
    const values = recent.map(trend => trend.value);
    
    let momentum = 0;
    for (let i = 1; i < values.length; i++) {
      momentum += values[i] - values[i - 1];
    }
    
    momentum = momentum / (values.length - 1);
    
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(momentum) > 0.01) {
      direction = momentum > 0 ? 'up' : 'down';
    }

    return { momentum, direction };
  }
}

// ============================================================================
// FORECASTING ENGINE
// ============================================================================

/**
 * Main capacity forecasting engine
 */
export class CapacityForecastingEngine extends EventEmitter {
  private growthAnalyzer: GrowthPatternAnalyzer;
  private adoptionTracker: FeatureAdoptionTracker;
  private trendMonitor: MarketTrendMonitor;
  private models: Map<string, ForecastingModelConfig> = new Map();
  private historicalData: Map<string, TimeSeriesDataPoint[]> = new Map();

  constructor() {
    super();
    this.growthAnalyzer = new GrowthPatternAnalyzer();
    this.adoptionTracker = new FeatureAdoptionTracker();
    this.trendMonitor = new MarketTrendMonitor();
  }

  /**
   * Configures forecasting model
   */
  public configureModel(modelId: string, config: ForecastingModelConfig): void {
    const validatedConfig = ForecastingConfigSchema.parse(config);
    this.models.set(modelId, validatedConfig);
    this.emit('model-configured', { modelId, config: validatedConfig });
  }

  /**
   * Adds historical data for forecasting
   */
  public addHistoricalData(series: string, dataPoints: TimeSeriesDataPoint[]): void {
    const validatedData = dataPoints.map(point => TimeSeriesDataSchema.parse(point));
    
    const existing = this.historicalData.get(series) || [];
    const combined = [...existing, ...validatedData];
    
    combined.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const maxHistory = 1000;
    if (combined.length > maxHistory) {
      combined.splice(0, combined.length - maxHistory);
    }
    
    this.historicalData.set(series, combined);
    this.emit('data-updated', { series, dataPoints: combined.length });
  }

  /**
   * Records feature adoption data
   */
  public recordFeatureAdoption(featureId: string, metrics: Partial<FeatureAdoption>): void {
    this.adoptionTracker.updateAdoptionMetrics(featureId, metrics);
    this.emit('adoption-updated', { featureId, metrics });
  }

  /**
   * Records market trend data
   */
  public recordMarketTrend(category: string, trend: MarketTrend): void {
    this.trendMonitor.recordTrend(category, trend);
    this.emit('trend-recorded', { category, trend });
  }

  /**
   * Generates capacity prediction
   */
  public async generatePrediction(
    series: string,
    horizonDays: number,
    modelId?: string
  ): Promise<CapacityPrediction> {
    const data = this.historicalData.get(series);
    if (!data || data.length < 10) {
      throw new Error('Insufficient historical data for prediction');
    }

    try {
      const config = modelId ? this.models.get(modelId) : this.getDefaultModel();
      if (!config) {
        throw new Error('No forecasting model configured');
      }

      const growthPattern = this.growthAnalyzer.analyzePattern(data);
      const featureImpact = this.calculateFeatureImpact(series, horizonDays);
      const marketImpact = this.calculateMarketImpact();

      const baseValue = data[data.length - 1].value;
      const timeHorizon = new Date(Date.now() + (horizonDays * 24 * 60 * 60 * 1000));

      const growthFactor = Math.pow(1 + growthPattern.growthRate, horizonDays / 30);
      const seasonalAdjustment = this.calculateSeasonalAdjustment(growthPattern, horizonDays);
      
      const predictedCapacity = baseValue * growthFactor * seasonalAdjustment * 
                               (1 + featureImpact) * (1 + marketImpact);

      const uncertainty = this.calculateUncertainty(growthPattern.confidence, horizonDays);
      const confidenceInterval = {
        lower: predictedCapacity * (1 - uncertainty),
        upper: predictedCapacity * (1 + uncertainty)
      };

      const contributingFactors = {
        growthTrend: (growthFactor - 1) * 100,
        featureAdoption: featureImpact * 100,
        marketTrends: marketImpact * 100,
        seasonal: (seasonalAdjustment - 1) * 100
      };

      const recommendedActions = this.generateRecommendations(
        predictedCapacity,
        confidenceInterval,
        contributingFactors
      );

      const prediction: CapacityPrediction = {
        timeHorizon,
        predictedCapacity,
        confidenceInterval,
        contributingFactors,
        recommendedActions
      };

      this.emit('prediction-generated', { series, prediction });
      return prediction;

    } catch (error) {
      this.emit('prediction-error', { series, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Calculates feature impact on capacity
   */
  private calculateFeatureImpact(series: string, horizonDays: number): number {
    let totalImpact = 0;
    
    const allFeatures = this.getAllFeatureIds();
    for (const featureId of allFeatures) {
      const impact = this.adoptionTracker.predictCapacityImpact(featureId, horizonDays);
      totalImpact += impact;
    }
    
    return Math.max(0, Math.min(1, totalImpact));
  }

  /**
   * Calculates market impact on capacity
   */
  private calculateMarketImpact(): number {
    const categories = ['technology', 'economy', 'industry', 'competition'];
    const impactScore = this.trendMonitor.getMarketImpactScore(categories);
    
    return Math.max(-0.5, Math.min(0.5, impactScore));
  }

  /**
   * Calculates seasonal adjustment factor
   */
  private calculateSeasonalAdjustment(pattern: GrowthPattern, horizonDays: number): number {
    if (!pattern.seasonalityFactor || !pattern.cycleDuration) {
      return 1;
    }

    const cyclePosition = (horizonDays % pattern.cycleDuration) / pattern.cycleDuration;
    const seasonalMultiplier = 1 + (pattern.seasonalityFactor * Math.sin(2 * Math.PI * cyclePosition));
    
    return Math.max(0.5, Math.min(2, seasonalMultiplier));
  }

  /**
   * Calculates prediction uncertainty
   */
  private calculateUncertainty(confidence: number, horizonDays: number): number {
    const baseUncertainty = 1 - confidence;
    const timeDecay = Math.sqrt(horizonDays / 30);
    
    return Math.max(0.05, Math.min(0.8, baseUncertainty * timeDecay));
  }

  /**
   * Generates actionable recommendations
   */
  private generateRecommendations(
    prediction: number,
    confidence: CapacityPrediction['confidenceInterval'],
    factors: CapacityPrediction['contributingFactors']
  ): string[] {
    const recommendations: string[] = [];

    if (factors.growthTrend > 50) {
      recommendations.push('Consider implementing auto-scaling policies for sustained growth');
    }

    if (factors.featureAdoption > 30) {
      recommendations.push('Monitor feature rollout impact and prepare additional resources');
    }

    if (factors.marketTrends > 20) {
      recommendations.push('Adjust capacity planning based on market conditions');
    }

    if (factors.seasonal > 25