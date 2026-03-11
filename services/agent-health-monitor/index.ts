```typescript
/**
 * @fileoverview Real-Time Agent Health Monitor Service
 * Continuously monitors marketplace agent health metrics including availability,
 * response times, error rates, and sends automated alerts to creators.
 * 
 * @version 1.0.0
 * @author CR AudioViz AI Platform
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import WebSocket from 'ws';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { EventEmitter } from 'events';

/**
 * Interface for agent health metrics
 */
interface AgentHealthMetrics {
  agentId: string;
  timestamp: Date;
  responseTime: number;
  isAvailable: boolean;
  errorRate: number;
  lastError?: string;
  uptime: number;
  consecutiveFailures: number;
}

/**
 * Interface for alert configuration
 */
interface AlertConfig {
  responseTimeThreshold: number;
  errorRateThreshold: number;
  maxConsecutiveFailures: number;
  checkInterval: number;
  alertCooldown: number;
}

/**
 * Interface for creator notification preferences
 */
interface NotificationPreferences {
  creatorId: string;
  email: boolean;
  sms: boolean;
  webhook: boolean;
  alertTypes: string[];
  cooldownPeriod: number;
}

/**
 * Interface for health dashboard data
 */
interface HealthDashboardData {
  totalAgents: number;
  healthyAgents: number;
  unhealthyAgents: number;
  averageResponseTime: number;
  overallUptime: number;
  recentAlerts: Alert[];
  agentMetrics: AgentHealthMetrics[];
}

/**
 * Interface for alert data
 */
interface Alert {
  id: string;
  agentId: string;
  creatorId: string;
  type: 'availability' | 'performance' | 'error_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Metrics Collector - Gathers health metrics from agents
 */
class MetricsCollector {
  private redis: Redis;
  private supabase: SupabaseClient;

  constructor(redis: Redis, supabase: SupabaseClient) {
    this.redis = redis;
    this.supabase = supabase;
  }

  /**
   * Ping an agent to collect health metrics
   */
  async pingAgent(agentId: string, endpoint: string): Promise<AgentHealthMetrics> {
    const startTime = Date.now();
    let isAvailable = false;
    let lastError: string | undefined;

    try {
      const response = await fetch(`${endpoint}/health`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'User-Agent': 'CR-AudioViz-HealthMonitor/1.0'
        }
      });

      isAvailable = response.ok;
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      isAvailable = false;
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;
    
    // Get previous metrics for error rate calculation
    const previousMetrics = await this.getPreviousMetrics(agentId);
    const errorRate = await this.calculateErrorRate(agentId, !isAvailable);
    const consecutiveFailures = await this.getConsecutiveFailures(agentId, isAvailable);
    const uptime = await this.calculateUptime(agentId);

    const metrics: AgentHealthMetrics = {
      agentId,
      timestamp: new Date(),
      responseTime,
      isAvailable,
      errorRate,
      lastError,
      uptime,
      consecutiveFailures
    };

    // Cache metrics in Redis
    await this.cacheMetrics(agentId, metrics);

    return metrics;
  }

  /**
   * Calculate error rate over the last hour
   */
  private async calculateErrorRate(agentId: string, isCurrentError: boolean): Promise<number> {
    const key = `agent:${agentId}:errors:hourly`;
    const currentHour = Math.floor(Date.now() / 3600000);
    
    if (isCurrentError) {
      await this.redis.hincrby(key, currentHour.toString(), 1);
    }
    
    const totalChecks = await this.redis.hget(`agent:${agentId}:checks:hourly`, currentHour.toString()) || '0';
    const totalErrors = await this.redis.hget(key, currentHour.toString()) || '0';
    
    const checks = parseInt(totalChecks);
    const errors = parseInt(totalErrors);
    
    return checks > 0 ? (errors / checks) * 100 : 0;
  }

  /**
   * Get consecutive failure count
   */
  private async getConsecutiveFailures(agentId: string, isCurrentSuccess: boolean): Promise<number> {
    const key = `agent:${agentId}:consecutive_failures`;
    
    if (isCurrentSuccess) {
      await this.redis.del(key);
      return 0;
    } else {
      return await this.redis.incr(key);
    }
  }

  /**
   * Calculate uptime percentage for the last 24 hours
   */
  private async calculateUptime(agentId: string): Promise<number> {
    const key = `agent:${agentId}:uptime:daily`;
    const currentDay = Math.floor(Date.now() / 86400000);
    
    const totalChecks = await this.redis.hget(`agent:${agentId}:checks:daily`, currentDay.toString()) || '0';
    const successfulChecks = await this.redis.hget(key, currentDay.toString()) || '0';
    
    const total = parseInt(totalChecks);
    const successful = parseInt(successfulChecks);
    
    return total > 0 ? (successful / total) * 100 : 100;
  }

  /**
   * Cache metrics in Redis
   */
  private async cacheMetrics(agentId: string, metrics: AgentHealthMetrics): Promise<void> {
    const key = `agent:${agentId}:metrics:latest`;
    await this.redis.setex(key, 3600, JSON.stringify(metrics));
    
    // Update counters
    const currentHour = Math.floor(Date.now() / 3600000);
    const currentDay = Math.floor(Date.now() / 86400000);
    
    await this.redis.hincrby(`agent:${agentId}:checks:hourly`, currentHour.toString(), 1);
    await this.redis.hincrby(`agent:${agentId}:checks:daily`, currentDay.toString(), 1);
    
    if (metrics.isAvailable) {
      await this.redis.hincrby(`agent:${agentId}:uptime:daily`, currentDay.toString(), 1);
    }
  }

  /**
   * Get previous metrics for comparison
   */
  private async getPreviousMetrics(agentId: string): Promise<AgentHealthMetrics | null> {
    const key = `agent:${agentId}:metrics:latest`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
}

/**
 * Alert Manager - Handles alert generation and management
 */
class AlertManager extends EventEmitter {
  private supabase: SupabaseClient;
  private redis: Redis;
  private config: AlertConfig;

  constructor(supabase: SupabaseClient, redis: Redis, config: AlertConfig) {
    super();
    this.supabase = supabase;
    this.redis = redis;
    this.config = config;
  }

  /**
   * Evaluate metrics and generate alerts if necessary
   */
  async evaluateMetrics(metrics: AgentHealthMetrics, creatorId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check availability
    if (!metrics.isAvailable) {
      const availabilityAlert = await this.createAlert(
        metrics.agentId,
        creatorId,
        'availability',
        this.getSeverityForFailures(metrics.consecutiveFailures),
        `Agent is unavailable. ${metrics.consecutiveFailures} consecutive failures.`
      );
      if (availabilityAlert) alerts.push(availabilityAlert);
    }

    // Check response time
    if (metrics.responseTime > this.config.responseTimeThreshold) {
      const performanceAlert = await this.createAlert(
        metrics.agentId,
        creatorId,
        'performance',
        this.getSeverityForResponseTime(metrics.responseTime),
        `High response time: ${metrics.responseTime}ms (threshold: ${this.config.responseTimeThreshold}ms)`
      );
      if (performanceAlert) alerts.push(performanceAlert);
    }

    // Check error rate
    if (metrics.errorRate > this.config.errorRateThreshold) {
      const errorAlert = await this.createAlert(
        metrics.agentId,
        creatorId,
        'error_rate',
        this.getSeverityForErrorRate(metrics.errorRate),
        `High error rate: ${metrics.errorRate.toFixed(2)}% (threshold: ${this.config.errorRateThreshold}%)`
      );
      if (errorAlert) alerts.push(errorAlert);
    }

    return alerts;
  }

  /**
   * Create an alert if cooldown period has passed
   */
  private async createAlert(
    agentId: string,
    creatorId: string,
    type: Alert['type'],
    severity: Alert['severity'],
    message: string
  ): Promise<Alert | null> {
    const cooldownKey = `alert_cooldown:${agentId}:${type}`;
    const lastAlert = await this.redis.get(cooldownKey);

    if (lastAlert && Date.now() - parseInt(lastAlert) < this.config.alertCooldown) {
      return null; // Still in cooldown
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      creatorId,
      type,
      severity,
      message,
      timestamp: new Date(),
      resolved: false
    };

    try {
      // Store in database
      await this.supabase
        .from('agent_alerts')
        .insert([{
          id: alert.id,
          agent_id: alert.agentId,
          creator_id: alert.creatorId,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          created_at: alert.timestamp.toISOString(),
          resolved: false
        }]);

      // Set cooldown
      await this.redis.setex(cooldownKey, this.config.alertCooldown / 1000, Date.now().toString());

      // Emit alert event
      this.emit('alert', alert);

      return alert;
    } catch (error) {
      console.error('Failed to create alert:', error);
      return null;
    }
  }

  /**
   * Get severity based on consecutive failures
   */
  private getSeverityForFailures(failures: number): Alert['severity'] {
    if (failures >= 10) return 'critical';
    if (failures >= 5) return 'high';
    if (failures >= 3) return 'medium';
    return 'low';
  }

  /**
   * Get severity based on response time
   */
  private getSeverityForResponseTime(responseTime: number): Alert['severity'] {
    if (responseTime > 10000) return 'critical';
    if (responseTime > 5000) return 'high';
    if (responseTime > 2000) return 'medium';
    return 'low';
  }

  /**
   * Get severity based on error rate
   */
  private getSeverityForErrorRate(errorRate: number): Alert['severity'] {
    if (errorRate > 50) return 'critical';
    if (errorRate > 25) return 'high';
    if (errorRate > 10) return 'medium';
    return 'low';
  }
}

/**
 * Notification Dispatcher - Handles alert notifications
 */
class NotificationDispatcher {
  private supabase: SupabaseClient;
  private emailTransporter: nodemailer.Transporter;
  private twilioClient: twilio.Twilio;

  constructor(
    supabase: SupabaseClient,
    emailConfig: any,
    twilioConfig: { accountSid: string; authToken: string; fromNumber: string }
  ) {
    this.supabase = supabase;
    this.emailTransporter = nodemailer.createTransporter(emailConfig);
    this.twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
  }

  /**
   * Dispatch notifications for an alert
   */
  async dispatchNotifications(alert: Alert): Promise<void> {
    try {
      // Get creator notification preferences
      const { data: preferences, error } = await this.supabase
        .from('creator_notification_preferences')
        .select('*')
        .eq('creator_id', alert.creatorId)
        .single();

      if (error || !preferences) {
        console.error('Failed to get notification preferences:', error);
        return;
      }

      // Get creator details
      const { data: creator } = await this.supabase
        .from('creators')
        .select('email, phone, name')
        .eq('id', alert.creatorId)
        .single();

      if (!creator) return;

      // Send email notification
      if (preferences.email && creator.email) {
        await this.sendEmailNotification(alert, creator);
      }

      // Send SMS notification
      if (preferences.sms && creator.phone) {
        await this.sendSMSNotification(alert, creator);
      }

      // Log notification
      await this.supabase
        .from('creator_notifications')
        .insert([{
          creator_id: alert.creatorId,
          alert_id: alert.id,
          type: 'agent_health',
          message: alert.message,
          sent_at: new Date().toISOString()
        }]);

    } catch (error) {
      console.error('Failed to dispatch notifications:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Alert, creator: any): Promise<void> {
    const subject = `🚨 Agent Health Alert - ${alert.severity.toUpperCase()}`;
    const html = `
      <h2>Agent Health Alert</h2>
      <p><strong>Agent ID:</strong> ${alert.agentId}</p>
      <p><strong>Alert Type:</strong> ${alert.type}</p>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
      <br>
      <p>Please check your agent dashboard for more details.</p>
    `;

    await this.emailTransporter.sendMail({
      from: process.env.NOTIFICATION_EMAIL_FROM,
      to: creator.email,
      subject,
      html
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(alert: Alert, creator: any): Promise<void> {
    const message = `CR AudioViz Alert: ${alert.type} issue with agent ${alert.agentId}. ${alert.message}`;

    await this.twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to: creator.phone
    });
  }
}

/**
 * WebSocket Health Broadcaster - Broadcasts real-time health updates
 */
class WebSocketHealthBroadcaster {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket>;

  constructor(port: number) {
    this.wss = new WebSocket.Server({ port });
    this.clients = new Set();

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      
      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Broadcast health metrics to connected clients
   */
  broadcastHealthMetrics(metrics: AgentHealthMetrics): void {
    const message = JSON.stringify({
      type: 'health_metrics',
      data: metrics
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast alert to connected clients
   */
  broadcastAlert(alert: Alert): void {
    const message = JSON.stringify({
      type: 'alert',
      data: alert
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Broadcast dashboard data
   */
  broadcastDashboardData(data: HealthDashboardData): void {
    const message = JSON.stringify({
      type: 'dashboard_update',
      data
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

/**
 * Uptime Calculator - Calculates uptime statistics
 */
class UptimeCalculator {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Calculate uptime for multiple time periods
   */
  async calculateUptimeStats(agentId: string): Promise<{
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    allTime: number;
  }> {
    const now = Date.now();
    const day = 86400000; // 24 hours in ms
    
    const last24Hours = await this.calculateUptimeForPeriod(agentId, now - day, now);
    const last7Days = await this.calculateUptimeForPeriod(agentId, now - (7 * day), now);
    const last30Days = await this.calculateUptimeForPeriod(agentId, now - (30 * day), now);
    const allTime = await this.calculateAllTimeUptime(agentId);

    return {
      last24Hours,
      last7Days,
      last30Days,
      allTime
    };
  }

  /**
   * Calculate uptime for a specific time period
   */
  private async calculateUptimeForPeriod(agentId: string, startTime: number, endTime: number): Promise<number> {
    const startDay = Math.floor(startTime / 86400000);
    const endDay = Math.floor(endTime / 86400000);
    
    let totalChecks = 0;
    let successfulChecks = 0;

    for (let day = startDay; day <= endDay; day++) {
      const checks = await this.redis.hget(`agent:${agentId}:checks:daily`, day.toString());
      const uptime = await this.redis.hget(`agent:${agentId}:uptime:daily`, day.toString());
      
      totalChecks += parseInt(checks || '0');
      successfulChecks += parseInt(uptime || '0');
    }

    return totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;
  }

  /**
   * Calculate all-time uptime
   */
  private async calculateAllTimeUptime(agentId: string): Promise<number> {
    const allChecks = await this.redis.hgetall(`agent:${agentId}:checks:daily`);
    const allUptime = await this.redis.hgetall(`agent:${agentId}:uptime:daily`);
    
    const totalChecks = Object.values(allChecks).reduce((sum, val) => sum + parseInt(val), 0);
    const totalUptime = Object.values(allUptime).reduce((sum, val) => sum + parseInt(val), 0);
    
    return totalChecks > 0 ? (totalUptime / totalChecks) * 100 : 100;
  }
}

/**
 * Main Health Monitor Service
 */
export class HealthMonitorService {
  private supabase: SupabaseClient;
  private redis: Redis;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private notificationDispatcher: NotificationDispatcher;
  private webSocketBroadcaster: WebSocketHealthBroadcaster;
  private uptimeCalculator: UptimeCalculator;
  private config: AlertConfig;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    // Initialize services
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });

    this.config = {
      responseTimeThreshold: 2000,
      errorRateThreshold: 10,
      maxConsecutiveFailures: 3,
      checkInterval: 30000, // 30 seconds
      alertCooldown: 300000  // 5 minutes
    };

    this.metricsCollector = new MetricsCollector(this.redis, this.supabase);
    this.alertManager = new AlertManager(this.supabase, this.redis, this.config);
    this.notificationDispatcher = new NotificationDispatcher(
      this.supabase,
      {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      },
      {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        fromNumber: process.env.TWILIO_FROM_NUMBER!
      }
    );

    this.webSocketBroadcaster = new WebSocketHealthBroadcaster(
      parseInt(process.env.WEBSOCKET_PORT || '8080')
    );

    this.uptimeCalculator = new UptimeCalculator(this.redis);

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Start the health monitoring service
   */