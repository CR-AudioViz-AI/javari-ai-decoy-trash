```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Activity, 
  AlertTriangle, 
  Brain, 
  CheckCircle, 
  Clock, 
  Cpu, 
  Database, 
  Eye, 
  GitBranch, 
  HardDrive, 
  Info, 
  MemoryStick, 
  Network, 
  Play, 
  Pause, 
  Power, 
  RefreshCw, 
  Settings, 
  Shield, 
  TrendingUp, 
  Wifi, 
  Zap 
} from 'lucide-react';

interface SystemDecision {
  id: string;
  timestamp: string;
  decision_type: string;
  confidence: number;
  reasoning: string;
  parameters: Record<string, any>;
  outcome: 'pending' | 'success' | 'failed';
  impact_score: number;
  parent_decision_id?: string;
}

interface SystemMetric {
  id: string;
  metric_name: string;
  value: number;
  unit: string;
  threshold_warning: number;
  threshold_critical: number;
  last_updated: string;
}

interface AutonomousSystem {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'error' | 'maintenance';
  autonomous_mode: boolean;
  last_decision: string;
  performance_score: number;
  uptime: number;
}

interface SystemAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
  system_id: string;
}

interface ManualOverride {
  system_id: string;
  override_type: string;
  parameters: Record<string, any>;
  duration?: number;
  reason: string;
}

export default function AutonomousOperationsControlPanel() {
  const [decisions, setDecisions] = useState<SystemDecision[]>([]);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [systems, setSystems] = useState<AutonomousSystem[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<SystemDecision | null>(null);
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);
  const [isOverridePanelOpen, setIsOverridePanelOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  const supabase = createClientComponentClient();

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [decisionsResponse, metricsResponse, systemsResponse, alertsResponse] = await Promise.all([
        supabase
          .from('autonomous_decisions')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50),
        supabase
          .from('system_metrics')
          .select('*')
          .order('last_updated', { ascending: false }),
        supabase
          .from('autonomous_systems')
          .select('*')
          .order('name'),
        supabase
          .from('system_alerts')
          .select('*')
          .eq('resolved', false)
          .order('timestamp', { ascending: false })
      ]);

      if (decisionsResponse.data) setDecisions(decisionsResponse.data);
      if (metricsResponse.data) setMetrics(metricsResponse.data);
      if (systemsResponse.data) setSystems(systemsResponse.data);
      if (alertsResponse.data) setAlerts(alertsResponse.data);
      
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const subscribeToRealTimeUpdates = useCallback(() => {
    const decisionsChannel = supabase
      .channel('decisions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'autonomous_decisions'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDecisions(prev => [payload.new as SystemDecision, ...prev.slice(0, 49)]);
          } else if (payload.eventType === 'UPDATE') {
            setDecisions(prev => prev.map(d => d.id === payload.new.id ? payload.new as SystemDecision : d));
          }
        }
      )
      .subscribe();

    const metricsChannel = supabase
      .channel('metrics_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_metrics'
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setMetrics(prev => prev.map(m => m.id === payload.new.id ? payload.new as SystemMetric : m));
          }
        }
      )
      .subscribe();

    const alertsChannel = supabase
      .channel('alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_alerts'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && !payload.new.resolved) {
            setAlerts(prev => [payload.new as SystemAlert, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new as SystemAlert : a).filter(a => !a.resolved));
          }
        }
      )
      .subscribe();

    const systemsChannel = supabase
      .channel('systems_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'autonomous_systems'
        },
        (payload) => {
          setSystems(prev => prev.map(s => s.id === payload.new.id ? payload.new as AutonomousSystem : s));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(decisionsChannel);
      supabase.removeChannel(metricsChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(systemsChannel);
    };
  }, [supabase]);

  const executeManualOverride = async (override: ManualOverride) => {
    try {
      const { data, error } = await supabase.rpc('execute_manual_override', {
        system_id: override.system_id,
        override_type: override.override_type,
        parameters: override.parameters,
        duration: override.duration,
        reason: override.reason
      });

      if (error) throw error;
      
      setIsOverridePanelOpen(false);
      setSelectedSystem(null);
    } catch (error) {
      console.error('Error executing manual override:', error);
    }
  };

  const toggleSystemAutonomy = async (systemId: string, autonomous: boolean) => {
    try {
      const { error } = await supabase
        .from('autonomous_systems')
        .update({ autonomous_mode: autonomous })
        .eq('id', systemId);

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling system autonomy:', error);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('system_alerts')
        .update({ resolved: true })
        .eq('id', alertId);

      if (error) throw error;
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getMetricStatus = (metric: SystemMetric): 'normal' | 'warning' | 'critical' => {
    if (metric.value >= metric.threshold_critical) return 'critical';
    if (metric.value >= metric.threshold_warning) return 'warning';
    return 'normal';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'maintenance': return <Settings className="h-4 w-4 text-blue-500" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
      critical: 'destructive'
    };
    return variants[severity] || 'default';
  };

  useEffect(() => {
    fetchInitialData();
    const cleanup = subscribeToRealTimeUpdates();
    
    return cleanup;
  }, [fetchInitialData, subscribeToRealTimeUpdates]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading control panel...</span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Autonomous Operations Control</h1>
            <p className="text-muted-foreground">Real-time monitoring and control of autonomous systems</p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
              <Wifi className="h-3 w-3 mr-1" />
              {connectionStatus}
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchInitialData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* System Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {systems.map((system) => (
            <Card key={system.id} className="relative">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{system.name}</CardTitle>
                {getStatusIcon(system.status)}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Autonomous Mode</span>
                    <Switch
                      checked={system.autonomous_mode}
                      onCheckedChange={(checked) => toggleSystemAutonomy(system.id, checked)}
                      aria-label={`Toggle autonomous mode for ${system.name}`}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Performance</span>
                    <span className="text-sm font-medium">{system.performance_score}%</span>
                  </div>
                  <Progress value={system.performance_score} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Uptime: {Math.round(system.uptime)}h</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSystem(system.id);
                        setIsOverridePanelOpen(true);
                      }}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                Active Alerts ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <Alert key={alert.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant={getSeverityBadge(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <AlertTitle className="text-sm">{alert.message}</AlertTitle>
                        </div>
                        <AlertDescription className="text-xs text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleString()}
                        </AlertDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </Alert>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resource Utilization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                Resource Utilization
              </CardTitle>
              <CardDescription>Real-time system resource monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {metrics.map((metric) => {
                  const status = getMetricStatus(metric);
                  const percentage = Math.min((metric.value / metric.threshold_critical) * 100, 100);
                  
                  return (
                    <div key={metric.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {metric.metric_name.toLowerCase().includes('cpu') && <Cpu className="h-4 w-4" />}
                          {metric.metric_name.toLowerCase().includes('memory') && <MemoryStick className="h-4 w-4" />}
                          {metric.metric_name.toLowerCase().includes('disk') && <HardDrive className="h-4 w-4" />}
                          {metric.metric_name.toLowerCase().includes('network') && <Network className="h-4 w-4" />}
                          <span className="text-sm font-medium">{metric.metric_name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm">{metric.value}{metric.unit}</span>
                          <Badge variant={status === 'critical' ? 'destructive' : status === 'warning' ? 'secondary' : 'default'}>
                            {status}
                          </Badge>
                        </div>
                      </div>
                      <Progress
                        value={percentage}
                        className={`h-2 ${status === 'critical' ? 'bg-red-100' : status === 'warning' ? 'bg-yellow-100' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent Decisions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Brain className="h-5 w-5 mr-2" />
                Autonomous Decisions
              </CardTitle>
              <CardDescription>Real-time decision tree visualization</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-3">
                  {decisions.slice(0, 10).map((decision) => (
                    <div
                      key={decision.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{decision.decision_type}</span>
                          <Badge variant={decision.outcome === 'success' ? 'default' : decision.outcome === 'failed' ? 'destructive' : 'secondary'}>
                            {decision.outcome}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(decision.timestamp).toLocaleString()}</span>
                          <span>•</span>
                          <span>Confidence: {Math.round(decision.confidence * 100)}%</span>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDecision(decision);
                              setIsReasoningModalOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          View decision reasoning
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Decision Reasoning Modal */}
        <Dialog open={isReasoningModalOpen} onOpenChange={setIsReasoningModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Brain className="h-5 w-5 mr-2" />
                Decision Reasoning Analysis
              </DialogTitle>
              <DialogDescription>
                Detailed explanation of autonomous system decision making
              </DialogDescription>
            </DialogHeader>
            {selectedDecision && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Decision Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <span className="font-medium">{selectedDecision.decision_type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence:</span>
                        <span className="font-medium">{Math.round(selectedDecision.confidence * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Impact Score:</span>
                        <span className="font-medium">{selectedDecision.impact_score}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Outcome:</span>
                        <Badge variant={selectedDecision.outcome === 'success' ? 'default' : selectedDecision.outcome === 'failed' ? 'destructive' : 'secondary'}>
                          {selectedDecision.outcome}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Parameters</h4>
                    <ScrollArea className="h-32">
                      <pre className="text-xs bg-muted p-2 rounded">
                        {JSON.stringify(selectedDecision.parameters, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2 flex items-center">
                    <Info className="h-4 w-4 mr-2" />
                    Reasoning
                  </h4>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm leading-relaxed">{selectedDecision.reasoning}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Manual Override Panel */}
        <Dialog open={isOverridePanelOpen} onOpenChange={setIsOverridePanelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Manual Override Control