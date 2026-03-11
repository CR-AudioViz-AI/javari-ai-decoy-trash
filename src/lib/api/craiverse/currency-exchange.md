# Build CRAIverse Virtual Currency Exchange API

# CRAIverse Virtual Currency Exchange API

## Purpose
The CRAIverse Virtual Currency Exchange API facilitates the exchange of virtual currencies within the CRAIverse ecosystem. It provides functionalities for exchanging currencies, adding liquidity to pools, and querying exchange rates. The API is designed to handle various order types (market and limit) and ensure data integrity through validation schemas.

## Usage
This API can be utilized in various applications where users need to exchange virtual currencies, manage liquidity pools, or fetch the current exchange rate for specific currency pairs.

## Parameters/Props

### Currency Exchange Functions

- **ExchangeRequestSchema**
  - `worldId` (string, required): A UUID representing the world context.
  - `fromCurrency` (string, required): The currency symbol from which to exchange.
  - `toCurrency` (string, required): The currency symbol to which to exchange.
  - `amount` (number, required): The amount to be exchanged.
  - `slippageTolerance` (number, optional): Acceptable slippage during the exchange (default is 0.005).
  - `orderType` (string, optional): Type of order ('market' or 'limit', default is 'market').

- **AddLiquiditySchema**
  - `worldId` (string, required): A UUID representing the world context.
  - `currencyA` (string, required): The first currency symbol to add to the liquidity pool.
  - `currencyB` (string, required): The second currency symbol to add to the liquidity pool.
  - `amountA` (number, required): The amount of currency A to add.
  - `amountB` (number, required): The amount of currency B to add.

- **PriceQuerySchema**
  - `worldId` (string, optional): A UUID representing the world context.
  - `fromCurrency` (string, optional): The currency symbol from which to check the price.
  - `toCurrency` (string, optional): The currency symbol to which to check the price.

## Return Values
The API returns structured responses depending on the executed function. Expected return values may include:

- **On Currency Exchange**:
  - `success`: Boolean indicating if the exchange was successful.
  - `exchangeRate`: Current rate of exchange.
  - `expectedAmount`: Amount received after exchange.

- **On Adding Liquidity**:
  - `success`: Boolean indicating the operation status.
  - `newLiquidityPool`: Object representing the newly created liquidity pool.

- **On Price Query**:
  - `currentRate`: Object containing current exchange rate data for queried currencies.

## Examples

### Example: Exchange Currency
```javascript
const response = await currencyExchangeAPI.exchange({
  worldId: '123e4567-e89b-12d3-a456-426614174000',
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  amount: 100,
  slippageTolerance: 0.01,
  orderType: 'market'
});
console.log(response);
```

### Example: Add Liquidity
```javascript
const response = await currencyExchangeAPI.addLiquidity({
  worldId: '123e4567-e89b-12d3-a456-426614174000',
  currencyA: 'ETH',
  currencyB: 'USDT',
  amountA: 1.5,
  amountB: 2000
});
console.log(response);
```

### Example: Query Exchange Rate
```javascript
const response = await currencyExchangeAPI.queryPrice({
  worldId: '123e4567-e89b-12d3-a456-426614174000',
  fromCurrency: 'BTC',
  toCurrency: 'USD'
});
console.log(response);
```

This API is crucial for developers and platforms looking to integrate currency exchange functionalities in the CRAIverse.