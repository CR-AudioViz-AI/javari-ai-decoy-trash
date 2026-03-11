```tsx
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Activity, 
  Target, 
  TrendingUp, 
  GitBranch, 
  MessageCircle,
  Clock,
  Filter,
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  department: string;
  isOnline: boolean;
  lastActive: Date;
}

interface Activity {
  id: string;
  userId: string;
  type: 'task' | 'collaboration' | 'communication' | 'review';
  description: string;
  timestamp: Date;
  metadata: Record<string, any>;
  collaborators?: string[];
  taskId?: string;
  duration?: number;
}

interface CollaborationLink {
  source: string;
  target: string;
  strength: number;
  activities: Activity[];
  lastInteraction: Date;
}

interface PerformanceMetric {
  userId: string;
  tasksCompleted: number;
  collaborationScore: number;
  communicationFrequency: number;
  responseTime: number;
  qualityScore: number;
  productivityTrend: number[];
}

interface NetworkNode extends d3.SimulationNodeDatum {
  id: string;
  member: TeamMember;
  metric: PerformanceMetric;
  radius: number;
  color: string;
}

interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
  source: NetworkNode;
  target: NetworkNode;
  collaboration: CollaborationLink;
  width: number;
}

interface TeamPerformanceMonitorProps {
  teamId: string;
  timeRange: 'day' | 'week' | 'month' | 'quarter';
  onMemberSelect?: (member: TeamMember) => void;
  onActivityFilter?: (filters: ActivityFilters) => void;
  className?: string;
}

interface ActivityFilters {
  types: string[];
  departments: string[];
  dateRange: [Date, Date];
  minCollaborationStrength: number;
}

// Network Graph Component
const NetworkGraph: React.FC<{
  nodes: NetworkNode[];
  links: NetworkLink[];
  selectedNode: string | null;
  onNodeSelect: (nodeId: string) => void;
  width: number;
  height: number;
}> = ({ nodes, links, selectedNode, onNodeSelect, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<NetworkNode, NetworkLink> | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    const container = svg.append('g');

    // Create force simulation
    const simulation = d3.forceSimulation<NetworkNode>(nodes)
      .force('link', d3.forceLink<NetworkNode, NetworkLink>(links)
        .id(d => d.id)
        .distance(d => Math.max(50, 200 - d.collaboration.strength * 150))
        .strength(0.3))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.radius + 10));

    simulationRef.current = simulation;

    // Create links
    const link = container.selectAll('.link')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', d => d.width)
      .attr('stroke-opacity', 0.6)
      .style('cursor', 'pointer');

    // Create nodes
    const node = container.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, NetworkNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Node circles
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('stroke', d => selectedNode === d.id ? '#3b82f6' : '#ffffff')
      .attr('stroke-width', d => selectedNode === d.id ? 3 : 2)
      .attr('opacity', 0.9);

    // Node avatars
    node.append('image')
      .attr('xlink:href', d => d.member.avatar || '')
      .attr('x', d => -d.radius * 0.6)
      .attr('y', d => -d.radius * 0.6)
      .attr('width', d => d.radius * 1.2)
      .attr('height', d => d.radius * 1.2)
      .attr('clip-path', `circle(${d => d.radius * 0.6}px)`);

    // Node labels
    node.append('text')
      .text(d => d.member.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 15)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#1f2937');

    // Online status indicators
    node.append('circle')
      .attr('r', 6)
      .attr('cx', d => d.radius * 0.7)
      .attr('cy', d => -d.radius * 0.7)
      .attr('fill', d => d.member.isOnline ? '#10b981' : '#6b7280')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2);

    // Click handlers
    node.on('click', (event, d) => {
      onNodeSelect(d.id);
    });

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NetworkNode).x!)
        .attr('y1', d => (d.source as NetworkNode).y!)
        .attr('x2', d => (d.target as NetworkNode).x!)
        .attr('y2', d => (d.target as NetworkNode).y!);

      node
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
    });

    function dragstarted(event: any, d: NetworkNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: NetworkNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: NetworkNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links, selectedNode, onNodeSelect, width, height]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg"
    />
  );
};

// Performance Metrics Component
const PerformanceMetrics: React.FC<{
  metrics: PerformanceMetric[];
  selectedMember: string | null;
}> = ({ metrics, selectedMember }) => {
  const selectedMetric = metrics.find(m => m.userId === selectedMember);

  if (!selectedMetric) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Select a team member to view performance metrics
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <MetricGauge
          label="Collaboration Score"
          value={selectedMetric.collaborationScore}
          max={100}
          color="blue"
          icon={<Users className="w-4 h-4" />}
        />
        <MetricGauge
          label="Quality Score"
          value={selectedMetric.qualityScore}
          max={100}
          color="green"
          icon={<Target className="w-4 h-4" />}
        />
        <MetricGauge
          label="Tasks Completed"
          value={selectedMetric.tasksCompleted}
          max={50}
          color="purple"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricGauge
          label="Response Time"
          value={100 - selectedMetric.responseTime}
          max={100}
          color="orange"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Productivity Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-end gap-1">
            {selectedMetric.productivityTrend.map((value, index) => (
              <div
                key={index}
                className="flex-1 bg-blue-200 rounded-t"
                style={{ height: `${value}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Metric Gauge Component
