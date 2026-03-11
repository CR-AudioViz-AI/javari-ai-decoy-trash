```typescript
/**
 * CR AudioViz AI - Intelligent Container Scaling Service
 * 
 * This service provides intelligent container scaling capabilities with:
 * - Real-time metrics collection and analysis
 * - Predictive scaling based on historical data
 * - Cost optimization algorithms
 * - Support for Kubernetes and Docker environments
 * - Horizontal and vertical scaling strategies
 * 
 * @fileoverview Main service entry point for container scaling microservice
 * @version 1.0.0
 * @author CR AudioViz AI Engineering Team
 */

import { Server } from 'http';
import express, { Express, Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promisify } from 'util';
import { EventEmitter } from 'events';

/**
 * Core scaling engine interfaces and types
 */
interface ResourceMetrics {
  containerId: string;
  containerName: string;
  namespace?: string;
  timestamp: Date;
  cpu: {
    usage: number; // CPU usage percentage (0-100)
    cores: number; // Number of CPU cores allocated
    throttling: number; // CPU throttling events
  };
  memory: {
    usage: number; // Memory usage in MB
    limit: number; // Memory limit in MB
    utilization: number; // Memory utilization percentage
  };
  network: {
    rxBytes: number; // Received bytes
    txBytes: number; // Transmitted bytes
    connections: number; // Active connections
  };
  disk: {
    usage: number; // Disk usage in MB
    iops: number; // I/O operations per second
  };
  replicas?: number; // Current replica count (for horizontal scaling)
}

interface ScalingPolicy {
  id: string;
  name: string;
  enabled: boolean;
  containerSelector: {
    namespace?: string;
    labels?: Record<string, string>;
    name?: string;
  };
  scalingRules: {
    horizontal: {
      enabled: boolean;
      minReplicas: number;
      maxReplicas: number;
      targetCpuUtilization: number;
      targetMemoryUtilization: number;
      scaleUpCooldown: number; // seconds
      scaleDownCooldown: number; // seconds
    };
    vertical: {
      enabled: boolean;
      minCpu: number; // CPU cores
      maxCpu: number;
      minMemory: number; // MB
      maxMemory: number;
      targetUtilization: number;
    };
  };
  predictive: {
    enabled: boolean;
    lookAheadMinutes: number;
    confidenceThreshold: number;
    seasonalPatterns: boolean;
  };
  costOptimization: {
    enabled: boolean;
    maxCostPerHour: number;
    preferSpotInstances: boolean;
    consolidationEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface ScalingDecision {
  containerId: string;
  action: 'scale_up' | 'scale_down' | 'scale_out' | 'scale_in' | 'no_action';
  type: 'horizontal' | 'vertical';
  currentResources: {
    replicas?: number;
    cpu?: number;
    memory?: number;
  };
  targetResources: {
    replicas?: number;
    cpu?: number;
    memory?: number;
  };
  confidence: number;
  costImpact: number;
  reason: string;
  predictedDemand?: number;
  timestamp: Date;
}

interface PredictionModel {
  predict(metrics: ResourceMetrics[], timeHorizon: number): Promise<number>;
  train(historicalData: ResourceMetrics[]): Promise<void>;
  getConfidence(): number;
}

/**
 * Metrics collector for gathering container resource data
 */
class MetricsCollector extends EventEmitter {
  private collectors: Map<string, NodeJS.Timeout> = new Map();
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    super();
    this.supabase = supabase;
  }

  /**
   * Start collecting metrics for specified containers
   */
  async startCollection(containers: string[], intervalMs: number = 30000): Promise<void> {
    for (const containerId of containers) {
      if (this.collectors.has(containerId)) {
        continue;
      }

      const interval = setInterval(async () => {
        try {
          const metrics = await this.collectContainerMetrics(containerId);
          if (metrics) {
            await this.storeMetrics(metrics);
            this.emit('metrics', metrics);
          }
        } catch (error) {
          this.emit('error', new Error(`Failed to collect metrics for ${containerId}: ${error}`));
        }
      }, intervalMs);

      this.collectors.set(containerId, interval);
    }
  }

  /**
   * Stop collecting metrics for specified containers
   */
  stopCollection(containerIds?: string[]): void {
    const idsToStop = containerIds || Array.from(this.collectors.keys());
    
    for (const containerId of idsToStop) {
      const interval = this.collectors.get(containerId);
      if (interval) {
        clearInterval(interval);
        this.collectors.delete(containerId);
      }
    }
  }

  /**
   * Collect metrics for a specific container
   */
  private async collectContainerMetrics(containerId: string): Promise<ResourceMetrics | null> {
    try {
      // Simulate metrics collection - in production, this would interface with
      // container runtime APIs (Docker, Kubernetes, etc.)
      const baseUsage = Math.random() * 100;
      const timestamp = new Date();

      return {
        containerId,
        containerName: `container-${containerId.substring(0, 8)}`,
        timestamp,
        cpu: {
          usage: Math.max(0, Math.min(100, baseUsage + (Math.random() - 0.5) * 20)),
          cores: 2,
          throttling: Math.floor(Math.random() * 10)
        },
        memory: {
          usage: Math.max(0, baseUsage * 20 + (Math.random() - 0.5) * 200),
          limit: 2048,
          utilization: Math.max(0, Math.min(100, baseUsage + (Math.random() - 0.5) * 15))
        },
        network: {
          rxBytes: Math.floor(Math.random() * 1000000),
          txBytes: Math.floor(Math.random() * 1000000),
          connections: Math.floor(Math.random() * 100)
        },
        disk: {
          usage: Math.floor(Math.random() * 1000),
          iops: Math.floor(Math.random() * 1000)
        },
        replicas: Math.floor(Math.random() * 5) + 1
      };
    } catch (error) {
      throw new Error(`Metrics collection failed: ${error}`);
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(metrics: ResourceMetrics): Promise<void> {
    const { error } = await this.supabase
      .from('container_metrics')
      .insert({
        container_id: metrics.containerId,
        container_name: metrics.containerName,
        namespace: metrics.namespace,
        timestamp: metrics.timestamp.toISOString(),
        cpu_usage: metrics.cpu.usage,
        cpu_cores: metrics.cpu.cores,
        cpu_throttling: metrics.cpu.throttling,
        memory_usage: metrics.memory.usage,
        memory_limit: metrics.memory.limit,
        memory_utilization: metrics.memory.utilization,
        network_rx: metrics.network.rxBytes,
        network_tx: metrics.network.txBytes,
        network_connections: metrics.network.connections,
        disk_usage: metrics.disk.usage,
        disk_iops: metrics.disk.iops,
        replicas: metrics.replicas
      });

    if (error) {
      throw new Error(`Failed to store metrics: ${error.message}`);
    }
  }
}

/**
 * Predictive analyzer for forecasting resource demand
 */
class PredictiveAnalyzer implements PredictionModel {
  private supabase: SupabaseClient;
  private models: Map<string, any> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Predict resource demand for the specified time horizon
   */
  async predict(metrics: ResourceMetrics[], timeHorizon: number): Promise<number> {
    if (metrics.length === 0) {
      return 0;
    }

    // Simple linear regression prediction (in production, use ML models)
    const recentMetrics = metrics.slice(-10);
    const cpuTrend = this.calculateTrend(recentMetrics.map(m => m.cpu.usage));
    const memoryTrend = this.calculateTrend(recentMetrics.map(m => m.memory.utilization));
    
    const avgCpu = recentMetrics.reduce((sum, m) => sum + m.cpu.usage, 0) / recentMetrics.length;
    const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memory.utilization, 0) / recentMetrics.length;
    
    // Predict future utilization
    const predictedCpu = avgCpu + (cpuTrend * timeHorizon / 60); // timeHorizon in minutes
    const predictedMemory = avgMemory + (memoryTrend * timeHorizon / 60);
    
    return Math.max(predictedCpu, predictedMemory);
  }

  /**
   * Train the prediction model with historical data
   */
  async train(historicalData: ResourceMetrics[]): Promise<void> {
    // In production, implement actual ML model training
    console.log(`Training model with ${historicalData.length} data points`);
  }

  /**
   * Get prediction confidence score
   */
  getConfidence(): number {
    return 0.85; // Fixed confidence for demo
  }

  /**
   * Calculate trend from time series data
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + val * idx, 0);
    const sumX2 = values.reduce((sum, _, idx) => sum + idx * idx, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }
}

/**
 * Cost optimizer for resource allocation decisions
 */
class CostOptimizer {
  private costRates: Record<string, number> = {
    cpu: 0.05, // $ per CPU hour
    memory: 0.01, // $ per GB hour
    storage: 0.001, // $ per GB hour
  };

  /**
   * Calculate cost impact of scaling decision
   */
  calculateCostImpact(decision: ScalingDecision): number {
    const currentCost = this.calculateResourceCost(decision.currentResources);
    const targetCost = this.calculateResourceCost(decision.targetResources);
    return targetCost - currentCost;
  }

  /**
   * Optimize scaling decision for cost efficiency
   */
  optimizeDecision(
    decision: ScalingDecision,
    policy: ScalingPolicy,
    currentMetrics: ResourceMetrics
  ): ScalingDecision {
    if (!policy.costOptimization.enabled) {
      return decision;
    }

    const costImpact = this.calculateCostImpact(decision);
    const maxCostPerHour = policy.costOptimization.maxCostPerHour;

    if (costImpact > maxCostPerHour) {
      // Reduce scaling to stay within cost limits
      return {
        ...decision,
        action: 'no_action',
        reason: `Scaling cancelled due to cost constraints (${costImpact.toFixed(2)}$/h exceeds limit ${maxCostPerHour}$/h)`,
        costImpact: 0
      };
    }

    return {
      ...decision,
      costImpact
    };
  }

  /**
   * Calculate resource cost per hour
   */
  private calculateResourceCost(resources: any): number {
    let cost = 0;
    
    if (resources.cpu) {
      cost += resources.cpu * this.costRates.cpu;
    }
    
    if (resources.memory) {
      cost += (resources.memory / 1024) * this.costRates.memory; // Convert MB to GB
    }
    
    if (resources.replicas && resources.replicas > 1) {
      cost *= resources.replicas;
    }
    
    return cost;
  }
}

/**
 * Main scaling engine that orchestrates all scaling decisions
 */
class ScalingEngine extends EventEmitter {
  private supabase: SupabaseClient;
  private metricsCollector: MetricsCollector;
  private predictiveAnalyzer: PredictiveAnalyzer;
  private costOptimizer: CostOptimizer;
  private activePolicies: Map<string, ScalingPolicy> = new Map();
  private scalingDecisions: Map<string, Date> = new Map();

  constructor(supabase: SupabaseClient) {
    super();
    this.supabase = supabase;
    this.metricsCollector = new MetricsCollector(supabase);
    this.predictiveAnalyzer = new PredictiveAnalyzer(supabase);
    this.costOptimizer = new CostOptimizer();

    this.setupEventHandlers();
  }

  /**
   * Initialize the scaling engine
   */
  async initialize(): Promise<void> {
    await this.loadScalingPolicies();
    this.startScalingLoop();
  }

  /**
   * Load scaling policies from database
   */
  private async loadScalingPolicies(): Promise<void> {
    const { data: policies, error } = await this.supabase
      .from('scaling_policies')
      .select('*')
      .eq('enabled', true);

    if (error) {
      throw new Error(`Failed to load scaling policies: ${error.message}`);
    }

    for (const policyData of policies || []) {
      const policy: ScalingPolicy = {
        id: policyData.id,
        name: policyData.name,
        enabled: policyData.enabled,
        containerSelector: policyData.container_selector,
        scalingRules: policyData.scaling_rules,
        predictive: policyData.predictive,
        costOptimization: policyData.cost_optimization,
        createdAt: new Date(policyData.created_at),
        updatedAt: new Date(policyData.updated_at)
      };

      this.activePolicies.set(policy.id, policy);
    }
  }

  /**
   * Start the main scaling loop
   */
  private startScalingLoop(): void {
    setInterval(async () => {
      try {
        await this.processScalingDecisions();
      } catch (error) {
        this.emit('error', error);
      }
    }, 60000); // Run every minute
  }

  /**
   * Process scaling decisions for all active policies
   */
  private async processScalingDecisions(): Promise<void> {
    for (const [policyId, policy] of this.activePolicies) {
      try {
        const containers = await this.getContainersForPolicy(policy);
        
        for (const containerId of containers) {
          const decision = await this.makeScalingDecision(containerId, policy);
          
          if (decision && decision.action !== 'no_action') {
            await this.executeScalingDecision(decision, policy);
            await this.recordScalingEvent(decision, policy);
          }
        }
      } catch (error) {
        this.emit('error', new Error(`Policy ${policyId} processing failed: ${error}`));
      }
    }
  }

  /**
   * Make scaling decision for a container
   */
  private async makeScalingDecision(
    containerId: string,
    policy: ScalingPolicy
  ): Promise<ScalingDecision | null> {
    // Get recent metrics
    const { data: metricsData, error } = await this.supabase
      .from('container_metrics')
      .select('*')
      .eq('container_id', containerId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error || !metricsData || metricsData.length === 0) {
      return null;
    }

    const metrics: ResourceMetrics[] = metricsData.map(m => ({
      containerId: m.container_id,
      containerName: m.container_name,
      namespace: m.namespace,
      timestamp: new Date(m.timestamp),
      cpu: {
        usage: m.cpu_usage,
        cores: m.cpu_cores,
        throttling: m.cpu_throttling
      },
      memory: {
        usage: m.memory_usage,
        limit: m.memory_limit,
        utilization: m.memory_utilization
      },
      network: {
        rxBytes: m.network_rx,
        txBytes: m.network_tx,
        connections: m.network_connections
      },
      disk: {
        usage: m.disk_usage,
        iops: m.disk_iops
      },
      replicas: m.replicas
    }));

    const latestMetrics = metrics[0];
    let decision: ScalingDecision = {
      containerId,
      action: 'no_action',
      type: 'horizontal',
      currentResources: {
        replicas: latestMetrics.replicas,
        cpu: latestMetrics.cpu.cores,
        memory: latestMetrics.memory.limit
      },
      targetResources: {},
      confidence: 0,
      costImpact: 0,
      reason: 'No scaling needed',
      timestamp: new Date()
    };

    // Check cooldown period
    const lastScaling = this.scalingDecisions.get(containerId);
    if (lastScaling && Date.now() - lastScaling.getTime() < 300000) { // 5 min cooldown
      return decision;
    }

    // Horizontal scaling analysis
    if (policy.scalingRules.horizontal.enabled) {
      const horizontalDecision = await this.analyzeHorizontalScaling(metrics, policy);
      if (horizontalDecision.action !== 'no_action') {
        decision = horizontalDecision;
      }
    }

    // Vertical scaling analysis
    if (policy.scalingRules.vertical.enabled && decision.action === 'no_action') {
      const verticalDecision = await this.analyzeVerticalScaling(metrics, policy);
      if (verticalDecision.action !== 'no_action') {
        decision = verticalDecision;
      }
    }

    // Apply predictive analysis if enabled
    if (policy.predictive.enabled && decision.action !== 'no_action') {
      const predictedDemand = await this.predictiveAnalyzer.predict(
        metrics,
        policy.predictive.lookAheadMinutes
      );
      decision.predictedDemand = predictedDemand;
      decision.confidence = this.predictiveAnalyzer.getConfidence();
      
      if (decision.confidence < policy.predictive.confidenceThreshold) {
        decision.action = 'no_action';
        decision.reason = 'Low prediction confidence';
      }
    }

    // Apply cost optimization
    decision = this.costOptimizer.optimizeDecision(decision, policy, latestMetrics);

    return decision;
  }

  /**
   * Analyze horizontal scaling requirements
   */
  private async analyzeHorizontalScaling(
    metrics: ResourceMetrics[],
    policy: ScalingPolicy
  ): Promise<ScalingDecision> {
    const latestMetrics = metrics[0];
    const rules = policy.scalingRules.horizontal;
    
    const avgCpu = metrics.slice(0, 3).reduce((sum, m) => sum + m.cpu.usage, 0) / 3;
    const avgMemory = metrics.slice(0, 3).reduce((sum, m) => sum + m.memory.utilization, 0) / 3;
    
    let decision: ScalingDecision = {
      containerId: latestMetrics.containerId,
      action: 'no_action',
      type: 'horizontal',
      currentResources: { replicas: latestMetrics.replicas },
      targetResources: {},
      confidence: 1.0,
      costImpact: 0,
      reason: 'Within scaling thresholds',
      timestamp: new Date()
    };

    // Scale out if high utilization
    if ((avgCpu > rules.targetCpuUtilization || avgMemory > rules.targetMemoryUtilization) &&
        latestMetrics.replicas! < rules.maxReplicas) {
      const targetReplicas = Math.min(rules.maxReplicas, latestMetrics.replicas! + 1);
      decision = {
        ...decision,
        action: 'scale_out',
        targetResources: { replicas: targetReplicas },
        reason: `High utilization: CPU ${avgCpu.toFixed(1)}%, Memory ${avgMemory.toFixed(1)}%`
      };
    }
    // Scale in if low utilization
    else if (avgCpu < rules.targetCpuUtilization * 0.5 && avgMemory < rules.targetMemoryUtilization * 0.5 &&
             latestMetrics.replicas! > rules.minReplicas) {
      const targetReplicas = Math.max(rules.minReplicas, latestMetrics.replicas! - 1);
      decision = {
        ...decision,
        action: 'scale_in',
        targetResources: { replicas: targetReplicas },
        reason: `Low utilization: CPU ${avgCpu.toFixed(1)}%, Memory ${avgMemory.toFixed(1)}%`
      };
    }

    return decision;
  }

  /**
   * Analyze vertical scaling requirements
   */
  private async analyzeVerticalScaling(
    metrics: ResourceMetrics[],
    policy: ScalingPolicy
  ): Promise<ScalingDecision> {
    const latestMetrics = metrics[0];
    const rules = policy.scalingRules.vertical;
    
    const avgUtilization = metrics.slice(0, 3).reduce((sum, m) => 
      sum + Math.max(m.cpu.usage, m.memory.utilization), 0) / 3;
    
    let decision: ScalingDecision = {
      containerId: latestMetrics.containerId,
      action