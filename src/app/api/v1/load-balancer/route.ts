```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as tf from '@tensorflow/tfjs';

// Types
interface ServiceInstance {
  id: string;
  region: string;
  endpoint: string;
  healthScore: number;
  currentLoad: number;
  maxLoad: number;
  latency: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: Date;
  metadata: Record<string, any>;
}

interface LoadBalancerConfig {
  algorithm: 'weighted-round-robin' | 'least-connections' | 'ml-optimized';
  healthCheckInterval: number;
  failoverThreshold: number;
  sessionAffinity: boolean;
  regions: string[];
  weights: Record<string, number>;
}

interface TrafficMetrics {
  requestCount: number;
  responseTime: number;
  errorRate: number;
  timestamp: Date;
  region: string;
  serviceId: string;
}

interface RoutingDecision {
  selectedService: ServiceInstance;
  reason: string;
  confidence: number;
  fallbackServices: ServiceInstance[];
}

// Service Registry
class ServiceRegistry {
  private services: Map<string, ServiceInstance> = new Map();
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async registerService(service: Omit<ServiceInstance, 'id'>): Promise<string> {
    const id = `service_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const serviceInstance: ServiceInstance = { ...service, id };
    
    this.services.set(id, serviceInstance);
    
    // Store in Supabase for persistence
    await this.supabase
      .from('service_instances')
      .upsert({
        id,
        region: service.region,
        endpoint: service.endpoint,
        health_score: service.healthScore,
        current_load: service.currentLoad,
        max_load: service.maxLoad,
        latency: service.latency,
        status: service.status,
        last_health_check: service.lastHealthCheck.toISOString(),
        metadata: service.metadata
      });

    return id;
  }

  async getHealthyServices(region?: string): Promise<ServiceInstance[]> {
    let services = Array.from(this.services.values())
      .filter(s => s.status !== 'unhealthy');
    
    if (region) {
      services = services.filter(s => s.region === region);
    }
    
    return services.sort((a, b) => b.healthScore - a.healthScore);
  }

  async updateServiceHealth(serviceId: string, metrics: Partial<ServiceInstance>): Promise<void> {
    const service = this.services.get(serviceId);
    if (service) {
      Object.assign(service, metrics, { lastHealthCheck: new Date() });
      this.services.set(serviceId, service);
      
      // Update in Supabase
      await this.supabase
        .from('service_instances')
        .update({
          health_score: service.healthScore,
          current_load: service.currentLoad,
          latency: service.latency,
          status: service.status,
          last_health_check: service.lastHealthCheck.toISOString()
        })
        .eq('id', serviceId);
    }
  }
}

// Health Predictor with ML
class HealthPredictor {
  private model: tf.LayersModel | null = null;
  private isModelLoaded = false;

  async loadModel(): Promise<void> {
    if (this.isModelLoaded) return;
    
    try {
      // Create a simple neural network for health prediction
      this.model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [6], units: 32, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });

      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      this.isModelLoaded = true;
    } catch (error) {
      console.error('Failed to load ML model:', error);
    }
  }

  async predictHealth(service: ServiceInstance, recentMetrics: TrafficMetrics[]): Promise<number> {
    if (!this.model || !this.isModelLoaded) {
      await this.loadModel();
    }

    if (!this.model) {
      // Fallback to rule-based prediction
      return this.ruleBasedPrediction(service, recentMetrics);
    }

    try {
      // Prepare features: [currentLoad, latency, errorRate, responseTime, healthScore, loadRatio]
      const avgErrorRate = recentMetrics.length > 0 
        ? recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length 
        : 0;
      
      const avgResponseTime = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length
        : service.latency;

      const loadRatio = service.currentLoad / service.maxLoad;

      const features = tf.tensor2d([[
        service.currentLoad / 1000, // Normalize
        service.latency / 1000,     // Normalize
        avgErrorRate,
        avgResponseTime / 1000,     // Normalize
        service.healthScore,
        loadRatio
      ]]);

      const prediction = this.model.predict(features) as tf.Tensor;
      const healthProbability = await prediction.data();
      
      features.dispose();
      prediction.dispose();

      return healthProbability[0];
    } catch (error) {
      console.error('ML prediction failed:', error);
      return this.ruleBasedPrediction(service, recentMetrics);
    }
  }

  private ruleBasedPrediction(service: ServiceInstance, recentMetrics: TrafficMetrics[]): number {
    let score = service.healthScore;
    
    // Adjust based on load
    const loadRatio = service.currentLoad / service.maxLoad;
    if (loadRatio > 0.8) score *= 0.7;
    else if (loadRatio > 0.6) score *= 0.85;
    
    // Adjust based on latency
    if (service.latency > 1000) score *= 0.6;
    else if (service.latency > 500) score *= 0.8;
    
    // Adjust based on recent error rate
    if (recentMetrics.length > 0) {
      const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;
      if (avgErrorRate > 0.1) score *= 0.5;
      else if (avgErrorRate > 0.05) score *= 0.7;
    }
    
    return Math.max(0, Math.min(1, score));
  }
}

