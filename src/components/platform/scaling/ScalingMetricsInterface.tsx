```tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTarget 
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ReferenceLine,
  Dot
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Cpu, 
  HardDrive, 
  Activity, 
  DollarSign, 
  AlertTriangle, 
  Zap, 
  Target, 
  Clock,
  ArrowUp,
  ArrowDown,
  Bot,
  Settings,
  Play,
  Pause
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricPoint {
  timestamp: string;
  value: number;
  threshold?: number;
  predicted?: boolean;
}

interface ResourceMetrics {
  cpu: MetricPoint[];
  memory: MetricPoint[];
  storage: MetricPoint[];
  network: MetricPoint[];
}

interface CostMetric {
  timestamp: string;
  compute: number;
  storage: number;
  network: number;
  total: number;
  projected?: boolean;
}

interface PerformanceMetric {
  timestamp: string;
  latency: number;
  throughput: number;
  errorRate: number;
  availability: number;
}

interface ScalingEvent {
  id: string;
  timestamp: string;
  type: 'scale_up' | 'scale_down' | 'auto_scale';
  resource: 'cpu' | 'memory' | 'storage' | 'replica';
  from: number;
  to: number;
  trigger: string;
  cost_impact: number;
  success: boolean;
}

interface ScalingRecommendation {
  id: string;
  type: 'immediate' | 'scheduled' | 'predictive';
  resource: string;
  action: 'scale_up' | 'scale_down' | 'optimize';
  confidence: number;
  estimated_savings?: number;
  performance_impact: 'positive' | 'neutral' | 'negative';
  description: string;
  timeline: string;
}

interface AlertThreshold {
  id: string;
  metric: string;
  type: 'warning' | 'critical';
  threshold: number;
  current_value: number;
  status: 'normal' | 'warning' | 'critical';
}

interface ScalingMetricsProps {
  projectId: string;
  timeRange?: '1h' | '24h' | '7d' | '30d';
  onScalingAction?: (action: string, params: Record<string, any>) => void;
  className?: string;
}

export default function ScalingMetricsInterface({
  projectId,
  timeRange = '24h',
  onScalingAction,
  className
}: ScalingMetricsProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [autoScalingEnabled, setAutoScalingEnabled] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);

  // Mock data - in real implementation, fetch from API
  const resourceMetrics: ResourceMetrics = {
    cpu: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      value: 45 + Math.sin(i * 0.5) * 20 + Math.random() * 10,
      threshold: 80
    })),
    memory: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      value: 62 + Math.cos(i * 0.3) * 15 + Math.random() * 8,
      threshold: 85
    })),
    storage: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      value: 78 + Math.random() * 5,
      threshold: 90
    })),
    network: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      value: 35 + Math.sin(i * 0.4) * 25 + Math.random() * 12,
      threshold: 75
    }))
  };

  const costMetrics: CostMetric[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
    compute: 120 + Math.random() * 40,
    storage: 45 + Math.random() * 15,
    network: 25 + Math.random() * 10,
    total: 190 + Math.random() * 65,
    projected: i > 25
  }));

  const performanceMetrics: PerformanceMetric[] = Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    latency: 150 + Math.sin(i * 0.6) * 50 + Math.random() * 30,
    throughput: 1200 + Math.cos(i * 0.4) * 300 + Math.random() * 100,
    errorRate: Math.max(0, 0.5 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.2),
    availability: Math.min(100, 99.5 + Math.random() * 0.5)
  }));

  const scalingHistory: ScalingEvent[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      type: 'auto_scale',
      resource: 'cpu',
      from: 2,
      to: 4,
      trigger: 'High CPU utilization (>80%)',
      cost_impact: 45.50,
      success: true
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      type: 'scale_down',
      resource: 'replica',
      from: 5,
      to: 3,
      trigger: 'Low traffic pattern detected',
      cost_impact: -25.30,
      success: true
    }
  ];

  const recommendations: ScalingRecommendation[] = [
    {
      id: '1',
      type: 'immediate',
      resource: 'Memory',
      action: 'scale_up',
      confidence: 87,
      performance_impact: 'positive',
      description: 'Memory utilization approaching threshold. Scale up recommended.',
      timeline: 'Next 30 minutes'
    },
    {
      id: '2',
      type: 'predictive',
      resource: 'CPU',
      action: 'optimize',
      confidence: 73,
      estimated_savings: 65.40,
      performance_impact: 'neutral',
      description: 'CPU usage pattern suggests over-provisioning during off-peak hours.',
      timeline: 'Tonight 11 PM - 6 AM'
    }
  ];

  const alertThresholds: AlertThreshold[] = [
    {
      id: '1',
      metric: 'CPU Utilization',
      type: 'warning',
      threshold: 75,
      current_value: 68,
      status: 'normal'
    },
    {
      id: '2',
      metric: 'Memory Usage',
      type: 'critical',
      threshold: 90,
      current_value: 82,
      status: 'warning'
    }
  ];

  const currentMetrics = useMemo(() => ({
    cpu: resourceMetrics.cpu[resourceMetrics.cpu.length - 1]?.value || 0,
    memory: resourceMetrics.memory[resourceMetrics.memory.length - 1]?.value || 0,
    storage: resourceMetrics.storage[resourceMetrics.storage.length - 1]?.value || 0,
    network: resourceMetrics.network[resourceMetrics.network.length - 1]?.value || 0,
    cost: costMetrics[costMetrics.length - 1]?.total || 0,
    latency: performanceMetrics[performanceMetrics.length - 1]?.latency || 0,
    throughput: performanceMetrics[performanceMetrics.length - 1]?.throughput || 0,
    availability: performanceMetrics[performanceMetrics.length - 1]?.availability || 0
  }), [resourceMetrics, costMetrics, performanceMetrics]);

  useEffect(() => {
    // Simulate real-time connection
    const timer = setTimeout(() => setIsConnected(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleScalingAction = (action: string, params: Record<string, any>) => {
    onScalingAction?.(action, params);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Platform Scaling Metrics
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time resource utilization and predictive scaling insights
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">CPU Usage</p>
                <p className="text-2xl font-bold">{currentMetrics.cpu.toFixed(1)}%</p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <Cpu className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress value={currentMetrics.cpu} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Memory</p>
                <p className="text-2xl font-bold">{currentMetrics.memory.toFixed(1)}%</p>
              </div>
              <div className="p-2 bg-green-50 rounded-lg">
                <HardDrive className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <div className="mt-3">
              <Progress value={currentMetrics.memory} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Cost/Day</p>
                <p className="text-2xl font-bold">${currentMetrics.cost.toFixed(2)}</p>
              </div>
              <div className="p-2 bg-yellow-50 rounded-lg">
                <DollarSign className="w-4 h-4 text-yellow-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600">+5.2% vs yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Availability</p>
                <p className="text-2xl font-bold">{currentMetrics.availability.toFixed(2)}%</p>
              </div>
              <div className="p-2 bg-purple-50 rounded-lg">
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Target className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600">Above SLA</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTarget value="overview">Overview</TabsTarget>
          <TabsTarget value="resources">Resources</TabsTarget>
          <TabsTarget value="costs">Costs</TabsTarget>
          <TabsTarget value="performance">Performance</TabsTarget>
          <TabsTarget value="recommendations">AI Insights</TabsTarget>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Resource Utilization Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Resource Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={resourceMetrics.cpu.map((cpu, i) => ({
                    timestamp: formatTimestamp(cpu.timestamp),
                    cpu: cpu.value,
                    memory: resourceMetrics.memory[i]?.value,
                    storage: resourceMetrics.storage[i]?.value
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="cpu" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="CPU (%)"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="memory" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="Memory (%)"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="storage" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      name="Storage (%)"
                    />
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Scaling History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Scaling Events
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {scalingHistory.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {event.type === 'auto_scale' && (
                          <Bot className="w-4 h-4 text-blue-600" />
                        )}
                        {event.action === 'scale_up' ? (
                          <ArrowUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className="font-medium">{event.resource.toUpperCase()}</span>
                        <Badge variant="outline">{event.from} → {event.to}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.trigger}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(event.timestamp)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        'text-sm font-medium',
                        event.cost_impact > 0 ? 'text-red-600' : 'text-green-600'
                      )}>
                        {event.cost_impact > 0 ? '+' : ''}${Math.abs(event.cost_impact).toFixed(2)}
                      </p>
                      <Badge variant={event.success ? 'default' : 'destructive'}>
                        {event.success ? 'Success' : 'Failed'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Alerts and Auto-scaling Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {alertThresholds.map((alert) => (
                  <div key={alert.id} className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    getStatusColor(alert.status)
                  )}>
                    <div>
                      <p className="font-medium">{alert.metric}</p>
                      <p className="text-sm opacity-75">
                        Current: {alert.current_value}% | Threshold: {alert.threshold}%
                      </p>
                    </div>
                    <Badge variant={alert.status === 'critical' ? 'destructive' : 'secondary'}>
                      {alert.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Auto-scaling Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-scaling</p>
                    <p className="text-sm text-muted-foreground">
                      Automatically adjust resources based on demand
                    </p>
                  </div>
                  <Button
                    variant={autoScalingEnabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAutoScalingEnabled(!autoScalingEnabled)}
                  >
                    {autoScalingEnabled ? (
                      <>
                        <Pause className="w-4 h-4 mr-1" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        Enable
                      </>
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Scale-up threshold</span