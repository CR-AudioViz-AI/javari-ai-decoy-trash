# Build SAP Enterprise Integration API

# SAP Enterprise Integration API Documentation

## Purpose
The SAP Enterprise Integration API facilitates communication between external applications and SAP systems. It supports various operations such as connecting to SAP, testing connections, syncing data, and disconnecting. It is designed to work with multiple modules including Finance, Inventory, and HR.

## Usage
To utilize the SAP Enterprise Integration API, send a request to the API endpoint that corresponds to the desired action. The request can be structured depending on the type of interaction (connect, test, sync, disconnect).

### Example Endpoint
```
POST /api/integrations/sap
```

## Parameters/Props
The API expects a JSON request body that adheres to the following schema:

### Request Structure
```json
{
  "action": "string",
  "module": "string (optional)",
  "config": {
    "type": "string (required)",
    "host": "string (required)",
    "port": "number (optional)",
    "client": "string (required)",
    "username": "string (required)",
    "password": "string (required)",
    "authMethod": "string (required)",
    "oauthConfig": {
      "clientId": "string",
      "clientSecret": "string",
      "tokenUrl": "string",
      "scope": "string (optional)"
    },
    "systemId": "string (optional)",
    "language": "string (default: 'EN')",
    "poolSize": "number (default: 5, min: 1, max: 10)",
    "timeout": "number (default: 30000, min: 1000, max: 300000)"
  },
  "connectionId": "string (uuid, optional)",
  "syncOptions": {
    "incremental": "boolean (default: true)",
    "batchSize": "number (min: 1, max: 1000)"
  }
}
```

### Request Fields
- `action`: Defines the operation to be performed (`connect`, `test`, `sync`, `disconnect`).
- `module`: Specifies the SAP module to be used (choices: `finance`, `inventory`, `hr`, or `all`).
- `config`: Contains connection parameters and optional OAuth configuration.
- `connectionId`: Optional identifier for an existing connection for operations like `test` or `disconnect`.
- `syncOptions`: Configuration for synchronization operations.

## Return Values
The API responds with a JSON object that includes a success status and possibly the results of the action performed:

### Response Structure
```json
{
  "status": "string", // 'success' or 'error'
  "message": "string", // descriptive message
  "data": "object (optional)" // results based on action
}
```

### Success Response Example
```json
{
  "status": "success",
  "message": "Connection established",
  "data": {
    "connectionId": "uuid-string"
  }
}
```

### Error Response Example
```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```

## Examples
### Connecting to SAP
```json
{
  "action": "connect",
  "module": "finance",
  "config": {
    "type": "cloud",
    "host": "https://example-sap.com",
    "client": "100",
    "username": "user",
    "password": "pass",
    "authMethod": "oauth",
    "oauthConfig": {
      "clientId": "client_id",
      "clientSecret": "client_secret",
      "tokenUrl": "https://example.com/token"
    }
  }
}
```

### Syncing Data
```json
{
  "action": "sync",
  "module": "inventory",
  "connectionId": "123e4567-e89b-12d3-a456-426614174000",
  "syncOptions": {
    "incremental": true,
    "batchSize": 100
  }
}
```

This concise documentation covers the main aspects of the SAP Enterprise Integration API, including its purpose, usage, parameters, return values, and examples for better understanding.