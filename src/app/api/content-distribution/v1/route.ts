```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Redis } from '@upstash/redis';

// Types
interface EdgeLocation {
  id: string;
  region: string;
  endpoint: string;
  isHealthy: boolean;
  latency: number;
  load: number;
  capacity: number;
  lastHealthCheck: Date;
  coordinates: {
    lat: number;
    lng: number;
  };
}

interface ContentRequest {
  contentId: string;
  contentType: 'audio' | 'video' | 'image' | 'data';
  quality?: string;
  format?: string;
  userAgent?: string;
  acceptLanguage?: string;
}

interface DistributionResult {
  edgeLocation: EdgeLocation;
  contentUrl: string;
  cdnUrl: string;
  estimatedLatency: number;
  fallbackUrls: string[];
  cacheStatus: 'hit' | 'miss' | 'stale';
  region: string;
}

// Validation schemas
const ContentRequestSchema = z.object({
  contentId: z.string().min(1).max(255),
  contentType: z.enum(['audio', 'video', 'image', 'data']),
  quality: z.string().optional(),
  format: z.string().optional(),
  userAgent: z.string().optional(),
  acceptLanguage: z.string().optional()
});

const RegionConfigSchema = z.object({
  regions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    endpoints: z.array(z.string().url()),
    priority: z.number().min(1).max(10),
    healthCheckUrl: z.string().url()
  }))
});

// Initialize services
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

class GeoLocationService {
  static async getLocationFromIP(ip: string): Promise<{ country: string; region: string; lat: number; lng: number; city: string } | null> {
    try {
      const response = await fetch(`https://ipapi.co/${ip}/json/`, {
        headers: { 'User-Agent': 'CR-AudioViz-CDN/1.0' },
        signal: AbortSignal.timeout(3000)
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      
      return {
        country: data.country_name || 'Unknown',
        region: data.region || 'Unknown',
        lat: parseFloat(data.latitude) || 0,
        lng: parseFloat(data.longitude) || 0,
        city: data.city || 'Unknown'
      };
    } catch (error) {
      console.error('GeoLocation error:', error);
      return null;
    }
  }

  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

class EdgeLocationManager {
  private static readonly HEALTH_CHECK_CACHE_TTL = 60; // seconds
  private static readonly LOAD_THRESHOLD = 0.8;

  static async getHealthyEdgeLocations(): Promise<EdgeLocation[]> {
    try {
      const cached = await redis.get('edge_locations:healthy');
      if (cached) {
        return JSON.parse(cached as string);
      }

      const { data: locations, error } = await supabase
        .from('edge_locations')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) throw error;

      const healthyLocations: EdgeLocation[] = [];
      
      for (const location of locations || []) {
        const health = await this.checkEdgeHealth(location.endpoint);
        if (health.isHealthy && health.load < this.LOAD_THRESHOLD) {
          healthyLocations.push({
            id: location.id,
            region: location.region,
            endpoint: location.endpoint,
            isHealthy: health.isHealthy,
            latency: health.latency,
            load: health.load,
            capacity: location.capacity,
            lastHealthCheck: new Date(),
            coordinates: {
              lat: location.latitude,
              lng: location.longitude
            }
          });
        }
      }

      // Cache for 1 minute
      await redis.setex('edge_locations:healthy', this.HEALTH_CHECK_CACHE_TTL, JSON.stringify(healthyLocations));
      
      return healthyLocations;
    } catch (error) {
      console.error('Edge locations fetch error:', error);
      return [];
    }
  }

  private static async checkEdgeHealth(endpoint: string): Promise<{ isHealthy: boolean; latency: number; load: number }> {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CR-AudioViz-HealthCheck/1.0'
        }
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!response.ok) {
        return { isHealthy: false, latency: latency, load: 1.0 };
      }

      const healthData = await response.json();
      
      return {
        isHealthy: response.status === 200 && healthData.status === 'healthy',
        latency: latency,
        load: healthData.load || 0
      };
    } catch (error) {
      return { isHealthy: false, latency: 9999, load: 1.0 };
    }
  }
}

