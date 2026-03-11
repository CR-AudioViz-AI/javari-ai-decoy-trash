```tsx
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowProvider,
  ReactFlowInstance,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Users,
  Bot,
  CheckSquare,
  GitBranch,
  Play,
  Pause,
  Save,
  Download,
  Upload,
  Maximize2,
  Minimize2,
  Move,
  Trash2,
  Copy,
  Settings,
  Eye,
  EyeOff,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

// Types
interface TeamCollaborationCanvasProps {
  workspaceId: string
  userId: string
  onWorkflowUpdate?: (workflow: WorkflowData) => void
  onCollaboratorJoin?: (collaborator: Collaborator) => void
  className?: string
}

interface WorkflowData {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  status: 'draft' | 'active' | 'completed' | 'paused'
  collaborators: Collaborator[]
  createdAt: Date
  updatedAt: Date
}

interface WorkflowNode {
  id: string
  type: 'workflow' | 'agent' | 'task'
  position: { x: number; y: number }
  data: {
    label: string
    description?: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    assignee?: string
    duration?: number
    dependencies?: string[]
    properties?: Record<string, any>
  }
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: 'dependency' | 'data-flow' | 'trigger'
  data?: {
    condition?: string
    weight?: number
  }
}

interface Collaborator {
  id: string
  name: string
  email: string
  avatar?: string
  cursor?: { x: number; y: number }
  color: string
  isOnline: boolean
  lastSeen: Date
}

// Custom Node Components
const WorkflowNodeComponent = ({ data, selected }: { data: any; selected: boolean }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'workflow-node',
    item: { id: data.id, type: 'workflow' },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const statusIcon = {
    pending: <Clock className="h-3 w-3 text-yellow-500" />,
    running: <Play className="h-3 w-3 text-blue-500" />,
    completed: <CheckCircle className="h-3 w-3 text-green-500" />,
    failed: <AlertCircle className="h-3 w-3 text-red-500" />,
  }

  return (
    <Card
      ref={drag}
      className={`min-w-[200px] p-3 border-2 transition-all ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-200'
      } ${isDragging ? 'opacity-50' : 'opacity-100'} cursor-move bg-white`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-500" />
          <span className="font-medium text-sm">{data.label}</span>
        </div>
        {statusIcon[data.status]}
      </div>
      {data.description && (
        <p className="text-xs text-gray-600 mb-2">{data.description}</p>
      )}
      <div className="flex items-center justify-between">
        {data.assignee && (
          <Badge variant="secondary" className="text-xs">
            {data.assignee}
          </Badge>
        )}
        {data.duration && (
          <span className="text-xs text-gray-500">{data.duration}min</span>
        )}
      </div>
    </Card>
  )
}

const AgentNodeComponent = ({ data, selected }: { data: any; selected: boolean }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'agent-node',
    item: { id: data.id, type: 'agent' },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <Card
      ref={drag}
      className={`min-w-[180px] p-3 border-2 transition-all ${
        selected ? 'border-green-500 shadow-lg' : 'border-gray-200'
      } ${isDragging ? 'opacity-50' : 'opacity-100'} cursor-move bg-green-50`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-green-600" />
          <span className="font-medium text-sm">{data.label}</span>
        </div>
        <div className={`h-2 w-2 rounded-full ${
          data.status === 'running' ? 'bg-green-500 animate-pulse' : 
          data.status === 'completed' ? 'bg-blue-500' : 'bg-gray-400'
        }`} />
      </div>
      {data.description && (
        <p className="text-xs text-gray-600 mb-2">{data.description}</p>
      )}
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-xs">
          AI Agent
        </Badge>
        <Zap className="h-3 w-3 text-yellow-500" />
      </div>
    </Card>
  )
}

const TaskNodeComponent = ({ data, selected }: { data: any; selected: boolean }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'task-node',
    item: { id: data.id, type: 'task' },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  return (
    <Card
      ref={drag}
      className={`min-w-[160px] p-3 border-2 transition-all ${
        selected ? 'border-orange-500 shadow-lg' : 'border-gray-200'
      } ${isDragging ? 'opacity-50' : 'opacity-100'} cursor-move bg-orange-50`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-orange-600" />
          <span className="font-medium text-sm">{data.label}</span>
        </div>
        {data.status === 'completed' && (
          <CheckCircle className="h-3 w-3 text-green-500" />
        )}
      </div>
      {data.description && (
        <p className="text-xs text-gray-600 mb-2">{data.description}</p>
      )}
      {data.assignee && (
        <Badge variant="secondary" className="text-xs">
          {data.assignee}
        </Badge>
      )}
    </Card>
  )
}

// Toolbar Component
const CanvasToolbar = ({ 
  onAddNode, 
  onSave, 
  onLoad, 
  onExport,
  isFullscreen,
  onToggleFullscreen,
}: {
  onAddNode: (type: string) => void
  onSave: () => void
  onLoad: () => void
  onExport: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) => {
  return (
    <div className="flex items-center gap-2 p-2 bg-white border rounded-lg shadow-sm">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddNode('workflow')}
          className="h-8"
        >
          <GitBranch className="h-3 w-3 mr-1" />
          Workflow
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddNode('agent')}
          className="h-8"
        >
          <Bot className="h-3 w-3 mr-1" />
          Agent
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddNode('task')}
          className="h-8"
        >
          <CheckSquare className="h-3 w-3 mr-1" />
          Task
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={onSave} className="h-8">
          <Save className="h-3 w-3 mr-1" />
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onLoad} className="h-8">
          <Upload className="h-3 w-3 mr-1" />
          Load
        </Button>
        <Button size="sm" variant="outline" onClick={onExport} className="h-8">
          <Download className="h-3 w-3 mr-1" />
          Export
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      <Button
        size="sm"
        variant="outline"
        onClick={onToggleFullscreen}
        className="h-8"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3 w-3" />
        ) : (
          <Maximize2 className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}

// Collaborator Cursors Component
const CollaboratorCursors = ({ collaborators }: { collaborators: Collaborator[] }) => {
  return (
    <>
      {collaborators
        .filter((c) => c.isOnline && c.cursor)
        .map((collaborator) => (
          <div
            key={collaborator.id}
            className="absolute pointer-events-none z-50"
            style={{
              left: collaborator.cursor!.x,
              top: collaborator.cursor!.y,
              transform: 'translate(-2px, -2px)',
            }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 border-white"
              style={{ backgroundColor: collaborator.color }}
            />
            <div
              className="absolute top-4 left-0 px-2 py-1 text-xs text-white rounded whitespace-nowrap"
              style={{ backgroundColor: collaborator.color }}
            >
              {collaborator.name}
            </div>
          </div>
        ))}
    </>
  )
}

// Node Property Panel Component
const NodePropertyPanel = ({
  node,
  isOpen,
  onClose,
  onUpdate,
}: {
  node: WorkflowNode | null
  isOpen: boolean
  onClose: () => void
  onUpdate: (nodeId: string, data: any) => void
}) => {
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    if (node) {
      setFormData(node.data)
    }
  }, [node])

  const handleSave = () => {
    if (node) {
      onUpdate(node.id, formData)
      onClose()
    }
  }

  if (!node) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {node.type} Properties</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Label</label>
            <Input
              value={formData.label || ''}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Enter label..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter description..."
            />
          </div>
          {node.type === 'task' && (
            <div>
              <label className="text-sm font-medium">Assignee</label>
              <Input
                value={formData.assignee || ''}
                onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                placeholder="Assign to..."
              />
            </div>
          )}
          {node.type === 'workflow' && (
            <div>
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input
                type="number"
                value={formData.duration || ''}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                placeholder="Expected duration..."
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Main Component
const TeamCollaborationCanvasContent = ({
  workspaceId,
  userId,
  onWorkflowUpdate,
  onCollaboratorJoin,
  className,
}: TeamCollaborationCanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance>()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [isPropertyPanelOpen, setIsPropertyPanelOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Node types configuration
  const nodeTypes = useMemo(
    () => ({
      workflow: WorkflowNodeComponent,
      agent: AgentNodeComponent,
      task: TaskNodeComponent,
    }),
    []
  )

  // Add new node to canvas
  const handleAddNode = useCallback((type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        label: `New ${type}`,
        status: 'pending',
        description: `A new ${type} node`,
      },
    }
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  // Handle connection creation
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: 'default',
        data: { type: 'dependency' },
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node as WorkflowNode)
    setIsPropertyPanelOpen(true)
  }, [])

  // Update node properties
  const handleNodeUpdate = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    )
  }, [setNodes])

  // Save workflow
  const handleSave = useCallback(() => {
    if (!reactFlowInstance) return

    const workflow: WorkflowData = {
      id: workspaceId,
      name: 'Team Workflow',
      nodes: nodes as WorkflowNode[],
      edges: edges as WorkflowEdge[],
      status: 'draft',
      collaborators,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    setWorkflowData(workflow)
    onWorkflowUpdate?.(workflow)
    
    // Here you would typically save to Supabase
    console.log('Saving workflow:', workflow)
  }, [reactFlowInstance, nodes, edges, collaborators, workspaceId, onWorkflowUpdate])

  // Load workflow
  const handleLoad = useCallback(() => {
    // Here you would typically load from Supabase
    console.log('Loading workflow...')
  }, [])

  // Export workflow
  const handleExport = useCallback(() => {
    if (!reactFlowInstance) return
    
    const flow = reactFlowInstance.toObject()
    const dataStr = JSON.stringify(flow, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `workflow-${workspaceId}.json`
    link.click()
  }, [reactFlowInstance, workspaceId])

  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen)
  }, [isFullscreen])

  // Simulate real-time collaboration
  useEffect(() => {
    // Mock collaborators
    const mockCollaborators: Collaborator[] = [
      {
        id: '1',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        color: '#3b82f6',
        isOnline: true,
        lastSeen: new Date(),
        cursor: { x: 100, y: 100 },
      },
      {
        id: '2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        color: '#ef4444',
        isOnline: true,
        lastSeen: new Date(),
        cursor: { x: 200, y: 150 },
      },
    ]
    setCollaborators(mockCollaborators)
  }, [])

  // Handle mouse move for cursor tracking
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    // Here you would broadcast cursor position to other collaborators
    console.log('Cursor position:', { x, y })
  }, [])

  return (
    <div
      ref={canvasRef}
      className={`relative w-full h-full bg-gray-50 ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      } ${className}`}
      onMouseMove={handleMouseMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'workflow':
                return '#a855f7'
              case 'agent':
                return '#22c55e'
              case 'task':
                return '#f97316'
              default:
                return '#6b7280'
            }
          }}
          className="bg-white border rounded"
        />
        
        <Panel position="top-left">
          <CanvasToolbar
            onAddNode={handleAddNode}
            onSave={handleSave}
            onLoad={handleLoad}
            onExport={handleExport}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
          />
        </Panel>

        <Panel position="top-right">
          <Card className="p-3 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Collaborators</span>
            </div>
            <div className="space-y-2">
              {collaborators.map((collaborator) => (
                <div key={collaborator.id} className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      collaborator.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-xs">{collaborator.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </Panel>
      </ReactFlow>

      <CollaboratorCursors collaborators={collaborators} />

      <NodePropertyPanel
        node={selectedNode}
        is