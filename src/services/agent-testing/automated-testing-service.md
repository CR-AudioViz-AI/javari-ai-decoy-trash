# Build Automated Agent Testing Service

```markdown
# AutomatedTestingService

## Purpose
The `AutomatedTestingService` is designed to facilitate the automated testing of agents by managing Docker containers, utilizing a queue system for concurrent test executions, and integrating with Supabase for data management. The service allows users to create, start, and manage Docker containers that run specified tests, while monitoring resource usage and handling logs.

## Usage
To use the `AutomatedTestingService`, you first need to create an instance of the service by passing the necessary configuration parameters. You can then invoke methods to manage testing workflows automatically.

```typescript
import { AutomatedTestingService } from './src/services/agent-testing/automated-testing-service';

const service = new AutomatedTestingService({
  supabaseUrl: 'https://your.supabase.co',
  supabaseServiceKey: 'your-service-key',
  dockerSocketPath: '/var/run/docker.sock',
  maxConcurrentTests: 10,
});
```

## Parameters / Props
The constructor of `AutomatedTestingService` accepts the following parameters:

- `supabaseUrl` (string): The URL of the Supabase instance.
- `supabaseServiceKey` (string): Service key for accessing Supabase.
- `dockerSocketPath` (string): The path to the Docker socket for container management.
- `maxConcurrentTests` (number): Maximum number of tests that can run concurrently.

## Return Values
The instance of `AutomatedTestingService` provides methods to manage tests and Docker containers. Upon creating an instance, it returns an object that allows calling the following key methods:

- `startTest(testId: string)`: Starts a test by its identifier, creates a Docker container, and initializes the testing process.
- `stopTest(testId: string)`: Stops the currently running test associated with the specified test identifier.
- `getLogs(testId: string)`: Retrieves logs for the specified test identified by `testId`.
- `getResourceUsage(testId: string)`: Returns the CPU and memory usage statistics of the test container associated with `testId`.

## Examples

**Starting a Test**
```typescript
await service.startTest('test-123');
```

**Stopping a Test**
```typescript
await service.stopTest('test-123');
```

**Fetching Test Logs**
```typescript
const logs = await service.getLogs('test-123');
console.log(logs);
```

**Checking Resource Usage**
```typescript
const resourceUsage = await service.getResourceUsage('test-123');
console.log(resourceUsage);
```

## Note
This service relies on external dependencies like Docker and Supabase. Ensure that these services are properly configured and accessible before utilizing the `AutomatedTestingService`.
```