// Traffic Analyzer
class TrafficAnalyzer {
  private metrics: Map<string, TrafficMetrics[]> = new Map();
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async recordMetric(metric: TrafficMetrics): Promise<void> {
    const key = `${metric.region}_${metric.serviceId}`;
    const existing = this.metrics.get(key) || [];
    
    // Keep last 100 metrics
    existing.push(metric);
    if (existing.length > 100) {
      existing.shift();
    }
    
    this.metrics.set(key, existing);
    
    // Store in Supabase
    await this.supabase
      .from('traffic_metrics')
      .insert({
        request_count: metric.requestCount,
        response_time: metric.responseTime,
        error_rate: metric.errorRate,
        timestamp: metric.timestamp.toISOString(),
        region: metric.region,
        service_id: metric.serviceId
      });
  }

  getRecentMetrics(serviceId: string, region: string, minutes: number = 5): TrafficMetrics[] {
    const key = `${region}_${serviceId}`;
    const metrics = this.metrics.get(key) || [];
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    
    return metrics.filter(m => m.timestamp > cutoff);
  }

  analyzeTrafficPattern(serviceId: string, region: string): {
    trend: 'increasing' | 'decreasing' | 'stable';
    loadFactor: number;
    recommendation: string;
  } {
    const recentMetrics = this.getRecentMetrics(serviceId, region, 10);
    
    if (recentMetrics.length < 3) {
      return { trend: 'stable', loadFactor: 1, recommendation: 'insufficient_data' };
    }
    
    const recent = recentMetrics.slice(-3);
    const earlier = recentMetrics.slice(-6, -3);
    
    const recentAvg = recent.reduce((sum, m) => sum + m.requestCount, 0) / recent.length;
    const earlierAvg = earlier.length > 0 
      ? earlier.reduce((sum, m) => sum + m.requestCount, 0) / earlier.length
      : recentAvg;
    
    const changePercent = (recentAvg - earlierAvg) / (earlierAvg || 1);
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (changePercent > 0.2) trend = 'increasing';
    else if (changePercent < -0.2) trend = 'decreasing';
    
    const loadFactor = Math.max(0.1, Math.min(2, 1 + changePercent));
    
    const recommendation = trend === 'increasing' ? 'scale_up' : 
                          trend === 'decreasing' ? 'scale_down' : 'maintain';
    
    return { trend, loadFactor, recommendation };
  }
}

// Region Manager
class RegionManager {
  private regionLatencies: Map<string, number> = new Map();

