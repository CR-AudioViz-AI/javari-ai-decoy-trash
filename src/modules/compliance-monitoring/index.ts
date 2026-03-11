import React from 'react';
import { ComplianceEngineService } from './services/ComplianceEngineService';
import { RegulatoryFrameworkService } from './services/RegulatoryFrameworkService';
import { ViolationDetectionService } from './services/ViolationDetectionService';
import { ReportingService } from './services/ReportingService';
import { RiskAssessmentService } from './services/RiskAssessmentService';
import { AuditTrailService } from './services/AuditTrailService';
import { PolicyManagementService } from './services/PolicyManagementService';
import { useComplianceScanner } from './hooks/useComplianceScanner';
import { useRegulatoryFrameworks } from './hooks/useRegulatoryFrameworks';
import { useViolationAlerts } from './hooks/useViolationAlerts';

/**
 * Regulatory framework types supported by the compliance monitoring system
 */
export enum RegulatoryFramework {
  SOX = 'sox',
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  PCI_DSS = 'pci_dss',
  SOC2 = 'soc2',
  ISO27001 = 'iso27001',
  CCPA = 'ccpa',
  NIST = 'nist'
}

/**
 * Compliance violation severity levels
 */
export enum ViolationSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * Risk assessment levels
 */
export enum RiskLevel {
  VERY_HIGH = 'very_high',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  VERY_LOW = 'very_low'
}

/**
 * Compliance monitoring status
 */
export enum ComplianceStatus {
  COMPLIANT = 'compliant',
  NON_COMPLIANT = 'non_compliant',
  PARTIALLY_COMPLIANT = 'partially_compliant',
  UNDER_REVIEW = 'under_review'
}

/**
 * Interface for regulatory framework configuration
 */
export interface RegulatoryFrameworkConfig {
  framework: RegulatoryFramework;
  name: string;
  version: string;
  enabled: boolean;
  requirements: ComplianceRequirement[];
  scanFrequency: number;
  riskWeighting: number;
}

/**
 * Interface for compliance requirements
 */
export interface ComplianceRequirement {
  id: string;
  framework: RegulatoryFramework;
  code: string;
  title: string;
  description: string;
  category: string;
  criticality: ViolationSeverity;
  automatedChecks: boolean;
  frequency: number;
}

/**
 * Interface for compliance violations
 */
export interface ComplianceViolation {
  id: string;
  requirementId: string;
  framework: RegulatoryFramework;
  severity: ViolationSeverity;
  title: string;
  description: string;
  detectedAt: Date;
  affectedAssets: string[];
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  assignedTo?: string;
  dueDate?: Date;
  evidence: ViolationEvidence[];
}

/**
 * Interface for violation evidence
 */
export interface ViolationEvidence {
  type: 'log' | 'screenshot' | 'document' | 'data';
  source: string;
  content: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

/**
 * Interface for compliance reports
 */
export interface ComplianceReport {
  id: string;
  type: 'summary' | 'detailed' | 'audit' | 'risk_assessment';
  frameworks: RegulatoryFramework[];
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  status: ComplianceStatus;
  overallScore: number;
  violations: ComplianceViolation[];
  riskAssessment: RiskAssessment;
  recommendations: string[];
  attachments: string[];
}

/**
 * Interface for risk assessment
 */
export interface RiskAssessment {
  overall: RiskLevel;
  byFramework: Record<RegulatoryFramework, RiskLevel>;
  factors: RiskFactor[];
  mitigationStrategies: MitigationStrategy[];
  score: number;
}

/**
 * Interface for risk factors
 */
export interface RiskFactor {
  id: string;
  name: string;
  description: string;
  impact: number;
  probability: number;
  riskScore: number;
  category: string;
}

/**
 * Interface for mitigation strategies
 */
export interface MitigationStrategy {
  id: string;
  riskFactorId: string;
  strategy: string;
  priority: 'high' | 'medium' | 'low';
  estimatedCost: number;
  timeframe: number;
  effectiveness: number;
}

/**
 * Interface for audit trail entries
 */
export interface AuditTrailEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  complianceRelevant: boolean;
  frameworks: RegulatoryFramework[];
}

/**
 * Interface for policy configuration
 */
