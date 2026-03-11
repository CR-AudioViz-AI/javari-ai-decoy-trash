```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import Redis from 'ioredis';
import { WebSocket } from 'ws';

// Environment variables validation
const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  REDIS_URL: z.string(),
  AGENT_ENCRYPTION_KEY: z.string().min(32),
});

const env = envSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  REDIS_URL: process.env.REDIS_URL!,
  AGENT_ENCRYPTION_KEY: process.env.AGENT_ENCRYPTION_KEY!,
});

// Initialize clients
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

// Message schemas
const MessageSchema = z.object({
  targetAgentId: z.string().uuid(),
  payload: z.record(z.any()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  messageType: z.enum(['command', 'query', 'data', 'notification']),
  requiresDeliveryConfirmation: z.boolean().default(true),
  ttl: z.number().min(60).max(86400).default(3600), // 1 hour default TTL
  metadata: z.record(z.string()).optional(),
});

const DeliveryConfirmationSchema = z.object({
  messageId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.enum(['delivered', 'failed', 'acknowledged']),
  timestamp: z.string().datetime(),
  errorDetails: z.string().optional(),
});

interface EncryptedMessage {
  data: string;
  iv: string;
  tag: string;
}

interface QueuedMessage {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  encryptedPayload: EncryptedMessage;
  priority: number;
  messageType: string;
  createdAt: Date;
  expiresAt: Date;
  requiresDeliveryConfirmation: boolean;
  metadata?: Record<string, string>;
}

class MessageEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;

  constructor(key: string) {
    this.keyBuffer = Buffer.from(key, 'hex');
  }

  encrypt(data: any): EncryptedMessage {
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, this.keyBuffer, iv);
      
      const serializedData = JSON.stringify(data);
      let encrypted = cipher.update(serializedData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();

      return {
        data: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedMessage: EncryptedMessage): any {
    try {
      const { data, iv, tag } = encryptedMessage;
      const decipher = createDecipheriv(this.algorithm, this.keyBuffer, Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }
}

class AgentRegistry {
  async validateAgent(agentId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('id, status, capabilities')
        .eq('id', agentId)
        .eq('status', 'active')
        .single();

      return !error && !!data;
    } catch (error) {
      return false;
    }
  }

  async getAgentStatus(agentId: string): Promise<'online' | 'offline' | 'busy' | 'unknown'> {
    try {
      const status = await redis.get(`agent:${agentId}:status`);
      return (status as any) || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  async setAgentStatus(agentId: string, status: 'online' | 'offline' | 'busy'): Promise<void> {
    try {
      await redis.setex(`agent:${agentId}:status`, 300, status); // 5 minute TTL
    } catch (error) {
      console.error('Failed to set agent status:', error);
    }
  }

  async getAgentWebSocket(agentId: string): Promise<string | null> {
    try {
      return await redis.get(`agent:${agentId}:websocket`);
    } catch (error) {
      return null;
    }
  }
}

class MessageQueue {
  private getPriorityScore(priority: string): number {
    const scores = { urgent: 4, high: 3, normal: 2, low: 1 };
    return scores[priority as keyof typeof scores] || 2;
  }

  async enqueue(message: QueuedMessage): Promise<void> {
    try {
      const queueKey = `queue:agent:${message.targetAgentId}`;
      const priority = this.getPriorityScore(message.priority.toString());
      
      await redis.zadd(
        queueKey,
        priority,
        JSON.stringify(message)
      );

      // Set TTL for the queue entry
      const ttl = Math.floor((message.expiresAt.getTime() - Date.now()) / 1000);
      await redis.expire(queueKey, ttl);

      // Update queue metrics
      await this.updateQueueMetrics(message.targetAgentId);
    } catch (error) {
      throw new Error(`Failed to enqueue message: ${error}`);
    }
  }

  async dequeue(agentId: string, limit: number = 10): Promise<QueuedMessage[]> {
    try {
      const queueKey = `queue:agent:${agentId}`;
      
      // Get highest priority messages
      const messages = await redis.zrevrange(queueKey, 0, limit - 1);
      
      if (messages.length > 0) {
        // Remove fetched messages from queue
        await redis.zrem(queueKey, ...messages);
      }

      return messages
        .map(msg => {
          try {
            return JSON.parse(msg);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to dequeue messages: ${error}`);
    }
  }

  async getQueueSize(agentId: string): Promise<number> {
    try {
      return await redis.zcard(`queue:agent:${agentId}`);
    } catch (error) {
      return 0;
    }
  }

  private async updateQueueMetrics(agentId: string): Promise<void> {
    try {
      const queueSize = await this.getQueueSize(agentId);
      await redis.setex(`metrics:queue:${agentId}:size`, 300, queueSize.toString());
    } catch (error) {
      console.error('Failed to update queue metrics:', error);
    }
  }
}

class DeliveryConfirmation {
  async recordDelivery(messageId: string, agentId: string, status: 'delivered' | 'failed' | 'acknowledged', errorDetails?: string): Promise<void> {
    try {
      const confirmation = {
        message_id: messageId,
        agent_id: agentId,
        status,
        timestamp: new Date().toISOString(),
        error_details: errorDetails,
      };

      await supabase
        .from('agent_message_confirmations')
        .insert(confirmation);

      // Cache for quick lookup
      await redis.setex(
        `confirmation:${messageId}:${agentId}`,
        3600,
        JSON.stringify({ status, timestamp: confirmation.timestamp })
      );
    } catch (error) {
      console.error('Failed to record delivery confirmation:', error);
    }
  }

