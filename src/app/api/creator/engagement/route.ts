```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

// Types and schemas
interface EngagementMetrics {
  totalEngagement: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  avgWatchTime: number;
  engagementRate: number;
  uniqueViewers: number;
  retentionRate: number;
}

interface AudienceBehavior {
  demographics: {
    ageGroups: Record<string, number>;
    locations: Record<string, number>;
    devices: Record<string, number>;
  };
  engagementPatterns: {
    peakHours: number[];
    preferredContent: string[];
    sessionDuration: number;
  };
  retention: {
    returning: number;
    new: number;
    churnRate: number;
  };
}

interface ContentOptimization {
  recommendations: {
    type: 'timing' | 'content' | 'format' | 'engagement';
    priority: 'high' | 'medium' | 'low';
    suggestion: string;
    expectedImpact: number;
  }[];
  bestPerforming: {
    contentId: string;
    contentType: string;
    metrics: EngagementMetrics;
  }[];
  insights: string[];
}

const engagementEventSchema = z.object({
  contentId: z.string().uuid(),
  eventType: z.enum(['view', 'like', 'share', 'comment', 'watch_time', 'complete']),
  userId: z.string().uuid().optional(),
  sessionId: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.any()).optional(),
  value: z.number().optional()
});

const analyticsQuerySchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'),
  contentType: z.enum(['audio_viz', 'livestream', 'upload', 'all']).default('all'),
  groupBy: z.enum(['hour', 'day', 'week']).optional(),
  includeAudience: z.boolean().default(false)
});

// Helper functions
async function validateCreatorAuth(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return null;
    }

    // Verify creator profile
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('id, user_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    return profile?.id || null;
  } catch {
    return null;
  }
}

function getPeriodTimestamp(period: string): number {
  const now = Date.now();
  const periods: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };
  return now - periods[period];
}

async function getEngagementMetrics(
  creatorId: string,
  period: string,
  contentType: string
): Promise<EngagementMetrics> {
  const since = getPeriodTimestamp(period);
  
  // Get cached metrics first
  const cacheKey = `engagement:${creatorId}:${period}:${contentType}`;
  const cached = await redis.get(cacheKey);
  
  if (cached && typeof cached === 'object') {
    return cached as EngagementMetrics;
  }

  // Query from database
  let query = supabase
    .from('engagement_events')
    .select(`
      event_type,
      content_id,
      user_id,
      value,
      created_at,
      content:content_id (
        type,
        creator_id
      )
    `)
    .eq('content.creator_id', creatorId)
    .gte('created_at', new Date(since).toISOString());

  if (contentType !== 'all') {
    query = query.eq('content.type', contentType);
  }

  const { data: events, error } = await query;
  
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  // Calculate metrics
  const uniqueViewers = new Set(events?.filter(e => e.event_type === 'view').map(e => e.user_id)).size;
  const views = events?.filter(e => e.event_type === 'view').length || 0;
  const likes = events?.filter(e => e.event_type === 'like').length || 0;
  const shares = events?.filter(e => e.event_type === 'share').length || 0;
  const comments = events?.filter(e => e.event_type === 'comment').length || 0;
  const watchTimeEvents = events?.filter(e => e.event_type === 'watch_time') || [];
  const completions = events?.filter(e => e.event_type === 'complete').length || 0;

  const totalWatchTime = watchTimeEvents.reduce((sum, e) => sum + (e.value || 0), 0);
  const avgWatchTime = watchTimeEvents.length > 0 ? totalWatchTime / watchTimeEvents.length : 0;
  const totalEngagement = likes + shares + comments;
  const engagementRate = views > 0 ? (totalEngagement / views) * 100 : 0;
  const retentionRate = views > 0 ? (completions / views) * 100 : 0;

  const metrics: EngagementMetrics = {
    totalEngagement,
    views,
    likes,
    shares,
    comments,
    avgWatchTime,
    engagementRate,
    uniqueViewers,
    retentionRate
  };

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(metrics));
  
  return metrics;
}

async function getAudienceBehavior(creatorId: string, period: string): Promise<AudienceBehavior> {
  const since = getPeriodTimestamp(period);
  
  const { data: sessions, error } = await supabase
    .from('user_sessions')
    .select(`
      user_id,
      device_type,
      location,
      duration,
      created_at,
      user_profiles!inner (
        age_group
      )
    `)
    .eq('creator_id', creatorId)
    .gte('created_at', new Date(since).toISOString());

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  // Calculate demographics
  const ageGroups: Record<string, number> = {};
  const locations: Record<string, number> = {};
  const devices: Record<string, number> = {};
  const hourlyEngagement: number[] = new Array(24).fill(0);
  
  let totalDuration = 0;
  const uniqueUsers = new Set<string>();
  const returningUsers = new Set<string>();

  sessions?.forEach(session => {
    const ageGroup = session.user_profiles?.age_group || 'unknown';
    ageGroups[ageGroup] = (ageGroups[ageGroup] || 0) + 1;
    
    locations[session.location] = (locations[session.location] || 0) + 1;
    devices[session.device_type] = (devices[session.device_type] || 0) + 1;
    
    const hour = new Date(session.created_at).getHours();
    hourlyEngagement[hour]++;
    
    totalDuration += session.duration || 0;
    uniqueUsers.add(session.user_id);
    
    // Check if returning user (simplified logic)
    if (session.created_at < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) {
      returningUsers.add(session.user_id);
    }
  });

  const avgSessionDuration = sessions?.length ? totalDuration / sessions.length : 0;
  const peakHours = hourlyEngagement
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(item => item.hour);

  return {
    demographics: {
      ageGroups,
      locations,
      devices
    },
    engagementPatterns: {
      peakHours,
      preferredContent: [], // Would need content preference analysis
      sessionDuration: avgSessionDuration
    },
    retention: {
      returning: returningUsers.size,
      new: uniqueUsers.size - returningUsers.size,
      churnRate: uniqueUsers.size > 0 ? (uniqueUsers.size - returningUsers.size) / uniqueUsers.size * 100 : 0
    }
  };
}

async function generateContentOptimization(
  creatorId: string,
  metrics: EngagementMetrics,
  audience: AudienceBehavior
): Promise<ContentOptimization> {
  const recommendations: ContentOptimization['recommendations'] = [];
  const insights: string[] = [];

  // Engagement rate optimization
  if (metrics.engagementRate < 5) {
    recommendations.push({
      type: 'engagement',
      priority: 'high',
      suggestion: 'Add more interactive elements like polls or Q&A segments to boost engagement',
      expectedImpact: 15
    });
  }

  // Timing optimization
  if (audience.engagementPatterns.peakHours.length > 0) {
    const peakTime = audience.engagementPatterns.peakHours[0];
    recommendations.push({
      type: 'timing',
      priority: 'medium',
      suggestion: `Schedule content around ${peakTime}:00 when your audience is most active`,
      expectedImpact: 20
    });
  }

  // Retention optimization
  if (metrics.retentionRate < 50) {
    recommendations.push({
      type: 'content',
      priority: 'high',
      suggestion: 'Create stronger content hooks in the first 15 seconds to improve retention',
      expectedImpact: 25
    });
  }

  // Get best performing content
  const { data: topContent } = await supabase
    .from('content')
    .select(`
      id,
      type,
      title,
      engagement_metrics
    `)
    .eq('creator_id', creatorId)
    .order('engagement_score', { ascending: false })
    .limit(3);

  const bestPerforming = topContent?.map(content => ({
    contentId: content.id,
    contentType: content.type,
    metrics: content.engagement_metrics as EngagementMetrics
  })) || [];

  // Generate insights
  if (metrics.uniqueViewers > 0) {
    insights.push(`Your content reaches ${metrics.uniqueViewers} unique viewers on average`);
  }
  
  if (audience.retention.returning > audience.retention.new) {
    insights.push('You have strong audience loyalty with more returning than new viewers');
  }

  return {
    recommendations,
    bestPerforming,
    insights
  };
}

// Route handlers
export async function GET(request: NextRequest) {
  try {
    const creatorId = await validateCreatorAuth(request);
    if (!creatorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = analyticsQuerySchema.parse({
      period: searchParams.get('period') || '24h',
      contentType: searchParams.get('contentType') || 'all',
      groupBy: searchParams.get('groupBy'),
      includeAudience: searchParams.get('includeAudience') === 'true'
    });

    const metrics = await getEngagementMetrics(creatorId, query.period, query.contentType);
    
    let audience: AudienceBehavior | undefined;
    if (query.includeAudience) {
      audience = await getAudienceBehavior(creatorId, query.period);
    }

    return NextResponse.json({
      metrics,
      audience,
      period: query.period,
      contentType: query.contentType
    });

  } catch (error) {
    console.error('GET /api/creator/engagement error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const creatorId = await validateCreatorAuth(request);
    if (!creatorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const eventData = engagementEventSchema.parse(body);

    // Verify content ownership
    const { data: content } = await supabase
      .from('content')
      .select('creator_id')
      .eq('id', eventData.contentId)
      .single();

    if (!content || content.creator_id !== creatorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Store engagement event
    const { error: insertError } = await supabase
      .from('engagement_events')
      .insert({
        content_id: eventData.contentId,
        event_type: eventData.eventType,
        user_id: eventData.userId,
        session_id: eventData.sessionId,
        value: eventData.value,
        metadata: eventData.metadata,
        created_at: new Date(eventData.timestamp).toISOString()
      });

    if (insertError) {
      throw new Error(`Database error: ${insertError.message}`);
    }

    // Update real-time aggregation in Redis
    const aggregateKey = `engagement:realtime:${creatorId}:${eventData.contentId}`;
    await redis.hincrby(aggregateKey, eventData.eventType, 1);
    await redis.expire(aggregateKey, 3600); // Expire in 1 hour

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('POST /api/creator/engagement/track error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Additional route handlers for specific endpoints
export async function PUT(request: NextRequest) {
  try {
    const creatorId = await validateCreatorAuth(request);
    if (!creatorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    if (endpoint === 'insights') {
      const period = searchParams.get('period') || '24h';
      const contentType = searchParams.get('contentType') || 'all';

      const metrics = await getEngagementMetrics(creatorId, period, contentType);
      const audience = await getAudienceBehavior(creatorId, period);
      const optimization = await generateContentOptimization(creatorId, metrics, audience);

      return NextResponse.json(optimization);
    }

    if (endpoint === 'trends') {
      const period = searchParams.get('period') || '7d';
      
      // Get trend data over time
      const { data: trendData } = await supabase
        .from('engagement_analytics')
        .select('date, metrics')
        .eq('creator_id', creatorId)
        .gte('date', new Date(getPeriodTimestamp(period)).toISOString())
        .order('date');

      return NextResponse.json({ trends: trendData || [] });
    }

    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });

  } catch (error) {
    console.error('PUT /api/creator/engagement error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```