```tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  ReactFlow, 
  Node, 
  Edge, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes,
  MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import { useSupabaseRealtimeSubscription } from '@/hooks/useSupabaseRealtime'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useWorkflowStore } from '@/stores/workflowStore'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  Progress,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { 
  Play, 
  Pause, 
  Square, 
  Settings, 
  Users, 
  Activity, 
  MessageSquare,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Zap,
  MoreVertical
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  role: string
  status: 'online' | 'offline' | 'busy' | 'idle'
  avatar?: string
  skills: string[]
  currentTask?: string
  performance: number
  position: { x: number; y: number }
}

interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigneeId?: string
  progress: number
  estimatedTime: number
  actualTime: number
  dependencies: string[]
  createdAt: string
  dueDate?: string
}

interface Communication {
  id: string
  senderId: string
  receiverId: string
  message: string
  type: 'task_assignment' | 'status_update' | 'collaboration' | 'alert'
  timestamp: string
  metadata?: Record<string, any>
}

interface WorkflowState {
  id: string
  name: string
  agents: Agent[]
  tasks: Task[]
  communications: Communication[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface TeamWorkflowVisualizationProps {
  workflowId: string
  className?: string
  onWorkflowChange?: (workflow: WorkflowState) => void
  onAgentSelect?: (agent: Agent) => void
  onTaskSelect?: (task: Task) => void
  readonly?: boolean
  showControls?: boolean
  showCommunications?: boolean
  autoLayout?: boolean
}

// Custom Node Components
const AgentNode: React.FC<{ data: Agent & { onSelect: (agent: Agent) => void } }> = ({ data }) => {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    busy: 'bg-red-500',
    idle: 'bg-yellow-500'
  }

  const statusLabels = {
    online: 'Online',
    offline: 'Offline', 
    busy: 'Busy',
    idle: 'Idle'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
            className="relative bg-white border-2 border-gray-200 rounded-lg p-4 shadow-md cursor-pointer min-w-[180px]"
            onClick={() => data.onSelect(data)}
          >
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {data.name.charAt(0)}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${statusColors[data.status]} rounded-full border-2 border-white`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 truncate">{data.name}</h4>
                <p className="text-xs text-gray-500 truncate">{data.role}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Performance</span>
                <span className="font-medium">{data.performance}%</span>
              </div>
              <Progress value={data.performance} className="h-1" />
            </div>

            {data.currentTask && (
              <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                <div className="flex items-center space-x-1">
                  <Target className="w-3 h-3 text-blue-500" />
                  <span className="text-blue-700 truncate">{data.currentTask}</span>
                </div>
              </div>
            )}

            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Assign Task</DropdownMenuItem>
                  <DropdownMenuItem>Send Message</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{data.name}</p>
            <p className="text-sm">Status: {statusLabels[data.status]}</p>
            <p className="text-sm">Skills: {data.skills.join(', ')}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const TaskNode: React.FC<{ data: Task & { onSelect: (task: Task) => void } }> = ({ data }) => {
  const statusColors = {
    pending: 'border-gray-300 bg-gray-50',
    in_progress: 'border-blue-300 bg-blue-50',
    completed: 'border-green-300 bg-green-50',
    blocked: 'border-red-300 bg-red-50'
  }

  const priorityColors = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700'
  }

  const statusIcons = {
    pending: Clock,
    in_progress: Activity,
    completed: CheckCircle,
    blocked: AlertCircle
  }

  const StatusIcon = statusIcons[data.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border-2 rounded-lg p-3 shadow-sm cursor-pointer min-w-[200px] ${statusColors[data.status]}`}
      onClick={() => data.onSelect(data)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <StatusIcon className="w-4 h-4" />
          <h4 className="text-sm font-medium truncate flex-1">{data.title}</h4>
        </div>
        <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${priorityColors[data.priority]}`}>
          {data.priority}
        </Badge>
      </div>

      <p className="text-xs text-gray-600 mb-3 line-clamp-2">{data.description}</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Progress</span>
          <span className="font-medium">{data.progress}%</span>
        </div>
        <Progress value={data.progress} className="h-1" />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>Est: {data.estimatedTime}h</span>
        {data.dueDate && (
          <span>Due: {new Date(data.dueDate).toLocaleDateString()}</span>
        )}
      </div>
    </motion.div>
  )
}

// Custom Edge Component
const CommunicationEdge: React.FC<{ data: { communication: Communication } }> = ({ data }) => {
  return (
    <motion.g
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.5 }}
    >
      <defs>
        <marker
          id="communication-arrow"
          markerWidth="10"
          markerHeight="7" 
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
        </marker>
      </defs>
    </motion.g>
  )
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  task: TaskNode
}

const edgeTypes: EdgeTypes = {
  communication: CommunicationEdge
}

