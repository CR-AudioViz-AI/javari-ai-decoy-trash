# Build Regulatory Compliance Monitoring Service

# ComplianceMonitoringService

## Purpose
The `ComplianceMonitoringService` module is designed to monitor regulatory compliance across various standards such as GDPR, HIPAA, and PCI-DSS. It provides functionalities to define compliance rules, track violations, generate reports, and manage the monitoring status.

## Usage
To utilize the `ComplianceMonitoringService`, instantiate the class and leverage its methods to create rules, report violations, and generate compliance reports. This service can integrate with Supabase for data storage and management.

## Parameters/Props
### Types
- **ComplianceRegulation**: Defines the type of compliance regulation.
  - Supported values: `'GDPR'`, `'SOC2'`, `'HIPAA'`, `'CCPA'`, `'PCI_DSS'`
  
- **ViolationSeverity**: Specifies the severity of compliance violations.
  - Supported values: `'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'`
  
- **MonitoringStatus**: Represents the status of compliance monitoring.
  - Supported values: `'ACTIVE'`, `'PAUSED'`, `'DISABLED'`, `'ERROR'`

### Interfaces
1. **ComplianceRule**
   - `id`: string - Unique identifier of the rule
   - `regulation`: ComplianceRegulation - Associated regulation
   - `category`: string - Rule category
   - `description`: string - Rule description
   - `severity`: ViolationSeverity - Severity level of violations
   - `enabled`: boolean - Rule status, true if active
   - `conditions`: Record<string, any> - Conditions under which the rule applies
   - `actions`: string[] - Actions to be performed when rule violations are detected
   - `lastUpdated`: Date - The last updated timestamp

2. **ComplianceViolation**
   - `id`: string - Unique identifier for the violation
   - `ruleId`: string - The identifier of the associated compliance rule
   - `regulation`: ComplianceRegulation - The regulatory framework violated
   - `severity`: ViolationSeverity - Severity of the violation
   - `description`: string - Description of the violation
   - `entityType`: string - The type of entity affected
   - `entityId`: string - The unique identifier of the affected entity
   - `detectedAt`: Date - Time of violation detection
   - `resolvedAt`: Date (optional) - Resolution time, if applicable
   - `status`: string - Current status: 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'FALSE_POSITIVE'
   - `metadata`: Record<string, any> - Additional metadata associated with the violation
   - `remediationSteps`: string[] - Steps to remediate the violation

3. **ComplianceReportConfig**
   - `regulation`: ComplianceRegulation (optional) - Regulation to include in the report
   - `dateRange`: { startDate: Date, endDate: Date } - Report timeframe
   - `includeMetrics`: boolean - Include compliance metrics in report
   - `includeViolations`: boolean - Include violation details in report
   - `includeRecommendations`: boolean - Include recommendations in report
   - `format`: 'PDF' | 'JSON' | 'CSV' - Output format of the report

4. **ComplianceReport**
   - `id`: string - Unique report identifier
   - `regulation`: ComplianceRegulation (optional) - Associated regulation
   - `generatedAt`: Date - Timestamp of report generation
   - `reportPeriod`: { startDate: Date, endDate: Date } - Period covered by the report
   - `summary`: { totalViolations: number, resolvedViolations: number, criticalViolations: number, complianceScore: number }
   - `violations`: ComplianceViolation[] - List of recorded violations
   - `metrics`: Record<string, any> - Associated metrics of compliance
   - `recommendations`: string[] - Suggested actions for improvement

## Examples
```typescript
import { ComplianceMonitoringService } from './src/services/compliance/ComplianceMonitoringService';

const complianceService = new ComplianceMonitoringService();

// Define a new compliance rule
const newRule: ComplianceRule = {
  id: '1',
  regulation: 'GDPR',
  category: 'Data Protection',
  description: 'Ensure user data is anonymized',
  severity: 'HIGH',
  enabled: true,
  conditions: { dataType: 'personal' },
  actions: ['notify', 'analyze'],
  lastUpdated: new Date(),
};

// Adding the rule
complianceService.addRule(newRule);

// Generating a compliance report
const reportConfig: ComplianceReportConfig = {
  regulation: 'GDPR',
  dateRange: { startDate: new Date('2023-01-01'), endDate: new Date('2023-12-31') },
  includeMetrics