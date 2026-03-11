```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { z } from 'zod';
import { headers } from 'next/headers';

// Types
interface PerformanceMetric {
  id: string;
  service_name: string;
  endpoint: string;
  method: string;
  response_time: number;
  status_code: number;
  cpu_usage?: number;
  memory_usage?: number;
  throughput?: number;
  error_rate?: number;
  timestamp: string;
  user_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

interface AggregatedMetrics {
  service_name: string;
  endpoint: string;
  period: string;
  avg_response_time: number;
  p50_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  total_requests: number;
  error_count: number;
  error_rate: number;
  throughput: number;
  cpu_avg: number;
  memory_avg: number;
  timestamp: string;
}

interface ResourceUtilization {
  service_name: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  active_connections: number;
  timestamp: string;
}

// Validation schemas
const MetricQuerySchema = z.object({
  service: z.string().optional(),
  endpoint: z.string().optional(),
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  granularity: z.enum(['1m', '5m', '15m', '1h', '1d']).default('5m'),
  metric_type: z.enum(['latency', 'throughput', 'errors', 'resources', 'all']).default('all'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().min(1).max(10000).default(1000),
  include_percentiles: z.boolean().default(true)
});

const MetricSubmissionSchema = z.object({
  service_name: z.string().min(1).max(100),
  endpoint: z.string().min(1).max(500),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']),
  response_time: z.number().min(0),
  status_code: z.number().min(100).max(599),
  cpu_usage: z.number().min(0).max(100).optional(),
  memory_usage: z.number().min(0).optional(),
  throughput: z.number().min(0).optional(),
  user_id: z.string().uuid().optional(),
  session_id: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);

// Utility functions
class PerformanceCalculator {
  static calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  static calculateThroughput(requestCount: number, periodMs: number): number {
    return (requestCount / periodMs) * 1000; // requests per second
  }

  static calculateErrorRate(errorCount: number, totalCount: number): number {
    return totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
  }

  static aggregateMetrics(metrics: PerformanceMetric[]): AggregatedMetrics | null {
    if (metrics.length === 0) return null;

    const responseTimes = metrics.map(m => m.response_time);
    const errorCount = metrics.filter(m => m.status_code >= 400).length;
    const cpuValues = metrics.filter(m => m.cpu_usage !== undefined).map(m => m.cpu_usage!);
    const memoryValues = metrics.filter(m => m.memory_usage !== undefined).map(m => m.memory_usage!);

    return {
      service_name: metrics[0].service_name,
      endpoint: metrics[0].endpoint,
      period: '5m', // Default aggregation period
      avg_response_time: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p50_response_time: this.calculatePercentile(responseTimes, 50),
      p95_response_time: this.calculatePercentile(responseTimes, 95),
      p99_response_time: this.calculatePercentile(responseTimes, 99),
      total_requests: metrics.length,
      error_count: errorCount,
      error_rate: this.calculateErrorRate(errorCount, metrics.length),
      throughput: this.calculateThroughput(metrics.length, 5 * 60 * 1000), // 5 minutes in ms
      cpu_avg: cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0,
      memory_avg: memoryValues.length > 0 ? memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length : 0,
      timestamp: new Date().toISOString()
    };
  }
}

class MetricsProcessor {
  static async storeMetric(metric: PerformanceMetric): Promise<void> {
    try {
      // Store in Supabase
      const { error } = await supabase
        .from('performance_metrics')
        .insert([metric]);

      if (error) throw error;

      // Cache in Redis for real-time access
      const cacheKey = `metric:${metric.service_name}:${metric.endpoint}:${Date.now()}`;
      await redis.setex(cacheKey, 3600, JSON.stringify(metric)); // 1 hour TTL

      // Update real-time aggregations
      await this.updateRealTimeAggregations(metric);
    } catch (error) {
      console.error('Error storing metric:', error);
      throw error;
    }
  }

  static async updateRealTimeAggregations(metric: PerformanceMetric): Promise<void> {
    const aggregationKey = `agg:${metric.service_name}:${metric.endpoint}:current`;
    
    // Get current aggregation or create new
    const currentAgg = await redis.get(aggregationKey);
    let aggregation: any = currentAgg ? JSON.parse(currentAgg) : {
      count: 0,
      total_response_time: 0,
      error_count: 0,
      response_times: [],
      last_updated: new Date().toISOString()
    };

    // Update aggregation
    aggregation.count += 1;
    aggregation.total_response_time += metric.response_time;
    aggregation.response_times.push(metric.response_time);
    
    if (metric.status_code >= 400) {
      aggregation.error_count += 1;
    }

    // Keep only last 1000 response times for percentile calculations
    if (aggregation.response_times.length > 1000) {
      aggregation.response_times = aggregation.response_times.slice(-1000);
    }

    aggregation.last_updated = new Date().toISOString();

    // Store updated aggregation
    await redis.setex(aggregationKey, 300, JSON.stringify(aggregation)); // 5 minutes TTL
  }

  static async getAggregatedMetrics(
    service?: string,
    endpoint?: string,
    period = '24h',
    granularity = '5m'
  ): Promise<AggregatedMetrics[]> {
    try {
      // Calculate time range
      const now = new Date();
      const periodMs = this.parsePeriodToMs(period);
      const from = new Date(now.getTime() - periodMs);

      // Build query
      let query = supabase
        .from('performance_metrics')
        .select('*')
        .gte('timestamp', from.toISOString())
        .lte('timestamp', now.toISOString())
        .order('timestamp', { ascending: true });

      if (service) {
        query = query.eq('service_name', service);
      }

      if (endpoint) {
        query = query.eq('endpoint', endpoint);
      }

      const { data: metrics, error } = await query;
      if (error) throw error;

      // Group metrics by time windows and aggregate
      const granularityMs = this.parseGranularityToMs(granularity);
      const groupedMetrics = this.groupMetricsByTimeWindow(metrics || [], granularityMs);
      
      const aggregatedMetrics: AggregatedMetrics[] = [];
      for (const [timeWindow, windowMetrics] of Object.entries(groupedMetrics)) {
        const serviceGroups = this.groupBy(windowMetrics, 'service_name');
        
        for (const [serviceName, serviceMetrics] of Object.entries(serviceGroups)) {
          const endpointGroups = this.groupBy(serviceMetrics, 'endpoint');
          
          for (const [endpointName, endpointMetrics] of Object.entries(endpointGroups)) {
            const aggregated = PerformanceCalculator.aggregateMetrics(endpointMetrics);
            if (aggregated) {
              aggregated.timestamp = timeWindow;
              aggregated.period = granularity;
              aggregatedMetrics.push(aggregated);
            }
          }
        }
      }

      return aggregatedMetrics;
    } catch (error) {
      console.error('Error getting aggregated metrics:', error);
      throw error;
    }
  }

  static async getResourceUtilization(service?: string, period = '24h'): Promise<ResourceUtilization[]> {
    try {
      const cacheKey = `resources:${service || 'all'}:${period}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate time range
      const now = new Date();
      const periodMs = this.parsePeriodToMs(period);
      const from = new Date(now.getTime() - periodMs);

      let query = supabase
        .from('performance_metrics')
        .select('service_name, cpu_usage, memory_usage, timestamp')
        .gte('timestamp', from.toISOString())
        .lte('timestamp', now.toISOString())
        .not('cpu_usage', 'is', null)
        .order('timestamp', { ascending: true });

      if (service) {
        query = query.eq('service_name', service);
      }

      const { data: metrics, error } = await query;
      if (error) throw error;

      const resourceMetrics: ResourceUtilization[] = (metrics || []).map(metric => ({
        service_name: metric.service_name,
        cpu_usage: metric.cpu_usage || 0,
        memory_usage: metric.memory_usage || 0,
        disk_usage: 0, // Would be populated from system metrics
        network_in: 0, // Would be populated from system metrics
        network_out: 0, // Would be populated from system metrics
        active_connections: 0, // Would be populated from system metrics
        timestamp: metric.timestamp
      }));

      // Cache for 2 minutes
      await redis.setex(cacheKey, 120, JSON.stringify(resourceMetrics));

      return resourceMetrics;
    } catch (error) {
      console.error('Error getting resource utilization:', error);
      throw error;
    }
  }

  private static parsePeriodToMs(period: string): number {
    const periodMap: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return periodMap[period] || periodMap['24h'];
  }

  private static parseGranularityToMs(granularity: string): number {
    const granularityMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return granularityMap[granularity] || granularityMap['5m'];
  }

  private static groupMetricsByTimeWindow(
    metrics: PerformanceMetric[],
    windowMs: number
  ): Record<string, PerformanceMetric[]> {
    const grouped: Record<string, PerformanceMetric[]> = {};

    for (const metric of metrics) {
      const timestamp = new Date(metric.timestamp).getTime();
      const windowStart = Math.floor(timestamp / windowMs) * windowMs;
      const windowKey = new Date(windowStart).toISOString();

      if (!grouped[windowKey]) {
        grouped[windowKey] = [];
      }
      grouped[windowKey].push(metric);
    }

    return grouped;
  }

  private static groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const value = String(item[key]);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
}

