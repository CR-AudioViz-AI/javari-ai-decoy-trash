```tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Settings,
  FileText,
  TrendingUp,
  Activity,
  Zap,
  Timer,
  Users,
  GitBranch,
  Monitor,
  AlertCircle,
  Edit,
  Trash2,
  Plus,
  GripVertical,
} from 'lucide-react'

interface Pipeline {
  id: string
  name: string
  description?: string
  status: 'idle' | 'running' | 'success' | 'failed' | 'cancelled' | 'pending'
  created_at: string
  updated_at: string
  stages: PipelineStage[]
  branch?: string
  commit_hash?: string
  triggered_by?: string
}

interface PipelineStage {
  id: string
  name: string
  description?: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'
  order_index: number
  duration?: number
  started_at?: string
  completed_at?: string
  logs: string[]
  config: Record<string, any>
  dependencies: string[]
}

interface PipelineMetrics {
  success_rate: number
  avg_duration: number
  total_deployments: number
  failed_deployments: number
  performance_trend: Array<{
    date: string
    duration: number
    success_rate: number
  }>
}

interface Intervention {
  id: string
  type: 'approve' | 'reject' | 'retry' | 'skip' | 'rollback'
  message?: string
  stage_id: string
}

interface PipelineVisualizationProps {
  pipelineId?: string
  className?: string
  onPipelineSelect?: (pipeline: Pipeline) => void
  allowEditing?: boolean
  showMetrics?: boolean
}

const StatusIcon = ({ status, className }: { status: string; className?: string }) => {
  const iconProps = { className: `h-4 w-4 ${className}` }
  
  switch (status) {
    case 'success':
      return <CheckCircle {...iconProps} className={`${iconProps.className} text-green-500`} />
    case 'failed':
      return <XCircle {...iconProps} className={`${iconProps.className} text-red-500`} />
    case 'running':
      return <RefreshCw {...iconProps} className={`${iconProps.className} text-blue-500 animate-spin`} />
    case 'pending':
      return <Clock {...iconProps} className={`${iconProps.className} text-yellow-500`} />
    case 'cancelled':
      return <Square {...iconProps} className={`${iconProps.className} text-gray-500`} />
    default:
      return <AlertCircle {...iconProps} className={`${iconProps.className} text-gray-400`} />
  }
}

const StatusBadge = ({ status }: { status: string }) => {
  const variants = {
    success: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
    idle: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <Badge
      variant="outline"
      className={variants[status as keyof typeof variants] || variants.idle}
    >
      <StatusIcon status={status} className="mr-1" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

const SortablePipelineStage = ({
  stage,
  isEditing,
  onStageUpdate,
  onStageDelete,
}: {
  stage: PipelineStage
  isEditing: boolean
  onStageUpdate: (stage: PipelineStage) => void
  onStageDelete: (stageId: string) => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getProgressValue = () => {
    switch (stage.status) {
      case 'success':
        return 100
      case 'running':
        return 50
      case 'failed':
        return 100
      default:
        return 0
    }
  }

  const getProgressColor = () => {
    switch (stage.status) {
      case 'success':
        return 'bg-green-500'
      case 'running':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-300'
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="mb-4 transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isEditing && (
                <div {...listeners} className="cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <StatusIcon status={stage.status} />
              <div>
                <CardTitle className="text-base">{stage.name}</CardTitle>
                {stage.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {stage.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={stage.status} />
              {isEditing && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStageUpdate(stage)}
                    aria-label={`Edit stage ${stage.name}`}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStageDelete(stage.id)}
                    aria-label={`Delete stage ${stage.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress
            value={getProgressValue()}
            className="mb-3"
            aria-label={`${stage.name} progress: ${getProgressValue()}%`}
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              {stage.started_at && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  Started: {new Date(stage.started_at).toLocaleTimeString()}
                </span>
              )}
              {stage.duration && (
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Duration: {Math.round(stage.duration / 1000)}s
                </span>
              )}
            </div>
            {stage.logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                aria-label={`View logs for ${stage.name}`}
              >
                <FileText className="h-3 w-3 mr-1" />
                Logs ({stage.logs.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const StageEditor = ({
  stage,
  isOpen,
  onClose,
  onSave,
}: {
  stage: PipelineStage | null
  isOpen: boolean
  onClose: () => void
  onSave: (stage: PipelineStage) => void
}) => {
  const [formData, setFormData] = useState<Partial<PipelineStage>>({})

  useEffect(() => {
    if (stage) {
      setFormData(stage)
    } else {
      setFormData({
        name: '',
        description: '',
        config: {},
        dependencies: [],
      })
    }
  }, [stage])

  const handleSave = () => {
    if (formData.name) {
      onSave({
        id: stage?.id || `stage-${Date.now()}`,
        order_index: stage?.order_index || 0,
        status: 'pending',
        logs: [],
        ...formData,
      } as PipelineStage)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {stage ? 'Edit Stage' : 'Add New Stage'}
          </DialogTitle>
          <DialogDescription>
            Configure the pipeline stage settings and dependencies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name">Name</Label>
            <Input
              id="stage-name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter stage name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea
              id="stage-description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter stage description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage-config">Configuration (JSON)</Label>
            <Textarea
              id="stage-config"
              value={JSON.stringify(formData.config || {}, null, 2)}
              onChange={(e) => {
                try {
                  const config = JSON.parse(e.target.value)
                  setFormData({ ...formData, config })
                } catch {
                  // Invalid JSON, keep previous value
                }
              }}
              placeholder='{"timeout": 300, "retries": 3}'
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.name}>
            {stage ? 'Update' : 'Add'} Stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const InterventionPanel = ({
  pipeline,
  onIntervention,
}: {
  pipeline: Pipeline | null
  onIntervention: (intervention: Intervention) => void
}) => {
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [interventionType, setInterventionType] = useState<Intervention['type']>('approve')
  const [message, setMessage] = useState('')

  const pendingStages = pipeline?.stages.filter(
    (stage) => stage.status === 'pending' || stage.status === 'failed'
  ) || []

  const handleIntervention = () => {
    if (selectedStage) {
      onIntervention({
        id: `intervention-${Date.now()}`,
        type: interventionType,
        message: message || undefined,
        stage_id: selectedStage,
      })
      setMessage('')
    }
  }

  if (!pipeline || pendingStages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Manual Intervention
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No stages require manual intervention at this time.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Manual Intervention Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="stage-select">Stage</Label>
          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger id="stage-select">
              <SelectValue placeholder="Select a stage" />
            </SelectTrigger>
            <SelectContent>
              {pendingStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name} ({stage.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="intervention-type">Action</Label>
          <Select
            value={interventionType}
            onValueChange={(value) => setInterventionType(value as Intervention['type'])}
          >
            <SelectTrigger id="intervention-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approve">Approve & Continue</SelectItem>
              <SelectItem value="retry">Retry Stage</SelectItem>
              <SelectItem value="skip">Skip Stage</SelectItem>
              <SelectItem value="reject">Reject & Stop</SelectItem>
              <SelectItem value="rollback">Rollback</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="intervention-message">Message (Optional)</Label>
          <Textarea
            id="intervention-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter a message for this intervention"
            rows={3}
          />
        </div>
        <Button
          onClick={handleIntervention}
          disabled={!selectedStage}
          className="w-full"
        >
          Execute Intervention
        </Button>
      </CardContent>
    </Card>
  )
}

const MetricsOverlay = ({ metrics }: { metrics: PipelineMetrics | null }) => {
  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pipeline Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Pipeline Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(metrics.success_rate)}%
            </div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {Math.round(metrics.avg_duration / 60)}m
            </div>
            <div className="text-sm text-muted-foreground">Avg Duration</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {metrics.total_deployments}
            </div>
            <div className="text-sm text-muted-foreground">Total Runs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {metrics.failed_deployments}
            </div>
            <div className="text-sm text-muted-foreground">Failed Runs</div>
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.performance_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis yAxisId="duration" orientation="left" />
              <YAxis yAxisId="success" orientation="right" />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [
                  name === 'duration' ? `${Math.round(Number(value) / 60)}m` : `${value}%`,
                  name === 'duration' ? 'Duration' : 'Success Rate'
                ]}
              />
              <Area
                yAxisId="duration"
                type="monotone"
                dataKey="duration"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
              <Line
                yAxisId="success"
                type="monotone"
                dataKey="success_rate"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

const LogViewer = ({ stage }: { stage: PipelineStage | null }) => {
  if (!stage || stage.logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Stage Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No logs available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Logs - {stage.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 w-full rounded border bg-slate-50 p-3">
          <div className="font-mono text-xs space-y-1">
            {stage.logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export default function PipelineVisualization({
  pipelineId,
  className = '',
  onPipelineSelect,
  allowEditing = false,
  showMetrics = true,
}: PipelineVisualizationProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null)
  const [selectedStageForLogs, setSelectedStageForLogs] = useState<PipelineStage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClientComponentClient()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {