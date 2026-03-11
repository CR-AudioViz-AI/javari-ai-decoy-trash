# Build Infrastructure as Code Generation API

```markdown
# Infrastructure as Code Generation API

## Purpose

The Infrastructure as Code Generation API provides a streamlined interface for generating infrastructure templates based on specific requirements specified by the user. It supports multiple cloud providers and template formats, enabling users to automate the provisioning of cloud infrastructure using standardized configurations.

## Usage

To generate an infrastructure template, make a POST request to the API endpoint. This request should include the necessary parameters as specified below. Authentication and rate limiting are enforced on this API.

## Parameters/Props

The API expects a JSON payload with the following structure:

```json
{
  "provider": "aws" | "azure" | "gcp" | "kubernetes",
  "templateType": "terraform" | "cloudformation" | "kubernetes",
  "applicationName": "string",
  "requirements": {
    "compute": {
      "instances": "number",
      "instanceType": "string",
      "autoScaling": "boolean",
      "minInstances": "number (optional)",
      "maxInstances": "number (optional)"
    },
    "storage": {
      "size": "number",
      "type": "standard" | "performance" | "premium",
      "backup": "boolean",
      "encryption": "boolean"
    },
    "network": {
      "vpc": "boolean",
      "subnets": "number",
      "loadBalancer": "boolean",
      "cdn": "boolean"
    },
    "database": {
      "engine": "postgres" | "mysql" | "mongodb",
      "version": "string",
      "allocatedStorage": "number"
    }
  }
}
```

### Required Fields
- **provider**: The cloud provider (AWS, Azure, GCP, Kubernetes).
- **templateType**: The desired template format (Terraform, CloudFormation, Kubernetes).
- **applicationName**: The name of the application (1-100 alphanumeric characters, including underscores and hyphens).
- **requirements**: Detailed infrastructure requirements (compute, storage, network, database).

### Compute Requirements
- **instances**: Number of instances (1-100).
- **instanceType**: Type of instance (e.g., t2.micro).
- **autoScaling**: Enable/disable auto-scaling (default: false).
- **minInstances**: Minimum instances (optional).
- **maxInstances**: Maximum instances (optional).

### Storage Requirements
- **size**: Size of storage in GB (minimum 1).
- **type**: Type of storage (standard, performance, premium).
- **backup**: Enable/disable backup (default: true).
- **encryption**: Enable/disable encryption (default: true).

### Network Requirements
- **vpc**: Enable/disable VPC (default: true).
- **subnets**: Number of subnets (1-10).
- **loadBalancer**: Enable/disable load balancer (default: false).
- **cdn**: Enable/disable CDN (default: false).

### Database Requirements
- **engine**: Database engine (Postgres, MySQL, MongoDB).
- **version**: Instrument version string.
- **allocatedStorage**: Allocated storage in GB.

## Return Values

On a successful request, the API returns a generated infrastructure template based on the provided requirements. The response may include the following fields:

- **status**: Request status (e.g., "success" or "error").
- **template**: Generated infrastructure as code template string.
- **message**: Additional message or error description.

## Examples

### Successful Request
```bash
curl -X POST "https://api.example.com/generate/infrastructure" -H "Content-Type: application/json" -d '{
  "provider": "aws",
  "templateType": "terraform",
  "applicationName": "my-app",
  "requirements": {
    "compute": {
      "instances": 2,
      "instanceType": "t2.micro",
      "autoScaling": true
    },
    "storage": {
      "size": 100,
      "type": "standard"
    },
    "network": {
      "vpc": true,
      "subnets": 2
    },
    "database": {
      "engine": "postgres",
      "version": "13",
      "allocatedStorage": 20
    }
  }
}'
```

### Response Example
```json
{
  "status": "success",
  "template": "resource \"aws_instance\" \"example\" { ... }",
  "message": "Infrastructure template generated successfully."
}
```
```