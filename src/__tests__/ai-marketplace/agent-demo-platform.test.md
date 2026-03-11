# Build Interactive Agent Demo Platform

```markdown
# Interactive Agent Demo Platform Test

## Purpose
This test suite provides functionality to verify the components and services within the Interactive Agent Demo Platform. It utilizes mocking techniques to isolate and test individual components related to agent demos, including session management, usage tracking, and performance metrics.

## Usage
The test suite is implemented using React Testing Library and Vitest. It is intended to validate the functionality of the various components and services without dependency on real implementations. Tests can be run to ensure that each part of the application behaves as expected in a controlled environment.

## Parameters/Props
The following mocked components and services are included in the test suite:

- **Mocked Components:**
  - `AgentDemoSandbox`: Represents a sandboxed environment for running agent demos.
  - `UsageLimitTracker`: Manages tracking of usage limits for agents.
  - `SecurityIsolationLayer`: Ensures security measures are in place for agent interactions.
  - `PerformanceMetricsDisplay`: Displays performance metrics for agent execution.
  - `SampleInputManager`: Handles input samples for testing agent responses.
  - `DemoSessionManager`: Manages the lifecycle of demo sessions including creation and expiration.

- **Mocked Services:**
  - `mockSupabase`: Simulates interaction with a Supabase backend for data management.
  - `mockRedis`: Simulates Redis operations for caching and temporary data storage.
  - `mockWebAssembly`: Provides mocked functionality for WebAssembly integrations.

- **Mock Data:**
  - `mockAgent`: A template representation of an agent, including attributes like `id`, `name`, `description`, and `pricing`.
  - `mockDemoSession`: A demo session object containing metadata such as `id`, `agent_id`, `user_id`, and timestamps.
  - `mockPerformanceMetrics`: A sample representation of performance metrics obtained from running an agent.

## Return Values
The test suite does not directly return values but instead validates the interactions and functionality of the mocked components and services through assertions. Each test case verifies specific expected outcomes, serving as confirmation that the expected behavior and state management within the demo platform is functioning correctly.

## Examples
Below are a few example test cases implemented in the suite:

```typescript
describe('AgentDemoSandbox', () => {
  beforeEach(() => {
    render(<AgentDemoSandbox />);
  });

  it('renders without crashing', () => {
    expect(screen.getByText(/AgentDemoSandbox/i)).toBeInTheDocument();
  });

  it('tracks usage limit correctly', async () => {
    // Simulate usage up to the limit and check the state
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use agent/i }));
    });
    expect(screen.getByText(/Usage Limit Reached/i)).toBeInTheDocument();
  });
});
```

This structure allows developers to build upon the demo platform while ensuring robustness through comprehensive automated testing.
```