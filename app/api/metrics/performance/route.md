# Create Platform Performance Metrics API

# Platform Performance Metrics API Documentation

## Purpose
The Platform Performance Metrics API allows for the collection and retrieval of performance metrics related to various services and endpoints. It provides insights into response times, error rates, resource utilization, and other critical performance indicators that help in monitoring the health and efficiency of web applications.

## Usage
The API supports two main functionalities:
1. **Submitting performance metrics**: Allows services to send their performance data.
2. **Querying metrics**: Enables clients to retrieve aggregated performance metrics based on specified parameters.

## Parameters/Props

### Submission Parameters
- `service_name` (string, required): The name of the service reporting the metrics.
- `endpoint` (string, required): The specific endpoint for which the metrics are reported.
- `method` (enum, required): The HTTP method used (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD).
- `response_time` (number, required): The time taken to respond in milliseconds.
- `status_code` (number, required): The HTTP status code returned (100-599).
- `cpu_usage` (number, optional): CPU usage percentage (0-100).
- `memory_usage` (number, optional): Memory usage in megabytes.
- `throughput` (number, optional): Requests per second.
- `error_rate` (number, optional): Percentage of requests that resulted in errors.
- `timestamp` (string, required): The time at which the metrics were captured.
- `user_id` (string, optional): ID of the user making the request.
- `session_id` (string, optional): Session identifier for tracking user sessions.
- `metadata` (object, optional): Additional custom data related to the metric.

### Query Parameters
- `service` (string, optional): Filter metrics by service name.
- `endpoint` (string, optional): Filter metrics by endpoint.
- `period` (enum, optional, default: '24h'): Time frame for metrics aggregation (1h, 6h, 24h, 7d, 30d).
- `granularity` (enum, optional, default: '5m'): Time granularity for metrics (1m, 5m, 15m, 1h, 1d).
- `metric_type` (enum, optional, default: 'all'): Type of metrics to retrieve (latency, throughput, errors, resources, all).
- `from` (string, optional): Start datetime for filtering metrics.
- `to` (string, optional): End datetime for filtering metrics.
- `limit` (number, optional, default: 1000): Maximum number of results to return (1-10,000).
- `include_percentiles` (boolean, optional, default: true): Whether to include percentile calculations.

## Return Values
- For metric submission, the API returns a confirmation of successful data submission.
- For metric queried, the API returns an array of aggregated metrics that may include:
  - Average response times (avg, p50, p95, p99)
  - Total requests and error counts
  - Resource utilization metrics (CPU, memory, throughput, etc.)

## Examples

### Submitting Metrics
```json
POST /api/metrics/performance
{
  "service_name": "UserService",
  "endpoint": "/api/users",
  "method": "GET",
  "response_time": 120,
  "status_code": 200,
  "cpu_usage": 30.5,
  "memory_usage": 150.0,
  "timestamp": "2023-10-02T14:20:00Z"
}
```

### Querying Metrics
```json
GET /api/metrics/performance?service=UserService&period=24h&limit=100
```

Response:
```json
[
  {
    "service_name": "UserService",
    "endpoint": "/api/users",
    "period": "24h",
    "avg_response_time": 125,
    "p50_response_time": 110,
    "p95_response_time": 200,
    "total_requests": 1000,
    "error_count": 20,
    "error_rate": 2.0,
    "throughput": 80,
    "cpu_avg": 35,
    "memory_avg": 160,
    "timestamp": "2023-10-02T14:20:00Z"
  }
]
```