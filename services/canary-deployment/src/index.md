# Deploy Canary Deployment Management Microservice

# Canary Deployment Management Microservice

## Purpose
The Canary Deployment Management Microservice provides a robust solution for managing canary deployments. It facilitates autonomous traffic splitting, performance monitoring, and automatic rollback capabilities, ensuring smoother and safer deployment processes.

## Usage
To deploy the Canary Deployment Microservice, ensure all dependencies are installed. Configure environment variables and initiate the server. This service can be integrated with your existing CI/CD pipeline for efficient deployment management.

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Update the configuration in `config/environment.ts`.
4. Start the server:
   ```bash
   npm start
   ```

## Parameters / Props
### Environment Variables
- **port**: The port on which the server will run.
- **environment**: The deployment environment (e.g., development, production).
- **supabaseUrl**: The URL for Supabase API.
- **supabaseServiceKey**: Service key for Supabase.
- **redisUrl**: Redis server URL.
- **kubernetesConfig**:
  - **endpoint**: Kubernetes API endpoint.
  - **token**: Kubernetes access token.
  - **namespace**: Kubernetes namespace for deployments.
- **metricsConfig**:
  - **prometheusEndpoint**: Prometheus monitoring endpoint.
  - **scrapeInterval**: Interval for scraping metrics.

### Interfaces
- **AppConfig**: Main application configuration.
- **ServiceDependencies**: Dependencies required by the service, including `database`, `redis`, `supabase`, and `canaryManager`.

## Return Values
The microservice processes canary deployments by:
- Splitting traffic between versions of applications.
- Monitoring performance metrics in real-time.
- Automatically rolling back to the previous stable version based on predefined rollback criteria.

## Examples

### Starting the Server
```bash
# Ensure environment variables are set
export PORT=3000
export SUPABASE_URL=https://your-supabase-url
export REDIS_URL=redis://localhost:6379
export KUBERNETES_ENDPOINT=https://your-k8s-endpoint
export KUBERNETES_TOKEN=your-k8s-token

# Start the service
npm start
```

### Defining a Canary Deployment
Here’s an example of how to define a canary deployment through a POST request:

```json
POST /api/deployment/canary
{
  "application": "my-app",
  "version": "1.0.1",
  "trafficSplit": {
    "canary": 10,
    "stable": 90
  },
  "rollbackCriteria": {
    "performanceThreshold": {
      "responseTime": "<300ms",
      "errorRate": "<1%"
    }
  }
}
```

### Monitoring Performance
To monitor the performance metrics:

```bash
GET /api/deployment/metrics
```

This will return the current performance metrics and status of the canaries.

## Conclusion
This microservice offers a comprehensive set of functionalities for managing canary deployments effectively. By utilizing it, developers can ensure a reliable deployment process that minimizes risks.