'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { Star, Download, X, Plus, Filter, Search, TrendingUp, DollarSign, Award, Cpu, Clock, Users } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'react-hot-toast';

/**
 * Agent interface for marketplace agents
 */
interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_model: 'free' | 'subscription' | 'usage' | 'one_time';
  price_amount: number;
  price_currency: string;
  performance_metrics: {
    response_time: number;
    accuracy: number;
    uptime: number;
    throughput: number;
    latency: number;
    error_rate: number;
  };
  capabilities: string[];
  average_rating: number;
  total_ratings: number;
  monthly_usage: number;
  created_at: string;
  updated_at: string;
  provider: string;
  version: string;
  logo_url?: string;
}

/**
 * Rating interface for agent reviews
 */
interface AgentRating {
  id: string;
  agent_id: string;
  user_id: string;
  rating: number;
  review: string;
  created_at: string;
}

/**
 * Comparison filter options
 */
interface ComparisonFilters {
  categories: string[];
  pricingModels: string[];
  minRating: number;
  capabilities: string[];
}

/**
 * Zustand store for comparison state management
 */
interface ComparisonStore {
  selectedAgents: Agent[];
  isSelectionModalOpen: boolean;
  filters: ComparisonFilters;
  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  clearAgents: () => void;
  openSelectionModal: () => void;
  closeSelectionModal: () => void;
  setFilters: (filters: Partial<ComparisonFilters>) => void;
}

const useComparisonStore = create<ComparisonStore>((set, get) => ({
  selectedAgents: [],
  isSelectionModalOpen: false,
  filters: {
    categories: [],
    pricingModels: [],
    minRating: 0,
    capabilities: []
  },
  addAgent: (agent) => {
    const { selectedAgents } = get();
    if (selectedAgents.length >= 5) {
      toast.error('Maximum 5 agents can be compared at once');
      return;
    }
    if (selectedAgents.some(a => a.id === agent.id)) {
      toast.error('Agent is already selected for comparison');
      return;
    }
    set({ selectedAgents: [...selectedAgents, agent] });
  },
  removeAgent: (agentId) => {
    set(state => ({
      selectedAgents: state.selectedAgents.filter(agent => agent.id !== agentId)
    }));
  },
  clearAgents: () => set({ selectedAgents: [] }),
  openSelectionModal: () => set({ isSelectionModalOpen: true }),
  closeSelectionModal: () => set({ isSelectionModalOpen: false }),
  setFilters: (newFilters) => set(state => ({
    filters: { ...state.filters, ...newFilters }
  }))
}));

/**
 * Star rating display component
 */
const RatingStarsDisplay: React.FC<{ rating: number; totalRatings: number }> = ({ 
  rating, 
  totalRatings 
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={`full-${i}`} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
      ))}
      {hasHalfStar && (
        <div className="relative">
          <Star className="w-4 h-4 text-gray-300" />
          <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
          </div>
        </div>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300" />
      ))}
      <span className="ml-2 text-sm text-gray-600">
        {rating.toFixed(1)} ({totalRatings})
      </span>
    </div>
  );
};

/**
 * Agent comparison card component
 */
