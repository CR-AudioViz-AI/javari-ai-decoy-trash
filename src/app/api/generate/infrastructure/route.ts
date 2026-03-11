```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/middleware/rate-limit';
import { authenticate } from '@/lib/middleware/auth';
import { TerraformGenerator } from '@/lib/generators/terraform-generator';
import { CloudFormationGenerator } from '@/lib/generators/cloudformation-generator';
import { KubernetesGenerator } from '@/lib/generators/kubernetes-generator';
import { InfrastructureValidator } from '@/lib/validators/infrastructure-validator';
import { InfrastructureTemplates } from '@/lib/templates/infrastructure-templates';
import { saveInfrastructureTemplate, getInfrastructureHistory } from '@/lib/supabase/infrastructure-queries';
import type { InfrastructureRequirements, GeneratedInfrastructure } from '@/types/infrastructure';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const infrastructureRequestSchema = z.object({
  provider: z.enum(['aws', 'azure', 'gcp', 'kubernetes']),
  templateType: z.enum(['terraform', 'cloudformation', 'kubernetes']),
  applicationName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/),
  requirements: z.object({
    compute: z.object({
      instances: z.number().min(1).max(100),
      instanceType: z.string().min(1),
      autoScaling: z.boolean().default(false),
      minInstances: z.number().min(1).optional(),
      maxInstances: z.number().min(1).optional()
    }),
    storage: z.object({
      size: z.number().min(1),
      type: z.enum(['standard', 'performance', 'premium']),
      backup: z.boolean().default(true),
      encryption: z.boolean().default(true)
    }),
    network: z.object({
      vpc: z.boolean().default(true),
      subnets: z.number().min(1).max(10),
      loadBalancer: z.boolean().default(false),
      cdn: z.boolean().default(false)
    }),
    database: z.object({
      engine: z.enum(['postgres', 'mysql', 'mongodb', 'none']).default('none'),
      size: z.string().optional(),
      backup: z.boolean().default(true),
      multiAz: z.boolean().default(false)
    }).optional(),
    monitoring: z.object({
      enabled: z.boolean().default(true),
      logging: z.boolean().default(true),
      metrics: z.boolean().default(true),
      alerts: z.boolean().default(false)
    }),
    security: z.object({
      ssl: z.boolean().default(true),
      firewall: z.boolean().default(true),
      secrets: z.boolean().default(true),
      compliance: z.enum(['none', 'sox', 'pci', 'hipaa']).default('none')
    })
  }),
  constraints: z.object({
    budget: z.number().min(0).optional(),
    region: z.string().min(1),
    environment: z.enum(['development', 'staging', 'production']),
    tags: z.record(z.string()).optional()
  }),
  options: z.object({
    bestPractices: z.boolean().default(true),
    costOptimization: z.boolean().default(true),
    securityHardening: z.boolean().default(true),
    includeDocumentation: z.boolean().default(true)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Authenticate user
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request
    const validationResult = infrastructureRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { provider, templateType, applicationName, requirements, constraints, options } = validationResult.data;

    // Initialize validator and generators
    const validator = new InfrastructureValidator();
    const templates = new InfrastructureTemplates();

    // Validate infrastructure requirements
    const validationErrors = await validator.validateRequirements({
      provider,
      requirements,
      constraints
    });

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Infrastructure requirements validation failed',
          validationErrors
        },
        { status: 400 }
      );
    }

    // Generate infrastructure templates
    let generator: TerraformGenerator | CloudFormationGenerator | KubernetesGenerator;
    let generatedInfrastructure: GeneratedInfrastructure;

    switch (templateType) {
      case 'terraform':
        generator = new TerraformGenerator();
        generatedInfrastructure = await generator.generate({
          provider,
          applicationName,
          requirements,
          constraints,
          options: options || {}
        });
        break;
      
      case 'cloudformation':
        if (provider !== 'aws') {
          return NextResponse.json(
            { error: 'CloudFormation templates are only supported for AWS' },
            { status: 400 }
          );
        }
        generator = new CloudFormationGenerator();
        generatedInfrastructure = await generator.generate({
          provider,
          applicationName,
          requirements,
          constraints,
          options: options || {}
        });
        break;
      
      case 'kubernetes':
        generator = new KubernetesGenerator();
        generatedInfrastructure = await generator.generate({
          provider,
          applicationName,
          requirements,
          constraints,
          options: options || {}
        });
        break;
      
      default:
        return NextResponse.json(
          { error: 'Unsupported template type' },
          { status: 400 }
        );
    }

    // Apply best practices enforcement
    if (options?.bestPractices) {
      generatedInfrastructure = await validator.enforceBestPractices(generatedInfrastructure);
    }

    // Apply cost optimization
    if (options?.costOptimization) {
      generatedInfrastructure = await validator.optimizeCosts(generatedInfrastructure, constraints.budget);
    }

    // Apply security hardening
    if (options?.securityHardening) {
      generatedInfrastructure = await validator.hardenSecurity(generatedInfrastructure);
    }

    // Generate documentation if requested
    let documentation: string | undefined;
    if (options?.includeDocumentation) {
      documentation = await templates.generateDocumentation(generatedInfrastructure);
    }

    // Save to Supabase
    const savedTemplate = await saveInfrastructureTemplate(supabase, {
      userId: authResult.user.id,
      applicationName,
      provider,
      templateType,
      requirements,
      constraints,
      generatedInfrastructure,
      documentation,
      createdAt: new Date().toISOString()
    });

    // Generate download URLs for templates
    const downloadUrls = await generateDownloadUrls(generatedInfrastructure, savedTemplate.id);

    // Calculate estimated costs
    const costEstimate = await validator.calculateCosts(generatedInfrastructure, provider);

    // Security scan results
    const securityScan = await validator.scanSecurity(generatedInfrastructure);

    return NextResponse.json({
      success: true,
      data: {
        templateId: savedTemplate.id,
        applicationName,
        provider,
        templateType,
        generatedInfrastructure,
        documentation,
        downloadUrls,
        costEstimate,
        securityScan: {
          score: securityScan.score,
          issues: securityScan.issues,
          recommendations: securityScan.recommendations
        },
        metadata: {
          resourceCount: generatedInfrastructure.resources?.length || 0,
          estimatedDeploymentTime: generatedInfrastructure.estimatedDeploymentTime,
          bestPracticesApplied: options?.bestPractices || false,
          costOptimized: options?.costOptimization || false,
          securityHardened: options?.securityHardening || false
        }
      }
    });

  } catch (error) {
    console.error('Infrastructure generation error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error during infrastructure generation',
        message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Authenticate user
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const provider = searchParams.get('provider');
    const templateType = searchParams.get('templateType');

    // Get user's infrastructure history
    const history = await getInfrastructureHistory(supabase, {
      userId: authResult.user.id,
      page,
      limit,
      provider: provider as any,
      templateType: templateType as any
    });

    return NextResponse.json({
      success: true,
      data: {
        templates: history.data,
        pagination: {
          page,
          limit,
          total: history.count,
          pages: Math.ceil((history.count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Infrastructure history error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error while fetching infrastructure history',
        message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
}

async function generateDownloadUrls(infrastructure: GeneratedInfrastructure, templateId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  return {
    template: `${baseUrl}/api/download/infrastructure/${templateId}/template`,
    documentation: `${baseUrl}/api/download/infrastructure/${templateId}/documentation`,
    archive: `${baseUrl}/api/download/infrastructure/${templateId}/archive`
  };
}

export const runtime = 'nodejs';
export const maxDuration = 60;
```