class LoadBalancingStrategy {
  static selectOptimalEdge(
    userLocation: { lat: number; lng: number },
    availableEdges: EdgeLocation[]
  ): EdgeLocation | null {
    if (availableEdges.length === 0) return null;

    // Calculate weighted score for each edge
    const scoredEdges = availableEdges.map(edge => {
      const distance = GeoLocationService.calculateDistance(
        userLocation.lat, userLocation.lng,
        edge.coordinates.lat, edge.coordinates.lng
      );
      
      // Scoring algorithm: lower is better
      const distanceScore = Math.min(distance / 1000, 10); // Normalize to 0-10
      const latencyScore = Math.min(edge.latency / 100, 10); // Normalize to 0-10
      const loadScore = edge.load * 10; // 0-10 scale
      
      const totalScore = (distanceScore * 0.4) + (latencyScore * 0.3) + (loadScore * 0.3);
      
      return { edge, score: totalScore };
    });

    // Sort by score (lowest first)
    scoredEdges.sort((a, b) => a.score - b.score);
    
    return scoredEdges[0].edge;
  }
}

class FailoverHandler {
  static async handleFailover(
    primaryEdge: EdgeLocation,
    allEdges: EdgeLocation[],
    userLocation: { lat: number; lng: number }
  ): Promise<EdgeLocation | null> {
    try {
      // Remove the failed primary edge
      const availableEdges = allEdges.filter(edge => edge.id !== primaryEdge.id);
      
      if (availableEdges.length === 0) return null;

      // Log the failover event
      await supabase.from('failover_events').insert({
        failed_edge_id: primaryEdge.id,
        failed_region: primaryEdge.region,
        timestamp: new Date().toISOString(),
        user_location: userLocation
      });

      // Select next best edge
      return LoadBalancingStrategy.selectOptimalEdge(userLocation, availableEdges);
    } catch (error) {
      console.error('Failover handling error:', error);
      return availableEdges.length > 0 ? availableEdges[0] : null;
    }
  }
}

class ContentCacheManager {
  private static readonly CACHE_TTL = 3600; // 1 hour

