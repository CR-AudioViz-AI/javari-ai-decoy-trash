```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { headers } from 'next/headers';
import { ratelimit } from '@/lib/ratelimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);

// Validation schemas
const engagementQuerySchema = z.object({
  creatorId: z.string().uuid(),
  timeRange: z.enum(['24h', '7d', '30d', '90d']).default('30d'),
  contentType: z.enum(['all', 'audio', 'video', 'live']).default('all'),
  metrics: z.array(z.enum(['performance', 'audience', 'conversion', 'insights'])).default(['performance'])
});

const trackEventSchema = z.object({
  creatorId: z.string().uuid(),
  contentId: z.string().uuid(),
  eventType: z.enum(['view', 'like', 'share', 'comment', 'subscribe', 'purchase', 'tip']),
  userId: z.string().uuid().optional(),
  sessionId: z.string(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.string().datetime().optional()
});

// Types
interface EngagementMetrics {
  contentPerformance: ContentPerformance;
  audienceEngagement: AudienceEngagement;
  revenueConversion: RevenueConversion;
  monetizationInsights: MonetizationInsight[];
}

interface ContentPerformance {
  totalViews: number;
  uniqueViewers: number;
  avgWatchTime: number;
  engagementRate: number;
  topContent: ContentItem[];
  performanceTrends: PerformanceTrend[];
}

interface AudienceEngagement {
  activeUsers: number;
  retentionRate: number;
  avgSessionDuration: number;
  interactionRate: number;
  audienceDemographics: Demographics;
  engagementHeatmap: HeatmapData[];
}

interface RevenueConversion {
  conversionRate: number;
  averageOrderValue: number;
  totalRevenue: number;
  funnelMetrics: FunnelStage[];
  revenueByContent: RevenueBreakdown[];
}

interface MonetizationInsight {
  type: 'opportunity' | 'optimization' | 'trend';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionItems: string[];
  expectedLift: number;
}

class EngagementMetricsHandler {
  private static async validateCreatorAccess(creatorId: string, requesterId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('creators')
        .select('id, user_id')
        .eq('id', creatorId)
        .single();

      if (error || !data) return false;
      return data.user_id === requesterId;
    } catch {
      return false;
    }
  }

  static async getMetrics(creatorId: string, params: z.infer<typeof engagementQuerySchema>): Promise<EngagementMetrics> {
    const cacheKey = `engagement:${creatorId}:${JSON.stringify(params)}`;
    
    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const timeFilter = this.getTimeFilter(params.timeRange);
      
      const metrics: EngagementMetrics = {
        contentPerformance: await ContentPerformanceAnalyzer.analyze(creatorId, timeFilter, params.contentType),
        audienceEngagement: await AudienceEngagementTracker.track(creatorId, timeFilter),
        revenueConversion: await RevenueConversionFunnel.analyze(creatorId, timeFilter),
        monetizationInsights: await MonetizationInsightsGenerator.generate(creatorId, timeFilter)
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(metrics));
      
      return metrics;
    } catch (error) {
      console.error('Error fetching engagement metrics:', error);
      throw new Error('Failed to fetch engagement metrics');
    }
  }

  private static getTimeFilter(timeRange: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    
    switch (timeRange) {
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
    }
    
    return { start, end };
  }
}

class ContentPerformanceAnalyzer {
  static async analyze(creatorId: string, timeFilter: { start: Date; end: Date }, contentType: string): Promise<ContentPerformance> {
    try {
      let query = supabase
        .from('creator_content')
        .select(`
          id, title, type, created_at,
          engagement_events!inner(
            event_type, created_at, metadata
          )
        `)
        .eq('creator_id', creatorId)
        .gte('created_at', timeFilter.start.toISOString())
        .lte('created_at', timeFilter.end.toISOString());

      if (contentType !== 'all') {
        query = query.eq('type', contentType);
      }

      const { data: contentData, error } = await query;
      if (error) throw error;

      const metricsAggregator = new MetricsAggregator(contentData || []);
      const performanceData = await metricsAggregator.aggregatePerformance();

      return {
        totalViews: performanceData.totalViews,
        uniqueViewers: performanceData.uniqueViewers,
        avgWatchTime: performanceData.avgWatchTime,
        engagementRate: EngagementRateCalculator.calculate(performanceData),
        topContent: performanceData.topContent.slice(0, 10),
        performanceTrends: await this.calculateTrends(creatorId, timeFilter)
      };
    } catch (error) {
      console.error('Error analyzing content performance:', error);
      throw new Error('Failed to analyze content performance');
    }
  }

  private static async calculateTrends(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<PerformanceTrend[]> {
    const { data, error } = await supabase.rpc('calculate_performance_trends', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }
}

class AudienceEngagementTracker {
  static async track(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<AudienceEngagement> {
    try {
      const [
        activeUsers,
        retentionData,
        sessionData,
        interactionData,
        demographics,
        heatmapData
      ] = await Promise.all([
        this.getActiveUsers(creatorId, timeFilter),
        this.getRetentionRate(creatorId, timeFilter),
        this.getSessionData(creatorId, timeFilter),
        this.getInteractionData(creatorId, timeFilter),
        this.getDemographics(creatorId, timeFilter),
        this.getEngagementHeatmap(creatorId, timeFilter)
      ]);

      return {
        activeUsers,
        retentionRate: retentionData.rate,
        avgSessionDuration: sessionData.avgDuration,
        interactionRate: interactionData.rate,
        audienceDemographics: demographics,
        engagementHeatmap: heatmapData
      };
    } catch (error) {
      console.error('Error tracking audience engagement:', error);
      throw new Error('Failed to track audience engagement');
    }
  }

  private static async getActiveUsers(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<number> {
    const { data, error } = await supabase
      .from('engagement_events')
      .select('user_id')
      .eq('creator_id', creatorId)
      .gte('created_at', timeFilter.start.toISOString())
      .lte('created_at', timeFilter.end.toISOString());

    if (error) throw error;
    return new Set(data?.map(d => d.user_id).filter(Boolean)).size;
  }

  private static async getRetentionRate(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<{ rate: number }> {
    const { data, error } = await supabase.rpc('calculate_retention_rate', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return { rate: data?.retention_rate || 0 };
  }

  private static async getSessionData(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<{ avgDuration: number }> {
    const { data, error } = await supabase.rpc('calculate_avg_session_duration', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return { avgDuration: data?.avg_duration || 0 };
  }

  private static async getInteractionData(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<{ rate: number }> {
    const { data, error } = await supabase.rpc('calculate_interaction_rate', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return { rate: data?.interaction_rate || 0 };
  }

  private static async getDemographics(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<Demographics> {
    const { data, error } = await supabase.rpc('get_audience_demographics', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || { age: {}, gender: {}, location: {} };
  }

  private static async getEngagementHeatmap(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<HeatmapData[]> {
    const { data, error } = await supabase.rpc('get_engagement_heatmap', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }
}

class RevenueConversionFunnel {
  static async analyze(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<RevenueConversion> {
    try {
      const [
        conversionData,
        revenueData,
        funnelData,
        contentRevenue
      ] = await Promise.all([
        this.getConversionRate(creatorId, timeFilter),
        this.getRevenueMetrics(creatorId, timeFilter),
        this.getFunnelMetrics(creatorId, timeFilter),
        this.getRevenueByContent(creatorId, timeFilter)
      ]);

      return {
        conversionRate: conversionData.rate,
        averageOrderValue: revenueData.aov,
        totalRevenue: revenueData.total,
        funnelMetrics: funnelData,
        revenueByContent: contentRevenue
      };
    } catch (error) {
      console.error('Error analyzing revenue conversion:', error);
      throw new Error('Failed to analyze revenue conversion');
    }
  }

  private static async getConversionRate(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<{ rate: number }> {
    const { data, error } = await supabase.rpc('calculate_conversion_rate', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return { rate: data?.conversion_rate || 0 };
  }

  private static async getRevenueMetrics(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<{ aov: number; total: number }> {
    const { data, error } = await supabase
      .from('revenue_transactions')
      .select('amount')
      .eq('creator_id', creatorId)
      .gte('created_at', timeFilter.start.toISOString())
      .lte('created_at', timeFilter.end.toISOString());

    if (error) throw error;

    const amounts = data?.map(d => d.amount) || [];
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const aov = amounts.length > 0 ? total / amounts.length : 0;

    return { aov, total };
  }

  private static async getFunnelMetrics(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<FunnelStage[]> {
    const { data, error } = await supabase.rpc('get_conversion_funnel', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }

  private static async getRevenueByContent(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<RevenueBreakdown[]> {
    const { data, error } = await supabase.rpc('get_revenue_by_content', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }
}

class MonetizationInsightsGenerator {
  static async generate(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<MonetizationInsight[]> {
    try {
      const [
        opportunityInsights,
        optimizationInsights,
        trendInsights
      ] = await Promise.all([
        this.generateOpportunityInsights(creatorId, timeFilter),
        this.generateOptimizationInsights(creatorId, timeFilter),
        this.generateTrendInsights(creatorId, timeFilter)
      ]);

      return [
        ...opportunityInsights,
        ...optimizationInsights,
        ...trendInsights
      ].sort((a, b) => this.getImpactScore(b.impact) - this.getImpactScore(a.impact));
    } catch (error) {
      console.error('Error generating monetization insights:', error);
      return [];
    }
  }

  private static async generateOpportunityInsights(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<MonetizationInsight[]> {
    const { data, error } = await supabase.rpc('get_monetization_opportunities', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }

  private static async generateOptimizationInsights(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<MonetizationInsight[]> {
    const { data, error } = await supabase.rpc('get_optimization_recommendations', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }

  private static async generateTrendInsights(creatorId: string, timeFilter: { start: Date; end: Date }): Promise<MonetizationInsight[]> {
    const { data, error } = await supabase.rpc('get_trend_insights', {
      creator_id: creatorId,
      start_date: timeFilter.start.toISOString(),
      end_date: timeFilter.end.toISOString()
    });

    if (error) throw error;
    return data || [];
  }

  private static getImpactScore(impact: string): number {
    switch (impact) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

class MetricsAggregator {
  constructor(private contentData: any[]) {}

  async aggregatePerformance(): Promise<{
    totalViews: number;
    uniqueViewers: number;
    avgWatchTime: number;
    topContent: ContentItem[];
  }> {
    const viewEvents = this.contentData.flatMap(content => 
      content.engagement_events?.filter((e: any) => e.event_type === 'view') || []
    );

    const totalViews = viewEvents.length;
    const uniqueViewers = new Set(viewEvents.map(e => e.user_id).filter(Boolean)).size;
    
    const watchTimes = viewEvents
      .map(e => e.metadata?.watch_time || 0)
      .filter(time => time > 0);
    const avgWatchTime = watchTimes.length > 0 
      ? watchTimes.reduce((sum, time) => sum + time, 0) / watchTimes.length 
      : 0;

    const topContent = this.contentData
      .map(content => ({
        id: content.id,
        title: content.title,
        type: content.type,
        views: content.engagement_events?.filter((e: any) => e.event_type === 'view').length || 0,
        engagementRate: this.calculateContentEngagementRate(content)
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    return {
      totalViews,
      uniqueViewers,
      avgWatchTime,
      topContent
    };
  }

  private calculateContentEngagementRate(content: any): number {
    const events = content.engagement_events || [];
    const views = events.filter((e: any) => e.event_type === 'view').length;
    const engagements = events.filter((e: any) => 
      ['like', 'share', 'comment'].includes(e.event_type)
    ).length;
    
    return views > 0 ? (engagements / views) * 100 : 0;
  }
}

class EngagementRateCalculator {
  static calculate(performanceData: any): number {
    if (performanceData.totalViews === 0) return 0;
    
    const engagementScore = (
      (performanceData.uniqueViewers / performanceData.totalViews) * 0.4 +
      (performanceData.avgWatchTime / 300) * 0.3 + // Normalize to 5 minutes
      (performanceData.topContent.reduce((sum: number, content: any) => sum + content.engagementRate, 0) / performanceData.topContent.length / 100) * 0.3
    );
    
    return Math.min(engagementScore * 100, 100);
  }
}

class ConversionOptimizer {
  static async getOptimizationSuggestions(creatorId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_conversion_optimization_suggestions', {
      creator_id: creatorId
    });

    if (error) {
      console.error('Error getting optimization suggestions:', error);
      return [];
    }

    return data || [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const headersList = headers();
    const authorization = headersList.get('authorization');
    
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authorization.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Rate limiting
    const identifier = user.id;
    const { success } = await ratelimit.limit(identifier);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams);
    
    const validatedParams = engagementQuerySchema.parse({
      ...searchParams,
      metrics: searchParams.metrics?.split(',') || ['performance']
    });

    // Validate creator access
    const hasAccess = await EngagementMetricsHandler.validateCreatorAccess(
      validatedParams.creatorId,
      user.id
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const metrics = await EngagementMetricsHandler.getMetrics(
      validatedParams.creatorId,
      validatedParams
    );

    return NextResponse.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Engagement metrics API error:', error);
    
    if (error instanceof z.Z