# Create Multi-Currency Payout API

# Multi-Currency Payout API Documentation

## Purpose
The Multi-Currency Payout API enables users to initiate payouts in various currencies. It validates input for creators and converts payout amounts to the desired currency using real-time exchange rates.

## Usage
This API endpoint can be utilized in server-side applications that require multi-currency payout functionality for creators. It securely processes payout requests based on specified parameters.

## Parameters / Props

### Request Body
A valid JSON object must be sent in the request body with the following structure:

- `creator_id` (string, required): The unique UUID of the creator requesting the payout.
- `amount` (number, required): The amount to be paid out, must be positive and not exceed 1,000,000.
- `currency` (string, required): The currency code (ISO 4217 format) of the payout amount.
- `destination_currency` (string, optional): The currency code for the payout destination (ISO 4217 format).
- `payment_method` (string, required): The method for processing the payout. Acceptable values are:
  - 'stripe'
  - 'wise'
  - 'bank_transfer'
  - 'paypal'
- `destination_country` (string, required): The country code (ISO 3166-1 alpha-2) where the payout is being sent.
- `tax_form_submitted` (boolean, optional): Indicates if a tax form has been submitted.
- `compliance_verified` (boolean, optional): Indicates if compliance checks have been completed.

### Response
The API returns an object containing the results of the payout request, including:

- `success` (boolean): Indicates whether the payout was successful.
- `message` (string): Provides details about the payout status or error.
- `converted_amount` (number, optional): The amount after conversion if a different destination currency was requested.
- `exchange_rate` (number, optional): The exchange rate applied for currency conversion.
- `conversion_fee` (number, optional): Any fees incurred during currency conversion.

## Examples

### Successful Payout Request
```json
POST /api/payouts/multi-currency
{
  "creator_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 100,
  "currency": "USD",
  "destination_currency": "EUR",
  "payment_method": "stripe",
  "destination_country": "DE",
  "tax_form_submitted": true,
  "compliance_verified": true
}
```
**Response:**
```json
{
  "success": true,
  "message": "Payout processed successfully.",
  "converted_amount": 85,
  "exchange_rate": 0.85,
  "conversion_fee": 2.5
}
```

### Failed Payout Request Example
```json
POST /api/payouts/multi-currency
{
  "creator_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": -500,
  "currency": "USD",
  "destination_country": "FR"
}
```
**Response:**
```json
{
  "success": false,
  "message": "Invalid amount. Amount must be positive and not exceed 1,000,000."
}
```

## Notes
- Ensure that all environment variables (e.g., Supabase, Stripe keys) are correctly configured to use this API.
- This API handles exceptions related to fetching exchange rates gracefully, providing a fallback mechanism.