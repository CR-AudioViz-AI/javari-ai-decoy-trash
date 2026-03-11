```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { headers } from 'next/headers';

// Types and interfaces
interface Region {
  id: string;
  name: string;
  location: string;
  endpoint: string;
  availabilityZones: string[];
  complianceCertifications: string[];
  baseCostPerHour: number;
  currentLoad: number;
  maxCapacity: number;
  avgLatency: number;
  status: 'active' | 'degraded' | 'maintenance';
}

interface WorkloadRequirements {
  computeUnits: number;
  memoryGb: number;
  storageGb: number;
  estimatedDurationHours: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dataResidencyRegions?: string[];
  complianceRequirements?: string[];
  maxLatencyMs?: number;
  budgetLimit?: number;
}

interface RegionScore {
  regionId: string;
  totalScore: number;
  latencyScore: number;
  costScore: number;
  resourceScore: number;
  complianceScore: number;
  breakdown: {
    latency: number;
    cost: number;
    availability: number;
    compliance: boolean;
  };
}

interface WorkloadDistribution {
  primary: {
    regionId: string;
    allocation: number;
  };
  secondary?: {
    regionId: string;
    allocation: number;
  };
  estimatedCost: number;
  estimatedLatency: number;
  complianceStatus: 'compliant' | 'partial' | 'non-compliant';
  distributionId: string;
}

// Validation schemas
const WorkloadRequestSchema = z.object({
  workloadId: z.string().min(1).max(100),
  requirements: z.object({
    computeUnits: z.number().min(0.1).max(1000),
    memoryGb: z.number().min(0.5).max(512),
    storageGb: z.number().min(1).max(10000),
    estimatedDurationHours: z.number().min(0.1).max(168),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    dataResidencyRegions: z.array(z.string()).optional(),
    complianceRequirements: z.array(z.string()).optional(),
    maxLatencyMs: z.number().min(1).max(5000).optional(),
    budgetLimit: z.number().min(0).optional()
  }),
  metadata: z.object({
    userId: z.string(),
    projectId: z.string(),
    tags: z.array(z.string()).optional()
  }).optional()
});

class RegionSelector {
  private regions: Region[] = [];
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  async initialize() {
    try {
      const { data: regions, error } = await this.supabase
        .from('regions')
        .select('*')
        .eq('status', 'active');

      if (error) throw error;
      this.regions = regions || [];
    } catch (error) {
      console.error('Failed to initialize regions:', error);
      // Fallback to default regions
      this.regions = this.getDefaultRegions();
    }
  }

  private getDefaultRegions(): Region[] {
    return [
      {
        id: 'us-east-1',
        name: 'US East (Virginia)',
        location: 'Virginia, USA',
        endpoint: 'https://us-east-1.api.example.com',
        availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
        complianceCertifications: ['SOC2', 'GDPR', 'HIPAA'],
        baseCostPerHour: 0.10,
        currentLoad: 65,
        maxCapacity: 1000,
        avgLatency: 45,
        status: 'active'
      },
      {
        id: 'eu-west-1',
        name: 'EU West (Ireland)',
        location: 'Dublin, Ireland',
        endpoint: 'https://eu-west-1.api.example.com',
        availabilityZones: ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
        complianceCertifications: ['SOC2', 'GDPR'],
        baseCostPerHour: 0.12,
        currentLoad: 45,
        maxCapacity: 800,
        avgLatency: 85,
        status: 'active'
      },
      {
        id: 'ap-southeast-1',
        name: 'Asia Pacific (Singapore)',
        location: 'Singapore',
        endpoint: 'https://ap-southeast-1.api.example.com',
        availabilityZones: ['ap-southeast-1a', 'ap-southeast-1b'],
        complianceCertifications: ['SOC2'],
        baseCostPerHour: 0.08,
        currentLoad: 30,
        maxCapacity: 600,
        avgLatency: 120,
        status: 'active'
      }
    ];
  }

  getAvailableRegions(): Region[] {
    return this.regions.filter(region => region.status === 'active');
  }
}

class WorkloadAnalyzer {
  analyzeComplexity(requirements: WorkloadRequirements): {
    complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
    parallelizable: boolean;
    resourceIntensity: number;
  } {
    const { computeUnits, memoryGb, estimatedDurationHours } = requirements;
    
    let complexity: 'simple' | 'moderate' | 'complex' | 'enterprise' = 'simple';
    let resourceIntensity = 0;
    
    // Calculate resource intensity (0-1 scale)
    resourceIntensity = Math.min(
      (computeUnits / 100 + memoryGb / 64 + estimatedDurationHours / 24) / 3,
      1
    );
    
    if (resourceIntensity > 0.8) complexity = 'enterprise';
    else if (resourceIntensity > 0.6) complexity = 'complex';
    else if (resourceIntensity > 0.3) complexity = 'moderate';
    
    const parallelizable = computeUnits > 4 && estimatedDurationHours > 2;
    
    return { complexity, parallelizable, resourceIntensity };
  }
}

class CostCalculator {
  calculateRegionalCost(
    requirements: WorkloadRequirements,
    region: Region
  ): number {
    const { computeUnits, memoryGb, storageGb, estimatedDurationHours } = requirements;
    
    const computeCost = computeUnits * region.baseCostPerHour * estimatedDurationHours;
    const memoryCost = memoryGb * 0.02 * estimatedDurationHours;
    const storageCost = storageGb * 0.001 * estimatedDurationHours;
    
    // Apply load-based multiplier
    const loadMultiplier = 1 + (region.currentLoad / region.maxCapacity) * 0.5;
    
    return (computeCost + memoryCost + storageCost) * loadMultiplier;
  }
  
  calculateCostScore(cost: number, budgetLimit?: number): number {
    if (!budgetLimit) return Math.max(0, 100 - cost * 10);
    
    const utilizationRatio = cost / budgetLimit;
    return Math.max(0, 100 * (2 - utilizationRatio));
  }
}

class ComplianceValidator {
  validateCompliance(
    requirements: WorkloadRequirements,
    region: Region
  ): {
    compliant: boolean;
    score: number;
    missingCertifications: string[];
  } {
    const requiredCompliance = requirements.complianceRequirements || [];
    const dataResidency = requirements.dataResidencyRegions || [];
    
    // Check data residency
    if (dataResidency.length > 0 && !dataResidency.includes(region.id)) {
      return {
        compliant: false,
        score: 0,
        missingCertifications: ['Data Residency']
      };
    }
    
    // Check compliance certifications
    const missingCertifications = requiredCompliance.filter(
      cert => !region.complianceCertifications.includes(cert)
    );
    
    const compliant = missingCertifications.length === 0;
    const score = compliant ? 100 : 
      Math.max(0, 100 - (missingCertifications.length / requiredCompliance.length) * 100);
    
    return { compliant, score, missingCertifications };
  }
}

class ResourceMonitor {
  calculateResourceScore(requirements: WorkloadRequirements, region: Region): number {
    const requiredCapacity = requirements.computeUnits;
    const availableCapacity = region.maxCapacity - region.currentLoad;
    
    if (availableCapacity < requiredCapacity) return 0;
    
    const utilizationRatio = requiredCapacity / availableCapacity;
    return Math.max(0, 100 * (1 - utilizationRatio));
  }
  
  async updateRegionMetrics(regionId: string) {
    // In production, this would fetch real-time metrics
    // For now, simulate some variance
    const variance = (Math.random() - 0.5) * 0.1;
    return {
      currentLoad: Math.max(0, 50 + variance * 100),
      avgLatency: Math.max(1, 50 + variance * 100)
    };
  }
}

class LatencyTracker {
  calculateLatencyScore(latency: number, maxLatency?: number): number {
    if (maxLatency && latency > maxLatency) return 0;
    
    // Score based on latency (lower is better)
    return Math.max(0, 100 - latency / 2);
  }
  
  async measureLatency(region: Region, clientIp?: string): Promise<number> {
    try {
      const start = Date.now();
      // Simulate latency measurement
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      const end = Date.now();
      
      return end - start + region.avgLatency;
    } catch (error) {
      return region.avgLatency * 1.5; // Penalty for unreachable regions
    }
  }
}

class LoadBalancer {
  calculateOptimalDistribution(
    requirements: WorkloadRequirements,
    regionScores: RegionScore[]
  ): WorkloadDistribution {
    const sortedRegions = regionScores
      .filter(score => score.complianceScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore);
    
    if (sortedRegions.length === 0) {
      throw new Error('No compliant regions available');
    }
    
    const primary = sortedRegions[0];
    const secondary = sortedRegions.length > 1 ? sortedRegions[1] : undefined;
    
    // For high-availability workloads, split between regions
    const isHighAvailability = requirements.priority === 'critical';
    const primaryAllocation = isHighAvailability && secondary ? 70 : 100;
    const secondaryAllocation = isHighAvailability && secondary ? 30 : 0;
    
    const distributionId = `dist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      primary: {
        regionId: primary.regionId,
        allocation: primaryAllocation
      },
      secondary: secondary ? {
        regionId: secondary.regionId,
        allocation: secondaryAllocation
      } : undefined,
      estimatedCost: primary.breakdown.cost,
      estimatedLatency: primary.breakdown.latency,
      complianceStatus: primary.breakdown.compliance ? 'compliant' : 'non-compliant',
      distributionId
    };
  }
}