export const TeamWorkflowVisualization: React.FC<TeamWorkflowVisualizationProps> = ({
  workflowId,
  className = '',
  onWorkflowChange,
  onAgentSelect,
  onTaskSelect,
  readonly = false,
  showControls = true,
  showCommunications = true,
  autoLayout = false
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showTaskPanel, setShowTaskPanel] = useState(false)
  const [communicationHistory, setCommunicationHistory] = useState<Communication[]>([])

  // Store integration
  const {
    workflow,
    agents,
    tasks,
    communications,
    updateWorkflow,
    assignTask,
    updateTaskStatus
  } = useWorkflowStore()

  // Realtime subscriptions
  const { data: workflowData } = useSupabaseRealtimeSubscription(
    'workflow_states',
    `id=eq.${workflowId}`
  )

  const { data: communicationsData } = useSupabaseRealtimeSubscription(
    'agent_communications',
    `workflow_id=eq.${workflowId}`
  )

  // WebSocket for real-time updates
  const { isConnected, sendMessage } = useWebSocket(`/api/workflows/${workflowId}/realtime`)

  // Update nodes and edges when data changes
  useEffect(() => {
    if (!workflow) return

    const agentNodes: Node[] = workflow.agents.map((agent) => ({
      id: `agent-${agent.id}`,
      type: 'agent',
      position: agent.position,
      data: {
        ...agent,
        onSelect: handleAgentSelect
      },
      draggable: !readonly
    }))

    const taskNodes: Node[] = workflow.tasks.map((task, index) => ({
      id: `task-${task.id}`,
      type: 'task', 
      position: { 
        x: 300 + (index % 3) * 250, 
        y: 100 + Math.floor(index / 3) * 200 
      },
      data: {
        ...task,
        onSelect: handleTaskSelect
      },
      draggable: !readonly
    }))

    setNodes([...agentNodes, ...taskNodes])

    // Create edges for task assignments and communications
    const taskEdges: Edge[] = workflow.tasks
      .filter(task => task.assigneeId)
      .map(task => ({
        id: `assignment-${task.id}`,
        source: `agent-${task.assigneeId}`,
        target: `task-${task.id}`,
        type: 'smoothstep',
        animated: task.status === 'in_progress',
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.Arrow, color: '#3b82f6' }
      }))

    const communicationEdges: Edge[] = showCommunications
      ? workflow.communications.slice(-10).map(comm => ({
          id: `comm-${comm.id}`,
          source: `agent-${comm.senderId}`,
          target: `agent-${comm.receiverId}`,
          type: 'communication',
          animated: true,
          style: { 
            stroke: '#10b981', 
            strokeWidth: 1,
            strokeDasharray: '5,5'
          },
          data: { communication: comm }
        }))
      : []

    setEdges([...taskEdges, ...communicationEdges])
  }, [workflow, readonly, showCommunications])

  // Handle realtime updates
  useEffect(() => {
    if (workflowData) {
      updateWorkflow(workflowData)
      onWorkflowChange?.(workflowData)
    }
  }, [workflowData, updateWorkflow, onWorkflowChange])

  useEffect(() => {
    if (communicationsData) {
      setCommunicationHistory(prev => [...prev, ...communicationsData].slice(-50))
    }
  }, [communicationsData])

  // Event handlers
  const handleAgentSelect = useCallback((agent: Agent) => {
    setSelectedAgent(agent)
    onAgentSelect?.(agent)
  }, [onAgentSelect])

  const handleTaskSelect = useCallback((task: Task) => {
    setSelectedTask(task)
    setShowTaskPanel(true)
    onTaskSelect?.(task)
  }, [onTaskSelect])

  const onConnect = useCallback(
    (params: Connection) => {
      if (readonly) return
      setEdges((eds) => addEdge(params, eds))
    },
    [readonly, setEdges]
  )

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
    sendMessage({ type: isPlaying ? 'pause' : 'play', workflowId })
  }

  const handleStop = () => {
    setIsPlaying(false)
    sendMessage({ type: 'stop', workflowId })
  }

  const handleTaskAssignment = async (taskId: string, agentId: string) => {
    try {
      await assignTask(taskId, agentId)
      sendMessage({ 
        type: 'task_assigned', 
        workflowId, 
        taskId, 
        agentId 
      })
    } catch (error) {
      console.error('Failed to assign task:', error)
    }
  }

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!workflow) return null

    const totalTasks = workflow.tasks.length
    const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length
    const activeTasks = workflow.tasks.filter(t => t.status === 'in_progress').length
    const onlineAgents = workflow.agents.filter(a => a.status === 'online').length
    const avgPerformance = workflow.agents.reduce((sum, a) => sum + a.performance, 0) / workflow.agents.length

    return {
      completionRate: totalTasks ? (completedTasks / totalTasks) * 100 : 0,
      activeTasks,
      onlineAgents,
      totalAgents: workflow.agents.length,
      avgPerformance: Math.round(avgPerformance)
    }
  }, [workflow])

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <Activity className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm text-gray-500">Loading workflow...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full bg-gray-50 ${className}`}>
      <TooltipProvider>
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900">{workflow.name}</h2>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-500">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {metrics && (
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span>{metrics.onlineAgents}/{metrics.totalAgents} online</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Target className="w-4 h-4 text-green-500" />
                    <span>{metrics.activeTasks} active</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="w-4 h-4 text-purple-500" />
                    <span>{Math.round(metrics.completionRate)}% complete</span>
                  </div>
                </div>
              )}

              {showControls && !readonly && (
                <div className="flex items-center space-x-1 border-l pl-4 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStop}
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTaskPanel(true)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Canvas */}
        <div className="pt-20 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Communication Stream */}
        <AnimatePresence>
          {showCommunications && communicationHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="absolute top-20 right-4 w-80 bg-white border border-gray-200 rounded-lg shadow-lg"
            >
              <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Communications</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {communicationHistory.length}
                </Badge>
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                {communicationHistory.slice(-5).map((comm) => (
                  <div key={comm.id} className="text-xs p-2 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {workflow.agents.find(a => a.id === comm.senderId)?.name}
                      </span>
                      <span className="text-gray-500">
                        {new Date(comm.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-700">{comm.message}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task Assignment Panel */}
        <Dialog open={