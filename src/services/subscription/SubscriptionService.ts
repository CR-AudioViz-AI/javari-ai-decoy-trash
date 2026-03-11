```typescript
import { supabase } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { eventEmitter } from '@/lib/events';
import { EmailService } from '@/services/EmailService';
import { AnalyticsService } from '@/services/AnalyticsService';
import Stripe from 'stripe';

/**
 * Subscription tier configuration
 */
export interface SubscriptionTier {
  id: string;
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  stripePriceId: string;
  stripeAnnualPriceId: string;
  features: string[];
  limits: {
    maxProjects: number;
    maxStorageGB: number;
    maxBandwidthGB: number;
    maxCollaborators: number;
    maxExportsPerMonth: number;
    maxAICredits: number;
  };
  usageBased: {
    enabled: boolean;
    overageRates: {
      storage: number; // per GB
      bandwidth: number; // per GB
      exports: number; // per export
      aiCredits: number; // per credit
    };
  };
  autoUpgrade: {
    enabled: boolean;
    revenueThreshold?: number;
    usageThreshold?: number;
    activityThreshold?: number;
  };
  priority: number;
}

/**
 * Subscription status and details
 */
export interface Subscription {
  id: string;
  userId: string;
  tierId: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  usage: UsageRecord;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Usage tracking record
 */
export interface UsageRecord {
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  usage: {
    projects: number;
    storageGB: number;
    bandwidthGB: number;
    collaborators: number;
    exports: number;
    aiCredits: number;
  };
  overages: {
    storageGB: number;
    bandwidthGB: number;
    exports: number;
    aiCredits: number;
  };
  estimatedCost: number;
  billedAmount?: number;
}

/**
 * Billing event record
 */
export interface BillingEvent {
  id: string;
  subscriptionId: string;
  type: 'charge' | 'refund' | 'overage' | 'upgrade' | 'downgrade';
  amount: number;
  currency: string;
  description: string;
  metadata: Record<string, any>;
  processedAt: Date;
}

/**
 * Auto-upgrade evaluation result
 */
export interface UpgradeEvaluation {
  shouldUpgrade: boolean;
  recommendedTier?: SubscriptionTier;
  reasons: string[];
  metrics: {
    revenue: number;
    usage: number;
    activity: number;
  };
}

/**
 * Service options
 */
export interface SubscriptionServiceOptions {
  enableAutoUpgrade?: boolean;
  enableUsageBilling?: boolean;
  gracePeriodDays?: number;
  notificationEnabled?: boolean;
}

/**
 * Comprehensive subscription management service handling tiered pricing,
 * usage-based billing, automatic tier adjustments, and revenue threshold monitoring
 */
export class SubscriptionService {
  private emailService: EmailService;
  private analyticsService: AnalyticsService;
  private options: Required<SubscriptionServiceOptions>;
  private tierCache: Map<string, SubscriptionTier> = new Map();

  constructor(
    emailService: EmailService,
    analyticsService: AnalyticsService,
    options: SubscriptionServiceOptions = {}
  ) {
    this.emailService = emailService;
    this.analyticsService = analyticsService;
    this.options = {
      enableAutoUpgrade: options.enableAutoUpgrade ?? true,
      enableUsageBilling: options.enableUsageBilling ?? true,
      gracePeriodDays: options.gracePeriodDays ?? 7,
      notificationEnabled: options.notificationEnabled ?? true,
    };

    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners for subscription events
   */
  private initializeEventListeners(): void {
    eventEmitter.on('subscription:created', this.handleSubscriptionCreated.bind(this));
    eventEmitter.on('subscription:updated', this.handleSubscriptionUpdated.bind(this));
    eventEmitter.on('subscription:canceled', this.handleSubscriptionCanceled.bind(this));
    eventEmitter.on('usage:updated', this.handleUsageUpdated.bind(this));
  }

  /**
   * Get all available subscription tiers
   */
  async getSubscriptionTiers(): Promise<SubscriptionTier[]> {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;

      const tiers = data as SubscriptionTier[];
      
      // Update cache
      tiers.forEach(tier => this.tierCache.set(tier.id, tier));

      return tiers;
    } catch (error) {
      logger.error('Failed to fetch subscription tiers', { error });
      throw new Error('Failed to fetch subscription tiers');
    }
  }

  /**
   * Get subscription tier by ID
   */
  async getSubscriptionTier(tierId: string): Promise<SubscriptionTier> {
    try {
      // Check cache first
      if (this.tierCache.has(tierId)) {
        return this.tierCache.get(tierId)!;
      }

      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('id', tierId)
        .single();

      if (error) throw error;

      const tier = data as SubscriptionTier;
      this.tierCache.set(tierId, tier);

      return tier;
    } catch (error) {
      logger.error('Failed to fetch subscription tier', { tierId, error });
      throw new Error('Failed to fetch subscription tier');
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          usage_records (*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data as Subscription | null;
    } catch (error) {
      logger.error('Failed to fetch user subscription', { userId, error });
      throw new Error('Failed to fetch user subscription');
    }
  }

  /**
   * Create a new subscription
   */
  async createSubscription(
    userId: string,
    tierId: string,
    paymentMethodId?: string,
    annual: boolean = false
  ): Promise<Subscription> {
    try {
      const tier = await this.getSubscriptionTier(tierId);
      
      // Create Stripe customer if not exists
      let stripeCustomerId = await this.getOrCreateStripeCustomer(userId);
      
      // Create Stripe subscription
      const stripeSubscription = await this.createStripeSubscription(
        stripeCustomerId,
        tier,
        annual,
        paymentMethodId
      );

      // Create subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          tier_id: tierId,
          status: stripeSubscription.status,
          stripe_subscription_id: stripeSubscription.id,
          stripe_customer_id: stripeCustomerId,
          current_period_start: new Date(stripeSubscription.current_period_start * 1000),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000),
          trial_end: stripeSubscription.trial_end ? 
            new Date(stripeSubscription.trial_end * 1000) : null,
          metadata: { annual }
        })
        .select()
        .single();

      if (error) throw error;

      const subscription = data as Subscription;

      // Initialize usage record
      await this.initializeUsageRecord(subscription.id);

      // Track analytics
      await this.analyticsService.track('subscription_created', {
        userId,
        subscriptionId: subscription.id,
        tierId,
        annual
      });

      // Emit event
      eventEmitter.emit('subscription:created', subscription);

      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { userId, tierId, error });
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Update subscription tier
   */
  async updateSubscriptionTier(
    subscriptionId: string,
    newTierId: string,
    immediate: boolean = false
  ): Promise<Subscription> {
    try {
      const subscription = await this.getSubscriptionById(subscriptionId);
      const newTier = await this.getSubscriptionTier(newTierId);

      // Update Stripe subscription
      if (subscription.stripeSubscriptionId) {
        await this.updateStripeSubscription(
          subscription.stripeSubscriptionId,
          newTier,
          immediate
        );
      }

      // Update subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          tier_id: newTierId,
          updated_at: new Date()
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;

      const updatedSubscription = data as Subscription;

      // Track analytics
      await this.analyticsService.track('subscription_tier_changed', {
        subscriptionId,
        oldTierId: subscription.tierId,
        newTierId,
        immediate
      });

      // Emit event
      eventEmitter.emit('subscription:updated', updatedSubscription);

      return updatedSubscription;
    } catch (error) {
      logger.error('Failed to update subscription tier', { subscriptionId, newTierId, error });
      throw new Error('Failed to update subscription tier');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true,
    reason?: string
  ): Promise<Subscription> {
    try {
      const subscription = await this.getSubscriptionById(subscriptionId);

      // Cancel Stripe subscription
      if (subscription.stripeSubscriptionId) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: cancelAtPeriodEnd
        });
      }

      // Update subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: cancelAtPeriodEnd,
          status: cancelAtPeriodEnd ? subscription.status : 'canceled',
          metadata: { 
            ...subscription.metadata, 
            cancelReason: reason,
            canceledAt: new Date()
          },
          updated_at: new Date()
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;

      const updatedSubscription = data as Subscription;

      // Track analytics
      await this.analyticsService.track('subscription_canceled', {
        subscriptionId,
        cancelAtPeriodEnd,
        reason
      });

      // Emit event
      eventEmitter.emit('subscription:canceled', updatedSubscription);

      return updatedSubscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', { subscriptionId, error });
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Record usage for a subscription
   */
  async recordUsage(
    subscriptionId: string,
    usageType: keyof UsageRecord['usage'],
    amount: number
  ): Promise<void> {
    try {
      // Get current usage record
      const { data: usageRecord, error } = await supabase
        .from('usage_records')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .gte('period_start', new Date().toISOString().split('T')[0])
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const currentUsage = usageRecord?.usage || {};
      const newUsage = {
        ...currentUsage,
        [usageType]: (currentUsage[usageType] || 0) + amount
      };

      // Update or insert usage record
      await supabase
        .from('usage_records')
        .upsert({
          subscription_id: subscriptionId,
          period_start: new Date().toISOString().split('T')[0],
          period_end: this.getEndOfCurrentPeriod(),
          usage: newUsage
        });

      // Emit usage updated event
      eventEmitter.emit('usage:updated', { subscriptionId, usageType, amount });

    } catch (error) {
      logger.error('Failed to record usage', { subscriptionId, usageType, amount, error });
      throw new Error('Failed to record usage');
    }
  }

  /**
   * Calculate usage overages and billing
   */
  async calculateUsageBilling(subscriptionId: string): Promise<UsageRecord> {
    try {
      const subscription = await this.getSubscriptionById(subscriptionId);
      const tier = await this.getSubscriptionTier(subscription.tierId);

      // Get current usage
      const { data: usageData, error } = await supabase
        .from('usage_records')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .gte('period_start', subscription.currentPeriodStart.toISOString())
        .single();

      if (error) throw error;

      const usage = usageData.usage;
      const overages = this.calculateOverages(usage, tier.limits);
      const estimatedCost = this.calculateOverageCost(overages, tier.usageBased.overageRates);

      // Update usage record
      const { data: updatedRecord, error: updateError } = await supabase
        .from('usage_records')
        .update({
          overages,
          estimated_cost: estimatedCost
        })
        .eq('id', usageData.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return updatedRecord as UsageRecord;
    } catch (error) {
      logger.error('Failed to calculate usage billing', { subscriptionId, error });
      throw new Error('Failed to calculate usage billing');
    }
  }

  /**
   * Evaluate if subscription should be auto-upgraded
   */
  async evaluateAutoUpgrade(subscriptionId: string): Promise<UpgradeEvaluation> {
    try {
      const subscription = await this.getSubscriptionById(subscriptionId);
      const currentTier = await this.getSubscriptionTier(subscription.tierId);
      
      if (!currentTier.autoUpgrade.enabled) {
        return { shouldUpgrade: false, reasons: [], metrics: { revenue: 0, usage: 0, activity: 0 } };
      }

      // Get user metrics
      const metrics = await this.getUserMetrics(subscription.userId);
      const reasons: string[] = [];
      let shouldUpgrade = false;

      // Check revenue threshold
      if (currentTier.autoUpgrade.revenueThreshold && 
          metrics.revenue >= currentTier.autoUpgrade.revenueThreshold) {
        shouldUpgrade = true;
        reasons.push(`Revenue threshold exceeded: $${metrics.revenue}`);
      }

      // Check usage threshold
      if (currentTier.autoUpgrade.usageThreshold && 
          metrics.usage >= currentTier.autoUpgrade.usageThreshold) {
        shouldUpgrade = true;
        reasons.push(`Usage threshold exceeded: ${metrics.usage}%`);
      }

      // Check activity threshold
      if (currentTier.autoUpgrade.activityThreshold && 
          metrics.activity >= currentTier.autoUpgrade.activityThreshold) {
        shouldUpgrade = true;
        reasons.push(`Activity threshold exceeded: ${metrics.activity} points`);
      }

      // Find recommended tier
      let recommendedTier: SubscriptionTier | undefined;
      if (shouldUpgrade) {
        const tiers = await this.getSubscriptionTiers();
        recommendedTier = tiers
          .filter(t => t.priority > currentTier.priority)
          .sort((a, b) => a.priority - b.priority)[0];
      }

      return {
        shouldUpgrade,
        recommendedTier,
        reasons,
        metrics
      };
    } catch (error) {
      logger.error('Failed to evaluate auto upgrade', { subscriptionId, error });
      throw new Error('Failed to evaluate auto upgrade');
    }
  }

  /**
   * Process auto-upgrade for eligible subscriptions
   */
  async processAutoUpgrades(): Promise<void> {
    try {
      // Get all active subscriptions with auto-upgrade enabled
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_tiers!inner (*)
        `)
        .eq('status', 'active')
        .eq('subscription_tiers.auto_upgrade.enabled', true);

      if (error) throw error;

      for (const subscription of subscriptions) {
        try {
          const evaluation = await this.evaluateAutoUpgrade(subscription.id);
          
          if (evaluation.shouldUpgrade && evaluation.recommendedTier) {
            // Notify user before upgrading
            if (this.options.notificationEnabled) {
              await this.sendUpgradeNotification(subscription, evaluation);
            }

            // Auto-upgrade after grace period
            setTimeout(async () => {
              await this.updateSubscriptionTier(
                subscription.id,
                evaluation.recommendedTier!.id,
                false
              );
            }, this.options.gracePeriodDays * 24 * 60 * 60 * 1000);
          }
        } catch (error) {
          logger.error('Failed to process auto upgrade for subscription', {
            subscriptionId: subscription.id,
            error
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process auto upgrades', { error });
      throw new Error('Failed to process auto upgrades');
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdatedWebhook(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeletedWebhook(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceededWebhook(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailedWebhook(event.data.object as Stripe.Invoice);
          break;
        default:
          logger.info('Unhandled webhook event', { type: event.type });
      }
    } catch (error) {
      logger.error('Failed to handle webhook', { eventType: event.type, error });
      throw error;
    }
  }

  // Private helper methods

  private async getSubscriptionById(subscriptionId: string): Promise<Subscription> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (error) throw error;
    return data as Subscription;
  }

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    // Check if customer exists
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .single();

    if (user?.stripe_customer_id) {
      return user.stripe_customer_id;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: user?.email,
      metadata: { userId }
    });

    // Update user record
    await supabase
      .from('users')
      .update({ stripe_customer_id: customer.id })
      .eq('id', userId);

    return customer.id;
  }

  private async createStripeSubscription(
    customerId: string,
    tier: SubscriptionTier,
    annual: boolean,
    paymentMethodId?: string
  ): Promise<Stripe.Subscription> {
    const priceId = annual ? tier.stripeAnnualPriceId : tier.stripePriceId;

    return await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription'
      },
      default_payment_method: paymentMethodId,
      expand: ['latest_invoice.payment_intent']
    });
  }

  private async updateStripeSubscription(
    subscriptionId: string,
    newTier: SubscriptionTier,
    immediate: boolean
  ): Promise<void> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newTier.stripePriceId
      }],
      proration_behavior: immediate ? 'always_invoice' : 'create_prorations'
    });
  }

  private async initializeUsageRecord(subscriptionId: string): Promise<void> {
    await supabase
      .from('usage_records')
      .insert({
        subscription_id: subscriptionId,
        period_start: new Date(),
        period_end: this.getEndOfCurrentPeriod(),
        usage: {
          projects: 0,
          storageGB: 0,
          bandwidthGB: 0,
          collaborators: 0,
          exports: 0,
          aiCredits: 0
        },
        overages: {
          storageGB: 0,
          bandwidthGB: 0,
          exports: 0,
          aiCredits: 0
        },
        estimated_cost: 0
      });
  }

  private calculateOverages(usage: any, limits: