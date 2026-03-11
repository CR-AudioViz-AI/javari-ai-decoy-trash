# Build Inter-Agent Message Routing API

```markdown
# Inter-Agent Message Routing API

## Purpose
The Inter-Agent Message Routing API is designed to facilitate the routing of messages between agents in a distributed system. It allows agents to send messages with different priorities, types, and delivery requirements, while also managing message persistence and encryption.

## Usage
This API is intended for backend services that need to send, route, and confirm message delivery between various agents. It utilizes Supabase for database storage and Redis for message queue management.

### Importing the API
To use the API, import it into your Next.js application:
```typescript
import { NextRequest, NextResponse } from 'next/server';
```

## Parameters / Props
The API requires several environment variables to operate:

- `SUPABASE_URL`: The URL of the Supabase instance.
- `SUPABASE_SERVICE_ROLE_KEY`: The service role key for Supabase access.
- `REDIS_URL`: The URL for the Redis instance.
- `AGENT_ENCRYPTION_KEY`: A 32-character encryption key for securing message data.

### Message Schema
#### Message Properties
- `targetAgentId` (string): UUID of the target agent.
- `payload` (object): The message content.
- `priority` (enum): Priority of the message. Options: 'low', 'normal', 'high', 'urgent'. Default: 'normal'.
- `messageType` (enum): Type of the message. Options: 'command', 'query', 'data', 'notification'.
- `requiresDeliveryConfirmation` (boolean): Indicates if delivery confirmation is needed. Default: true.
- `ttl` (number): Time-to-live for the message in seconds. Must be between 60 and 86400 seconds. Default: 3600 seconds (1 hour).
- `metadata` (object): Optional metadata related to the message.

### Delivery Confirmation Schema
#### Delivery Confirmation Properties
- `messageId` (string): UUID of the message.
- `agentId` (string): UUID of the agent.
- `status` (enum): Delivery status. Options: 'delivered', 'failed', 'acknowledged'.
- `timestamp` (string): ISO datetime of the status update.
- `errorDetails` (string): Optional details if the message delivery fails.

## Return Values
The API's response will vary based on the operation performed (e.g., successful message sending, delivery confirmations). Typical responses include:
- Acknowledgements of received messages.
- Status updates for delivered messages.
- Errors in message processing.

## Examples
### Sending a Message
```typescript
const message = {
  targetAgentId: '123e4567-e89b-12d3-a456-426614174000',
  payload: { command: 'start', parameters: {} },
  priority: 'normal',
  messageType: 'command',
  requiresDeliveryConfirmation: true,
  ttl: 3600,
};

const response = await sendMessage(message);
console.log(response); // Confirmation of message sent
```

### Delivery Confirmation
```typescript
const confirmation = {
  messageId: '987e6543-e21b-12d3-a456-426614174000',
  agentId: '123e4567-e89b-12d3-a456-426614174000',
  status: 'delivered',
  timestamp: new Date().toISOString(),
};

const response = await confirmDelivery(confirmation);
console.log(response); // Acknowledgement of delivery status
```
```