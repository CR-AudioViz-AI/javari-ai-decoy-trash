# Build Team Performance Visualization Components

```markdown
# Team Performance Visualization Components

## Purpose
The `TeamPerformance` component provides a visual interface for tracking and analyzing team performance metrics over various time ranges. It helps in understanding individual agent contributions, collaboration patterns, and overall team effectiveness.

## Usage
To utilize the `TeamPerformance` component, import it into your React application and provide the necessary props, such as `teamId` and `timeRange`. This component will render performance metrics, activity logs, and other useful visualizations.

```tsx
import TeamPerformance from 'src/components/team-performance';

<TeamPerformance teamId="your-team-id" timeRange="7d" />
```

## Parameters/Props

### `TeamPerformanceProps`
- **teamId** *(string, optional)*: The unique identifier for the team being analyzed.
- **timeRange** *(string, optional)*: The duration for which performance data is displayed. Acceptable values include:
  - `'1h'` - Last hour
  - `'24h'` - Last 24 hours
  - `'7d'` - Last 7 days
  - `'30d'` - Last 30 days
- **realTimeEnabled** *(boolean, optional)*: A flag to enable real-time updates for the displayed metrics.

### Interfaces
- **Agent**: Represents an individual agent's data.
  - `id`: Unique identifier.
  - `name`: Agent's name.
  - `avatar`: URL of the agent's avatar (optional).
  - `role`: Agent's role.
  - `status`: Current status of the agent (`'online'`, `'busy'`, `'away'`, `'offline'`).
  - `lastActivity`: Last activity timestamp.
  - `tasksCompleted`: Total tasks completed by the agent.
  - `responseTime`: Average response time of the agent.
  - `qualityScore`: Quality metric score.
  - `collaborationScore`: Score assessing collaboration with others.

- **Activity**: Describes an agent's activity.
- **CollaborationPattern**: Outlines interactions between agents.
- **PerformanceMetric**: Contains overall performance data.

## Return Values
The component returns a visual structure comprising:
- Metrics cards displaying agent activity stats.
- Activity logs for tracking completed tasks and collaborations.
- Interactive tabs for navigating different data segments.

## Examples
Example of rendering the component with props:

```tsx
<TeamPerformance 
  teamId="12345" 
  timeRange="24h" 
  realTimeEnabled={true} 
/>
```

This displays the performance metrics of team ID `12345` for the last 24 hours and allows real-time data updates.

## Dependencies
- React
- lucide-react for icons
- Custom UI components from `@/components/ui/*`
```