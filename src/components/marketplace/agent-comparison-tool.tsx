```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Search,
  Plus,
  X,
  Star,
  DollarSign,
  Zap,
  Users,
  TrendingUp,
  Filter,
  Compare,
  Download,
  Share2,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  developer: string;
  avatar_url?: string;
  pricing_model: "free" | "freemium" | "subscription" | "usage-based";
  base_price?: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface AgentMetric {
  id: string;
  agent_id: string;
  metric_name: string;
  value: number;
  unit: string;
  category: string;
  updated_at: string;
}

interface AgentFeature {
  id: string;
  agent_id: string;
  feature_name: string;
  available: boolean;
  tier?: string;
  description?: string;
}

interface Review {
  id: string;
  agent_id: string;
  rating: number;
  title: string;
  content: string;
  user_name: string;
  created_at: string;
  verified: boolean;
}

interface AgentComparisonData {
  agent: Agent;
  metrics: AgentMetric[];
  features: AgentFeature[];
  reviews: Review[];
  avgRating: number;
  totalReviews: number;
}

interface AgentComparisonToolProps {
  selectedAgentIds?: string[];
  onSelectionChange?: (agentIds: string[]) => void;
  maxAgents?: number;
  categories?: string[];
  className?: string;
}

interface FilterState {
  category: string;
  pricingModel: string;
  minRating: number;
  features: string[];
  searchQuery: string;
}

export default function AgentComparisonTool({
  selectedAgentIds = [],
  onSelectionChange,
  maxAgents = 4,
  categories = [],
  className = "",
}: AgentComparisonToolProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  // State management
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedAgentIds);
  const [filters, setFilters] = useState<FilterState>({
    category: "all",
    pricingModel: "all",
    minRating: 0,
    features: [],
    searchQuery: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Sync with URL params
  useEffect(() => {
    const urlAgentIds = searchParams.get("agents")?.split(",") || [];
    if (urlAgentIds.length > 0 && urlAgentIds !== selectedIds) {
      setSelectedIds(urlAgentIds.slice(0, maxAgents));
    }
  }, [searchParams, maxAgents]);

  // Update URL when selection changes
  useEffect(() => {
    if (selectedIds.length > 0) {
      const params = new URLSearchParams(searchParams);
      params.set("agents", selectedIds.join(","));
      router.push(`?${params.toString()}`, { scroll: false });
    }
    onSelectionChange?.(selectedIds);
  }, [selectedIds, onSelectionChange, router, searchParams]);

  // Fetch available agents for selection
  const {
    data: availableAgents = [],
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: ["agents", filters],
    queryFn: async () => {
      let query = supabase
        .from("agents")
        .select("*")
        .eq("status", "active")
        .order("name");

      if (filters.category !== "all") {
        query = query.eq("category", filters.category);
      }

      if (filters.pricingModel !== "all") {
        query = query.eq("pricing_model", filters.pricingModel);
      }

      if (filters.searchQuery) {
        query = query.or(
          `name.ilike.%${filters.searchQuery}%,description.ilike.%${filters.searchQuery}%,developer.ilike.%${filters.searchQuery}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by rating if needed
      if (filters.minRating > 0) {
        const agentsWithRatings = await Promise.all(
          data.map(async (agent) => {
            const { data: reviews } = await supabase
              .from("reviews")
              .select("rating")
              .eq("agent_id", agent.id);

            const avgRating = reviews?.length
              ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
              : 0;

            return { ...agent, avgRating };
          })
        );

        return agentsWithRatings.filter((agent) => agent.avgRating >= filters.minRating);
      }

      return data;
    },
  });

  // Fetch detailed comparison data for selected agents
  const {
    data: comparisonData = [],
    isLoading: comparisonLoading,
    error: comparisonError,
  } = useQuery({
    queryKey: ["comparison", selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];

      const results: AgentComparisonData[] = [];

      for (const agentId of selectedIds) {
        // Fetch agent details
        const { data: agent } = await supabase
          .from("agents")
          .select("*")
          .eq("id", agentId)
          .single();

        if (!agent) continue;

        // Fetch metrics
        const { data: metrics = [] } = await supabase
          .from("agent_metrics")
          .select("*")
          .eq("agent_id", agentId)
          .order("metric_name");

        // Fetch features
        const { data: features = [] } = await supabase
          .from("agent_features")
          .select("*")
          .eq("agent_id", agentId)
          .order("feature_name");

        // Fetch reviews
        const { data: reviews = [] } = await supabase
          .from("reviews")
          .select("*")
          .eq("agent_id", agentId)
          .order("created_at", { ascending: false })
          .limit(100);

        const avgRating = reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

        results.push({
          agent,
          metrics,
          features,
          reviews,
          avgRating,
          totalReviews: reviews.length,
        });
      }

      return results;
    },
    enabled: selectedIds.length > 0,
  });

  // Get unique categories and features for filtering
  const uniqueCategories = useMemo(() => {
    const cats = new Set(availableAgents.map((agent) => agent.category));
    return Array.from(cats);
  }, [availableAgents]);

  const uniquePricingModels = useMemo(() => {
    const models = new Set(availableAgents.map((agent) => agent.pricing_model));
    return Array.from(models);
  }, [availableAgents]);

  // Handlers
  const handleAgentSelect = (agentId: string) => {
    if (selectedIds.includes(agentId)) {
      setSelectedIds(selectedIds.filter((id) => id !== agentId));
    } else if (selectedIds.length < maxAgents) {
      setSelectedIds([...selectedIds, agentId]);
    }
  };

  const handleRemoveAgent = (agentId: string) => {
    setSelectedIds(selectedIds.filter((id) => id !== agentId));
  };

  const handleClearAll = () => {
    setSelectedIds([]);
  };

  const handleExport = () => {
    // Export comparison data as CSV or JSON
    const dataToExport = comparisonData.map((data) => ({
      name: data.agent.name,
      category: data.agent.category,
      developer: data.agent.developer,
      pricing: data.agent.pricing_model,
      rating: data.avgRating.toFixed(1),
      reviews: data.totalReviews,
      features: data.features.filter((f) => f.available).length,
    }));

    const csv = [
      Object.keys(dataToExport[0] || {}).join(","),
      ...dataToExport.map((row) => Object.values(row).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-comparison.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Agent Comparison",
        text: `Comparing ${comparisonData.length} AI agents`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // Prepare chart data
  const performanceChartData = useMemo(() => {
    return comparisonData.map((data) => {
      const metrics = data.metrics.reduce((acc, metric) => {
        acc[metric.metric_name] = metric.value;
        return acc;
      }, {} as Record<string, number>);

      return {
        name: data.agent.name,
        rating: data.avgRating,
        ...metrics,
      };
    });
  }, [comparisonData]);

  const radarChartData = useMemo(() => {
    const metricNames = Array.from(
      new Set(comparisonData.flatMap((data) => data.metrics.map((m) => m.metric_name)))
    );

    return metricNames.map((metricName) => {
      const dataPoint: Record<string, any> = { metric: metricName };
      
      comparisonData.forEach((data) => {
        const metric = data.metrics.find((m) => m.metric_name === metricName);
        dataPoint[data.agent.name] = metric?.value || 0;
      });

      return dataPoint;
    });
  }, [comparisonData]);

  if (agentsError || comparisonError) {
    return (
      <Card className={`w-full ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            Error loading comparison data. Please try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`w-full space-y-6 ${className}`}>
      {/* Header and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Compare className="h-5 w-5" />
                Agent Comparison Tool
              </CardTitle>
              <CardDescription>
                Compare up to {maxAgents} agents side by side. {selectedIds.length}/{maxAgents} selected.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearAll}>
                    Clear All
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        {showFilters && (
          <CardContent className="border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <Input
                  placeholder="Search agents..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters({ ...filters, searchQuery: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={filters.category}
                  onValueChange={(value) =>
                    setFilters({ ...filters, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {uniqueCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Pricing Model</label>
                <Select
                  value={filters.pricingModel}
                  onValueChange={(value) =>
                    setFilters({ ...filters, pricingModel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Models</SelectItem>
                    {uniquePricingModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model.charAt(0).toUpperCase() + model.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum Rating</label>
                <Select
                  value={filters.minRating.toString()}
                  onValueChange={(value) =>
                    setFilters({ ...filters, minRating: parseFloat(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any Rating</SelectItem>
                    <SelectItem value="3">3+ Stars</SelectItem>
                    <SelectItem value="4">4+ Stars</SelectItem>
                    <SelectItem value="4.5">4.5+ Stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Agent Selection */}
      {selectedIds.length < maxAgents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Agents to Compare</CardTitle>
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              <div className="text-center py-4">Loading agents...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableAgents
                  .filter((agent) => !selectedIds.includes(agent.id))
                  .slice(0, 12)
                  .map((agent) => (
                    <Card
                      key={agent.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleAgentSelect(agent.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {agent.avatar_url && (
                            <img
                              src={agent.avatar_url}
                              alt={agent.name}
                              className="w-10 h-10 rounded-full"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{agent.name}</h4>
                            <p className="text-sm text-muted-foreground truncate">
                              {agent.developer}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {agent.category}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {agent.pricing_model}
                              </Badge>
                            </div>
                          </div>
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comparison Results */}
      {selectedIds.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Comparison Results</CardTitle>
              <Badge variant="secondary">{selectedIds.length} agents</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {comparisonLoading ? (
              <div className="text-center py-8">Loading comparison data...</div>
            ) : comparisonData.length > 0 ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Agent</TableHead>
                          {comparisonData.map((data) => (
                            <TableHead key={data.agent.id} className="text-center min-w-48">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{data.agent.name}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveAgent(data.agent.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Badge variant="secondary">{data.agent.category}</Badge>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Developer</TableCell>
                          {comparisonData.map((data) => (
                            <TableCell key={data.agent.id} className="text-center">
                              {data.agent.developer}
                            </TableCell>
                          ))}
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Rating</TableCell>
                          {comparisonData.map((data) => (
                            <TableCell key={data.agent.id} className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span>{data.avgRating.toFixed(1)}</span>
                                <span className="text-muted-foreground text-sm">
                                  ({data.totalReviews})
                                </span>
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Description</TableCell>
                          {comparisonData.map((data) => (
                            <TableCell key={data.agent.id} className="text-center">
                              <p className="text-sm text-muted-foreground line-clamp-3">
                                {data.agent.description}
                              </p>
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="features" className="space-y-6">
                  {/* Feature Matrix */}
                  <div className="space-y-4">
                    {Array.from(
                      new Set(
                        comparisonData.flatMap((data) =>
                          data.features.map((f) => f.feature_name)
                        )
                      )
                    ).map