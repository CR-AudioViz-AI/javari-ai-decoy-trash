```tsx
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Cell,
  ComposedChart 
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Target, 
  Brain, 
  Download, 
  Settings, 
  BarChart3, 
  PieChart as PieChartIcon,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Filter
} from 'lucide-react'

interface EarningsForecastData {
  date: string
  actual?: number
  predicted: number
  confidence: number
  lowerBound: number
  upperBound: number
}

interface SeasonalPattern {
  month: string
  multiplier: number
  confidence: number
}

interface MarketFactor {
  name: string
  impact: number
  trend: 'positive' | 'negative' | 'neutral'
  weight: number
}

interface MLModelMetrics {
  accuracy: number
  mse: number
  mae: number
  r2Score: number
  lastUpdated: string
  trainingDataPoints: number
}

interface ScenarioConfig {
  releaseSchedule: number
  marketingBudget: number
  collaborations: number
  platformGrowth: number
  genreTrend: number
}

interface ForecastMetrics {
  totalRevenue: number
  avgMonthlyGrowth: number
  peakMonth: string
  confidence: number
  risk: 'low' | 'medium' | 'high'
}

const CreatorEarningsForecastPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m' | '24m'>('12m')
  const [forecastPeriod, setForecastPeriod] = useState<'1m' | '3m' | '6m' | '12m'>('6m')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedScenario, setSelectedScenario] = useState<string>('base')
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig>({
    releaseSchedule: 50,
    marketingBudget: 50,
    collaborations: 50,
    platformGrowth: 50,
    genreTrend: 50
  })
  const [showConfidenceIntervals, setShowConfidenceIntervals] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Mock data - in real app, fetch from Supabase
  const forecastData: EarningsForecastData[] = [
    { date: '2024-01', actual: 2500, predicted: 2450, confidence: 85, lowerBound: 2200, upperBound: 2700 },
    { date: '2024-02', actual: 2800, predicted: 2750, confidence: 82, lowerBound: 2500, upperBound: 3000 },
    { date: '2024-03', actual: 3200, predicted: 3100, confidence: 88, lowerBound: 2900, upperBound: 3400 },
    { date: '2024-04', predicted: 3400, confidence: 75, lowerBound: 3100, upperBound: 3800 },
    { date: '2024-05', predicted: 3800, confidence: 72, lowerBound: 3400, upperBound: 4300 },
    { date: '2024-06', predicted: 4200, confidence: 68, lowerBound: 3700, upperBound: 4800 },
    { date: '2024-07', predicted: 3900, confidence: 65, lowerBound: 3400, upperBound: 4500 },
    { date: '2024-08', predicted: 4100, confidence: 63, lowerBound: 3600, upperBound: 4700 },
    { date: '2024-09', predicted: 4500, confidence: 60, lowerBound: 3900, upperBound: 5200 }
  ]

  const seasonalPatterns: SeasonalPattern[] = [
    { month: 'Jan', multiplier: 0.85, confidence: 92 },
    { month: 'Feb', multiplier: 0.90, confidence: 89 },
    { month: 'Mar', multiplier: 1.05, confidence: 94 },
    { month: 'Apr', multiplier: 1.10, confidence: 91 },
    { month: 'May', multiplier: 1.15, confidence: 88 },
    { month: 'Jun', multiplier: 1.20, confidence: 85 },
    { month: 'Jul', multiplier: 0.95, confidence: 87 },
    { month: 'Aug', multiplier: 1.00, confidence: 90 },
    { month: 'Sep', multiplier: 1.08, confidence: 93 },
    { month: 'Oct', multiplier: 1.12, confidence: 96 },
    { month: 'Nov', multiplier: 1.25, confidence: 94 },
    { month: 'Dec', multiplier: 1.35, confidence: 98 }
  ]

  const marketFactors: MarketFactor[] = [
    { name: 'Platform Algorithm', impact: 15, trend: 'positive', weight: 0.3 },
    { name: 'Genre Popularity', impact: 12, trend: 'positive', weight: 0.25 },
    { name: 'Market Competition', impact: -8, trend: 'negative', weight: 0.2 },
    { name: 'Economic Climate', impact: -5, trend: 'negative', weight: 0.15 },
    { name: 'Seasonal Trends', impact: 10, trend: 'positive', weight: 0.1 }
  ]

  const modelMetrics: MLModelMetrics = {
    accuracy: 87.3,
    mse: 145.2,
    mae: 89.6,
    r2Score: 0.843,
    lastUpdated: '2024-01-15T10:30:00Z',
    trainingDataPoints: 2847
  }

  const forecastMetrics: ForecastMetrics = useMemo(() => {
    const futureData = forecastData.filter(d => !d.actual)
    const totalRevenue = futureData.reduce((sum, d) => sum + d.predicted, 0)
    const avgConfidence = futureData.reduce((sum, d) => sum + d.confidence, 0) / futureData.length
    const peakMonth = futureData.reduce((max, d) => d.predicted > max.predicted ? d : max).date
    
    return {
      totalRevenue,
      avgMonthlyGrowth: 8.5,
      peakMonth,
      confidence: avgConfidence,
      risk: avgConfidence > 75 ? 'low' : avgConfidence > 60 ? 'medium' : 'high'
    }
  }, [forecastData])

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  const handleScenarioChange = (key: keyof ScenarioConfig, value: number[]) => {
    setScenarioConfig(prev => ({
      ...prev,
      [key]: value[0]
    }))
  }

  const exportForecast = () => {
    // Implementation for PDF export
    console.log('Exporting forecast report...')
  }

  const refreshModel = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading forecast models...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Earnings Forecast</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered revenue predictions based on historical data and market trends
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={refreshModel} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Model
          </Button>
          <Button onClick={exportForecast}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Model Health Alert */}
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          ML Model last updated {new Date(modelMetrics.lastUpdated).toLocaleDateString()} • 
          Accuracy: {modelMetrics.accuracy}% • 
          Training data: {modelMetrics.trainingDataPoints.toLocaleString()} points
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Forecast Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Historical Period</Label>
              <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                  <SelectItem value="12m">12 Months</SelectItem>
                  <SelectItem value="24m">24 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forecast Period</Label>
              <Select value={forecastPeriod} onValueChange={(value: any) => setForecastPeriod(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 Month</SelectItem>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                  <SelectItem value="12m">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={showConfidenceIntervals}
                onCheckedChange={setShowConfidenceIntervals}
              />
              <Label>Show Confidence Intervals</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label>Auto Refresh</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Projected Revenue</p>
                <p className="text-2xl font-bold">${forecastMetrics.totalRevenue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <div className="mt-2">
              <Badge variant={forecastMetrics.risk === 'low' ? 'default' : 'secondary'}>
                {forecastMetrics.confidence.toFixed(1)}% confidence
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Monthly Growth</p>
                <p className="text-2xl font-bold">{forecastMetrics.avgMonthlyGrowth}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-2">
              <Badge variant="default">Trending Up</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Peak Revenue Month</p>
                <p className="text-2xl font-bold">{forecastMetrics.peakMonth}</p>
              </div>
              <Target className="h-8 w-8 text-purple-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary">Seasonal Peak</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Model Accuracy</p>
                <p className="text-2xl font-bold">{modelMetrics.accuracy}%</p>
              </div>
              <Brain className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="mt-2">
              <Progress value={modelMetrics.accuracy} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="forecast" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
          <TabsTrigger value="factors">Market Factors</TabsTrigger>
          <TabsTrigger value="model">Model Details</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      `$${value?.toLocaleString()}`, 
                      name === 'actual' ? 'Actual' : name === 'predicted' ? 'Predicted' : name
                    ]}
                  />
                  {showConfidenceIntervals && (
                    <Area
                      type="monotone"
                      dataKey="upperBound"
                      stroke="none"
                      fill="rgba(59, 130, 246, 0.1)"
                      fillOpacity={0.3}
                    />
                  )}
                  {showConfidenceIntervals && (
                    <Area
                      type="monotone"
                      dataKey="lowerBound"
                      stroke="none"
                      fill="white"
                      fillOpacity={1}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={{ fill: '#22c55e', r: 6 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#3b82f6', r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Confidence Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={forecastData.filter(d => !d.actual)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="confidence" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Risk Level</span>
                  <Badge variant={forecastMetrics.risk === 'low' ? 'default' : 'destructive'}>
                    {forecastMetrics.risk.toUpperCase()}
                  </Badge>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Model Uncertainty</span>
                    <span className="text-sm font-medium">{(100 - modelMetrics.accuracy).toFixed(1)}%</span>
                  </div>
                  <Progress value={100 - modelMetrics.accuracy} className="h-2" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Market Volatility</span>
                    <span className="text-sm font-medium">Medium</span>
                  </div>
                  <Progress value={65} className="h-2" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Data Quality</span>
                    <span className="text-sm font-medium">High</span>
                  </div>
                  <Progress value={92} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Scenario Planning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Scenario Type</Label>
                  <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Base Case</SelectItem>
                      <SelectItem value="optimistic">Optimistic</SelectItem>
                      <SelectItem value="pessimistic">Pessimistic</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <Label>Release Schedule Impact</Label>
                      <span className="text-sm text-muted-foreground">{scenarioConfig.releaseSchedule}%</span>
                    </div>
                    <Slider
                      value={[scenarioConfig.releaseSchedule]}
                      onValueChange={(value) => handleScenarioChange('releaseSchedule', value)}
                      max={100}
                      step={5}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <Label>Marketing Budget</Label>
                      <span className="text-sm text-muted-foreground">{scenarioConfig.marketingBudget}%</span>
                    </div>
                    <Slider
                      value={[scenarioConfig.marketingBudget]}
                      onValueChange={(value) => handleScenarioChange('marketingBudget', value)}
                      max={100}
                      step={5}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <Label>Collaborations</Label>
                      <span className="text-sm text-muted-foreground">{scenarioConfig.collabor