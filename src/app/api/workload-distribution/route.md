# Build Multi-Region Workload Distribution API

```markdown
# Multi-Region Workload Distribution API

## Purpose
The Multi-Region Workload Distribution API is designed to distribute computing workloads across multiple geographic regions based on specific requirements. It evaluates regions for capacity, cost, latency, and compliance, ensuring efficient and effective allocation of resources.

## Usage
This API accepts workload distribution requests and returns optimized region-specific allocations. It is particularly useful for applications requiring data processing across different compliance and performance specifications.

## Parameters/Props

### Request Body
The API expects a JSON object with the following structure:

```json
{
  "workloadId": "string",
  "requirements": {
    "computeUnits": "number",
    "memoryGb": "number",
    "storageGb": "number",
    "estimatedDurationHours": "number",
    "priority": "low | medium | high | critical",
    "dataResidencyRegions": ["string"],
    "complianceRequirements": ["string"],
    "maxLatencyMs": "number",
    "budgetLimit": "number"
  }
}
```

**Fields:**
- `workloadId` (string): Unique identifier for the workload (1-100 characters).
- `computeUnits` (number): Required compute units (0.1-1000).
- `memoryGb` (number): Required memory in Gigabytes (0.5-512).
- `storageGb` (number): Required storage in Gigabytes (1-10000).
- `estimatedDurationHours` (number): Estimated duration of workload in hours (0.1-168).
- `priority` (enum): Priority level of workload.
- `dataResidencyRegions` (array of strings): Optional list of regions for data residency.
- `complianceRequirements` (array of strings): Optional list of required compliance certifications.
- `maxLatencyMs` (number): Optional maximum acceptable latency in milliseconds (1-5000).
- `budgetLimit` (number): Optional budget limit for the workload.

### Response
The API returns a JSON object containing the workload distribution details:

```json
{
  "primary": {
    "regionId": "string",
    "allocation": "number"
  },
  "secondary": {
    "regionId": "string",
    "allocation": "number"
  },
  "estimatedCost": "number",
  "estimatedLatency": "number",
  "complianceStatus": "compliant | partial | non-compliant",
  "distributionId": "string"
}
```

**Fields:**
- `primary`: Object containing the primary region ID and allocation.
- `secondary`: (optional) Object containing the secondary region ID and allocation.
- `estimatedCost` (number): Estimated total cost for the workload.
- `estimatedLatency` (number): Estimated latency for execution.
- `complianceStatus` (enum): Compliance status of the distribution.
- `distributionId` (string): Unique identifier for the distribution operation.

## Examples

### Example Request
```json
{
  "workloadId": "ws-12345",
  "requirements": {
    "computeUnits": 250,
    "memoryGb": 32,
    "storageGb": 200,
    "estimatedDurationHours": 5,
    "priority": "high",
    "dataResidencyRegions": ["us-west", "eu-central"],
    "complianceRequirements": ["GDPR"],
    "maxLatencyMs": 200,
    "budgetLimit": 100
  }
}
```

### Example Response
```json
{
  "primary": {
    "regionId": "us-west-2",
    "allocation": 80
  },
  "secondary": {
    "regionId": "eu-central-1",
    "allocation": 20
  },
  "estimatedCost": 90,
  "estimatedLatency": 150,
  "complianceStatus": "compliant",
  "distributionId": "dist-78910"
}
```

This API provides a structured approach for effective workload distribution based on varying requirements and constraints.
```