# Create Real-Time Revenue Tracking API

# Real-Time Revenue Tracking API

## Purpose
The Real-Time Revenue Tracking API enables users to monitor their revenue streams through a WebSocket connection. It supports various data streams such as subscriptions, one-time payments, tips, ads, and affiliate revenue, while offering granularity and forecasting options.

## Usage
To utilize the API, the server should be set up within a Next.js application. The API listens for WebSocket connections and responds to revenue queries based on user-specific parameters.

### WebSocket Connection
Establish a WebSocket connection to receive real-time updates on revenue.

### Revenue Query
Send a request to query revenue metrics based on specified parameters.

## Parameters/Props

### Revenue Query Parameters
- `period` (String, optional): Time period for revenue data. Default is `'24h'`.
  - Options: `'1h'`, `'24h'`, `'7d'`, `'30d'`, `'90d'`

- `stream` (String, optional): Specifies which revenue streams to include. Default is `'all'`.
  - Options: `'all'`, `'subscriptions'`, `'one_time'`, `'tips'`, `'ads'`, `'affiliate'`

- `forecast` (Boolean, optional): If true, includes a forecast of future revenue. Default is `false`.

- `granularity` (String, optional): Granularity of the revenue data. Default is `'hour'`.
  - Options: `'minute'`, `'hour'`, `'day'`

### WebSocket Connection Parameters
- `userId` (String): Unique identifier for the user. Required.
  
- `streams` (Array, optional): List of revenue streams to track. Default is `['all']`.

- `realtime` (Boolean, optional): Indicates if the connection should provide real-time updates. Default is `true`.

## Return Values
### Revenue Metrics
On a successful query, the API returns a `RevenueMetrics` object containing:
- `total` (Number): Total revenue over the specified period.
- `streams` (Object): Breakdown of revenue by stream type.
- `growth` (Number): Growth percentage over the period.
- `forecast` (Number, optional): Forecasted revenue for future periods.
- `breakdown` (Array): Detailed revenue information per time unit, including:
  - `timestamp` (String): Time of revenue record.
  - `amount` (Number): Amount of revenue.
  - `stream` (String): Type of revenue stream.

## Examples

### Connecting to WebSocket
```javascript
const socket = new WebSocket('ws://your-api-url:8080');
socket.onopen = () => {
  socket.send(JSON.stringify({
    userId: 'your-unique-user-id',
    streams: ['subscriptions', 'tips'],
    realtime: true
  }));
};
```

### Querying Revenue Data
```javascript
const queryRevenue = async () => {
  const response = await fetch('/api/revenue/tracking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      period: '7d',
      stream: 'all',
      forecast: true,
      granularity: 'hour'
    })
  });
  
  const data = await response.json();
  console.log(data); // Revenue metrics response
};

queryRevenue();
```

This API is beneficial for developers aiming to integrate real-time revenue tracking into their applications efficiently.