const AgentComparisonCard: React.FC<{ agent: Agent; onRemove: () => void }> = ({ 
  agent, 
  onRemove 
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 min-w-80">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {agent.logo_url && (
            <img 
              src={agent.logo_url} 
              alt={agent.name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h3 className="font-semibold text-lg">{agent.name}</h3>
            <p className="text-sm text-gray-600">{agent.provider}</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-gray-600 text-sm mb-4 line-clamp-3">{agent.description}</p>

      <div className="space-y-4">
        <div>
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
            {agent.category}
          </span>
        </div>

        <RatingStarsDisplay 
          rating={agent.average_rating} 
          totalRatings={agent.total_ratings}
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Price:</span>
          <span className="font-semibold">
            {agent.pricing_model === 'free' ? 'Free' : 
             `${agent.price_currency} ${agent.price_amount}`}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Monthly Usage:</span>
          <span className="font-semibold">{agent.monthly_usage.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Performance chart component
 */
const PerformanceChart: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  const performanceData = useMemo(() => {
    return [
      {
        metric: 'Response Time',
        ...agents.reduce((acc, agent, index) => ({
          ...acc,
          [`agent${index + 1}`]: agent.performance_metrics.response_time
        }), {})
      },
      {
        metric: 'Accuracy',
        ...agents.reduce((acc, agent, index) => ({
          ...acc,
          [`agent${index + 1}`]: agent.performance_metrics.accuracy
        }), {})
      },
      {
        metric: 'Uptime',
        ...agents.reduce((acc, agent, index) => ({
          ...acc,
          [`agent${index + 1}`]: agent.performance_metrics.uptime
        }), {})
      },
      {
        metric: 'Throughput',
        ...agents.reduce((acc, agent, index) => ({
          ...acc,
          [`agent${index + 1}`]: agent.performance_metrics.throughput
        }), {})
      }
    ];
  }, [agents]);

  const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Performance Comparison</h3>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={performanceData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" />
          <PolarRadiusAxis />
          {agents.map((agent, index) => (
            <Radar
              key={agent.id}
              name={agent.name}
              dataKey={`agent${index + 1}`}
              stroke={colors[index]}
              fill={colors[index]}
              fillOpacity={0.1}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Capability matrix component
 */
const CapabilityMatrix: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  const allCapabilities = useMemo(() => {
    const capabilities = new Set<string>();
    agents.forEach(agent => {
      agent.capabilities.forEach(cap => capabilities.add(cap));
    });
    return Array.from(capabilities).sort();
  }, [agents]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Capability Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left p-3 border-b">Capability</th>
              {agents.map(agent => (
                <th key={agent.id} className="text-center p-3 border-b min-w-32">
                  {agent.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allCapabilities.map(capability => (
              <tr key={capability} className="border-b">
                <td className="p-3 font-medium">{capability}</td>
                {agents.map(agent => (
                  <td key={agent.id} className="p-3 text-center">
                    {agent.capabilities.includes(capability) ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-gray-300">✗</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Pricing comparison table component
 */
const PricingComparisonTable: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Pricing Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left p-3 border-b">Agent</th>
              <th className="text-center p-3 border-b">Model</th>
              <th className="text-center p-3 border-b">Price</th>
              <th className="text-center p-3 border-b">Currency</th>
              <th className="text-center p-3 border-b">Monthly Usage</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className="border-b">
                <td className="p-3 font-medium">{agent.name}</td>
                <td className="p-3 text-center capitalize">{agent.pricing_model}</td>
                <td className="p-3 text-center">
                  {agent.pricing_model === 'free' ? 'Free' : agent.price_amount}
                </td>
                <td className="p-3 text-center">{agent.price_currency}</td>
                <td className="p-3 text-center">{agent.monthly_usage.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Agent selection modal component
 */
const AgentSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent: (agent: Agent) => void;
}> = ({ isOpen, onClose, onSelectAgent }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { filters, setFilters } = useComparisonStore();
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      fetchAgents();
    }
  }, [isOpen, filters]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('agents')
        .select(`
          *,
          agent_ratings(rating)
        `)
        .gte('average_rating', filters.minRating);

      if (filters.categories.length > 0) {
        query = query.in('category', filters.categories);
      }

      if (filters.pricingModels.length > 0) {
        query = query.in('pricing_model', filters.pricingModels);
      }

      const { data, error } = await query;

      if (error) throw error;

      const processedAgents = data?.map(agent => ({
        ...agent,
        capabilities: agent.capabilities || [],
        performance_metrics: agent.performance_metrics || {
          response_time: 0,
          accuracy: 0,
          uptime: 0,
          throughput: 0,
          latency: 0,
          error_rate: 0
        }
      })) || [];

      setAgents(processedAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  const filteredAgents = useMemo(() => {
    return agents.filter(agent =>
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [agents, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Select Agents to Compare</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAgents.map(agent => (
              <div key={agent.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  {agent.logo_url && (
                    <img 
                      src={agent.logo_url} 
                      alt={agent.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{agent.name}</h3>
                    <p className="text-sm text-gray-600">{agent.provider}</p>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {agent.description}
                </p>

                <div className="flex items-center justify-between">
                  <RatingStarsDisplay 
                    rating={agent.average_rating} 
                    totalRatings={agent.total_ratings}
                  />
                  <button
                    onClick={() => {
                      onSelectAgent(agent);
                      onClose();
                    }}
                    className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Comparison export button component
 */
const ComparisonExportButton: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text('AI Agent Comparison Report', 20, 20);
      
      // Date
      doc.setFontSize(12);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
      
      // Agent overview table
      const overviewData = agents.map(agent => [
        agent.name,
        agent.category,
        agent.pricing_model,
        `${agent.price_currency} ${agent.price_amount}`,
        agent.average_rating.toFixed(1)
      ]);

      autoTable(doc, {
        head: [['Agent', 'Category', 'Pricing', 'Price', 'Rating']],
        body: overviewData,
        startY: 40,
      });

      // Performance metrics table
      const performanceData = agents.map(agent => [
        agent.name,
        `${agent.performance_metrics.response_time}ms`,
        `${agent.performance_metrics.accuracy}%`,
        `${agent.performance_metrics.uptime}%`,
        agent.performance_metrics.throughput.toString()
      ]);

      autoTable(doc, {
        head: [['Agent', 'Response Time', 'Accuracy', 'Uptime', 'Throughput']],
        body: performanceData,
        startY: (doc as any).lastAutoTable.finalY + 10,
      });

      // Capabilities matrix
      const allCapabilities = Array.from(new Set(
        agents.flatMap(agent => agent.capabilities)
      )).sort();

      if (allCapabilities.length > 0) {
        const capabilityData = allCapabilities.map(capability => [
          capability,
          ...agents.map(agent => 
            agent.capabilities.includes(capability) ? '✓' : '✗'
          )
        ]);

        autoTable(doc, {
          head: [['Capability', ...agents.map(agent => agent.name)]],
          body: capabilityData,
          startY: (doc as any).lastAutoTable.finalY + 10,
        });
      }

      doc.save('agent-comparison-report.pdf');
      toast.success('PDF report generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report');
    }
  };

  return (
    <button
      onClick={exportToPDF}
      disabled={agents.length === 0}
      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4" />
      Export to PDF
    </button>
  );
};

/**
 * Comparison metrics panel component
 */
const ComparisonMetricsPanel: React.FC<{ agents: Agent[] }> = ({ agents }) => {
  const metrics = useMemo(() => {
    if (agents.length === 0) return [];

    const avgMetrics = {
      responseTime: agents.reduce((sum, agent) => sum + agent.performance_metrics.response_time, 0) / agents.length,
      accuracy: agents.reduce((sum, agent) => sum + agent.performance_metrics.accuracy, 0) / agents.length,
      uptime: agents.reduce((sum, agent) => sum + agent.performance_metrics.uptime, 0) / agents.length,
      rating: agents.reduce((sum, agent) => sum + agent.average_rating, 0) / agents.length,
      usage: agents.reduce((sum, agent) => sum + agent.monthly_usage, 0),
    };

    return [
      { label: 'Avg Response Time', value: `${avgMetrics.responseTime.toFixed(0)}ms`, icon: Clock },
      { label: 'Avg Accuracy', value: `