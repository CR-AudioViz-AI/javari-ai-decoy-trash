```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { verifyAuth } from '@/lib/auth';

// Environment variables validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const redisUrl = process.env.REDIS_URL!;

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const redis = new Redis(redisUrl);

// Validation schemas
const AnalyticsQuerySchema = z.object({
  timeRange: z.enum(['1h', '24h', '7d', '30d', '90d']).optional().default('24h'),
  environment: z.enum(['development', 'staging', 'production']).optional(),
  service: z.string().optional(),
  status: z.enum(['success', 'failed', 'pending']).optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
  offset: z.number().min(0).optional().default(0),
});

const DeploymentQuerySchema = z.object({
  includeMetrics: z.boolean().optional().default(true),
  includeFailures: z.boolean().optional().default(true),
  includeBenchmarks: z.boolean().optional().default(false),
});

interface DeploymentAnalytics {
  overview: {
    totalDeployments: number;
    successRate: number;
    averageDeploymentTime: number;
    failureRate: number;
    activeDevelopments: number;
  };
  trends: {
    deploymentsOverTime: Array<{
      timestamp: string;
      count: number;
      successCount: number;
      failureCount: number;
    }>;
    performanceTrend: Array<{
      timestamp: string;
      averageTime: number;
      p95Time: number;
    }>;
  };
  failures: {
    commonFailureReasons: Array<{
      reason: string;
      count: number;
      percentage: number;
    }>;
    failuresByEnvironment: Array<{
      environment: string;
      count: number;
      percentage: number;
    }>;
  };
  performance: {
    fastestDeployment: number;
    slowestDeployment: number;
    medianDeploymentTime: number;
    p95DeploymentTime: number;
    deploymentTimeDistribution: Array<{
      range: string;
      count: number;
    }>;
  };
  insights: {
    recommendations: string[];
    riskFactors: string[];
    optimizationOpportunities: string[];
  };
}

class DeploymentAnalyticsService {
  private static getTimeRangeFilter(timeRange: string): string {
    const ranges: Record<string, string> = {
      '1h': "created_at >= NOW() - INTERVAL '1 hour'",
      '24h': "created_at >= NOW() - INTERVAL '24 hours'",
      '7d': "created_at >= NOW() - INTERVAL '7 days'",
      '30d': "created_at >= NOW() - INTERVAL '30 days'",
      '90d': "created_at >= NOW() - INTERVAL '90 days'",
    };
    return ranges[timeRange] || ranges['24h'];
  }

  static async getOverviewMetrics(filters: any): Promise<any> {
    const timeFilter = this.getTimeRangeFilter(filters.timeRange);
    const envFilter = filters.environment ? `AND environment = '${filters.environment}'` : '';
    const serviceFilter = filters.service ? `AND service_name = '${filters.service}'` : '';

    const { data: overview, error } = await supabase.rpc('get_deployment_overview', {
      time_filter: timeFilter,
      env_filter: envFilter,
      service_filter: serviceFilter,
    });

    if (error) throw new Error(`Failed to fetch overview metrics: ${error.message}`);
    return overview[0] || {};
  }

  static async getTrendData(filters: any): Promise<any> {
    const timeFilter = this.getTimeRangeFilter(filters.timeRange);
    const envFilter = filters.environment ? `AND environment = '${filters.environment}'` : '';

    const { data: trends, error } = await supabase.rpc('get_deployment_trends', {
      time_filter: timeFilter,
      env_filter: envFilter,
    });

    if (error) throw new Error(`Failed to fetch trend data: ${error.message}`);
    return trends || [];
  }

  static async getFailureAnalysis(filters: any): Promise<any> {
    const timeFilter = this.getTimeRangeFilter(filters.timeRange);
    const envFilter = filters.environment ? `AND environment = '${filters.environment}'` : '';

    const { data: failures, error } = await supabase
      .from('deployment_failures')
      .select(`
        reason,
        environment,
        created_at,
        deployment_logs(service_name)
      `)
      .gte('created_at', new Date(Date.now() - this.getTimeRangeMs(filters.timeRange)))
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch failure analysis: ${error.message}`);
    return this.analyzeFailures(failures || []);
  }

  static async getPerformanceMetrics(filters: any): Promise<any> {
    const timeFilter = this.getTimeRangeFilter(filters.timeRange);

    const { data: performance, error } = await supabase.rpc('get_performance_metrics', {
      time_filter: timeFilter,
    });

    if (error) throw new Error(`Failed to fetch performance metrics: ${error.message}`);
    return performance[0] || {};
  }

  private static getTimeRangeMs(timeRange: string): number {
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    };
    return ranges[timeRange] || ranges['24h'];
  }

  private static analyzeFailures(failures: any[]): any {
    const reasonCounts = failures.reduce((acc, failure) => {
      acc[failure.reason] = (acc[failure.reason] || 0) + 1;
      return acc;
    }, {});

    const envCounts = failures.reduce((acc, failure) => {
      acc[failure.environment] = (acc[failure.environment] || 0) + 1;
      return acc;
    }, {});

    const total = failures.length;

    return {
      commonFailureReasons: Object.entries(reasonCounts)
        .map(([reason, count]: [string, any]) => ({
          reason,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      failuresByEnvironment: Object.entries(envCounts)
        .map(([environment, count]: [string, any]) => ({
          environment,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  static generateInsights(analytics: any): any {
    const recommendations: string[] = [];
    const riskFactors: string[] = [];
    const optimizationOpportunities: string[] = [];

    // Success rate analysis
    if (analytics.overview.successRate < 95) {
      recommendations.push('Consider implementing more comprehensive pre-deployment testing');
      riskFactors.push('Low deployment success rate indicates potential stability issues');
    }

    // Performance analysis
    if (analytics.performance.p95DeploymentTime > 600) { // 10 minutes
      optimizationOpportunities.push('Deployment time optimization needed - consider parallel processing');
    }

    // Failure pattern analysis
    if (analytics.failures.commonFailureReasons.length > 0) {
      const topFailure = analytics.failures.commonFailureReasons[0];
      if (topFailure.percentage > 30) {
        riskFactors.push(`${topFailure.reason} accounts for ${topFailure.percentage}% of failures`);
      }
    }

    return {
      recommendations,
      riskFactors,
      optimizationOpportunities,
    };
  }
}

class MetricsAggregator {
  static async aggregateMetrics(filters: any): Promise<DeploymentAnalytics> {
    const cacheKey = `deployment_analytics:${JSON.stringify(filters)}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache read failed:', error);
    }

    const [overview, trends, failures, performance] = await Promise.all([
      DeploymentAnalyticsService.getOverviewMetrics(filters),
      DeploymentAnalyticsService.getTrendData(filters),
      DeploymentAnalyticsService.getFailureAnalysis(filters),
      DeploymentAnalyticsService.getPerformanceMetrics(filters),
    ]);

    const analytics: DeploymentAnalytics = {
      overview,
      trends: {
        deploymentsOverTime: trends.deployments || [],
        performanceTrend: trends.performance || [],
      },
      failures,
      performance,
      insights: DeploymentAnalyticsService.generateInsights({
        overview,
        failures,
        performance,
      }),
    };

    try {
      await redis.setex(cacheKey, 300, JSON.stringify(analytics)); // 5 min cache
    } catch (error) {
      console.warn('Redis cache write failed:', error);
    }

    return analytics;
  }
}

// GET handler
export async function GET(request: NextRequest) {
  try {
    const clientIp = request.ip ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
    const rateLimitResult = await rateLimit(clientIp, 100, 3600); // 100 requests per hour
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authResult.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    
    const validatedQuery = AnalyticsQuerySchema.parse(queryParams);

    const analytics = await MetricsAggregator.aggregateMetrics(validatedQuery);

    return NextResponse.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
      cached: false,
    });

  } catch (error) {
    console.error('Deployment analytics error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters', 
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      },
      { status: 500 }
    );
  }
}

// POST handler for custom queries
export async function POST(request: NextRequest) {
  try {
    const clientIp = request.ip ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
    const rateLimitResult = await rateLimit(clientIp, 50, 3600); // 50 requests per hour
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authResult.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedQuery = AnalyticsQuerySchema.parse(body);
    const validatedOptions = DeploymentQuerySchema.parse(body);

    const analytics = await MetricsAggregator.aggregateMetrics({
      ...validatedQuery,
      ...validatedOptions,
    });

    return NextResponse.json({
      success: true,
      data: analytics,
      query: validatedQuery,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Deployment analytics query error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request body', 
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      },
      { status: 500 }
    );
  }
}
```