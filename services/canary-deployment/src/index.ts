```typescript
/**
 * Canary Deployment Management Microservice
 * 
 * Provides autonomous canary deployment management with traffic splitting,
 * performance monitoring, and automatic rollback capabilities.
 * 
 * @author CR AudioViz AI
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/environment';
import { DatabaseService } from './config/database';
import { DeploymentController } from './controllers/DeploymentController';
import { CanaryManager } from './services/CanaryManager';
import { TrafficSplitter } from './services/TrafficSplitter';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { RollbackTrigger } from './services/RollbackTrigger';
import { AuthMiddleware } from './middleware/auth';
import { MetricsCollector } from './utils/metrics';
import { Logger } from './utils/logger';
import { HealthChecker } from './utils/health';
import type {
  DeploymentStatus,
  CanaryConfiguration,
  PerformanceMetrics,
  RollbackCriteria
} from './types/deployment';

/**
 * Main application configuration interface
 */
interface AppConfig {
  port: number;
  environment: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  redisUrl: string;
  kubernetesConfig: {
    endpoint: string;
    token: string;
    namespace: string;
  };
  metricsConfig: {
    prometheusEndpoint: string;
    scrapeInterval: number;
  };
}

/**
 * Service dependencies interface
 */
interface ServiceDependencies {
  database: DatabaseService;
  redis: ReturnType<typeof createRedisClient>;
  supabase: ReturnType<typeof createSupabaseClient>;
  canaryManager: CanaryManager;
  trafficSplitter: TrafficSplitter;
  performanceMonitor: PerformanceMonitor;
  rollbackTrigger: RollbackTrigger;
  metricsCollector: MetricsCollector;
  authMiddleware: AuthMiddleware;
}

/**
 * WebSocket event types for real-time updates
 */
interface SocketEvents {
  'deployment:started': { deploymentId: string; status: DeploymentStatus };
  'deployment:progress': { deploymentId: string; progress: number; phase: string };
  'deployment:completed': { deploymentId: string; status: DeploymentStatus };
  'deployment:failed': { deploymentId: string; error: string };
  'deployment:rollback': { deploymentId: string; reason: string };
  'metrics:update': { deploymentId: string; metrics: PerformanceMetrics };
  'traffic:split': { deploymentId: string; splitRatio: number };
}

/**
 * Create and configure Redis client
 */
function createRedisClient() {
  const client = createClient({
    url: config.redisUrl,
    retry_delay_on_failover: 100,
    max_attempts: 3
  });

  client.on('error', (err) => {
    Logger.error('Redis connection error:', err);
  });

  client.on('connect', () => {
    Logger.info('Redis client connected');
  });

  return client;
}

/**
 * Canary Deployment Management Service
 */
export class CanaryDeploymentService {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private dependencies: ServiceDependencies;
  private healthChecker: HealthChecker;
  private isShuttingDown = false;

  constructor(private readonly appConfig: AppConfig) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? [appConfig.supabaseUrl] 
          : ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.dependencies = {} as ServiceDependencies;
    this.healthChecker = new HealthChecker();
  }

  /**
   * Initialize all service dependencies
   */
  private async initializeDependencies(): Promise<void> {
    try {
      // Initialize database connection
      this.dependencies.database = new DatabaseService({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        username: config.database.user,
        password: config.database.password,
        ssl: config.database.ssl
      });

      await this.dependencies.database.connect();

      // Initialize Redis client
      this.dependencies.redis = createRedisClient();
      await this.dependencies.redis.connect();

      // Initialize Supabase client
      this.dependencies.supabase = createSupabaseClient(
        this.appConfig.supabaseUrl,
        this.appConfig.supabaseServiceKey
      );

      // Initialize metrics collector
      this.dependencies.metricsCollector = new MetricsCollector({
        prometheusEndpoint: this.appConfig.metricsConfig.prometheusEndpoint,
        scrapeInterval: this.appConfig.metricsConfig.scrapeInterval
      });

      // Initialize core services
      this.dependencies.trafficSplitter = new TrafficSplitter({
        kubernetesConfig: this.appConfig.kubernetesConfig,
        redis: this.dependencies.redis
      });

      this.dependencies.performanceMonitor = new PerformanceMonitor({
        metricsCollector: this.dependencies.metricsCollector,
        database: this.dependencies.database,
        io: this.io
      });

      this.dependencies.rollbackTrigger = new RollbackTrigger({
        performanceMonitor: this.dependencies.performanceMonitor,
        trafficSplitter: this.dependencies.trafficSplitter,
        database: this.dependencies.database,
        io: this.io
      });

      this.dependencies.canaryManager = new CanaryManager({
        database: this.dependencies.database,
        redis: this.dependencies.redis,
        trafficSplitter: this.dependencies.trafficSplitter,
        performanceMonitor: this.dependencies.performanceMonitor,
        rollbackTrigger: this.dependencies.rollbackTrigger,
        io: this.io
      });

      // Initialize auth middleware
      this.dependencies.authMiddleware = new AuthMiddleware({
        supabase: this.dependencies.supabase,
        redis: this.dependencies.redis
      });

      Logger.info('All service dependencies initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize service dependencies:', error);
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
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "https:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production'
        ? [this.appConfig.supabaseUrl]
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api', limiter);

    // Body parsing and compression
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (msg) => Logger.info(msg.trim()) }
    }));

    // Health check endpoint (before auth)
    this.app.get('/health', async (req, res) => {
      const health = await this.healthChecker.check({
        database: this.dependencies.database,
        redis: this.dependencies.redis,
        supabase: this.dependencies.supabase
      });

      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.dependencies.metricsCollector.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        Logger.error('Error retrieving metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Configure API routes
   */
  private configureRoutes(): void {
    const deploymentController = new DeploymentController(
      this.dependencies.canaryManager,
      this.dependencies.authMiddleware
    );

    // API routes with authentication
    this.app.use('/api/deployments', deploymentController.router);

    // Deployment management routes
    this.app.get('/api/deployments', 
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.listDeployments.bind(deploymentController)
    );

    this.app.post('/api/deployments',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.createDeployment.bind(deploymentController)
    );

    this.app.get('/api/deployments/:id',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.getDeployment.bind(deploymentController)
    );

    this.app.patch('/api/deployments/:id/traffic',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.updateTrafficSplit.bind(deploymentController)
    );

    this.app.post('/api/deployments/:id/rollback',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.rollbackDeployment.bind(deploymentController)
    );

    this.app.delete('/api/deployments/:id',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.deleteDeployment.bind(deploymentController)
    );

    // Metrics and monitoring routes
    this.app.get('/api/deployments/:id/metrics',
      this.dependencies.authMiddleware.authenticate.bind(this.dependencies.authMiddleware),
      deploymentController.getDeploymentMetrics.bind(deploymentController)
    );

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
      });
    });

    // Global error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      Logger.error('Unhandled error:', err);
      
      if (res.headersSent) {
        return next(err);
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' 
          ? 'Something went wrong' 
          : err.message
      });
    });
  }

  /**
   * Configure WebSocket connections
   */
  private configureWebSocket(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const user = await this.dependencies.authMiddleware.verifyToken(token);
        socket.data.user = user;
        next();
      } catch (error) {
        Logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      Logger.info(`Client connected: ${socket.id}`);

      socket.on('subscribe:deployment', (deploymentId: string) => {
        socket.join(`deployment:${deploymentId}`);
        Logger.info(`Client ${socket.id} subscribed to deployment ${deploymentId}`);
      });

      socket.on('unsubscribe:deployment', (deploymentId: string) => {
        socket.leave(`deployment:${deploymentId}`);
        Logger.info(`Client ${socket.id} unsubscribed from deployment ${deploymentId}`);
      });

      socket.on('disconnect', (reason) => {
        Logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      socket.on('error', (error) => {
        Logger.error(`WebSocket error for client ${socket.id}:`, error);
      });
    });
  }

  /**
   * Setup Supabase real-time subscriptions
   */
  private setupRealtimeSubscriptions(): void {
    // Subscribe to deployment status changes
    this.dependencies.supabase
      .channel('deployment-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'canary_deployments'
      }, (payload) => {
        const deployment = payload.new as any;
        this.io.to(`deployment:${deployment.id}`).emit('deployment:status', {
          deploymentId: deployment.id,
          status: deployment.status,
          progress: deployment.progress,
          phase: deployment.current_phase
        });
      })
      .subscribe((status) => {
        Logger.info('Supabase subscription status:', status);
      });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      Logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(() => {
        Logger.info('HTTP server closed');
      });

      // Close WebSocket connections
      this.io.close(() => {
        Logger.info('WebSocket server closed');
      });

      // Cleanup services
      try {
        await this.dependencies.canaryManager?.shutdown();
        await this.dependencies.performanceMonitor?.shutdown();
        await this.dependencies.rollbackTrigger?.shutdown();
        await this.dependencies.database?.disconnect();
        await this.dependencies.redis?.quit();
        
        Logger.info('All services shut down gracefully');
        process.exit(0);
      } catch (error) {
        Logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Start the canary deployment service
   */
  public async start(): Promise<void> {
    try {
      Logger.info('Starting Canary Deployment Management Service...');

      // Initialize dependencies
      await this.initializeDependencies();

      // Configure middleware and routes
      this.configureMiddleware();
      this.configureRoutes();
      this.configureWebSocket();

      // Setup real-time subscriptions
      this.setupRealtimeSubscriptions();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start server
      await new Promise<void>((resolve) => {
        this.server.listen(this.appConfig.port, () => {
          Logger.info(`🚀 Canary Deployment Service running on port ${this.appConfig.port}`);
          Logger.info(`📊 Health check available at http://localhost:${this.appConfig.port}/health`);
          Logger.info(`📈 Metrics available at http://localhost:${this.appConfig.port}/metrics`);
          resolve();
        });
      });

      // Start background services
      await this.dependencies.performanceMonitor.start();
      await this.dependencies.rollbackTrigger.start();

      Logger.info('✅ Canary Deployment Management Service started successfully');

    } catch (error) {
      Logger.error('❌ Failed to start Canary Deployment Management Service:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the service and cleanup resources
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    Logger.info('Stopping Canary Deployment Management Service...');
    await this.cleanup();
    Logger.info('✅ Service stopped successfully');
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    const cleanupTasks = [
      () => this.server?.close(),
      () => this.io?.close(),
      () => this.dependencies.canaryManager?.shutdown(),
      () => this.dependencies.performanceMonitor?.shutdown(),
      () => this.dependencies.rollbackTrigger?.shutdown(),
      () => this.dependencies.database?.disconnect(),
      () => this.dependencies.redis?.quit()
    ];

    await Promise.allSettled(
      cleanupTasks.map(task => 
        Promise.resolve().then(() => task?.())
      )
    );
  }
}

/**
 * Application entry point
 */
async function main(): Promise<void> {
  try {
    const service = new CanaryDeploymentService({
      port: parseInt(process.env.PORT || '8080'),
      environment: process.env.NODE_ENV || 'development',
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      kubernetesConfig: {
        endpoint: process.env.K8S_ENDPOINT!,
        token: process.env.K8S_TOKEN!,
        namespace: process.env.K8S_NAMESPACE || 'default'
      },
      metricsConfig: {
        prometheusEndpoint: process.env.PROMETHEUS_ENDPOINT || 'http://localhost:9090',
        scrapeInterval: parseInt(process.env.METRICS_SCRAPE_INTERVAL || '30000')
      }
    });

    await service.start();

  } catch (error) {
    Logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    Logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export default CanaryDeploymentService;
export type { AppConfig, ServiceDependencies, SocketEvents };
```