  async getOptimalRegion(clientRegion?: string, availableRegions: string[] = []): Promise<string> {
    if (clientRegion && availableRegions.includes(clientRegion)) {
      return clientRegion;
    }
    
    // Simple region selection based on predefined latencies
    const regionPreferences = {
      'us-east-1': { 'us-east-1': 10, 'us-west-2': 70, 'eu-west-1': 80, 'ap-southeast-1': 150 },
      'us-west-2': { 'us-west-2': 10, 'us-east-1': 70, 'eu-west-1': 140, 'ap-southeast-1': 120 },
      'eu-west-1': { 'eu-west-1': 10, 'us-east-1': 80, 'us-west-2': 140, 'ap-southeast-1': 160 },
      'ap-southeast-1': { 'ap-southeast-1': 10, 'us-west-2': 120, 'us-east-1': 150, 'eu-west-1': 160 }
    };
    
    const client = clientRegion || 'us-east-1';
    const preferences = regionPreferences[client as keyof typeof regionPreferences] || regionPreferences['us-east-1'];
    
    let bestRegion = availableRegions[0] || 'us-east-1';
    let bestLatency = Infinity;
    
    for (const region of availableRegions) {
      const latency = preferences[region as keyof typeof preferences] || 200;
      if (latency < bestLatency) {
        bestLatency = latency;
        bestRegion = region;
      }
    }
    
    return bestRegion;
  }

  updateRegionLatency(region: string, latency: number): void {
    this.regionLatencies.set(region, latency);
  }
}

// Failover Orchestrator
class FailoverOrchestrator {
  private failoverHistory: Map<string, Date[]> = new Map();

  async checkFailoverRequired(service: ServiceInstance, healthPrediction: number): Promise<boolean> {
    const failoverThreshold = 0.3;
    return healthPrediction < failoverThreshold || service.status === 'unhealthy';
  }

  async executeFailover(
    failedService: ServiceInstance,
    alternatives: ServiceInstance[]
  ): Promise<ServiceInstance | null> {
    // Record failover
    const history = this.failoverHistory.get(failedService.id) || [];
    history.push(new Date());
    this.failoverHistory.set(failedService.id, history);
    
    // Select best alternative
    const healthyAlternatives = alternatives.filter(s => s.status === 'healthy');
    
    if (healthyAlternatives.length === 0) {
      return null;
    }
    
    // Select alternative with highest health score and lowest load
    return healthyAlternatives.sort((a, b) => {
      const aScore = a.healthScore * (1 - a.currentLoad / a.maxLoad);
      const bScore = b.healthScore * (1 - b.currentLoad / b.maxLoad);
      return bScore - aScore;
    })[0];
  }

  getFailoverCount(serviceId: string, hours: number = 1): number {
    const history = this.failoverHistory.get(serviceId) || [];
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return history.filter(date => date > cutoff).length;
  }
}

// Main Load Balancer Controller
class LoadBalancerController {
  private serviceRegistry = new ServiceRegistry();
  private healthPredictor = new HealthPredictor();
  private trafficAnalyzer = new TrafficAnalyzer();
  private regionManager = new RegionManager();
  private failoverOrchestrator = new FailoverOrchestrator();
  
  private config: LoadBalancerConfig = {
    algorithm: 'ml-optimized',
    healthCheckInterval: 30000,
    failoverThreshold: 0.3,
    sessionAffinity: true,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
    weights: {}
  };

  async selectService(
    clientRegion?: string,
    sessionId?: string,
    serviceType?: string
  ): Promise<RoutingDecision> {
    // Get optimal region
    const targetRegion = await this.regionManager.getOptimalRegion(
      clientRegion, 
      this.config.regions
    );
    
    // Get healthy services in target region
    let services = await this.serviceRegistry.getHealthyServices(targetRegion);
    
    if (services.length === 0) {
      // Fallback to any region
      services = await this.serviceRegistry.getHealthyServices();
    }
    
    if (services.length === 0) {
      throw new Error('No healthy services available');
    }
    
    let selectedService: ServiceInstance;
    let reason: string;
    let confidence: number;
    
    if (this.config.algorithm === 'ml-optimized') {
      // Use ML-based selection
      const predictions = await Promise.all(
        services.map(async service => {
          const recentMetrics = this.trafficAnalyzer.getRecentMetrics(
            service.id, 
            service.region
          );
          const healthPrediction = await this.healthPredictor.predictHealth(
            service, 
            recentMetrics
          );
          return { service, prediction: healthPrediction };
        })
      );
      
      // Sort by prediction score and select best
      predictions.sort((a, b) => b.prediction - a.prediction);
      selectedService = predictions[0].service;
      confidence = predictions[0].prediction;
      reason = 'ML-optimized selection';
      
      // Check if failover needed
      if (await this.failoverOrchestrator.checkFailoverRequired(selectedService, confidence)) {
        const alternatives = predictions.slice(1).map(p => p.service);
        const failoverService = await this.failoverOrchestrator.executeFailover(
          selectedService,
          alternatives
        );
        
        if (failoverService) {
          selectedService = failoverService;
          reason = 'Automatic failover';
          confidence = 0.8; // Moderate confidence for failover
        }
      }
    } else {
      // Fallback to weighted round-robin
      selectedService = this.weightedRoundRobin(services);
      reason = 'Weighted round-robin';
      confidence = 0.7;
    }
    
    return {
      selectedService,
      reason,
      confidence,
      fallbackServices: services.filter(s => s.id !== selectedService.id).slice(0, 2)
    };
  }

