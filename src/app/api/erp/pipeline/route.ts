```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { z } from 'zod';

// Environment variables validation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

// Types and Schemas
interface ERPConfig {
  id: string;
  type: 'SAP' | 'Oracle' | 'NetSuite' | 'Dynamics';
  endpoint: string;
  credentials: Record<string, any>;
  modules: string[];
  extractionRules: Record<string, any>;
}

interface AuditEvent {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  metadata: Record<string, any>;
  ip_address: string;
  user_agent: string;
  timestamp: string;
  correlation_id: string;
}

const ExtractionRequestSchema = z.object({
  erp_config_id: z.string().uuid(),
  modules: z.array(z.string()).min(1).max(10),
  date_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }),
  filters: z.record(z.any()).optional(),
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  encryption_required: z.boolean().default(true)
});

const ConfigCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['SAP', 'Oracle', 'NetSuite', 'Dynamics']),
  endpoint: z.string().url(),
  auth_config: z.object({
    type: z.enum(['oauth2', 'saml', 'basic', 'api_key']),
    credentials: z.record(z.string())
  }),
  modules: z.array(z.string()).min(1),
  extraction_rules: z.record(z.any()),
  is_active: z.boolean().default(true)
});

// Security and Rate Limiting
class SecurityValidator {
  static validateApiKey(apiKey: string): boolean {
    return apiKey && apiKey.startsWith('crav_') && apiKey.length === 64;
  }

  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input.replace(/[<>'"]/g, '');
    }
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    return input;
  }
}

class RateLimiter {
  static async checkLimit(userId: string, endpoint: string): Promise<boolean> {
    const key = `rate_limit:${userId}:${endpoint}`;
    const current = await redis.get(key) as number || 0;
    const limit = 100; // requests per hour
    
    if (current >= limit) {
      return false;
    }
    
    await redis.setex(key, 3600, current + 1);
    return true;
  }
}

class EncryptionService {
  private static key = crypto.scryptSync(process.env.ENCRYPTION_SECRET!, 'salt', 32);

  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.key);
    cipher.setAAD(Buffer.from('CR AudioViz AI'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedData: string): string {
    const [ivHex, tagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-gcm', this.key);
    decipher.setAAD(Buffer.from('CR AudioViz AI'));
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

class AuditLogger {
  static async log(event: Partial<AuditEvent>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      user_id: event.user_id!,
      action: event.action!,
      resource: event.resource!,
      metadata: event.metadata || {},
      ip_address: event.ip_address!,
      user_agent: event.user_agent!,
      timestamp: new Date().toISOString(),
      correlation_id: event.correlation_id || crypto.randomUUID()
    };

    await supabase
      .from('audit_logs')
      .insert(auditEvent);
  }
}

class ERPConnectionManager {
  static async validateConnection(config: ERPConfig): Promise<boolean> {
    try {
      // Basic endpoint validation
      const response = await fetch(`${config.endpoint}/api/health`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'User-Agent': 'CR-AudioViz-AI/1.0'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  static async getConfig(configId: string, userId: string): Promise<ERPConfig | null> {
    const { data, error } = await supabase
      .from('erp_configurations')
      .select('*')
      .eq('id', configId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      type: data.type,
      endpoint: data.endpoint,
      credentials: JSON.parse(EncryptionService.decrypt(data.encrypted_credentials)),
      modules: data.modules,
      extractionRules: data.extraction_rules
    };
  }
}

class DataExtractionEngine {
  static async extractData(config: ERPConfig, request: z.infer<typeof ExtractionRequestSchema>): Promise<any> {
    const adapter = this.getAdapter(config.type);
    
    try {
      const rawData = await adapter.extract(config, request);
      return this.transformData(rawData, request.format);
    } catch (error) {
      throw new Error(`Data extraction failed: ${error}`);
    }
  }

  private static getAdapter(erpType: string) {
    switch (erpType) {
      case 'SAP':
        return new SAPAdapter();
      case 'Oracle':
        return new OracleAdapter();
      case 'NetSuite':
        return new NetSuiteAdapter();
      case 'Dynamics':
        return new DynamicsAdapter();
      default:
        throw new Error(`Unsupported ERP type: ${erpType}`);
    }
  }

  private static transformData(data: any, format: string): any {
    switch (format) {
      case 'json':
        return data;
      case 'csv':
        return this.jsonToCsv(data);
      case 'xml':
        return this.jsonToXml(data);
      default:
        return data;
    }
  }

  private static jsonToCsv(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    return `${headers}\n${rows}`;
  }

  private static jsonToXml(data: any): string {
    // Basic XML conversion - would need proper XML library in production
    return `<data>${JSON.stringify(data)}</data>`;
  }
}

// ERP Adapters
class SAPAdapter {
  async extract(config: ERPConfig, request: any): Promise<any> {
    const response = await fetch(`${config.endpoint}/api/v1/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.credentials.access_token}`,
        'X-Requested-With': 'CR-AudioViz-AI'
      },
      body: JSON.stringify({
        modules: request.modules,
        dateRange: request.date_range,
        filters: request.filters
      })
    });

    if (!response.ok) {
      throw new Error(`SAP API error: ${response.statusText}`);
    }

    return response.json();
  }
}

class OracleAdapter {
  async extract(config: ERPConfig, request: any): Promise<any> {
    // Oracle-specific implementation
    const response = await fetch(`${config.endpoint}/fscmRestApi/resources/latest/`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Oracle API error: ${response.statusText}`);
    }

    return response.json();
  }
}

