```typescript
/**
 * Real-Time Fraud Scoring Service
 * 
 * Advanced fraud detection service that analyzes transactions in real-time using
 * machine learning models, behavioral analytics, and global threat intelligence feeds.
 * 
 * @module RealTimeFraudScoringService
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios, { AxiosInstance } from 'axios';

/**
 * Transaction data structure for fraud analysis
 */
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  merchantId: string;
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
    country: string;
    city: string;
  };
  paymentMethod: {
    type: 'card' | 'bank' | 'crypto' | 'wallet';
    lastFour?: string;
    network?: string;
  };
  deviceInfo?: {
    deviceId: string;
    userAgent: string;
    ipAddress: string;
    fingerprint: string;
  };
  metadata?: Record<string, any>;
}

/**
 * User behavioral profile structure
 */
export interface UserBehaviorProfile {
  userId: string;
  avgTransactionAmount: number;
  avgDailyTransactions: number;
  preferredMerchants: string[];
  typicalLocations: Array<{
    country: string;
    city: string;
    frequency: number;
  }>;
  timePatterns: Array<{
    hour: number;
    frequency: number;
  }>;
  velocityMetrics: {
    maxAmountPerHour: number;
    maxTransactionsPerHour: number;
  };
  riskFactors: string[];
  lastUpdated: Date;
}

/**
 * Threat intelligence indicator
 */
export interface ThreatIndicator {
  type: 'ip' | 'email' | 'device' | 'merchant' | 'card';
  value: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  firstSeen: Date;
  lastSeen: Date;
  confidence: number;
}

/**
 * ML model prediction result
 */
export interface MLPrediction {
  modelName: string;
  modelVersion: string;
  fraudProbability: number;
  confidence: number;
  features: Record<string, number>;
  processingTimeMs: number;
}

/**
 * Behavioral anomaly detection result
 */
export interface BehavioralAnomaly {
  type: 'amount' | 'frequency' | 'location' | 'time' | 'merchant' | 'device';
  severity: number; // 0-1 scale
  description: string;
  expectedValue: number;
  actualValue: number;
  deviationScore: number;
}

/**
 * Comprehensive fraud score result
 */
export interface FraudScoreResult {
  transactionId: string;
  overallScore: number; // 0-1000 scale
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  decision: 'approve' | 'review' | 'decline';
  confidence: number;
  components: {
    mlScore: number;
    behavioralScore: number;
    threatIntelScore: number;
    velocityScore: number;
  };
  mlPredictions: MLPrediction[];
  behavioralAnomalies: BehavioralAnomaly[];
  threatIndicators: ThreatIndicator[];
  processingTimeMs: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

/**
 * Fraud scoring configuration
 */
export interface FraudScoringConfig {
  database: {
    supabaseUrl: string;
    supabaseKey: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    keyPrefix: string;
  };
  mlModels: {
    endpoints: Array<{
      name: string;
      url: string;
      version: string;
      weight: number;
    }>;
    timeoutMs: number;
    retryAttempts: number;
  };
  threatIntelligence: {
    apis: Array<{
      name: string;
      url: string;
      apiKey: string;
      rateLimit: number;
    }>;
    cacheTtlSeconds: number;
  };
  scoring: {
    thresholds: {
      lowRisk: number;
      mediumRisk: number;
      highRisk: number;
    };
    weights: {
      mlScore: number;
      behavioralScore: number;
      threatIntelScore: number;
      velocityScore: number;
    };
  };
  performance: {
    maxProcessingTimeMs: number;
    modelCacheSize: number;
    behaviorCacheTtlSeconds: number;
  };
}

/**
 * ML Model Manager for loading and managing fraud detection models
 */
export class MLModelManager {
  private models: Map<string, any> = new Map();
  private modelCache: Redis;
  private httpClient: AxiosInstance;

  constructor(
    private config: FraudScoringConfig['mlModels'],
    redisClient: Redis
  ) {
    this.modelCache = redisClient;
    this.httpClient = axios.create({
      timeout: config.timeoutMs,
    });
  }

  /**
   * Initialize and warm up ML models
   */
  async initialize(): Promise<void> {
    for (const endpoint of this.config.endpoints) {
      try {
        await this.loadModel(endpoint.name, endpoint);
      } catch (error) {
        console.error(`Failed to load model ${endpoint.name}:`, error);
      }
    }
  }

  /**
   * Load a specific ML model
   */
  private async loadModel(name: string, endpoint: any): Promise<void> {
    const cacheKey = `model:${name}:${endpoint.version}`;
    
    // Check if model is cached
    const cached = await this.modelCache.get(cacheKey);
    if (cached) {
      this.models.set(name, { ...endpoint, cached: true });
      return;
    }

    // Load model metadata
    const response = await this.httpClient.get(`${endpoint.url}/metadata`);
    const modelInfo = {
      ...endpoint,
      metadata: response.data,
      loadedAt: new Date(),
    };

    this.models.set(name, modelInfo);
    await this.modelCache.setex(cacheKey, 3600, JSON.stringify(modelInfo));
  }

  /**
   * Get prediction from ML model
   */
  async predict(modelName: string, features: Record<string, number>): Promise<MLPrediction> {
    const startTime = Date.now();
    const model = this.models.get(modelName);
    
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    try {
      const response = await this.httpClient.post(`${model.url}/predict`, {
        instances: [features],
      });

      const prediction = response.data.predictions[0];
      
      return {
        modelName,
        modelVersion: model.version,
        fraudProbability: prediction.fraud_probability,
        confidence: prediction.confidence,
        features,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`ML prediction failed for model ${modelName}:`, error);
      throw new Error(`ML prediction failed: ${error.message}`);
    }
  }

  /**
   * Get predictions from all available models
   */
  async predictAll(features: Record<string, number>): Promise<MLPrediction[]> {
    const predictions = await Promise.allSettled(
      Array.from(this.models.keys()).map(modelName =>
        this.predict(modelName, features)
      )
    );

    return predictions
      .filter((result): result is PromiseFulfilledResult<MLPrediction> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }
}

/**
 * Behavioral Analytics Engine for detecting user behavior anomalies
 */
export class BehavioralAnalytics {
  private profileCache: Redis;
  private supabase: SupabaseClient;

  constructor(
    redisClient: Redis,
    supabaseClient: SupabaseClient,
    private config: FraudScoringConfig['performance']
  ) {
    this.profileCache = redisClient;
    this.supabase = supabaseClient;
  }

  /**
   * Get user behavioral profile
   */
  async getUserProfile(userId: string): Promise<UserBehaviorProfile | null> {
    const cacheKey = `behavior:${userId}`;
    
    // Check cache first
    const cached = await this.profileCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('user_behavior_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    const profile: UserBehaviorProfile = {
      userId: data.user_id,
      avgTransactionAmount: data.avg_transaction_amount,
      avgDailyTransactions: data.avg_daily_transactions,
      preferredMerchants: data.preferred_merchants,
      typicalLocations: data.typical_locations,
      timePatterns: data.time_patterns,
      velocityMetrics: data.velocity_metrics,
      riskFactors: data.risk_factors,
      lastUpdated: new Date(data.last_updated),
    };

    // Cache the profile
    await this.profileCache.setex(
      cacheKey, 
      this.config.behaviorCacheTtlSeconds, 
      JSON.stringify(profile)
    );

    return profile;
  }

  /**
   * Analyze transaction for behavioral anomalies
   */
  async analyzeTransaction(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];

    // Amount anomaly detection
    const amountAnomaly = this.detectAmountAnomaly(transaction, profile);
    if (amountAnomaly) anomalies.push(amountAnomaly);

    // Location anomaly detection
    if (transaction.location) {
      const locationAnomaly = this.detectLocationAnomaly(transaction, profile);
      if (locationAnomaly) anomalies.push(locationAnomaly);
    }

    // Time pattern anomaly detection
    const timeAnomaly = this.detectTimeAnomaly(transaction, profile);
    if (timeAnomaly) anomalies.push(timeAnomaly);

    // Merchant anomaly detection
    const merchantAnomaly = this.detectMerchantAnomaly(transaction, profile);
    if (merchantAnomaly) anomalies.push(merchantAnomaly);

    // Velocity anomalies
    const velocityAnomalies = await this.detectVelocityAnomalies(transaction, profile);
    anomalies.push(...velocityAnomalies);

    return anomalies;
  }

  /**
   * Detect amount-based anomalies
   */
  private detectAmountAnomaly(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): BehavioralAnomaly | null {
    const expectedAmount = profile.avgTransactionAmount;
    const actualAmount = transaction.amount;
    const deviationRatio = Math.abs(actualAmount - expectedAmount) / expectedAmount;

    if (deviationRatio > 3) { // 3x deviation threshold
      return {
        type: 'amount',
        severity: Math.min(deviationRatio / 10, 1),
        description: `Transaction amount significantly deviates from user's typical spending`,
        expectedValue: expectedAmount,
        actualValue: actualAmount,
        deviationScore: deviationRatio,
      };
    }

    return null;
  }

  /**
   * Detect location-based anomalies
   */
  private detectLocationAnomaly(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): BehavioralAnomaly | null {
    const location = transaction.location!;
    const isTypicalLocation = profile.typicalLocations.some(
      loc => loc.country === location.country && loc.city === location.city
    );

    if (!isTypicalLocation) {
      return {
        type: 'location',
        severity: 0.7,
        description: `Transaction from unusual location: ${location.city}, ${location.country}`,
        expectedValue: 1,
        actualValue: 0,
        deviationScore: 1,
      };
    }

    return null;
  }

  /**
   * Detect time pattern anomalies
   */
  private detectTimeAnomaly(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): BehavioralAnomaly | null {
    const hour = transaction.timestamp.getHours();
    const timePattern = profile.timePatterns.find(p => p.hour === hour);
    
    if (!timePattern || timePattern.frequency < 0.1) {
      return {
        type: 'time',
        severity: 0.5,
        description: `Transaction at unusual time: ${hour}:00`,
        expectedValue: timePattern?.frequency || 0,
        actualValue: 1,
        deviationScore: 1 - (timePattern?.frequency || 0),
      };
    }

    return null;
  }

  /**
   * Detect merchant anomalies
   */
  private detectMerchantAnomaly(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): BehavioralAnomaly | null {
    const isPreferredMerchant = profile.preferredMerchants.includes(transaction.merchantId);
    
    if (!isPreferredMerchant && profile.preferredMerchants.length > 5) {
      return {
        type: 'merchant',
        severity: 0.4,
        description: `Transaction with new/unusual merchant`,
        expectedValue: 1,
        actualValue: 0,
        deviationScore: 0.6,
      };
    }

    return null;
  }

  /**
   * Detect velocity-based anomalies
   */
  private async detectVelocityAnomalies(
    transaction: Transaction,
    profile: UserBehaviorProfile
  ): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent transactions
    const { data: recentTransactions } = await this.supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('user_id', transaction.userId)
      .gte('created_at', oneHourAgo.toISOString())
      .order('created_at', { ascending: false });

    if (recentTransactions) {
      const totalAmount = recentTransactions.reduce((sum, tx) => sum + tx.amount, 0) + transaction.amount;
      const transactionCount = recentTransactions.length + 1;

      // Check amount velocity
      if (totalAmount > profile.velocityMetrics.maxAmountPerHour) {
        anomalies.push({
          type: 'frequency',
          severity: Math.min(totalAmount / profile.velocityMetrics.maxAmountPerHour - 1, 1),
          description: `High transaction volume in past hour: $${totalAmount}`,
          expectedValue: profile.velocityMetrics.maxAmountPerHour,
          actualValue: totalAmount,
          deviationScore: totalAmount / profile.velocityMetrics.maxAmountPerHour,
        });
      }

      // Check transaction frequency
      if (transactionCount > profile.velocityMetrics.maxTransactionsPerHour) {
        anomalies.push({
          type: 'frequency',
          severity: Math.min(transactionCount / profile.velocityMetrics.maxTransactionsPerHour - 1, 1),
          description: `High transaction frequency: ${transactionCount} transactions in past hour`,
          expectedValue: profile.velocityMetrics.maxTransactionsPerHour,
          actualValue: transactionCount,
          deviationScore: transactionCount / profile.velocityMetrics.maxTransactionsPerHour,
        });
      }
    }

    return anomalies;
  }
}

