```typescript
/**
 * CR AudioViz AI - Distributed Cache Management Microservice
 * 
 * Main entry point for the cache service providing distributed caching
 * with intelligent invalidation, warming strategies, and multi-tier hierarchies.
 * 
 * @fileoverview Distributed cache management microservice
 * @version 1.0.0
 * @author CR AudioViz AI Team
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createPrometheusMetrics } from 'prom-client';
import { Logger } from 'winston';
import { Server } from 'http';

// Internal imports
import { CacheManager } from './managers/CacheManager';
import { InvalidationManager } from './managers/InvalidationManager';
import { WarmingManager } from './managers/WarmingManager';
import { TierStrategy } from './strategies/TierStrategy';
import { EvictionStrategy } from './strategies/EvictionStrategy';
import { RedisAdapter } from './adapters/RedisAdapter';
import { MemcachedAdapter } from './adapters/MemcachedAdapter';
import { LocalCacheAdapter } from './adapters/LocalCacheAdapter';
import { cacheRoutes } from './routes/cache.routes';
import { healthRoutes } from './routes/health.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { cacheConfig } from './config/cache.config';
import { 
  CacheServiceConfig,
  CacheMetrics,
  ServiceStatus,
  CacheAdapter,
  CacheTier,
  ErrorResponse
} from './types/cache.types';

/**
 * Distributed Cache Service
 * 
 * Manages multi-tier distributed caching with intelligent invalidation
 * and warming strategies across the CR AudioViz platform.
 */
export class CacheService {
  private app: Application;
  private server: Server | null = null;
  private logger: Logger;
  private config: CacheServiceConfig;
  private cacheManager: CacheManager;
  private invalidationManager: InvalidationManager;
  private warmingManager: WarmingManager;
  private tierStrategy: TierStrategy;
  private evictionStrategy: EvictionStrategy;
  private adapters: Map<CacheTier, CacheAdapter> = new Map();
  private metrics: CacheMetrics;
  private isShuttingDown = false;

  constructor(config: CacheServiceConfig, logger: Logger) {
    this.app = express();
    this.logger = logger;
    this.config = config;
    this.metrics = this.initializeMetrics();
    
    this.initializeAdapters();
    this.initializeManagers();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Initialize cache metrics collection
   */
  private initializeMetrics(): CacheMetrics {
    const register = createPrometheusMetrics();
    
    return {
      cacheHits: new register.Counter({
        name: 'cache_hits_total',
        help: 'Total number of cache hits',
        labelNames: ['tier', 'key_pattern']
      }),
      cacheMisses: new register.Counter({
        name: 'cache_misses_total',
        help: 'Total number of cache misses',
        labelNames: ['tier', 'key_pattern']
      }),
      cacheOperations: new register.Histogram({
        name: 'cache_operation_duration_seconds',
        help: 'Cache operation duration',
        labelNames: ['operation', 'tier', 'status'],
        buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
      }),
      cacheSize: new register.Gauge({
        name: 'cache_size_bytes',
        help: 'Current cache size in bytes',
        labelNames: ['tier', 'adapter']
      }),
      invalidationEvents: new register.Counter({
        name: 'cache_invalidations_total',
        help: 'Total cache invalidation events',
        labelNames: ['reason', 'tier', 'pattern']
      }),
      warmingOperations: new register.Counter({
        name: 'cache_warming_operations_total',
        help: 'Total cache warming operations',
        labelNames: ['strategy', 'status']
      }),
      activeConnections: new register.Gauge({
        name: 'cache_active_connections',
        help: 'Number of active cache connections',
        labelNames: ['adapter', 'pool']
      })
    };
  }

  /**
   * Initialize cache adapters for different tiers
   */
  private initializeAdapters(): void {
    try {
      // L1 Cache - Redis Cluster (Distributed)
      const redisAdapter = new RedisAdapter({
        cluster: this.config.redis.cluster,
        nodes: this.config.redis.nodes,
        options: {
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          lazyConnect: true,
          keepAlive: true
        }
      });
      this.adapters.set(CacheTier.L1_DISTRIBUTED, redisAdapter);

      // L2 Cache - Memcached (Object Cache)
      const memcachedAdapter = new MemcachedAdapter({
        servers: this.config.memcached.servers,
        options: {
          maxExpiration: this.config.memcached.maxExpiration,
          poolSize: this.config.memcached.poolSize,
          timeout: this.config.memcached.timeout
        }
      });
      this.adapters.set(CacheTier.L2_OBJECT, memcachedAdapter);

      // L3 Cache - Local Memory (Application Cache)
      const localAdapter = new LocalCacheAdapter({
        maxSize: this.config.local.maxSize,
        ttl: this.config.local.defaultTTL,
        checkPeriod: this.config.local.checkPeriod,
        useClones: false
      });
      this.adapters.set(CacheTier.L3_LOCAL, localAdapter);

      this.logger.info('Cache adapters initialized successfully', {
        adapters: Array.from(this.adapters.keys()),
        component: 'CacheService'
      });
    } catch (error) {
      this.logger.error('Failed to initialize cache adapters', {
        error: error instanceof Error ? error.message : 'Unknown error',
        component: 'CacheService'
      });
      throw error;
    }
  }

  /**
   * Initialize cache managers and strategies
   */
  private initializeManagers(): void {
    try {
      // Initialize tier strategy
      this.tierStrategy = new TierStrategy({
        tiers: [
          { tier: CacheTier.L3_LOCAL, weight: 1, maxSize: '100MB' },
          { tier: CacheTier.L2_OBJECT, weight: 2, maxSize: '1GB' },
          { tier: CacheTier.L1_DISTRIBUTED, weight: 3, maxSize: '10GB' }
        ],
        fallbackEnabled: true,
        compressionThreshold: 1024
      });

      // Initialize eviction strategy
      this.evictionStrategy = new EvictionStrategy({
        defaultPolicy: 'LRU',
        policies: {
          'audio-data': { policy: 'LFU', priority: 'high' },
          'user-session': { policy: 'TTL', priority: 'medium' },
          'analytics': { policy: 'LRU', priority: 'low' }
        }
      });

      // Initialize cache manager
      this.cacheManager = new CacheManager({
        adapters: this.adapters,
        tierStrategy: this.tierStrategy,
        evictionStrategy: this.evictionStrategy,
        metrics: this.metrics,
        logger: this.logger
      });

      // Initialize invalidation manager
      this.invalidationManager = new InvalidationManager({
        cacheManager: this.cacheManager,
        patterns: this.config.invalidation.patterns,
        batchSize: this.config.invalidation.batchSize,
        timeout: this.config.invalidation.timeout,
        metrics: this.metrics,
        logger: this.logger
      });

      // Initialize warming manager
      this.warmingManager = new WarmingManager({
        cacheManager: this.cacheManager,
        strategies: this.config.warming.strategies,
        schedules: this.config.warming.schedules,
        concurrency: this.config.warming.concurrency,
        metrics: this.metrics,
        logger: this.logger
      });

      this.logger.info('Cache managers initialized successfully', {
        component: 'CacheService'
      });
    } catch (error) {
      this.logger.error('Failed to initialize cache managers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        component: 'CacheService'
      });
      throw error;
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
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.server.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Cache-Key', 'X-Cache-TTL']
    }));

    // Compression
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
      level: 6
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    this.app.use(metricsMiddleware(this.metrics));
    this.app.use(authMiddleware(this.config.auth));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('Request completed', {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });
      next();
    });
  }

  /**
   * Setup application routes
   */
  private setupRoutes(): void {
    // Health check endpoint (no auth required)
    this.app.use('/health', healthRoutes({
      cacheManager: this.cacheManager,
      adapters: this.adapters,
      logger: this.logger
    }));

    // Metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        const register = createPrometheusMetrics();
        const metrics = await register.metrics();
        res.set('Content-Type', register.contentType);
        res.end(metrics);
      } catch (error) {
        this.logger.error('Failed to generate metrics', { error });
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Cache management routes
    this.app.use('/api/v1/cache', cacheRoutes({
      cacheManager: this.cacheManager,
      invalidationManager: this.invalidationManager,
      warmingManager: this.warmingManager,
      metrics: this.metrics,
      logger: this.logger
    }));

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'CR AudioViz Cache Service',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          cache: '/api/v1/cache'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup global error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((
      error: Error,
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      this.logger.error('Unhandled application error', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
      });

      const errorResponse: ErrorResponse = {
        error: 'Internal Server Error',
        message: this.config.server.env === 'production' 
          ? 'An internal error occurred' 
          : error.message,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || 'unknown'
      };

      res.status(500).json(errorResponse);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
        component: 'CacheService'
      });
      
      this.gracefulShutdown('SIGTERM');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      this.logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.toString(),
        component: 'CacheService'
      });
      
      this.gracefulShutdown('SIGTERM');
    });
  }

  /**
   * Start the cache service
   */
  public async start(): Promise<void> {
    try {
      // Initialize all adapters
      for (const [tier, adapter] of this.adapters) {
        await adapter.connect();
        this.logger.info(`${tier} adapter connected successfully`);
      }

      // Start cache managers
      await this.cacheManager.initialize();
      await this.invalidationManager.start();
      await this.warmingManager.start();

      // Start HTTP server
      this.server = this.app.listen(this.config.server.port, () => {
        this.logger.info('Cache service started successfully', {
          port: this.config.server.port,
          env: this.config.server.env,
          adapters: Array.from(this.adapters.keys()),
          component: 'CacheService'
        });
      });

      // Setup graceful shutdown handlers
      process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    } catch (error) {
      this.logger.error('Failed to start cache service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        component: 'CacheService'
      });
      throw error;
    }
  }

  /**
   * Get service status
   */
  public async getStatus(): Promise<ServiceStatus> {
    const adapterStatus = new Map<CacheTier, boolean>();
    
    for (const [tier, adapter] of this.adapters) {
      try {
        adapterStatus.set(tier, await adapter.isHealthy());
      } catch {
        adapterStatus.set(tier, false);
      }
    }

    return {
      service: 'cache-service',
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      adapters: Object.fromEntries(adapterStatus),
      managers: {
        cacheManager: await this.cacheManager.isHealthy(),
        invalidationManager: await this.invalidationManager.isHealthy(),
        warmingManager: await this.warmingManager.isHealthy()
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Graceful shutdown handling
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}, starting graceful shutdown`);

    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
      }

      // Stop managers
      await Promise.all([
        this.warmingManager?.stop(),
        this.invalidationManager?.stop(),
        this.cacheManager?.shutdown()
      ]);

      // Disconnect adapters
      for (const [tier, adapter] of this.adapters) {
        try {
          await adapter.disconnect();
          this.logger.info(`${tier} adapter disconnected`);
        } catch (error) {
          this.logger.warn(`Failed to disconnect ${tier} adapter`, { error });
        }
      }

      this.logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      this.logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      process.exit(1);
    }
  }
}

/**
 * Bootstrap and start the cache service
 */
async function bootstrap(): Promise<void> {
  const winston = await import('winston');
  
  const logger = winston.createLogger({
    level: cacheConfig.logging.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]
  });

  try {
    const cacheService = new CacheService(cacheConfig, logger);
    await cacheService.start();
  } catch (error) {
    logger.error('Failed to start cache service', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  bootstrap().catch(console.error);
}

export { CacheService, bootstrap };
export default CacheService;
```