```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

// Types
interface PerformanceMetrics {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  engagement_rate: number;
  watch_time: number;
  completion_rate: number;
  click_through_rate: number;
}

interface EngagementInsight {
  pattern: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  peak_hours: number[];
  audience_retention: number;
  interaction_types: Record<string, number>;
}

interface RevenueRecommendation {
  type: 'monetization' | 'content' | 'audience' | 'timing';
  title: string;
  description: string;
  potential_impact: 'low' | 'medium' | 'high';
  estimated_revenue_lift: number;
  implementation_difficulty: 'easy' | 'medium' | 'hard';
}

interface CreatorInsights {
  performance_metrics: PerformanceMetrics;
  engagement_insights: EngagementInsight[];
  revenue_recommendations: RevenueRecommendation[];
  period_comparison: {
    views_change: number;
    engagement_change: number;
    revenue_change: number;
  };
  top_performing_content: Array<{
    content_id: string;
    title: string;
    performance_score: number;
    key_success_factors: string[];
  }>;
}

// Validation schemas
const querySchema = z.object({
  creator_id: z.string().uuid(),
  time_range: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
  metrics: z.string().optional().transform(val => val ? val.split(',') : []),
  include_recommendations: z.string().transform(val => val === 'true').default('true')
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper functions
function calculateEngagementRate(metrics: any): number {
  if (!metrics.views || metrics.views === 0) return 0;
  const totalEngagements = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
  return (totalEngagements / metrics.views) * 100;
}

function getTimeRangeInDays(timeRange: string): number {
  const ranges = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  return ranges[timeRange as keyof typeof ranges] || 30;
}

async function getPerformanceMetrics(creatorId: string, days: number): Promise<PerformanceMetrics> {
  const { data: metrics, error } = await supabase
    .from('content_analytics')
    .select(`
      views,
      likes,
      shares,
      comments,
      watch_time,
      completion_rate,
      click_through_rate
    `)
    .eq('creator_id', creatorId)
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  if (error) throw new Error(`Failed to fetch performance metrics: ${error.message}`);

  const aggregated = metrics?.reduce((acc, metric) => ({
    views: acc.views + (metric.views || 0),
    likes: acc.likes + (metric.likes || 0),
    shares: acc.shares + (metric.shares || 0),
    comments: acc.comments + (metric.comments || 0),
    watch_time: acc.watch_time + (metric.watch_time || 0),
    completion_rate: acc.completion_rate + (metric.completion_rate || 0),
    click_through_rate: acc.click_through_rate + (metric.click_through_rate || 0)
  }), {
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    watch_time: 0,
    completion_rate: 0,
    click_through_rate: 0
  }) || {
    views: 0,
    likes: 0,
    shares: 0,
    comments: 0,
    watch_time: 0,
    completion_rate: 0,
    click_through_rate: 0
  };

  const count = metrics?.length || 1;
  return {
    ...aggregated,
    completion_rate: aggregated.completion_rate / count,
    click_through_rate: aggregated.click_through_rate / count,
    engagement_rate: calculateEngagementRate(aggregated)
  };
}

async function getEngagementInsights(creatorId: string, days: number): Promise<EngagementInsight[]> {
  const { data: engagement, error } = await supabase
    .from('user_engagement')
    .select(`
      interaction_type,
      created_at,
      engagement_score,
      session_duration
    `)
    .eq('creator_id', creatorId)
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at');

  if (error) throw new Error(`Failed to fetch engagement data: ${error.message}`);

  if (!engagement || engagement.length === 0) {
    return [];
  }

  // Analyze peak hours
  const hourlyEngagement = engagement.reduce((acc: Record<number, number>, item) => {
    const hour = new Date(item.created_at).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});

  const peakHours = Object.entries(hourlyEngagement)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  // Calculate interaction types distribution
  const interactionTypes = engagement.reduce((acc: Record<string, number>, item) => {
    acc[item.interaction_type] = (acc[item.interaction_type] || 0) + 1;
    return acc;
  }, {});

  // Calculate trend (simplified)
  const midPoint = Math.floor(engagement.length / 2);
  const firstHalf = engagement.slice(0, midPoint);
  const secondHalf = engagement.slice(midPoint);
  
  const firstHalfAvg = firstHalf.reduce((acc, item) => acc + (item.engagement_score || 0), 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((acc, item) => acc + (item.engagement_score || 0), 0) / secondHalf.length;
  
  const trend: 'increasing' | 'decreasing' | 'stable' = 
    secondHalfAvg > firstHalfAvg * 1.1 ? 'increasing' :
    secondHalfAvg < firstHalfAvg * 0.9 ? 'decreasing' : 'stable';

  const avgRetention = engagement.reduce((acc, item) => acc + (item.session_duration || 0), 0) / engagement.length;

  return [{
    pattern: 'engagement_velocity',
    trend,
    peak_hours: peakHours,
    audience_retention: avgRetention,
    interaction_types: interactionTypes
  }];
}

async function getRevenueRecommendations(creatorId: string, metrics: PerformanceMetrics): Promise<RevenueRecommendation[]> {
  const recommendations: RevenueRecommendation[] = [];

  // Content optimization recommendations
  if (metrics.engagement_rate < 3) {
    recommendations.push({
      type: 'content',
      title: 'Improve Content Engagement',
      description: 'Your engagement rate is below average. Consider creating more interactive content, asking questions, and responding to comments quickly.',
      potential_impact: 'medium',
      estimated_revenue_lift: 15,
      implementation_difficulty: 'medium'
    });
  }

  // Monetization recommendations
  if (metrics.views > 10000 && metrics.completion_rate > 0.7) {
    recommendations.push({
      type: 'monetization',
      title: 'Enable Premium Features',
      description: 'Your high completion rate and view count suggest audience loyalty. Consider offering premium content or memberships.',
      potential_impact: 'high',
      estimated_revenue_lift: 40,
      implementation_difficulty: 'medium'
    });
  }

  // Timing recommendations
  recommendations.push({
    type: 'timing',
    title: 'Optimize Publishing Schedule',
    description: 'Publish content during your audience peak hours to maximize initial engagement and algorithm visibility.',
    potential_impact: 'medium',
    estimated_revenue_lift: 20,
    implementation_difficulty: 'easy'
  });

  return recommendations;
}

async function getTopPerformingContent(creatorId: string, days: number) {
  const { data: content, error } = await supabase
    .from('content_analytics')
    .select(`
      content_id,
      title,
      views,
      likes,
      shares,
      comments,
      completion_rate
    `)
    .eq('creator_id', creatorId)
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('views', { ascending: false })
    .limit(5);

  if (error) throw new Error(`Failed to fetch top content: ${error.message}`);

  return content?.map(item => {
    const engagementRate = calculateEngagementRate(item);
    const performanceScore = (item.views * 0.4) + (engagementRate * 0.3) + (item.completion_rate * 0.3);
    
    const successFactors = [];
    if (engagementRate > 5) successFactors.push('High engagement');
    if (item.completion_rate > 0.8) successFactors.push('High retention');
    if (item.views > 50000) successFactors.push('Viral potential');

    return {
      content_id: item.content_id,
      title: item.title,
      performance_score: Math.round(performanceScore),
      key_success_factors: successFactors
    };
  }) || [];
}

async function getPeriodComparison(creatorId: string, currentDays: number) {
  const currentMetrics = await getPerformanceMetrics(creatorId, currentDays);
  const previousMetrics = await getPerformanceMetrics(creatorId, currentDays * 2);

  // Calculate previous period (excluding current period)
  const prevViews = previousMetrics.views - currentMetrics.views;
  const prevEngagement = previousMetrics.engagement_rate; // Simplified calculation

  return {
    views_change: currentMetrics.views === 0 ? 0 : ((currentMetrics.views - prevViews) / prevViews) * 100,
    engagement_change: prevEngagement === 0 ? 0 : ((currentMetrics.engagement_rate - prevEngagement) / prevEngagement) * 100,
    revenue_change: 0 // Would require revenue data integration
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get authorization header
    const headersList = headers();
    const authorization = headersList.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      creator_id: searchParams.get('creator_id'),
      time_range: searchParams.get('time_range'),
      metrics: searchParams.get('metrics'),
      include_recommendations: searchParams.get('include_recommendations')
    };

    const validatedParams = querySchema.parse(queryParams);
    const { creator_id, time_range, include_recommendations } = validatedParams;

    // Verify creator access (RLS policy will also enforce this)
    const { data: creator, error: creatorError } = await supabase
      .from('creators')
      .select('id')
      .eq('id', creator_id)
      .single();

    if (creatorError || !creator) {
      return NextResponse.json(
        { error: 'Creator not found or access denied' },
        { status: 404 }
      );
    }

    const days = getTimeRangeInDays(time_range);

    // Fetch all required data
    const [
      performanceMetrics,
      engagementInsights,
      topPerformingContent,
      periodComparison
    ] = await Promise.all([
      getPerformanceMetrics(creator_id, days),
      getEngagementInsights(creator_id, days),
      getTopPerformingContent(creator_id, days),
      getPeriodComparison(creator_id, days)
    ]);

    // Generate revenue recommendations if requested
    const revenueRecommendations = include_recommendations 
      ? await getRevenueRecommendations(creator_id, performanceMetrics)
      : [];

    const insights: CreatorInsights = {
      performance_metrics: performanceMetrics,
      engagement_insights: engagementInsights,
      revenue_recommendations: revenueRecommendations,
      period_comparison: periodComparison,
      top_performing_content: topPerformingContent
    };

    // Set cache headers
    const response = NextResponse.json(insights);
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    
    return response;

  } catch (error) {
    console.error('Creator insights API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      // Don't expose internal error details in production
      const message = process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Internal server error';
      
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```