```typescript
/**
 * Security Analytics Correlation Engine
 * Main service entry point for multi-source security event correlation,
 * attack pattern detection, risk scoring, and intelligence reporting
 * 
 * @fileoverview CR AudioViz AI Security Analytics Microservice
 * @version 1.0.0
 * @author CR AudioViz AI Engineering Team
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import { EventEmitter } from 'events';
import winston from 'winston';

// Internal imports
import { PatternCorrelator } from './correlators/PatternCorrelator';
import { RiskScoreCalculator } from './analyzers/RiskScoreCalculator';
import { EventNormalizer } from './processors/EventNormalizer';
import { ThreatIntelligence } from './intelligence/ThreatIntelligence';
import { SecurityReporter } from './reporters/SecurityReporter';
import { EventStreamProcessor } from './streams/EventStreamProcessor';
import { analyticsRoutes } from './api/routes/analytics';
import { reportsRoutes } from './api/routes/reports';

/**
 * Configuration interface for the Security Analytics Engine
 */
export interface SecurityAnalyticsConfig {
  port: number;
  environment: 'development' | 'staging' | 'production';
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  elasticsearch: {
    nodes: string[];
    username?: string;
    password?: string;
    apiKey?: string;
  };
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  ml: {
    modelEndpoint: string;
    apiKey: string;
    threshold: number;
  };
  correlation: {
    timeWindow: number;
    maxEvents: number;
    confidenceThreshold: number;
  };
  alerting: {
    webhookUrl?: string;
    slackToken?: string;
    emailConfig?: {
      smtp: string;
      port: number;
      username: string;
      password: string;
    };
  };
}

/**
 * Health check response interface
 */
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  components: {
    correlator: boolean;
    riskCalculator: boolean;
    threatIntelligence: boolean;
    streamProcessor: boolean;
    reporter: boolean;
  };
  metrics: {
    eventsProcessed: number;
    patternsDetected: number;
    reportsGenerated: number;
    avgProcessingTime: number;
  };
}

/**
 * Security Analytics Engine Error
 */
export class SecurityAnalyticsError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'SecurityAnalyticsError';
  }
}

/**
 * Main Security Analytics Correlation Engine Service
 * Orchestrates security event processing, correlation, and intelligence generation
 */
export class SecurityAnalyticsEngine extends EventEmitter {
  private app: Application;
  private server: Server | null = null;
  private logger: winston.Logger;
  
  // Core components
  private patternCorrelator: PatternCorrelator;
  private riskCalculator: RiskScoreCalculator;
  private eventNormalizer: EventNormalizer;
  private threatIntelligence: ThreatIntelligence;
  private securityReporter: SecurityReporter;
  private streamProcessor: EventStreamProcessor;
  
  // Metrics
  private metrics = {
    eventsProcessed: 0,
    patternsDetected: 0,
    reportsGenerated: 0,
    totalProcessingTime: 0,
    startTime: Date.now()
  };

  /**
   * Initialize the Security Analytics Engine
   */
  constructor(private config: SecurityAnalyticsConfig) {
    super();
    
    this.setupLogger();
    this.app = express();
    this.initializeComponents();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventHandlers();
    
    this.logger.info('Security Analytics Engine initialized', { 
      environment: config.environment,
      correlationWindow: config.correlation.timeWindow 
    });
  }

  /**
   * Setup Winston logger with structured logging
   */
  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: this.config.environment === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'security-analytics-engine' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    if (this.config.environment === 'production') {
      this.logger.add(new winston.transports.File({ 
        filename: 'logs/security-analytics-error.log', 
        level: 'error' 
      }));
      this.logger.add(new winston.transports.File({ 
        filename: 'logs/security-analytics.log' 
      }));
    }
  }

  /**
   * Initialize core security analytics components
   */
  private async initializeComponents(): Promise<void> {
    try {
      this.eventNormalizer = new EventNormalizer();
      this.patternCorrelator = new PatternCorrelator(this.config.correlation);
      this.riskCalculator = new RiskScoreCalculator(this.config.ml);
      this.threatIntelligence = new ThreatIntelligence();
      this.securityReporter = new SecurityReporter(this.config.alerting);
      this.streamProcessor = new EventStreamProcessor(this.config.kafka);

      // Initialize components
      await this.threatIntelligence.initialize();
      await this.streamProcessor.initialize();
      
      this.logger.info('All security analytics components initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize components', error);
      throw new SecurityAnalyticsError(
        'Component initialization failed',
        'INIT_ERROR',
        500,
        error
      );
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.environment === 'production' ? 1000 : 10000,
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);

    // Basic middleware
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // API routes
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/reports', reportsRoutes);

    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const health = await this.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        this.logger.error('Health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed'
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (req: Request, res: Response) => {
      const uptime = Date.now() - this.metrics.startTime;
      const avgProcessingTime = this.metrics.eventsProcessed > 0 
        ? this.metrics.totalProcessingTime / this.metrics.eventsProcessed 
        : 0;

      res.json({
        eventsProcessed: this.metrics.eventsProcessed,
        patternsDetected: this.metrics.patternsDetected,
        reportsGenerated: this.metrics.reportsGenerated,
        avgProcessingTime: Math.round(avgProcessingTime * 100) / 100,
        uptime: Math.round(uptime / 1000),
        timestamp: new Date().toISOString()
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'CR AudioViz AI Security Analytics Engine',
        version: '1.0.0',
        status: 'operational',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });

      if (error instanceof SecurityAnalyticsError) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          details: error.details
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: this.config.environment === 'development' ? error.message : 'An error occurred'
        });
      }
    });
  }

  /**
   * Setup event handlers for security analytics pipeline
   */
  private setupEventHandlers(): void {
    // Stream processor events
    this.streamProcessor.on('securityEvent', async (event) => {
      await this.processSecurityEvent(event);
    });

    this.streamProcessor.on('error', (error) => {
      this.logger.error('Stream processor error', error);
      this.emit('processingError', error);
    });

    // Pattern correlator events
    this.patternCorrelator.on('patternDetected', async (pattern) => {
      this.metrics.patternsDetected++;
      this.logger.info('Attack pattern detected', { 
        patternId: pattern.id, 
        confidence: pattern.confidence 
      });
      
      await this.handlePatternDetection(pattern);
    });

    // Risk calculator events
    this.riskCalculator.on('highRiskDetected', async (assessment) => {
      this.logger.warn('High risk assessment', { 
        score: assessment.score, 
        factors: assessment.riskFactors 
      });
      
      await this.securityReporter.sendAlert({
        type: 'high_risk',
        severity: 'high',
        assessment,
        timestamp: new Date()
      });
    });

    // Reporter events
    this.securityReporter.on('reportGenerated', (report) => {
      this.metrics.reportsGenerated++;
      this.logger.info('Security report generated', { 
        reportId: report.id, 
        type: report.type 
      });
    });
  }

  /**
   * Process incoming security event through the analytics pipeline
   */
  private async processSecurityEvent(rawEvent: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Normalize the event
      const normalizedEvent = await this.eventNormalizer.normalize(rawEvent);
      
      // Correlate with existing patterns
      await this.patternCorrelator.correlateEvent(normalizedEvent);
      
      // Calculate risk score
      const riskAssessment = await this.riskCalculator.calculateRisk(normalizedEvent);
      
      // Enrich with threat intelligence
      const enrichedEvent = await this.threatIntelligence.enrichEvent(normalizedEvent);
      
      // Update metrics
      this.metrics.eventsProcessed++;
      this.metrics.totalProcessingTime += Date.now() - startTime;
      
      this.emit('eventProcessed', { event: enrichedEvent, riskAssessment });
      
    } catch (error) {
      this.logger.error('Failed to process security event', {
        error: error.message,
        eventId: rawEvent.id,
        processingTime: Date.now() - startTime
      });
      
      this.emit('processingError', { error, event: rawEvent });
    }
  }

  /**
   * Handle detected attack pattern
   */
  private async handlePatternDetection(pattern: any): Promise<void> {
    try {
      // Generate intelligence report
      const report = await this.securityReporter.generateReport({
        type: 'attack_pattern',
        pattern,
        timestamp: new Date(),
        severity: pattern.severity || 'medium'
      });

      // Send alerts based on severity
      if (pattern.severity === 'high' || pattern.severity === 'critical') {
        await this.securityReporter.sendAlert({
          type: 'attack_pattern',
          severity: pattern.severity,
          pattern,
          report,
          timestamp: new Date()
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle pattern detection', {
        error: error.message,
        patternId: pattern.id
      });
    }
  }

  /**
   * Get comprehensive health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const uptime = Date.now() - this.metrics.startTime;
    const avgProcessingTime = this.metrics.eventsProcessed > 0 
      ? this.metrics.totalProcessingTime / this.metrics.eventsProcessed 
      : 0;

    const components = {
      correlator: await this.patternCorrelator.isHealthy(),
      riskCalculator: await this.riskCalculator.isHealthy(),
      threatIntelligence: await this.threatIntelligence.isHealthy(),
      streamProcessor: await this.streamProcessor.isHealthy(),
      reporter: await this.securityReporter.isHealthy()
    };

    const allHealthy = Object.values(components).every(status => status);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime / 1000),
      components,
      metrics: {
        eventsProcessed: this.metrics.eventsProcessed,
        patternsDetected: this.metrics.patternsDetected,
        reportsGenerated: this.metrics.reportsGenerated,
        avgProcessingTime: Math.round(avgProcessingTime * 100) / 100
      }
    };
  }

  /**
   * Start the Security Analytics Engine server
   */
  public async start(): Promise<void> {
    try {
      // Start stream processing
      await this.streamProcessor.start();
      
      // Start HTTP server
      this.server = this.app.listen(this.config.port, () => {
        this.logger.info(`Security Analytics Engine started on port ${this.config.port}`, {
          environment: this.config.environment,
          processId: process.pid
        });
      });

      // Graceful shutdown handlers
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start Security Analytics Engine', error);
      throw new SecurityAnalyticsError(
        'Service startup failed',
        'STARTUP_ERROR',
        500,
        error
      );
    }
  }

  /**
   * Gracefully shutdown the service
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Security Analytics Engine...');

    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
      }

      // Stop stream processing
      await this.streamProcessor.stop();

      // Close component connections
      await this.patternCorrelator.close();
      await this.riskCalculator.close();
      await this.threatIntelligence.close();
      await this.securityReporter.close();

      this.logger.info('Security Analytics Engine shutdown complete');
      this.emit('shutdown');

    } catch (error) {
      this.logger.error('Error during shutdown', error);
      throw error;
    }
  }
}

/**
 * Default configuration factory
 */
export function createDefaultConfig(): SecurityAnalyticsConfig {
  return {
    port: parseInt(process.env.PORT || '3000'),
    environment: (process.env.NODE_ENV as any) || 'development',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    },
    elasticsearch: {
      nodes: (process.env.ELASTICSEARCH_NODES || 'http://localhost:9200').split(','),
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
      apiKey: process.env.ELASTICSEARCH_API_KEY
    },
    kafka: {
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      clientId: process.env.KAFKA_CLIENT_ID || 'security-analytics-engine',
      groupId: process.env.KAFKA_GROUP_ID || 'security-analytics'
    },
    ml: {
      modelEndpoint: process.env.ML_MODEL_ENDPOINT || 'http://localhost:5000',
      apiKey: process.env.ML_API_KEY || '',
      threshold: parseFloat(process.env.ML_THRESHOLD || '0.75')
    },
    correlation: {
      timeWindow: parseInt(process.env.CORRELATION_TIME_WINDOW || '300000'), // 5 minutes
      maxEvents: parseInt(process.env.CORRELATION_MAX_EVENTS || '10000'),
      confidenceThreshold: parseFloat(process.env.CORRELATION_CONFIDENCE_THRESHOLD || '0.8')
    },
    alerting: {
      webhookUrl: process.env.ALERT_WEBHOOK_URL,
      slackToken: process.env.SLACK_TOKEN,
      emailConfig: process.env.SMTP_HOST ? {
        smtp: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USERNAME || '',
        password: process.env.SMTP_PASSWORD || ''
      } : undefined
    }
  };
}

// Export main service class and configuration
export { SecurityAnalyticsEngine as default };
export * from './models/SecurityEvent';
export * from './models/AttackPattern';
export * from './models/RiskAssessment';
```