```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { z } from 'zod';

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const redis = new Redis(process.env.REDIS_URL!);

// Validation schemas
const revenueQuerySchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d', '90d']).optional().default('24h'),
  stream: z.enum(['all', 'subscriptions', 'one_time', 'tips', 'ads', 'affiliate']).optional().default('all'),
  forecast: z.boolean().optional().default(false),
  granularity: z.enum(['minute', 'hour', 'day']).optional().default('hour'),
});

const wsConnectionSchema = z.object({
  userId: z.string().uuid(),
  streams: z.array(z.string()).optional().default(['all']),
  realtime: z.boolean().optional().default(true),
});

// Types
interface RevenueData {
  id: string;
  timestamp: string;
  amount: number;
  currency: string;
  stream: 'subscriptions' | 'one_time' | 'tips' | 'ads' | 'affiliate';
  source: string;
  userId: string;
  metadata: Record<string, any>;
}

interface RevenueMetrics {
  total: number;
  streams: Record<string, number>;
  growth: number;
  forecast?: number;
  breakdown: Array<{
    timestamp: string;
    amount: number;
    stream: string;
  }>;
}

class RevenueTracker {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, any>();

  async initializeWebSocket() {
    if (typeof window !== 'undefined') return; // Client-side guard

    try {
      this.wss = new WebSocketServer({ port: 8080 });
      
      this.wss.on('connection', async (ws, req) => {
        const connectionId = this.generateConnectionId();
        
        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            const validation = wsConnectionSchema.safeParse(message);
            
            if (!validation.success) {
              ws.send(JSON.stringify({ error: 'Invalid connection parameters' }));
              return;
            }

            this.connections.set(connectionId, {
              ws,
              userId: validation.data.userId,
              streams: validation.data.streams,
              realtime: validation.data.realtime,
            });

            // Send initial revenue snapshot
            const snapshot = await this.getRevenueSnapshot(validation.data.userId);
            ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));

            // Subscribe to realtime updates
            if (validation.data.realtime) {
              await this.subscribeToRevenueUpdates(connectionId, validation.data.userId);
            }
          } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({ error: 'Message processing failed' }));
          }
        });

        ws.on('close', () => {
          this.connections.delete(connectionId);
        });
      });
    } catch (error) {
      console.error('WebSocket initialization failed:', error);
    }
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getRevenueData(userId: string, period: string, stream: string): Promise<RevenueMetrics> {
    const cacheKey = `revenue:${userId}:${period}:${stream}`;
    
    try {
      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const { data: revenueData, error } = await supabase
        .rpc('get_revenue_metrics', {
          p_user_id: userId,
          p_period: period,
          p_stream: stream === 'all' ? null : stream
        });

      if (error) throw error;

      const metrics: RevenueMetrics = {
        total: revenueData?.total || 0,
        streams: revenueData?.streams || {},
        growth: revenueData?.growth || 0,
        breakdown: revenueData?.breakdown || []
      };

      // Cache for 30 seconds
      await redis.setex(cacheKey, 30, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      console.error('Revenue data fetch error:', error);
      throw new Error('Failed to fetch revenue data');
    }
  }

  async getRevenueSnapshot(userId: string): Promise<RevenueMetrics> {
    return this.getRevenueData(userId, '24h', 'all');
  }

  async generateForecast(userId: string, period: string): Promise<number> {
    const cacheKey = `forecast:${userId}:${period}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseFloat(cached);
      }

      const { data: forecastData, error } = await supabase
        .rpc('generate_revenue_forecast', {
          p_user_id: userId,
          p_period: period
        });

      if (error) throw error;

      const forecast = forecastData?.forecast || 0;
      
      // Cache forecast for 15 minutes
      await redis.setex(cacheKey, 900, forecast.toString());

      return forecast;
    } catch (error) {
      console.error('Forecast generation error:', error);
      return 0;
    }
  }

  async subscribeToRevenueUpdates(connectionId: string, userId: string) {
    try {
      const channel = supabase
        .channel(`revenue_updates_${userId}`)
        .on('postgres_changes', 
          {
            event: '*',
            schema: 'public',
            table: 'revenue_events',
            filter: `user_id=eq.${userId}`
          },
          async (payload) => {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            const updatedMetrics = await this.getRevenueSnapshot(userId);
            
            connection.ws.send(JSON.stringify({
              type: 'update',
              event: payload.eventType,
              data: updatedMetrics,
              timestamp: new Date().toISOString()
            }));
          }
        )
        .subscribe();

      // Store channel reference for cleanup
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.channel = channel;
      }
    } catch (error) {
      console.error('Realtime subscription error:', error);
    }
  }

  async syncStripeRevenue(userId: string): Promise<void> {
    try {
      const charges = await stripe.charges.list({
        limit: 100,
        created: { gte: Math.floor(Date.now() / 1000) - 86400 }, // Last 24 hours
      });

      for (const charge of charges.data) {
        if (charge.status === 'succeeded') {
          await this.recordRevenueEvent({
            id: charge.id,
            timestamp: new Date(charge.created * 1000).toISOString(),
            amount: charge.amount / 100,
            currency: charge.currency,
            stream: charge.metadata.type === 'subscription' ? 'subscriptions' : 'one_time',
            source: 'stripe',
            userId,
            metadata: {
              chargeId: charge.id,
              customerId: charge.customer,
              description: charge.description,
            }
          });
        }
      }
    } catch (error) {
      console.error('Stripe sync error:', error);
    }
  }

  async recordRevenueEvent(event: RevenueData): Promise<void> {
    try {
      const { error } = await supabase
        .from('revenue_events')
        .upsert({
          id: event.id,
          timestamp: event.timestamp,
          amount: event.amount,
          currency: event.currency,
          stream: event.stream,
          source: event.source,
          user_id: event.userId,
          metadata: event.metadata,
        });

      if (error) throw error;

      // Invalidate related caches
      const cachePatterns = [
        `revenue:${event.userId}:*`,
        `forecast:${event.userId}:*`
      ];

      for (const pattern of cachePatterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      console.error('Revenue event recording error:', error);
      throw error;
    }
  }
}