  private weightedRoundRobin(services: ServiceInstance[]): ServiceInstance {
    // Simple weighted selection based on inverse load
    const weighted = services.map(service => ({
      service,
      weight: service.healthScore * (1 - service.currentLoad / service.maxLoad)
    }));
    
    weighted.sort((a, b) => b.weight - a.weight);
    return weighted[0].service;
  }

  async recordRequest(serviceId: string, responseTime: number, success: boolean): Promise<void> {
    const service = await this.serviceRegistry.getHealthyServices();
    const targetService = service.find(s => s.id === serviceId);
    
    if (targetService) {
      await this.trafficAnalyzer.recordMetric({
        requestCount: 1,
        responseTime,
        errorRate: success ? 0 : 1,
        timestamp: new Date(),
        region: targetService.region,
        serviceId
      });
      
      // Update service load
      await this.serviceRegistry.updateServiceHealth(serviceId, {
        currentLoad: targetService.currentLoad + (success ? 1 : 0)
      });
    }
  }
}

// Initialize global instances
const loadBalancer = new LoadBalancerController();

// API Route Handlers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'select_service':
        const { clientRegion, sessionId, serviceType } = params;
        const decision = await loadBalancer.selectService(clientRegion, sessionId, serviceType);
        
        return NextResponse.json({
          success: true,
          data: {
            service: {
              id: decision.selectedService.id,
              endpoint: decision.selectedService.endpoint,
              region: decision.selectedService.region,
              healthScore: decision.selectedService.healthScore
            },
            routing: {
              reason: decision.reason,
              confidence: decision.confidence,
              fallbacks: decision.fallbackServices.map(s => ({
                id: s.id,
                endpoint: s.endpoint,
                region: s.region
              }))
            }
          }
        });

      case 'record_request':
        const { serviceId, responseTime, success } = params;
        await loadBalancer.recordRequest(serviceId, responseTime, success);
        
        return NextResponse.json({
          success: true,
          message: 'Request metrics recorded'
        });

      case 'health_check':
        // Return load balancer status
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            algorithm: 'ml-optimized',
            regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
          }
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Load balancer API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    
    // Get service status for region
    const services = region 
      ? await loadBalancer.serviceRegistry.getHealthyServices(region)
      : await loadBalancer.serviceRegistry.getHealthyServices();
    
    return NextResponse.json({
      success: true,
      data: {
        services: services.map(s => ({
          id: s.id,
          region: s.region,
          endpoint: s.endpoint,
          healthScore: s.healthScore,
          currentLoad: s.currentLoad,
          maxLoad: s.maxLoad,
          status: s.status,
          lastHealthCheck: s.lastHealthCheck
        })),
        region: region || 'all',
        totalServices: services.length,
        healthyServices: services.filter(s => s.status === 'healthy').length
      }
    });
  } catch (error) {
    console.error('Load balancer GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch service status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, healthMetrics } = body;

    if (!serviceId || !healthMetrics) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await loadBalancer.serviceRegistry.updateServiceHealth(serviceId, {
      healthScore: healthMetrics.healthScore,
      currentLoad: healthMetrics.currentLoad,
      latency: healthMetrics.latency,
      status: healthMetrics.status
    });

    return NextResponse.json({
      success: true,
      message: 'Service health updated successfully'
    });
  } catch (error) {
    console.error('Load balancer PUT error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update service health',