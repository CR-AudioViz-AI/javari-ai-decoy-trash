'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Crown, 
  Lock, 
  Unlock, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Settings, 
  Plus,
  Edit,
  Trash2,
  Eye,
  Star
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Premium tier configuration interface
 */
interface PremiumTier {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  agent_access: string[];
  max_agents: number;
  max_requests_per_month: number;
  priority_support: boolean;
  custom_branding: boolean;
  analytics_access: boolean;
  api_access: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  sort_order: number;
}

/**
 * Subscription data interface
 */
interface Subscription {
  id: string;
  user_id: string;
  tier_id: string;
  stripe_subscription_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  current_period_start: string;
  current_period_end: string;
  tier: PremiumTier;
  user: {
    email: string;
    full_name: string;
  };
}

/**
 * Revenue analytics data interface
 */
interface RevenueAnalytics {
  total_revenue: number;
  monthly_recurring_revenue: number;
  annual_recurring_revenue: number;
  active_subscriptions: number;
  churn_rate: number;
  tier_breakdown: {
    tier_id: string;
    tier_name: string;
    subscriber_count: number;
    revenue: number;
  }[];
}

/**
 * Agent access configuration interface
 */
interface AgentAccess {
  agent_id: string;
  tier_ids: string[];
  is_premium_only: boolean;
}

/**
 * Premium Gating Dashboard Component
 * Main dashboard for managing premium content and subscriptions
 */
const PremiumGatingDashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [tiers, setTiers] = useState<PremiumTier[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [analytics, setAnalytics] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const supabase = createClientComponentClient();

  /**
   * Initialize component and load data
   */
  useEffect(() => {
    initializeDashboard();
  }, []);

  /**
   * Initialize dashboard data
   */
  const initializeDashboard = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Get current user
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!currentUser) throw new Error('Not authenticated');

      setUser(currentUser);

      // Load premium tiers, subscriptions, and analytics
      await Promise.all([
        loadPremiumTiers(),
        loadSubscriptions(),
        loadRevenueAnalytics()
      ]);

    } catch (err) {
      console.error('Error initializing dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize dashboard');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load premium tiers
   */
  const loadPremiumTiers = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('premium_tiers')
      .select('*')
      .order('sort_order');

    if (error) throw error;
    setTiers(data || []);
  };

  /**
   * Load subscriptions
   */
  const loadSubscriptions = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        tier:premium_tiers(*),
        user:profiles(email, full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setSubscriptions(data || []);
  };

  /**
   * Load revenue analytics
   */
  const loadRevenueAnalytics = async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc('get_revenue_analytics');
      if (error) throw error;
      setAnalytics(data);
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading premium dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-2xl mx-auto mt-8">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <Crown className="h-8 w-8 text-yellow-500" />
          Premium Content Management
        </h1>
        <p className="text-muted-foreground">
          Manage premium tiers, subscriptions, and monetize your AI agents
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tiers">Tiers</TabsTrigger>
          <TabsTrigger value="access">Access Control</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <RevenueAnalytics analytics={analytics} />
          <SubscriptionOverview subscriptions={subscriptions} />
        </TabsContent>

        <TabsContent value="tiers" className="space-y-6">
          <TierManagementPanel 
            tiers={tiers} 
            onTiersChange={loadPremiumTiers}
          />
        </TabsContent>

        <TabsContent value="access" className="space-y-6">
          <AccessControlMatrix tiers={tiers} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <DetailedAnalytics analytics={analytics} subscriptions={subscriptions} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

/**
 * Revenue Analytics Component
 */
