```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { z } from 'zod';

// Validation schemas
const distributeRoyaltiesSchema = z.object({
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  payment_batch_id: z.string().uuid().optional(),
  dry_run: z.boolean().default(false),
  creator_ids: z.array(z.string().uuid()).optional(),
  minimum_payout_amount: z.number().min(0).default(10),
});

// Types
interface UsageMetric {
  creator_id: string;
  track_id: string;
  plays: number;
  downloads: number;
  streams: number;
  revenue_generated: number;
  usage_date: string;
}

interface CollaborationAgreement {
  id: string;
  track_id: string;
  primary_creator_id: string;
  collaborators: Array<{
    creator_id: string;
    percentage: number;
    role: string;
    minimum_threshold: number;
  }>;
  revenue_split_rules: {
    type: 'percentage' | 'tiered' | 'fixed';
    rules: any;
  };
  created_at: string;
  effective_until?: string;
}

interface RoyaltyCalculation {
  creator_id: string;
  track_id: string;
  base_amount: number;
  split_percentage: number;
  final_amount: number;
  fees_deducted: number;
  net_payout: number;
  metrics_summary: {
    total_plays: number;
    total_revenue: number;
  };
}

interface PaymentResult {
  creator_id: string;
  amount: number;
  status: 'success' | 'failed' | 'pending';
  payment_method: 'stripe' | 'paypal';
  transaction_id?: string;
  error_message?: string;
}

class RoyaltyCalculationEngine {
  private platformFee = 0.05; // 5% platform fee
  private stripeFee = 0.029; // 2.9% + $0.30 for Stripe

  calculateRoyalties(
    metrics: UsageMetric[],
    agreements: CollaborationAgreement[]
  ): RoyaltyCalculation[] {
    const calculations: RoyaltyCalculation[] = [];

    // Group metrics by track
    const metricsByTrack = this.groupMetricsByTrack(metrics);

    for (const [trackId, trackMetrics] of metricsByTrack) {
      const agreement = agreements.find(a => a.track_id === trackId);
      
      if (!agreement) {
        // Single creator track
        const creator = trackMetrics[0];
        const totalRevenue = trackMetrics.reduce((sum, m) => sum + m.revenue_generated, 0);
        const netRevenue = this.deductPlatformFees(totalRevenue);

        calculations.push({
          creator_id: creator.creator_id,
          track_id: trackId,
          base_amount: totalRevenue,
          split_percentage: 100,
          final_amount: netRevenue,
          fees_deducted: totalRevenue - netRevenue,
          net_payout: netRevenue,
          metrics_summary: {
            total_plays: trackMetrics.reduce((sum, m) => sum + m.plays, 0),
            total_revenue: totalRevenue,
          },
        });
        continue;
      }

      // Multi-creator track with agreement
      const totalRevenue = trackMetrics.reduce((sum, m) => sum + m.revenue_generated, 0);
      const netRevenue = this.deductPlatformFees(totalRevenue);

      for (const collaborator of agreement.collaborators) {
        const splitAmount = this.calculateSplitAmount(
          netRevenue,
          collaborator,
          agreement.revenue_split_rules
        );

        if (splitAmount >= collaborator.minimum_threshold) {
          calculations.push({
            creator_id: collaborator.creator_id,
            track_id: trackId,
            base_amount: totalRevenue,
            split_percentage: collaborator.percentage,
            final_amount: splitAmount,
            fees_deducted: (totalRevenue - netRevenue) * (collaborator.percentage / 100),
            net_payout: splitAmount,
            metrics_summary: {
              total_plays: trackMetrics.reduce((sum, m) => sum + m.plays, 0),
              total_revenue: totalRevenue,
            },
          });
        }
      }
    }

    return calculations;
  }

  private groupMetricsByTrack(metrics: UsageMetric[]): Map<string, UsageMetric[]> {
    const grouped = new Map<string, UsageMetric[]>();
    
    for (const metric of metrics) {
      if (!grouped.has(metric.track_id)) {
        grouped.set(metric.track_id, []);
      }
      grouped.get(metric.track_id)!.push(metric);
    }

    return grouped;
  }

  private deductPlatformFees(amount: number): number {
    return amount * (1 - this.platformFee);
  }

  private calculateSplitAmount(
    netRevenue: number,
    collaborator: any,
    rules: CollaborationAgreement['revenue_split_rules']
  ): number {
    switch (rules.type) {
      case 'percentage':
        return netRevenue * (collaborator.percentage / 100);
      
      case 'tiered':
        return this.calculateTieredSplit(netRevenue, collaborator, rules.rules);
      
      case 'fixed':
        return Math.min(rules.rules.fixed_amount, netRevenue);
      
      default:
        return netRevenue * (collaborator.percentage / 100);
    }
  }

  private calculateTieredSplit(
    netRevenue: number,
    collaborator: any,
    tieredRules: any
  ): number {
    const tiers = tieredRules.tiers || [];
    let splitAmount = 0;

    for (const tier of tiers) {
      if (netRevenue > tier.threshold) {
        const tierAmount = Math.min(
          netRevenue - tier.threshold,
          tier.max_amount || netRevenue
        );
        splitAmount += tierAmount * (collaborator.percentage / 100) * tier.multiplier;
      }
    }

    return splitAmount;
  }
}

class PaymentDistributionService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  async distributePayments(
    calculations: RoyaltyCalculation[],
    dryRun: boolean = false
  ): Promise<PaymentResult[]> {
    const results: PaymentResult[] = [];

    // Group payments by creator
    const paymentsByCreator = this.groupPaymentsByCreator(calculations);

    for (const [creatorId, creatorCalculations] of paymentsByCreator) {
      const totalAmount = creatorCalculations.reduce((sum, calc) => sum + calc.net_payout, 0);
      
      if (dryRun) {
        results.push({
          creator_id: creatorId,
          amount: totalAmount,
          status: 'pending',
          payment_method: 'stripe',
        });
        continue;
      }

      try {
        const paymentResult = await this.processStripeTransfer(creatorId, totalAmount);
        results.push(paymentResult);
      } catch (error) {
        results.push({
          creator_id: creatorId,
          amount: totalAmount,
          status: 'failed',
          payment_method: 'stripe',
          error_message: error instanceof Error ? error.message : 'Payment failed',
        });
      }
    }

    return results;
  }

  private groupPaymentsByCreator(
    calculations: RoyaltyCalculation[]
  ): Map<string, RoyaltyCalculation[]> {
    const grouped = new Map<string, RoyaltyCalculation[]>();
    
    for (const calc of calculations) {
      if (!grouped.has(calc.creator_id)) {
        grouped.set(calc.creator_id, []);
      }
      grouped.get(calc.creator_id)!.push(calc);
    }

    return grouped;
  }

  private async processStripeTransfer(
    creatorId: string,
    amount: number
  ): Promise<PaymentResult> {
    // Convert to cents for Stripe
    const amountCents = Math.round(amount * 100);

    const transfer = await this.stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: `acct_${creatorId}`, // Assuming creator has connected Stripe account
      description: `Royalty payment for period`,
      metadata: {
        creator_id: creatorId,
        payment_type: 'royalty_distribution',
      },
    });

    return {
      creator_id: creatorId,
      amount: amount,
      status: 'success',
      payment_method: 'stripe',
      transaction_id: transfer.id,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate admin permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'platform_manager') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validatedData = distributeRoyaltiesSchema.parse(body);

    // Initialize services
    const calculationEngine = new RoyaltyCalculationEngine();
    const paymentService = new PaymentDistributionService();

    // Fetch usage metrics for the period
    const metricsQuery = supabase
      .from('usage_metrics')
      .select(`
        creator_id,
        track_id,
        plays,
        downloads,
        streams,
        revenue_generated,
        usage_date
      `)
      .gte('usage_date', validatedData.period_start)
      .lte('usage_date', validatedData.period_end);

    if (validatedData.creator_ids) {
      metricsQuery.in('creator_id', validatedData.creator_ids);
    }

    const { data: metrics, error: metricsError } = await metricsQuery;

    if (metricsError) {
      return NextResponse.json(
        { error: 'Failed to fetch usage metrics', details: metricsError.message },
        { status: 500 }
      );
    }

    // Fetch collaboration agreements
    const { data: agreements, error: agreementsError } = await supabase
      .from('collaboration_agreements')
      .select(`
        id,
        track_id,
        primary_creator_id,
        collaborators,
        revenue_split_rules,
        created_at,
        effective_until
      `)
      .or(`effective_until.is.null,effective_until.gte.${validatedData.period_end}`);

    if (agreementsError) {
      return NextResponse.json(
        { error: 'Failed to fetch collaboration agreements', details: agreementsError.message },
        { status: 500 }
      );
    }

    // Calculate royalties
    const calculations = calculationEngine.calculateRoyalties(
      metrics || [],
      agreements || []
    );

    // Filter by minimum payout amount
    const eligibleCalculations = calculations.filter(
      calc => calc.net_payout >= validatedData.minimum_payout_amount
    );

    // Process payments
    const paymentResults = await paymentService.distributePayments(
      eligibleCalculations,
      validatedData.dry_run
    );

    // Store payment history (if not dry run)
    if (!validatedData.dry_run) {
      const paymentHistoryRecords = paymentResults.map(result => ({
        id: crypto.randomUUID(),
        creator_id: result.creator_id,
        amount: result.amount,
        status: result.status,
        payment_method: result.payment_method,
        transaction_id: result.transaction_id,
        error_message: result.error_message,
        payment_batch_id: validatedData.payment_batch_id || crypto.randomUUID(),
        period_start: validatedData.period_start,
        period_end: validatedData.period_end,
        created_at: new Date().toISOString(),
      }));

      const { error: historyError } = await supabase
        .from('payment_history')
        .insert(paymentHistoryRecords);

      if (historyError) {
        console.error('Failed to store payment history:', historyError);
      }

      // Update royalty calculations status
      const calculationRecords = calculations.map(calc => ({
        id: crypto.randomUUID(),
        creator_id: calc.creator_id,
        track_id: calc.track_id,
        base_amount: calc.base_amount,
        split_percentage: calc.split_percentage,
        final_amount: calc.final_amount,
        fees_deducted: calc.fees_deducted,
        net_payout: calc.net_payout,
        metrics_summary: calc.metrics_summary,
        period_start: validatedData.period_start,
        period_end: validatedData.period_end,
        processed_at: new Date().toISOString(),
      }));

      const { error: calculationsError } = await supabase
        .from('royalty_calculations')
        .insert(calculationRecords);

      if (calculationsError) {
        console.error('Failed to store calculations:', calculationsError);
      }
    }

    // Generate distribution report
    const report = {
      period: {
        start: validatedData.period_start,
        end: validatedData.period_end,
      },
      summary: {
        total_creators: paymentResults.length,
        total_amount: paymentResults.reduce((sum, r) => sum + r.amount, 0),
        successful_payments: paymentResults.filter(r => r.status === 'success').length,
        failed_payments: paymentResults.filter(r => r.status === 'failed').length,
        pending_payments: paymentResults.filter(r => r.status === 'pending').length,
      },
      calculations: calculations.length,
      eligible_for_payout: eligibleCalculations.length,
      dry_run: validatedData.dry_run,
    };

    return NextResponse.json({
      success: true,
      report,
      payment_results: paymentResults,
      calculations: validatedData.dry_run ? calculations : undefined,
    });

  } catch (error) {
    console.error('Royalty distribution error:', error);

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
```