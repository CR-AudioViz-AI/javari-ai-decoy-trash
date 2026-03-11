```typescript
/**
 * Brand Partnership Matching Service
 * 
 * Microservice that matches creators with relevant brand sponsorship opportunities
 * using ML-based scoring algorithms that analyze audience demographics, content themes,
 * engagement metrics, and brand criteria.
 * 
 * @fileoverview Main service entry point for brand partnership matching
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { MatchingEngine } from './matching-engine';
import { ScoringAlgorithms } from './scoring-algorithms';
import { AudienceAnalyzer } from './audience-analyzer';
import { ContentThemeExtractor } from './content-theme-extractor';
import { BrandCriteriaProcessor } from './brand-criteria-processor';
import { 
  BrandPartnershipMatch, 
  Creator, 
  Brand, 
  MatchRequest, 
  MatchResult,
  ServiceConfig,
  MatchingMetrics,
  NotificationPayload
} from './types';

/**
 * Request validation schemas
 */
const MatchRequestSchema = z.object({
  creatorId: z.string().uuid(),
  brandIds: z.array(z.string().uuid()).optional(),
  filters: z.object({
    minAudienceSize: z.number().min(0).optional(),
    maxAudienceSize: z.number().min(0).optional(),
    targetDemographics: z.array(z.string()).optional(),
    contentCategories: z.array(z.string()).optional(),
    budgetRange: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional(),
    engagementThreshold: z.number().min(0).max(100).optional()
  }).optional(),
  limit: z.number().min(1).max(100).default(10)
});

const BulkMatchRequestSchema = z.object({
  creatorIds: z.array(z.string().uuid()).max(50),
  filters: MatchRequestSchema.shape.filters,
  limit: z.number().min(1).max(50).default(5)
});

/**
 * Brand Partnership Matching Service
 * 
 * Main service class that orchestrates the matching process between creators
 * and brands using various ML-based algorithms and scoring systems.
 */
export class BrandPartnershipMatchingService {
  private supabase: ReturnType<typeof createClient>;
  private redis: Redis;
  private matchingEngine: MatchingEngine;
  private scoringAlgorithms: ScoringAlgorithms;
  private audienceAnalyzer: AudienceAnalyzer;
  private contentThemeExtractor: ContentThemeExtractor;
  private brandCriteriaProcessor: BrandCriteriaProcessor;
  private config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.redis = new Redis(config.redisUrl);
    
    // Initialize service components
    this.matchingEngine = new MatchingEngine(config);
    this.scoringAlgorithms = new ScoringAlgorithms(config);
    this.audienceAnalyzer = new AudienceAnalyzer(config);
    this.contentThemeExtractor = new ContentThemeExtractor(config);
    this.brandCriteriaProcessor = new BrandCriteriaProcessor(config);
  }

  /**
   * Find matching brands for a specific creator
   * 
   * @param request - Match request parameters
   * @returns Promise<MatchResult> - Matching results with scores
   */
  async findMatches(request: unknown): Promise<MatchResult> {
    try {
      const validatedRequest = MatchRequestSchema.parse(request);
      
      // Get creator profile and analyze audience
      const creator = await this.getCreatorProfile(validatedRequest.creatorId);
      if (!creator) {
        throw new Error(`Creator not found: ${validatedRequest.creatorId}`);
      }

      // Check cache for recent matches
      const cacheKey = this.generateCacheKey('matches', validatedRequest);
      const cachedResult = await this.getCachedResult<MatchResult>(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Analyze creator's audience and content
      const audienceAnalysis = await this.audienceAnalyzer.analyzeCreatorAudience(creator);
      const contentThemes = await this.contentThemeExtractor.extractThemes(creator);

      // Get potential brand matches
      const brands = await this.getBrandCandidates(validatedRequest);
      
      // Score and rank matches
      const scoredMatches = await Promise.all(
        brands.map(async (brand) => {
          const brandCriteria = await this.brandCriteriaProcessor.processCriteria(brand);
          const matchScore = await this.scoringAlgorithms.calculateMatchScore(
            creator,
            brand,
            audienceAnalysis,
            contentThemes,
            brandCriteria
          );

          return {
            brand,
            score: matchScore.overallScore,
            breakdown: matchScore.scoreBreakdown,
            confidence: matchScore.confidence,
            reasons: matchScore.matchReasons,
            estimatedRevenue: this.estimateRevenue(creator, brand, matchScore.overallScore)
          };
        })
      );

      // Filter and sort results
      const filteredMatches = scoredMatches
        .filter(match => match.score >= (this.config.minimumMatchScore || 0.6))
        .sort((a, b) => b.score - a.score)
        .slice(0, validatedRequest.limit);

      const result: MatchResult = {
        creatorId: validatedRequest.creatorId,
        matches: filteredMatches,
        totalMatches: filteredMatches.length,
        processingTime: Date.now(),
        metadata: {
          audienceSize: audienceAnalysis.totalAudienceSize,
          primaryDemographics: audienceAnalysis.primaryDemographics,
          contentCategories: contentThemes.primaryCategories,
          averageEngagement: audienceAnalysis.averageEngagementRate
        }
      };

      // Cache result
      await this.cacheResult(cacheKey, result, 3600); // 1 hour cache

      // Log metrics
      await this.logMatchingMetrics({
        creatorId: validatedRequest.creatorId,
        totalBrandsEvaluated: brands.length,
        matchesFound: filteredMatches.length,
        averageScore: filteredMatches.reduce((sum, m) => sum + m.score, 0) / filteredMatches.length || 0,
        processingTimeMs: result.processingTime
      });

      return result;

    } catch (error) {
      console.error('Error in findMatches:', error);
      throw new Error(`Failed to find brand matches: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process bulk matching for multiple creators
   * 
   * @param request - Bulk match request
   * @returns Promise<MatchResult[]> - Array of match results
   */
  async findBulkMatches(request: unknown): Promise<MatchResult[]> {
    try {
      const validatedRequest = BulkMatchRequestSchema.parse(request);
      
      const results = await Promise.allSettled(
        validatedRequest.creatorIds.map(creatorId =>
          this.findMatches({
            creatorId,
            filters: validatedRequest.filters,
            limit: validatedRequest.limit
          })
        )
      );

      return results
        .filter((result): result is PromiseFulfilledResult<MatchResult> => result.status === 'fulfilled')
        .map(result => result.value);

    } catch (error) {
      console.error('Error in findBulkMatches:', error);
      throw new Error(`Failed to process bulk matches: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get creator compatibility score with a specific brand
   * 
   * @param creatorId - Creator UUID
   * @param brandId - Brand UUID
   * @returns Promise<number> - Compatibility score (0-1)
   */
  async getCompatibilityScore(creatorId: string, brandId: string): Promise<number> {
    try {
      const cacheKey = `compatibility:${creatorId}:${brandId}`;
      const cachedScore = await this.getCachedResult<number>(cacheKey);
      if (cachedScore !== null) {
        return cachedScore;
      }

      const [creator, brand] = await Promise.all([
        this.getCreatorProfile(creatorId),
        this.getBrandProfile(brandId)
      ]);

      if (!creator || !brand) {
        throw new Error('Creator or brand not found');
      }

      const audienceAnalysis = await this.audienceAnalyzer.analyzeCreatorAudience(creator);
      const contentThemes = await this.contentThemeExtractor.extractThemes(creator);
      const brandCriteria = await this.brandCriteriaProcessor.processCriteria(brand);

      const matchScore = await this.scoringAlgorithms.calculateMatchScore(
        creator,
        brand,
        audienceAnalysis,
        contentThemes,
        brandCriteria
      );

      await this.cacheResult(cacheKey, matchScore.overallScore, 1800); // 30 minutes cache

      return matchScore.overallScore;

    } catch (error) {
      console.error('Error calculating compatibility score:', error);
      throw new Error(`Failed to calculate compatibility: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send partnership proposal to brand
   * 
   * @param match - Brand partnership match
   * @param message - Custom message from creator
   * @returns Promise<boolean> - Success status
   */
  async sendPartnershipProposal(match: BrandPartnershipMatch, message?: string): Promise<boolean> {
    try {
      // Create partnership proposal record
      const { data: proposal, error } = await this.supabase
        .from('partnership_proposals')
        .insert({
          creator_id: match.creatorId,
          brand_id: match.brand.id,
          match_score: match.score,
          estimated_revenue: match.estimatedRevenue,
          proposal_message: message,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Send notification to brand
      const notificationPayload: NotificationPayload = {
        type: 'partnership_proposal',
        brandId: match.brand.id,
        creatorId: match.creatorId,
        proposalId: proposal.id,
        matchScore: match.score,
        message
      };

      await this.sendNotification(notificationPayload);

      // Update creator's proposal count
      await this.updateCreatorMetrics(match.creatorId, 'proposals_sent');

      return true;

    } catch (error) {
      console.error('Error sending partnership proposal:', error);
      return false;
    }
  }

  /**
   * Get matching metrics and analytics
   * 
   * @param creatorId - Creator UUID
   * @param timeRange - Time range for metrics (days)
   * @returns Promise<MatchingMetrics> - Matching performance metrics
   */
  async getMatchingMetrics(creatorId: string, timeRange: number = 30): Promise<MatchingMetrics> {
    try {
      const { data: metrics, error } = await this.supabase
        .from('matching_metrics')
        .select('*')
        .eq('creator_id', creatorId)
        .gte('created_at', new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw error;
      }

      return this.aggregateMetrics(metrics);

    } catch (error) {
      console.error('Error getting matching metrics:', error);
      throw new Error(`Failed to get metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update creator profile for better matching
   * 
   * @param creatorId - Creator UUID
   * @param updates - Profile updates
   * @returns Promise<boolean> - Success status
   */
  async updateCreatorProfile(creatorId: string, updates: Partial<Creator>): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('creator_profiles')
        .update(updates)
        .eq('id', creatorId);

      if (error) {
        throw error;
      }

      // Invalidate related caches
      await this.invalidateCreatorCaches(creatorId);

      return true;

    } catch (error) {
      console.error('Error updating creator profile:', error);
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private async getCreatorProfile(creatorId: string): Promise<Creator | null> {
    const { data, error } = await this.supabase
      .from('creator_profiles')
      .select('*')
      .eq('id', creatorId)
      .single();

    if (error) {
      console.error('Error fetching creator:', error);
      return null;
    }

    return data;
  }

  private async getBrandProfile(brandId: string): Promise<Brand | null> {
    const { data, error } = await this.supabase
      .from('brand_profiles')
      .select('*')
      .eq('id', brandId)
      .single();

    if (error) {
      console.error('Error fetching brand:', error);
      return null;
    }

    return data;
  }

  private async getBrandCandidates(request: z.infer<typeof MatchRequestSchema>): Promise<Brand[]> {
    let query = this.supabase.from('brand_profiles').select('*');

    if (request.brandIds?.length) {
      query = query.in('id', request.brandIds);
    }

    if (request.filters?.budgetRange) {
      query = query
        .gte('budget_min', request.filters.budgetRange.min)
        .lte('budget_max', request.filters.budgetRange.max);
    }

    if (request.filters?.contentCategories?.length) {
      query = query.overlaps('target_categories', request.filters.contentCategories);
    }

    query = query.eq('status', 'active').limit(100);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  private estimateRevenue(creator: Creator, brand: Brand, matchScore: number): number {
    const baseRate = creator.averageEngagement * creator.followerCount * 0.001;
    const brandMultiplier = brand.budgetTier === 'premium' ? 2 : brand.budgetTier === 'standard' ? 1.5 : 1;
    const scoreMultiplier = Math.max(0.5, matchScore);

    return Math.round(baseRate * brandMultiplier * scoreMultiplier);
  }

  private generateCacheKey(prefix: string, data: any): string {
    const hash = Buffer.from(JSON.stringify(data)).toString('base64');
    return `${prefix}:${hash}`;
  }

  private async getCachedResult<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheResult(key: string, data: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.error('Cache error:', error);
    }
  }

  private async logMatchingMetrics(metrics: Partial<MatchingMetrics>): Promise<void> {
    try {
      await this.supabase.from('matching_metrics').insert({
        ...metrics,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging metrics:', error);
    }
  }

  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      await fetch(`${this.config.webhookUrl}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  private async updateCreatorMetrics(creatorId: string, metric: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_creator_metric', {
        creator_id: creatorId,
        metric_name: metric
      });
    } catch (error) {
      console.error('Error updating creator metrics:', error);
    }
  }

  private aggregateMetrics(rawMetrics: any[]): MatchingMetrics {
    return {
      totalMatches: rawMetrics.reduce((sum, m) => sum + (m.matches_found || 0), 0),
      averageScore: rawMetrics.reduce((sum, m) => sum + (m.average_score || 0), 0) / rawMetrics.length || 0,
      proposalsSent: rawMetrics.reduce((sum, m) => sum + (m.proposals_sent || 0), 0),
      successRate: rawMetrics.filter(m => m.success).length / rawMetrics.length || 0,
      averageProcessingTime: rawMetrics.reduce((sum, m) => sum + (m.processing_time_ms || 0), 0) / rawMetrics.length || 0
    };
  }

  private async invalidateCreatorCaches(creatorId: string): Promise<void> {
    try {
      const pattern = `*${creatorId}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Error invalidating caches:', error);
    }
  }

  /**
   * Health check for the service
   * 
   * @returns Promise<boolean> - Service health status
   */
  async healthCheck(): Promise<boolean> {
    try {
      await Promise.all([
        this.supabase.from('creator_profiles').select('id').limit(1),
        this.redis.ping()
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

/**
 * Factory function to create service instance
 * 
 * @param config - Service configuration
 * @returns BrandPartnershipMatchingService instance
 */
export function createBrandPartnershipMatchingService(config: ServiceConfig): BrandPartnershipMatchingService {
  return new BrandPartnershipMatchingService(config);
}

/**
 * Export types for external use
 */
export type {
  BrandPartnershipMatch,
  Creator,
  Brand,
  MatchRequest,
  MatchResult,
  ServiceConfig,
  MatchingMetrics,
  NotificationPayload
};

export default BrandPartnershipMatchingService;
```