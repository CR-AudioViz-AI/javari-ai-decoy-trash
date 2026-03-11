# Create Automated Royalty Distribution API

# Automated Royalty Distribution API

## Purpose
The Automated Royalty Distribution API is designed to facilitate the processing and distribution of royalties to creators based on their track usage metrics. It allows for flexible calculation of royalty shares according to defined collaboration agreements, enabling accurate payouts to involved parties.

## Usage
To utilize the API, send a POST request to the `/api/royalty/distribute` endpoint with the relevant parameters outlined below. The API supports optional dry runs to simulate payouts without actual transactions.

## Parameters/Props
The API accepts the following parameters in the request body:

- **period_start** (string): The start date of the royalty distribution period in ISO 8601 format.
- **period_end** (string): The end date of the royalty distribution period in ISO 8601 format.
- **payment_batch_id** (string, optional): A UUID to identify the payment batch for tracking.
- **dry_run** (boolean, default: false): If true, the API simulates the royalty distribution process without executing transactions.
- **creator_ids** (array of strings, optional): An array of UUIDs representing the creators for whom payouts are to be calculated.
- **minimum_payout_amount** (number, default: 10): The minimum amount required for a successful payout.

## Return Values
The API returns a JSON object containing the following:

- **success** (boolean): Indicates whether the royalty distribution was successful.
- **payments** (array of PaymentResult): An array of payment results for each creator, including payout amounts and transaction statuses.
- **calculations** (array of RoyaltyCalculation): Detailed calculations for royalties per creator, showing how amounts were derived and the associated usage metrics summary.
- **message** (string, optional): Any additional information or error messages regarding the request.

## Examples
### Successful Payment Distribution
```json
POST /api/royalty/distribute
{
  "period_start": "2023-10-01T00:00:00Z",
  "period_end": "2023-10-31T23:59:59Z",
  "dry_run": false,
  "creator_ids": ["id1", "id2"],
  "minimum_payout_amount": 10
}
```
**Response:**
```json
{
  "success": true,
  "payments": [
    {
      "creator_id": "id1",
      "amount": 100,
      "status": "success",
      "payment_method": "stripe",
      "transaction_id": "txn_1A2B3C4D5E"
    },
    {
      "creator_id": "id2",
      "amount": 50,
      "status": "success",
      "payment_method": "paypal",
      "transaction_id": "txn_5D6E7F8G9H"
    }
  ],
  "calculations": [
    {
      "creator_id": "id1",
      "track_id": "track_1",
      "base_amount": 100,
      "split_percentage": 0.7,
      "final_amount": 70,
      "fees_deducted": 3.5,
      "net_payout": 66.5,
      "metrics_summary": {
        "total_plays": 1000,
        "total_revenue": 200
      }
    }
  ],
  "message": "Royalty distribution was successful."
}
```

### Dry Run Example
```json
POST /api/royalty/distribute
{
  "period_start": "2023-10-01T00:00:00Z",
  "period_end": "2023-10-31T23:59:59Z",
  "dry_run": true
}
```
**Response:**
```json
{
  "success": true,
  "payments": [],
  "calculations": [...],
  "message": "Dry run completed; no payments processed."
}
```

This API provides an effective mechanism for automating the royalty distribution process while ensuring compliance with specified agreements and maintaining financial accuracy.