class NetSuiteAdapter {
  async extract(config: ERPConfig, request: any): Promise<any> {
    // NetSuite-specific implementation
    const response = await fetch(`${config.endpoint}/services/rest/query/v1/suiteql`, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${config.credentials.oauth_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'transient'
      },
      body: JSON.stringify({
        q: this.buildQuery(request.modules, request.filters)
      })
    });

    if (!response.ok) {
      throw new Error(`NetSuite API error: ${response.statusText}`);
    }

    return response.json();
  }

  private buildQuery(modules: string[], filters?: any): string {
    return `SELECT * FROM transaction WHERE date >= '${filters?.start_date}' AND date <= '${filters?.end_date}'`;
  }
}

class DynamicsAdapter {
  async extract(config: ERPConfig, request: any): Promise<any> {
    // Dynamics 365-specific implementation
    const response = await fetch(`${config.endpoint}/api/data/v9.0/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.credentials.access_token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Dynamics API error: ${response.statusText}`);
    }

    return response.json();
  }
}

// Authentication middleware
async function authenticate(request: NextRequest): Promise<{ userId: string; apiKey: string } | null> {
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');

  if (!apiKey && !authHeader) {
    return null;
  }

  if (apiKey) {
    if (!SecurityValidator.validateApiKey(apiKey)) {
      return null;
    }

    const { data, error } = await supabase
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key_hash', crypto.createHash('sha256').update(apiKey).digest('hex'))
      .single();

    if (error || !data?.is_active) {
      return null;
    }

    return { userId: data.user_id, apiKey };
  }

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return { userId: user.id, apiKey: '' };
  }

  return null;
}

