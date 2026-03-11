# Deploy Real-Time Agent Health Monitor

# Real-Time Agent Health Monitor Service

## Purpose
The Real-Time Agent Health Monitor Service continuously tracks the health metrics of marketplace agents, including their availability, response times, and error rates. It sends automated alerts to creators based on predefined configurations, enabling timely interventions to ensure optimal agent performance.

## Usage
This service is designed to be integrated into a larger platform to monitor agents and notify stakeholders effectively. It requires a connection to a Redis database for caching and a Supabase database for persisting metric data.

## Parameters/Props

### Interfaces
- **AgentHealthMetrics**
  - `agentId` (string): Unique identifier for the agent.
  - `timestamp` (Date): Timestamp of the health check.
  - `responseTime` (number): Time taken for the agent to respond.
  - `isAvailable` (boolean): Availability status of the agent.
  - `errorRate` (number): The rate of errors encountered by the agent.
  - `lastError` (string | undefined): The most recent error message (if any).
  - `uptime` (number): Percentage of time the agent has been operational.
  - `consecutiveFailures` (number): Count of consecutive failed checks.

- **AlertConfig**
  - `responseTimeThreshold` (number): Threshold for response time in milliseconds.
  - `errorRateThreshold` (number): Threshold for allowable error rate.
  - `maxConsecutiveFailures` (number): Maximum allowable consecutive failures before alerting.
  - `checkInterval` (number): Time in milliseconds between health checks.
  - `alertCooldown` (number): Time in milliseconds before repeating alerts.

- **NotificationPreferences**
  - `creatorId` (string): Identifier for the creator receiving notifications.
  - `email` (boolean): Flag for email notifications.
  - `sms` (boolean): Flag for SMS notifications.
  - `webhook` (boolean): Flag for webhook notifications.
  - `alertTypes` (string[]): List of alert types the creator wishes to receive.
  - `cooldownPeriod` (number): Cooldown period for the creator between alerts.

- **HealthDashboardData**
  - `totalAgents` (number): Total number of monitored agents.
  - `healthyAgents` (number): Count of agents that are healthy.
  - `unhealthyAgents` (number): Count of agents that are unhealthy.
  - `averageResponseTime` (number): The average response time of all agents.
  - `overallUptime` (number): Overall uptime percentage.
  - `recentAlerts` (Alert[]): List of recent alerts.
  - `agentMetrics` (AgentHealthMetrics[]): Array of collected health metrics.

### Alert
- **Alert**
  - `id` (string): Unique identifier for the alert.
  - `agentId` (string): The agent related to the alert.
  - `creatorId` (string): The creator being notified.
  - `type` ('availability' | 'performance' | 'error_rate'): Type of the alert.
  - `severity` ('low' | 'medium' | 'high' | 'critical'): Severity level of the alert.
  - `message` (string): Description of the alert.
  - `timestamp` (Date): When the alert was created.
  - `resolved` (boolean): Status indicating if the alert has been resolved.
  - `resolvedAt` (Date | undefined): Timestamp when the alert was resolved (if applicable).

## Return Values
The service functions return various outputs depending on the invoked method, including metrics on agent health, alert notifications, and dashboard data for user assessment.

## Examples
```typescript
const healthMonitor = new MetricsCollector(redisInstance, supabaseInstance);
healthMonitor.checkAgentHealth(agentId)
  .then((metrics: AgentHealthMetrics) => {
    console.log(`Metrics for agent ${agentId}:`, metrics);
  });

const alertConfig: AlertConfig = {
  responseTimeThreshold: 200,
  errorRateThreshold: 0.05,
  maxConsecutiveFailures: 3,
  checkInterval: 10000,
  alertCooldown: 300000,
};

const notificationPrefs: NotificationPreferences = {
  creatorId: "creator_123",
  email: true,
  sms: false,
  webhook: true,
  alertTypes: ["availability", "error_rate"],
  cooldownPeriod: 60000,
};
```