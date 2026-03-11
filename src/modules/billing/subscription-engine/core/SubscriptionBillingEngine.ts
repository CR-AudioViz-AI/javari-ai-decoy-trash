```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { format, addDays, addMonths, differenceInDays, parseISO } from 'date-fns';
import { z } from 'zod';

/**
 * Subscription state enumeration
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  PAUSED = 'paused'
}

/**
 * Billing interval enumeration
 */
export enum BillingInterval {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
  WEEKLY = 'weekly'
}

/**
 * Pricing model types
 */
export enum PricingModel {
  FLAT_RATE = 'flat_rate',
  TIERED = 'tiered',
  USAGE_BASED = 'usage_based',
  HYBRID = 'hybrid',
  PER_SEAT = 'per_seat'
}

/**
 * Revenue recognition method
 */
export enum RevenueRecognitionMethod {
  IMMEDIATE = 'immediate',
  DEFERRED = 'deferred',
  MILESTONE = 'milestone'
}

/**
 * Tax calculation provider
 */
export enum TaxProvider {
  AVALARA = 'avalara',
  TAXJAR = 'taxjar',
  INTERNAL = 'internal'
}

/**
 * Subscription plan schema validation
 */
const SubscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  pricing_model: z.nativeEnum(PricingModel),
  base_price: z.number().min(0),
  billing_interval: z.nativeEnum(BillingInterval),
  trial_period_days: z.number().min(0).default(0),
  setup_fee: z.number().min(0).default(0),
  features: z.array(z.string()),
  usage_limits: z.record(z.number()).optional(),
  tier_config: z.array(z.object({
    min_quantity: z.number(),
    max_quantity: z.number().optional(),
    price_per_unit: z.number()
  })).optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Subscription configuration schema
 */
const SubscriptionSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  plan_id: z.string(),
  status: z.nativeEnum(SubscriptionStatus),
  current_period_start: z.string(),
  current_period_end: z.string(),
  quantity: z.number().min(1).default(1),
  discount_id: z.string().optional(),
  trial_end: z.string().optional(),
  canceled_at: z.string().optional(),
  ended_at: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Invoice line item interface
 */
interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  proration?: boolean;
  period_start?: string;
  period_end?: string;
  tax_rate?: number;
  tax_amount?: number;
  metadata?: Record<string, any>;
}

/**
 * Invoice interface
 */
interface Invoice {
  id: string;
  subscription_id: string;
  customer_id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  due_date: string;
  created_at: string;
  paid_at?: string;
  line_items: InvoiceLineItem[];
  payment_intent_id?: string;
  dunning_level: number;
  attempt_count: number;
  next_payment_attempt?: string;
  metadata?: Record<string, any>;
}

/**
 * Payment method interface
 */
interface PaymentMethod {
  id: string;
  customer_id: string;
  type: 'card' | 'bank_account' | 'paypal' | 'apple_pay';
  provider: 'stripe' | 'paypal' | 'square';
  provider_payment_method_id: string;
  is_default: boolean;
  metadata?: Record<string, any>;
}

/**
 * Tax calculation result interface
 */
interface TaxCalculationResult {
  tax_amount: number;
  tax_rate: number;
  tax_breakdown: Array<{
    jurisdiction: string;
    rate: number;
    amount: number;
    type: string;
  }>;
  is_exempt: boolean;
  exemption_reason?: string;
}

/**
 * Revenue recognition entry interface
 */
interface RevenueRecognitionEntry {
  id: string;
  invoice_id: string;
  recognition_date: string;
  amount: number;
  method: RevenueRecognitionMethod;
  status: 'pending' | 'recognized' | 'deferred';
  schedule_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Billing metrics interface
 */
interface BillingMetrics {
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annual Recurring Revenue
  churn_rate: number;
  ltv: number; // Customer Lifetime Value
  arpu: number; // Average Revenue Per User
  subscription_count: number;
  active_customers: number;
  trial_conversions: number;
  dunning_success_rate: number;
  revenue_recognized: number;
  deferred_revenue: number;
}

/**
 * Subscription plan type
 */
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

/**
 * Subscription type
 */
export type Subscription = z.infer<typeof SubscriptionSchema>;

/**
 * Pricing model processor for complex pricing calculations
 */
class PricingModelProcessor {
  /**
   * Calculate pricing based on model type and usage
   */
  public calculatePrice(
    plan: SubscriptionPlan,
    quantity: number,
    usage?: Record<string, number>
  ): { base_amount: number; usage_amount: number; total_amount: number } {
    try {
      let base_amount = 0;
      let usage_amount = 0;

      switch (plan.pricing_model) {
        case PricingModel.FLAT_RATE:
          base_amount = plan.base_price;
          break;

        case PricingModel.PER_SEAT:
          base_amount = plan.base_price * quantity;
          break;

        case PricingModel.TIERED:
          base_amount = this.calculateTieredPricing(plan, quantity);
          break;

        case PricingModel.USAGE_BASED:
          usage_amount = this.calculateUsageBasedPricing(plan, usage || {});
          break;

        case PricingModel.HYBRID:
          base_amount = plan.base_price * quantity;
          usage_amount = this.calculateUsageBasedPricing(plan, usage || {});
          break;

        default:
          throw new Error(`Unsupported pricing model: ${plan.pricing_model}`);
      }

      const total_amount = base_amount + usage_amount;

      return { base_amount, usage_amount, total_amount };
    } catch (error) {
      throw new Error(`Pricing calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate tiered pricing based on quantity
   */
  private calculateTieredPricing(plan: SubscriptionPlan, quantity: number): number {
    if (!plan.tier_config || plan.tier_config.length === 0) {
      return plan.base_price;
    }

    let total = 0;
    let remaining_quantity = quantity;

    for (const tier of plan.tier_config.sort((a, b) => a.min_quantity - b.min_quantity)) {
      if (remaining_quantity <= 0) break;

      const tier_max = tier.max_quantity || Infinity;
      const tier_quantity = Math.min(
        remaining_quantity,
        tier_max - tier.min_quantity + 1
      );

      total += tier_quantity * tier.price_per_unit;
      remaining_quantity -= tier_quantity;
    }

    return total;
  }

  /**
   * Calculate usage-based pricing
   */
  private calculateUsageBasedPricing(
    plan: SubscriptionPlan,
    usage: Record<string, number>
  ): number {
    if (!plan.usage_limits) return 0;

    let total = 0;

    for (const [metric, used_amount] of Object.entries(usage)) {
      const limit = plan.usage_limits[metric];
      if (used_amount > limit) {
        // Calculate overage charges (assuming $0.01 per unit over limit)
        const overage = used_amount - limit;
        total += overage * 0.01;
      }
    }

    return total;
  }
}

