```tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  Cell
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Bell,
  BellRing,
  Calendar,
  ChevronDown,
  Clock,
  Cloud,
  Cpu,
  Database,
  Download,
  Filter,
  HardDrive,
  Mail,
  Memory,
  Monitor,
  Network,
  Phone,
  RefreshCw,
  Server,
  Settings,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  Zap
} from 'lucide-react'

interface MetricValue {
  timestamp: string
  value: number
  unit: string
  status: 'normal' | 'warning' | 'critical'
}

interface SystemMetric {
  id: string
  name: string
  category: 'cpu' | 'memory' | 'disk' | 'network' | 'database' | 'api'
  currentValue: number
  unit: string
  threshold: {
    warning: number
    critical: number
  }
  trend: 'up' | 'down' | 'stable'
  history: MetricValue[]
  status: 'normal' | 'warning' | 'critical'
}

interface Anomaly {
  id: string
  metric: string
  type: 'spike' | 'drop' | 'pattern_break' | 'threshold_breach'
  severity: 'low' | 'medium' | 'high' | 'critical'
  detectedAt: string
  description: string
  expectedRange: [number, number]
  actualValue: number
  confidence: number
}

interface Alert {
  id: string
  name: string
  metric: string
  condition: 'greater_than' | 'less_than' | 'equals' | 'change_rate'
  threshold: number
  enabled: boolean
  channels: ('email' | 'sms' | 'webhook')[]
  cooldown: number
  lastTriggered?: string
}

interface AlertHistory {
  id: string
  alertId: string
  alertName: string
  triggeredAt: string
  resolvedAt?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  metric: string
  value: number
  threshold: number
  status: 'active' | 'resolved' | 'acknowledged'
}

interface PerformanceMonitoringProps {
  className?: string
}

export default function PerformanceMonitoringPage({ className }: PerformanceMonitoringProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [showAnomalies, setShowAnomalies] = useState(true)
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  // Mock data - replace with real API calls
  const [metrics] = useState<SystemMetric[]>([
    {
      id: 'cpu-usage',
      name: 'CPU Usage',
      category: 'cpu',
      currentValue: 68.5,
      unit: '%',
      threshold: { warning: 70, critical: 85 },
      trend: 'up',
      status: 'warning',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 45 + Math.random() * 40,
        unit: '%',
        status: Math.random() > 0.8 ? 'warning' : 'normal'
      }))
    },
    {
      id: 'memory-usage',
      name: 'Memory Usage',
      category: 'memory',
      currentValue: 82.3,
      unit: '%',
      threshold: { warning: 80, critical: 90 },
      trend: 'stable',
      status: 'warning',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 70 + Math.random() * 25,
        unit: '%',
        status: Math.random() > 0.7 ? 'warning' : 'normal'
      }))
    },
    {
      id: 'disk-usage',
      name: 'Disk Usage',
      category: 'disk',
      currentValue: 45.7,
      unit: '%',
      threshold: { warning: 80, critical: 95 },
      trend: 'up',
      status: 'normal',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 35 + Math.random() * 20,
        unit: '%',
        status: 'normal'
      }))
    },
    {
      id: 'network-throughput',
      name: 'Network Throughput',
      category: 'network',
      currentValue: 156.8,
      unit: 'MB/s',
      threshold: { warning: 200, critical: 250 },
      trend: 'stable',
      status: 'normal',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 100 + Math.random() * 100,
        unit: 'MB/s',
        status: 'normal'
      }))
    },
    {
      id: 'db-connections',
      name: 'Database Connections',
      category: 'database',
      currentValue: 245,
      unit: 'connections',
      threshold: { warning: 300, critical: 400 },
      trend: 'down',
      status: 'normal',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 200 + Math.random() * 100,
        unit: 'connections',
        status: 'normal'
      }))
    },
    {
      id: 'api-response-time',
      name: 'API Response Time',
      category: 'api',
      currentValue: 125.3,
      unit: 'ms',
      threshold: { warning: 200, critical: 500 },
      trend: 'up',
      status: 'normal',
      history: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 80 + Math.random() * 100,
        unit: 'ms',
        status: Math.random() > 0.9 ? 'warning' : 'normal'
      }))
    }
  ])

  const [anomalies] = useState<Anomaly[]>([
    {
      id: 'anomaly-1',
      metric: 'CPU Usage',
      type: 'spike',
      severity: 'high',
      detectedAt: new Date(Date.now() - 300000).toISOString(),
      description: 'Unusual spike in CPU usage detected',
      expectedRange: [45, 65],
      actualValue: 85.2,
      confidence: 0.92
    },
    {
      id: 'anomaly-2',
      metric: 'Memory Usage',
      type: 'pattern_break',
      severity: 'medium',
      detectedAt: new Date(Date.now() - 900000).toISOString(),
      description: 'Memory usage pattern deviation from baseline',
      expectedRange: [70, 80],
      actualValue: 88.5,
      confidence: 0.78
    }
  ])

  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 'alert-1',
      name: 'High CPU Usage',
      metric: 'cpu-usage',
      condition: 'greater_than',
      threshold: 80,
      enabled: true,
      channels: ['email', 'sms'],
      cooldown: 300,
      lastTriggered: new Date(Date.now() - 1200000).toISOString()
    },
    {
      id: 'alert-2',
      name: 'Memory Critical',
      metric: 'memory-usage',
      condition: 'greater_than',
      threshold: 90,
      enabled: true,
      channels: ['email', 'webhook'],
      cooldown: 600
    },
    {
      id: 'alert-3',
      name: 'Disk Space Low',
      metric: 'disk-usage',
      condition: 'greater_than',
      threshold: 85,
      enabled: false,
      channels: ['email'],
      cooldown: 1800
    }
  ])

  const [alertHistory] = useState<AlertHistory[]>([
    {
      id: 'history-1',
      alertId: 'alert-1',
      alertName: 'High CPU Usage',
      triggeredAt: new Date(Date.now() - 1200000).toISOString(),
      resolvedAt: new Date(Date.now() - 600000).toISOString(),
      severity: 'high',
      metric: 'CPU Usage',
      value: 87.3,
      threshold: 80,
      status: 'resolved'
    },
    {
      id: 'history-2',
      alertId: 'alert-2',
      alertName: 'Memory Critical',
      triggeredAt: new Date(Date.now() - 3600000).toISOString(),
      resolvedAt: new Date(Date.now() - 3000000).toISOString(),
      severity: 'critical',
      metric: 'Memory Usage',
      value: 93.1,
      threshold: 90,
      status: 'resolved'
    },
    {
      id: 'history-3',
      alertId: 'alert-1',
      alertName: 'High CPU Usage',
      triggeredAt: new Date(Date.now() - 300000).toISOString(),
      severity: 'high',
      metric: 'CPU Usage',
      value: 89.7,
      threshold: 80,
      status: 'active'
    }
  ])

  const getMetricIcon = (category: string) => {
    const icons = {
      cpu: Cpu,
      memory: Memory,
      disk: HardDrive,
      network: Wifi,
      database: Database,
      api: Server
    }
    const Icon = icons[category as keyof typeof icons] || Monitor
    return Icon
  }

  const getStatusColor = (status: string) => {
    const colors = {
      normal: 'text-green-600',
      warning: 'text-yellow-600',
      critical: 'text-red-600'
    }
    return colors[status as keyof typeof colors] || 'text-gray-600'
  }

  const getStatusBadgeVariant = (status: string) => {
    const variants = {
      normal: 'default',
      warning: 'secondary',
      critical: 'destructive'
    }
    return variants[status as keyof typeof variants] || 'default'
  }

  const getTrendIcon = (trend: string) => {
    const icons = {
      up: TrendingUp,
      down: TrendingDown,
      stable: Activity
    }
    const Icon = icons[trend as keyof typeof icons] || Activity
    return Icon
  }

  const filteredMetrics = selectedCategory === 'all' 
    ? metrics 
    : metrics.filter(metric => metric.category === selectedCategory)

  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' || a.severity === 'high')
  const activeAlerts = alertHistory.filter(a => a.status === 'active')

  const capacityData = [
    { name: 'CPU', current: 68.5, capacity: 100, projected: 75.2 },
    { name: 'Memory', current: 82.3, capacity: 100, projected: 89.1 },
    { name: 'Disk', current: 45.7, capacity: 100, projected: 52.3 },
    { name: 'Network', current: 62.7, capacity: 100, projected: 71.4 }
  ]

  const pieChartData = [
    { name: 'Normal', value: 65, fill: '#10b981' },
    { name: 'Warning', value: 25, fill: '#f59e0b' },
    { name: 'Critical', value: 10, fill: '#ef4444' }
  ]

  const handleExport = useCallback((format: 'csv' | 'json' | 'pdf') => {
    // Implementation for exporting data
    console.log(`Exporting data in ${format} format`)
  }, [])

  const handleSaveAlert = useCallback((alert: Alert) => {
    if (selectedAlert) {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a))
    } else {
      setAlerts(prev => [...prev, { ...alert, id: `alert-${Date.now()}` }])
    }
    setAlertModalOpen(false)
    setSelectedAlert(null)
  }, [selectedAlert])

  const handleDeleteAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      // Refresh data
      console.log('Refreshing performance data...')
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval])

  return (
    <div className={`space-y-6 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time system performance metrics and anomaly detection
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-refresh">Auto Refresh</Label>
            <Switch 
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
          </div>
          <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">1m</SelectItem>
              <SelectItem value="300">5m</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">Active Metrics</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{metrics.length}</div>
              <p className="text-xs text-muted-foreground">Monitoring endpoints</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">Anomalies</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-orange-600">{criticalAnomalies.length}</div>
              <p className="text-xs text-muted-foreground">Detected anomalies</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium">Active Alerts</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-red-600">{activeAlerts.length}</div>
              <p className="text-xs text-muted-foreground">Triggered alerts</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">System Health</span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-green-600">98.5%</div>
              <p className="text-xs text-muted-foreground">Overall health score</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="time-range">Time Range</Label>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger id="time-range" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="6h">Last 6 Hours</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger id="category" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="cpu">CPU</SelectItem>
                  <SelectItem value="memory">Memory</SelectItem>
                  <SelectItem value="disk">Disk</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="show-anomalies">Show Anomalies</Label>
              <Switch 
                id="show-anomalies"
                checked={showAnomalies}
                onCheckedChange={setShowAnomalies}
              />
            </div>

            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => handleExport('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport('json')}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* System Health Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>System Health Overview</CardTitle>
                <CardDescription>Overall system performance metrics</CardDescription>