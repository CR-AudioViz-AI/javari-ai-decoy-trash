```tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Users, 
  Globe, 
  Clock, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Lock,
  Zap,
  Target,
  FileText,
  Bell,
  Settings,
  MapPin,
  Filter
} from 'lucide-react';

interface SecurityEvent {
  id: string;
  type: 'threat' | 'vulnerability' | 'incident' | 'compliance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  assignee?: string;
  tags: string[];
}

interface ThreatIndicator {
  id: string;
  type: 'malware' | 'phishing' | 'ddos' | 'insider_threat' | 'data_breach';
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  location: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  lastDetected: string;
}

interface SecurityMetric {
  id: string;
  name: string;
  value: number;
  change: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  target?: number;
}

interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'assigned' | 'investigating' | 'resolved';
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  priority: number;
  category: string;
  escalationLevel: number;
}

interface UserRole {
  id: string;
  name: string;
  permissions: string[];
  canViewSensitive: boolean;
  canManageIncidents: boolean;
  canModifySettings: boolean;
}

const SecurityOperationsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [threatIndicators, setThreatIndicators] = useState<ThreatIndicator[]>([]);
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetric[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [userRole, setUserRole] = useState<UserRole>({
    id: '1',
    name: 'Security Analyst',
    permissions: ['view_threats', 'manage_incidents', 'view_reports'],
    canViewSensitive: true,
    canManageIncidents: true,
    canModifySettings: false
  });
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  // Mock data initialization
  useEffect(() => {
    const mockSecurityEvents: SecurityEvent[] = [
      {
        id: '1',
        type: 'threat',
        severity: 'critical',
        title: 'Suspicious Login Attempt',
        description: 'Multiple failed login attempts from unknown IP address',
        source: '192.168.1.100',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        status: 'investigating',
        assignee: 'john.doe',
        tags: ['authentication', 'brute-force']
      },
      {
        id: '2',
        type: 'vulnerability',
        severity: 'high',
        title: 'Unpatched System Detected',
        description: 'Critical security patch missing on production server',
        source: 'Vulnerability Scanner',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        status: 'open',
        tags: ['patch-management', 'server']
      },
      {
        id: '3',
        type: 'incident',
        severity: 'medium',
        title: 'Data Access Anomaly',
        description: 'Unusual data access pattern detected',
        source: 'DLP System',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        status: 'resolved',
        assignee: 'jane.smith',
        tags: ['data-protection', 'anomaly']
      }
    ];

    const mockThreatIndicators: ThreatIndicator[] = [
      {
        id: '1',
        type: 'malware',
        severity: 'critical',
        confidence: 95,
        location: 'North America',
        count: 42,
        trend: 'up',
        lastDetected: new Date(Date.now() - 120000).toISOString()
      },
      {
        id: '2',
        type: 'phishing',
        severity: 'high',
        confidence: 87,
        location: 'Europe',
        count: 28,
        trend: 'down',
        lastDetected: new Date(Date.now() - 600000).toISOString()
      },
      {
        id: '3',
        type: 'ddos',
        severity: 'medium',
        confidence: 73,
        location: 'Asia',
        count: 15,
        trend: 'stable',
        lastDetected: new Date(Date.now() - 1200000).toISOString()
      }
    ];

    const mockSecurityMetrics: SecurityMetric[] = [
      {
        id: '1',
        name: 'Threat Detection Rate',
        value: 99.2,
        change: 2.1,
        unit: '%',
        status: 'good',
        target: 95
      },
      {
        id: '2',
        name: 'Mean Time to Response',
        value: 14.5,
        change: -3.2,
        unit: 'min',
        status: 'good',
        target: 15
      },
      {
        id: '3',
        name: 'False Positive Rate',
        value: 8.7,
        change: 1.5,
        unit: '%',
        status: 'warning',
        target: 5
      },
      {
        id: '4',
        name: 'System Uptime',
        value: 99.97,
        change: 0.02,
        unit: '%',
        status: 'good',
        target: 99.9
      }
    ];

    const mockIncidents: Incident[] = [
      {
        id: '1',
        title: 'Data Breach Investigation',
        severity: 'critical',
        status: 'investigating',
        assignee: 'incident.response.team',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
        priority: 1,
        category: 'Data Security',
        escalationLevel: 2
      },
      {
        id: '2',
        title: 'Malware Containment',
        severity: 'high',
        status: 'assigned',
        assignee: 'malware.team',
        createdAt: new Date(Date.now() - 14400000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        priority: 2,
        category: 'Malware',
        escalationLevel: 1
      }
    ];

    setSecurityEvents(mockSecurityEvents);
    setThreatIndicators(mockThreatIndicators);
    setSecurityMetrics(mockSecurityMetrics);
    setIncidents(mockIncidents);
  }, []);

  const filteredEvents = useMemo(() => {
    if (selectedSeverity === 'all') return securityEvents;
    return securityEvents.filter(event => event.severity === selectedSeverity);
  }, [securityEvents, selectedSeverity]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500 text-white';
      case 'investigating': return 'bg-blue-500 text-white';
      case 'open': return 'bg-red-500 text-white';
      case 'false_positive': return 'bg-gray-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const ThreatIndicatorPanel: React.FC = () => (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-red-500" />
          Threat Indicators
        </CardTitle>
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          View All
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {threatIndicators.map((indicator) => (
            <div key={indicator.id} className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Badge className={getSeverityColor(indicator.severity)}>
                  {indicator.type.toUpperCase()}
                </Badge>
                <div className="flex items-center gap-1">
                  {indicator.trend === 'up' && <TrendingUp className="h-4 w-4 text-red-500" />}
                  {indicator.trend === 'down' && <TrendingDown className="h-4 w-4 text-green-500" />}
                  {indicator.trend === 'stable' && <Activity className="h-4 w-4 text-blue-500" />}
                  <span className="text-sm font-medium">{indicator.count}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-medium">{indicator.confidence}%</span>
                </div>
                <Progress value={indicator.confidence} className="h-2" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{indicator.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const SecurityMetricsGrid: React.FC = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {securityMetrics.map((metric) => (
        <Card key={metric.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {metric.status === 'good' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {metric.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                {metric.status === 'critical' && <XCircle className="h-4 w-4 text-red-500" />}
              </div>
              <span className={`text-xs font-medium ${metric.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">{metric.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{metric.value}</span>
                <span className="text-sm text-muted-foreground">{metric.unit}</span>
              </div>
              {metric.target && (
                <div className="text-xs text-muted-foreground">
                  Target: {metric.target}{metric.unit}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const SecurityEventTimeline: React.FC = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Security Events
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex gap-4 p-4 border rounded-lg">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${getSeverityColor(event.severity)}`} />
                  <div className="w-px h-full bg-border mt-2" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{event.title}</h4>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                    </div>
                    <Badge className={getStatusColor(event.status)}>
                      {event.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{event.source}</span>
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                    {event.assignee && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3" />
                        <span>{event.assignee}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {event.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  const IncidentResponseWorkflow: React.FC = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-500" />
          Active Incidents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {incidents.map((incident) => (
            <div key={incident.id} className="p-4 border rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-medium">{incident.title}</h4>
                  <p className="text-sm text-muted-foreground">{incident.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getSeverityColor(incident.severity)}>
                    {incident.severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">
                    Priority {incident.priority}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium capitalize">{incident.status.replace('_', ' ')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Assignee:</span>
                  <p className="font-medium">{incident.assignee || 'Unassigned'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">{new Date(incident.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Escalation:</span>
                  <p className="font-medium">Level {incident.escalationLevel}</p>
                </div>
              </div>
              {userRole.canManageIncidents && (
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm">
                    Assign
                  </Button>
                  <Button variant="outline" size="sm">
                    Escalate
                  </Button>
                  <Button variant="outline" size="sm">
                    Update
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const ComplianceStatusCards: React.FC = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        { name: 'SOC 2', status: 'compliant', score: 98 },
        { name: 'ISO 27001', status: 'compliant', score: 95 },
        { name: 'GDPR', status: 'warning', score: 87 }
      ].map((compliance) => (
        <Card key={compliance.name}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{compliance.name}</h3>
              {compliance.status === 'compliant' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Compliance Score</span>
                <span className="font-medium">{compliance.score}%</span>
              </div>
              <Progress value={compliance.score} className="h-2" />
              <Badge 
                variant={compliance.status === 'compliant' ? 'default' : 'secondary'}
                className={compliance.status === 'compliant' ? 'bg-green-500' : 'bg-yellow-500'}
              >
                {compliance.status.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Operations Center</h1>
          <p className="text-muted-foreground">
            Real-time security monitoring and incident response
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            System Operational
          </Badge>
          <Button variant="outline" size="sm">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {filteredEvents.some(event => event.severity === 'critical') && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Critical Security Alert</AlertTitle>
          <AlertDescription className="text-red-700">
            {filteredEvents.filter(event => event.severity === 'critical').length} critical security events require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Dashboard */}
      <Tabs value={activeTab} onValueChange={setActiveTab}