/**
 * Proration calculator for mid-cycle changes
 */
class ProrationCalculator {
  /**
   * Calculate proration amount for subscription changes
   */
  public calculateProration(
    old_amount: number,
    new_amount: number,
    period_start: Date,
    period_end: Date,
    change_date: Date
  ): { proration_amount: number; credit_amount: number; charge_amount: number } {
    try {
      const total_days = differenceInDays(period_end, period_start);
      const remaining_days = differenceInDays(period_end, change_date);
      const used_days = total_days - remaining_days;

      if (total_days <= 0 || remaining_days < 0) {
        return { proration_amount: 0, credit_amount: 0, charge_amount: 0 };
      }

      // Calculate unused portion of old plan
      const credit_amount = (old_amount * remaining_days) / total_days;

      // Calculate charge for new plan for remaining period
      const charge_amount = (new_amount * remaining_days) / total_days;

      const proration_amount = charge_amount - credit_amount;

      return {
        proration_amount: Math.round(proration_amount * 100) / 100,
        credit_amount: Math.round(credit_amount * 100) / 100,
        charge_amount: Math.round(charge_amount * 100) / 100
      };
    } catch (error) {
      throw new Error(`Proration calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate refund amount for cancellations
   */
  public calculateRefund(
    paid_amount: number,
    period_start: Date,
    period_end: Date,
    cancel_date: Date,
    refund_policy: 'full' | 'prorated' | 'none' = 'prorated'
  ): number {
    try {
      if (refund_policy === 'none') return 0;
      if (refund_policy === 'full') return paid_amount;

      const total_days = differenceInDays(period_end, period_start);
      const remaining_days = differenceInDays(period_end, cancel_date);

      if (total_days <= 0 || remaining_days <= 0) return 0;

      const refund_amount = (paid_amount * remaining_days) / total_days;
      return Math.round(refund_amount * 100) / 100;
    } catch (error) {
      throw new Error(`Refund calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Dunning management for failed payments
 */
class DunningManager {
  private readonly redis: Redis;
  private readonly maxRetryAttempts = 5;
  private readonly retryIntervals = [1, 3, 7, 14, 30]; // Days

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Process failed payment and schedule retries
   */
  public async procesFailedPayment(invoice: Invoice): Promise<void> {
    try {
      const dunning_key = `dunning:${invoice.id}`;
      const current_level = invoice.dunning_level || 0;

      if (current_level >= this.maxRetryAttempts) {
        await this.handleMaxRetriesReached(invoice);
        return;
      }

      const next_level = current_level + 1;
      const retry_delay_days = this.retryIntervals[current_level] || 30;
      const next_attempt = addDays(new Date(), retry_delay_days);

      // Schedule next retry
      await this.redis.zadd(
        'billing:dunning_queue',
        next_attempt.getTime(),
        JSON.stringify({
          invoice_id: invoice.id,
          attempt_number: next_level,
          scheduled_for: next_attempt.toISOString()
        })
      );

      // Send dunning notification
      await this.sendDunningNotification(invoice, next_level, next_attempt);

      console.log(`Scheduled dunning retry ${next_level} for invoice ${invoice.id} on ${format(next_attempt, 'yyyy-MM-dd')}`);
    } catch (error) {
      console.error('Failed to process failed payment:', error);
      throw error;
    }
  }

  /**
   * Process dunning queue
   */
  public async processDunningQueue(): Promise<void> {
    try {
      const now = Date.now();
      const pending_retries = await this.redis.zrangebyscore(
        'billing:dunning_queue',
        0,
        now,
        'LIMIT',
        0,
        10
      );

      for (const retry_data of pending_retries) {
        const retry_info = JSON.parse(retry_data);
        await this.attemptPaymentRetry(retry_info.invoice_id);
        
        // Remove from queue
        await this.redis.zrem('billing:dunning_queue', retry_data);
      }
    } catch (error) {
      console.error('Failed to process dunning queue:', error);
      throw error;
    }
  }

  /**
   * Attempt payment retry
   */
  private async attemptPaymentRetry(invoice_id: string): Promise<boolean> {
    try {
      // This would integrate with payment processor
      // For now, simulate random success/failure
      const success = Math.random() > 0.5;
      
      if (success) {
        console.log(`Payment retry successful for invoice ${invoice_id}`);
        return true;
      } else {
        console.log(`Payment retry failed for invoice ${invoice_id}`);
        return false;
      }
    } catch (error) {
      console.error(`Payment retry error for invoice ${invoice_id}:`, error);
      return false;
    }
  }

  /**
   * Handle maximum retries reached
   */
  private async handleMaxRetriesReached(invoice: Invoice): Promise<void> {
    try {
      // Mark subscription as unpaid or cancel
      console.log(`Maximum dunning attempts reached for invoice ${invoice.id}`);
      
      // Send final notice
      await this.sendFinalNotice(invoice);
    } catch (error) {
      console.error('Failed to handle max retries:', error);
      throw error;
    }
  }

  /**
   * Send dunning notification
   */
  private async sendDunningNotification(
    invoice: Invoice,
    attempt_number: number,
    next_attempt: Date
  ): Promise<void> {
    try {
      // Integration with notification service would go here
      console.log(`Sending dunning notification ${attempt_number} for invoice ${invoice.id}`);
    } catch (error) {
      console.error('Failed to send dunning notification:', error);
      throw error;
    }
  }

  /**
   * Send final notice
   */
  private async sendFinalNotice(invoice: Invoice): Promise<void> {
    try {
      console.log(`Sending final notice for invoice ${invoice.id}`);
    } catch (error) {
      console.error('Failed to send final notice:', error);
      throw error;
    }
  }
}

/**
 * Revenue recognition engine for compliance
 */
class RevenueRecognitionEngine {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create revenue recognition schedule
   */
  public async createRecognitionSchedule(
    invoice: Invoice,
    method: RevenueRecognitionMethod
  ): Promise<RevenueRecognitionEntry[]> {
    try {
      const entries: RevenueRecognitionEntry[] = [];

      switch (method) {
        case RevenueRecognitionMethod.IMMEDIATE:
          entries.push(this.createImmediateRecognition(invoice));
          break;

        case RevenueRecognitionMethod.DEFERRED:
          entries.push(...this.createDeferredRecognition(invoice));
          break;

        case RevenueRecognitionMethod.MILESTONE:
          entries.push(...this.createMilestoneRecognition(invoice));
          break;
      }

      // Store recognition entries
      for (const entry of entries) {
        await this.supabase
          .from('revenue_recognition')
          .insert(entry);
      }

      return entries;
    } catch (error) {
      console.error('Failed to create recognition schedule:', error);
      throw error;
    }
  }

  /**
   * Process pending revenue recognition
   */
  public async processRecognition(date: Date = new Date()): Promise<void> {
    try {
      const { data: pending_entries } = await this.supabase
        .from('revenue_recognition')
        .select('*')
        .eq('status', 'pending')
        .lte('recognition_date', date.toISOString())
        .order('recognition_date');

      if (!pending_entries?.length) return;

      for (const entry of pending_entries) {
        await this.recognizeRevenue(entry);
      }
    } catch (error) {
      console.error('Failed to process revenue recognition:', error);
      throw error;
    }
  }

  /**
   * Create immediate revenue recognition
   */
  private createImmediateRecognition(invoice: Invoice): RevenueRecognitionEntry {
    return {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      invoice_id: invoice.id,
      recognition_date: new Date().toISOString(),
      amount: invoice.total,
      method: RevenueRecognitionMethod.IMMEDIATE,
      status: 'pending'
    };
  }

  /**
   * Create deferred revenue recognition
   */
  private createDeferredRecognition(invoice: Invoice): RevenueRecognitionEntry[] {
    const entries: RevenueRecognitionEntry[] = [];
    
    // Assuming monthly recognition for annual subscriptions
    const recognition_months = 12;
    const monthly_amount = invoice.total / recognition_months;
    
    for (let i = 0; i < recognition_months; i++) {
      const recognition_date = addMonths(new Date(), i);
      
      entries.push({
        id: `rev_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
        invoice_id: invoice.id,
        recognition_date: recognition_date.toISOString(),
        amount: monthly_amount,
        method: RevenueRecognitionMethod.DEFERRED,
        status: 'pending'
      });
    }

    return entries;
  }

  /**
   * Create milestone-based revenue recognition
   */
  private createMilestoneRecognition(invoice: Invoice): RevenueRecognitionEntry[] {
    // Simplified milestone recognition
    return [
      {
        id: `rev_${Date.now()}_milestone_${Math.random().toString(36).substr(2, 9)}`,
        invoice_id: invoice.id,
        recognition_date: addDays(new Date(), 30).toISOString(),
        amount: invoice.total,
        method: RevenueRecognitionMethod.MILESTONE,
        status: 'pending'
      }
    ];
  }

  /**
   * Recognize revenue entry
   */
  private async recognizeRevenue(entry: RevenueRecognitionEntry): Promise<void> {
    try {
      // Update recognition status
      await this.supabase
        .from('revenue_recognition')
        .update({ status: 'recognized' })
        .eq('id', entry.id);

      // Record in accounting system (integration point)
      console.log(`Recognized revenue: $${entry.amount} for invoice ${entry.invoice_id}`);
    } catch (error) {
      console.error(`Failed to recognize revenue for entry ${entry.id}:`, error);
      throw error;
    }
  }
}

/**
 * Tax calculation service with international support
 */
class TaxCalculationService {
  private readonly provider: TaxProvider;
  private readonly tax_rates: Map<string, number> = new Map([
    ['US-CA', 0.0875],
    ['US-NY', 0.08],
    ['US-TX', 0.0625],
    ['GB', 0.20],
    ['DE', 0.19],
    ['FR', 0.20]
  ]);

  constructor(provider: TaxProvider = TaxProvider.INTERNAL) {
    this.provider = provider;
  }

  /**
   * Calculate tax for invoice
   */
  public async calculateTax(
    amount: number,
    customer_address: {
      country: string;
      state?: string;
      postal_code?: string;
      city?: string;
    },
    product_type: string = 'saas'
  ): Promise<TaxCalculationResult> {
    try {
      switch (this.provider) {
        case TaxProvider.AVALARA:
          return await this.calculateAvalaraTax(amount, customer_address, product_type);
        
        case TaxProvider.INTERNAL:
        default:
          return this.calculateInternalTax(amount, customer_address);
      }
    } catch (error) {
      console.error('Tax calculation failed:', error);
      // Fallback to basic calculation
      return this.calculateInternalTax(amount, customer_address);
    }
  }

  /**
   * Calculate tax using Avalara API
   */
  private async calculateAvalaraTax(
    amount: number,
    customer_address: any,
    product_type: string
  ): Promise<TaxCalculationResult> {
    try {
      // This would integrate with Avalara AvaTax API
      // For now, return mock data
      const tax_rate = this.getT