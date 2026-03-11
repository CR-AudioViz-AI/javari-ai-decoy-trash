# Build Creator Royalty Distribution API

# Creator Royalty Distribution API Documentation

## Purpose
The Creator Royalty Distribution API facilitates the management and distribution of royalties to creators within the blockchain ecosystem. It enables creators to define their royalty structures and distribute earnings based on predefined agreements through smart contracts and secure payments.

## Usage
This API provides endpoints to create royalty information, distribute royalties, and retrieve royalty statistics. Ensure you have the required environment variables configured before using this API.

### Environment Variables
The following environment variables must be set:
- `NEXT_PUBLIC_SUPABASE_URL`: URL for Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase.
- `STRIPE_SECRET_KEY`: Secret key for the Stripe API.
- `WEB3_RPC_URL`: JSON-RPC URL for the Ethereum network.
- `PRIVATE_KEY`: Wallet private key for blockchain interactions.
- `REDIS_HOST`: Host address for Redis.
- `REDIS_PORT`: Port for Redis.
- `REDIS_PASSWORD`: Password for Redis (if required).

## Parameters/Props

### Create Royalty
```typescript
{
  creatorId: string; // UUID of the creator
  agentId: string; // UUID of the agent handling royalties
  royaltyPercentage: number; // Percentage of royalties (0-50)
  derivativeType: 'fork' | 'remix' | 'clone' | 'adaptation'; // Type of derivative work
  parentAgentId?: string; // Optional UUID of parent agent
  blockchainAddress: string; // Blockchain address (format: 0x...)
}
```

### Distribute Royalty
```typescript
{
  distributionId: string; // UUID of the distribution record
  totalRevenue: number; // Total revenue amount (must be positive)
  currency: 'USD' | 'ETH' | 'MATIC'; // Currency type for the revenue
  source: string; // Source of the revenue
}
```

### Get Royalty Stats
```typescript
{
  creatorId: string; // UUID of the creator
  timeframe: '7d' | '30d' | 'ALL_TIME'; // Timeframe for statistics
}
```

## Return Values
- **Create Royalty**: Returns a confirmation of the created royalty structure.
- **Distribute Royalty**: Returns a success message or error details after attempting to distribute royalties.
- **Get Royalty Stats**: Returns royalty statistics including total revenues and distributions for the specified timeframe.

## Examples

### Creating a Royalty
```javascript
const createRoyaltyData = {
  creatorId: "123e4567-e89b-12d3-a456-426614174000",
  agentId: "321e4567-e89b-12d3-a456-426614174000",
  royaltyPercentage: 10,
  derivativeType: "remix",
  blockchainAddress: "0x1234567890abcdef1234567890abcdef12345678"
};
```

### Distributing Royalties
```javascript
const distributeRoyaltyData = {
  distributionId: "987e6543-e21b-12d3-a456-426614174000",
  totalRevenue: 5000,
  currency: "USD",
  source: "Sales of artwork"
};
```

### Retrieving Royalty Statistics
```javascript
const royaltyStatsQuery = {
  creatorId: "123e4567-e89b-12d3-a456-426614174000",
  timeframe: "30d"
};
```

For a successful implementation, ensure that all API requests conform to the provided schemas, and handle errors gracefully to improve user experience.