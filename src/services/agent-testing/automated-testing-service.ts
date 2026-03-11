```typescript
import { jest } from '@jest/globals';
import { AutomatedTestingService } from '../automated-testing-service';
import Docker from 'dockerode';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bull';
import { Worker } from 'worker_threads';

// Mock external dependencies
jest.mock('dockerode');
jest.mock('@supabase/supabase-js');
jest.mock('bull');
jest.mock('worker_threads');

const mockDocker = Docker as jest.MockedClass<typeof Docker>;
const mockSupabaseClient = {
  from: jest.fn(),
  storage: {
    from: jest.fn()
  }
};
const mockQueue = {
  add: jest.fn(),
  process: jest.fn(),
  on: jest.fn()
};

(createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
(Queue as jest.Mock).mockReturnValue(mockQueue);

describe('AutomatedTestingService', () => {
  let service: AutomatedTestingService;
  let mockDockerInstance: any;
  let mockContainer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContainer = {
      id: 'container-123',
      start: jest.fn().mockResolvedValue({}),
      stop: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      logs: jest.fn().mockResolvedValue(Buffer.from('test logs')),
      inspect: jest.fn().mockResolvedValue({
        State: { ExitCode: 0 },
        Config: { Memory: 512 * 1024 * 1024 }
      }),
      stats: jest.fn().mockResolvedValue({
        memory_stats: { usage: 256 * 1024 * 1024 },
        cpu_stats: { cpu_usage: { total_usage: 1000000 } }
      })
    };

    mockDockerInstance = {
      createContainer: jest.fn().mockResolvedValue(mockContainer),
      listContainers: jest.fn().mockResolvedValue([]),
      pruneContainers: jest.fn().mockResolvedValue({})
    };

    mockDocker.mockImplementation(() => mockDockerInstance);

    service = new AutomatedTestingService({
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceKey: 'test-key',
      dockerSocketPath: '/var/run/docker.sock',
      maxConcurrentTests: 5,
      testTimeoutMs: 300000,
      sandboxMemoryLimit: '512m',
      sandboxCpuLimit: '1.0'
    });
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new AutomatedTestingService({
        supabaseUrl: 'https://test.supabase.co',
        supabaseServiceKey: 'test-key'
      });
      expect(defaultService).toBeInstanceOf(AutomatedTestingService);
    });

    it('should throw error with invalid configuration', () => {
      expect(() => new AutomatedTestingService({
        supabaseUrl: '',
        supabaseServiceKey: 'test-key'
      })).toThrow('Invalid configuration');
    });
  });

  describe('submitAgentForTesting', () => {
    const mockAgent = {
      id: 'agent-123',
      name: 'Test Agent',
      version: '1.0.0',
      code: 'console.log("Hello World");',
      dependencies: ['lodash'],
      testSuite: 'standard'
    };

    it('should submit agent for testing successfully', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'suite-1', tests: [] },
            error: null
          })
        })
      });
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        insert: jest.fn().mockResolvedValue({ data: { id: 'test-run-1' }, error: null })
      });

      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.submitAgentForTesting(mockAgent);

      expect(result.testRunId).toBeDefined();
      expect(result.status).toBe('queued');
      expect(mockQueue.add).toHaveBeenCalledWith('executeTests', expect.any(Object));
    });

    it('should handle invalid agent submission', async () => {
      const invalidAgent = {
        id: '',
        name: 'Test Agent',
        version: '1.0.0',
        code: '',
        dependencies: [],
        testSuite: 'standard'
      };

      await expect(service.submitAgentForTesting(invalidAgent))
        .rejects.toThrow('Invalid agent configuration');
    });

    it('should handle test suite not found', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Test suite not found' }
          })
        })
      });
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect
      });

      await expect(service.submitAgentForTesting(mockAgent))
        .rejects.toThrow('Test suite not found');
    });
  });

  describe('executeTestSuite', () => {
    const mockTestRun = {
      id: 'test-run-1',
      agentId: 'agent-123',
      testSuite: {
        id: 'suite-1',
        tests: [
          { id: 'test-1', name: 'Basic Functionality', script: 'test1.js' },
          { id: 'test-2', name: 'Performance Test', script: 'test2.js' }
        ]
      },
      agent: {
        code: 'console.log("Hello World");',
        dependencies: ['lodash']
      }
    };

    it('should execute test suite successfully', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const result = await service.executeTestSuite(mockTestRun);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(mockContainer.start).toHaveBeenCalled();
      expect(mockContainer.stop).toHaveBeenCalled();
      expect(mockContainer.remove).toHaveBeenCalled();
    });

    it('should handle container creation failure', async () => {
      mockDockerInstance.createContainer.mockRejectedValue(new Error('Container creation failed'));

      const result = await service.executeTestSuite(mockTestRun);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Container creation failed');
    });

    it('should handle test execution timeout', async () => {
      mockContainer.start.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 400000))
      );

      const shortTimeoutService = new AutomatedTestingService({
        supabaseUrl: 'https://test.supabase.co',
        supabaseServiceKey: 'test-key',
        testTimeoutMs: 1000
      });

      const result = await shortTimeoutService.executeTestSuite(mockTestRun);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('validateSafety', () => {
    it('should pass safety validation for clean code', async () => {
      const cleanCode = 'const message = "Hello World"; console.log(message);';
      
      const result = await service.validateSafety('agent-123', cleanCode);

      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect dangerous code patterns', async () => {
      const dangerousCode = 'eval("malicious code"); require("fs").unlinkSync("/important/file");';
      
      const result = await service.validateSafety('agent-123', dangerousCode);

      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(issue => issue.severity === 'critical')).toBe(true);
    });

    it('should detect network access attempts', async () => {
      const networkCode = 'require("http").get("http://malicious-site.com");';
      
      const result = await service.validateSafety('agent-123', networkCode);

      expect(result.safe).toBe(false);
      expect(result.issues.some(issue => issue.category === 'network_access')).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const malformedCode = 'const x = {{{{{';
      
      const result = await service.validateSafety('agent-123', malformedCode);

      expect(result.safe).toBe(false);
      expect(result.issues.some(issue => issue.category === 'syntax_error')).toBe(true);
    });
  });

  describe('analyzePerformance', () => {
    const mockMetrics = {
      executionTimeMs: 1500,
      memoryUsageMB: 128,
      cpuUsagePercent: 45,
      networkRequests: 3,
      diskReadsMB: 5.2,
      diskWritesMB: 1.8
    };

    it('should analyze performance metrics successfully', async () => {
      const result = await service.analyzePerformance('agent-123', mockMetrics);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metrics).toEqual(mockMetrics);
      expect(result.recommendations).toBeDefined();
    });

    it('should flag poor performance', async () => {
      const poorMetrics = {
        executionTimeMs: 15000,
        memoryUsageMB: 800,
        cpuUsagePercent: 95,
        networkRequests: 100,
        diskReadsMB: 500,
        diskWritesMB: 200
      };

      const result = await service.analyzePerformance('agent-123', poorMetrics);

      expect(result.score).toBeLessThan(50);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('memory'))).toBe(true);
    });

    it('should handle missing metrics gracefully', async () => {
      const incompleteMetrics = {
        executionTimeMs: 1500
      };

      const result = await service.analyzePerformance('agent-123', incompleteMetrics as any);

      expect(result.score).toBeDefined();
      expect(result.warnings.some(w => w.includes('missing'))).toBe(true);
    });
  });

  describe('getTestResults', () => {
    it('should retrieve test results successfully', async () => {
      const mockResults = {
        id: 'test-run-1',
        agentId: 'agent-123',
        status: 'completed',
        results: [
          { testId: 'test-1', passed: true, duration: 100 },
          { testId: 'test-2', passed: false, duration: 200, error: 'Test failed' }
        ],
        safetyValidation: { safe: true, issues: [] },
        performanceAnalysis: { score: 85 }
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockResults,
              error: null
            })
          })
        })
      });

      const result = await service.getTestResults('test-run-1');

      expect(result).toEqual(mockResults);
    });

    it('should handle test results not found', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' }
            })
          })
        })
      });

      await expect(service.getTestResults('non-existent'))
        .rejects.toThrow('Test results not found');
    });
  });

  describe('approveForPublication', () => {
    it('should approve agent with passing tests', async () => {
      const passingResults = {
        id: 'test-run-1',
        status: 'completed',
        results: [
          { testId: 'test-1', passed: true },
          { testId: 'test-2', passed: true }
        ],
        safetyValidation: { safe: true, issues: [] },
        performanceAnalysis: { score: 85, warnings: [] }
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: passingResults,
              error: null
            })
          })
        }),
        update: jest.fn().mockResolvedValue({ error: null })
      });

      const result = await service.approveForPublication('test-run-1');

      expect(result.approved).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should reject agent with failing tests', async () => {
      const failingResults = {
        id: 'test-run-1',
        status: 'completed',
        results: [
          { testId: 'test-1', passed: true },
          { testId: 'test-2', passed: false, error: 'Critical test failed' }
        ],
        safetyValidation: { safe: true, issues: [] },
        performanceAnalysis: { score: 85, warnings: [] }
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: failingResults,
              error: null
            })
          })
        }),
        update: jest.fn().mockResolvedValue({ error: null })
      });

      const result = await service.approveForPublication('test-run-1');

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('Test failures detected');
    });

    it('should reject agent with safety issues', async () => {
      const unsafeResults = {
        id: 'test-run-1',
        status: 'completed',
        results: [
          { testId: 'test-1', passed: true }
        ],
        safetyValidation: { 
          safe: false, 
          issues: [{ severity: 'critical', category: 'code_injection' }] 
        },
        performanceAnalysis: { score: 85, warnings: [] }
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: unsafeResults,
              error: null
            })
          })
        }),
        update: jest.fn().mockResolvedValue({ error: null })
      });

      const result = await service.approveForPublication('test-run-1');

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('Safety validation failed');
    });
  });

  describe('cleanupResources', () => {
    it('should cleanup Docker containers successfully', async () => {
      mockDockerInstance.listContainers.mockResolvedValue([
        { Id: 'container-1', Labels: { 'test-runner': 'true' } },
        { Id: 'container-2', Labels: { 'test-runner': 'true' } }
      ]);

      const mockContainer1 = { stop: jest.fn(), remove: jest.fn() };
      const mockContainer2 = { stop: jest.fn(), remove: jest.fn() };
      mockDockerInstance.getContainer = jest.fn()
        .mockReturnValueOnce(mockContainer1)
        .mockReturnValueOnce(mockContainer2);

      await service.cleanupResources();

      expect(mockContainer1.stop).toHaveBeenCalled();
      expect(mockContainer1.remove).toHaveBeenCalled();
      expect(mockContainer2.stop).toHaveBeenCalled();
      expect(mockContainer2.remove).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockDockerInstance.listContainers.mockRejectedValue(new Error('Docker error'));

      // Should not throw
      await expect(service.cleanupResources()).resolves.not.toThrow();
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health status', async () => {
      mockQueue.add.mockResolvedValue({ id: 'health-check' });
      mockDockerInstance.listContainers.mockResolvedValue([]);

      const health = await service.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.components.docker).toBe('healthy');
      expect(health.components.queue).toBe('healthy');
      expect(health.components.database).toBe('healthy');
    });

    it('should detect unhealthy components', async () => {
      mockQueue.add.mockRejectedValue(new Error('Queue unavailable'));

      const health = await service.getSystemHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.components.queue).toBe('unhealthy');
    });
  });
});
```