# Implement ERP Data Pipeline API

```markdown
# ERP Data Pipeline API

## Purpose
The ERP Data Pipeline API facilitates the extraction and configuration of data from various ERP systems such as SAP, Oracle, NetSuite, and Dynamics. It provides endpoints to manage extraction requests and create service configurations while ensuring input validation and security.

## Usage
To use the ERP Data Pipeline API, send HTTP requests to the specified endpoints, providing the necessary payloads. The API supports operations including creating ERP configurations and submitting data extraction requests.

## Endpoints
### 1. Create ERP Configuration
#### POST `/api/erp/config`
This endpoint creates a new ERP configuration.

**Request Body:**
```json
{
  "name": "Config Name",
  "type": "SAP",
  "endpoint": "https://example.com/api",
  "auth_config": {
    "type": "oauth2",
    "credentials": {
      "client_id": "your-client-id",
      "client_secret": "your-client-secret"
    }
  },
  "modules": ["Sales", "Inventory"],
  "extraction_rules": {},
  "is_active": true
}
```

**Response:**
- **201 Created**: Returns the created configuration object
- **400 Bad Request**: Validation errors

### 2. Submit Extraction Request
#### POST `/api/erp/extract`
This endpoint submits a request to extract data.

**Request Body:**
```json
{
  "erp_config_id": "a-unique-uuid",
  "modules": ["Sales"],
  "date_range": {
    "start": "2023-01-01T00:00:00Z",
    "end": "2023-01-31T23:59:59Z"
  },
  "filters": {},
  "format": "json",
  "encryption_required": true
}
```

**Response:**
- **202 Accepted**: Returns an extraction job status or ID
- **400 Bad Request**: Validation errors

## Parameters/Props
### ExtractionRequest
- `erp_config_id` (string): UUID of the ERP configuration.
- `modules` (array): List of modules to extract data from (1-10).
- `date_range` (object): Object with `start` and `end` dates in `ISO 8601` format.
- `filters` (object): Optional filters for data extraction.
- `format` (string): Desired format of the output (`json`, `csv`, `xml`).
- `encryption_required` (boolean): Indicates if encryption is needed.

### ConfigCreate
- `name` (string): Name of the configuration (1-100 characters).
- `type` (string): Type of ERP system (`SAP`, `Oracle`, `NetSuite`, `Dynamics`).
- `endpoint` (string): API endpoint URL.
- `auth_config` (object): Object detailing authentication method and credentials.
- `modules` (array): List of available modules (min 1).
- `extraction_rules` (object): Custom extraction rules.
- `is_active` (boolean): Status of the configuration (default true).

## Return Values
All endpoints return HTTP status codes along with JSON payloads containing the response data or error messages depending on the request's outcome.

## Examples
**Creating an ERP Configuration:**
```bash
curl -X POST https://yourapi.com/api/erp/config -H "Content-Type: application/json" -d '{
  "name": "Sales Data Config",
  "type": "SAP",
  "endpoint": "https://sap.example.com/api",
  "auth_config": {
    "type": "basic",
    "credentials": {
      "username": "admin",
      "password": "password"
    }
  },
  "modules": ["Sales"],
  "extraction_rules": {},
  "is_active": true
}'
```

**Submitting an Extraction Request:**
```bash
curl -X POST https://yourapi.com/api/erp/extract -H "Content-Type: application/json" -d '{
  "erp_config_id": "a-unique-uuid",
  "modules": ["Sales"],
  "date_range": {
    "start": "2023-01-01T00:00:00Z",
    "end": "2023-01-31T23:59:59Z"
  },
  "format": "json"
}'
```
```