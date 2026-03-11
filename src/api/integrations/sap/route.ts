```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Redis } from 'ioredis';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { Kafka } from 'kafkajs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Environment validation
const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string(),
  SAP_BASE_URL: z.string().url(),
  SAP_CLIENT_ID: z.string(),
  SAP_CLIENT_SECRET: z.string(),
  SAP_USERNAME: z.string().optional(),
  SAP_PASSWORD: z.string().optional(),
  REDIS_URL: z.string(),
  OPENAI_API_KEY: z.string(),
  KAFKA_BROKER: z.string(),
  JWT_SECRET: z.string(),
  DATABASE_URL: z.string(),
});

const env = envSchema.parse(process.env);

// Request/Response schemas
const sapConnectionSchema = z.object({
  action: z.enum(['connect', 'sync', 'workflow', 'insights', 'disconnect']),
  system: z.string().min(1),
  credentials: z.object({
    client: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
  }).optional(),
  payload: z.any().optional(),
  workflow: z.object({
    type: z.string(),
    parameters: z.record(z.any()),
  }).optional(),
});

// Initialize clients
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const redis = new Redis(env.REDIS_URL);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const prisma = new PrismaClient();

const kafka = new Kafka({
  clientId: 'sap-integration',
  brokers: [env.KAFKA_BROKER],
});

// SAP Security Validator
class SAPSecurityValidator {
  static validateRequest(request: any): boolean {
    if (!request.system || typeof request.system !== 'string') return false;
    if (request.system.includes('..') || request.system.includes('/')) return false;
    if (request.payload && typeof request.payload === 'object') {
      const payloadStr = JSON.stringify(request.payload);
      if (payloadStr.includes('<script>') || payloadStr.includes('javascript:')) return false;
    }
    return true;
  }

  static sanitizeInput(input: string): string {
    return input.replace(/[<>'"&]/g, '').trim();
  }

  static encryptSensitiveData(data: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', env.JWT_SECRET);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
}

// SAP Authentication Handler
class SAPAuthHandler {
  private static tokenCache = new Map<string, { token: string; expires: number }>();

  static async authenticate(credentials: any): Promise<string> {
    const cacheKey = `${credentials.client}_${credentials.username}`;
    const cached = this.tokenCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.token;
    }

    try {
      const response = await axios.post(`${env.SAP_BASE_URL}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: env.SAP_CLIENT_ID,
        client_secret: env.SAP_CLIENT_SECRET,
        username: credentials.username,
        password: credentials.password,
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });

      const { access_token, expires_in } = response.data;
      const expires = Date.now() + (expires_in * 1000);
      
      this.tokenCache.set(cacheKey, { token: access_token, expires });
      
      // Store in Supabase for session management
      await supabase.from('sap_sessions').upsert({
        client_key: cacheKey,
        token: SAPSecurityValidator.encryptSensitiveData(access_token),
        expires_at: new Date(expires).toISOString(),
        created_at: new Date().toISOString(),
      });

      return access_token;
    } catch (error) {
      throw new Error(`SAP Authentication failed: ${error}`);
    }
  }
}

// SAP Data Mapper
class SAPDataMapper {
  static mapToStandardFormat(sapData: any, entityType: string): any {
    const mappings = {
      customer: {
        id: 'CustomerID',
        name: 'CustomerName',
        email: 'EmailAddress',
        phone: 'PhoneNumber',
      },
      order: {
        id: 'OrderID',
        customer_id: 'CustomerID',
        amount: 'TotalAmount',
        status: 'OrderStatus',
        date: 'OrderDate',
      },
      product: {
        id: 'ProductID',
        name: 'ProductName',
        price: 'UnitPrice',
        category: 'CategoryCode',
      },
    };

    const mapping = mappings[entityType as keyof typeof mappings];
    if (!mapping) return sapData;

    const mapped: any = {};
    for (const [key, sapField] of Object.entries(mapping)) {
      mapped[key] = sapData[sapField] || null;
    }
    return mapped;
  }

  static mapFromStandardFormat(data: any, entityType: string): any {
    const mappings = {
      customer: {
        CustomerID: 'id',
        CustomerName: 'name',
        EmailAddress: 'email',
        PhoneNumber: 'phone',
      },
      order: {
        OrderID: 'id',
        CustomerID: 'customer_id',
        TotalAmount: 'amount',
        OrderStatus: 'status',
        OrderDate: 'date',
      },
    };

    const mapping = mappings[entityType as keyof typeof mappings];
    if (!mapping) return data;

    const mapped: any = {};
    for (const [sapField, key] of Object.entries(mapping)) {
      mapped[sapField] = data[key] || null;
    }
    return mapped;
  }
}

