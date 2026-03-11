```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import Stripe from 'stripe';
import { Queue } from 'bull';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { validateApiKey } from '@/lib/auth';

// Environment variables validation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Web3 provider setup
const provider = new ethers.JsonRpcProvider(process.env.WEB3_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Queue for processing royalty calculations
const royaltyQueue = new Queue('royalty processing', {
  redis: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT!),
    password: process.env.REDIS_PASSWORD,
  },
});

// Smart contract ABI for royalty distribution
const ROYALTY_CONTRACT_ABI = [
  'function distributeRoyalties(address[] memory recipients, uint256[] memory amounts) external',
  'function getRoyaltyInfo(uint256 tokenId) external view returns (address, uint256)',
  'function setRoyaltyInfo(uint256 tokenId, address recipient, uint256 royaltyBps) external',
];

// Validation schemas
const createRoyaltySchema = z.object({
  creatorId: z.string().uuid(),
  agentId: z.string().uuid(),
  royaltyPercentage: z.number().min(0).max(50),
  derivativeType: z.enum(['fork', 'remix', 'clone', 'adaptation']),
  parentAgentId: z.string().uuid().optional(),
  blockchainAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const distributeRoyaltySchema = z.object({
  distributionId: z.string().uuid(),
  totalRevenue: z.number().positive(),
  currency: z.enum(['USD', 'ETH', 'MATIC']),
  source: z.string(),
});

const getRoyaltyStatsSchema = z.object({
  creatorId: z.string().uuid(),
  timeframe: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  includeProjections: z.boolean().optional().default(false),
});

// Types
interface RoyaltyDistribution {
  id: string;
  creatorId: string;
  agentId: string;
  parentAgentId?: string;
  royaltyPercentage: number;
  totalEarned: number;
  lastPayout: Date;
  blockchainTxHash?: string;
  status: 'active' | 'pending' | 'suspended';
}

interface PayoutRecord {
  id: string;
  distributionId: string;
  amount: number;
  currency: string;
  payoutMethod: 'stripe' | 'crypto' | 'manual';
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: Date;
}

class RoyaltyDistributionEngine {
  async calculateRoyaltyTiers(agentId: string, revenue: number): Promise<Map<string, number>> {
    const { data: royaltyChain } = await supabase
      .from('creator_royalties')
      .select(`
        creator_id,
        royalty_percentage,
        parent_agent_id,
        tier_level
      `)
      .eq('agent_id', agentId)
      .order('tier_level', { ascending: true });

    const distributions = new Map<string, number>();
    let remainingRevenue = revenue;

    // Calculate multi-tier royalty distribution
    for (const royalty of royaltyChain || []) {
      if (remainingRevenue <= 0) break;

      const royaltyAmount = (revenue * royalty.royalty_percentage) / 100;
      const actualPayout = Math.min(royaltyAmount, remainingRevenue);

      distributions.set(royalty.creator_id, actualPayout);
      remainingRevenue -= actualPayout;
    }

    return distributions;
  }

  async trackDerivativeUsage(agentId: string, usageMetrics: any): Promise<void> {
    await supabase.from('agent_usage_metrics').insert({
      agent_id: agentId,
      usage_count: usageMetrics.count,
      revenue_generated: usageMetrics.revenue,
      usage_type: usageMetrics.type,
      timestamp: new Date().toISOString(),
    });
  }
}

class BlockchainRoyaltyTracker {
  private contract: ethers.Contract;

  constructor() {
    this.contract = new ethers.Contract(
      process.env.ROYALTY_CONTRACT_ADDRESS!,
      ROYALTY_CONTRACT_ABI,
      wallet
    );
  }

  async recordRoyaltyOnChain(
    tokenId: number,
    recipients: string[],
    amounts: number[]
  ): Promise<string> {
    try {
      const tx = await this.contract.distributeRoyalties(recipients, amounts, {
        gasLimit: 500000,
      });
      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Blockchain transaction failed: ${error}`);
    }
  }

  async validateRoyaltyRules(agentId: string): Promise<boolean> {
    const { data: rules } = await supabase
      .from('royalty_agreements')
      .select('blockchain_enforced, contract_address')
      .eq('agent_id', agentId)
      .single();

    if (!rules?.blockchain_enforced) return true;

    // Validate against smart contract rules
    try {
      const contractRules = await this.contract.getRoyaltyInfo(agentId);
      return contractRules !== null;
    } catch {
      return false;
    }
  }
}

class AutomatedPayoutProcessor {
  async processStripePayout(creatorId: string, amount: number): Promise<string> {
    const { data: creator } = await supabase
      .from('creator_profiles')
      .select('stripe_account_id')
      .eq('id', creatorId)
      .single();

    if (!creator?.stripe_account_id) {
      throw new Error('Creator Stripe account not configured');
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      destination: creator.stripe_account_id,
      metadata: {
        type: 'royalty_payout',
        creator_id: creatorId,
      },
    });

    return transfer.id;
  }

  async processCryptoPayout(address: string, amount: number, currency: string): Promise<string> {
    if (currency === 'ETH') {
      const tx = await wallet.sendTransaction({
        to: address,
        value: ethers.parseEther(amount.toString()),
      });
      await tx.wait();
      return tx.hash;
    }

    throw new Error(`Unsupported cryptocurrency: ${currency}`);
  }

  async schedulePayout(distributionId: string, payoutDate: Date): Promise<void> {
    await royaltyQueue.add(
      'process_payout',
      { distributionId },
      {
        delay: payoutDate.getTime() - Date.now(),
        attempts: 3,
        backoff: 'exponential',
      }
    );
  }
}

class RoyaltyCalculationService {
  async calculateTotalRoyalties(creatorId: string, timeframe: string): Promise<number> {
    const startDate = this.getStartDate(timeframe);
    
    const { data } = await supabase
      .from('payout_history')
      .select('amount')
      .eq('creator_id', creatorId)
      .gte('created_at', startDate.toISOString());

    return data?.reduce((sum, payout) => sum + payout.amount, 0) || 0;
  }

  async projectFutureEarnings(creatorId: string): Promise<number> {
    const { data: metrics } = await supabase
      .from('agent_usage_metrics')
      .select('revenue_generated, timestamp')
      .eq('creator_id', creatorId)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (!metrics?.length) return 0;

    // Simple linear projection based on recent trend
    const recentRevenue = metrics.slice(0, 7).reduce((sum, m) => sum + m.revenue_generated, 0);
    const olderRevenue = metrics.slice(7, 14).reduce((sum, m) => sum + m.revenue_generated, 0);
    
    const growthRate = recentRevenue > olderRevenue ? recentRevenue / olderRevenue : 1;
    return recentRevenue * growthRate * 4; // Project next month
  }

  private getStartDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1y': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}

// Initialize services
const royaltyEngine = new RoyaltyDistributionEngine();
const blockchainTracker = new BlockchainRoyaltyTracker();
const payoutProcessor = new AutomatedPayoutProcessor();
const calculationService = new RoyaltyCalculationService();

// POST - Create royalty distribution agreement
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, { max: 20, window: '1h' });
    if (rateLimitResult.error) {
      return NextResponse.json(rateLimitResult, { status: 429 });
    }

    // Authentication
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createRoyaltySchema.parse(body);

    // Validate blockchain royalty rules
    const rulesValid = await blockchainTracker.validateRoyaltyRules(validatedData.agentId);
    if (!rulesValid) {
      return NextResponse.json({ 
        error: 'Blockchain royalty rules validation failed' 
      }, { status: 400 });
    }

    // Create royalty distribution record
    const { data: distribution, error } = await supabase
      .from('creator_royalties')
      .insert({
        creator_id: validatedData.creatorId,
        agent_id: validatedData.agentId,
        parent_agent_id: validatedData.parentAgentId,
        royalty_percentage: validatedData.royaltyPercentage,
        derivative_type: validatedData.derivativeType,
        blockchain_address: validatedData.blockchainAddress,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ 
        error: 'Failed to create royalty distribution',
        details: error.message 
      }, { status: 500 });
    }

    // Record on blockchain if required
    let blockchainTxHash: string | undefined;
    try {
      if (validatedData.parentAgentId) {
        // Multi-tier royalty requires blockchain enforcement
        blockchainTxHash = await blockchainTracker.recordRoyaltyOnChain(
          parseInt(validatedData.agentId),
          [validatedData.blockchainAddress],
          [validatedData.royaltyPercentage * 100] // Convert to basis points
        );
      }
    } catch (blockchainError) {
      // Log but don't fail the request
      console.error('Blockchain recording failed:', blockchainError);
    }

    return NextResponse.json({
      success: true,
      distribution: {
        ...distribution,
        blockchainTxHash,
      },
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }

    console.error('Royalty creation error:', error);
    return NextResponse.json({
      error: 'Internal server error',
    }, { status: 500 });
  }
}