  static async getCachedContent(contentId: string, region: string): Promise<string | null> {
    try {
      const cacheKey = `content:${region}:${contentId}`;
      const cached = await redis.get(cacheKey);
      return cached as string | null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  static async setCachedContent(contentId: string, region: string, url: string): Promise<void> {
    try {
      const cacheKey = `content:${region}:${contentId}`;
      await redis.setex(cacheKey, this.CACHE_TTL, url);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  static async invalidateContent(contentId: string): Promise<void> {
    try {
      const pattern = `content:*:${contentId}`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }
}

class MetricsCollector {
  static async recordDistribution(
    contentId: string,
    region: string,
    latency: number,
    cacheStatus: string
  ): Promise<void> {
    try {
      await Promise.all([
        // Store in Supabase
        supabase.from('distribution_metrics').insert({
          content_id: contentId,
          region: region,
          latency_ms: latency,
          cache_status: cacheStatus,
          timestamp: new Date().toISOString()
        }),
        
        // Store in Redis for real-time metrics
        redis.lpush('metrics:distribution', JSON.stringify({
          contentId,
          region,
          latency,
          cacheStatus,
          timestamp: Date.now()
        }))
      ]);
    } catch (error) {
      console.error('Metrics recording error:', error);
    }
  }
}

// Main API handlers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');
    
    if (!contentId) {
      return NextResponse.json(
        { error: 'Content ID is required', code: 'MISSING_CONTENT_ID' },
        { status: 400 }
      );
    }

    // Get user location from IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const clientIP = forwardedFor?.split(',')[0] || realIP || '127.0.0.1';
    
    const userLocation = await GeoLocationService.getLocationFromIP(clientIP);
    if (!userLocation) {
      return NextResponse.json(
        { error: 'Unable to determine user location', code: 'GEOLOCATION_FAILED' },
        { status: 400 }
      );
    }

    // Get healthy edge locations
    const edgeLocations = await EdgeLocationManager.getHealthyEdgeLocations();
    if (edgeLocations.length === 0) {
      return NextResponse.json(
        { error: 'No healthy edge locations available', code: 'NO_EDGES_AVAILABLE' },
        { status: 503 }
      );
    }

    // Select optimal edge
    const optimalEdge = LoadBalancingStrategy.selectOptimalEdge(userLocation, edgeLocations);
    if (!optimalEdge) {
      return NextResponse.json(
        { error: 'Unable to select optimal edge location', code: 'EDGE_SELECTION_FAILED' },
        { status: 503 }
      );
    }

    // Check cache first
    const cachedUrl = await ContentCacheManager.getCachedContent(contentId, optimalEdge.region);
    const cacheStatus = cachedUrl ? 'hit' : 'miss';

    // Generate content URL
    const contentUrl = cachedUrl || `${optimalEdge.endpoint}/content/${contentId}`;
    const cdnUrl = `https://cdn.cr-audioviz.com/${optimalEdge.region}/${contentId}`;

    // Generate fallback URLs
    const fallbackEdges = edgeLocations
      .filter(edge => edge.id !== optimalEdge.id)
      .slice(0, 2);
    const fallbackUrls = fallbackEdges.map(edge => `${edge.endpoint}/content/${contentId}`);

    // Cache the content URL if not cached
    if (!cachedUrl) {
      await ContentCacheManager.setCachedContent(contentId, optimalEdge.region, contentUrl);
    }

    const result: DistributionResult = {
      edgeLocation: optimalEdge,
      contentUrl,
      cdnUrl,
      estimatedLatency: optimalEdge.latency,
      fallbackUrls,
      cacheStatus: cacheStatus as 'hit' | 'miss' | 'stale',
      region: optimalEdge.region
    };

    // Record metrics asynchronously
    MetricsCollector.recordDistribution(
      contentId,
      optimalEdge.region,
      optimalEdge.latency,
      cacheStatus
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        userLocation: {
          city: userLocation.city,
          region: userLocation.region,
          country: userLocation.country
        },
        selectedEdge: optimalEdge.id,
        availableEdges: edgeLocations.length,
        cacheStatus
      }
    });

  } catch (error) {
    console.error('Content distribution error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedRequest = ContentRequestSchema.parse(body);

    // Get user location
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const clientIP = forwardedFor?.split(',')[0] || realIP || '127.0.0.1';
    
    const userLocation = await GeoLocationService.getLocationFromIP(clientIP);
    if (!userLocation) {
      return NextResponse.json(
        { error: 'Unable to determine user location', code: 'GEOLOCATION_FAILED' },
        { status: 400 }
      );
    }

    // Process content request with additional parameters
    const edgeLocations = await EdgeLocationManager.getHealthyEdgeLocations();
    if (edgeLocations.length === 0) {
      return NextResponse.json(
        { error: 'No healthy edge locations available', code: 'NO_EDGES_AVAILABLE' },
        { status: 503 }
      );
    }

    // Filter edges by content type capability if specified
    const compatibleEdges = edgeLocations.filter(edge => {
      // Add logic to filter by content type support
      return true; // Simplified for this implementation
    });

    const optimalEdge = LoadBalancingStrategy.selectOptimalEdge(userLocation, compatibleEdges);
    if (!optimalEdge) {
      return NextResponse.json(
        { error: 'No compatible edge locations found', code: 'NO_COMPATIBLE_EDGES' },
        { status: 503 }
      );
    }

    // Build content URL with parameters
    const params = new URLSearchParams();
    if (validatedRequest.quality) params.set('quality', validatedRequest.quality);
    if (validatedRequest.format) params.set('format', validatedRequest.format);
    
    const contentUrl = `${optimalEdge.endpoint}/content/${validatedRequest.contentId}?${params.toString()}`;
    const cdnUrl = `https://cdn.cr-audioviz.com/${optimalEdge.region}/${validatedRequest.contentId}?${params.toString()}`;

    const result: DistributionResult = {
      edgeLocation: optimalEdge,
      contentUrl,
      cdnUrl,
      estimatedLatency: optimalEdge.latency,
      fallbackUrls: compatibleEdges
        .filter(edge => edge.id !== optimalEdge.id)
        .slice(0, 2)
        .map(edge => `${edge.endpoint}/content/${validatedRequest.contentId}?${params.toString()}`),
      cacheStatus: 'miss',
      region: optimalEdge.region
    };

    return NextResponse.json({
      success: true,
      data: result,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request format', 
          code: 'VALIDATION_ERROR',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    console.error('Content distribution POST error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');
    
    if (!contentId) {
      return NextResponse.json(
        { error: 'Content ID is required', code: 'MISSING_CONTENT_ID' },
        { status: 400 }
      );
    }

    // Invalidate cache across all regions
    await ContentCacheManager.invalidateContent(contentId);

    return NextResponse.json({
      success: true,
      message: `Cache invalidated for content ${contentId}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache invalidation error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```