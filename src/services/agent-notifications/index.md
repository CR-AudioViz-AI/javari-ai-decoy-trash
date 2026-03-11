# Deploy Agent Activity Notification Service

```markdown
# Agent Activity Notification Service

## Purpose
The Agent Activity Notification Service is a real-time microservice designed to monitor agent interactions, sales events, and performance milestones. It delivers notifications through WebSocket and email, allowing users to manage preferences effectively.

## Usage
To use the Agent Activity Notification Service, you must set up a WebSocket server and integrate it with Redis for caching. The service will listen for specific events related to agents and notify users based on their defined preferences.

## Parameters/Props

### NotificationPayload
The payload for notifications consists of the following properties:
- `id` (string): Unique identifier for the notification.
- `userId` (string): Identifier for the user receiving the notification.
- `agentId` (string, optional): Identifier for the related agent.
- `type` (NotificationType): Type of notification (e.g., interaction, sales).
- `priority` (NotificationPriority): Importance level of the notification.
- `title` (string): Title of the notification.
- `message` (string): Message content of the notification.
- `data` (Record<string, any>, optional): Additional data related to the notification.
- `channels` (NotificationChannel[]): Channels through which the notification should be sent.
- `templateId` (string, optional): ID of the notification template.
- `scheduledAt` (Date, optional): When the notification is scheduled to be sent.
- `expiresAt` (Date, optional): Expiration date for the notification.
- `metadata` (Record<string, any>, optional): Extra information related to the notification.

### UserPreferences
User preferences defining notification channels and types:
- `userId` (string): Identifier for the user.
- `emailEnabled` (boolean): Enable email notifications.
- `websocketEnabled` (boolean): Enable WebSocket notifications.
- `pushEnabled` (boolean): Enable push notifications.
- `agentInteractions` (boolean): Preferences for agent interactions notifications.
- `salesEvents` (boolean): Preferences for sales event notifications.
- `performanceMilestones` (boolean): Preferences for performance milestones notifications.
- `marketplaceUpdates` (boolean): Preferences for marketplace updates notifications.
- `quietHoursStart` (string, optional): Start time for quiet hours.
- `quietHoursEnd` (string, optional): End time for quiet hours.
- `timezone` (string): User's timezone.
- `frequency` ('immediate' | 'hourly' | 'daily'): Notification frequency preference.
- `updatedAt` (Date): Last update timestamp of preferences.

### AgentInteraction
Details of agent-user interactions:
- `id` (string): Unique identifier for the interaction.
- `agentId` (string): Identifier for the related agent.
- `userId` (string): Identifier for the user involved.
- `type` ('chat' | 'voice' | 'video' | 'task_completion'): Type of interaction.
- `status` ('started' | 'completed' | 'failed'): Current status of the interaction.
- `duration` (number, optional): Duration of the interaction.
- `metadata` (Record<string, any>): Additional information about the interaction.
- `createdAt` (Date): Creation timestamp of the interaction.

## Return Values
The service returns a confirmation of notifications sent, alongside any associated metadata or error messages as needed.

## Examples
### Sending a Notification
```typescript
const notification: NotificationPayload = {
    id: '123',
    userId: '456',
    agentId: '789',
    type: 'interaction',
    priority: 'high',
    title: 'New Agent Interaction',
    message: 'You have a new interaction with Agent XYZ.',
    channels: ['email', 'websocket'],
    scheduledAt: new Date(),
};

sendNotification(notification);
```

### Updating User Preferences
```typescript
const preferences: UserPreferences = {
    userId: '456',
    emailEnabled: true,
    websocketEnabled: true,
    pushEnabled: false,
    agentInteractions: true,
    salesEvents: true,
    performanceMilestones: false,
    marketplaceUpdates: false,
    timezone: 'UTC',
    frequency: 'immediate',
    updatedAt: new Date(),
};

updateUserPreferences(preferences);
```
```