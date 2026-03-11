```tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  Filter,
  HardDrive,
  Memory,
  Network,
  Play,
  RefreshCw,
  Server,
  Settings,
  TrendingUp,
  Users,
  Wifi,
  X,
  XCircle,
  Zap
} from 'lucide-react';

// Types
interface DeploymentEvent {
  id: string;
  pipeline_id: string;
  environment: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  started_at: string;
  completed_at?: string;
  duration?: number;
  error_message?: string;
}

interface EnvironmentHealth {
  id: string;
  environment: string;
  service: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  response_time: number;
  uptime: number;
  last_check: string;
}

interface ResourceMetrics {
  timestamp: string;
  environment: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_io: number;
  active_connections: number;
}

interface PerformanceMetric {
  id: string;
  environment: string;
  service: string;
  metric_type: 'response_time' | 'throughput' | 'error_rate' | 'availability';
  value: number;
  threshold: number;
  timestamp: string;
}

interface AlertRule {
  id: string;
  name: string;
  environment: string;
  service: string;
  metric_type: string;
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  triggered_at?: string;
  acknowledged_at?: string;
}

interface FilterState {
  environment: string;
  service: string;
  timeRange: string;
  status: string;
}

interface DrillDownData {
  type: 'deployment' | 'environment' | 'performance' | 'alert';
  id: string;
  data: any;
}

// Status Indicator Component
const StatusIndicator: React.FC<{
  status: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ status, size = 'md' }) => {
  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
      case 'healthy':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' };
      case 'running':
      case 'pending':
        return { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100' };
      case 'failed':
      case 'critical':
        return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' };
      case 'warning':
        return { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-100' };
      default:
        return { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-100' };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;
  const sizeClass = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${config.bg}`}>
      <Icon className={`${sizeClass} ${config.color}`} />
      <span className={`capitalize text-xs font-medium ${config.color}`}>
        {status}
      </span>
    </div>
  );
};

// Alert Badge Component
const AlertBadge: React.FC<{
  alert: AlertRule;
  onClick?: () => void;
}> = ({ alert, onClick }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <Badge
      variant="secondary"
      className={`cursor-pointer hover:opacity-80 ${getSeverityColor(alert.severity)}`}
      onClick={onClick}
    >
      <AlertTriangle className="h-3 w-3 mr-1" />
      {alert.name}
    </Badge>
  );
};

