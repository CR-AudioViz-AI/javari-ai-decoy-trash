```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { auditLog } from '@/lib/audit/sso-logger';
import { TenantResolver } from '@/lib/sso/tenant-resolver';
import { SAMLHandler } from '@/lib/sso/saml-handler';
import { OAuth2Handler } from '@/lib/sso/oauth2-handler';
import { OIDCHandler } from '@/lib/sso/oidc-handler';
import { UserProvisioning } from '@/lib/sso/user-provisioning';
import { RoleMapper } from '@/lib/sso/role-mapper';
import { SessionManager } from '@/lib/sso/session-manager';
import type { SSOProvider, SSORequest, SSOResponse } from '@/types/sso';

// Validation schemas
const ssoConfigSchema = z.object({
  tenant_id: z.string().uuid(),
  provider_type: z.enum(['saml', 'oauth2', 'oidc']),
  config: z.object({
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    issuer_url: z.string().url().optional(),
    sso_url: z.string().url().optional(),
    x509_cert: z.string().optional(),
    metadata_url: z.string().url().optional(),
    scopes: z.array(z.string()).optional(),
    role_mapping: z.record(z.string()).optional(),
    auto_provision: z.boolean().default(true),
    jit_provisioning: z.boolean().default(true),
  }),
  is_active: z.boolean().default(true),
});

const ssoInitiateSchema = z.object({
  provider_type: z.enum(['saml', 'oauth2', 'oidc']),
  tenant_domain: z.string().min(1),
  redirect_uri: z.string().url().optional(),
  state: z.string().optional(),
});

const ssoCallbackSchema = z.object({
  provider_type: z.enum(['saml', 'oauth2', 'oidc']),
  code: z.string().optional(),
  state: z.string().optional(),
  saml_response: z.string().optional(),
  id_token: z.string().optional(),
  tenant_id: z.string().uuid(),
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize SSO handlers
const tenantResolver = new TenantResolver(supabase);
const samlHandler = new SAMLHandler();
const oauth2Handler = new OAuth2Handler();
const oidcHandler = new OIDCHandler();
const userProvisioning = new UserProvisioning(supabase);
const roleMapper = new RoleMapper(supabase);
const sessionManager = new SessionManager();

/**
 * GET /api/sso - List SSO configurations for tenant
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = request.ip || 'unknown';
  
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'sso_config_read', 100, 60);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    // Extract tenant context from headers or query params
    const tenantDomain = request.nextUrl.searchParams.get('tenant_domain');
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify JWT and extract tenant context
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      await auditLog('sso_access_denied', {
        reason: 'Invalid token',
        ip: clientIP,
        user_agent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve tenant
    const tenant = tenantDomain 
      ? await tenantResolver.resolveTenantByDomain(tenantDomain)
      : await tenantResolver.resolveTenantByUser(user.id);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Check user permissions for tenant
    const hasPermission = await checkTenantPermission(user.id, tenant.id, 'sso:read');
    if (!hasPermission) {
      await auditLog('sso_access_denied', {
        user_id: user.id,
        tenant_id: tenant.id,
        reason: 'Insufficient permissions',
        ip: clientIP,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch SSO configurations
    const { data: ssoConfigs, error: configError } = await supabase
      .from('sso_configurations')
      .select(`
        id,
        provider_type,
        config,
        is_active,
        created_at,
        updated_at
      `)
      .eq('tenant_id', tenant.id)
      .eq('is_deleted', false);

    if (configError) {
      throw new Error(`Database error: ${configError.message}`);
    }

    // Decrypt sensitive configuration data
    const sanitizedConfigs = ssoConfigs?.map(config => ({
      ...config,
      config: sanitizeConfig(config.config, config.provider_type),
    })) || [];

    await auditLog('sso_config_accessed', {
      user_id: user.id,
      tenant_id: tenant.id,
      configs_count: sanitizedConfigs.length,
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      data: sanitizedConfigs,
      meta: {
        tenant_id: tenant.id,
        count: sanitizedConfigs.length,
      },
    });

  } catch (error) {
    console.error('SSO Config GET Error:', error);
    
    await auditLog('sso_config_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso - Create or update SSO configuration
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = request.ip || 'unknown';
  
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'sso_config_write', 10, 60);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = ssoConfigSchema.parse(body);

    // Verify tenant access
    const hasPermission = await checkTenantPermission(
      user.id, 
      validatedData.tenant_id, 
      'sso:write'
    );
    if (!hasPermission) {
      await auditLog('sso_config_denied', {
        user_id: user.id,
        tenant_id: validatedData.tenant_id,
        reason: 'Insufficient permissions',
        ip: clientIP,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Encrypt sensitive configuration data
    const encryptedConfig = await encryptSensitiveConfig(
      validatedData.config,
      validatedData.provider_type
    );

    // Validate provider-specific configuration
    let validationResult;
    switch (validatedData.provider_type) {
      case 'saml':
        validationResult = await samlHandler.validateConfig(validatedData.config);
        break;
      case 'oauth2':
        validationResult = await oauth2Handler.validateConfig(validatedData.config);
        break;
      case 'oidc':
        validationResult = await oidcHandler.validateConfig(validatedData.config);
        break;
      default:
        throw new Error(`Unsupported provider type: ${validatedData.provider_type}`);
    }

    if (!validationResult.valid) {
      return NextResponse.json(
        { 
          error: 'Invalid provider configuration', 
          details: validationResult.errors 
        },
        { status: 400 }
      );
    }

    // Upsert SSO configuration
    const { data: ssoConfig, error: upsertError } = await supabase
      .from('sso_configurations')
      .upsert({
        tenant_id: validatedData.tenant_id,
        provider_type: validatedData.provider_type,
        config: encryptedConfig,
        is_active: validatedData.is_active,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id,provider_type',
      })
      .select()
      .single();

    if (upsertError) {
      throw new Error(`Database error: ${upsertError.message}`);
    }

    // Initialize role mappings if provided
    if (validatedData.config.role_mapping) {
      await roleMapper.updateMappings(
        validatedData.tenant_id,
        validatedData.provider_type,
        validatedData.config.role_mapping
      );
    }

    await auditLog('sso_config_updated', {
      user_id: user.id,
      tenant_id: validatedData.tenant_id,
      provider_type: validatedData.provider_type,
      config_id: ssoConfig.id,
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: ssoConfig.id,
        provider_type: ssoConfig.provider_type,
        is_active: ssoConfig.is_active,
        updated_at: ssoConfig.updated_at,
      },
    });

  } catch (error) {
    console.error('SSO Config POST Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation error', 
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
        },
        { status: 400 }
      );
    }

    await auditLog('sso_config_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sso - Delete SSO configuration
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = request.ip || 'unknown';
  
  try {
    const rateLimitResult = await rateLimit(request, 'sso_config_delete', 5, 60);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const configId = request.nextUrl.searchParams.get('config_id');
    const tenantId = request.nextUrl.searchParams.get('tenant_id');

    if (!configId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing config_id or tenant_id parameter' },
        { status: 400 }
      );
    }

    // Verify tenant access
    const hasPermission = await checkTenantPermission(user.id, tenantId, 'sso:delete');
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete SSO configuration
    const { error: deleteError } = await supabase
      .from('sso_configurations')
      .update({ 
        is_deleted: true, 
        deleted_at: new Date().toISOString() 
      })
      .eq('id', configId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      throw new Error(`Database error: ${deleteError.message}`);
    }

    await auditLog('sso_config_deleted', {
      user_id: user.id,
      tenant_id: tenantId,
      config_id: configId,
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('SSO Config DELETE Error:', error);
    
    await auditLog('sso_config_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'DELETE',
      ip: clientIP,
      response_time: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions
async function checkTenantPermission(
  userId: string, 
  tenantId: string, 
  permission: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenant_users')
    .select(`
      role,
      tenant_roles!inner(permissions)
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (error || !data) return false;

  const permissions = data.tenant_roles?.permissions || [];
  return permissions.includes(permission) || permissions.includes('admin');
}

function sanitizeConfig(config: any, providerType: string): any {
  const sanitized = { ...config };
  
  // Remove sensitive fields from response
  const sensitiveFields = ['client_secret', 'private_key', 'certificate_key'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

async function encryptSensitiveConfig(config: any, providerType: string): Promise<any> {
  const encrypted = { ...config };
  
  const sensitiveFields = ['client_secret', 'private_key', 'certificate_key'];
  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      encrypted[field] = await encrypt(encrypted[field]);
    }
  }

  return encrypted;
}
```