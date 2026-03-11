# Deploy Distributed Cache Management Microservice

# Distributed Cache Management Microservice Documentation

## Purpose
The Distributed Cache Management Microservice provides a robust solution for handling distributed caching with features such as intelligent invalidation, warming strategies, and support for multi-tier caching hierarchies. This service is designed to enhance performance and efficiency within the CR AudioViz platform.

## Usage
This microservice can be deployed as a standalone component in a microservices architecture. It listens for incoming requests and manages cache operations based on user-defined configurations.

### Steps to Deploy
1. **Install Dependencies**:
   Ensure all required packages such as `express`, `cors`, `helmet`, `compression`, and `winston` are installed.
   
   ```bash
   npm install express cors helmet compression express-rate-limit prom-client winston
   ```

2. **Configure Service**:
   Modify the `cache.config.ts` file to set the preferred cache strategies and adapters.

3. **Start Service**:
   Use the following command to run the service.
   ```bash
   ts-node index.ts
   ```

## Parameters/Props

### Constructor
- `CacheServiceConfig` (config): Configuration object that holds cache service settings such as:
  - `cacheAdapters`: Array of cache adapter configurations (e.g., Redis, Memcached, Local).
  - `invalidationStrategy`: Strategy for managing cache invalidation.
  - `warmingStrategy`: Strategy for preloading cache data.

### Middleware
- `authMiddleware`: Ensures secure access to cache operations.
- `metricsMiddleware`: Collects and exposes metrics for monitoring and performance analysis.

### Routes
- `cacheRoutes`: Defines endpoints for cache operations such as GET, POST, DELETE.
- `healthRoutes`: Provides health check endpoints for service uptime verification.

## Return Values
The service endpoints return JSON responses which can include:
- `CacheMetrics`: Metrics related to cache performance and usage.
- `ServiceStatus`: Indicates the operational status of the cache service (e.g., OK, DOWN).
- `ErrorResponse`: Structured error messages in case of failures (e.g., validation errors, internal server errors).

## Examples

### Starting the Service

```typescript
import { CacheService } from './path/to/CacheService';

const cacheService = new CacheService(cacheConfig);
cacheService.start(); // Starts the Express server
```

### Example Request to Retrieve Cache Metrics

```http
GET /api/cache/metrics
```

**Response:**

```json
{
  "cacheHits": 150,
  "cacheMisses": 50,
  "activeConnections": 20
}
```

### Example Request to Check Service Health

```http
GET /api/health
```

**Response:**

```json
{
  "status": "OK",
  "uptime": 3600,
  "timestamp": "2023-10-04T12:00:00Z"
}
```

This concise technical documentation provides a foundational overview of the Distributed Cache Management Microservice, its usage and core functionalities, ensuring developers can effectively deploy and interact with the service.