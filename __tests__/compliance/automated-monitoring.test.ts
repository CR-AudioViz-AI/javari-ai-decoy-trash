```typescript
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ComplianceMonitor,
  GDPRComplianceEngine,
  HIPAAComplianceEngine,
  SOXComplianceEngine,
  ComplianceReportGenerator,
  AlertSystem,
  AuditTrailManager,
  ComplianceDashboard,
  DataRetentionManager,
  ConsentManager,
  AccessControlMonitor,
  EncryptionValidator,
  ViolationDetector
} from '../../src/compliance/automated-monitoring';

// Mock external dependencies
jest.mock('../../src/database/supabase');
jest.mock('../../src/services/notification-service');
jest.mock('../../src/services/document-service');
jest.mock('../../src/services/security-scanner');
jest.mock('../../src/integrations/regulatory-apis');

// Mock data factories
const mockGDPRData = {
  personalData: {
    userId: 'user-123',
    email: 'test@example.com',
    name: 'John Doe',
    location: 'EU',
    dataCategories: ['personal', 'behavioral'],
    processingBasis: 'consent',
    consentTimestamp: new Date('2024-01-01T00:00:00Z')
  },
  violation: {
    type: 'data_retention',
    description: 'Data retained beyond legal limit',
    severity: 'high',
    affectedRecords: 150,
    detectedAt: new Date()
  }
};

const mockHIPAAData = {
  protectedHealthInfo: {
    patientId: 'patient-456',
    medicalRecord: 'encrypted-record-data',
    accessedBy: 'doctor-789',
    accessTime: new Date(),
    purpose: 'treatment',
    location: 'clinic-A'
  },
  violation: {
    type: 'unauthorized_access',
    description: 'PHI accessed without proper authorization',
    severity: 'critical',
    affectedPatients: 1,
    detectedAt: new Date()
  }
};

const mockSOXData = {
  financialData: {
    transactionId: 'txn-789',
    amount: 50000,
    currency: 'USD',
    approver: 'manager-456',
    timestamp: new Date(),
    auditRequired: true
  },
  violation: {
    type: 'segregation_of_duties',
    description: 'Same user initiated and approved transaction',
    severity: 'high',
    affectedTransactions: 3,
    detectedAt: new Date()
  }
};

// Mock services
const mockNotificationService = {
  sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
  sendSMS: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-456' }),
  sendSlack: jest.fn().mockResolvedValue({ success: true, messageId: 'slack-789' })
};

const mockDocumentService = {
  generateReport: jest.fn().mockResolvedValue({ 
    documentId: 'doc-123', 
    url: 'https://storage.example.com/report-123.pdf' 
  }),
  generateCertificate: jest.fn().mockResolvedValue({
    certificateId: 'cert-456',
    url: 'https://storage.example.com/cert-456.pdf'
  })
};

const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  rpc: jest.fn()
};

const mockRegulatoryAPI = {
  submitGDPRReport: jest.fn().mockResolvedValue({ submissionId: 'gdpr-sub-123', status: 'accepted' }),
  submitHIPAAReport: jest.fn().mockResolvedValue({ submissionId: 'hipaa-sub-456', status: 'accepted' }),
  submitSOXReport: jest.fn().mockResolvedValue({ submissionId: 'sox-sub-789', status: 'accepted' })
};

describe('ComplianceMonitor', () => {
  let complianceMonitor: ComplianceMonitor;
  let gdprEngine: jest.Mocked<GDPRComplianceEngine>;
  let hipaaEngine: jest.Mocked<HIPAAComplianceEngine>;
  let soxEngine: jest.Mocked<SOXComplianceEngine>;

  beforeEach(() => {
    gdprEngine = {
      evaluateCompliance: jest.fn(),
      checkDataRetention: jest.fn(),
      validateConsent: jest.fn(),
      checkRightToErasure: jest.fn(),
      generateGDPRReport: jest.fn()
    } as any;

    hipaaEngine = {
      evaluateCompliance: jest.fn(),
      checkAccessControls: jest.fn(),
      validateEncryption: jest.fn(),
      auditAccess: jest.fn(),
      generateHIPAAReport: jest.fn()
    } as any;

    soxEngine = {
      evaluateCompliance: jest.fn(),
      checkSegregationOfDuties: jest.fn(),
      validateFinancialControls: jest.fn(),
      auditFinancialData: jest.fn(),
      generateSOXReport: jest.fn()
    } as any;

    complianceMonitor = new ComplianceMonitor({
      gdprEngine,
      hipaaEngine,
      soxEngine,
      notificationService: mockNotificationService,
      documentService: mockDocumentService,
      supabaseClient: mockSupabaseClient,
      regulatoryAPI: mockRegulatoryAPI
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with all compliance engines', () => {
      expect(complianceMonitor).toBeDefined();
      expect(complianceMonitor.getEngines()).toEqual({
        gdpr: gdprEngine,
        hipaa: hipaaEngine,
        sox: soxEngine
      });
    });

    it('should throw error if required engines are missing', () => {
      expect(() => {
        new ComplianceMonitor({
          gdprEngine: null as any,
          hipaaEngine,
          soxEngine,
          notificationService: mockNotificationService,
          documentService: mockDocumentService,
          supabaseClient: mockSupabaseClient,
          regulatoryAPI: mockRegulatoryAPI
        });
      }).toThrow('GDPR compliance engine is required');
    });
  });

  describe('startMonitoring', () => {
    it('should start all compliance monitoring engines', async () => {
      gdprEngine.evaluateCompliance.mockResolvedValue({ 
        compliant: true, 
        violations: [],
        score: 95 
      });
      hipaaEngine.evaluateCompliance.mockResolvedValue({ 
        compliant: true, 
        violations: [],
        score: 98 
      });
      soxEngine.evaluateCompliance.mockResolvedValue({ 
        compliant: true, 
        violations: [],
        score: 92 
      });

      const result = await complianceMonitor.startMonitoring();

      expect(result.success).toBe(true);
      expect(result.activeEngines).toEqual(['gdpr', 'hipaa', 'sox']);
      expect(gdprEngine.evaluateCompliance).toHaveBeenCalled();
      expect(hipaaEngine.evaluateCompliance).toHaveBeenCalled();
      expect(soxEngine.evaluateCompliance).toHaveBeenCalled();
    });

    it('should handle engine failures gracefully', async () => {
      gdprEngine.evaluateCompliance.mockRejectedValue(new Error('GDPR engine failed'));
      hipaaEngine.evaluateCompliance.mockResolvedValue({ 
        compliant: true, 
        violations: [],
        score: 98 
      });
      soxEngine.evaluateCompliance.mockResolvedValue({ 
        compliant: true, 
        violations: [],
        score: 92 
      });

      const result = await complianceMonitor.startMonitoring();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('GDPR engine failed');
      expect(result.activeEngines).toEqual(['hipaa', 'sox']);
    });
  });

  describe('evaluateRealTimeCompliance', () => {
    it('should evaluate GDPR compliance in real-time', async () => {
      const userAction = {
        userId: 'user-123',
        action: 'data_access',
        data: mockGDPRData.personalData,
        timestamp: new Date()
      };

      gdprEngine.evaluateCompliance.mockResolvedValue({
        compliant: false,
        violations: [mockGDPRData.violation],
        score: 75
      });

      const result = await complianceMonitor.evaluateRealTimeCompliance(userAction);

      expect(result.regulation).toBe('gdpr');
      expect(result.compliant).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toEqual(mockGDPRData.violation);
    });

    it('should evaluate HIPAA compliance for healthcare data', async () => {
      const userAction = {
        userId: 'doctor-789',
        action: 'phi_access',
        data: mockHIPAAData.protectedHealthInfo,
        timestamp: new Date()
      };

      hipaaEngine.evaluateCompliance.mockResolvedValue({
        compliant: true,
        violations: [],
        score: 100
      });

      const result = await complianceMonitor.evaluateRealTimeCompliance(userAction);

      expect(result.regulation).toBe('hipaa');
      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(hipaaEngine.evaluateCompliance).toHaveBeenCalledWith(userAction);
    });

    it('should evaluate SOX compliance for financial operations', async () => {
      const userAction = {
        userId: 'manager-456',
        action: 'financial_transaction',
        data: mockSOXData.financialData,
        timestamp: new Date()
      };

      soxEngine.evaluateCompliance.mockResolvedValue({
        compliant: false,
        violations: [mockSOXData.violation],
        score: 60
      });

      const result = await complianceMonitor.evaluateRealTimeCompliance(userAction);

      expect(result.regulation).toBe('sox');
      expect(result.compliant).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });
});

describe('GDPRComplianceEngine', () => {
  let gdprEngine: GDPRComplianceEngine;
  let consentManager: jest.Mocked<ConsentManager>;
  let dataRetentionManager: jest.Mocked<DataRetentionManager>;

  beforeEach(() => {
    consentManager = {
      checkConsent: jest.fn(),
      revokeConsent: jest.fn(),
      updateConsent: jest.fn(),
      getConsentHistory: jest.fn()
    } as any;

    dataRetentionManager = {
      checkRetentionPeriod: jest.fn(),
      enforceRetention: jest.fn(),
      scheduleDataDeletion: jest.fn(),
      getRetentionPolicy: jest.fn()
    } as any;

    gdprEngine = new GDPRComplianceEngine({
      consentManager,
      dataRetentionManager,
      supabaseClient: mockSupabaseClient
    });
  });

  describe('validateConsent', () => {
    it('should validate valid consent', async () => {
      consentManager.checkConsent.mockResolvedValue({
        valid: true,
        consentDate: new Date('2024-01-01'),
        expiryDate: new Date('2025-01-01'),
        categories: ['personal', 'behavioral']
      });

      const result = await gdprEngine.validateConsent('user-123', ['personal']);

      expect(result.valid).toBe(true);
      expect(consentManager.checkConsent).toHaveBeenCalledWith('user-123', ['personal']);
    });

    it('should identify expired consent', async () => {
      consentManager.checkConsent.mockResolvedValue({
        valid: false,
        consentDate: new Date('2023-01-01'),
        expiryDate: new Date('2024-01-01'),
        categories: ['personal'],
        reason: 'expired'
      });

      const result = await gdprEngine.validateConsent('user-123', ['personal']);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should identify missing consent for data categories', async () => {
      consentManager.checkConsent.mockResolvedValue({
        valid: false,
        reason: 'missing_categories',
        missingCategories: ['behavioral']
      });

      const result = await gdprEngine.validateConsent('user-123', ['personal', 'behavioral']);

      expect(result.valid).toBe(false);
      expect(result.missingCategories).toContain('behavioral');
    });
  });

  describe('checkDataRetention', () => {
    it('should validate data within retention period', async () => {
      dataRetentionManager.checkRetentionPeriod.mockResolvedValue({
        withinPeriod: true,
        dataAge: 180,
        retentionPeriod: 365,
        daysRemaining: 185
      });

      const result = await gdprEngine.checkDataRetention('user-123');

      expect(result.compliant).toBe(true);
      expect(result.daysRemaining).toBe(185);
    });

    it('should identify data exceeding retention period', async () => {
      dataRetentionManager.checkRetentionPeriod.mockResolvedValue({
        withinPeriod: false,
        dataAge: 400,
        retentionPeriod: 365,
        daysExceeded: 35
      });

      const result = await gdprEngine.checkDataRetention('user-123');

      expect(result.compliant).toBe(false);
      expect(result.violation).toEqual({
        type: 'data_retention_exceeded',
        daysExceeded: 35,
        severity: 'high'
      });
    });
  });

  describe('checkRightToErasure', () => {
    it('should process valid erasure request', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: { success: true, deletedRecords: 15 },
        error: null
      });

      const result = await gdprEngine.checkRightToErasure('user-123', {
        requestId: 'req-123',
        requestedAt: new Date(),
        categories: ['all']
      });

      expect(result.success).toBe(true);
      expect(result.deletedRecords).toBe(15);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('gdpr_erase_user_data', {
        user_id: 'user-123',
        categories: ['all']
      });
    });

    it('should handle erasure request failure', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database constraint violation' }
      });

      const result = await gdprEngine.checkRightToErasure('user-123', {
        requestId: 'req-123',
        requestedAt: new Date(),
        categories: ['all']
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database constraint violation');
    });
  });
});

describe('HIPAAComplianceEngine', () => {
  let hipaaEngine: HIPAAComplianceEngine;
  let accessControlMonitor: jest.Mocked<AccessControlMonitor>;
  let encryptionValidator: jest.Mocked<EncryptionValidator>;

  beforeEach(() => {
    accessControlMonitor = {
      validateAccess: jest.fn(),
      logAccess: jest.fn(),
      checkAuthorization: jest.fn(),
      detectAnomalies: jest.fn()
    } as any;

    encryptionValidator = {
      validateEncryption: jest.fn(),
      checkKeyRotation: jest.fn(),
      auditEncryptionStatus: jest.fn()
    } as any;

    hipaaEngine = new HIPAAComplianceEngine({
      accessControlMonitor,
      encryptionValidator,
      supabaseClient: mockSupabaseClient
    });
  });

  describe('checkAccessControls', () => {
    it('should validate authorized PHI access', async () => {
      accessControlMonitor.validateAccess.mockResolvedValue({
        authorized: true,
        accessLevel: 'read',
        purpose: 'treatment',
        auditId: 'audit-123'
      });

      const result = await hipaaEngine.checkAccessControls({
        userId: 'doctor-789',
        patientId: 'patient-456',
        action: 'view_record',
        timestamp: new Date()
      });

      expect(result.authorized).toBe(true);
      expect(result.auditId).toBe('audit-123');
      expect(accessControlMonitor.logAccess).toHaveBeenCalled();
    });

    it('should detect unauthorized PHI access', async () => {
      accessControlMonitor.validateAccess.mockResolvedValue({
        authorized: false,
        reason: 'insufficient_privileges',
        requiredRole: 'physician',
        userRole: 'nurse'
      });

      const result = await hipaaEngine.checkAccessControls({
        userId: 'nurse-456',
        patientId: 'patient-456',
        action: 'edit_record',
        timestamp: new Date()
      });

      expect(result.authorized).toBe(false);
      expect(result.violation).toEqual({
        type: 'unauthorized_access',
        reason: 'insufficient_privileges',
        severity: 'critical'
      });
    });
  });

  describe('validateEncryption', () => {
    it('should validate proper PHI encryption', async () => {
      encryptionValidator.validateEncryption.mockResolvedValue({
        encrypted: true,
        algorithm: 'AES-256',
        keyAge: 30,
        compliant: true
      });

      const result = await hipaaEngine.validateEncryption('phi-record-123');

      expect(result.compliant).toBe(true);
      expect(result.algorithm).toBe('AES-256');
    });

    it('should detect unencrypted PHI', async () => {
      encryptionValidator.validateEncryption.mockResolvedValue({
        encrypted: false,
        compliant: false,
        violation: 'unencrypted_phi'
      });

      const result = await hipaaEngine.validateEncryption('phi-record-456');

      expect(result.compliant).toBe(false);
      expect(result.violation).toEqual({
        type: 'encryption_violation',
        description: 'PHI stored without encryption',
        severity: 'critical'
      });
    });
  });

  describe('auditAccess', () => {
    it('should generate comprehensive access audit', async () => {
      mockSupabaseClient.select.mockResolvedValue({
        data: [
          { userId: 'doctor-789', patientId: 'patient-456', action: 'view', timestamp: new Date() },
          { userId: 'nurse-123', patientId: 'patient-456', action: 'update', timestamp: new Date() }
        ],
        error: null
      });

      const result = await hipaaEngine.auditAccess('patient-456', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });

      expect(result.accessCount).toBe(2);
      expect(result.uniqueUsers).toBe(2);
      expect(result.accessLog).toHaveLength(2);
    });
  });
});

describe('SOXComplianceEngine', () => {
  let soxEngine: SOXComplianceEngine;
  let auditTrailManager: jest.Mocked<AuditTrailManager>;

  beforeEach(() => {
    auditTrailManager = {
      logFinancialActivity: jest.fn(),
      validateAuditTrail: jest.fn(),
      generateAuditReport: jest.fn(),
      checkIntegrity: jest.fn()
    } as any;

    soxEngine = new SOXComplianceEngine({
      auditTrailManager,
      supabaseClient: mockSupabaseClient
    });
  });

  describe('checkSegregationOfDuties', () => {
    it('should validate proper segregation of duties', async () => {
      mockSupabaseClient.select.mockResolvedValue({
        data: [
          { transactionId: 'txn-123', initiator: 'user-123', approver: 'manager-456' }
        ],
        error: null
      });

      const result = await soxEngine.checkSegregationOfDuties('txn-123');

      expect(result.compliant).toBe(true);
      expect(result.segregationValid).toBe(true);
    });

    it('should detect segregation of duties violation', async () => {
      mockSupabaseClient.select.mockResolvedValue({
        data: [
          { transactionId: 'txn-456', initiator: 'user-123', approver: 'user-123' }
        ],
        error: null
      });

      const result = await soxEngine.checkSegregationOfDuties('txn-456');

      expect(result.compliant).toBe(false);
      expect(result.violation).toEqual({
        type: 'segregation_of_duties',
        description: 'Same user initiated and approved transaction',
        severity: 'high'
      });
    });
  });

  describe('validateFinancialControls', () => {
    it('should validate financial transaction controls', async () => {
      auditTrailManager.validateAuditTrail.mockResolvedValue({
        complete: true,
        signatures: ['initiator', 'approver', 'reviewer'],
        timestamps: [new Date(), new Date(), new Date()]
      });

      const result = await soxEngine.validateFinancialControls({
        transactionId: 'txn-789',
        amount: 50000,
        type: 'expense',
        approvalLevel: 'senior_manager'
      });

      expect(result.compliant).toBe(true);
      expect(result.controlsValid).toBe(true);
    });

    it('