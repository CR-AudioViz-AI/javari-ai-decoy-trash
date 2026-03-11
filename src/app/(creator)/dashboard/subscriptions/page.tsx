```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Plus,
  Edit,
  Trash2,
  Users,
  DollarSign,
  TrendingUp,
  TestTube,
  Play,
  Pause,
  Settings,
  Target,
  BarChart3,
  Crown,
} from 'lucide-react';
import { toast } from 'sonner';

// Types
interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_interval: 'monthly' | 'yearly';
  features: string[];
  is_active: boolean;
  subscriber_count: number;
  stripe_product_id: string;
  stripe_price_id: string;
  created_at: string;
  updated_at: string;
}

interface ABTest {
  id: string;
  name: string;
  description: string;
  test_type: 'price' | 'features' | 'description';
  status: 'draft' | 'running' | 'completed' | 'paused';
  control_variant: any;
  test_variant: any;
  traffic_split: number;
  start_date: string;
  end_date?: string;
  results: {
    control_conversions: number;
    test_conversions: number;
    control_revenue: number;
    test_revenue: number;
    statistical_significance: number;
  };
  created_at: string;
}

interface AnalyticsData {
  date: string;
  subscribers: number;
  revenue: number;
  conversions: number;
  churn_rate: number;
}

interface Subscriber {
  id: string;
  email: string;
  tier_name: string;
  status: 'active' | 'canceled' | 'past_due';
  created_at: string;
  next_billing_date: string;
  total_revenue: number;
}

// Validation schemas
const tierFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be less than 50 characters'),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be less than 500 characters'),
  price: z.number().min(0, 'Price must be positive'),
  billing_interval: z.enum(['monthly', 'yearly']),
  features: z.array(z.string()).min(1, 'At least one feature is required'),
  is_active: z.boolean(),
});

const abTestFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be less than 500 characters'),
  test_type: z.enum(['price', 'features', 'description']),
  tier_id: z.string().min(1, 'Tier selection is required'),
  traffic_split: z.number().min(10).max(90),
  test_variant: z.record(z.any()),
  duration_days: z.number().min(7).max(90),
});

// Mock data fetching functions (replace with actual API calls)
const fetchSubscriptionTiers = async (): Promise<SubscriptionTier[]> => {
  // Simulate API call
  return [
    {
      id: '1',
      name: 'Basic',
      description: 'Essential features for getting started',
      price: 9.99,
      billing_interval: 'monthly',
      features: ['Audio uploads', 'Basic analytics', 'Community support'],
      is_active: true,
      subscriber_count: 150,
      stripe_product_id: 'prod_basic',
      stripe_price_id: 'price_basic',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: 'Pro',
      description: 'Advanced features for growing creators',
      price: 29.99,
      billing_interval: 'monthly',
      features: ['Unlimited uploads', 'Advanced analytics', 'Priority support', 'Custom branding'],
      is_active: true,
      subscriber_count: 85,
      stripe_product_id: 'prod_pro',
      stripe_price_id: 'price_pro',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];
};

const fetchABTests = async (): Promise<ABTest[]> => {
  return [
    {
      id: '1',
      name: 'Pro Tier Pricing Test',
      description: 'Testing $24.99 vs $29.99 for Pro tier',
      test_type: 'price',
      status: 'running',
      control_variant: { price: 29.99 },
      test_variant: { price: 24.99 },
      traffic_split: 50,
      start_date: '2024-01-15T00:00:00Z',
      results: {
        control_conversions: 45,
        test_conversions: 62,
        control_revenue: 1349.55,
        test_revenue: 1549.38,
        statistical_significance: 0.85,
      },
      created_at: '2024-01-15T00:00:00Z',
    },
  ];
};

const fetchAnalyticsData = async (): Promise<AnalyticsData[]> => {
  const data: AnalyticsData[] = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      subscribers: Math.floor(Math.random() * 50) + 200 + i,
      revenue: Math.floor(Math.random() * 1000) + 3000,
      conversions: Math.floor(Math.random() * 10) + 5,
      churn_rate: Math.random() * 5 + 2,
    });
  }
  return data;
};

const fetchSubscribers = async (): Promise<Subscriber[]> => {
  return Array.from({ length: 50 }, (_, i) => ({
    id: `sub_${i}`,
    email: `subscriber${i}@example.com`,
    tier_name: i % 3 === 0 ? 'Pro' : 'Basic',
    status: ['active', 'canceled', 'past_due'][Math.floor(Math.random() * 3)] as any,
    created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    next_billing_date: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    total_revenue: Math.floor(Math.random() * 500) + 50,
  }));
};

// Components
const TierCard: React.FC<{
  tier: SubscriptionTier;
  onEdit: (tier: SubscriptionTier) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, isActive: boolean) => void;
}> = ({ tier, onEdit, onDelete, onToggleStatus }) => {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">{tier.name}</CardTitle>
            <Badge variant={tier.is_active ? 'default' : 'secondary'}>
              {tier.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(tier)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(tier.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>{tier.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">${tier.price}</span>
            <span className="text-sm text-muted-foreground">/{tier.billing_interval}</span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {tier.subscriber_count} subscribers
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Features:</h4>
            <ul className="space-y-1 text-sm">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Switch
                checked={tier.is_active}
                onCheckedChange={(checked) => onToggleStatus(tier.id, checked)}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TierForm: React.FC<{
  tier?: SubscriptionTier;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}> = ({ tier, onSubmit, onCancel }) => {
  const form = useForm({
    resolver: zodResolver(tierFormSchema),
    defaultValues: {
      name: tier?.name || '',
      description: tier?.description || '',
      price: tier?.price || 0,
      billing_interval: tier?.billing_interval || 'monthly',
      features: tier?.features || [''],
      is_active: tier?.is_active ?? true,
    },
  });

  const [features, setFeatures] = useState<string[]>(tier?.features || ['']);

  const addFeature = () => {
    setFeatures([...features, '']);
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    setFeatures(newFeatures);
    form.setValue('features', newFeatures.filter(f => f.trim() !== ''));
  };

  const removeFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index);
    setFeatures(newFeatures);
    form.setValue('features', newFeatures.filter(f => f.trim() !== ''));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tier Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Basic, Pro, Premium" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what this tier offers..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="9.99"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billing_interval"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Interval</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <FormLabel>Features</FormLabel>
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="Enter feature"
                value={feature}
                onChange={(e) => updateFeature(index, e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeFeature(index)}
                disabled={features.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addFeature}>
            <Plus className="h-4 w-4 mr-2" />
            Add Feature
          </Button>
        </div>

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Status</FormLabel>
                <FormDescription>
                  Make this tier available for new subscribers
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {tier ? 'Update Tier' : 'Create Tier'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

const AnalyticsChart: React.FC<{ data: AnalyticsData[] }> = ({ data }) => {
  const [chartType, setChartType] = useState<'revenue' | 'subscribers' | 'conversions'>('revenue');

  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: chartType === 'revenue' ? item.revenue : 
           chartType === 'subscribers' ? item.subscribers : 
           item.conversions,
    ...item,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Analytics Overview</CardTitle>
          <Select value={chartType} onValueChange={(value: any) => setChartType(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="subscribers">Subscribers</SelectItem>
              <SelectItem value="conversions">Conversions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const ABTestCard: React.FC<{
  test: ABTest;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ test, onStart, onPause, onDelete }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const controlConversionRate = test.results.control_conversions > 0 ? 
    (test.results.control_conversions / (test.results.control_conversions + 100)) * 100 : 0;
  const testConversionRate = test.results.test_conversions > 0 ? 
    (test.results.test_conversions / (test.results.test_conversions + 100)) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{test.name}</CardTitle>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${getStatusColor(test.status)}`} />
              <Badge variant="outline" className="capitalize">
                {test.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {test.status === 'draft' || test.status === 'paused' ? (
              <Button variant="outline" size="sm" onClick={() => onStart(test.id)}>
                <Play className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onPause(test.id)}>
                <Pause className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(test.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>{test.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Control Variant</h4>
              <div className="p-3 bg-muted rounded-lg">
                {test.test_type === 'price' && (
                  <div className="text-lg font-semibold">
                    ${test.control_variant.price}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  {test.results.control_conversions} conversions
                </div>
                <div className="text-sm text-muted-foreground">
                  {controlConversionRate.toFixed(1)}% conversion rate
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Test Variant</h4>
              <div className="p-3 bg-muted rounded-lg">
                {test.test_type === 'price' && (
                  <div className="text-lg font-semibold">
                    ${test.test_variant.price}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  {test.results.test_conversions} conversions
                </div>
                <div className="text-