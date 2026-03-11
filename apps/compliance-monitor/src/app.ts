```typescript
/**
 * Global Payment Compliance Monitor Microservice
 * 
 * Main application entry point for the compliance monitoring service that tracks
 * payment transactions for AML, KYC, PCI DSS, and regional financial regulations
 * with automated reporting and real-time alerting.
 * 
 * @fileoverview Entry point for compliance monitoring microservice
 * @version 1.0.0
 * @author CR AudioViz AI Engineering Team
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import { Logger } from 'winston';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

// Import services
import { ComplianceEngine } from './services/ComplianceEngine';
import { AMLMonitor } from './services/AMLMonitor';
import { KYCValidator } from './services/KYCValidator';
import { PCIDSSChecker } from './services/PCIDSSChecker';
import { RegionalComplianceHandler } from './services/RegionalComplianceHandler';
import { ReportGenerator } from './services/ReportGenerator';
import { AlertManager } from './services/AlertManager';

// Import routes
import complianceRoutes from './routes/compliance';
import reportsRoutes from './routes/reports';

// Import middleware
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';

// Import models and types
import { ComplianceConfiguration, ServiceHealth, ApplicationError } from './models/ComplianceTypes';
import { createLogger } from './utils/logger';
import { TransactionProcessor } from './workers/TransactionProcessor';

// Load environment variables
dotenv.config();

/**
 * Global Payment Compliance Monitor Application
 * 
 * Orchestrates all compliance monitoring services and provides a unified
 * API for transaction compliance checking, reporting, and alerting.
 */
class ComplianceMonitorApp {
  private app: Application;
  private server: any;
  private io: SocketServer;
  private logger: Logger;
  private supabase: any;
  private redis: Redis;
  
  // Core services
  private complianceEngine!: ComplianceEngine;
  private amlMonitor!: AMLMonitor;
  private kycValidator!: KYCValidator;
  private pciDSSChecker!: PCIDSSChecker;
  private regionalHandler!: RegionalComplianceHandler;
  private reportGenerator!: ReportGenerator;
  private alertManager!: AlertManager;
  private transactionProcessor!: TransactionProcessor;

  private readonly port: number;
  private readonly environment: string;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.environment = process.env.NODE_ENV || 'development';
    this.logger = createLogger('ComplianceMonitorApp');
    
    // Initialize database connections
    this.initializeDatabase();
    this.initializeRedis();
    
    // Setup HTTP server and Socket.IO
    this.server = createServer(this.app);
    this.io = new SocketServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
      }
    });
  }

  /**
   * Initialize Supabase database connection
   */
  private initializeDatabase(): void {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
      }

      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.logger.info('Supabase database connection initialized');
    } catch (error) {
      this.logger.error('Failed to initialize database connection', error);
      throw error;
    }
  }

  /**
   * Initialize Redis connection for caching and pub/sub
   */
  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        this.logger.info('Redis connection established');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', error);
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection', error);
      throw error;
    }
  }

  /**
   * Initialize all compliance services
   */
  private async initializeServices(): Promise<void> {
    try {
      this.logger.info('Initializing compliance services...');

      // Initialize core services
      this.alertManager = new AlertManager(this.supabase, this.redis, this.io);
      this.complianceEngine = new ComplianceEngine(this.supabase, this.redis);
      this.amlMonitor = new AMLMonitor(this.supabase, this.redis);
      this.kycValidator = new KYCValidator(this.supabase, this.redis);
      this.pciDSSChecker = new PCIDSSChecker(this.supabase, this.redis);
      this.regionalHandler = new RegionalComplianceHandler(this.supabase, this.redis);
      this.reportGenerator = new ReportGenerator(this.supabase, this.redis);

      // Initialize background worker
      this.transactionProcessor = new TransactionProcessor(
        this.complianceEngine,
        this.alertManager,
        this.redis
      );

      // Configure compliance engine with all monitors
      await this.complianceEngine.configure({
        amlMonitor: this.amlMonitor,
        kycValidator: this.kycValidator,
        pciDSSChecker: this.pciDSSChecker,
        regionalHandler: this.regionalHandler,
        reportGenerator: this.reportGenerator,
        alertManager: this.alertManager
      });

      this.logger.info('All compliance services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize compliance services', error);
      throw error;
    }
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.environment === 'production' ? 100 : 1000,
      message: {
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });
      next();
    });

    // Health check endpoint
    this.app.get('/health', this.handleHealthCheck.bind(this));
    this.app.get('/health/detailed', authMiddleware, this.handleDetailedHealthCheck.bind(this));
  }

  /**
   * Configure application routes
   */
  private configureRoutes(): void {
    // API routes with authentication
    this.app.use('/api/compliance', authMiddleware, validationMiddleware, complianceRoutes);
    this.app.use('/api/reports', authMiddleware, validationMiddleware, reportsRoutes);

    // Webhook endpoints (no auth required but validated)
    this.app.post('/webhooks/transaction', validationMiddleware, this.handleTransactionWebhook.bind(this));
    
    // Real-time compliance monitoring endpoint
    this.app.get('/api/monitoring/status', authMiddleware, this.handleMonitoringStatus.bind(this));

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
      });
    });
  }

  /**
   * Configure error handling middleware
   */
  private configureErrorHandling(): void {
    this.app.use((error: ApplicationError, req: Request, res: Response, next: NextFunction) => {
      this.logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body
      });

      const statusCode = error.statusCode || 500;
      const message = this.environment === 'production' && statusCode === 500 
        ? 'Internal server error' 
        : error.message;

      res.status(statusCode).json({
        error: message,
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    });
  }

  /**
   * Configure Socket.IO for real-time updates
   */
  private configureSocketIO(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected to compliance monitoring', {
        socketId: socket.id,
        address: socket.handshake.address
      });

      // Subscribe to compliance alerts
      socket.on('subscribe:alerts', (data) => {
        const { userId, permissions } = data;
        if (permissions?.includes('compliance:monitor')) {
          socket.join('compliance-alerts');
          this.logger.info('Client subscribed to compliance alerts', { userId, socketId: socket.id });
        }
      });

      // Subscribe to transaction monitoring
      socket.on('subscribe:transactions', (data) => {
        const { userId, permissions } = data;
        if (permissions?.includes('transaction:monitor')) {
          socket.join('transaction-monitoring');
          this.logger.info('Client subscribed to transaction monitoring', { userId, socketId: socket.id });
        }
      });

      socket.on('disconnect', (reason) => {
        this.logger.info('Client disconnected', { socketId: socket.id, reason });
      });
    });
  }

  /**
   * Handle basic health check
   */
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health: ServiceHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        environment: this.environment,
        uptime: process.uptime()
      };

      res.status(200).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Service unavailable'
      });
    }
  }

  /**
   * Handle detailed health check
   */
  private async handleDetailedHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const checks = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        this.checkServicesHealth()
      ]);

      const [dbHealth, redisHealth, servicesHealth] = checks;

      const health = {
        status: checks.every(check => check.status === 'fulfilled') ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        environment: this.environment,
        uptime: process.uptime(),
        checks: {
          database: dbHealth.status === 'fulfilled' ? dbHealth.value : { status: 'unhealthy', error: (dbHealth as any).reason },
          redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { status: 'unhealthy', error: (redisHealth as any).reason },
          services: servicesHealth.status === 'fulfilled' ? servicesHealth.value : { status: 'unhealthy', error: (servicesHealth as any).reason }
        }
      };

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabaseHealth(): Promise<{ status: string; latency: number }> {
    const startTime = Date.now();
    await this.supabase.from('compliance_health_check').select('*').limit(1);
    return {
      status: 'healthy',
      latency: Date.now() - startTime
    };
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedisHealth(): Promise<{ status: string; latency: number }> {
    const startTime = Date.now();
    await this.redis.ping();
    return {
      status: 'healthy',
      latency: Date.now() - startTime
    };
  }

  /**
   * Check all services health
   */
  private async checkServicesHealth(): Promise<{ status: string; services: Record<string, string> }> {
    const services = {
      complianceEngine: this.complianceEngine ? 'healthy' : 'unhealthy',
      amlMonitor: this.amlMonitor ? 'healthy' : 'unhealthy',
      kycValidator: this.kycValidator ? 'healthy' : 'unhealthy',
      pciDSSChecker: this.pciDSSChecker ? 'healthy' : 'unhealthy',
      regionalHandler: this.regionalHandler ? 'healthy' : 'unhealthy',
      reportGenerator: this.reportGenerator ? 'healthy' : 'unhealthy',
      alertManager: this.alertManager ? 'healthy' : 'unhealthy'
    };

    const allHealthy = Object.values(services).every(status => status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services
    };
  }

  /**
   * Handle incoming transaction webhooks
   */
  private async handleTransactionWebhook(req: Request, res: Response): Promise<void> {
    try {
      const transaction = req.body;
      
      // Queue transaction for compliance processing
      await this.transactionProcessor.processTransaction(transaction);
      
      res.status(202).json({
        success: true,
        message: 'Transaction queued for compliance processing',
        transactionId: transaction.id
      });
    } catch (error) {
      this.logger.error('Transaction webhook processing failed', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process transaction webhook'
      });
    }
  }

  /**
   * Handle monitoring status requests
   */
  private async handleMonitoringStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await this.complianceEngine.getMonitoringStatus();
      res.json(status);
    } catch (error) {
      this.logger.error('Failed to get monitoring status', error);
      res.status(500).json({
        error: 'Failed to retrieve monitoring status'
      });
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        this.server.close(() => {
          this.logger.info('HTTP server closed');
        });

        // Close Socket.IO connections
        this.io.close();

        // Stop background workers
        if (this.transactionProcessor) {
          await this.transactionProcessor.shutdown();
        }

        // Close database connections
        if (this.redis) {
          await this.redis.quit();
        }

        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Start the compliance monitoring service
   */
  public async start(): Promise<void> {
    try {
      // Initialize all services
      await this.initializeServices();

      // Configure Express application
      this.configureMiddleware();
      this.configureRoutes();
      this.configureErrorHandling();
      this.configureSocketIO();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start the server
      this.server.listen(this.port, () => {
        this.logger.info('Compliance Monitor service started', {
          port: this.port,
          environment: this.environment,
          version: process.env.APP_VERSION || '1.0.0',
          processId: process.pid
        });
      });

      // Start background workers
      await this.transactionProcessor.start();

      this.logger.info('Global Payment Compliance Monitor is fully operational');

    } catch (error) {
      this.logger.error('Failed to start Compliance Monitor service', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new ComplianceMonitorApp();

// Start the service if this file is run directly
if (require.main === module) {
  app.start().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

export default app;
export { ComplianceMonitorApp };
```