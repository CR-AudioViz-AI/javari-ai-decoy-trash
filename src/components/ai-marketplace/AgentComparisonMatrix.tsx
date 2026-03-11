```tsx
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Download,
  Plus,
  X,
  Star,
  TrendingUp,
  DollarSign,
  Clock,
  Users,
  Zap,
  Shield,
  Brain,
  GripVertical,
  FileText,
  FileSpreadsheet,
  Share,
  Filter,
  BarChart3,
  Check,
  Minus
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  description: string
  logo: string
  category: string
  provider: string
  version: string
  features: AgentFeature[]
  pricing: PricingTier[]
  metrics: AgentMetrics
  reviews: ReviewSummary
  tags: string[]
  verified: boolean
  lastUpdated: Date
}

interface AgentFeature {
  id: string
  category: string
  name: string
  description: string
  supported: boolean | 'partial'
  value?: string
  icon?: string
}

interface PricingTier {
  name: string
  price: number
  period: 'month' | 'year' | 'usage'
  currency: string
  features: string[]
  popular?: boolean
}

interface AgentMetrics {
  performance: number
  reliability: number
  latency: number
  accuracy: number
  userSatisfaction: number
  monthlyActiveUsers: number
  apiCalls: number
  uptime: number
}

interface ReviewSummary {
  averageRating: number
  totalReviews: number
  sentiment: 'positive' | 'neutral' | 'negative'
  highlights: string[]
  recentReviews: Review[]
}

interface Review {
  id: string
  userId: string
  username: string
  avatar: string
  rating: number
  comment: string
  createdAt: Date
  helpful: number
}

interface AgentComparisonMatrixProps {
  initialAgents?: Agent[]
  availableAgents?: Agent[]
  maxComparisons?: number
  enableExport?: boolean
  enableSharing?: boolean
  className?: string
  onAgentAdd?: (agent: Agent) => void
  onAgentRemove?: (agentId: string) => void
  onExport?: (format: 'pdf' | 'excel', data: Agent[]) => void
  onShare?: (comparisonUrl: string) => void
}

const FEATURE_CATEGORIES = [
  'Core Capabilities',
  'Integration',
  'Security',
  'Performance',
  'Support',
  'Customization'
] as const

const ComparisonColumn: React.FC<{
  agent: Agent
  onRemove: () => void
  isDragging?: boolean
}> = ({ agent, onRemove, isDragging }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: agent.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging || isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-shrink-0 w-80 border-r border-border bg-background"
    >
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
              aria-label={`Drag ${agent.name}`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={agent.logo} alt={agent.name} />
              <AvatarFallback>
                {agent.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                {agent.verified && (
                  <Shield className="h-4 w-4 text-blue-500" aria-label="Verified" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{agent.provider}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 w-8 p-0 flex-shrink-0"
            aria-label={`Remove ${agent.name} from comparison`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{agent.reviews.averageRating}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              ({agent.reviews.totalReviews} reviews)
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agent.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {agent.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{agent.tags.length - 2}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <MetricsCard metrics={agent.metrics} />
        <PricingSection pricing={agent.pricing} />
        <ReviewSummaryCard reviews={agent.reviews} />
      </div>
    </div>
  )
}

const MetricsCard: React.FC<{ metrics: AgentMetrics }> = ({ metrics }) => {
  const metricsData = [
    { label: 'Performance', value: metrics.performance, icon: Zap },
    { label: 'Reliability', value: metrics.reliability, icon: Shield },
    { label: 'Accuracy', value: metrics.accuracy, icon: Brain },
    { label: 'User Satisfaction', value: metrics.userSatisfaction, icon: Users },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Performance Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {metricsData.map(({ label, value, icon: Icon }) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{value}%</span>
            </div>
            <Progress value={value} className="h-1" />
          </div>
        ))}
        
        <Separator />
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Latency</span>
            <p className="font-medium">{metrics.latency}ms</p>
          </div>
          <div>
            <span className="text-muted-foreground">Uptime</span>
            <p className="font-medium">{metrics.uptime}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const PricingSection: React.FC<{ pricing: PricingTier[] }> = ({ pricing }) => {
  const [selectedTier, setSelectedTier] = useState(0)

  if (!pricing.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Pricing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedTier.toString()} onValueChange={(v) => setSelectedTier(parseInt(v))}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pricing.map((tier, index) => (
              <SelectItem key={index} value={index.toString()}>
                {tier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="text-center">
          <div className="text-2xl font-bold">
            {pricing[selectedTier].currency}{pricing[selectedTier].price}
          </div>
          <div className="text-xs text-muted-foreground">
            per {pricing[selectedTier].period}
          </div>
        </div>
        
        <div className="space-y-1">
          {pricing[selectedTier].features.slice(0, 3).map((feature, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <Check className="h-3 w-3 text-green-500" />
              <span>{feature}</span>
            </div>
          ))}
          {pricing[selectedTier].features.length > 3 && (
            <div className="text-xs text-muted-foreground">
              +{pricing[selectedTier].features.length - 3} more features
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const ReviewSummaryCard: React.FC<{ reviews: ReviewSummary }> = ({ reviews }) => {
  const sentimentColor = {
    positive: 'text-green-600',
    neutral: 'text-yellow-600',
    negative: 'text-red-600',
  }[reviews.sentiment]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          User Reviews
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{reviews.averageRating}</span>
          </div>
          <span className={`text-xs font-medium capitalize ${sentimentColor}`}>
            {reviews.sentiment}
          </span>
        </div>
        
        <div className="space-y-1">
          {reviews.highlights.slice(0, 2).map((highlight, index) => (
            <p key={index} className="text-xs text-muted-foreground italic">
              "{highlight}"
            </p>
          ))}
        </div>
        
        <div className="text-xs text-muted-foreground">
          Based on {reviews.totalReviews} reviews
        </div>
      </CardContent>
    </Card>
  )
}

const FeatureRow: React.FC<{
  feature: AgentFeature
  agents: Agent[]
}> = ({ feature, agents }) => {
  const getFeatureValue = (agent: Agent, featureId: string) => {
    const agentFeature = agent.features.find(f => f.id === featureId)
    return agentFeature || { supported: false }
  }

  const renderFeatureSupport = (supported: boolean | 'partial', value?: string) => {
    if (value) {
      return <span className="text-xs text-muted-foreground">{value}</span>
    }
    
    switch (supported) {
      case true:
        return <Check className="h-4 w-4 text-green-500" />
      case 'partial':
        return <Minus className="h-4 w-4 text-yellow-500" />
      default:
        return <X className="h-4 w-4 text-red-500" />
    }
  }

  return (
    <div className="flex border-b border-border hover:bg-muted/50">
      <div className="w-64 p-3 border-r border-border bg-muted/30">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1">
                <div className="font-medium text-sm">{feature.name}</div>
                {feature.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {feature.description}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{feature.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {agents.map((agent) => {
        const agentFeature = getFeatureValue(agent, feature.id)
        return (
          <div key={agent.id} className="w-80 p-3 border-r border-border flex items-center justify-center">
            {renderFeatureSupport(agentFeature.supported, agentFeature.value)}
          </div>
        )
      })}
    </div>
  )
}

const AddAgentSelector: React.FC<{
  availableAgents: Agent[]
  selectedAgentIds: string[]
  onAgentSelect: (agent: Agent) => void
  maxReached: boolean
}> = ({ availableAgents, selectedAgentIds, onAgentSelect, maxReached }) => {
  const unselectedAgents = availableAgents.filter(
    agent => !selectedAgentIds.includes(agent.id)
  )

  if (maxReached) {
    return (
      <div className="flex-shrink-0 w-80 border-r border-border bg-muted/30 flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Maximum comparisons reached</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-80 border-r border-border bg-muted/30">
      <div className="sticky top-0 p-4 border-b border-border bg-muted/30">
        <h3 className="font-medium text-sm mb-3">Add Agent to Compare</h3>
        <Select onValueChange={(value) => {
          const agent = unselectedAgents.find(a => a.id === value)
          if (agent) onAgentSelect(agent)
        }}>
          <SelectTrigger>
            <SelectValue placeholder="Select an agent..." />
          </SelectTrigger>
          <SelectContent>
            {unselectedAgents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={agent.logo} alt={agent.name} />
                    <AvatarFallback className="text-xs">
                      {agent.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.provider}</div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="p-4 text-center text-muted-foreground">
        <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an agent above to add it to the comparison</p>
      </div>
    </div>
  )
}

const ExportButton: React.FC<{
  agents: Agent[]
  onExport: (format: 'pdf' | 'excel') => void
}> = ({ agents, onExport }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={agents.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onExport('pdf')}>
          <FileText className="h-4 w-4 mr-2" />
          PDF Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('excel')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel Spreadsheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AgentComparisonMatrix: React.FC<AgentComparisonMatrixProps> = ({
  initialAgents = [],
  availableAgents = [],
  maxComparisons = 4,
  enableExport = true,
  enableSharing = true,
  className,
  onAgentAdd,
  onAgentRemove,
  onExport,
  onShare,
}) => {
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>(initialAgents)
  const [draggedAgent, setDraggedAgent] = useState<Agent | null>(null)
  const [featureFilter, setFeatureFilter] = useState<string>('all')
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false)

  // Generate all unique features across selected agents
  const allFeatures = useMemo(() => {
    const featureMap = new Map<string, AgentFeature>()
    
    selectedAgents.forEach(agent => {
      agent.features.forEach(feature => {
        if (!featureMap.has(feature.id)) {
          featureMap.set(feature.id, feature)
        }
      })
    })
    
    return Array.from(featureMap.values()).sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category)
      }
      return a.name.localeCompare(b.name)
    })
  }, [selectedAgents])

  // Filter features based on category and differences
  const filteredFeatures = useMemo(() => {
    let features = allFeatures
    
    if (featureFilter !== 'all') {
      features = features.filter(f => f.category === featureFilter)
    }
    
    if (showOnlyDifferences && selectedAgents.length > 1) {
      features = features.filter(feature => {
        const values = selectedAgents.map(agent => {
          const agentFeature = agent.features.find(f => f.id === feature.id)
          return agentFeature?.supported || false
        })
        return new Set(values).size > 1
      })
    }
    
    return features
  }, [allFeatures, featureFilter, showOnlyDifferences, selectedAgents])

  // Group features by category for rendering
  const featuresByCategory = useMemo(() => {
    const grouped = new Map<string, AgentFeature[]>()
    
    filteredFeatures.forEach(feature => {
      const category = feature.category
      if (!grouped.has(category)) {
        grouped.set(category, [])
      }
      grouped.get(category)!.push(feature)
    })
    
    return Array.from(grouped.entries())
  }, [filteredFeatures])

  const handleDragStart = (event: DragStartEvent) => {
    const agent = selectedAgents.find(a => a.id === event.active.id)
    if (agent) {
      setDraggedAgent(agent)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      const oldIndex = selectedAgents.findIndex(agent => agent.id === active.id)
      const newIndex = selectedAgents.findIndex(agent => agent.id === over.id)
      
      if (oldIndex !== -1