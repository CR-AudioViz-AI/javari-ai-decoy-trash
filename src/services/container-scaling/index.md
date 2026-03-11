# Deploy Intelligent Container Scaling Service

# Intelligent Container Scaling Service

## Purpose

The Intelligent Container Scaling Service is designed to provide real-time metrics collection and analysis for containerized environments, enabling predictive scaling based on historical data, implementing cost optimization algorithms, and supporting both Kubernetes and Docker environments with various scaling strategies.

## Usage

To deploy the Intelligent Container Scaling Service, ensure that your environment has Node.js installed. Then, you can run this microservice using the command:

```bash
npm start
```

Upon starting, the service will listen for incoming requests and websocket connections.

## Parameters/Props

### Core Interfaces

#### ResourceMetrics

- **containerId**: `string` - Unique identifier for the container.
- **containerName**: `string` - Name of the container.
- **namespace**: `string` (optional) - Kubernetes namespace where the container is deployed.
- **timestamp**: `Date` - The time at which the metrics are collected.
- **cpu**:
  - **usage**: `number` - CPU usage percentage (0-100).
  - **cores**: `number` - Number of CPU cores allocated.
  - **throttling**: `number` - Number of CPU throttling events.
- **memory**:
  - **usage**: `number` - Memory usage in MB.
  - **limit**: `number` - Memory limit in MB.
  - **utilization**: `number` - Memory utilization percentage.
- **network**:
  - **rxBytes**: `number` - Received bytes over the network.
  - **txBytes**: `number` - Transmitted bytes over the network.
  - **connections**: `number` - Number of active connections.
- **disk**:
  - **usage**: `number` - Disk usage in MB.
  - **iops**: `number` - I/O operations per second.
- **replicas**: `number` (optional) - Current replica count (for horizontal scaling).

#### ScalingPolicy

- **id**: `string` - Unique identifier for the scaling policy.
- **name**: `string` - Name of the scaling policy.
- **enabled**: `boolean` - Indicates if the policy is active.
- **containerSelector**:
  - **namespace**: `string` (optional) - Selects containers in a specific namespace.
  - **labels**: `Record<string, string>` (optional) - Selector for specific container labels.
  - **name**: `string` (optional) - Name of the container to select.
- **scalingRules**:
  - **horizontal**:
    - **enabled**: `boolean` - Toggle for horizontal scaling.
    - **minReplicas**: `number` - Minimum number of replicas for scaling.
    - **maxReplicas**: `number` - Maximum number of replicas for scaling.

## Return Values

The service does not return values directly as it operates via HTTP endpoints and WebSocket connections but provides real-time metrics to clients and updates scaling policies through the defined interfaces.

## Examples

### Example of Collecting Metrics

To collect metrics, configure your monitoring setup to call the relevant endpoints of this service and pass the required `ResourceMetrics` data in your payload.

### Example of Creating a Scaling Policy

To create a scaling policy, send a POST request to the scaling policy endpoint with the following JSON body:

```json
{
  "id": "policy1",
  "name": "ScaleUpPolicy",
  "enabled": true,
  "containerSelector": {
    "namespace": "default",
    "labels": {
      "app": "my-app"
    },
    "name": "my-container"
  },
  "scalingRules": {
    "horizontal": {
      "enabled": true,
      "minReplicas": 1,
      "maxReplicas": 5
    }
  }
}
``` 

This will create a horizontal scaling policy for the specified container.