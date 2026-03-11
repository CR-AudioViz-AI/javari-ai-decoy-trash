```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { SAPClient } from '@/lib/integrations/sap/client';
import { SAPOAuthHandler } from '@/lib/integrations/sap/auth/oauth';
import { SAPBasicAuthHandler } from '@/lib/integrations/sap/auth/basic';
import { FinanceModule } from '@/lib/integrations/sap/modules/finance';
import { InventoryModule } from '@/lib/integrations/sap/modules/inventory';
import { HRModule } from '@/lib/integrations/sap/modules/hr';
import { SAPErrorHandler } from '@/lib/integrations/sap/utils/error-handler';
import { SAPRateLimiter } from '@/lib/integrations/sap/utils/rate-limiter';
import type { SAPConnectionConfig, SAPIntegrationRequest, SAPIntegrationResponse } from '@/lib/integrations/sap/types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Request validation schemas
const sapConnectionSchema = z.object({
  type: z.enum(['cloud', 'on-premise']),
  host: z.string().url(),
  port: z.number().optional(),
  client: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  authMethod: z.enum(['basic', 'oauth']),
  oauthConfig: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    tokenUrl: z.string().url(),
    scope: z.string().optional()
  }).optional(),
  systemId: z.string().optional(),
  language: z.string().default('EN'),
  poolSize: z.number().min(1).max(10).default(5),
  timeout: z.number().min(1000).max(300000).default(30000)
});

const sapRequestSchema = z.object({
  action: z.enum(['connect', 'test', 'sync', 'disconnect']),
  module: z.enum(['finance', 'inventory', 'hr', 'all']).optional(),
  config: sapConnectionSchema.optional(),
  connectionId: z.string().uuid().optional(),
  syncOptions: z.object({
    incremental: z.boolean().default(true),
    batchSize: z.number().min(1).max(1000).default(100),
    tables: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  }).optional()
});

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500
});

// SAP Error Handler instance
const errorHandler = new SAPErrorHandler();

// SAP Rate Limiter instance
const sapRateLimiter = new SAPRateLimiter();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const action = searchParams.get('action') || 'status';

    // Rate limiting
    await limiter.check(request, 10, 'SAP_INTEGRATION');

    // Validate required parameters
    if (action === 'status' && !connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required for status check' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'status':
        return await handleStatusCheck(connectionId!);
      case 'connections':
        return await handleGetConnections(request);
      case 'sync-logs':
        return await handleGetSyncLogs(connectionId);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('SAP Integration GET Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting
    await limiter.check(request, 5, 'SAP_INTEGRATION_POST');

    const body = await request.json();
    const validatedRequest = sapRequestSchema.parse(body);

    // Apply SAP-specific rate limiting
    const rateLimitResult = await sapRateLimiter.checkLimit(
      `sap_${validatedRequest.action}`,
      request.ip || 'unknown'
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'SAP API rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { status: 429 }
      );
    }

    switch (validatedRequest.action) {
      case 'connect':
        return await handleConnect(validatedRequest);
      case 'test':
        return await handleTestConnection(validatedRequest);
      case 'sync':
        return await handleSync(validatedRequest);
      case 'disconnect':
        return await handleDisconnect(validatedRequest);
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('SAP Integration POST Error:', error);
    
    const handledError = errorHandler.handleError(error);
    
    return NextResponse.json(
      { 
        error: handledError.message,
        code: handledError.code,
        details: handledError.details 
      },
      { status: handledError.statusCode }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting
    await limiter.check(request, 5, 'SAP_INTEGRATION_UPDATE');

    const body = await request.json();
    const { connectionId, config } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    const validatedConfig = sapConnectionSchema.parse(config);
    
    // Update connection configuration
    const { data, error } = await supabase
      .from('sap_connections')
      .update({
        config: validatedConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      return NextResponse.json(
        { error: 'Failed to update connection configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      connection: data,
      message: 'Connection configuration updated successfully'
    });

  } catch (error) {
    console.error('SAP Integration PUT Error:', error);
    
    const handledError = errorHandler.handleError(error);
    
    return NextResponse.json(
      { 
        error: handledError.message,
        code: handledError.code 
      },
      { status: handledError.statusCode }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting
    await limiter.check(request, 3, 'SAP_INTEGRATION_DELETE');

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    // First disconnect the SAP connection
    try {
      const { data: connectionData } = await supabase
        .from('sap_connections')
        .select('config')
        .eq('id', connectionId)
        .single();

      if (connectionData) {
        const sapClient = new SAPClient(connectionData.config);
        await sapClient.disconnect();
      }
    } catch (disconnectError) {
      console.warn('Error disconnecting SAP before deletion:', disconnectError);
      // Continue with deletion even if disconnect fails
    }

    // Delete connection from database
    const { error } = await supabase
      .from('sap_connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      console.error('Database deletion error:', error);
      return NextResponse.json(
        { error: 'Failed to delete connection' },
        { status: 500 }
      );
    }

    // Log the deletion
    await supabase
      .from('sap_sync_logs')
      .insert({
        connection_id: connectionId,
        action: 'connection_deleted',
        status: 'completed',
        message: 'SAP connection deleted successfully',
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      message: 'SAP connection deleted successfully'
    });

  } catch (error) {
    console.error('SAP Integration DELETE Error:', error);
    
    const handledError = errorHandler.handleError(error);
    
    return NextResponse.json(
      { 
        error: handledError.message,
        code: handledError.code 
      },
      { status: handledError.statusCode }
    );
  }
}

// Helper functions
async function handleStatusCheck(connectionId: string): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('sap_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Connection not found' },
      { status: 404 }
    );
  }

  // Test connection status
  try {
    const sapClient = new SAPClient(data.config);
    const isConnected = await sapClient.testConnection();
    
    return NextResponse.json({
      connectionId,
      status: isConnected ? 'connected' : 'disconnected',
      lastSync: data.last_sync_at,
      config: {
        type: data.config.type,
        host: data.config.host,
        client: data.config.client,
        systemId: data.config.systemId
      }
    });
  } catch (error) {
    return NextResponse.json({
      connectionId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastSync: data.last_sync_at
    });
  }
}

async function handleGetConnections(request: NextRequest): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('sap_connections')
    .select('id, name, config, created_at, last_sync_at, status')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    connections: data?.map(conn => ({
      id: conn.id,
      name: conn.name,
      type: conn.config?.type,
      host: conn.config?.host,
      client: conn.config?.client,
      status: conn.status,
      createdAt: conn.created_at,
      lastSync: conn.last_sync_at
    })) || []
  });
}

async function handleGetSyncLogs(connectionId: string | null): Promise<NextResponse> {
  const query = supabase
    .from('sap_sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (connectionId) {
    query.eq('connection_id', connectionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync logs' },
      { status: 500 }
    );
  }

  return NextResponse.json({ logs: data || [] });
}

async function handleConnect(request: SAPIntegrationRequest): Promise<NextResponse> {
  if (!request.config) {
    return NextResponse.json(
      { error: 'Configuration is required for connection' },
      { status: 400 }
    );
  }

  try {
    // Initialize SAP client with appropriate auth handler
    const authHandler = request.config.authMethod === 'oauth' 
      ? new SAPOAuthHandler(request.config.oauthConfig!)
      : new SAPBasicAuthHandler();

    const sapClient = new SAPClient(request.config, authHandler);
    
    // Test the connection
    const connectionResult = await sapClient.connect();
    
    if (!connectionResult.success) {
      return NextResponse.json(
        { 
          error: 'Failed to connect to SAP',
          details: connectionResult.error 
        },
        { status: 400 }
      );
    }

    // Save connection configuration
    const { data, error } = await supabase
      .from('sap_connections')
      .insert({
        config: request.config,
        status: 'connected',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save connection configuration' },
        { status: 500 }
      );
    }

    // Log the connection
    await supabase
      .from('sap_sync_logs')
      .insert({
        connection_id: data.id,
        action: 'connection_established',
        status: 'completed',
        message: 'SAP connection established successfully',
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      connectionId: data.id,
      message: 'Connected to SAP successfully',
      systemInfo: connectionResult.systemInfo
    });

  } catch (error) {
    console.error('SAP connection error:', error);
    throw error;
  }
}

async function handleTestConnection(request: SAPIntegrationRequest): Promise<NextResponse> {
  if (!request.config && !request.connectionId) {
    return NextResponse.json(
      { error: 'Configuration or connection ID is required' },
      { status: 400 }
    );
  }

  try {
    let config = request.config;
    
    if (request.connectionId && !config) {
      const { data } = await supabase
        .from('sap_connections')
        .select('config')
        .eq('id', request.connectionId)
        .single();
      
      config = data?.config;
    }

    if (!config) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    const authHandler = config.authMethod === 'oauth' 
      ? new SAPOAuthHandler(config.oauthConfig!)
      : new SAPBasicAuthHandler();

    const sapClient = new SAPClient(config, authHandler);
    const testResult = await sapClient.testConnection();

    return NextResponse.json({
      success: testResult,
      message: testResult ? 'Connection test successful' : 'Connection test failed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('SAP connection test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
      timestamp: new Date().toISOString()
    });
  }
}

async function handleSync(request: SAPIntegrationRequest): Promise<NextResponse> {
  if (!request.connectionId) {
    return NextResponse.json(
      { error: 'Connection ID is required for sync' },
      { status: 400 }
    );
  }

  try {
    // Get connection configuration
    const { data: connectionData } = await supabase
      .from('sap_connections')
      .select('config')
      .eq('id', request.connectionId)
      .single();

    if (!connectionData) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    const authHandler = connectionData.config.authMethod === 'oauth' 
      ? new SAPOAuthHandler(connectionData.config.oauthConfig!)
      : new SAPBasicAuthHandler();

    const sapClient = new SAPClient(connectionData.config, authHandler);
    
    // Initialize modules based on request
    const syncResults: Record<string, any> = {};
    const modules = request.module === 'all' 
      ? ['finance', 'inventory', 'hr'] 
      : [request.module || 'finance'];

    for (const moduleName of modules) {
      let moduleInstance;
      
      switch (moduleName) {
        case 'finance':
          moduleInstance = new FinanceModule(sapClient);
          break;
        case 'inventory':
          moduleInstance = new InventoryModule(sapClient);
          break;
        case 'hr':
          moduleInstance = new HRModule(sapClient);
          break;
        default:
          continue;
      }

      // Start sync process
      const syncResult = await moduleInstance.sync(request.syncOptions || {});
      syncResults[moduleName] = syncResult;

      // Log sync result
      await supabase
        .from('sap_sync_logs')
        .insert({
          connection_id: request.connectionId,
          module: moduleName,
          action: 'data_sync',
          status: syncResult.success ? 'completed' : 'failed',
          message: syncResult.message,
          records_processed: syncResult.recordsProcessed,
          created_at: new Date().toISOString()
        });
    }

    // Update last sync time
    await supabase
      .from('sap_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', request.connectionId);

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      results: syncResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('SAP sync error:', error);
    
    // Log sync failure
    if (request.connectionId) {
      await supabase
        .from('sap_sync_logs')
        .insert({
          connection_id: request.connectionId,
          action: 'data_sync',
          status: 'failed',
          message: error instanceof Error ? error.message : 'Sync failed',
          created_at: new Date().toISOString()
        });
    }

    throw error;
  }
}

async function handleDisconnect(request: SAPIntegrationRequest): Promise<NextResponse> {
  if (!request.connectionId) {
    return NextResponse.json(
      { error: 'Connection ID is required for disconnect' },
      { status: 400 }
    );
  }

  try {
    // Get connection configuration
    const { data: connectionData } = await supabase
      .from('sap_connections')
      .select('config')
      .eq('id', request.connectionId)
      .single();

    if (!connectionData) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Disconnect from SAP
    const sapClient = new SAPClient(connectionData.config);
    await sapClient.disconnect();

    // Update connection status
    await supabase
      .from('sap_connections')
      .update({
        status: 'disconnected',
        updated_at: new Date().toISOString()
      })
      .eq('id', request.connectionId);

    // Log disconnection
    await supabase
      .from('sap_sync_logs')
      .insert({
        connection_id: request.connectionId,
        action: 'connection_closed',
        status: 'completed',
        message: 'SAP connection closed successfully',
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      message: 'Disconnected from SAP successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('SAP disconnect error:', error);
    throw error;
  }
}
```