// Pipeline Status Grid Component
const PipelineStatusGrid: React.FC<{
  deployments: DeploymentEvent[];
  onDrillDown: (data: DrillDownData) => void;
}> = ({ deployments, onDrillDown }) => {
  const groupedDeployments = useMemo(() => {
    return deployments.reduce((acc, deployment) => {
      const key = `${deployment.environment}-${deployment.pipeline_id}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(deployment);
      return acc;
    }, {} as Record<string, DeploymentEvent[]>);
  }, [deployments]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Object.entries(groupedDeployments).map(([key, pipelineDeployments]) => {
        const latest = pipelineDeployments[0];
        const [environment, pipelineId] = key.split('-');
        
        return (
          <Card
            key={key}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onDrillDown({
              type: 'deployment',
              id: latest.id,
              data: { pipeline: pipelineDeployments, environment, pipelineId }
            })}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium truncate">
                  {pipelineId}
                </CardTitle>
                <StatusIndicator status={latest.status} size="sm" />
              </div>
              <p className="text-xs text-muted-foreground">{environment}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Progress</span>
                  <span>{latest.progress}%</span>
                </div>
                <Progress value={latest.progress} className="h-1" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{latest.stage}</span>
                  <span>{latest.duration ? `${latest.duration}s` : 'Running'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// Environment Health Matrix Component
const EnvironmentHealthMatrix: React.FC<{
  healthData: EnvironmentHealth[];
  onDrillDown: (data: DrillDownData) => void;
}> = ({ healthData, onDrillDown }) => {
  const environments = useMemo(() => {
    return Array.from(new Set(healthData.map(h => h.environment)));
  }, [healthData]);

  const services = useMemo(() => {
    return Array.from(new Set(healthData.map(h => h.service)));
  }, [healthData]);

  const getHealthData = (environment: string, service: string) => {
    return healthData.find(h => h.environment === environment && h.service === service);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${environments.length}, 1fr)` }}>
          {/* Header */}
          <div className="p-2"></div>
          {environments.map(env => (
            <div key={env} className="p-2 text-xs font-medium text-center border-b">
              {env}
            </div>
          ))}
          
          {/* Rows */}
          {services.map(service => (
            <React.Fragment key={service}>
              <div className="p-2 text-xs font-medium border-r">{service}</div>
              {environments.map(env => {
                const health = getHealthData(env, service);
                return (
                  <div
                    key={`${env}-${service}`}
                    className="p-1 border border-gray-200 cursor-pointer hover:bg-gray-50"
                    onClick={() => health && onDrillDown({
                      type: 'environment',
                      id: health.id,
                      data: health
                    })}
                  >
                    {health ? (
                      <div className="text-center">
                        <StatusIndicator status={health.status} size="sm" />
                        <div className="text-xs mt-1 space-y-1">
                          <div>CPU: {health.cpu_usage}%</div>
                          <div>MEM: {health.memory_usage}%</div>
                          <div>RT: {health.response_time}ms</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400">
                        <span className="text-xs">N/A</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// Resource Utilization Charts Component
const ResourceUtilizationCharts: React.FC<{
  resourceData: ResourceMetrics[];
  timeRange: string;
}> = ({ resourceData, timeRange }) => {
  const chartData = useMemo(() => {
    return resourceData.map(data => ({
      ...data,
      time: new Date(data.timestamp).toLocaleTimeString()
    }));
  }, [resourceData]);

  const averages = useMemo(() => {
    if (resourceData.length === 0) return {};
    
    return {
      cpu: resourceData.reduce((sum, d) => sum + d.cpu_usage, 0) / resourceData.length,
      memory: resourceData.reduce((sum, d) => sum + d.memory_usage, 0) / resourceData.length,
      disk: resourceData.reduce((sum, d) => sum + d.disk_usage, 0) / resourceData.length,
      network: resourceData.reduce((sum, d) => sum + d.network_io, 0) / resourceData.length,
    };
  }, [resourceData]);

  const pieData = [
    { name: 'CPU', value: averages.cpu || 0, color: '#8884d8' },
    { name: 'Memory', value: averages.memory || 0, color: '#82ca9d' },
    { name: 'Disk', value: averages.disk || 0, color: '#ffc658' },
    { name: 'Network', value: averages.network || 0, color: '#ff7300' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Resource Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="cpu_usage" stroke="#8884d8" strokeWidth={2} />
              <Line type="monotone" dataKey="memory_usage" stroke="#82ca9d" strokeWidth={2} />
              <Line type="monotone" dataKey="disk_usage" stroke="#ffc658" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Resource Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Average Resource Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs">{entry.name}: {entry.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Performance Metrics Panel Component
const PerformanceMetricsPanel: React.FC<{
  performanceData: PerformanceMetric[];
  onDrillDown: (data: DrillDownData) => void;
}> = ({ performanceData, onDrillDown }) => {
  const groupedMetrics = useMemo(() => {
    return performanceData.reduce((acc, metric) => {
      if (!acc[metric.metric_type]) {
        acc[metric.metric_type] = [];
      }
      acc[metric.metric_type].push(metric);
      return acc;
    }, {} as Record<string, PerformanceMetric[]>);
  }, [performanceData]);

  const getMetricIcon = (type: string) => {
    switch (type) {
      case 'response_time':
        return Clock;
      case 'throughput':
        return TrendingUp;
      case 'error_rate':
        return AlertTriangle;
      case 'availability':
        return CheckCircle;
      default:
        return Activity;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {Object.entries(groupedMetrics).map(([metricType, metrics]) => {
        const average = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
        const threshold = metrics[0]?.threshold || 0;
        const isHealthy = metricType === 'availability' 
          ? average >= threshold 
          : average <= threshold;
        const Icon = getMetricIcon(metricType);

        return (
          <Card
            key={metricType}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onDrillDown({
              type: 'performance',
              id: metricType,
              data: { type: metricType, metrics, average, threshold }
            })}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium capitalize">
                  {metricType.replace('_', ' ')}
                </CardTitle>
                <Icon className={`h-4 w-4 ${isHealthy ? 'text-green-500' : 'text-red-500'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {average.toFixed(metricType === 'response_time' ? 0 : 2)}
                    {metricType === 'response_time' ? 'ms' : 
                     metricType === 'availability' ? '%' : 
                     metricType === 'error_rate' ? '%' : '/s'}
                  </span>
                  <StatusIndicator 
                    status={isHealthy ? 'healthy' : 'critical'} 
                    size="sm" 
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Threshold: {threshold}
                  {metricType === 'response_time' ? 'ms' : 
                   metricType === 'availability' ? '%' : 
                   metricType === 'error_rate' ? '%' : '/s'}
                </div>
                <Progress 
                  value={metricType === 'availability' ? average : (average / threshold) * 100} 
                  className="h-1" 
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// Alert Management Widget Component
const AlertManagementWidget: React.FC<{
  alerts: AlertRule[];
  onDrillDown: (data: DrillDownData) => void;
  onAcknowledge: (alertId: string) => void;
}> = ({ alerts, onDrillDown, onAcknowledge }) => {
  const activeAlerts = alerts.filter(alert => alert.is_active && !alert.acknowledged_at);
  const acknowledgedAlerts = alerts.filter(alert => alert.acknowledged_at);

  const severityCounts = useMemo(() => {
    return activeAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [activeAlerts]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
          <Badge variant="destructive">{activeAlerts.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Severity Summary */}
          <div className="grid grid-cols-4 gap-2">
            {['critical', 'high', 'medium', 'low'].map(severity => (
              <div key={severity} className="text-center">
                <div className={`text-lg font-bold ${
                  severity === 'critical' ? 'text-red-500' :
                  severity === 'high' ? 'text-orange-500' :
                  severity === 'medium' ? 'text-yellow-600' : 'text-blue-500'
                }`}>
                  {severityCounts[severity] || 0}
                </div>
                <div className="text-xs text-muted-foreground capitalize">{severity}</div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Alert List */}
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {activeAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-2 rounded border hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <AlertBadge 
                        alert={alert} 
                        onClick={() => onDrillDown({
                          type: 'alert',
                          id: alert.id,
                          data: alert
                        })}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {alert.environment} • {alert.service}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAcknowledge(alert.id)}
                  >
                    <CheckCircle className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {activeAlerts.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>No active alerts</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

// Deployment Timeline Component
const DeploymentTimeline: React.FC<{
  deployments: DeploymentEvent[];
  timeRange: string;
}> = ({ deployments, timeRange }) => {
  const timelineData = useMemo(() => {
    return deployments
      .sort((a, b) =>