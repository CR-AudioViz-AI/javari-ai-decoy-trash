```tsx
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  Play, 
  Square, 
  Settings, 
  BarChart3, 
  Copy, 
  Download, 
  RefreshCw,
  Zap,
  Timer,
  TrendingUp,
  Eye,
  MessageSquare,
  Share2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { createClient } from '@supabase/supabase-js'

// Types
interface Agent {
  id: string
  name: string
  description: string
  category: string
  parameters: AgentParameter[]
  pricing: {
    type: 'free' | 'usage' | 'subscription'
    rate?: number
    unit?: string
  }
  capabilities: string[]
  version: string
  publisher: {
    id: string
    name: string
    avatar?: string
  }
}

interface AgentParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect'
  description: string
  required: boolean
  default?: any
  options?: string[]
  min?: number
  max?: number
  validation?: string
}

interface DemoSession {
  id: string
  agentId: string
  userId?: string
  parameters: Record<string, any>
  input: string
  output?: string
  status: 'idle' | 'running' | 'completed' | 'error'
  startTime: Date
  endTime?: Date
  duration?: number
  tokensUsed?: number
  cost?: number
  error?: string
}

interface UsageMetrics {
  totalSessions: number
  averageDuration: number
  successRate: number
  conversionRate: number
  totalTokensUsed: number
  totalCost: number
  popularParameters: Record<string, any>
}

interface AgentDemoPlaygroundProps {
  agentId: string
  className?: string
  onConversion?: (sessionId: string) => void
  onError?: (error: Error) => void
}

// Zustand Store
interface DemoStore {
  currentSession: DemoSession | null
  parameters: Record<string, any>
  input: string
  output: string
  isStreaming: boolean
  metrics: UsageMetrics | null
  setCurrentSession: (session: DemoSession | null) => void
  setParameters: (parameters: Record<string, any>) => void
  setInput: (input: string) => void
  setOutput: (output: string) => void
  setIsStreaming: (streaming: boolean) => void
  setMetrics: (metrics: UsageMetrics) => void
  resetDemo: () => void
}

const useDemoStore = create<DemoStore>((set) => ({
  currentSession: null,
  parameters: {},
  input: '',
  output: '',
  isStreaming: false,
  metrics: null,
  setCurrentSession: (session) => set({ currentSession: session }),
  setParameters: (parameters) => set({ parameters }),
  setInput: (input) => set({ input }),
  setOutput: (output) => set({ output }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setMetrics: (metrics) => set({ metrics }),
  resetDemo: () => set({
    currentSession: null,
    parameters: {},
    input: '',
    output: '',
    isStreaming: false
  })
}))

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Sub-components
const InputConfigPanel: React.FC<{
  agent: Agent
  parameters: Record<string, any>
  onParameterChange: (name: string, value: any) => void
}> = ({ agent, parameters, onParameterChange }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Parameters
        </CardTitle>
        <CardDescription>
          Configure agent parameters for your demo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {agent.parameters.map((param) => (
          <div key={param.name} className="space-y-2">
            <Label htmlFor={param.name} className="text-sm font-medium">
              {param.name}
              {param.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <p className="text-xs text-muted-foreground">{param.description}</p>
            
            {param.type === 'string' && (
              <Input
                id={param.name}
                value={parameters[param.name] || param.default || ''}
                onChange={(e) => onParameterChange(param.name, e.target.value)}
                placeholder={`Enter ${param.name}`}
                className="w-full"
              />
            )}
            
            {param.type === 'number' && (
              <div className="space-y-2">
                <Slider
                  value={[parameters[param.name] || param.default || param.min || 0]}
                  onValueChange={([value]) => onParameterChange(param.name, value)}
                  min={param.min || 0}
                  max={param.max || 100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{param.min || 0}</span>
                  <span>{parameters[param.name] || param.default || param.min || 0}</span>
                  <span>{param.max || 100}</span>
                </div>
              </div>
            )}
            
            {param.type === 'boolean' && (
              <div className="flex items-center space-x-2">
                <Switch
                  id={param.name}
                  checked={parameters[param.name] || param.default || false}
                  onCheckedChange={(checked) => onParameterChange(param.name, checked)}
                />
                <Label htmlFor={param.name} className="text-sm">
                  {param.name}
                </Label>
              </div>
            )}
            
            {param.type === 'select' && param.options && (
              <select
                value={parameters[param.name] || param.default || ''}
                onChange={(e) => onParameterChange(param.name, e.target.value)}
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
              >
                <option value="">Select {param.name}</option>
                {param.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const StreamingOutputViewer: React.FC<{
  output: string
  isStreaming: boolean
  session: DemoSession | null
}> = ({ output, isStreaming, session }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(output)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }, [output])

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Output
            {isStreaming && (
              <Badge variant="secondary" className="animate-pulse">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Streaming
                </div>
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              disabled={!output}
              className="h-8"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([output], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `agent-output-${Date.now()}.txt`
                a.click()
                URL.revokeObjectURL(url)
              }}
              disabled={!output}
              className="h-8"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea ref={scrollRef} className="h-80 p-4">
          <div className="space-y-2">
            {output ? (
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {output}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                  <MessageSquare className="h-8 w-8 mx-auto opacity-50" />
                  <p className="text-sm">Output will appear here...</p>
                </div>
              </div>
            )}
            
            {isStreaming && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating response...
              </div>
            )}
          </div>
        </ScrollArea>
        
        {session && (
          <div className="border-t p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                {session.duration && (
                  <div className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {session.duration}ms
                  </div>
                )}
                {session.tokensUsed && (
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {session.tokensUsed} tokens
                  </div>
                )}
                {session.cost && (
                  <div className="flex items-center gap-1">
                    $
                    {session.cost.toFixed(4)}
                  </div>
                )}
              </div>
              <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                {session.status}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const UsageMetricsDisplay: React.FC<{
  metrics: UsageMetrics | null
  agentId: string
}> = ({ metrics, agentId }) => {
  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="ml-2">Loading metrics...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-bold">{metrics.totalSessions}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Duration</p>
              <p className="text-2xl font-bold">{Math.round(metrics.averageDuration)}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold">{Math.round(metrics.successRate * 100)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-sm text-muted-foreground">Conversion</p>
              <p className="text-2xl font-bold">{Math.round(metrics.conversionRate * 100)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main Component
export const AgentDemoPlayground: React.FC<AgentDemoPlaygroundProps> = ({
  agentId,
  className,
  onConversion,
  onError
}) => {
  const [activeTab, setActiveTab] = useState('demo')
  const wsRef = useRef<WebSocket | null>(null)
  
  const {
    currentSession,
    parameters,
    input,
    output,
    isStreaming,
    metrics,
    setCurrentSession,
    setParameters,
    setInput,
    setOutput,
    setIsStreaming,
    setMetrics,
    resetDemo
  } = useDemoStore()

  // Fetch agent data
  const { data: agent, isLoading: isLoadingAgent } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_agents')
        .select('*')
        .eq('id', agentId)
        .single()
      
      if (error) throw error
      return data as Agent
    }
  })

  // Fetch usage metrics
  const { data: usageMetrics } = useQuery({
    queryKey: ['agent-metrics', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_demo_sessions')
        .select('*')
        .eq('agent_id', agentId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      
      if (error) throw error
      
      // Calculate metrics from raw data
      const totalSessions = data.length
      const completedSessions = data.filter(s => s.status === 'completed')
      const averageDuration = completedSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / completedSessions.length
      const successRate = completedSessions.length / totalSessions
      const conversionRate = data.filter(s => s.converted).length / totalSessions
      const totalTokensUsed = data.reduce((acc, s) => acc + (s.tokens_used || 0), 0)
      const totalCost = data.reduce((acc, s) => acc + (s.cost || 0), 0)
      
      return {
        totalSessions,
        averageDuration,
        successRate,
        conversionRate,
        totalTokensUsed,
        totalCost,
        popularParameters: {}
      } as UsageMetrics
    },
    enabled: !!agent
  })

  // Initialize parameters when agent loads
  useEffect(() => {
    if (agent) {
      const defaultParams: Record<string, any> = {}
      agent.parameters.forEach(param => {
        if (param.default !== undefined) {
          defaultParams[param.name] = param.default
        }
      })
      setParameters(defaultParams)
      setMetrics(usageMetrics || null)
    }
  }, [agent, usageMetrics, setParameters, setMetrics])

  // Handle parameter changes
  const handleParameterChange = useCallback((name: string, value: any) => {
    setParameters({ ...parameters, [name]: value })
  }, [parameters, setParameters])

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/agent-stream`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        switch (data.type) {
          case 'chunk':
            setOutput(prev => prev + data.content)
            break
          case 'complete':
            setIsStreaming(false)
            setCurrentSession(prev => prev ? {
              ...prev,
              status: 'completed',
              endTime: new Date(),
              duration: data.duration,
              tokensUsed: data.tokensUsed,
              cost: data.cost
            } : null)
            break
          case 'error':
            setIsStreaming(false)
            setCurrentSession(prev => prev ? {
              ...prev,
              status: 'error',
              error: data.error
            } : null)
            if (onError) {
              onError(new Error(data.error))
            }
            break
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsStreaming(false)
    }

    return ws
  }, [setOutput, setIsStreaming, setCurrentSession, onError])

  // Run agent demo
  const runDemo = useCallback(async () => {
    if (!agent || !input.trim()) return

    try {
      setIsStreaming(true)
      setOutput('')
      
      const session: DemoSession = {
        id: `session_${Date.now()}`,
        agentId: agent.id,
        parameters,
        input,
        status: 'running',
        startTime: new Date()
      }
      
      setCurrentSession(session)

      // Initialize WebSocket for streaming
      const ws = initializeWebSocket()
      
      // Send demo request via WebSocket
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'demo',
          agentId: agent.id,
          parameters,
          input,
          sessionId: session.id
        }))
      }

      // Store session in database
      await supabase
        .from('agent_demo_sessions')
        .insert({
          id: session.id,
          agent_id: agent.id,
          user_id: null, // Anonymous for now
          parameters,
          input,
          status: 'running',
          created_at: new Date().toISOString()
        })

    } catch (error) {
      console.error('Failed to run demo:', error)
      setIsStreaming(false)
      if (onError) {
        onError(error as Error)
      }
    }
  }, [agent, input, parameters, setIsStreaming, setOutput, setCurrentSession, initializeWebSocket, onError])

  // Stop demo
  const stopDemo = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    setIsStreaming(false)
    setCurrentSession(prev => prev ? {
      ...prev,
      status: 'completed',
      endTime: new Date()
    } : null)
  }, [setIsStreaming, setCurrentSession])

  // Share demo
  const shareDemo = useCallback(async () => {
    if (!currentSession) return
    
    try {
      const shareUrl = `${window.location.origin}/marketplace/agent/${agentId}/demo/${currentSession.id}`
      await navigator.clipboard.writeText(shareUrl)
    } catch (error) {
      console.error('Failed to share demo:', error)
    }
  }, [agentId, currentSession])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  if (isLoadingAgent) {
    return (
      <Card className={className}>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading agent...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!agent) {
    return (
      <Card className={className}>
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">
            Agent