export interface PolicyConfiguration {
  id: string;
  name: string;
  framework: RegulatoryFramework;
  rules: PolicyRule[];
  enabled: boolean;
  version: string;
  lastModified: Date;
  approvedBy: string;
}

/**
 * Interface for policy rules
 */
export interface PolicyRule {
  id: string;
  condition: string;
  action: 'alert' | 'block' | 'log' | 'escalate';
  severity: ViolationSeverity;
  description: string;
  enabled: boolean;
}

/**
 * Interface for compliance scanner configuration
 */
export interface ComplianceScannerConfig {
  frameworks: RegulatoryFramework[];
  scanInterval: number;
  realTimeMonitoring: boolean;
  alertThresholds: Record<ViolationSeverity, number>;
  excludedAssets: string[];
  customRules: PolicyRule[];
}

/**
 * Interface for compliance monitoring options
 */
export interface ComplianceMonitoringOptions {
  frameworks?: RegulatoryFramework[];
  enableRealTimeScanning?: boolean;
  alertNotifications?: boolean;
  autoReporting?: boolean;
  riskAssessmentFrequency?: number;
  auditTrailRetention?: number;
}

/**
 * Compliance Monitoring Module
 * Provides comprehensive regulatory compliance monitoring across multiple frameworks
 */
export class ComplianceMonitoringModule {
  private complianceEngine: ComplianceEngineService;
  private regulatoryFrameworkService: RegulatoryFrameworkService;
  private violationDetectionService: ViolationDetectionService;
  private reportingService: ReportingService;
  private riskAssessmentService: RiskAssessmentService;
  private auditTrailService: AuditTrailService;
  private policyManagementService: PolicyManagementService;
  private isInitialized: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(private options: ComplianceMonitoringOptions = {}) {
    this.complianceEngine = new ComplianceEngineService();
    this.regulatoryFrameworkService = new RegulatoryFrameworkService();
    this.violationDetectionService = new ViolationDetectionService();
    this.reportingService = new ReportingService();
    this.riskAssessmentService = new RiskAssessmentService();
    this.auditTrailService = new AuditTrailService();
    this.policyManagementService = new PolicyManagementService();
  }

