```tsx
'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  ResponsiveContainer 
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Server, 
  Cpu, 
  HardDrive, 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  BarChart3, 
  Clock, 
  Target,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react'

interface PlatformMetrics {
  timestamp: string
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  network_io: number
  active_users: number
  requests_per_second: number
  response_time: number
  error_rate: number
}

interface ScalingEvent {
  id: string
  timestamp: string
  event_type: 'scale_up' | 'scale_down' | 'auto_scale' | 'manual_scale'
  resource_type: string
  from_capacity: number
  to_capacity: number
  reason: string
  status: 'completed' | 'in_progress' | 'failed'
  duration: number
}

interface AlertItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  timestamp: string
  status: 'active' | 'resolved'
  metric: string
  threshold: number
  current_value: number
}

interface CapacityForecast {
  timestamp: string
  predicted_cpu: number
  predicted_memory: number
  predicted_users: number
  confidence_interval: [number, number]
}

interface ScalingConfig {
  auto_scaling_enabled: boolean
  cpu_threshold: number
  memory_threshold: number
  scale_up_cooldown: number
  scale_down_cooldown: number
  min_instances: number
  max_instances: number
  target_utilization: number
}

export default function PlatformScalingDashboard() {
  const [metrics, setMetrics] = useState<PlatformMetrics[]>([])
  const [scalingEvents, setScalingEvents] = useState<ScalingEvent[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [forecast, setForecast] = useState<CapacityForecast[]>([])
  const [scalingConfig, setScalingConfig] = useState<ScalingConfig>({
    auto_scaling_enabled: true,
    cpu_threshold: 80,
    memory_threshold: 85,
    scale_up_cooldown: 300,
    scale_down_cooldown: 900,
    min_instances: 2,
    max_instances: 20,
    target_utilization: 70
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h')
  const [isScalingDialogOpen, setIsScalingDialogOpen] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, eventsRes, alertsRes, forecastRes] = await Promise.all([
          fetch(`/api/platform/metrics?range=${selectedTimeRange}`),
          fetch('/api/platform/scaling/events'),
          fetch('/api/platform/alerts'),
          fetch('/api/platform/forecasting')
        ])

        const [metricsData, eventsData, alertsData, forecastData] = await Promise.all([
          metricsRes.json(),
          eventsRes.json(),
          alertsRes.json(),
          forecastRes.json()
        ])

        setMetrics(metricsData)
        setScalingEvents(eventsData)
        setAlerts(alertsData)
        setForecast(forecastData)
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to fetch platform data:', error)
        setIsLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [selectedTimeRange])

  const handleScalingConfigUpdate = async (config: Partial<ScalingConfig>) => {
    try {
      const response = await fetch('/api/platform/scaling/control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scalingConfig, ...config })
      })

      if (response.ok) {
        setScalingConfig(prev => ({ ...prev, ...config }))
      }
    } catch (error) {
      console.error('Failed to update scaling config:', error)
    }
  }

  const triggerManualScale = async (action: 'scale_up' | 'scale_down', instances: number) => {
    try {
      await fetch('/api/platform/scaling/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instances })
      })
    } catch (error) {
      console.error('Failed to trigger manual scaling:', error)
    }
  }

  const currentMetrics = metrics[metrics.length - 1]
  const activeAlerts = alerts.filter(alert => alert.status === 'active')
  const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg">Loading platform dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Platform Scaling Control
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor and control platform scaling operations
          </p>
        </div>
        <div className="flex gap-3">
          <Tabs value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <TabsList>
              <TabsTrigger value="1h">1H</TabsTrigger>
              <TabsTrigger value="6h">6H</TabsTrigger>
              <TabsTrigger value="24h">24H</TabsTrigger>
              <TabsTrigger value="7d">7D</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={isScalingDialogOpen} onOpenChange={setIsScalingDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Settings className="w-4 h-4 mr-2" />
                Scaling Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Scaling Configuration</DialogTitle>
                <DialogDescription>
                  Configure auto-scaling parameters and thresholds
                </DialogDescription>
              </DialogHeader>
              <ScalingControls 
                config={scalingConfig} 
                onConfigUpdate={handleScalingConfigUpdate}
                onManualScale={triggerManualScale}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alert Banner */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Alerts ({criticalAlerts.length})</AlertTitle>
          <AlertDescription>
            {criticalAlerts[0].title} - {criticalAlerts[0].description}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="CPU Usage"
          value={currentMetrics?.cpu_usage || 0}
          unit="%"
          trend={getCurrentTrend(metrics, 'cpu_usage')}
          threshold={scalingConfig.cpu_threshold}
          icon={<Cpu className="w-5 h-5" />}
          color="blue"
        />
        <MetricCard
          title="Memory Usage"
          value={currentMetrics?.memory_usage || 0}
          unit="%"
          trend={getCurrentTrend(metrics, 'memory_usage')}
          threshold={scalingConfig.memory_threshold}
          icon={<HardDrive className="w-5 h-5" />}
          color="purple"
        />
        <MetricCard
          title="Active Users"
          value={currentMetrics?.active_users || 0}
          unit=""
          trend={getCurrentTrend(metrics, 'active_users')}
          icon={<Activity className="w-5 h-5" />}
          color="green"
        />
        <MetricCard
          title="Requests/sec"
          value={currentMetrics?.requests_per_second || 0}
          unit=""
          trend={getCurrentTrend(metrics, 'requests_per_second')}
          icon={<Zap className="w-5 h-5" />}
          color="orange"
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resource Utilization Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Resource Utilization
            </CardTitle>
            <CardDescription>Real-time system resource usage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResourceUtilizationChart data={metrics} />
          </CardContent>
        </Card>

        {/* Alerts Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Active Alerts
            </CardTitle>
            <CardDescription>Current system alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertsPanel alerts={activeAlerts} />
          </CardContent>
        </Card>
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scaling Events Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Scaling Events
            </CardTitle>
            <CardDescription>Platform scaling history</CardDescription>
          </CardHeader>
          <CardContent>
            <ScalingEventsTimeline events={scalingEvents.slice(-10)} />
          </CardContent>
        </Card>

        {/* Capacity Forecasting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Capacity Forecast
            </CardTitle>
            <CardDescription>Predicted resource requirements</CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastingChart data={forecast} />
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Performance Metrics</CardTitle>
          <CardDescription>Comprehensive system performance overview</CardDescription>
        </CardHeader>
        <CardContent>
          <PerformanceMetricsGrid metrics={currentMetrics} />
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ 
  title, 
  value, 
  unit, 
  trend, 
  threshold, 
  icon, 
  color 
}: {
  title: string
  value: number
  unit: string
  trend: number
  threshold?: number
  icon: React.ReactNode
  color: string
}) {
  const isAboveThreshold = threshold && value > threshold
  const trendIcon = trend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />
  const trendColor = trend > 0 ? 'text-red-500' : 'text-green-500'

  return (
    <Card className={`${isAboveThreshold ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </CardTitle>
        <div className={`text-${color}-500`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value.toFixed(unit === '%' ? 1 : 0)}{unit}
        </div>
        <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
          {trendIcon}
          <span>{Math.abs(trend).toFixed(1)}% from last period</span>
        </div>
        {threshold && (
          <Progress 
            value={Math.min(value, 100)} 
            className="mt-2"
            indicatorClassName={isAboveThreshold ? 'bg-red-500' : `bg-${color}-500`}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ResourceUtilizationChart({ data }: { data: PlatformMetrics[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="timestamp" 
            tickFormatter={(value) => new Date(value).toLocaleTimeString()}
          />
          <YAxis />
          <Tooltip 
            labelFormatter={(value) => new Date(value).toLocaleString()}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="cpu_usage" 
            stroke="#3B82F6" 
            name="CPU" 
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="memory_usage" 
            stroke="#8B5CF6" 
            name="Memory" 
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="disk_usage" 
            stroke="#EF4444" 
            name="Disk" 
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        <CheckCircle className="w-8 h-8 mr-2" />
        <span>No active alerts</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {alerts.map((alert) => (
        <div key={alert.id} className={`p-3 rounded-lg border ${
          alert.severity === 'critical' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' :
          alert.severity === 'warning' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950' :
          'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-sm">{alert.title}</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {alert.description}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {alert.severity}
                </Badge>
                <span className="text-xs text-gray-500">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ScalingEventsTimeline({ events }: { events: ScalingEvent[] }) {
  return (
    <div className="space-y-4 max-h-96 overflow-y-auto">
      {events.map((event, index) => (
        <div key={event.id} className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 ${
            event.status === 'completed' ? 'bg-green-500' :
            event.status === 'in_progress' ? 'bg-blue-500' :
            'bg-red-500'
          }`} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {event.event_type.replace('_', ' ').toUpperCase()}
              </span>
              <Badge variant={
                event.status === 'completed' ? 'default' :
                event.status === 'in_progress' ? 'secondary' :
                'destructive'
              }>
                {event.status}
              </Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {event.resource_type}: {event.from_capacity} → {event.to_capacity}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(event.timestamp).toLocaleTimeString()} • {event.duration}s
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ForecastingChart({ data }: { data: CapacityForecast[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis />
          <Tooltip 
            labelFormatter={(value) => new Date(value).toLocaleString()}
          />
          <Area 
            type="monotone" 
            dataKey="predicted_cpu" 
            stroke="#3B82F6" 
            fill="#3B82F6" 
            fillOpacity={0.3}
            name="Predicted CPU %"
          />
          <Area 
            type="monotone" 
            dataKey="predicted_memory" 
            stroke="#8B5CF6" 
            fill="#8B5CF6" 
            fillOpacity={0.3}
            name="Predicted Memory %"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ScalingControls({ 
  config, 
  onConfigUpdate, 
  onManualScale 
}: {
  config: ScalingConfig
  onConfigUpdate: (config: Partial<ScalingConfig>) => void
  onManualScale: (action: 'scale_up' | 'scale_down', instances: number) => void
}) {
  const [manualInstances, setManualInstances] = useState(1)

  return (
    <div className="space-y-6">
      {/* Auto-scaling toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Auto-scaling</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enable automatic scaling based on thresholds
          </p>
        </div>
        <Switch 
          checked={config.auto_scaling_enabled}
          onCheckedChange={(checked) => onConfigUpdate({ auto_scaling_enabled: checked })}
        />
      </div>

      {/* Thresholds */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">CPU Threshold: {config.cpu_threshold}%</label>
          <Slider
            value={[config.cpu_threshold]}
            onValueChange={(value) => onConfigUpdate({ cpu_threshold: value[0] })}
            max={100}
            min={10}
            step={5}
            className="mt-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Memory Threshold: {config.memory_threshold}%</label>
          <Slider
            value={[config.memory_threshold]}
            onValueChange={(value) => onConfigUpdate({ memory_threshold: value[0] })}
            max={100}
            min={10}
            step={5}
            className="mt-2"
          />
        </div>
      </div>

      {/* Instance limits */}
      <div className="grid grid-cols-2 gap-4">
        <div>