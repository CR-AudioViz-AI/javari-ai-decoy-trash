```tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, 
  Users, 
  TrendingUp, 
  Clock, 
  MessageCircle, 
  Target,
  BarChart3,
  Calendar,
  Network,
  Zap,
  User,
  Filter,
  Search,
  RefreshCw,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  role: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  lastActivity: Date;
  tasksCompleted: number;
  responseTime: number;
  qualityScore: number;
  collaborationScore: number;
}

interface Activity {
  id: string;
  agentId: string;
  agentName: string;
  type: 'task_completed' | 'task_started' | 'collaboration' | 'handoff' | 'communication' | 'error';
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high';
}

interface CollaborationPattern {
  from: string;
  to: string;
  strength: number;
  interactions: number;
  avgResponseTime: number;
}

interface PerformanceMetric {
  date: Date;
  completedTasks: number;
  averageResponseTime: number;
  qualityScore: number;
  collaborationEvents: number;
}

interface TeamPerformanceProps {
  teamId?: string;
  timeRange?: '1h' | '24h' | '7d' | '30d';
  realTimeEnabled?: boolean;
  className?: string;
}

const AgentStatusIndicator = ({ 
  agent, 
  showDetails = false 
}: { 
  agent: Agent; 
  showDetails?: boolean;
}) => {
  const statusColors = {
    online: 'bg-green-500',
    busy: 'bg-yellow-500',
    away: 'bg-orange-500',
    offline: 'bg-gray-400'
  };

  const statusLabels = {
    online: 'Online',
    busy: 'Busy',
    away: 'Away',
    offline: 'Offline'
  };

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={agent.avatar} alt={agent.name} />
        <AvatarFallback>{agent.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{agent.name}</span>
          <div className={cn("w-2 h-2 rounded-full", statusColors[agent.status])} />
        </div>
        {showDetails && (
          <div className="text-xs text-muted-foreground">
            {statusLabels[agent.status]} • {agent.role}
          </div>
        )}
      </div>
    </div>
  );
};

const ActivityStreamFeed = ({ 
  activities, 
  agents,
  onFilterChange 
}: { 
  activities: Activity[];
  agents: Agent[];
  onFilterChange: (filter: string) => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const matchesSearch = activity.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           activity.agentName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'all' || activity.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [activities, searchTerm, typeFilter]);

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'task_completed': return <Target className="h-4 w-4 text-green-600" />;
      case 'task_started': return <Activity className="h-4 w-4 text-blue-600" />;
      case 'collaboration': return <Users className="h-4 w-4 text-purple-600" />;
      case 'handoff': return <Network className="h-4 w-4 text-orange-600" />;
      case 'communication': return <MessageCircle className="h-4 w-4 text-cyan-600" />;
      case 'error': return <Zap className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: Activity['priority']) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-300';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Activity Stream</CardTitle>
          <Badge variant="secondary" className="ml-2">
            {filteredActivities.length} events
          </Badge>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search activities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="task_completed">Completed</SelectItem>
              <SelectItem value="task_started">Started</SelectItem>
              <SelectItem value="collaboration">Collaboration</SelectItem>
              <SelectItem value="handoff">Handoff</SelectItem>
              <SelectItem value="communication">Communication</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[400px] px-6">
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border-l-4 bg-muted/30",
                  getPriorityColor(activity.priority)
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{activity.agentName}</span>
                    <Badge variant="outline" className="text-xs">
                      {activity.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{activity.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {activity.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const CollaborationMetrics = ({ agents }: { agents: Agent[] }) => {
  const metrics = useMemo(() => {
    const avgResponseTime = agents.reduce((sum, agent) => sum + agent.responseTime, 0) / agents.length;
    const avgQualityScore = agents.reduce((sum, agent) => sum + agent.qualityScore, 0) / agents.length;
    const totalTasks = agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0);
    const activeAgents = agents.filter(agent => agent.status === 'online' || agent.status === 'busy').length;
    
    return {
      avgResponseTime,
      avgQualityScore,
      totalTasks,
      activeAgents,
      teamEfficiency: (avgQualityScore / avgResponseTime) * 100
    };
  }, [agents]);

  const MetricCard = ({ 
    title, 
    value, 
    unit, 
    trend, 
    icon: Icon 
  }: {
    title: string;
    value: number;
    unit: string;
    trend: 'up' | 'down' | 'neutral';
    icon: React.ElementType;
  }) => {
    const getTrendIcon = () => {
      switch (trend) {
        case 'up': return <ArrowUp className="h-3 w-3 text-green-600" />;
        case 'down': return <ArrowDown className="h-3 w-3 text-red-600" />;
        default: return <Minus className="h-3 w-3 text-gray-600" />;
      }
    };

    return (
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            {typeof value === 'number' ? value.toFixed(1) : value}{unit}
          </span>
          {getTrendIcon()}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard
        title="Active Agents"
        value={metrics.activeAgents}
        unit=""
        trend="up"
        icon={Users}
      />
      <MetricCard
        title="Avg Response"
        value={metrics.avgResponseTime}
        unit="s"
        trend="down"
        icon={Clock}
      />
      <MetricCard
        title="Quality Score"
        value={metrics.avgQualityScore}
        unit="%"
        trend="up"
        icon={Target}
      />
      <MetricCard
        title="Tasks Completed"
        value={metrics.totalTasks}
        unit=""
        trend="up"
        icon={BarChart3}
      />
      <MetricCard
        title="Team Efficiency"
        value={metrics.teamEfficiency}
        unit="%"
        trend="up"
        icon={TrendingUp}
      />
    </div>
  );
};

const TaskDistributionChart = ({ agents }: { agents: Agent[] }) => {
  const totalTasks = agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0);
  
  const data = agents.map(agent => ({
    name: agent.name,
    tasks: agent.tasksCompleted,
    percentage: totalTasks > 0 ? (agent.tasksCompleted / totalTasks) * 100 : 0,
    color: `hsl(${agent.name.charCodeAt(0) * 137.5 % 360}, 70%, 50%)`
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Task Distribution</CardTitle>
        <CardDescription>Workload across team members</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground">
                  {item.tasks} tasks ({item.percentage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={item.percentage} className="h-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const PerformanceHeatmap = ({ 
  data,
  timeRange 
}: { 
  data: PerformanceMetric[];
  timeRange: string;
}) => {
  const getIntensityColor = (value: number, max: number) => {
    const intensity = max > 0 ? value / max : 0;
    const alpha = Math.max(0.1, intensity);
    return `rgba(59, 130, 246, ${alpha})`;
  };

  const maxTasks = Math.max(...data.map(d => d.completedTasks));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Heatmap</CardTitle>
        <CardDescription>Team activity patterns over {timeRange}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="grid grid-cols-25 gap-1 text-xs">
            <div></div>
            {hours.map(hour => (
              <div key={hour} className="text-center text-muted-foreground">
                {hour % 6 === 0 ? hour : ''}
              </div>
            ))}
          </div>
          {days.map((day, dayIndex) => (
            <div key={day} className="grid grid-cols-25 gap-1">
              <div className="text-xs text-muted-foreground font-medium w-8">
                {day}
              </div>
              {hours.map(hour => {
                const dataPoint = data.find(d => 
                  d.date.getDay() === dayIndex && d.date.getHours() === hour
                );
                const value = dataPoint?.completedTasks || 0;
                
                return (
                  <div
                    key={hour}
                    className="h-3 rounded-sm border"
                    style={{ backgroundColor: getIntensityColor(value, maxTasks) }}
                    title={`${day} ${hour}:00 - ${value} tasks`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>Less activity</span>
          <div className="flex items-center gap-1">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity, index) => (
              <div
                key={index}
                className="w-3 h-3 rounded-sm border"
                style={{ backgroundColor: `rgba(59, 130, 246, ${Math.max(0.1, intensity)})` }}
              />
            ))}
          </div>
          <span>More activity</span>
        </div>
      </CardContent>
    </Card>
  );
};

const WorkflowPatternMap = ({ 
  patterns,
  agents 
}: { 
  patterns: CollaborationPattern[];
  agents: Agent[];
}) => {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Collaboration Patterns</CardTitle>
        <CardDescription>Inter-agent communication flow</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[300px]">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Top Collaborations</h4>
            <ScrollArea className="h-[250px]">
              {patterns
                .sort((a, b) => b.interactions - a.interactions)
                .slice(0, 10)
                .map((pattern, index) => {
                  const fromAgent = agents.find(a => a.id === pattern.from);
                  const toAgent = agents.find(a => a.id === pattern.to);
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{fromAgent?.name}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm font-medium">{toAgent?.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{pattern.interactions}</div>
                        <div className="text-xs text-muted-foreground">
                          {pattern.avgResponseTime.toFixed(1)}s avg
                        </div>
                      </div>
                    </div>
                  );
                })}
            </ScrollArea>
          </div>
          <div className="flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">Interactive network visualization</p>
              <p className="text-xs">Would integrate with D3.js or similar</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function TeamPerformance({
  teamId = 'default',
  timeRange = '24h',
  realTimeEnabled = true,
  className
}: TeamPerformanceProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [collaborationPatterns, setCollaborationPatterns] = useState<CollaborationPattern[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);

  // Mock data generation
  const generateMockData = useCallback(() => {
    const mockAgents: Agent[] = [
      {
        id: '1',
        name: 'Alice Johnson',
        role: 'Senior Agent',
        status: 'online',
        lastActivity: new Date(),
        tasksCompleted: 42,
        responseTime: 2.3,
        qualityScore: 94.5,
        collaborationScore: 87.2
      },
      {
        id: '2',
        name: 'Bob Smith',
        role: 'Technical Lead',
        status: 'busy',
        lastActivity: new Date(Date.now() - 5 * 60 * 1000),
        tasksCompleted: 38,
        responseTime: 1.8,
        qualityScore: 96.1,
        collaborationScore: 92.4
      },
      {
        id: '3',
        name: 'Carol White',
        role: 'Analyst',
        status: 'online',
        lastActivity: new Date(Date.now() - 2 * 60 * 1000),
        tasksCompleted: 29,
        responseTime: 3.1,
        qualityScore: 91.8,
        collaborationScore: 85.6
      },
      {
        id: '4',
        name: 'David Brown',
        role: 'Coordinator',
        status: 'away',
        lastActivity: new Date(Date.now() - 15 * 60 * 1000),
        tasksCompleted: 35,
        responseTime: 2.7,
        qualityScore: 88.9,
        collaborationScore: 94.1
      }
    ];

    const mockActivities: Activity[] = Array.from({ length: 50 }, (_, i) => ({
      id: `activity-${i}`,
      agentId: mockAgents[i % mockAgents.length].id,
      agentName: mockAgents[i % mockAgents.length].name,
      type: ['task_completed', 'task_started', 'collaboration', 'handoff', 'communication'][Math.floor(Math.random() * 5)] as Activity['type'],
      description: [
        'Completed customer onboarding workflow',
        'Started data analysis task',
        'Collaborated on report generation',
        'Handed off ticket to specialist',
        'Responded to team query'
      ][Math.floor(Math.random() * 5)],
      timestamp: new Date(Date.now() - i * 5 * 60 * 1000),
      priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as Activity['priority']
    }));

    const mockPatterns: CollaborationPattern[] = [
      { from: '1', to: '2', strength: 0.8, interactions: 25, avgResponseTime: 1.5 },
      { from: '2', to: '3', strength: 0.6, interactions: 18, avgResponseTime