const RevenueAnalytics: React.FC<{ analytics: RevenueAnalytics | null }> = ({ analytics }) => {
  if (!analytics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">${analytics.total_revenue.toLocaleString()}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Revenue</p>
              <p className="text-2xl font-bold">${analytics.monthly_recurring_revenue.toLocaleString()}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Subscribers</p>
              <p className="text-2xl font-bold">{analytics.active_subscriptions.toLocaleString()}</p>
            </div>
            <Users className="h-8 w-8 text-purple-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Churn Rate</p>
              <p className="text-2xl font-bold">{(analytics.churn_rate * 100).toFixed(1)}%</p>
            </div>
            <TrendingUp className={`h-8 w-8 ${analytics.churn_rate > 0.05 ? 'text-red-500' : 'text-green-500'}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Subscription Overview Component
 */
const SubscriptionOverview: React.FC<{ subscriptions: Subscription[] }> = ({ subscriptions }) => {
  const recentSubscriptions = subscriptions.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Subscriptions</CardTitle>
        <CardDescription>Latest subscriber activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentSubscriptions.map((subscription) => (
            <div key={subscription.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-medium">{subscription.user.full_name || subscription.user.email}</p>
                  <p className="text-sm text-muted-foreground">{subscription.tier.name}</p>
                </div>
              </div>
              <div className="text-right">
                <Badge 
                  variant={subscription.status === 'active' ? 'default' : 'secondary'}
                  className={subscription.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                >
                  {subscription.status}
                </Badge>
                <p className="text-sm text-muted-foreground mt-1">
                  ${subscription.tier.price_monthly}/month
                </p>
              </div>
            </div>
          ))}
          {recentSubscriptions.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No subscriptions yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Tier Management Panel Component
 */
const TierManagementPanel: React.FC<{
  tiers: PremiumTier[];
  onTiersChange: () => Promise<void>;
}> = ({ tiers, onTiersChange }) => {
  const [editingTier, setEditingTier] = useState<PremiumTier | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const supabase = createClientComponentClient();

  /**
   * Create new tier
   */
  const createTier = async (tierData: Partial<PremiumTier>): Promise<void> => {
    try {
      const { error } = await supabase
        .from('premium_tiers')
        .insert([{
          ...tierData,
          sort_order: tiers.length,
          is_active: true
        }]);

      if (error) throw error;

      toast.success('Premium tier created successfully');
      setShowCreateForm(false);
      await onTiersChange();
    } catch (error) {
      console.error('Error creating tier:', error);
      toast.error('Failed to create premium tier');
    }
  };

  /**
   * Update tier
   */
  const updateTier = async (tierId: string, updates: Partial<PremiumTier>): Promise<void> => {
    try {
      const { error } = await supabase
        .from('premium_tiers')
        .update(updates)
        .eq('id', tierId);

      if (error) throw error;

      toast.success('Premium tier updated successfully');
      setEditingTier(null);
      await onTiersChange();
    } catch (error) {
      console.error('Error updating tier:', error);
      toast.error('Failed to update premium tier');
    }
  };

  /**
   * Delete tier
   */
  const deleteTier = async (tierId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this tier?')) return;

    try {
      const { error } = await supabase
        .from('premium_tiers')
        .delete()
        .eq('id', tierId);

      if (error) throw error;

      toast.success('Premium tier deleted successfully');
      await onTiersChange();
    } catch (error) {
      console.error('Error deleting tier:', error);
      toast.error('Failed to delete premium tier');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Premium Tiers</h2>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tier
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <Card key={tier.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {tier.name}
                    {!tier.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTier(tier)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTier(tier.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold">${tier.price_monthly}/month</p>
                  <p className="text-sm text-muted-foreground">${tier.price_yearly}/year</p>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium">Features:</p>
                  <ul className="text-sm space-y-1">
                    <li>• {tier.max_agents} AI agents</li>
                    <li>• {tier.max_requests_per_month.toLocaleString()} requests/month</li>
                    {tier.priority_support && <li>• Priority support</li>}
                    {tier.custom_branding && <li>• Custom branding</li>}
                    {tier.analytics_access && <li>• Advanced analytics</li>}
                    {tier.api_access && <li>• API access</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showCreateForm && (
        <TierForm
          onSubmit={createTier}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingTier && (
        <TierForm
          tier={editingTier}
          onSubmit={(data) => updateTier(editingTier.id, data)}
          onCancel={() => setEditingTier(null)}
        />
      )}
    </div>
  );
};

/**
 * Tier Form Component
 */
const TierForm: React.FC<{
  tier?: PremiumTier;
  onSubmit: (data: Partial<PremiumTier>) => Promise<void>;
  onCancel: () => void;
}> = ({ tier, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: tier?.name || '',
    description: tier?.description || '',
    price_monthly: tier?.price_monthly || 0,
    price_yearly: tier?.price_yearly || 0,
    max_agents: tier?.max_agents || 1,
    max_requests_per_month: tier?.max_requests_per_month || 1000,
    priority_support: tier?.priority_support || false,
    custom_branding: tier?.custom_branding || false,
    analytics_access: tier?.analytics_access || false,
    api_access: tier?.api_access || false
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <Card className="fixed inset-0 z-50 m-4 max-w-2xl mx-auto my-8 max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>{tier ? 'Edit Tier' : 'Create New Tier'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Tier Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="price_monthly">Monthly Price</Label>
              <Input
                id="price_monthly"
                type="number"
                value={formData.price_monthly}
                onChange={(e) => setFormData({ ...formData, price_monthly: parseFloat(e.target.value) })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price_yearly">Yearly Price</Label>
              <Input
                id="price_yearly"
                type="number"
                value={formData.price_yearly}
                onChange={(e) => setFormData({ ...formData, price_yearly: parseFloat(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="max_agents">Max Agents</Label>
              <Input
                id="max_agents"
                type="number"
                value={formData.max_agents}
                onChange={(e) => setFormData({ ...formData, max_agents: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="max_requests">Max Requests per Month</Label>
            <Input
              id="max_requests"
              type="number"
              value={formData.max_requests_per_month}
              onChange={(e) => setFormData({ ...formData, max_requests_per_month: parseInt(e.target.value) })}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="priority_support">Priority Support</Label>
              <Switch
                id="priority_support"
                checked={formData.priority_support}
                onCheckedChange={(checked) => setFormData({ ...formData, priority_support: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="custom_branding">Custom Branding</Label>
              <Switch
                id="custom_branding"
                checked={formData.custom_branding}
                onCheckedChange={(checked) => setForm