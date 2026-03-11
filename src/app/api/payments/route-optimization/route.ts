```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

// Types
interface PaymentRouteRequest {
  amount: number;
  currency: string;
  region: string;
  priority: 'cost' | 'speed' | 'balanced';
  merchantId: string;
  paymentMethod: string;
}

interface PaymentRoute {
  id: string;
  name: string;
  processor: string;
  region: string;
  supported_currencies: string[];
  base_fee: number;
  percentage_fee: number;
  processing_time_ms: number;
  success_rate: number;
  is_active: boolean;
  regional_compliance: boolean;
  circuit_breaker_status: 'closed' | 'open' | 'half-open';
  last_failure_time: string | null;
  consecutive_failures: number;
}

interface RoutePerformance {
  route_id: string;
  success_count: number;
  failure_count: number;
  avg_processing_time: number;
  last_updated: string;
}

interface RouteScore {
  routeId: string;
  score: number;
  breakdown: {
    cost: number;
    speed: number;
    reliability: number;
    compliance: number;
  };
}

// Route Optimization Engine
class RouteOptimizationEngine {
  private supabase;
  private redis;

  constructor(supabase: any, redis: Redis) {
    this.supabase = supabase;
    this.redis = redis;
  }

  async optimizeRoute(request: PaymentRouteRequest): Promise<{
    primaryRoute: PaymentRoute;
    fallbackRoutes: PaymentRoute[];
    reasoning: string;
  }> {
    // Get available routes
    const availableRoutes = await this.getAvailableRoutes(request);
    
    // Score routes based on criteria
    const scoredRoutes = await this.scoreRoutes(availableRoutes, request);
    
    // Select primary and fallback routes
    const sortedRoutes = scoredRoutes.sort((a, b) => b.score - a.score);
    
    return {
      primaryRoute: availableRoutes.find(r => r.id === sortedRoutes[0].routeId)!,
      fallbackRoutes: sortedRoutes.slice(1, 4).map(sr => 
        availableRoutes.find(r => r.id === sr.routeId)!
      ).filter(Boolean),
      reasoning: this.generateReasoning(sortedRoutes[0], request.priority)
    };
  }

  private async getAvailableRoutes(request: PaymentRouteRequest): Promise<PaymentRoute[]> {
    const cacheKey = `routes:${request.region}:${request.currency}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const { data: routes, error } = await this.supabase
      .from('payment_routes')
      .select('*')
      .eq('is_active', true)
      .contains('supported_currencies', [request.currency])
      .eq('region', request.region)
      .neq('circuit_breaker_status', 'open');

    if (error) throw error;

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(routes));
    
    return routes;
  }

  private async scoreRoutes(routes: PaymentRoute[], request: PaymentRouteRequest): Promise<RouteScore[]> {
    const scores: RouteScore[] = [];
    
    for (const route of routes) {
      const performance = await this.getRoutePerformance(route.id);
      const score = this.calculateRouteScore(route, performance, request);
      scores.push(score);
    }
    
    return scores;
  }

  private async getRoutePerformance(routeId: string): Promise<RoutePerformance | null> {
    const cacheKey = `performance:${routeId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const { data, error } = await this.supabase
      .from('route_performance')
      .select('*')
      .eq('route_id', routeId)
      .single();

    if (!error && data) {
      await this.redis.setex(cacheKey, 60, JSON.stringify(data));
      return data;
    }
    
    return null;
  }

  private calculateRouteScore(
    route: PaymentRoute, 
    performance: RoutePerformance | null, 
    request: PaymentRouteRequest
  ): RouteScore {
    const weights = this.getPriorityWeights(request.priority);
    
    // Cost score (lower cost = higher score)
    const totalCost = route.base_fee + (request.amount * route.percentage_fee / 100);
    const costScore = Math.max(0, 100 - (totalCost / request.amount) * 1000);
    
    // Speed score (lower time = higher score)
    const speedScore = Math.max(0, 100 - (route.processing_time_ms / 10000) * 100);
    
    // Reliability score
    const successRate = performance ? 
      (performance.success_count / (performance.success_count + performance.failure_count)) * 100 :
      route.success_rate;
    
    // Compliance score
    const complianceScore = route.regional_compliance ? 100 : 0;
    
    // Calculate weighted score
    const score = (
      costScore * weights.cost +
      speedScore * weights.speed +
      successRate * weights.reliability +
      complianceScore * weights.compliance
    );

    return {
      routeId: route.id,
      score,
      breakdown: {
        cost: costScore,
        speed: speedScore,
        reliability: successRate,
        compliance: complianceScore
      }
    };
  }

  private getPriorityWeights(priority: string) {
    switch (priority) {
      case 'cost':
        return { cost: 0.5, speed: 0.15, reliability: 0.25, compliance: 0.1 };
      case 'speed':
        return { cost: 0.15, speed: 0.5, reliability: 0.25, compliance: 0.1 };
      default: // balanced
        return { cost: 0.3, speed: 0.25, reliability: 0.25, compliance: 0.2 };
    }
  }

  private generateReasoning(topScore: RouteScore, priority: string): string {
    const { breakdown } = topScore;
    const reasons = [];
    
    if (breakdown.cost > 80) reasons.push('excellent cost efficiency');
    if (breakdown.speed > 80) reasons.push('fast processing time');
    if (breakdown.reliability > 90) reasons.push('high success rate');
    if (breakdown.compliance === 100) reasons.push('full regional compliance');
    
    return `Selected based on ${priority} priority with ${reasons.join(', ')}`;
  }
}

// Circuit Breaker for Route Health Monitoring
class RouteCircuitBreaker {
  private redis;
  private failureThreshold = 5;
  private timeoutMs = 60000;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async recordSuccess(routeId: string): Promise<void> {
    const key = `circuit:${routeId}`;
    await this.redis.del(`${key}:failures`);
    await this.redis.setex(`${key}:last_success`, 300, Date.now().toString());
  }

  async recordFailure(routeId: string): Promise<void> {
    const key = `circuit:${routeId}`;
    const failures = await this.redis.incr(`${key}:failures`);
    
    if (failures >= this.failureThreshold) {
      await this.redis.setex(`${key}:open`, this.timeoutMs / 1000, Date.now().toString());
    }
    
    await this.redis.setex(`${key}:last_failure`, 300, Date.now().toString());
  }

  async isRouteAvailable(routeId: string): Promise<boolean> {
    const key = `circuit:${routeId}`;
    const isOpen = await this.redis.get(`${key}:open`);
    return !isOpen;
  }
}

// Real-time Route Switcher
class RealTimeRouteSwitcher {
  private redis;
  private circuitBreaker;

  constructor(redis: Redis, circuitBreaker: RouteCircuitBreaker) {
    this.redis = redis;
    this.circuitBreaker = circuitBreaker;
  }

  async handleRouteFailure(
    failedRouteId: string, 
    fallbackRoutes: PaymentRoute[]
  ): Promise<PaymentRoute | null> {
    // Record failure
    await this.circuitBreaker.recordFailure(failedRouteId);
    
    // Find next available route
    for (const route of fallbackRoutes) {
      const isAvailable = await this.circuitBreaker.isRouteAvailable(route.id);
      if (isAvailable) {
        return route;
      }
    }
    
    return null;
  }
}

// Main API Handler
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const redis = new Redis(process.env.REDIS_URL!);
    
    const body: PaymentRouteRequest = await request.json();

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.errors },
        { status: 400 }
      );
    }

    // Initialize components
    const optimizer = new RouteOptimizationEngine(supabase, redis);
    const circuitBreaker = new RouteCircuitBreaker(redis);
    const switcher = new RealTimeRouteSwitcher(redis, circuitBreaker);

    // Optimize route selection
    const optimization = await optimizer.optimizeRoute(body);

    // Check circuit breaker status for primary route
    const isPrimaryAvailable = await circuitBreaker.isRouteAvailable(
      optimization.primaryRoute.id
    );

    let selectedRoute = optimization.primaryRoute;
    let wasFailedOver = false;

    if (!isPrimaryAvailable) {
      const fallbackRoute = await switcher.handleRouteFailure(
        optimization.primaryRoute.id,
        optimization.fallbackRoutes
      );
      
      if (!fallbackRoute) {
        return NextResponse.json(
          { error: 'No available payment routes' },
          { status: 503 }
        );
      }
      
      selectedRoute = fallbackRoute;
      wasFailedOver = true;
    }

    // Calculate estimated costs and timing
    const estimatedCost = selectedRoute.base_fee + 
      (body.amount * selectedRoute.percentage_fee / 100);
    
    // Log route selection for analytics
    await logRouteSelection(supabase, {
      merchantId: body.merchantId,
      selectedRouteId: selectedRoute.id,
      requestData: body,
      wasFailedOver,
      estimatedCost,
      timestamp: new Date().toISOString()
    });

    await redis.quit();

    return NextResponse.json({
      success: true,
      selectedRoute: {
        id: selectedRoute.id,
        name: selectedRoute.name,
        processor: selectedRoute.processor,
        estimatedCost,
        estimatedProcessingTime: selectedRoute.processing_time_ms,
        successRate: selectedRoute.success_rate
      },
      fallbackRoutes: optimization.fallbackRoutes.map(route => ({
        id: route.id,
        name: route.name,
        processor: route.processor
      })),
      optimization: {
        reasoning: optimization.reasoning,
        wasFailedOver,
        priority: body.priority
      },
      metadata: {
        optimizedAt: new Date().toISOString(),
        region: body.region,
        currency: body.currency
      }
    });

  } catch (error) {
    console.error('Route optimization error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to optimize payment route',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}

// Validation function
function validateRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
    errors.push('Valid amount is required');
  }

  if (!body.currency || typeof body.currency !== 'string') {
    errors.push('Currency is required');
  }

  if (!body.region || typeof body.region !== 'string') {
    errors.push('Region is required');
  }

  if (!body.merchantId || typeof body.merchantId !== 'string') {
    errors.push('Merchant ID is required');
  }

  if (!['cost', 'speed', 'balanced'].includes(body.priority)) {
    errors.push('Priority must be cost, speed, or balanced');
  }

  if (!body.paymentMethod || typeof body.paymentMethod !== 'string') {
    errors.push('Payment method is required');
  }

  return { valid: errors.length === 0, errors };
}

// Logging function
async function logRouteSelection(supabase: any, data: any) {
  try {
    await supabase
      .from('route_selections')
      .insert([data]);
  } catch (error) {
    console.error('Failed to log route selection:', error);
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Method not allowed. Use POST for route optimization.' 
  }, { status: 405 });
}
```