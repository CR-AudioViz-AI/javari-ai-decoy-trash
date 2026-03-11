```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

/**
 * Reputation dimension weights and configuration
 */
interface ReputationWeights {
  contributions: number;
  peerReviews: number;
  expertise: number;
  communityImpact: number;
  consistency: number;
  recency: number;
}

/**
 * User contribution data structure
 */
interface UserContribution {
  id: string;
  userId: string;
  type: 'content' | 'code' | 'review' | 'moderation' | 'help';
  quality: number;
  impact: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

/**
 * Peer review data structure
 */
interface PeerReview {
  id: string;
  reviewerId: string;
  targetUserId: string;
  contributionId: string;
  score: number;
  credibility: number;
  feedback: string;
  timestamp: Date;
}

/**
 * Expertise demonstration record
 */
interface ExpertiseDemonstration {
  id: string;
  userId: string;
  domain: string;
  level: number;
  evidence: string[];
  validatedBy: string[];
  timestamp: Date;
}

/**
 * Community interaction metrics
 */
interface CommunityInteraction {
  id: string;
  userId: string;
  type: 'help' | 'mentorship' | 'collaboration' | 'leadership';
  participants: string[];
  outcome: 'positive' | 'neutral' | 'negative';
  impact: number;
  timestamp: Date;
}

/**
 * Multi-dimensional reputation score
 */
interface ReputationScore {
  userId: string;
  overall: number;
  dimensions: {
    contributions: number;
    peerReviews: number;
    expertise: number;
    communityImpact: number;
    consistency: number;
    recency: number;
  };
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  lastUpdated: Date;
  rank: number;
}

/**
 * Reputation history entry
 */
interface ReputationHistory {
  id: string;
  userId: string;
  previousScore: number;
  newScore: number;
  change: number;
  reason: string;
  factors: Record<string, number>;
  timestamp: Date;
}

/**
 * Gaming detection flags
 */
interface GamingDetection {
  userId: string;
  flags: {
    rapidScoreIncrease: boolean;
    suspiciousPatterns: boolean;
    reviewManipulation: boolean;
    sockPuppeting: boolean;
    coordinated: boolean;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
}

/**
 * Service configuration options
 */
interface ReputationServiceConfig {
  supabaseUrl: string;
  supabaseKey: string;
  redisUrl: string;
  weights: ReputationWeights;
  gamingThresholds: {
    rapidIncreaseThreshold: number;
    patternDetectionWindow: number;
    reviewManipulationThreshold: number;
    sockPuppetSimilarity: number;
  };
  mlScoringApiUrl: string;
  cacheTimeouts: {
    reputation: number;
    history: number;
    interactions: number;
  };
}

/**
 * Advanced Community Reputation Service
 * 
 * Provides comprehensive reputation calculation with multi-dimensional scoring,
 * peer review integration, expertise validation, community impact assessment,
 * and sophisticated gaming protection mechanisms.
 */
export class AdvancedReputationService extends EventEmitter {
  private supabase: SupabaseClient;
  private redis: Redis;
  private config: ReputationServiceConfig;
  private isInitialized = false;

  constructor(config: ReputationServiceConfig) {
    super();
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.redis = new Redis(config.redisUrl);
    this.setupEventHandlers();
  }

  /**
   * Initialize the reputation service
   */
  async initialize(): Promise<void> {
    try {
      // Test database connections
      await this.supabase.from('reputation_scores').select('count').limit(1);
      await this.redis.ping();

      // Setup real-time subscriptions
      this.setupRealtimeSubscriptions();

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new Error(`Failed to initialize reputation service: ${error}`);
    }
  }

  /**
   * Calculate comprehensive reputation score for a user
   */
  async calculateReputationScore(userId: string): Promise<ReputationScore> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    try {
      // Check cache first
      const cached = await this.getCachedReputation(userId);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // Gather all reputation factors
      const [
        contributions,
        peerReviews,
        expertise,
        communityImpact,
        historicalData
      ] = await Promise.all([
        this.analyzeContributions(userId),
        this.processPeerReviews(userId),
        this.validateExpertise(userId),
        this.calculateCommunityImpact(userId),
        this.getReputationHistory(userId)
      ]);

      // Check for gaming attempts
      const gamingDetection = await this.detectGaming(userId, {
        contributions,
        peerReviews,
        historicalData
      });

      // Calculate dimension scores
      const dimensions = {
        contributions: this.calculateContributionScore(contributions),
        peerReviews: this.calculatePeerReviewScore(peerReviews),
        expertise: this.calculateExpertiseScore(expertise),
        communityImpact: this.calculateCommunityImpactScore(communityImpact),
        consistency: this.calculateConsistencyScore(historicalData),
        recency: this.calculateRecencyScore(historicalData)
      };

      // Apply gaming protection
      const protectedDimensions = this.applyGamingProtection(dimensions, gamingDetection);

      // Aggregate final score
      const overall = this.aggregateReputationScore(protectedDimensions);
      
      // Determine trend
      const trend = this.calculateTrend(historicalData, overall);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(protectedDimensions, gamingDetection);
      
      // Get user rank
      const rank = await this.calculateUserRank(overall);

      const reputationScore: ReputationScore = {
        userId,
        overall,
        dimensions: protectedDimensions,
        trend,
        confidence,
        lastUpdated: new Date(),
        rank
      };

      // Cache and store
      await Promise.all([
        this.cacheReputation(reputationScore),
        this.storeReputationScore(reputationScore),
        this.updateReputationHistory(userId, overall, 'calculated', protectedDimensions)
      ]);

      this.emit('reputationCalculated', { userId, score: reputationScore });
      return reputationScore;

    } catch (error) {
      this.emit('error', { operation: 'calculateReputationScore', userId, error });
      throw new Error(`Failed to calculate reputation: ${error}`);
    }
  }

  /**
   * Analyze user contributions for reputation scoring
   */
  private async analyzeContributions(userId: string): Promise<UserContribution[]> {
    const { data, error } = await this.supabase
      .from('user_contributions')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch contributions: ${error.message}`);
    }

    return data?.map(contrib => ({
      id: contrib.id,
      userId: contrib.user_id,
      type: contrib.type,
      quality: contrib.quality_score || 0,
      impact: contrib.impact_score || 0,
      timestamp: new Date(contrib.created_at),
      metadata: contrib.metadata || {}
    })) || [];
  }

  /**
   * Process peer reviews for reputation calculation
   */
  private async processPeerReviews(userId: string): Promise<PeerReview[]> {
    const { data, error } = await this.supabase
      .from('peer_reviews')
      .select('*')
      .eq('target_user_id', userId)
      .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch peer reviews: ${error.message}`);
    }

    return data?.map(review => ({
      id: review.id,
      reviewerId: review.reviewer_id,
      targetUserId: review.target_user_id,
      contributionId: review.contribution_id,
      score: review.score,
      credibility: review.credibility_score || 1,
      feedback: review.feedback,
      timestamp: new Date(review.created_at)
    })) || [];
  }

  /**
   * Validate user expertise for domain authority calculation
   */
  private async validateExpertise(userId: string): Promise<ExpertiseDemonstration[]> {
    const { data, error } = await this.supabase
      .from('expertise_demonstrations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch expertise data: ${error.message}`);
    }

    return data?.map(exp => ({
      id: exp.id,
      userId: exp.user_id,
      domain: exp.domain,
      level: exp.level,
      evidence: exp.evidence || [],
      validatedBy: exp.validated_by || [],
      timestamp: new Date(exp.created_at)
    })) || [];
  }

  /**
   * Calculate community impact metrics
   */
  private async calculateCommunityImpact(userId: string): Promise<CommunityInteraction[]> {
    const { data, error } = await this.supabase
      .from('community_interactions')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch community interactions: ${error.message}`);
    }

    return data?.map(interaction => ({
      id: interaction.id,
      userId: interaction.user_id,
      type: interaction.type,
      participants: interaction.participants || [],
      outcome: interaction.outcome,
      impact: interaction.impact_score || 0,
      timestamp: new Date(interaction.created_at)
    })) || [];
  }

  /**
   * Detect potential gaming attempts
   */
  private async detectGaming(userId: string, data: any): Promise<GamingDetection> {
    const flags = {
      rapidScoreIncrease: this.detectRapidIncrease(data.historicalData),
      suspiciousPatterns: this.detectSuspiciousPatterns(data.contributions),
      reviewManipulation: this.detectReviewManipulation(data.peerReviews),
      sockPuppeting: await this.detectSockPuppeting(userId),
      coordinated: await this.detectCoordinatedActivity(userId)
    };

    const severity = this.calculateGamingSeverity(flags);
    const confidence = this.calculateGamingConfidence(flags);

    return {
      userId,
      flags,
      severity,
      confidence
    };
  }

  /**
   * Calculate contribution score component
   */
  private calculateContributionScore(contributions: UserContribution[]): number {
    if (contributions.length === 0) return 0;

    const qualityAvg = contributions.reduce((sum, c) => sum + c.quality, 0) / contributions.length;
    const impactAvg = contributions.reduce((sum, c) => sum + c.impact, 0) / contributions.length;
    const volumeBonus = Math.min(contributions.length / 100, 1) * 0.2;
    const diversityBonus = this.calculateTypeDiversity(contributions) * 0.1;

    return Math.min((qualityAvg * 0.4 + impactAvg * 0.4 + volumeBonus + diversityBonus) * 100, 100);
  }

  /**
   * Calculate peer review score component
   */
  private calculatePeerReviewScore(reviews: PeerReview[]): number {
    if (reviews.length === 0) return 0;

    const weightedScore = reviews.reduce((sum, review) => {
      return sum + (review.score * review.credibility);
    }, 0);

    const totalCredibility = reviews.reduce((sum, review) => sum + review.credibility, 0);
    
    return totalCredibility > 0 ? (weightedScore / totalCredibility) * 10 : 0;
  }

  /**
   * Calculate expertise score component
   */
  private calculateExpertiseScore(expertise: ExpertiseDemonstration[]): number {
    if (expertise.length === 0) return 0;

    const domainScores = expertise.reduce((acc, exp) => {
      const validationBonus = exp.validatedBy.length * 0.2;
      const evidenceBonus = Math.min(exp.evidence.length * 0.1, 0.5);
      const domainScore = exp.level + validationBonus + evidenceBonus;
      
      acc[exp.domain] = Math.max(acc[exp.domain] || 0, domainScore);
      return acc;
    }, {} as Record<string, number>);

    const avgDomainScore = Object.values(domainScores).reduce((sum, score) => sum + score, 0) / Object.keys(domainScores).length;
    const diversityBonus = Math.min(Object.keys(domainScores).length / 5, 1) * 0.3;

    return Math.min((avgDomainScore + diversityBonus) * 10, 100);
  }

  /**
   * Calculate community impact score component
   */
  private calculateCommunityImpactScore(interactions: CommunityInteraction[]): number {
    if (interactions.length === 0) return 0;

    const positiveImpact = interactions
      .filter(i => i.outcome === 'positive')
      .reduce((sum, i) => sum + i.impact, 0);

    const negativeImpact = interactions
      .filter(i => i.outcome === 'negative')
      .reduce((sum, i) => sum + i.impact, 0);

    const netImpact = positiveImpact - (negativeImpact * 0.5);
    const leadershipBonus = interactions.filter(i => i.type === 'leadership').length * 0.5;
    const mentorshipBonus = interactions.filter(i => i.type === 'mentorship').length * 0.3;

    return Math.max(0, Math.min((netImpact + leadershipBonus + mentorshipBonus) * 2, 100));
  }

  /**
   * Calculate consistency score based on historical data
   */
  private calculateConsistencyScore(historicalData: ReputationHistory[]): number {
    if (historicalData.length < 10) return 50; // Neutral for insufficient data

    const changes = historicalData.map(h => Math.abs(h.change));
    const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const variance = changes.reduce((sum, change) => sum + Math.pow(change - avgChange, 2), 0) / changes.length;
    const standardDeviation = Math.sqrt(variance);

    // Lower standard deviation means higher consistency
    return Math.max(0, 100 - (standardDeviation * 10));
  }

  /**
   * Calculate recency score based on recent activity
   */
  private calculateRecencyScore(historicalData: ReputationHistory[]): number {
    if (historicalData.length === 0) return 0;

    const now = Date.now();
    const recentActivities = historicalData.filter(h => 
      now - h.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000 // 30 days
    );

    const recencyRatio = recentActivities.length / Math.min(historicalData.length, 30);
    const activityTrend = recentActivities.length > 0 ? 
      recentActivities.reduce((sum, h) => sum + h.change, 0) / recentActivities.length : 0;

    return Math.min((recencyRatio * 50) + Math.max(0, activityTrend * 10), 100);
  }

  /**
   * Apply gaming protection to dimension scores
   */
  private applyGamingProtection(
    dimensions: ReputationScore['dimensions'], 
    detection: GamingDetection
  ): ReputationScore['dimensions'] {
    const penalties = this.calculateGamingPenalties(detection);
    
    return {
      contributions: Math.max(0, dimensions.contributions - penalties.contributions),
      peerReviews: Math.max(0, dimensions.peerReviews - penalties.peerReviews),
      expertise: Math.max(0, dimensions.expertise - penalties.expertise),
      communityImpact: Math.max(0, dimensions.communityImpact - penalties.communityImpact),
      consistency: Math.max(0, dimensions.consistency - penalties.consistency),
      recency: Math.max(0, dimensions.recency - penalties.recency)
    };
  }

  /**
   * Aggregate final reputation score from dimensions
   */
  private aggregateReputationScore(dimensions: ReputationScore['dimensions']): number {
    const weights = this.config.weights;
    
    return Math.min(
      (dimensions.contributions * weights.contributions) +
      (dimensions.peerReviews * weights.peerReviews) +
      (dimensions.expertise * weights.expertise) +
      (dimensions.communityImpact * weights.communityImpact) +
      (dimensions.consistency * weights.consistency) +
      (dimensions.recency * weights.recency),
      100
    );
  }

  /**
   * Get reputation history for a user
   */
  private async getReputationHistory(userId: string): Promise<ReputationHistory[]> {
    const { data, error } = await this.supabase
      .from('reputation_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to fetch reputation history: ${error.message}`);
    }

    return data?.map(h => ({
      id: h.id,
      userId: h.user_id,
      previousScore: h.previous_score,
      newScore: h.new_score,
      change: h.change,
      reason: h.reason,
      factors: h.factors || {},
      timestamp: new Date(h.created_at)
    })) || [];
  }

  /**
   * Calculate user's rank among all users
   */
  private async calculateUserRank(score: number): Promise<number> {
    const { count, error } = await this.supabase
      .from('reputation_scores')
      .select('id', { count: 'exact' })
      .gt('overall_score', score);

    if (error) {
      throw new Error(`Failed to calculate rank: ${error.message}`);
    }

    return (count || 0) + 1;
  }

  /**
   * Cache reputation score in Redis
   */
  private async cacheReputation(score: ReputationScore): Promise<void> {
    const key = `reputation:${score.userId}`;
    await this.redis.setex(
      key, 
      this.config.cacheTimeouts.reputation, 
      JSON.stringify(score)
    );
  }

  /**
   * Get cached reputation score
   */
  private async getCachedReputation(userId: string): Promise<ReputationScore | null> {
    const key = `reputation:${userId}`;
    const cached = await this.redis.get(key);
    
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Store reputation score in database
   */
  private async storeReputationScore(score: ReputationScore): Promise<void> {
    const { error } = await this.supabase
      .from('reputation_scores')
      .upsert({
        user_id: score.userId,
        overall_score: score.overall,
        dimensions: score.dimensions,
        trend: score.trend,
        confidence: score.confidence,
        rank: score.rank,
        updated_at: score.lastUpdated.toISOString()
      });

    if (error) {
      throw new Error(`Failed to store reputation score: ${error.message}`);
    }
  }

  /**
   * Update reputation history
   */
  private async updateReputationHistory(
    userId: string,
    newScore: number,
    reason: string,
    factors: Record<string, number>
  ): Promise<void> {
    // Get previous score
    const { data: previous } = await this.supabase
      .from('reputation_scores')
      .select('overall_score')
      .eq('user_id', userId)
      .single();

    const previousScore = previous?.overall_score || 0;
    const change = newScore - previousScore;

    const { error } = await this.supabase
      .from('reputation_history')
      .insert({
        user_id: userId,
        previous_score: previousScore,
        new_score: newScore,
        change,
        reason,
        factors
      });

    if (error) {
      throw new Error(`Failed to update reputation history: ${error.message}`);
    }
  }

  /**
   * Setup real-time subscriptions for reputation updates
   */
  private setupRealtimeSubscriptions(): void {
    // Subscribe to contribution changes
    this.supabase
      .channel('contributions')
      .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'user_contributions' },
          (payload) => this.handleContributionChange(payload)
      )
      .subscribe();

    // Subscribe to peer review changes
    this.supabase
      .channel('peer_reviews')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'peer_reviews