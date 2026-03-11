# Build Payment Route Optimization API

# Payment Route Optimization API Documentation

## Purpose
The Payment Route Optimization API is designed to optimize payment processing routes based on several criteria, including cost, speed, and reliability. It facilitates the selection of the best payment route for transactions based on user-specified parameters, aiming to enhance user experience and efficiency in payment processing.

## Usage
To utilize the Payment Route Optimization API, send a POST request to the endpoint with a `PaymentRouteRequest` payload. The API will return the best available payment route along with alternatives based on the scoring of routes.

### Endpoint
```
POST /api/payments/route-optimization
```

## Parameters/Props

### Request Body
The API expects a JSON object with the following structure:

```json
{
  "amount": number,
  "currency": string,
  "region": string,
  "priority": "cost" | "speed" | "balanced",
  "merchantId": string,
  "paymentMethod": string
}
```

- `amount` (number): The total amount of the transaction.
- `currency` (string): The currency code (e.g., "USD").
- `region` (string): The geographical region for the payment processing.
- `priority` (string): The priority for route selection (`cost`, `speed`, or `balanced`).
- `merchantId` (string): The unique identifier for the merchant using the service.
- `paymentMethod` (string): The payment method to be used (e.g., "credit_card").

### Response
On success, the API will return a JSON object in the following structure:

```json
{
  "primaryRoute": PaymentRoute,
  "fallbackRoutes": PaymentRoute[],
  "reasoning": string
}
```

### Response Properties

- `primaryRoute` (PaymentRoute): The optimized primary payment route.
- `fallbackRoutes` (PaymentRoute[]): An array of alternative routes.
- `reasoning` (string): Explanation of the route selection process.

### PaymentRoute
Each payment route object includes the following properties:

- `id` (string): Unique identifier for the payment route.
- `name` (string): Name of the payment processor.
- `processor` (string): Name of the payment processor service.
- `region` (string): Geographical region where the route operates.
- `supported_currencies` (string[]): List of currencies supported by the route.
- `base_fee` (number): Base fee for using the route.
- `percentage_fee` (number): Percentage fee charged for the transaction.
- `processing_time_ms` (number): Average processing time in milliseconds.
- `success_rate` (number): Success rate of the payment route.
- `is_active` (boolean): Status of the route (active/inactive).
- `regional_compliance` (boolean): Indicates if the route complies with regional regulations.
- `circuit_breaker_status` (string): Current operational status (closed/open/half-open).
- `last_failure_time` (string): Timestamp of the last failure (if applicable).
- `consecutive_failures` (number): Number of consecutive failures recorded.

## Example
### Request
```json
{
  "amount": 100,
  "currency": "USD",
  "region": "US",
  "priority": "speed",
  "merchantId": "merchant_123",
  "paymentMethod": "credit_card"
}
```

### Response
```json
{
  "primaryRoute": {
    "id": "route_1",
    "name": "FastPay",
    "processor": "Stripe",
    "region": "US",
    "supported_currencies": ["USD", "EUR"],
    "base_fee": 0.0,
    "percentage_fee": 2.9,
    "processing_time_ms": 200,
    "success_rate": 98.5,
    "is_active": true,
    "regional_compliance": true,
    "circuit_breaker_status": "closed",
    "last_failure_time": null,
    "consecutive_failures": 0
  },
  "fallbackRoutes": [
    // Additional routes based on scoring
  ],
  "reasoning": "Selected based on speed and success rate."
}
```