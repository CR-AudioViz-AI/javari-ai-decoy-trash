# Create Team Collaboration State API

```markdown
# Team Collaboration State API Documentation

## Purpose
The Team Collaboration State API provides endpoints to manage and retrieve the real-time collaboration state of teams working on projects. It facilitates tracking of team members, active workflows, communication logs, and metrics associated with team collaboration.

## Usage
This API can be used to create, update, and retrieve the current state of team collaboration in real-time. It integrates with Redis for caching and Supabase for persistent storage.

### Endpoints
1. **Create Collaboration State**
   - **POST /api/team-collaboration**
   - Create a new collaboration state for a specified team and project.

2. **Get Collaboration State**
   - **GET /api/team-collaboration/{teamId}/{projectId}**
   - Retrieve the current collaboration state for the specified team and project.

## Parameters/Props

### Team Member Schema
- **id**: `string` (UUID) - Unique identifier for the team member.
- **name**: `string` - Name of the team member (1-100 characters).
- **role**: `enum` - Role of the team member (e.g., 'architect', 'engineer', etc.).
- **status**: `enum` - Current status of the member (e.g., 'active', 'busy', etc.).
- **currentTask**: `string` (optional) - Current task assigned to the member.
- **lastActivity**: `string` (datetime) - Timestamp of last activity by the member.

### Collaboration State Schema
- **teamId**: `string` (UUID) - Unique identifier for the team.
- **projectId**: `string` (UUID) - Unique identifier for the project.
- **sessionId**: `string` (UUID) - Unique identifier for the collaboration session.
- **members**: `array` - List of team member objects.
- **sharedContext**: `object` - Additional context shared among team members.
- **activeWorkflows**: `array` - List of currently active workflows.
- **communicationLog**: `array` - Log of communication events between team members.
- **metrics**: `object` - Metrics pertaining to the collaboration state.

### Active Workflows Schema
- **id**: `string` (UUID) - Unique identifier for the workflow.
- **name**: `string` - Name of the workflow.
- **status**: `enum` - Current status of the workflow (e.g. 'in-progress').
- **assignedTo**: `array` - List of member IDs assigned to the workflow.
- **dependencies**: `array` - List of workflow IDs that this workflow depends on.
- **progress**: `number` (0-100) - Progress percentage of the workflow.
- **createdAt**: `string` (datetime) - Timestamp of when the workflow was created.
- **updatedAt**: `string` (datetime) - Timestamp of the last update to the workflow.

### Communication Log Schema
- **id**: `string` (UUID) - Unique identifier for the communication event.
- **fromMemberId**: `string` (UUID) - ID of the member sending the message.
- **toMemberId**: `string` (optional, UUID) - ID of the member receiving the message.
- **message**: `string` - The content of the message.
- **type**: `enum` - Type of communication (e.g., 'task-assignment').
- **timestamp**: `string` (datetime) - Timestamp of when the message was sent.

## Return Values
- Returns a JSON object representing the created or retrieved collaboration state, including team members, workflows, communication logs, and metrics.

## Examples

### Create Collaboration State
```http
POST /api/team-collaboration
Content-Type: application/json

{
  "teamId": "team-uuid",
  "projectId": "project-uuid",
  "sessionId": "session-uuid",
  "members": [
    {
      "id": "member-uuid",
      "name": "John Doe",
      "role": "engineer",
      "status": "active",
      "currentTask": "Task ID",
      "lastActivity": "2023-10-01T12:00:00Z"
    }
  ],
  "sharedContext": {},
  "activeWorkflows": [],
  "communicationLog": [],
  "metrics": {
    "totalTasks": 10,
    "completedTasks": 5,
    "activeMembers": 3
  }
}
```

### Get Collaboration State
```http
GET /api/team-collaboration/team-uuid/project-uuid
```
Returns the current collaboration state for the specified team and project.
```json
{
  "teamId": "