// PUT - Distribute royalties
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, { max: 100, window: '1h' });
    if (rateLimitResult.error) {
      return NextResponse.json(rateLimitResult, { status: 429 });
    }

    // Authentication
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = distributeRoyaltySchema.parse(body);

    // Get distribution details
    const { data: distribution } = await supabase
      .from('creator_royalties')
      .select(`
        *,
        creator_profiles(stripe_account_id, wallet_address)
      `)
      .eq('id', validatedData.distributionId)
      .single();

    if (!distribution) {
      return NextResponse.json({ 
        error: 'Distribution not found' 
      }, { status: 404 });
    }

    // Calculate royalty distributions
    const royaltyDistributions = await royaltyEngine.calculateRoyaltyTiers(
      distribution.agent_id,
      validatedData.totalRevenue
    );

    const payoutResults: PayoutRecord[] = [];

    // Process payouts for each creator
    for (const [creatorId, amount] of royaltyDistributions.entries()) {
      try {
        let transactionId: string;
        let payoutMethod: 'stripe' | 'crypto' | 'manual';

        if (validatedData.currency === 'USD') {
          transactionId = await payoutProcessor.processStripePayout(creatorId, amount);
          payoutMethod = 'stripe';
        } else {
          const { data: creator } = await supabase
            .from('creator_profiles')
            .select('wallet_address')
            .eq('id', creatorId)
            .single();

          if (!creator?.wallet_address) {
            throw new Error('Creator wallet address not found');
          }

          transactionId = await payoutProcessor.processCryptoPayout(
            creator.wallet_address,
            amount,
            validatedData.currency
          );
          payoutMethod = 'crypto';
        }

        // Record payout
        const { data: payout } = await supabase
          .from('payout_history')
          .insert({
            distribution_id: validatedData.distributionId,
            creator_id: creatorId,
            amount,
            currency: validatedData.currency,
            payout_method: payoutMethod,
            transaction_id: transactionId,
            status: 'completed',
            source: validatedData.source,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (payout) {
          payoutResults.push(payout as PayoutRecord);
        }

      } catch (payoutError) {
        console.error(`Payout failed for creator ${creatorId}:`, payoutError);
        
        // Record failed payout
        await supabase.from('payout_history').insert({
          distribution_id: validatedData.distributionId,
          creator_id: creatorId,
          amount,
          currency: validatedData.currency,
          payout_method: 'manual',
          transaction_id: 'failed',
          status: 'failed',
          source: validatedData.source,
          error_message: String(payoutError),
          created_at: new Date().toISOString(),
        });
      }
    }

    // Update distribution totals
    await supabase
      .from('creator_royalties')
      .update({
        total_earned: (distribution.total_earned || 0) + validatedData.totalRevenue,
        last_payout: new Date().toISOString(),
      })
      .eq('id', validatedData.distributionId);

    return NextResponse.json({
      success: true,
      totalDistributed: validatedData.totalRevenue,
      payoutCount: payoutResults.length,
      payouts: payoutResults,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }

    console.error('Royalty distribution error:', error);
    return NextResponse.json({
      error: 'Internal server error',
    }, { status: 500 });
  }
}

// GET - Retrieve royalty statistics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, { max: 200, window: '1h' });
    if (rateLimitResult.error) {
      return NextResponse.json(rateLimitResult, { status: 429 });
    }

    // Authentication
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      creatorId: searchParams.get('creatorId') || '',
      timeframe: searchParams.get('timeframe') || '30d',
      includeProjections: searchParams.get('includeProjections') === 'true',
    };

    const validatedQuery = getRoyaltyStatsSchema.parse(queryData);

    // Get royalty distributions for creator
    const { data: distributions } = await supabase
      .from('creator_royalties')
      .select(`
        *,
        payout_history(amount, currency, created_at, status)
      `)
      .eq('creator_id', validatedQuery.creatorId)
      .eq('status', 'active');

    // Calculate total earnings
    const totalEarnings = await calculationService.calculateTotalRoyalties(
      validatedQuery.creatorId,
      validatedQuery.timeframe
    );

    // Get projected earnings if requested
    let projectedEarnings = 0;
    if (validatedQuery.includeProjections) {
      projectedEarnings = await calculationService.projectFutureEarnings(
        validatedQuery.creatorId
      );
    }

    // Get recent payout history
    const { data: recentPayouts } = await supabase
      .from('payout_history')
      .select('*')
      .eq('creator_id', validatedQuery.creatorId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Calculate analytics
    const analytics = {
      totalActiveDistributions: distributions?.length || 0,
      totalEarnings,
      projectedEarnings,
      averageRoyaltyRate: distributions?.reduce((sum, d) => sum + d.royalty_percentage, 0) / (distributions?.length || 1),
      recentPayoutCount: recentPayouts?.length || 0,
      lastPayoutDate: recentPayouts?.[0]?.created_at || null,
    };

    return NextResponse.json({
      success: true,
      creatorId: validatedQuery.creatorId,
      timeframe: validatedQuery.timeframe,
      analytics,
      distributions: distributions || [],
      recentPayouts: recentPayouts || [],
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }

    console.error('Royalty stats error:', error);
    return NextResponse.json({
      error: 'Internal server error',
    }, { status: 500 });
  }
}

// DELETE - Suspend royalty distribution
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, { max: 50, window: '1h' });
    if (rateLimitResult.error) {
      return NextResponse.json(rateLimitResult, { status: 429 });
    }

    // Authentication
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const distributionId = searchParams.get('distributionId');

    if (!distributionId) {
      return NextResponse.json({
        error: 'Distribution ID is required',
      }, { status: 400 });
    }

    // Suspend the distribution
    const { data: distribution, error } = await supabase
      .from('creator_royalties')
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
      })
      .eq('id', distributionId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        error: 'Failed to suspend distribution',
        details: error.message,
      }, { status: 500 });
    }

    if (!distribution) {
      return NextResponse.json({
        error: 'Distribution not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Royalty distribution suspended',
      distributionId: distribution.id,
    });

  } catch (error) {
    console.error('Royalty suspension error:', error);
    return NextResponse.json({
      error: 'Internal server error',
    }, { status: 500 });