  async getDeliveryStatus(messageId: string, agentId: string): Promise<any> {
    try {
      // Try cache first
      const cached = await redis.get(`confirmation:${messageId}:${agentId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const { data } = await supabase
        .from('agent_message_confirmations')
        .select('status, timestamp, error_details')
        .eq('message_id', messageId)
        .eq('agent_id', agentId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      return data;
    } catch (error) {
      return null;
    }
  }
}

class MessageRouter {
  private encryption: MessageEncryption;
  private agentRegistry: AgentRegistry;
  private messageQueue: MessageQueue;
  private deliveryConfirmation: DeliveryConfirmation;

  constructor() {
    this.encryption = new MessageEncryption(env.AGENT_ENCRYPTION_KEY);
    this.agentRegistry = new AgentRegistry();
    this.messageQueue = new MessageQueue();
    this.deliveryConfirmation = new DeliveryConfirmation();
  }

  async routeMessage(sourceAgentId: string, message: z.infer<typeof MessageSchema>): Promise<{ messageId: string; deliveryMethod: 'sync' | 'async'; status: string }> {
    // Validate agents
    const [sourceValid, targetValid] = await Promise.all([
      this.agentRegistry.validateAgent(sourceAgentId),
      this.agentRegistry.validateAgent(message.targetAgentId),
    ]);

    if (!sourceValid) {
      throw new Error('Invalid source agent');
    }

    if (!targetValid) {
      throw new Error('Invalid target agent');
    }

    // Generate message ID
    const messageId = crypto.randomUUID();

    // Encrypt payload
    const encryptedPayload = this.encryption.encrypt(message.payload);

    // Check target agent status
    const targetStatus = await this.agentRegistry.getAgentStatus(message.targetAgentId);

    // Prepare queued message
    const queuedMessage: QueuedMessage = {
      id: messageId,
      sourceAgentId,
      targetAgentId: message.targetAgentId,
      encryptedPayload,
      priority: this.getPriorityNumber(message.priority),
      messageType: message.messageType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + message.ttl * 1000),
      requiresDeliveryConfirmation: message.requiresDeliveryConfirmation,
      metadata: message.metadata,
    };

    // Store message in database
    await supabase
      .from('agent_messages')
      .insert({
        id: messageId,
        source_agent_id: sourceAgentId,
        target_agent_id: message.targetAgentId,
        encrypted_payload: encryptedPayload,
        priority: message.priority,
        message_type: message.messageType,
        created_at: queuedMessage.createdAt.toISOString(),
        expires_at: queuedMessage.expiresAt.toISOString(),
        requires_delivery_confirmation: message.requiresDeliveryConfirmation,
        metadata: message.metadata,
        status: 'pending',
      });

    // Determine delivery method
    if (targetStatus === 'online') {
      // Attempt synchronous delivery
      try {
        const delivered = await this.deliverSynchronously(queuedMessage);
        if (delivered) {
          if (message.requiresDeliveryConfirmation) {
            await this.deliveryConfirmation.recordDelivery(messageId, message.targetAgentId, 'delivered');
          }
          return {
            messageId,
            deliveryMethod: 'sync',
            status: 'delivered',
          };
        }
      } catch (error) {
        console.error('Synchronous delivery failed:', error);
      }
    }

    // Fallback to asynchronous delivery
    await this.messageQueue.enqueue(queuedMessage);
    
    return {
      messageId,
      deliveryMethod: 'async',
      status: 'queued',
    };
  }

  private async deliverSynchronously(message: QueuedMessage): Promise<boolean> {
    try {
      const wsConnectionId = await this.agentRegistry.getAgentWebSocket(message.targetAgentId);
      if (!wsConnectionId) {
        return false;
      }

      // In a real implementation, you would use your WebSocket manager here
      // For now, we'll simulate successful delivery
      return true;
    } catch (error) {
      return false;
    }
  }

  private getPriorityNumber(priority: string): number {
    const priorities = { urgent: 4, high: 3, normal: 2, low: 1 };
    return priorities[priority as keyof typeof priorities] || 2;
  }

  async getMessages(agentId: string, limit: number = 10): Promise<any[]> {
    const messages = await this.messageQueue.dequeue(agentId, limit);
    
    return messages.map(msg => ({
      id: msg.id,
      sourceAgentId: msg.sourceAgentId,
      payload: this.encryption.decrypt(msg.encryptedPayload),
      messageType: msg.messageType,
      priority: msg.priority,
      createdAt: msg.createdAt,
      metadata: msg.metadata,
    }));
  }
}

const messageRouter = new MessageRouter();

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Extract agent ID from token or headers
    const agentId = request.headers.get('x-agent-id');
    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID required' },
        { status: 400 }
      );
    }

    // Validate message
    const message = MessageSchema.parse(body);

    // Route message
    const result = await messageRouter.routeMessage(agentId, message);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid message format', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Message routing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const agentId = request.headers.get('x-agent-id');
    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    // Get messages for agent
    const messages = await messageRouter.getMessages(agentId, limit);

    return NextResponse.json({
      messages,
      count: messages.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Message retrieval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const confirmation = DeliveryConfirmationSchema.parse(body);

    const deliveryConfirmation = new DeliveryConfirmation();
    await deliveryConfirmation.recordDelivery(
      confirmation.messageId,
      confirmation.agentId,
      confirmation.status,
      confirmation.errorDetails
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid confirmation format', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Delivery confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-id',
    },
  });
}
```