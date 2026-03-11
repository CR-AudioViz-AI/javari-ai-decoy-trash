```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { PartnershipMatcher } from './matching/PartnershipMatcher';
import { AlgorithmEngine } from './matching/AlgorithmEngine';
import { ContractManager } from './contracts/ContractManager';
import { CampaignTracker } from './campaigns/CampaignTracker';
import { EngagementAnalyzer } from './analytics/EngagementAnalyzer';
import { AudienceProfiler } from './demographics/AudienceProfiler';
import { ContentAlignmentScorer } from './content/ContentAlignmentScorer';
import { partnershipRoutes } from './api/routes/partnerships';
import { contractRoutes } from './api/routes/contracts';
import { campaignRoutes } from './api/routes/campaigns';
import { authMiddleware } from './middleware/auth';
import type { ServiceConfig, ServiceDependencies, HealthStatus } from './types/Service';

/**
 * Creator Brand Partnership Matching Service
 * 
 * Microservice for intelligent creator-brand partnership matching using ML algorithms.
 * Features include audience demographic analysis, content alignment scoring,
 * engagement rate optimization, contract management, and campaign tracking.
 * 
 * @example
 * ```typescript
 * const service = new CreatorPartnershipService({
 *   port: 3000,
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_ANON_KEY!,
 *   redisUrl: process.env.REDIS_URL!
 * });
 * 
 * await service.start();
 * ```
 */
class CreatorPartnershipService {
  private app: express.Application;
  private dependencies: ServiceDependencies;
  private isStarted = false;
  private readonly config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.app = express();
    this.dependencies = {} as ServiceDependencies;
    this.setupDependencies();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Initialize service dependencies
   */
  private setupDependencies(): void {
    // Database connection
    const supabase = createClient(
      this.config.supabaseUrl,
      this.config.supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // Redis connection for caching and real-time features
    const redis = new Redis(this.config.redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Core service components
    const algorithmEngine = new AlgorithmEngine(supabase, redis);
    const engagementAnalyzer = new EngagementAnalyzer(supabase);
    const audienceProfiler = new AudienceProfiler(supabase);
    const contentAlignmentScorer = new ContentAlignmentScorer(supabase);
    
    const partnershipMatcher = new PartnershipMatcher(
      algorithmEngine,
      engagementAnalyzer,
      audienceProfiler,
      contentAlignmentScorer,
      redis
    );

    const contractManager = new ContractManager(supabase, redis);
    const campaignTracker = new CampaignTracker(supabase, redis);

    this.dependencies = {
      supabase,
      redis,
      partnershipMatcher,
      contractManager,
      campaignTracker,
      engagementAnalyzer,
      audienceProfiler,
      contentAlignmentScorer
    };
  }

  /**
   * Configure Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? [/\.audioviz\.ai$/, /\.localhost$/]
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.rateLimit?.max || 1000,
      message: {
        error: 'Too many requests',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
        );
      });
      next();
    });
  }

  /**
   * Configure API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API documentation
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Creator Partnership Matching Service',
        version: '1.0.0',
        description: 'AI-powered creator-brand partnership matching with contract management and campaign tracking',
        endpoints: {
          partnerships: '/api/v1/partnerships',
          contracts: '/api/v1/contracts',
          campaigns: '/api/v1/campaigns',
          health: '/health'
        },
        documentation: '/docs'
      });
    });

    // Protected API routes
    this.app.use('/api/v1', authMiddleware);
    this.app.use('/api/v1/partnerships', partnershipRoutes(this.dependencies));
    this.app.use('/api/v1/contracts', contractRoutes(this.dependencies));
    this.app.use('/api/v1/campaigns', campaignRoutes(this.dependencies));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure global error handling
   */
  private setupErrorHandling(): void {
    // Async error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', error);

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(error.status || 500).json({
        error: error.message || 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('SIGTERM');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('SIGTERM');
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    try {
      // Test database connection
      const { error: dbError } = await this.dependencies.supabase
        .from('creator_partnerships')
        .select('id')
        .limit(1);

      if (dbError && !dbError.message.includes('relation')) {
        throw new Error(`Database connection failed: ${dbError.message}`);
      }

      // Test Redis connection
      await this.dependencies.redis.ping();

      // Start HTTP server
      const port = this.config.port || 3000;
      this.app.listen(port, () => {
        console.log(`Creator Partnership Service started on port ${port}`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(`API documentation: http://localhost:${port}/`);
        this.isStarted = true;
      });

      // Initialize background services
      await this.initializeBackgroundServices();

    } catch (error) {
      console.error('Failed to start service:', error);
      throw error;
    }
  }

  /**
   * Initialize background processing services
   */
  private async initializeBackgroundServices(): Promise<void> {
    try {
      // Start periodic partnership matching
      setInterval(async () => {
        try {
          await this.dependencies.partnershipMatcher.runPeriodicMatching();
        } catch (error) {
          console.error('Periodic matching error:', error);
        }
      }, 30 * 60 * 1000); // Every 30 minutes

      // Start campaign tracking updates
      setInterval(async () => {
        try {
          await this.dependencies.campaignTracker.updateActiveCampaigns();
        } catch (error) {
          console.error('Campaign tracking error:', error);
        }
      }, 10 * 60 * 1000); // Every 10 minutes

      console.log('Background services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize background services:', error);
    }
  }

  /**
   * Get service health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkServiceComponents()
    ]);

    const [dbHealth, redisHealth, componentsHealth] = checks;
    
    const allHealthy = checks.every(check => check.status === 'fulfilled');
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      checks: {
        database: dbHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        redis: redisHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        components: componentsHealth.status === 'fulfilled' ? 'healthy' : 'unhealthy'
      },
      ...(checks.some(check => check.status === 'rejected') && {
        errors: checks
          .filter(check => check.status === 'rejected')
          .map(check => (check as PromiseRejectedResult).reason.message)
      })
    };
  }

  /**
   * Check database connectivity
   */
  private async checkDatabaseHealth(): Promise<void> {
    const { error } = await this.dependencies.supabase
      .from('creator_partnerships')
      .select('count(*)', { count: 'exact', head: true });
    
    if (error && !error.message.includes('relation')) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedisHealth(): Promise<void> {
    const response = await this.dependencies.redis.ping();
    if (response !== 'PONG') {
      throw new Error('Redis health check failed');
    }
  }

  /**
   * Check core service components
   */
  private async checkServiceComponents(): Promise<void> {
    // Verify all required components are initialized
    const requiredComponents = [
      'partnershipMatcher',
      'contractManager',
      'campaignTracker',
      'engagementAnalyzer',
      'audienceProfiler',
      'contentAlignmentScorer'
    ];

    for (const component of requiredComponents) {
      if (!this.dependencies[component as keyof ServiceDependencies]) {
        throw new Error(`Component ${component} not initialized`);
      }
    }
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Close Redis connection
      await this.dependencies.redis.disconnect();
      
      // Note: Supabase client doesn't need explicit closing
      
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Service configuration from environment variables
const serviceConfig: ServiceConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,
  redisUrl: process.env.REDIS_URL!,
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
  }
};

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'REDIS_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  const service = new CreatorPartnershipService(serviceConfig);
  
  service.start().catch((error) => {
    console.error('Failed to start Creator Partnership Service:', error);
    process.exit(1);
  });
}

export { CreatorPartnershipService, serviceConfig };
export type { ServiceConfig, ServiceDependencies, HealthStatus };
```