// Global instance
const revenueTracker = new RevenueTracker();

// Initialize WebSocket on module load
if (typeof window === 'undefined') {
  revenueTracker.initializeWebSocket().catch(console.error);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const queryParams = {
      period: searchParams.get('period') || '24h',
      stream: searchParams.get('stream') || 'all',
      forecast: searchParams.get('forecast') === 'true',
      granularity: searchParams.get('granularity') || 'hour',
    };

    const validation = revenueQuerySchema.safeParse(queryParams);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { period, stream, forecast } = validation.data;

    // Get revenue data
    const metrics = await revenueTracker.getRevenueData(userId, period, stream);

    // Add forecast if requested
    if (forecast) {
      metrics.forecast = await revenueTracker.generateForecast(userId, period);
    }

    // Sync Stripe data in background
    revenueTracker.syncStripeRevenue(userId).catch(console.error);

    return NextResponse.json({
      success: true,
      data: metrics,
      meta: {
        period,
        stream,
        timestamp: new Date().toISOString(),
        forecast: forecast ? metrics.forecast : undefined,
      }
    });

  } catch (error) {
    console.error('Revenue tracking API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    
    const eventSchema = z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      stream: z.enum(['subscriptions', 'one_time', 'tips', 'ads', 'affiliate']),
      source: z.string(),
      metadata: z.record(z.any()).optional().default({}),
    });

    const validation = eventSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid event data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const event: RevenueData = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId,
      ...validation.data,
    };

    await revenueTracker.recordRevenueEvent(event);

    return NextResponse.json({
      success: true,
      data: {
        eventId: event.id,
        recorded: true,
      }
    });

  } catch (error) {
    console.error('Revenue event recording error:', error);
    return NextResponse.json(
      { error: 'Failed to record revenue event' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    
    if (body.action === 'sync_stripe') {
      await revenueTracker.syncStripeRevenue(userId);
      return NextResponse.json({ success: true, message: 'Stripe sync completed' });
    }

    if (body.action === 'refresh_forecast') {
      const period = body.period || '30d';
      const forecast = await revenueTracker.generateForecast(userId, period);
      return NextResponse.json({ success: true, data: { forecast } });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Revenue tracking update error:', error);
    return NextResponse.json(
      { error: 'Update operation failed' },
      { status: 500 }
    );
  }
}
```