```tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  MemoryStick,
  Zap,
  Activity,
  Server,
  GitBranch,
  Calendar,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';

interface DeploymentStatus {
  id: string;
  environment: string;
  version: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'paused' | 'rolling_back';
  progress: number;
  startTime: Date;
  currentStage: string;
  estimatedCompletion?: Date;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface MetricData {
  timestamp: Date;
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
  throughput: number;
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

interface DeploymentStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

interface RealTimeDeploymentConsoleProps {
  deploymentId: string;
  onClose?: () => void;
  className?: string;
}

export const RealTimeDeploymentConsole: React.FC<RealTimeDeploymentConsoleProps> = ({
  deploymentId,
  onClose,
  className = ''
}) => {
  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stages, setStages] = useState<DeploymentStage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (isAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isAutoScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/api/deployment/ws?id=${deploymentId}`);
        
        ws.onopen = () => {
          setIsConnected(true);
          console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'deployment_update':
              setDeployment(data.payload);
              break;
            case 'log_entry':
              setLogs(prev => [...prev, data.payload]);
              break;
            case 'metrics_update':
              setMetrics(prev => [...prev.slice(-99), data.payload]);
              break;
            case 'alert':
              setAlerts(prev => [...prev, data.payload]);
              break;
            case 'stage_update':
              setStages(data.payload);
              break;
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          console.log('WebSocket disconnected, attempting reconnect...');
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [deploymentId]);

  const handleDeploymentControl = async (action: string) => {
    try {
      const response = await fetch(`/api/deployment/${deploymentId}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} deployment`);
      }
    } catch (error) {
      console.error(`Error ${action} deployment:`, error);
    }
  };

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      )
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'running': return 'bg-blue-500';
      case 'paused': return 'bg-yellow-500';
      case 'rolling_back': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  const filteredLogs = logs.filter(log => 
    logFilter === 'all' || log.level === logFilter
  );

  if (!deployment) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Connecting to deployment...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <GitBranch className="h-5 w-5" />
                  <span>Deployment {deployment.id}</span>
                  <Badge 
                    variant={deployment.status === 'success' ? 'default' : 
                            deployment.status === 'failed' ? 'destructive' : 'secondary'}
                  >
                    {deployment.status.replace('_', ' ')}
                  </Badge>
                </div>
                <CardDescription className="flex items-center space-x-4 mt-1">
                  <span>{deployment.environment}</span>
                  <span>v{deployment.version}</span>
                  <span className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {deployment.startTime.toLocaleString()}
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {onClose && (
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress: {deployment.currentStage}</span>
              <span>{deployment.progress}%</span>
            </div>
            <Progress value={deployment.progress} className="w-full" />
          </div>
        </CardHeader>
      </Card>

      {/* Alerts */}
      {alerts.filter(alert => !alert.acknowledged).length > 0 && (
        <div className="space-y-2">
          {alerts
            .filter(alert => !alert.acknowledged)
            .map(alert => (
              <Alert key={alert.id} variant={alert.type === 'error' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>{alert.message}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Acknowledge
                  </Button>
                </AlertDescription>
              </Alert>
            ))}
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="controls">Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Deployment Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Deployment Stages</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stages.map((stage, index) => (
                    <div key={stage.name} className="flex items-center space-x-3">
                      <div className={`h-3 w-3 rounded-full ${
                        stage.status === 'completed' ? 'bg-green-500' :
                        stage.status === 'running' ? 'bg-blue-500' :
                        stage.status === 'failed' ? 'bg-red-500' :
                        'bg-gray-300'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{stage.name}</span>
                          <Badge variant="outline">
                            {stage.status}
                          </Badge>
                        </div>
                        {stage.duration && (
                          <div className="text-xs text-muted-foreground">
                            Duration: {Math.round(stage.duration / 1000)}s
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Resource Monitor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-4 w-4" />
                  <span>Resource Usage</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Cpu className="h-4 w-4" />
                      <span>CPU</span>
                    </div>
                    <span>{metrics[metrics.length - 1]?.cpu || 0}%</span>
                  </div>
                  <Progress value={metrics[metrics.length - 1]?.cpu || 0} />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MemoryStick className="h-4 w-4" />
                      <span>Memory</span>
                    </div>
                    <span>{metrics[metrics.length - 1]?.memory || 0}%</span>
                  </div>
                  <Progress value={metrics[metrics.length - 1]?.memory || 0} />
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4" />
                      <span>Response Time</span>
                    </div>
                    <span>{metrics[metrics.length - 1]?.responseTime || 0}ms</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(time) => new Date(time).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip labelFormatter={(time) => new Date(time).toLocaleString()} />
                    <Line type="monotone" dataKey="responseTime" stroke="#8884d8" name="Response Time (ms)" />
                    <Line type="monotone" dataKey="throughput" stroke="#82ca9d" name="Throughput" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resource Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(time) => new Date(time).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip labelFormatter={(time) => new Date(time).toLocaleString()} />
                    <Area type="monotone" dataKey="cpu" stackId="1" stroke="#8884d8" fill="#8884d8" name="CPU %" />
                    <Area type="monotone" dataKey="memory" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Memory %" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(time) => new Date(time).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip labelFormatter={(time) => new Date(time).toLocaleString()} />
                    <Bar dataKey="errorRate" fill="#ff6b6b" name="Error Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-4 w-4" />
                  <span>Live Logs</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <select 
                    value={logFilter} 
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="px-3 py-1 border rounded text-sm"
                  >
                    <option value="all">All Levels</option>
                    <option value="error">Errors</option>
                    <option value="warn">Warnings</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAutoScroll(!isAutoScroll)}
                  >
                    {isAutoScroll ? 'Pause' : 'Resume'} Auto-scroll
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96 w-full">
                <div className="space-y-1 font-mono text-sm">
                  {filteredLogs.map((log) => (
                    <div key={log.id} className="flex items-start space-x-2 py-1">
                      <span className="text-muted-foreground text-xs min-w-20">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <Badge variant="outline" className="text-xs min-w-12">
                        {log.level}
                      </Badge>
                      <span className="text-muted-foreground text-xs min-w-20">
                        {log.service}
                      </span>
                      <span className={getLogLevelColor(log.level)}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-4 w-4" />
                <span>Manual Intervention Controls</span>
              </CardTitle>
              <CardDescription>
                Use these controls to manually intervene in the deployment process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  onClick={() => handleDeploymentControl('pause')}
                  disabled={deployment.status !== 'running'}
                  className="flex items-center space-x-2"
                >
                  <Pause className="h-4 w-4" />
                  <span>Pause</span>
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => handleDeploymentControl('resume')}
                  disabled={deployment.status !== 'paused'}
                  className="flex items-center space-x-2"
                >
                  <Play className="h-4 w-4" />
                  <span>Resume</span>
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => handleDeploymentControl('rollback')}
                  disabled={deployment.status === 'rolling_back'}
                  className="flex items-center space-x-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Rollback</span>
                </Button>
                
                <Button
                  variant="destructive"
                  onClick={() => handleDeploymentControl('emergency_stop')}
                  disabled={deployment.status === 'failed'}
                  className="flex items-center space-x-2"
                >
                  <Square className="h-4 w-4" />
                  <span>Emergency Stop</span>
                </Button>
              </div>
              
              <Separator className="my-6" />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Export Options</h4>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export Logs
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export Metrics
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RealTimeDeploymentConsole;
```