const MetricGauge: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
  icon: React.ReactNode;
}> = ({ label, value, max, color, icon }) => {
  const percentage = (value / max) * 100;
  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {icon}
            {label}
          </div>
          <span className="text-lg font-bold">{value}</span>
        </div>
        <Progress value={percentage} className="h-2" />
      </CardContent>
    </Card>
  );
};

// Member Card Component
const MemberCard: React.FC<{
  member: TeamMember;
  metric: PerformanceMetric;
  isSelected: boolean;
  onClick: () => void;
}> = ({ member, metric, isSelected, onClick }) => {
  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200",
          isSelected && "ring-2 ring-blue-500 shadow-lg"
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="w-10 h-10">
                <AvatarImage src={member.avatar} />
                <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white",
                  member.isOnline ? "bg-green-500" : "bg-gray-400"
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{member.name}</div>
              <div className="text-sm text-muted-foreground">{member.role}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{metric.collaborationScore}</div>
              <div className="text-xs text-muted-foreground">Score</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {metric.tasksCompleted} tasks
            </Badge>
            <Badge variant="outline" className="text-xs">
              {member.department}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

// Filter Controls Component
const FilterControls: React.FC<{
  filters: ActivityFilters;
  onFiltersChange: (filters: ActivityFilters) => void;
}> = ({ filters, onFiltersChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Activity Types</label>
                <Select
                  value={filters.types.join(',')}
                  onValueChange={(value) => onFiltersChange({
                    ...filters,
                    types: value.split(',')
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task,collaboration,communication,review">All</SelectItem>
                    <SelectItem value="task">Tasks</SelectItem>
                    <SelectItem value="collaboration">Collaboration</SelectItem>
                    <SelectItem value="communication">Communication</SelectItem>
                    <SelectItem value="review">Reviews</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Min Collaboration Strength: {filters.minCollaborationStrength}%
                </label>
                <Slider
                  value={[filters.minCollaborationStrength]}
                  onValueChange={([value]) => onFiltersChange({
                    ...filters,
                    minCollaborationStrength: value
                  })}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

// Main Component
const TeamPerformanceMonitor: React.FC<TeamPerformanceMonitorProps> = ({
  teamId,
  timeRange,
  onMemberSelect,
  onActivityFilter,
  className
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActivityFilters>({
    types: ['task', 'collaboration', 'communication', 'review'],
    departments: [],
    dateRange: [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date()],
    minCollaborationStrength: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [networkDimensions, setNetworkDimensions] = useState({ width: 800, height: 600 });

  // Mock data generation
  useEffect(() => {
    const generateMockData = () => {
      const mockMembers: TeamMember[] = Array.from({ length: 8 }, (_, i) => ({
        id: `member-${i}`,
        name: `Team Member ${i + 1}`,
        email: `member${i + 1}@company.com`,
        role: ['Developer', 'Designer', 'Manager', 'Analyst'][i % 4],
        department: ['Engineering', 'Design', 'Product', 'QA'][i % 4],
        isOnline: Math.random() > 0.3,
        lastActive: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      }));

      const mockMetrics: PerformanceMetric[] = mockMembers.map(member => ({
        userId: member.id,
        tasksCompleted: Math.floor(Math.random() * 30) + 5,
        collaborationScore: Math.floor(Math.random() * 40) + 60,
        communicationFrequency: Math.floor(Math.random() * 50) + 20,
        responseTime: Math.floor(Math.random() * 60) + 10,
        qualityScore: Math.floor(Math.random() * 30) + 70,
        productivityTrend: Array.from({ length: 14 }, () => Math.random() * 100)
      }));

      setMembers(mockMembers);
      setMetrics(mockMetrics);
      setIsLoading(false);
    };

    generateMockData();
  }, [teamId, timeRange]);

  // Generate network data
  const networkData = useMemo(() => {
    const nodes: NetworkNode[] = members.map(member => {
      const metric = metrics.find(m => m.userId === member.id)!;
      return {
        id: member.id,
        member,
        metric,
        radius: Math.max(20, Math.min(40, metric.collaborationScore / 2)),
        color: member.isOnline ? '#3b82f6' : '#9ca3af'
      };
    });

    const links: NetworkLink[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.random() > 0.6) {
          const strength = Math.random() * 0.8 + 0.2;
          links.push({
            source: nodes[i],
            target: nodes[j],
            collaboration: {
              source: nodes[i].id,
              target: nodes[j].id,
              strength,
              activities: [],
              lastInteraction: new Date()
            },
            width: Math.max(1, strength * 5)
          });
        }
      }
    }

    return { nodes, links };
  }, [members, metrics]);

  const handleMemberSelect = useCallback((memberId: string) => {
    setSelectedMember(memberId);
    const member = members.find(m => m.id === memberId);
    if (member && onMemberSelect) {
      onMemberSelect(member);
    }
  }, [members, onMemberSelect]);

  const handleFiltersChange = useCallback((newFilters: ActivityFilters) => {
    setFilters(newFilters);
    if (onActivityFilter) {
      onActivityFilter(newFilters);
    }
  }, [onActivityFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Performance Monitor</h2>
          <p className="text-muted-foreground">
            Real-time collaboration and performance insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            {members.filter(m => m.isOnline).length} online
          </Badge>
          <Button variant="outline" size="sm">
            <Maximize2 className="w-4 h-4 mr-2" />
            Fullscreen
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Network Visualization */}
        <div className="col-span-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Collaboration Network
              </CardTitle