/**
 * Threat Intelligence Client for external threat data
 */
export class ThreatIntelligenceClient {
  private threatCache: Redis;
  private httpClients: Map<string, AxiosInstance> = new Map();

  constructor(
    private config: FraudScoringConfig['threatIntelligence'],
    redisClient: Redis
  ) {
    this.threatCache = redisClient;
    this.initializeClients();
  }

  /**
   * Initialize HTTP clients for threat intelligence APIs
   */
  private initializeClients(): void {
    this.config.apis.forEach(api => {
      const client = axios.create({
        baseURL: api.url,
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${api.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      this.httpClients.set(api.name, client);
    });
  }

  /**
   * Check transaction against threat intelligence feeds
   */
  async checkTransaction(transaction: Transaction): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];
    const checksToPerform: Array<Promise<ThreatIndicator[]>> = [];

    // Check IP address
    if (transaction.deviceInfo?.ipAddress) {
      checksToPerform.push(this.checkIP(transaction.deviceInfo.ipAddress));
    }

    // Check device fingerprint
    if (transaction.deviceInfo?.fingerprint) {
      checksToPerform.push(this.checkDevice(transaction.deviceInfo.fingerprint));
    }

    // Check merchant
    checksToPerform.push(this.checkMerchant(transaction.merchantId));

    // Execute all checks in parallel
    const results = await Promise.allSettled(checksToPerform);
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        indicators.push(...result.value);
      }
    });

    return indicators;
  }

  /**
   * Check IP address against threat feeds
   */
  private async checkIP(ipAddress: string): Promise<ThreatIndicator[]> {
    const cacheKey = `threat:ip:${ipAddress}`;
    
    // Check cache first
    const cached = await this.threatCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const indicators: ThreatIndicator[] = [];

    for (const [name, client] of this.httpClients) {
      try {
        const response = await client.get(`/ip/${ipAddress}`);
        
        if (response.data.malicious) {
          indicators.push({
            type: 'ip',
            value: ipAddress,
            severity: this.mapSeverity(response.data.risk_score),
            source: name,
            description: response.data.description || 'Malicious IP detected',
            firstSeen: new Date(response.data.first_seen),
            lastSeen: new Date(response.data.last_seen),
            confidence: response.data.confidence || 0.8,
          });
        }
      } catch (error) {
        console.error(`Threat check failed for IP ${ipAddress} on ${name}:`, error);
      }
    }

    // Cache results
    await this.threatCache.setex(
      cacheKey,
      this.config.cacheTtlSeconds,
      JSON.stringify(indicators)
    );

    return indicators;
  }

  /**
   * Check device fingerprint against threat feeds
   */
  private async checkDevice(fingerprint: string): Promise<ThreatIndicator[]> {
    const cacheKey = `threat:device:${fingerprint}`;
    
    const cached = await this.threatCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Implement device fingerprint checking logic
    const indicators: ThreatIndicator[] = [];
    
    // Cache empty results to avoid repeated lookups
    await this.threatCache.setex(
      cacheKey,
      this.config.cacheTtlSeconds,
      JSON.stringify(indicators)
    );

    return indicators;
  }

  /**
   * Check merchant against threat feeds
   */
  private async checkMerchant(merchantId: string): Promise<ThreatIndicator[]> {
    const cacheKey = `threat:merchant:${merchantId}`;
    
    const cached = await this.threatCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const indicators: ThreatIndicator[] = [];
    
    // Cache results
    await this.threatCache.setex(
      cacheKey,
      this.config.cacheTtlSeconds,
      JSON.stringify(indicators)
    );

    return indicators;
  }

  /**
   * Map threat intelligence risk score to severity
   */
  private mapSeverity(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.4) return 'medium';
    return 'low';
  }
}

/**
 * Risk Score Calculator for combining multiple risk signals
 */
export class RiskScoreCalculator {
  constructor(private config: FraudScoringConfig['scoring']) {}

  /**
   * Calculate comprehensive fraud score
   */
  calculateScore(
    mlPredictions: MLPrediction[],
    behavioralAnomalies: BehavioralAnomaly[],
    threatIndicators: ThreatIndicator[]
  ): {
    overallScore: number;
    components: {
      mlScore: number;
      behavioralScore: number;
      threatIntelScore: number;
      velocityScore: number;
    };
  } {
    const components = {
      mlScore: this.calculateMLScore(mlPredictions),
      behavioralScore: this.calculateBehavioralScore(behavioralAnomalies),
      threatIntelScore: this.calculateThreatScore(threatIndicators),
      velocityScore: this.calculateVelocityScore(behavioralAnomalies),
    };

    const overallScore = 
      components.mlScore * this.config.weights.mlScore +
      components.behavioralScore * this.config.weights.behavioralScore +
      components.threatIntelScore