// Main API handler
export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate request
    const body = await request.json();
    const validationResult = WorkloadRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request format',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { workloadId, requirements, metadata } = validationResult.data;
    
    // Get client IP for latency measurement
    const headersList = headers();
    const clientIp = headersList.get('x-forwarded-for') || 
                     headersList.get('x-real-ip') || 
                     '127.0.0.1';

    // Initialize components
    const regionSelector = new RegionSelector(supabase);
    await regionSelector.initialize();
    
    const workloadAnalyzer = new WorkloadAnalyzer();
    const costCalculator = new CostCalculator();
    const complianceValidator = new ComplianceValidator();
    const resourceMonitor = new ResourceMonitor();
    const latencyTracker = new LatencyTracker();
    const loadBalancer = new LoadBalancer();

    // Analyze workload
    const workloadAnalysis = workloadAnalyzer.analyzeComplexity(requirements);
    const availableRegions = regionSelector.getAvailableRegions();

    if (availableRegions.length === 0) {
      return NextResponse.json(
        { error: 'No regions available for workload distribution' },
        { status: 503 }
      );
    }

    // Score each region
    const regionScores: RegionScore[] = [];

    for (const region of availableRegions) {
      // Calculate individual scores
      const latency = await latencyTracker.measureLatency(region, clientIp);
      const cost = costCalculator.calculateRegionalCost(requirements, region);
      
      const latencyScore = latencyTracker.calculateLatencyScore(
        latency, 
        requirements.maxLatencyMs
      );
      const costScore = costCalculator.calculateCostScore(
        cost, 
        requirements.budgetLimit
      );
      const resourceScore = resourceMonitor.calculateResourceScore(requirements, region);
      
      const compliance = complianceValidator.validateCompliance(requirements, region);
      const complianceScore = compliance.score;

      // Weighted total score (latency: 30%, cost: 25%, resources: 25%, compliance: 20%)
      const totalScore = (
        latencyScore * 0.30 +
        costScore * 0.25 +
        resourceScore * 0.25 +
        complianceScore * 0.20
      );

      regionScores.push({
        regionId: region.id,
        totalScore,
        latencyScore,
        costScore,
        resourceScore,
        complianceScore,
        breakdown: {
          latency,
          cost,
          availability: resourceScore,
          compliance: compliance.compliant
        }
      });
    }

    // Calculate optimal distribution
    const distribution = loadBalancer.calculateOptimalDistribution(requirements, regionScores);

    // Log the distribution decision
    await supabase.from('workload_distributions').insert({
      workload_id: workloadId,
      distribution_id: distribution.distributionId,
      user_id: metadata?.userId,
      project_id: metadata?.projectId,
      requirements,
      distribution_plan: distribution,
      region_scores: regionScores,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      distribution,
      analysis: {
        workloadComplexity: workloadAnalysis,
        regionsEvaluated: regionScores.length,
        topRegions: regionScores
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 3)
          .map(score => ({
            regionId: score.regionId,
            score: Math.round(score.totalScore),
            latency: score.breakdown.latency,
            cost: score.breakdown.cost
          }))
      },
      metadata: {
        distributionId: distribution.distributionId,
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    });

  } catch (error) {
    console.error('Workload distribution error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to distribute workload',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const distributionId = searchParams.get('distributionId');

    if (!distributionId) {
      return NextResponse.json(
        { error: 'Distribution ID required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('workload_distributions')
      .select('*')
      .eq('distribution_id', distributionId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Distribution not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      distribution: data
    });

  } catch (error) {
    console.error('Failed to fetch distribution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch distribution' },
      { status: 500 }
    );
  }
}
```