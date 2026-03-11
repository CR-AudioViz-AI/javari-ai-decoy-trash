# Build Self-Healing Deployment API

# Self-Healing Deployment API Documentation

## Purpose
The Self-Healing Deployment API enables automated health monitoring and remediation of deployments. It assesses the health of deployed services based on defined metrics and thresholds, allowing for automated actions to maintain or restore service health.

## Usage
This API can be used in applications that require monitoring of service deployments, allowing for proactive management and automatic remediation based on real-time performance metrics.

## API Endpoints

### Health Check

- **Endpoint**: `/api/deployment/self-healing/health-check`
- **Method**: `POST`
- **Description**: Validate and submit health metrics for a specific deployment. Based on the provided metrics and thresholds, the system will determine the health status and potential remediation actions.

#### Parameters/Props

- **Request Body** (must conform to `HealthCheckSchema`):
  - `deploymentId`: string (UUID) - The unique identifier of the deployment.
  - `service`: string - The name of the service.
  - `environment`: enum - Must be one of `["development", "staging", "production"]`.
  - `metrics`: object (optional) - Performance metrics for the service.
    - `cpu`: number (0-100) - CPU usage percentage.
    - `memory`: number (0-100) - Memory usage percentage.
    - `responseTime`: number (min 0) - Average response time in milliseconds.
    - `errorRate`: number (0-100) - Percentage of requests that resulted in errors.
    - `requestsPerSecond`: number (min 0) - Number of requests processed per second.
    - `activeConnections`: number (min 0) - Current active connections.
  - `thresholds`: object (optional) - Custom thresholds for health assessment.
    - Includes properties for maxCpu, maxMemory, maxResponseTime, maxErrorRate, and minHealthScore, each with default values.

#### Return Values
- **Response**: Returns a `DeploymentHealth` object containing:
  - `deploymentId`: The deployment identifier.
  - `service`: The service name.
  - `environment`: The deployment environment.
  - `healthScore`: Computed health score based on metrics.
  - `status`: Current health status (`healthy`, `degraded`, `critical`, `failed`).
  - `metrics`: Health metrics submitted.
  - `anomalies`: List of detected anomalies.
  - `lastCheck`: Timestamp of the last health check.

### Remediation Action

- **Endpoint**: `/api/deployment/self-healing/remediation`
- **Method**: `POST`
- **Description**: Request a remediation action based on the health check results.

#### Parameters/Props

- **Request Body** (must conform to `RemediationSchema`):
  - `deploymentId`: string (UUID) - The unique identifier of the deployment.
  - `action`: enum - Must be one of `["rollback", "scale_up", "scale_down", "restart", "circuit_break"]`.
  - `reason`: string - Justification for the remediation action.
  - `severity`: enum - Must be one of `["low", "medium", "high", "critical"]`.
  - `autoApprove`: boolean (default: false) - If true, automatically approves the action.
  - `metadata`: object (optional) - Additional data relevant to the remediation action.

#### Return Values
- **Response**: Returns a `RemediationAction` object containing:
  - `id`: Unique identifier of the remediation action.
  - `deploymentId`: The associated deployment identifier.
  - `action`: The remediation action requested.
  - `reason`: Reason for the action.
  - `severity`: Severity level assigned to the action.
  - `status`: Current status of the remediation action (`pending`, `executing`, `completed`, `failed`).
  - `triggeredAt`: Timestamp when the action was triggered.
  - `completedAt`: Timestamp when the action was completed (if applicable).

## Examples

### Health Check Example
```json
POST /api/deployment/self-healing/health-check
{
  "deploymentId": "e2e3da9f-9b34-42af-b4a5-cbe7f115f7ec",
  "service": "my-service",
  "environment": "production",
  "metrics": {
    "cpu": 70,
    "memory": 75,
    "responseTime": 150,
    "errorRate": 2,
    "requestsPerSecond": 20,
    "activeConnections": 100
  },
  "thresholds": {
    "maxCpu": 85,
    "maxMemory": 90,
    "maxResponseTime": 2000,
    "maxErrorRate": 5,