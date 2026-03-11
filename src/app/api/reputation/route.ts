```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Types
interface ReputationEvent {
  id?: string;
  user_id: string;
  event_type: 'contribution' | 'peer_review' | 'community_engagement' | 'content_quality' | 'violation';
  points: number;
  metadata: Record<string, any>;
  created_at?: string;
}

interface ReputationScore {
  user_id: string;
  base_score: number;
  decay_score: number;
  bonus_score: number;
  total_score: number;
  rank: number;
  last_updated: string;
}

interface ReputationBreakdown {
  contributions: number;
  peer_reviews: number;
  community_engagement: number;
  content_quality: number;
  violations: number;
  decay_factor: number;
  recovery_bonus: number;
}

// Configuration
const REPUTATION_CONFIG = {
  weights: {
    contribution: 1.0,
    peer_review: 0.8,
    community_engagement: 0.6,
    content_quality: 1.2,
    violation: -2.0
  },
  decay: {
    rate: 0.95, // 5% decay per week
    interval: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
    minimum_score: 0
  },
  recovery: {
    threshold: 100, // Points needed for recovery bonus
    multiplier: 1.1, // 10% bonus for consistent positive behavior
    streak_requirement: 5 // Days of positive activity
  },
  cache_ttl: 300 // 5 minutes
};

class ReputationCalculator {
  static calculateBaseScore(events: ReputationEvent[]): number {
    return events.reduce((total, event) => {
      const weight = REPUTATION_CONFIG.weights[event.event_type] || 1.0;
      return total + (event.points * weight);
    }, 0);
  }

  static calculateDecay(baseScore: number, lastUpdated: Date): number {
    const now = new Date();
    const timeDiff = now.getTime() - lastUpdated.getTime();
    const intervals = Math.floor(timeDiff / REPUTATION_CONFIG.decay.interval);
    
    if (intervals <= 0) return baseScore;
    
    const decayedScore = baseScore * Math.pow(REPUTATION_CONFIG.decay.rate, intervals);
    return Math.max(decayedScore, REPUTATION_CONFIG.decay.minimum_score);
  }

  static calculateRecoveryBonus(events: ReputationEvent[]): number {
    const recentEvents = events.filter(event => {
      const eventDate = new Date(event.created_at!);
      const daysDiff = (Date.now() - eventDate.getTime()) / (24 * 60 * 60 * 1000);
      return daysDiff <= 30 && event.points > 0;
    });

    const totalPositivePoints = recentEvents.reduce((sum, event) => sum + event.points, 0);
    
    if (totalPositivePoints < REPUTATION_CONFIG.recovery.threshold) return 0;

    // Check for consistency streak
    const dailyActivity = this.getDailyActivityStreak(recentEvents);
    if (dailyActivity >= REPUTATION_CONFIG.recovery.streak_requirement) {
      return totalPositivePoints * (REPUTATION_CONFIG.recovery.multiplier - 1);
    }

    return 0;
  }

  private static getDailyActivityStreak(events: ReputationEvent[]): number {
    const dailyActivity = new Map<string, boolean>();
    
    events.forEach(event => {
      const date = new Date(event.created_at!).toISOString().split('T')[0];
      dailyActivity.set(date, true);
    });

    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = checkDate.toISOString().split('T')[0];
      
      if (dailyActivity.has(dateKey)) {
        streak++;
      } else if (streak > 0) {
        break;
      }
    }

    return streak;
  }
}

class DecayManager {
  static async runDecayForUser(userId: string): Promise<void> {
    try {
      const { data: reputation } = await supabase
        .from('user_reputation')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!reputation) return;

      const lastUpdated = new Date(reputation.last_updated);
      const decayedScore = ReputationCalculator.calculateDecay(
        reputation.base_score, 
        lastUpdated
      );

      await supabase
        .from('user_reputation')
        .update({
          decay_score: decayedScore,
          total_score: decayedScore + reputation.bonus_score,
          last_updated: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Invalidate cache
      await redis.del(`reputation:${userId}`);
    } catch (error) {
      console.error('Decay calculation failed:', error);
    }
  }

  static async runGlobalDecay(): Promise<void> {
    try {
      const { data: users } = await supabase
        .from('user_reputation')
        .select('user_id')
        .lt('last_updated', new Date(Date.now() - REPUTATION_CONFIG.decay.interval).toISOString());

      if (users) {
        await Promise.all(users.map(user => this.runDecayForUser(user.user_id)));
      }
    } catch (error) {
      console.error('Global decay failed:', error);
    }
  }
}

class ReputationRecovery {
  static async checkRecoveryEligibility(userId: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const { data: events } = await supabase
        .from('reputation_events')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (!events) return 0;

      return ReputationCalculator.calculateRecoveryBonus(events);
    } catch (error) {
      console.error('Recovery check failed:', error);
      return 0;
    }
  }
}

class ReputationMiddleware {
  static validateRequest(body: any, requiredFields: string[]): string | null {
    for (const field of requiredFields) {
      if (!body[field]) {
        return `Missing required field: ${field}`;
      }
    }

    // Validate user_id format
    if (body.user_id && typeof body.user_id !== 'string') {
      return 'Invalid user_id format';
    }

    // Validate points range for events
    if (body.points !== undefined) {
      if (typeof body.points !== 'number' || body.points < -1000 || body.points > 1000) {
        return 'Points must be a number between -1000 and 1000';
      }
    }

    return null;
  }

  static async checkRateLimit(userId: string, action: string): Promise<boolean> {
    const key = `rate_limit:${action}:${userId}`;
    const current = await redis.get(key);
    
    const limits = {
      calculate: { max: 10, window: 300 }, // 10 per 5 minutes
      event: { max: 100, window: 3600 }, // 100 per hour
      leaderboard: { max: 30, window: 300 } // 30 per 5 minutes
    };

    const limit = limits[action as keyof typeof limits] || { max: 5, window: 300 };
    
    if (current && parseInt(current) >= limit.max) {
      return false;
    }

    await redis.multi()
      .incr(key)
      .expire(key, limit.window)
      .exec();

    return true;
  }
}

// GET /api/reputation - Get user reputation or leaderboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const leaderboard = searchParams.get('leaderboard') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const timeframe = searchParams.get('timeframe') || '30d';

    if (leaderboard) {
      // Rate limiting
      const canProceed = await ReputationMiddleware.checkRateLimit('anonymous', 'leaderboard');
      if (!canProceed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      // Get leaderboard from cache first
      const cacheKey = `leaderboard:${timeframe}:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }

      // Calculate timeframe
      let timeFilter = new Date();
      if (timeframe === '7d') timeFilter.setDate(timeFilter.getDate() - 7);
      else if (timeframe === '30d') timeFilter.setDate(timeFilter.getDate() - 30);
      else if (timeframe === '1y') timeFilter.setFullYear(timeFilter.getFullYear() - 1);

      const { data: leaderboardData, error } = await supabase
        .from('user_reputation')
        .select(`
          user_id,
          total_score,
          rank,
          profiles:user_id (username, avatar_url)
        `)
        .gte('last_updated', timeFilter.toISOString())
        .order('total_score', { ascending: false })
        .limit(Math.min(limit, 100));

      if (error) throw error;

      // Cache for 5 minutes
      await redis.setex(cacheKey, REPUTATION_CONFIG.cache_ttl, JSON.stringify(leaderboardData));

      return NextResponse.json(leaderboardData);
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter required' },
        { status: 400 }
      );
    }

    // Get user reputation
    const cacheKey = `reputation:${userId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // Get from database
    const [reputationResult, eventsResult] = await Promise.all([
      supabase
        .from('user_reputation')
        .select('*')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('reputation_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    const { data: reputation } = reputationResult;
    const { data: events } = eventsResult;

    if (!reputation) {
      return NextResponse.json(
        { error: 'User reputation not found' },
        { status: 404 }
      );
    }

    // Calculate breakdown
    const breakdown: ReputationBreakdown = {
      contributions: events?.filter(e => e.event_type === 'contribution').reduce((sum, e) => sum + e.points, 0) || 0,
      peer_reviews: events?.filter(e => e.event_type === 'peer_review').reduce((sum, e) => sum + e.points, 0) || 0,
      community_engagement: events?.filter(e => e.event_type === 'community_engagement').reduce((sum, e) => sum + e.points, 0) || 0,
      content_quality: events?.filter(e => e.event_type === 'content_quality').reduce((sum, e) => sum + e.points, 0) || 0,
      violations: events?.filter(e => e.event_type === 'violation').reduce((sum, e) => sum + e.points, 0) || 0,
      decay_factor: reputation.decay_score / reputation.base_score,
      recovery_bonus: reputation.bonus_score
    };

    const response = {
      ...reputation,
      breakdown,
      recent_events: events?.slice(0, 10) || []
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, REPUTATION_CONFIG.cache_ttl, JSON.stringify(response));

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/reputation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/reputation - Calculate reputation or record event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'calculate') {
      const validation = ReputationMiddleware.validateRequest(body, ['user_id']);
      if (validation) {
        return NextResponse.json({ error: validation }, { status: 400 });
      }

      const canProceed = await ReputationMiddleware.checkRateLimit(body.user_id, 'calculate');
      if (!canProceed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      // Recalculate user reputation
      const { data: events } = await supabase
        .from('reputation_events')
        .select('*')
        .eq('user_id', body.user_id)
        .order('created_at', { ascending: false });

      if (!events) {
        return NextResponse.json({ error: 'No events found' }, { status: 404 });
      }

      const baseScore = ReputationCalculator.calculateBaseScore(events);
      const recoveryBonus = await ReputationRecovery.checkRecoveryEligibility(body.user_id);
      
      // Apply decay from last update
      const { data: currentReputation } = await supabase
        .from('user_reputation')
        .select('last_updated')
        .eq('user_id', body.user_id)
        .single();

      const lastUpdated = currentReputation 
        ? new Date(currentReputation.last_updated) 
        : new Date();
      
      const decayScore = ReputationCalculator.calculateDecay(baseScore, lastUpdated);
      const totalScore = decayScore + recoveryBonus;

      // Update reputation
      const { error: updateError } = await supabase
        .from('user_reputation')
        .upsert({
          user_id: body.user_id,
          base_score: baseScore,
          decay_score: decayScore,
          bonus_score: recoveryBonus,
          total_score: totalScore,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (updateError) throw updateError;

      // Update rank
      await this.updateUserRank(body.user_id);

      // Clear cache
      await redis.del(`reputation:${body.user_id}`);

      return NextResponse.json({
        user_id: body.user_id,
        base_score: baseScore,
        decay_score: decayScore,
        bonus_score: recoveryBonus,
        total_score: totalScore,
        calculated_at: new Date().toISOString()
      });

    } else if (action === 'event') {
      const validation = ReputationMiddleware.validateRequest(body, ['user_id', 'event_type', 'points']);
      if (validation) {
        return NextResponse.json({ error: validation }, { status: 400 });
      }

      const canProceed = await ReputationMiddleware.checkRateLimit(body.user_id, 'event');
      if (!canProceed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      // Record reputation event
      const { data: event, error } = await supabase
        .from('reputation_events')
        .insert({
          user_id: body.user_id,
          event_type: body.event_type,
          points: body.points,
          metadata: body.metadata || {},
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger reputation recalculation
      await fetch(`${process.env.NEXTAUTH_URL}/api/reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', user_id: body.user_id })
      });

      // Send notification for significant changes
      if (Math.abs(body.points) >= 50) {
        await fetch(`${process.env.NEXTAUTH_URL}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: body.user_id,
            type: 'reputation_change',
            title: 'Reputation Updated',
            message: `Your reputation changed by ${body.points > 0 ? '+' : ''}${body.points} points`,
            metadata: { points: body.points, event_type: body.event_type }
          })
        });
      }

      return NextResponse.json(event);

    } else if (action === 'decay') {
      // Run global decay (typically called by cron)
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      await DecayManager.runGlobalDecay();
      return NextResponse.json({ message: 'Decay completed' });

    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use: calculate, event, or decay' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('POST /api/reputation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to update user rank
async function updateUserRank(userId: string): Promise<void> {
  try {
    // Get user's current total score
    const { data: userReputation } = await supabase
      .from('user_reputation')
      .select('total_score')
      .eq('user_id', userId)
      .single();

    if (!userReputation) return;

    // Count users with higher scores
    const { count } = await supabase
      .from('user_reputation')
      .select('*', { count: 'exact', head: true })
      .gt('total_score', userReputation.total_score);

    const rank = (count || 0) + 1;

    // Update rank
    await supabase
      .from('user_reputation')
      .update({ rank })
      .eq('user_id', userId);
  } catch (error) {
    console.error('Rank update failed:', error);
  }
}

// PUT /api/reputation - Batch update reputation events
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { events, user_id } = body;

    const validation = ReputationMiddleware.validateRequest(body, ['user_id', 'events']);
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Events must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate each event
    for (const event of events) {
      const eventValidation = ReputationMiddleware.validateRequest(
        { ...event, user_id }, 
        ['event_type', 'points']
      );
      if (eventValidation) {
        return NextResponse.json({ error: eventValidation }, { status: 400 });
      }
    }

    // Insert batch events
    const eventsToInsert = events.map((event: Partial<ReputationEvent>) => ({
      user_id,
      event_type: event.event_type,
      points: event.points,
      metadata: event.metadata || {},
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('reputation_events')
      .insert(eventsToInsert)
      .select();

    if (error) throw error;

    // Trigger reputation recalculation
    await fetch(`${process.env.NEXTAUTH_URL}/api/reputation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'calculate', user_id })
    });

    return NextResponse.json({
      message: 'Events recorded successfully',
      events: data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('PUT /api/reputation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/reputation - Reset user reputation (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const adminKey = request.headers.get('X-Admin-Key');

    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter required' },
        { status: 400 }
      );
    }

    // Delete all reputation events and reset reputation
    await Promise.all([
      supabase
        .from('reputation_events')
        .delete()