  /**
   * Initialize the compliance monitoring module
   * @param config - Scanner configuration
   * @returns Promise resolving when initialization is complete
   */
  public async initialize(config?: ComplianceScannerConfig): Promise<void> {
    try {
      if (this.isInitialized) {
        throw new Error('Compliance monitoring module already initialized');
      }

      await Promise.all([
        this.complianceEngine.initialize(),
        this.regulatoryFrameworkService.loadFrameworks(),
        this.violationDetectionService.initialize(),
        this.reportingService.initialize(),
        this.riskAssessmentService.initialize(),
        this.auditTrailService.initialize(),
        this.policyManagementService.initialize()
      ]);

      if (config) {
        await this.configureScannerSettings(config);
      }

      if (this.options.enableRealTimeScanning !== false) {
        await this.startRealTimeMonitoring();
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize compliance monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure scanner settings
   * @param config - Scanner configuration
   * @returns Promise resolving when configuration is complete
   */
  public async configureScannerSettings(config: ComplianceScannerConfig): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      await this.complianceEngine.updateConfiguration(config);
      await this.violationDetectionService.updateThresholds(config.alertThresholds);
      
      if (config.customRules?.length) {
        await this.policyManagementService.addCustomRules(config.customRules);
      }
    } catch (error) {
      throw new Error(`Failed to configure scanner: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start real-time compliance monitoring
   * @returns Promise resolving when monitoring starts
   */
  public async startRealTimeMonitoring(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      await this.complianceEngine.startRealTimeScanning();
      
      // Set up periodic compliance checks
      const scanInterval = this.options.riskAssessmentFrequency || 3600000; // 1 hour default
      this.monitoringInterval = setInterval(async () => {
        await this.performComplianceScan();
      }, scanInterval);

    } catch (error) {
      throw new Error(`Failed to start real-time monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop real-time compliance monitoring
   * @returns Promise resolving when monitoring stops
   */
  public async stopRealTimeMonitoring(): Promise<void> {
    try {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }

      await this.complianceEngine.stopRealTimeScanning();
    } catch (error) {
      throw new Error(`Failed to stop real-time monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform comprehensive compliance scan
   * @param frameworks - Optional specific frameworks to scan
   * @returns Promise resolving to scan results
   */
  public async performComplianceScan(frameworks?: RegulatoryFramework[]): Promise<ComplianceReport[]> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      const targetFrameworks = frameworks || this.options.frameworks || Object.values(RegulatoryFramework);
      const scanResults = await this.complianceEngine.performFullScan(targetFrameworks);
      
      const reports: ComplianceReport[] = [];
      
      for (const framework of targetFrameworks) {
        const violations = await this.violationDetectionService.detectViolations(framework);
        const riskAssessment = await this.riskAssessmentService.assessFrameworkRisk(framework);
        
        const report: ComplianceReport = {
          id: `report-${framework}-${Date.now()}`,
          type: 'summary',
          frameworks: [framework],
          generatedAt: new Date(),
          period: {
            start: new Date(Date.now() - 86400000), // Last 24 hours
            end: new Date()
          },
          status: this.calculateComplianceStatus(violations),
          overallScore: this.calculateComplianceScore(violations, riskAssessment),
          violations,
          riskAssessment,
          recommendations: await this.generateRecommendations(violations, riskAssessment),
          attachments: []
        };

        reports.push(report);
      }

      // Store reports
      await Promise.all(reports.map(report => this.reportingService.storeReport(report)));

      return reports;
    } catch (error) {
      throw new Error(`Compliance scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get active compliance violations
   * @param frameworks - Optional framework filter
   * @param severity - Optional severity filter
   * @returns Promise resolving to active violations
   */
  public async getActiveViolations(
    frameworks?: RegulatoryFramework[],
    severity?: ViolationSeverity
  ): Promise<ComplianceViolation[]> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      return await this.violationDetectionService.getActiveViolations({
        frameworks,
        severity,
        status: 'open'
      });
    } catch (error) {
      throw new Error(`Failed to get violations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate compliance report
   * @param type - Report type
   * @param frameworks - Frameworks to include
   * @param period - Time period for report
   * @returns Promise resolving to generated report
   */
  public async generateComplianceReport(
    type: ComplianceReport['type'],
    frameworks: RegulatoryFramework[],
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      const violations = await this.violationDetectionService.getViolationsByPeriod(period);
      const riskAssessment = await this.riskAssessmentService.generateRiskAssessment(frameworks);
      
      const report: ComplianceReport = {
        id: `report-${type}-${Date.now()}`,
        type,
        frameworks,
        generatedAt: new Date(),
        period,
        status: this.calculateComplianceStatus(violations),
        overallScore: this.calculateComplianceScore(violations, riskAssessment),
        violations,
        riskAssessment,
        recommendations: await this.generateRecommendations(violations, riskAssessment),
        attachments: []
      };

      await this.reportingService.storeReport(report);
      return report;
    } catch (error) {
      throw new Error(`Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Acknowledge compliance violation
   * @param violationId - Violation identifier
   * @param assignedTo - User assigned to handle violation
   * @param dueDate - Optional due date for resolution
   * @returns Promise resolving when violation is acknowledged
   */
  public async acknowledgeViolation(
    violationId: string,
    assignedTo: string,
    dueDate?: Date
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      await this.violationDetectionService.updateViolationStatus(violationId, 'acknowledged', {
        assignedTo,
        dueDate
      });

      await this.auditTrailService.logAction('violation_acknowledged', {
        violationId,
        assignedTo,
        dueDate
      });
    } catch (error) {
      throw new Error(`Failed to acknowledge violation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Resolve compliance violation
   * @param violationId - Violation identifier
   * @param resolution - Resolution details
   * @returns Promise resolving when violation is resolved
   */
  public async resolveViolation(violationId: string, resolution: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      await this.violationDetectionService.updateViolationStatus(violationId, 'resolved', {
        resolution
      });

      await this.auditTrailService.logAction('violation_resolved', {
        violationId,
        resolution
      });
    } catch (error) {
      throw new Error(`Failed to resolve violation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get audit trail entries
   * @param filters - Optional filters for audit trail
   * @returns Promise resolving to audit trail entries
   */
  public async getAuditTrail(filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    frameworks?: RegulatoryFramework[];
  }): Promise<AuditTrailEntry[]> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      return await this.auditTrailService.getAuditTrail(filters);
    } catch (error) {
      throw new Error(`Failed to get audit trail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure policy rules
   * @param policyConfig - Policy configuration
   * @returns Promise resolving when policy is configured
   */
  public async configurePolicy(policyConfig: PolicyConfiguration): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    try {
      await this.policyManagementService.createOrUpdatePolicy(policyConfig);
      await this.complianceEngine.reloadPolicies();
    } catch (error) {
      throw new Error(`Policy configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate compliance status based on violations
   * @param violations - Array of violations
   * @returns Compliance status
   */
  private calculateComplianceStatus(violations: ComplianceViolation[]): ComplianceStatus {
    if (violations.length === 0) {
      return ComplianceStatus.COMPLIANT;
    }

    const criticalViolations = violations.filter(v => v.severity === ViolationSeverity.CRITICAL);
    const highViolations = violations.filter(v => v.severity === ViolationSeverity.HIGH);

    if (criticalViolations.length > 0) {
      return ComplianceStatus.NON_COMPLIANT;
    }

    if (highViolations.length > 0) {
      return ComplianceStatus.PARTIALLY_COMPLIANT;
    }

    return ComplianceStatus.PARTIALLY_COMPLIANT;
  }

  /**
   * Calculate compliance score
   * @param violations - Array of violations
   * @param riskAssessment - Risk assessment data
   * @returns Compliance score (0-100)
   */
  private calculateComplianceScore(
    violations: ComplianceViolation[],
    riskAssessment: RiskAssessment
  ): number {
    const baseScore = 100;
    let deductions = 0;

    violations.forEach(violation => {
      switch (violation.severity) {
        case ViolationSeverity.CRITICAL:
          deductions += 25;
          break;
        case ViolationSeverity.HIGH:
          deductions += 15;
          break;
        case ViolationSeverity.MEDIUM:
          deductions += 10;
          break;
        case ViolationSeverity.LOW:
          deductions += 5;
          break;
      }
    });

    // Factor in risk assessment score
    const riskDeduction = (100 - riskAssessment.score) * 0.3;
    deductions += riskDeduction;

    return Math.max(0, baseScore - deductions);
  }

  /**
   * Generate recommendations based on violations and risk assessment
   * @param violations - Array of violations
   * @param riskAssessment - Risk assessment data
   * @returns Array of recommendations
   */
  private async generateRecommendations(
    violations: ComplianceViolation[],
    riskAssessment: RiskAssessment
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Violation-based recommendations
    const criticalViolations = violations.filter(v => v.severity === ViolationSeverity.CRITICAL);
    if (criticalViolations.length > 0) {
      recommendations.push('Immediately address all critical compliance violations');
    }

    // Risk-based recommendations
    if (riskAssessment.overall === RiskLevel.VERY_HIGH || riskAssessment.overall === RiskLevel.HIGH) {
      recommendations.push('Implement comprehensive risk mitigation strategies');
    }

    // Framework-specific recommendations
    Object.entries(riskAssessment.byFramework).forEach(([framework, riskLevel]) => {
      if (riskLevel === RiskLevel.VERY_HIGH || riskLevel === RiskLevel.HIGH) {
        recommendations.push(`Review and strengthen ${framework.toUpperCase()} compliance measures`);
      }
    });

    return recommendations;
  }

  /**
   * Cleanup resources and stop monitoring
   * @returns Promise resolving when cleanup is complete
   */
  public async cleanup(): Promise<void> {
    try {
      await this.stopRealTimeMonitoring();
      
      await Promise.all([
        this.complianceEngine.cleanup(),
        this.violationDetectionService.cleanup(),
        this.reportingService.cleanup(),
        this.riskAssessmentService.cleanup(),
        this.auditTrailService.cleanup(),
        this.policyManagementService.cleanup()
      ]);

      this.isInitialized = false;
    } catch (error) {
      throw new Error(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export hooks for React components
export { useComplianceScanner, useRegulatoryFrameworks, useViolationAlerts };

// Default export
export default ComplianceMonitoringModule;