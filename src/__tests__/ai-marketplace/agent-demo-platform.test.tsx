```typescript
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Mock external dependencies
vi.mock('@supabase/supabase-js');
vi.mock('redis');
vi.mock('next/navigation');

// Mock components
const AgentDemoSandbox = vi.fn();
const UsageLimitTracker = vi.fn();
const SecurityIsolationLayer = vi.fn();
const PerformanceMetricsDisplay = vi.fn();
const SampleInputManager = vi.fn();
const DemoSessionManager = vi.fn();

// Mock services
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      }))
    })),
    insert: vi.fn(),
    update: vi.fn(() => ({
      eq: vi.fn()
    })),
    delete: vi.fn(() => ({
      eq: vi.fn()
    })),
    subscribe: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn()
      }))
    }))
  })),
  rpc: vi.fn(),
  realtime: {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn()
      })),
      unsubscribe: vi.fn()
    }))
  }
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  pipeline: vi.fn(() => ({
    exec: vi.fn()
  }))
};

const mockWebAssembly = {
  instantiate: vi.fn(),
  Module: vi.fn()
};

// Mock data
const mockAgent = {
  id: 'agent-123',
  name: 'Test Agent',
  description: 'Test agent for demos',
  category: 'audio-processing',
  pricing: { demo_limit: 5, price_per_use: 0.10 },
  sandbox_config: {
    memory_limit: '128MB',
    cpu_limit: '0.5',
    timeout: 30000
  }
};

const mockDemoSession = {
  id: 'session-123',
  agent_id: 'agent-123',
  user_id: 'user-123',
  usage_count: 0,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  sandbox_id: 'sandbox-123'
};

const mockPerformanceMetrics = {
  latency: 150,
  throughput: 1000,
  memory_usage: 64,
  cpu_usage: 25,
  success_rate: 100
};

// Component under test
interface AgentDemoPlatformProps {
  agentId: string;
  userId: string;
  onPurchase?: () => void;
}

const AgentDemoPlatform: React.FC<AgentDemoPlatformProps> = ({ 
  agentId, 
  userId, 
  onPurchase 
}) => {
  const [session, setSession] = React.useState(null);
  const [metrics, setMetrics] = React.useState(mockPerformanceMetrics);
  const [usage, setUsage] = React.useState({ count: 0, limit: 5 });
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div data-testid="agent-demo-platform">
      <div data-testid="demo-header">
        <h1>Agent Demo: {mockAgent.name}</h1>
        <button onClick={onPurchase} data-testid="purchase-button">
          Purchase Agent
        </button>
      </div>
      
      <div data-testid="usage-tracker">
        Usage: {usage.count}/{usage.limit}
      </div>
      
      <div data-testid="demo-sandbox">
        <input 
          data-testid="sample-input"
          placeholder="Enter sample input"
        />
        <button 
          data-testid="execute-button"
          disabled={isExecuting || usage.count >= usage.limit}
          onClick={() => setIsExecuting(true)}
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
      </div>
      
      <div data-testid="performance-metrics">
        <div>Latency: {metrics.latency}ms</div>
        <div>Memory: {metrics.memory_usage}MB</div>
        <div>CPU: {metrics.cpu_usage}%</div>
      </div>
      
      {error && (
        <div data-testid="error-display" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

describe('AgentDemoPlatform', () => {
  const user = userEvent.setup();
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockAgent })
        })
      }),
      insert: vi.fn().mockResolvedValue({ data: mockDemoSession }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockDemoSession })
      })
    });
  });

  describe('Demo Session Management', () => {
    it('should create demo session on mount', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('demo_sessions');
      });
    });

    it('should handle session creation failure', async () => {
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockRejectedValue(new Error('Session creation failed'))
      });

      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toBeInTheDocument();
      });
    });

    it('should enforce session timeout', async () => {
      vi.useFakeTimers();
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      act(() => {
        vi.advanceTimersByTime(3600001); // 1 hour + 1ms
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/session.*expired/i);
      });
      
      vi.useRealTimers();
    });
  });

  describe('Sandbox Isolation', () => {
    beforeEach(() => {
      // Mock WebAssembly sandbox
      global.WebAssembly = mockWebAssembly;
      mockWebAssembly.instantiate.mockResolvedValue({
        instance: {
          exports: {
            execute: vi.fn().mockReturnValue('test result')
          }
        }
      });
    });

    it('should initialize sandbox with security constraints', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      expect(mockWebAssembly.instantiate).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        expect.objectContaining({
          memory_limit: 128 * 1024 * 1024,
          cpu_limit: 0.5
        })
      );
    });

    it('should isolate sandbox from host environment', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.type(screen.getByTestId('sample-input'), 'test input');
      await user.click(screen.getByTestId('execute-button'));
      
      // Verify no access to global objects
      expect(mockWebAssembly.instantiate).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        expect.not.objectContaining({
          window: expect.anything(),
          document: expect.anything(),
          process: expect.anything()
        })
      );
    });

    it('should handle sandbox execution timeout', async () => {
      vi.useFakeTimers();
      
      mockWebAssembly.instantiate.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 35000))
      );
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      act(() => {
        vi.advanceTimersByTime(30000);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/timeout/i);
      });
      
      vi.useRealTimers();
    });
  });

  describe('Usage Limit Enforcement', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);
    });

    it('should track usage count per session', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      expect(mockRedis.incr).toHaveBeenCalledWith('demo:session-123:usage');
    });

    it('should disable execution when limit reached', async () => {
      mockRedis.get.mockResolvedValue('5');
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('execute-button')).toBeDisabled();
      });
    });

    it('should show usage count in real-time', async () => {
      mockRedis.get.mockResolvedValue('3');
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('usage-tracker')).toHaveTextContent('Usage: 3/5');
      });
    });

    it('should reset usage count on new session', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      expect(mockRedis.del).toHaveBeenCalledWith('demo:session-123:usage');
    });
  });

  describe('Security Controls', () => {
    it('should sanitize input against XSS attacks', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      const maliciousInput = '<script>alert("xss")</script>';
      await user.type(screen.getByTestId('sample-input'), maliciousInput);
      
      const input = screen.getByTestId('sample-input') as HTMLInputElement;
      expect(input.value).not.toContain('<script>');
    });

    it('should prevent SQL injection attempts', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      const sqlInjection = "'; DROP TABLE users; --";
      await user.type(screen.getByTestId('sample-input'), sqlInjection);
      await user.click(screen.getByTestId('execute-button'));
      
      // Should not reach database with unsanitized input
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.stringContaining('DROP TABLE')
        })
      );
    });

    it('should validate file upload security', async () => {
      const mockFile = new File(['malicious content'], 'test.exe', {
        type: 'application/x-executable'
      });
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
      
      // Should reject executable files
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/file.*not.*allowed/i);
      });
    });

    it('should audit security events', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      expect(mockSupabase.from).toHaveBeenCalledWith('security_audit_log');
    });
  });

  describe('Performance Metrics Display', () => {
    beforeEach(() => {
      mockSupabase.realtime = {
        channel: vi.fn(() => ({
          on: vi.fn((event, callback) => {
            if (event === 'postgres_changes') {
              callback({ new: mockPerformanceMetrics });
            }
          }),
          subscribe: vi.fn()
        }))
      };
    });

    it('should display real-time performance metrics', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByText('Latency: 150ms')).toBeInTheDocument();
        expect(screen.getByText('Memory: 64MB')).toBeInTheDocument();
        expect(screen.getByText('CPU: 25%')).toBeInTheDocument();
      });
    });

    it('should update metrics during execution', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      // Simulate metrics update
      act(() => {
        const callback = mockSupabase.realtime.channel().on.mock.calls[0][1];
        callback({ new: { ...mockPerformanceMetrics, latency: 200 } });
      });
      
      await waitFor(() => {
        expect(screen.getByText('Latency: 200ms')).toBeInTheDocument();
      });
    });

    it('should show performance degradation warnings', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      act(() => {
        const callback = mockSupabase.realtime.channel().on.mock.calls[0][1];
        callback({ new: { ...mockPerformanceMetrics, cpu_usage: 95 } });
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('performance-metrics')).toHaveClass('warning');
      });
    });
  });

  describe('Sample Input Management', () => {
    const sampleInputs = [
      { id: '1', name: 'Audio File', type: 'file', example: 'sample.wav' },
      { id: '2', name: 'Text Input', type: 'text', example: 'Hello world' }
    ];

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: sampleInputs })
      });
    });

    it('should load available sample inputs', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('sample_inputs');
      });
    });

    it('should validate input format requirements', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.type(screen.getByTestId('sample-input'), 'invalid format');
      await user.click(screen.getByTestId('execute-button'));
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/invalid.*format/i);
      });
    });

    it('should provide sample input suggestions', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('sample-input'));
      
      await waitFor(() => {
        expect(screen.getByText('Audio File')).toBeInTheDocument();
        expect(screen.getByText('Text Input')).toBeInTheDocument();
      });
    });
  });

  describe('Demo to Purchase Conversion', () => {
    const mockOnPurchase = vi.fn();

    it('should show purchase button after successful demo', async () => {
      render(
        <AgentDemoPlatform 
          agentId="agent-123" 
          userId="user-123" 
          onPurchase={mockOnPurchase}
        />
      );
      
      expect(screen.getByTestId('purchase-button')).toBeInTheDocument();
    });

    it('should track conversion metrics', async () => {
      render(
        <AgentDemoPlatform 
          agentId="agent-123" 
          userId="user-123" 
          onPurchase={mockOnPurchase}
        />
      );
      
      await user.click(screen.getByTestId('purchase-button'));
      
      expect(mockOnPurchase).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('conversion_events');
    });

    it('should show pricing information', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByText(/\$0\.10/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Boundary Handling', () => {
    it('should recover from sandbox crashes', async () => {
      mockWebAssembly.instantiate.mockRejectedValue(new Error('Sandbox crashed'));
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/sandbox.*error/i);
        expect(screen.getByTestId('execute-button')).not.toBeDisabled();
      });
    });

    it('should handle network failures gracefully', async () => {
      mockSupabase.from.mockRejectedValue(new Error('Network error'));
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/network.*error/i);
      });
    });

    it('should provide retry mechanisms', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary failure');
        }
        return {
          select: vi.fn().mockResolvedValue({ data: mockAgent })
        };
      });
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('retry-button'));
      
      await waitFor(() => {
        expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();
      });
    });
  });

  describe('Concurrent User Limits', () => {
    beforeEach(() => {
      mockRedis.get.mockImplementation((key) => {
        if (key === 'concurrent:agent-123') {
          return Promise.resolve('10');
        }
        return Promise.resolve('0');
      });
    });

    it('should enforce concurrent user limits', async () => {
      mockRedis.get.mockResolvedValue('50'); // Max limit reached
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/too.*many.*users/i);
      });
    });

    it('should queue users when limit reached', async () => {
      mockRedis.get.mockResolvedValue('50');
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('queue-position')).toBeInTheDocument();
      });
    });

    it('should track concurrent session count', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      expect(mockRedis.incr).toHaveBeenCalledWith('concurrent:agent-123');
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources on unmount', () => {
      const { unmount } = render(
        <AgentDemoPlatform agentId="agent-123" userId="user-123" />
      );
      
      unmount();
      
      expect(mockRedis.del).toHaveBeenCalledWith('demo:session-123');
      expect(mockSupabase.realtime.channel().unsubscribe).toHaveBeenCalled();
    });

    it('should handle memory pressure gracefully', async () => {
      // Mock memory pressure event
      const memoryPressureEvent = new Event('memory-pressure');
      
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      act(() => {
        window.dispatchEvent(memoryPressureEvent);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toHaveTextContent(/resource.*limit/i);
      });
    });

    it('should monitor resource usage', async () => {
      render(<AgentDemoPlatform agentId="agent-123" userId="user-123" />);
      
      await user.click(screen.getByTestId('execute-button'));
      
      expect(mockSupabase.r