// API Routes
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          correlation_id: correlationId,
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting
    const withinLimit = await RateLimiter.checkLimit(auth.userId, 'erp-pipeline-get');
    if (!withinLimit) {
      await AuditLogger.log({
        user_id: auth.userId,
        action: 'RATE_LIMIT_EXCEEDED',
        resource: 'erp-pipeline',
        metadata: { endpoint: 'GET' },
        ip_address: clientIp,
        user_agent: userAgent,
        correlation_id: correlationId
      });

      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          correlation_id: correlationId,
          timestamp: new Date().toISOString()
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('config_id');

    if (configId) {
      // Get specific configuration
      const { data, error } = await supabase
        .from('erp_configurations')
        .select('id, name, type, endpoint, modules, is_active, created_at, updated_at')
        .eq('id', configId)
        .eq('user_id', auth.userId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { 
            error: 'Configuration not found', 
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        );
      }

      await AuditLogger.log({
        user_id: auth.userId,
        action: 'ERP_CONFIG_RETRIEVED',
        resource: `erp-configuration:${configId}`,
        metadata: { config_type: data.type },
        ip_address: clientIp,
        user_agent: userAgent,
        correlation_id: correlationId
      });

      return NextResponse.json({
        data,
        correlation_id: correlationId,
        timestamp: new Date().toISOString()
      });
    } else {
      // Get all configurations for user
      const { data, error } = await supabase
        .from('erp_configurations')
        .select('id, name, type, endpoint, modules, is_active, created_at, updated_at')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { 
            error: 'Failed to fetch configurations', 
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        );
      }

      await AuditLogger.log({
        user_id: auth.userId,
        action: 'ERP_CONFIGS_LISTED',
        resource: 'erp-configurations',
        metadata: { count: data.length },
        ip_address: clientIp,
        user_agent: userAgent,
        correlation_id: correlationId
      });

      return NextResponse.json({
        data,
        count: data.length,
        correlation_id: correlationId,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('ERP Pipeline GET Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        correlation_id: correlationId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          correlation_id: correlationId,
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting
    const withinLimit = await RateLimiter.checkLimit(auth.userId, 'erp-pipeline-post');
    if (!withinLimit) {
      await AuditLogger.log({
        user_id: auth.userId,
        action: 'RATE_LIMIT_EXCEEDED',
        resource: 'erp-pipeline',
        metadata: { endpoint: 'POST' },
        ip_address: clientIp,
        user_agent: userAgent,
        correlation_id: correlationId
      });

      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          correlation_id: correlationId,
          timestamp: new Date().toISOString()
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const sanitizedBody = SecurityValidator.sanitizeInput(body);
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'extract';

    if (action === 'extract') {
      // Data extraction request
      const validationResult = ExtractionRequestSchema.safeParse(sanitizedBody);
      if (!validationResult.success) {
        return NextResponse.json(
          { 
            error: 'Invalid request parameters',
            details: validationResult.error.errors,
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      const extractionRequest = validationResult.data;
      
      // Get ERP configuration
      const config = await ERPConnectionManager.getConfig(extractionRequest.erp_config_id, auth.userId);
      if (!config) {
        return NextResponse.json(
          { 
            error: 'ERP configuration not found or inactive',
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        );
      }

      // Validate connection
      const isConnected = await ERPConnectionManager.validateConnection(config);
      if (!isConnected) {
        await AuditLogger.log({
          user_id: auth.userId,
          action: 'ERP_CONNECTION_FAILED',
          resource: `erp-configuration:${config.id}`,
          metadata: { erp_type: config.type, endpoint: config.endpoint },
          ip_address: clientIp,
          user_agent: userAgent,
          correlation_id: correlationId
        });

        return NextResponse.json(
          { 
            error: 'Failed to connect to ERP system',
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 503 }
        );
      }

      // Extract data
      const extractedData = await DataExtractionEngine.extractData(config, extractionRequest);
      
      // Encrypt data if required
      let processedData = extractedData;
      if (extractionRequest.encryption_required) {
        processedData = EncryptionService.encrypt(JSON.stringify(extractedData));
      }

      // Store extraction record
      const { data: extractionRecord } = await supabase
        .from('data_extractions')
        .insert({
          id: crypto.randomUUID(),
          user_id: auth.userId,
          erp_config_id: config.id,
          modules: extractionRequest.modules,
          date_range: extractionRequest.date_range,
          format: extractionRequest.format,
          record_count: Array.isArray(extractedData) ? extractedData.length : 1,
          is_encrypted: extractionRequest.encryption_required,
          correlation_id: correlationId,
          status: 'completed'
        })
        .select()
        .single();

      await AuditLogger.log({
        user_id: auth.userId,
        action: 'DATA_EXTRACTION_COMPLETED',
        resource: `data-extraction:${extractionRecord?.id}`,
        metadata: { 
          erp_type: config.type, 
          modules: extractionRequest.modules,
          record_count: Array.isArray(extractedData) ? extractedData.length : 1,
          format: extractionRequest.format
        },
        ip_address: clientIp,
        user_agent: userAgent,
        correlation_id: correlationId
      });

      return NextResponse.json({
        extraction_id: extractionRecord?.id,
        data: processedData,
        metadata: {
          record_count: Array.isArray(extractedData) ? extractedData.length : 1,
          format: extractionRequest.format,
          encrypted: extractionRequest.encryption_required,
          extracted_at: new Date().toISOString()
        },
        correlation_id: correlationId,
        timestamp: new Date().toISOString()
      });

    } else if (action === 'configure') {
      // Create/update ERP configuration
      const validationResult = ConfigCreateSchema.safeParse(sanitizedBody);
      if (!validationResult.success) {
        return NextResponse.json(
          { 
            error: 'Invalid configuration parameters',
            details: validationResult.error.errors,
            correlation_id: correlationId,
            timestamp: new Date().toISOString()
          },
          { status: 400 }
        );
      }

      const configData = validationResult.data;
      
      // Encrypt credentials
      const encryptedCredentials = EncryptionService.encrypt(JSON.stringify(configData.auth_config.credentials));
      
      // Create configuration
      const