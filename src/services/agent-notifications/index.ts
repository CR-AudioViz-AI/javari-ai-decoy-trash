```typescript
/**
 * Agent Activity Notification Service
 * 
 * Real-time notification service that monitors agent interactions, sales events, 
 * and performance milestones, delivering notifications via WebSocket and email 
 * with user preference management.
 * 
 * @fileoverview Complete microservice for agent activity notifications
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { Resend } from 'resend';
import { z } from 'zod';

// Types and Interfaces
interface NotificationPayload {
  id: string;
  userId: string;
  agentId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  templateId?: string;
  scheduledAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

interface UserPreferences {
  userId: string;
  emailEnabled: boolean;
  websocketEnabled: boolean;
  pushEnabled: boolean;
  agentInteractions: boolean;
  salesEvents: boolean;
  performanceMilestones: boolean;
  marketplaceUpdates: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  frequency: 'immediate' | 'hourly' | 'daily';
  updatedAt: Date;
}

interface AgentInteraction {
  id: string;
  agentId: string;
  userId: string;
  type: 'chat' | 'voice' | 'video' | 'task_completion';
  status: 'started' | 'completed' | 'failed';
  duration?: number;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface SalesEvent {
  id: string;
  userId: string;
  agentId: string;
  type: 'purchase' | 'subscription' | 'upgrade' | 'cancellation';
  amount: number;
  currency: string;
  productId: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

interface PerformanceMilestone {
  id: string;
  userId: string;
  agentId: string;
  type: 'revenue' | 'interactions' | 'satisfaction' | 'efficiency';
  metric: string;
  value: number;
  threshold: number;
  period: 'daily' | 'weekly' | 'monthly';
  achievedAt: Date;
}

interface NotificationHistory {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
  attempts: number;
  metadata?: Record<string, any>;
}

type NotificationType = 
  | 'agent_interaction' 
  | 'sales_event' 
  | 'performance_milestone' 
  | 'marketplace_update'
  | 'system_alert';

type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
type NotificationChannel = 'websocket' | 'email' | 'push';

// Validation Schemas
const NotificationPayloadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  type: z.enum(['agent_interaction', 'sales_event', 'performance_milestone', 'marketplace_update', 'system_alert']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  data: z.record(z.any()).optional(),
  channels: z.array(z.enum(['websocket', 'email', 'push'])),
  templateId: z.string().optional(),
  scheduledAt: z.date().optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  emailEnabled: z.boolean(),
  websocketEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  agentInteractions: z.boolean(),
  salesEvents: z.boolean(),
  performanceMilestones: z.boolean(),
  marketplaceUpdates: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string(),
  frequency: z.enum(['immediate', 'hourly', 'daily']),
});

/**
 * WebSocket Manager for real-time notification delivery
 */
class WebSocketManager {
  private io: SocketIOServer;
  private connectedUsers: Map<string, Socket[]> = new Map();
  private eventEmitter: EventEmitter;

  constructor(io: SocketIOServer, eventEmitter: EventEmitter) {
    this.io = io;
    this.eventEmitter = eventEmitter;
    this.setupSocketHandlers();
  }

  /**
   * Setup WebSocket connection handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`WebSocket client connected: ${socket.id}`);

      socket.on('authenticate', (data: { userId: string; token: string }) => {
        this.handleAuthentication(socket, data);
      });

      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

      socket.on('mark_notification_read', (data: { notificationId: string }) => {
        this.eventEmitter.emit('notification:read', {
          notificationId: data.notificationId,
          userId: socket.data.userId,
          readAt: new Date(),
        });
      });
    });
  }

  /**
   * Handle user authentication
   */
  private async handleAuthentication(socket: Socket, data: { userId: string; token: string }): Promise<void> {
    try {
      // TODO: Validate JWT token
      const userId = data.userId;
      
      socket.data.userId = userId;
      socket.join(`user:${userId}`);
      
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, []);
      }
      this.connectedUsers.get(userId)!.push(socket);
      
      socket.emit('authenticated', { success: true });
      console.log(`User ${userId} authenticated on socket ${socket.id}`);
    } catch (error) {
      console.error('Authentication failed:', error);
      socket.emit('authentication_error', { message: 'Authentication failed' });
      socket.disconnect();
    }
  }

  /**
   * Handle user disconnection
   */
  private handleDisconnection(socket: Socket): void {
    const userId = socket.data.userId;
    if (userId) {
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        const index = userSockets.indexOf(socket);
        if (index > -1) {
          userSockets.splice(index, 1);
        }
        if (userSockets.length === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    }
    console.log(`WebSocket client disconnected: ${socket.id}`);
  }

  /**
   * Send notification to user via WebSocket
   */
  async sendNotification(userId: string, notification: NotificationPayload): Promise<boolean> {
    try {
      const userSockets = this.connectedUsers.get(userId);
      if (!userSockets || userSockets.length === 0) {
        return false;
      }

      const payload = {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: new Date().toISOString(),
      };

      for (const socket of userSockets) {
        socket.emit('notification', payload);
      }

      return true;
    } catch (error) {
      console.error('WebSocket notification failed:', error);
      return false;
    }
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets !== undefined && userSockets.length > 0;
  }
}

/**
 * Email Service for notification delivery
 */
class EmailService {
  private resend: Resend;
  private templates: Map<string, { subject: string; html: string }> = new Map();

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
    this.loadTemplates();
  }

  /**
   * Load email templates
   */
  private loadTemplates(): void {
    this.templates.set('agent_interaction', {
      subject: 'Agent Interaction Update',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Agent Interaction Update</h2>
          <p>{{message}}</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Details:</strong>
            {{#if agentName}}<p>Agent: {{agentName}}</p>{{/if}}
            {{#if duration}}<p>Duration: {{duration}} minutes</p>{{/if}}
            {{#if status}}<p>Status: {{status}}</p>{{/if}}
          </div>
        </div>
      `,
    });

    this.templates.set('sales_event', {
      subject: 'Sales Event Notification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Sales Event</h2>
          <p>{{message}}</p>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Transaction Details:</strong>
            {{#if amount}}<p>Amount: {{currency}}{{amount}}</p>{{/if}}
            {{#if productName}}<p>Product: {{productName}}</p>{{/if}}
            {{#if agentName}}<p>Agent: {{agentName}}</p>{{/if}}
          </div>
        </div>
      `,
    });

    this.templates.set('performance_milestone', {
      subject: 'Performance Milestone Achieved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🎉 Performance Milestone Achieved!</h2>
          <p>{{message}}</p>
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Achievement Details:</strong>
            {{#if metric}}<p>Metric: {{metric}}</p>{{/if}}
            {{#if value}}<p>Value: {{value}}</p>{{/if}}
            {{#if threshold}}<p>Threshold: {{threshold}}</p>{{/if}}
            {{#if agentName}}<p>Agent: {{agentName}}</p>{{/if}}
          </div>
        </div>
      `,
    });
  }

  /**
   * Send notification email
   */
  async sendNotification(
    to: string,
    notification: NotificationPayload,
    userEmail: string
  ): Promise<boolean> {
    try {
      const template = this.templates.get(notification.templateId || notification.type);
      if (!template) {
        throw new Error(`Template not found: ${notification.templateId || notification.type}`);
      }

      const html = this.renderTemplate(template.html, {
        message: notification.message,
        ...notification.data,
      });

      const result = await this.resend.emails.send({
        from: 'noreply@craudioviz.ai',
        to: userEmail,
        subject: notification.title || template.subject,
        html,
      });

      return result.error === null;
    } catch (error) {
      console.error('Email notification failed:', error);
      return false;
    }
  }

  /**
   * Simple template renderer
   */
  private renderTemplate(template: string, data: Record<string, any>): string {
    let rendered = template;
    
    // Replace simple variables {{variable}}
    rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || '';
    });

    // Handle simple conditionals {{#if variable}}content{{/if}}
    rendered = rendered.replace(/\{\{#if (\w+)\}\}(.*?)\{\{\/if\}\}/gs, (match, key, content) => {
      return data[key] ? content : '';
    });

    return rendered;
  }
}

/**
 * User Preferences Manager
 */
class UserPreferencesManager {
  private supabase: SupabaseClient;
  private cache: Map<string, UserPreferences> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      // Check cache first
      if (this.cache.has(userId)) {
        return this.cache.get(userId)!;
      }

      const { data, error } = await this.supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Return default preferences
        const defaultPrefs: UserPreferences = {
          userId,
          emailEnabled: true,
          websocketEnabled: true,
          pushEnabled: false,
          agentInteractions: true,
          salesEvents: true,
          performanceMilestones: true,
          marketplaceUpdates: false,
          timezone: 'UTC',
          frequency: 'immediate',
          updatedAt: new Date(),
        };
        
        // Cache default preferences
        this.cache.set(userId, defaultPrefs);
        return defaultPrefs;
      }

      const preferences: UserPreferences = {
        userId: data.user_id,
        emailEnabled: data.email_enabled,
        websocketEnabled: data.websocket_enabled,
        pushEnabled: data.push_enabled,
        agentInteractions: data.agent_interactions,
        salesEvents: data.sales_events,
        performanceMilestones: data.performance_milestones,
        marketplaceUpdates: data.marketplace_updates,
        quietHoursStart: data.quiet_hours_start,
        quietHoursEnd: data.quiet_hours_end,
        timezone: data.timezone,
        frequency: data.frequency,
        updatedAt: new Date(data.updated_at),
      };

      // Cache preferences
      this.cache.set(userId, preferences);
      return preferences;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return null;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<boolean> {
    try {
      const validation = UserPreferencesSchema.partial().safeParse({
        ...preferences,
        userId,
      });

      if (!validation.success) {
        throw new Error(`Invalid preferences: ${validation.error.message}`);
      }

      const { error } = await this.supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          email_enabled: preferences.emailEnabled,
          websocket_enabled: preferences.websocketEnabled,
          push_enabled: preferences.pushEnabled,
          agent_interactions: preferences.agentInteractions,
          sales_events: preferences.salesEvents,
          performance_milestones: preferences.performanceMilestones,
          marketplace_updates: preferences.marketplaceUpdates,
          quiet_hours_start: preferences.quietHoursStart,
          quiet_hours_end: preferences.quietHoursEnd,
          timezone: preferences.timezone,
          frequency: preferences.frequency,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      // Update cache
      const currentPrefs = this.cache.get(userId);
      if (currentPrefs) {
        this.cache.set(userId, { ...currentPrefs, ...preferences });
      } else {
        this.cache.delete(userId);
      }

      return true;
    } catch (error) {
      console.error('Failed to update user preferences:', error);
      return false;
    }
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  async shouldSendNotification(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel
  ): Promise<boolean> {
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) return false;

    // Check channel preference
    if (channel === 'email' && !preferences.emailEnabled) return false;
    if (channel === 'websocket' && !preferences.websocketEnabled) return false;
    if (channel === 'push' && !preferences.pushEnabled) return false;

    // Check notification type preference
    switch (type) {
      case 'agent_interaction':
        return preferences.agentInteractions;
      case 'sales_event':
        return preferences.salesEvents;
      case 'performance_milestone':
        return preferences.performanceMilestones;
      case 'marketplace_update':
        return preferences.marketplaceUpdates;
      case 'system_alert':
        return true; // Always send system alerts
      default:
        return false;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(preferences: UserPreferences): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    // TODO: Implement proper timezone handling
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= preferences.quietHoursStart && currentTime <= preferences.quietHoursEnd;
  }
}

/**
 * Event Processor for filtering and routing notifications
 */
class EventProcessor {
  private eventEmitter: EventEmitter;
  private preferencesManager: UserPreferencesManager;

  constructor(eventEmitter: EventEmitter, preferencesManager: UserPreferencesManager) {
    this.eventEmitter = eventEmitter;
    this.preferencesManager = preferencesManager;
  }

  /**
   * Process agent interaction event
   */
  async processAgentInteraction(interaction: AgentInteraction): Promise<NotificationPayload | null> {
    try {
      const notification: NotificationPayload = {
        id: crypto.randomUUID(),
        userId: interaction.userId,
        agentId: interaction.agentId,
        type: 'agent_interaction',
        priority: this.getPriorityForInteraction(interaction),
        title: `Agent ${interaction.type} ${interaction.status}`,
        message: this.getInteractionMessage(interaction),
        data: {
          interactionId: interaction.id,
          agentId: interaction.agentId,
          type: interaction.type,
          status: interaction.status,
          duration: interaction.duration,
          ...interaction.metadata,
        },
        channels: ['websocket', 'email'],
        templateId: 'agent_interaction',
      };

      return notification;
    } catch (error) {
      console.error('Failed to process agent interaction:', error);
      return null;
    }
  }

  /**
   * Process sales event
   */
  async processSalesEvent(event: SalesEvent): Promise<NotificationPayload | null> {
    try {
      const notification: NotificationPayload = {
        id: crypto.randomUUID(),
        userId: event.userId,
        agentId: event.agentId,
        type: 'sales_event',
        priority: this.getPriorityForSales(event),
        title: `Sales ${event.type}`,
        message: this.getSalesMessage(event),
        data: {
          salesEventId: event.id,
          agentId: event.agentId,
          type: event.type,
          amount: event.amount,
          currency: event.currency,
          productId: event.productId,
          ...event.metadata,
        },
        channels: ['websocket', 'email'],
        templateId: 'sales_event',
      };

      return notification;
    } catch (error) {
      console.error('Failed to process sales event:', error);
      return null;
    }
  }

  /**
   * Process performance milestone
   */
  async processPerformanceMilestone(milestone: PerformanceMilestone): Promise<NotificationPayload | null> {
    try {
      const notification: NotificationPayload = {
        id: crypto.randomUUID(),
        userId: milestone.userId,
        agentId: milestone.agentId,
        type: 'performance_milestone',
        priority: 'high',
        title: `Performance Milestone Achieved!`,
        message: this.getMilestoneMessage(milestone),
        data: {
          milestoneId: milestone.id,
          agentId: milestone.agentId,
          type: milestone.type,
          metric: milestone.metric,
          value: milestone.value,
          threshold: milestone.threshold,
          period: milestone.period,
        },
        channels: ['websocket', 'email'],
        templateId: 'performance_milestone',
      };

      return notification;
    } catch (error) {
      console.error('Failed to process performance milestone:', error);
      return null;
    }
  }

  /**
   * Get priority for agent interaction
   */
  private getPriorityForInteraction(interaction: AgentInteraction): NotificationPriority {
    if (interaction.status === 'failed') return 'high';
    if (interaction.type === 'voice' || interaction.type === 'video') return 'medium';
    return 'low';
  }

  /**
   * Get priority for sales event
   */