// Rate limiting
class RateLimiter {
  static async checkRateLimit(identifier: string, windowMs = 60000, maxRequests = 1000): Promise<boolean> {
    const key = `ratelimit:metrics:${identifier}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }
    
    return current <= maxRequests;
  }
}

// GET - Retrieve performance metrics
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';

    // Rate limiting
    const rateLimitPassed = await RateLimiter.checkRateLimit(clientIp, 60000, 100);
    if (!rateLimitPassed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Validate query parameters
    const queryParams = {
      service: searchParams.get('service') || undefined,
      endpoint: searchParams.get('endpoint') || undefined,
      period: searchParams.get('period') || '24h',
      granularity: searchParams.get('granularity') || '5m',
      metric_type: searchParams.get('metric_type') || 'all',
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      limit: parseInt(searchParams.get('limit') || '1000'),
      include_percentiles: searchParams.get('include_percentiles') !== 'false'
    };

    const validatedParams = MetricQuerySchema.parse(queryParams);

    // Get metrics based on type
    let response: any = {};

    if (validatedParams.metric_type === 'all' || validatedParams.metric_type === 'latency') {
      response.latency = await MetricsProcessor.getAggregatedMetrics(
        validatedParams.service,
        validatedParams.endpoint,
        validatedParams.period,
        validatedParams.granularity
      );
    }

    if (validatedParams.metric_type === 'all' || validatedParams.metric_type === 'resources') {
      response.resources = await MetricsProcessor.getResourceUtilization(
        validatedParams.service,
        validatedParams.period
      );
    }

    if (validatedParams.metric_type === 'all' || validatedParams.metric_type === 'throughput') {
      // Throughput is included in aggregated metrics
      if (!response.latency) {
        response.throughput = await MetricsProcessor.getAggregatedMetrics(
          validatedParams.service,
          validatedParams.endpoint,
          validatedParams.period,
          validatedParams.granularity
        );
      }
    }

    // Add metadata
    response.metadata = {
      period: validatedParams.period,
      granularity: validatedParams.granularity,
      service: validatedParams.service,
      endpoint: validatedParams.endpoint,
      generated_at: new Date().toISOString(),
      total_data_points: Object.values(response).flat().length
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error retrieving performance metrics:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Submit performance metrics
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';

    // Rate limiting for submissions (higher limit)
    const rateLimitPassed = await RateLimiter.checkRateLimit(`submit:${clientIp}`, 60000, 10000);
    if (!rateLimitPassed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Handle batch submissions
    const metrics = Array.isArray(body) ? body : [body];
    const validatedMetrics: PerformanceMetric[] = [];

    for (const metric of metrics) {
      try {
        const validatedMetric = MetricSubmissionSchema.parse(metric);
        
        const performanceMetric: PerformanceMetric = {
          id: crypto.randomUUID(),
          ...validatedMetric,
          timestamp: new Date().toISOString()
        };

        validatedMetrics.push(performanceMetric);
      } catch (validationError) {
        console.warn('Invalid metric submission:', validationError);
        continue; // Skip invalid metrics in batch
      }
    }

    if (validatedMetrics.length === 0) {
      return NextResponse.json(
        { error: 'No valid metrics provided' },
        { status: 400 }
      );
    }

    // Store metrics
    const results = await Promise.allSettled(
      validatedMetrics.map(metric => MetricsProcessor.storeMetric(metric))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: failureCount,
      total: validatedMetrics.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error submitting performance metrics:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update metric aggregation settings
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';

    // Rate limiting
    const rateLimitPassed = await RateLimiter.checkRateLimit(`update:${clientIp}`, 60000, 10);
    if (!rateLimitPassed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { action, service, endpoint } = body;

    if (action === 'recalculate_aggregations') {
      // Trigger recalculation of aggregations
      const metrics = await MetricsProcessor.getAggregatedMetrics(service, endpoint, '1h', '1m');
      
      return NextResponse.json({
        success: true,
        message: 'Aggregations recalculated',
        data_points: metrics.length,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'clear_cache') {
      // Clear Redis cache for specific service/endpoint
      const pattern = service 
        ? `*${service}*${endpoint || '*'}*`
        : '*';
      
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      return NextResponse.json({
        success: true,
        message: 'Cache cleared',
        cleared_keys: keys.length,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating metrics:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Clean up old metrics
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';

    // Rate limiting
    const rateLimitPassed = await RateLimiter.checkRateLimit(`delete:${clientIp}`, 60000, 5);
    if (!rateLimitPassed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }