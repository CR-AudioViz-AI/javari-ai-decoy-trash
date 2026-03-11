# Build Intelligent Team Formation Module

```markdown
# Intelligent Team Formation Module

## Purpose
The Intelligent Team Formation Module is designed to optimize the assembly of teams based on the capabilities of available agents and the requirements of specific tasks. It utilizes a genetic algorithm approach to evaluate and enhance team compositions, ensuring efficient collaboration and performance.

## Usage
To use the Intelligent Team Formation Module, import the main functions and interfaces from `src/modules/team-formation/index.ts`. Instantiate agents with their profiles and define task requirements. Then, use the optimization functions to generate team compositions based on the defined parameters.

### Example Usage
```typescript
import { AgentProfile, TaskRequirement, OptimizationParams, optimizeTeamFormation } from './src/modules/team-formation/index';

const agents: AgentProfile[] = [
  { id: '1', name: 'Alice', type: 'creative', capabilities: { feature1: 0.8 }, availability: true, performanceScore: 0.9, specializations: ['design'], workload: 0.5, lastActive: new Date() },
  { id: '2', name: 'Bob', type: 'analytical', capabilities: { feature1: 0.6 }, availability: true, performanceScore: 0.7, specializations: ['data'], workload: 0.2, lastActive: new Date() }
];

const task: TaskRequirement = {
  id: 'task1',
  name: 'Develop Marketing Strategy',
  requiredCapabilities: { feature1: { importance: 0.9, minimumLevel: 0.5 } },
  teamSize: { min: 2, max: 4, optimal: 3 },
  deadline: new Date(Date.now() + 86400000),
  complexity: 0.7,
  priority: 'high',
  collaboration: 'high'
};

const optimizationParams: OptimizationParams = {
  populationSize: 50,
  generations: 100,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  elitismRate: 0.05,
  convergenceThreshold: 0.01
};

const optimalTeam = optimizeTeamFormation(agents, task, optimizationParams);
console.log(optimalTeam);
```

## Parameters/Props

### AgentProfile
- `id`: Unique identifier for the agent (string).
- `name`: Name of the agent (string).
- `type`: Type of the agent (string - one of `creative`, `analytical`, `technical`, `collaborative`, `specialist`).
- `capabilities`: Object mapping capability names to proficiency levels (number).
- `availability`: Availability status (boolean).
- `performanceScore`: Overall performance score (number).
- `specializations`: Array of agent's specializations (string[]).
- `workload`: Current workload factor (number).
- `lastActive`: Last active date (Date).

### TaskRequirement
- `id`: Task identifier (string).
- `name`: Task name (string).
- `requiredCapabilities`: Requirements mapping capability names to importance and minimum level (object).
- `teamSize`: Expected size of the team (object with `min`, `max`, and `optimal`).
- `deadline`: Task deadline (Date).
- `complexity`: Task complexity level (number).
- `priority`: Task priority level (string - one of `low`, `medium`, `high`, `critical`).
- `collaboration`: Expected collaboration intensity (string - one of `low`, `medium`, `high`).

### OptimizationParams
- `populationSize`: Size of the population in genetic algorithm (number).
- `generations`: Number of generations to evolve (number).
- `mutationRate`: Rate of mutation in evolution (number).
- `crossoverRate`: Rate of crossover in evolution (number).
- `elitismRate`: Rate of elitism (number).
- `convergenceThreshold`: Threshold for convergence (number).

## Return Values
The `optimizeTeamFormation` function returns an optimal team composition encapsulated in the `TeamComposition` interface. This includes the selected agents, a fitness score, capability coverage details, and additional rationale for team selection.

### TeamComposition
- `id`: Unique identifier for the composition (string).
- `taskId`: Associated task identifier (string).
- `agents`: Array of selected `AgentProfile` for the team.
- `fitnessScore`: Fitness score of the team (number).
- `capabilityCoverage`: Coverage of capabilities in the team (object).
- `estimatedPerformance`: Expected performance of the team (number).
- `compositionRationale`: Rationale for the selected composition (string).
- `createdAt`: Creation timestamp (Date).
```