// SAP Insights Processor
class SAPInsightsProcessor {
  static async generateBusinessInsights(data: any[]): Promise<any> {
    if (!data || data.length === 0) return null;

    try {
      const prompt = `
Analyze the following SAP business data and provide insights:
${JSON.stringify(data.slice(0, 10), null, 2)}

Provide insights on:
1. Key trends and patterns
2. Performance indicators
3. Potential risks or opportunities
4. Recommendations for optimization

Format as JSON with insights, trends, recommendations arrays.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const insights = JSON.parse(response.choices[0].message.content || '{}');
      
      // Store insights in Supabase
      await supabase.from('sap_insights').insert({
        data_hash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex'),
        insights: insights,
        generated_at: new Date().toISOString(),
      });

      return insights;
    } catch (error) {
      console.error('Insights generation failed:', error);
      return { error: 'Failed to generate insights' };
    }
  }
}

// SAP Real-time Sync
class SAPRealtimeSync {
  private static producer = kafka.producer();

  static async queueSyncOperation(operation: any): Promise<void> {
    await redis.lpush('sap_sync_queue', JSON.stringify({
      ...operation,
      queued_at: Date.now(),
    }));

    // Publish to Kafka for real-time processing
    await this.producer.send({
      topic: 'sap-realtime-sync',
      messages: [{
        key: operation.entity_id,
        value: JSON.stringify(operation),
      }],
    });
  }

  static async processSyncQueue(): Promise<void> {
    const operations = await redis.brpop('sap_sync_queue', 5);
    if (!operations) return;

    const operation = JSON.parse(operations[1]);
    
    try {
      // Process the sync operation
      await this.executeSyncOperation(operation);
      
      // Log successful sync
      await SAPAuditLogger.log({
        action: 'sync_completed',
        entity_type: operation.entity_type,
        entity_id: operation.entity_id,
        status: 'success',
      });
    } catch (error) {
      // Move to dead letter queue
      await redis.lpush('sap_sync_dlq', JSON.stringify({
        ...operation,
        error: error.message,
        failed_at: Date.now(),
      }));

      await SAPAuditLogger.log({
        action: 'sync_failed',
        entity_type: operation.entity_type,
        entity_id: operation.entity_id,
        status: 'error',
        error: error.message,
      });
    }
  }

  private static async executeSyncOperation(operation: any): Promise<void> {
    // Implementation for actual SAP sync operation
    // This would involve calling SAP APIs to sync data
    const token = await SAPAuthHandler.authenticate(operation.credentials);
    
    const response = await axios.post(`${env.SAP_BASE_URL}/api/sync`, operation.payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    if (response.status !== 200) {
      throw new Error(`SAP sync failed: ${response.statusText}`);
    }
  }
}

// SAP Workflow Engine
class SAPWorkflowEngine {
  static async executeWorkflow(workflowType: string, parameters: any): Promise<any> {
    const workflows = {
      'purchase_order_approval': async (params: any) => {
        // Implement purchase order approval workflow
        const token = await SAPAuthHandler.authenticate(params.credentials);
        
        const response = await axios.post(`${env.SAP_BASE_URL}/api/workflows/po-approval`, {
          order_id: params.order_id,
          approver: params.approver,
          comments: params.comments,
        }, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        return response.data;
      },
      
      'invoice_processing': async (params: any) => {
        // Implement invoice processing workflow
        const token = await SAPAuthHandler.authenticate(params.credentials);
        
        const response = await axios.post(`${env.SAP_BASE_URL}/api/workflows/invoice`, {
          invoice_data: params.invoice_data,
          processing_rules: params.rules,
        }, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        return response.data;
      },
    };

    const workflow = workflows[workflowType as keyof typeof workflows];
    if (!workflow) {
      throw new Error(`Workflow ${workflowType} not found`);
    }

    return await workflow(parameters);
  }
}

// SAP Audit Logger
class SAPAuditLogger {
  static async log(entry: any): Promise<void> {
    try {
      await prisma.sapAuditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entity_type,
          entityId: entry.entity_id,
          status: entry.status,
          error: entry.error,
          metadata: entry.metadata || {},
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
}

// SAP Error Handler
class SAPErrorHandler {
  static handle(error: any): NextResponse {
    const errorId = crypto.randomUUID();
    
    const errorResponse = {
      error: true,
      id: errorId,
      message: 'SAP integration error occurred',
      timestamp: new Date().toISOString(),
    };

    // Log error details
    SAPAuditLogger.log({
      action: 'error_occurred',
      error: error.message,
      error_id: errorId,
      stack: error.stack,
    });

    if (error.message.includes('Authentication')) {
      return NextResponse.json(
        { ...errorResponse, code: 'SAP_AUTH_ERROR' },
        { status: 401 }
      );
    }

    if (error.message.includes('timeout')) {
      return NextResponse.json(
        { ...errorResponse, code: 'SAP_TIMEOUT' },
        { status: 408 }
      );
    }

    if (error.message.includes('validation')) {
      return NextResponse.json(
        { ...errorResponse, code: 'SAP_VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ...errorResponse, code: 'SAP_INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// Main API Route Handlers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedRequest = sapConnectionSchema.parse(body);

    // Security validation
    if (!SAPSecurityValidator.validateRequest(validatedRequest)) {
      return NextResponse.json(
        { error: 'Invalid request format or potential security threat detected' },
        { status: 400 }
      );
    }

    const { action, system, credentials, payload, workflow } = validatedRequest;

    // Rate limiting check
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `sap_rate_limit_${clientIp}`;
    const currentRequests = await redis.incr(rateLimitKey);
    
    if (currentRequests === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour window
    }
    
    if (currentRequests > 100) { // 100 requests per hour
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    let result: any;

    switch (action) {
      case 'connect':
        if (!credentials) {
          throw new Error('Credentials required for connection');
        }
        const token = await SAPAuthHandler.authenticate(credentials);
        result = { 
          connected: true, 
          system,
          session_id: jwt.sign({ system, timestamp: Date.now() }, env.JWT_SECRET),
        };
        break;

      case 'sync':
        if (!payload) {
          throw new Error('Payload required for sync operation');
        }
        
        const mappedData = SAPDataMapper.mapToStandardFormat(payload.data, payload.entity_type);
        
        await SAPRealtimeSync.queueSyncOperation({
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
          data: mappedData,
          credentials,
        });

        result = { 
          queued: true, 
          entity_type: payload.entity_type,
          sync_id: crypto.randomUUID(),
        };
        break;

      case 'workflow':
        if (!workflow) {
          throw new Error('Workflow configuration required');
        }
        
        result = await SAPWorkflowEngine.executeWorkflow(
          workflow.type, 
          { ...workflow.parameters, credentials }
        );
        break;

      case 'insights':
        if (!payload || !payload.data) {
          throw new Error('Data required for insights generation');
        }
        
        result = await SAPInsightsProcessor.generateBusinessInsights(payload.data);
        break;

      case 'disconnect':
        // Clean up session
        await redis.del(`sap_session_${system}`);
        result = { disconnected: true, system };
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    // Log successful operation
    await SAPAuditLogger.log({
      action,
      entity_type: payload?.entity_type,
      entity_id: payload?.entity_id,
      status: 'success',
      metadata: { system, client_ip: clientIp },
    });

    return NextResponse.json({
      success: true,
      action,
      system,
      data: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('SAP Integration Error:', error);
    return SAPErrorHandler.handle(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const system = searchParams.get('system');

    if (!action || !system) {
      return NextResponse.json(
        { error: 'Action and system parameters required' },
        { status: 400 }
      );
    }

    let result: any;

    switch (action) {
      case 'status':
        // Check SAP system status
        const sessionExists = await redis.exists(`sap_session_${system}`);
        result = { 
          system, 
          connected: sessionExists > 0,
          last_sync: await redis.get(`sap_last_sync_${system}`),
        };
        break;

      case 'queue_status':
        const queueLength = await redis.llen('sap_sync_queue');
        const dlqLength = await redis.llen('sap_sync_dlq');
        result = {
          pending_operations: queueLength,
          failed_operations: dlqLength,
        };
        break;

      case 'insights':
        // Get recent insights
        const { data: insights } = await supabase
          .from('sap_insights')
          .select('*')
          .order('generated_at', { ascending: false })
          .limit(10);
        
        result = { insights };
        break;

      default:
        throw new Error(`Unsupported GET action: ${action}`);
    }

    return NextResponse.json({
      success: true,
      action,
      system,
      data: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('SAP Integration GET Error:', error);
    return SAPErrorHandler.handle(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const system = searchParams.get('system');
    const session_id = searchParams.get('session_id');

    if (!system) {
      return NextResponse.json(
        { error: 'System parameter required' },
        { status: 400 }
      );
    }

    // Clean up all system resources
    await redis.del(`sap_session_${system}`);
    await redis.del(`sap_last_sync_${system}`);
    
    // Invalidate cached tokens
    const keys = await redis.keys(`sap_token_${system}_*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Update Supabase session status
    await supabase
      .from('sap_sessions')
      .update({ status: 'disconnected' })
      .match({ client_key: system });

    await SAPAuditLogger.log({
      action: 'system_cleanup',
      entity_type: 'system',
      entity_id: system,
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      message: `SAP system ${system} resources cleaned up`,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('SAP Integration DELETE Error:', error);
    return SAPErrorHandler.handle(error);
  }
}
```