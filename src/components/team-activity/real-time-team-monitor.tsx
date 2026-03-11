```tsx
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  Activity, 
  Users, 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  ArrowRight,
  Zap,
  TrendingUp,
  Target,
  Network,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as d3 from 'd3'

interface Agent {
  id: string
  name: string
  avatar?: string
  status: 'active' | 'idle' | 'offline'
  currentTask?: string
  completedTasks: number
  efficiency: number
  lastActivity: Date
}

interface Task {
  id: string
  title: string
  description: string
  assignedTo: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'critical'
  progress: number
  deadline: Date
  createdAt: Date
}

interface Communication {
  id: string
  fromAgent: string
  toAgent?: string
  type: 'direct' | 'broadcast' | 'task_update' | 'system'
  message: string
  timestamp: Date
  taskId?: string
}

interface NetworkNode {
  id: string
  name: string
  type: 'agent' | 'task' | 'system'
  status: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface NetworkLink {
  source: string | NetworkNode
  target: string | NetworkNode
  type: 'communication' | 'assignment' | 'dependency'
  strength: number
  timestamp: Date
}

interface ActivityMetrics {
  totalAgents: number
  activeAgents: number
  tasksCompleted: number
  averageEfficiency: number
  communicationVolume: number
  systemLoad: number
}

interface RealTimeTeamMonitorProps {
  teamId: string
  autoRefresh?: boolean
  refreshInterval?: number
  className?: string
}

const RealTimeTeamMonitor: React.FC<RealTimeTeamMonitorProps> = ({
  teamId,
  autoRefresh = true,
  refreshInterval = 5000,
  className
}) => {
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [communications, setCommunications] = useState<Communication[]>([])
  const [metrics, setMetrics] = useState<ActivityMetrics>({
    totalAgents: 0,
    activeAgents: 0,
    tasksCompleted: 0,
    averageEfficiency: 0,
    communicationVolume: 0,
    systemLoad: 0
  })
  const [networkData, setNetworkData] = useState<{ nodes: NetworkNode[], links: NetworkLink[] }>({
    nodes: [],
    links: []
  })
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<NetworkNode, NetworkLink> | null>(null)

  // Mock data initialization
  useEffect(() => {
    const mockAgents: Agent[] = [
      {
        id: '1',
        name: 'Alice Johnson',
        avatar: '/avatars/alice.jpg',
        status: 'active',
        currentTask: 'Data Analysis',
        completedTasks: 12,
        efficiency: 94,
        lastActivity: new Date()
      },
      {
        id: '2',
        name: 'Bob Smith',
        avatar: '/avatars/bob.jpg',
        status: 'active',
        currentTask: 'Model Training',
        completedTasks: 8,
        efficiency: 87,
        lastActivity: new Date(Date.now() - 300000)
      },
      {
        id: '3',
        name: 'Carol Davis',
        avatar: '/avatars/carol.jpg',
        status: 'idle',
        completedTasks: 15,
        efficiency: 91,
        lastActivity: new Date(Date.now() - 600000)
      },
      {
        id: '4',
        name: 'David Wilson',
        avatar: '/avatars/david.jpg',
        status: 'offline',
        completedTasks: 6,
        efficiency: 78,
        lastActivity: new Date(Date.now() - 1800000)
      }
    ]

    const mockTasks: Task[] = [
      {
        id: 't1',
        title: 'Customer Segmentation Analysis',
        description: 'Analyze customer data to identify segments',
        assignedTo: ['1', '2'],
        status: 'in_progress',
        priority: 'high',
        progress: 65,
        deadline: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() - 3600000)
      },
      {
        id: 't2',
        title: 'Predictive Model Development',
        description: 'Build ML model for sales forecasting',
        assignedTo: ['2'],
        status: 'in_progress',
        priority: 'critical',
        progress: 40,
        deadline: new Date(Date.now() + 172800000),
        createdAt: new Date(Date.now() - 7200000)
      },
      {
        id: 't3',
        title: 'Data Quality Assessment',
        description: 'Review and validate data sources',
        assignedTo: ['3'],
        status: 'completed',
        priority: 'medium',
        progress: 100,
        deadline: new Date(Date.now() - 86400000),
        createdAt: new Date(Date.now() - 259200000)
      }
    ]

    const mockCommunications: Communication[] = [
      {
        id: 'c1',
        fromAgent: '1',
        toAgent: '2',
        type: 'direct',
        message: 'Need help with data preprocessing',
        timestamp: new Date(Date.now() - 600000),
        taskId: 't1'
      },
      {
        id: 'c2',
        fromAgent: '2',
        type: 'broadcast',
        message: 'Model training completed for phase 1',
        timestamp: new Date(Date.now() - 300000),
        taskId: 't2'
      },
      {
        id: 'c3',
        fromAgent: '3',
        toAgent: '1',
        type: 'task_update',
        message: 'Data quality report uploaded',
        timestamp: new Date(Date.now() - 180000),
        taskId: 't3'
      }
    ]

    setAgents(mockAgents)
    setTasks(mockTasks)
    setCommunications(mockCommunications)

    // Generate network data
    const nodes: NetworkNode[] = [
      ...mockAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        type: 'agent' as const,
        status: agent.status
      })),
      ...mockTasks.map(task => ({
        id: task.id,
        name: task.title,
        type: 'task' as const,
        status: task.status
      }))
    ]

    const links: NetworkLink[] = [
      ...mockTasks.flatMap(task =>
        task.assignedTo.map(agentId => ({
          source: agentId,
          target: task.id,
          type: 'assignment' as const,
          strength: 1,
          timestamp: task.createdAt
        }))
      ),
      ...mockCommunications.filter(comm => comm.toAgent).map(comm => ({
        source: comm.fromAgent,
        target: comm.toAgent!,
        type: 'communication' as const,
        strength: 0.5,
        timestamp: comm.timestamp
      }))
    ]

    setNetworkData({ nodes, links })

    // Calculate metrics
    const activeAgents = mockAgents.filter(a => a.status === 'active').length
    const completedTasks = mockTasks.filter(t => t.status === 'completed').length
    const avgEfficiency = mockAgents.reduce((sum, a) => sum + a.efficiency, 0) / mockAgents.length

    setMetrics({
      totalAgents: mockAgents.length,
      activeAgents,
      tasksCompleted: completedTasks,
      averageEfficiency: avgEfficiency,
      communicationVolume: mockCommunications.length,
      systemLoad: Math.random() * 100
    })
  }, [teamId])

  // Network graph initialization
  useEffect(() => {
    if (!svgRef.current || networkData.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = 800
    const height = 600

    svg.selectAll('*').remove()

    const simulation = d3.forceSimulation<NetworkNode>(networkData.nodes)
      .force('link', d3.forceLink<NetworkNode, NetworkLink>(networkData.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))

    simulationRef.current = simulation

    const g = svg.append('g')

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)

    // Links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(networkData.links)
      .enter().append('line')
      .attr('stroke', d => {
        switch (d.type) {
          case 'communication': return '#3b82f6'
          case 'assignment': return '#10b981'
          case 'dependency': return '#f59e0b'
          default: return '#6b7280'
        }
      })
      .attr('stroke-width', d => Math.sqrt(d.strength * 4))
      .attr('stroke-opacity', 0.6)

    // Nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(networkData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, NetworkNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    // Node circles
    node.append('circle')
      .attr('r', d => d.type === 'agent' ? 25 : 20)
      .attr('fill', d => {
        if (d.type === 'agent') {
          switch (d.status) {
            case 'active': return '#10b981'
            case 'idle': return '#f59e0b'
            case 'offline': return '#ef4444'
            default: return '#6b7280'
          }
        } else {
          switch (d.status) {
            case 'completed': return '#10b981'
            case 'in_progress': return '#3b82f6'
            case 'pending': return '#f59e0b'
            case 'blocked': return '#ef4444'
            default: return '#6b7280'
          }
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Node labels
    node.append('text')
      .text(d => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#fff')

    // Node click handler
    node.on('click', (event, d) => {
      if (d.type === 'agent') {
        setSelectedAgent(d.id)
      }
    })

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NetworkNode).x!)
        .attr('y1', d => (d.source as NetworkNode).y!)
        .attr('x2', d => (d.target as NetworkNode).x!)
        .attr('y2', d => (d.target as NetworkNode).y!)

      node
        .attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
    }
  }, [networkData])

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'idle': return 'bg-yellow-500'
      case 'offline': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Team Activity Monitor</h1>
          <p className="text-muted-foreground">
            Real-time collaboration and performance tracking
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="monitoring"
              checked={isMonitoring}
              onCheckedChange={setIsMonitoring}
            />
            <Label htmlFor="monitoring">Live Monitoring</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="heatmap"
              checked={showHeatmap}
              onCheckedChange={setShowHeatmap}
            />
            <Label htmlFor="heatmap">Interaction Heatmap</Label>
          </div>

          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{metrics.activeAgents}</p>
                <p className="text-xs text-muted-foreground">Active Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{metrics.tasksCompleted}</p>
                <p className="text-xs text-muted-foreground">Tasks Done</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{Math.round(metrics.averageEfficiency)}%</p>
                <p className="text-xs text-muted-foreground">Avg Efficiency</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{metrics.communicationVolume}</p>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{Math.round(metrics.systemLoad)}%</p>
                <p className="text-xs text-muted-foreground">System Load</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Network className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold">{networkData.nodes.length}</p>
                <p className="text-xs text-muted-foreground">Network Nodes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Network Graph */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Team Collaboration Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <svg
                ref={svgRef}
                width="100%"
                height="400"
                viewBox="0 0 800 400"
                className="border rounded-md bg-gray-50"
              />
              {showHeatmap && (
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm p-2 rounded-md text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span>Active</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 bg-blue-500 rounded"></div>
                    <span>In Progress</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                    <span>Idle</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Agent Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agent Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <div className="space-y-3">
                <AnimatePresence>
                  {agents.map((agent) => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedAgent === agent.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedAgent(agent.id)}
                    >
                      <div className="flex items-center space-x-