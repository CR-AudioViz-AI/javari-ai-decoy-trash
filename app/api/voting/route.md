# Build Democratic Voting System API

# Democratic Voting System API Documentation

## Purpose
The Democratic Voting System API provides endpoints for creating proposals, submitting votes, creating delegations, and managing proposal statuses in a democratic voting environment. It utilizes a robust architecture backed by Supabase to handle persistence and real-time updates.

## Usage
The API is built using TypeScript and adheres to the Next.js conventions. It leverages the Supabase client for database interactions and employs Zod for input validation.

### Endpoints
- **Create Proposal**: Create a new voting proposal.
- **Submit Vote**: Submit a vote on an existing proposal.
- **Create Delegation**: Delegate voting rights to another user.
- **Update Proposal Status**: Change the status of an existing proposal.

## Parameters/Props
### Proposal Creation
**Request Body**:
```json
{
  "title": "string (min 10, max 200)",
  "description": "string (min 50, max 5000)",
  "options": ["string (min 1, max 100)"], // at least 2, max 10
  "voting_type": "enum (simple, weighted, quadratic)",
  "duration_hours": "number (min 1, max 168)", // Duration in hours
  "requires_delegation": "boolean (optional, default false)",
  "minimum_weight": "number (min 0, optional, default 1)"
}
```

### Vote Submission
**Request Body**:
```json
{
  "proposal_id": "string (UUID format)",
  "option_index": "number (integer, min 0)",
  "weight_override": "number (optional, min 0)"
}
```

### Delegation Creation
**Request Body**:
```json
{
  "delegate_to": "string (UUID format)",
  "proposal_categories": ["string (optional)"],
  "expiry_date": "string (datetime, optional)"
}
```

### Update Proposal Status
**Request Body**:
```json
{
  "proposal_id": "string (UUID format)",
  "status": "enum (draft, active, completed, cancelled)"
}
```

## Return Values
- **Create Proposal**: Returns the created proposal object with its unique ID and status.
- **Submit Vote**: Returns a confirmation of the vote submission and the current vote tally.
- **Create Delegation**: Returns the delegation record created.
- **Update Proposal Status**: Returns the updated proposal object with the new status.

## Examples

### Create Proposal Example
```json
POST /api/voting/proposals
{
  "title": "Best Programming Language",
  "description": "Vote for your favorite programming language among these options.",
  "options": ["JavaScript", "Python", "Java"],
  "voting_type": "weighted",
  "duration_hours": 24
}
```

### Submit Vote Example
```json
POST /api/voting/votes
{
  "proposal_id": "550e8400-e29b-41d4-a716-446655440000",
  "option_index": 1
}
```

### Create Delegation Example
```json
POST /api/voting/delegations
{
  "delegate_to": "550e8400-e29b-41d4-a716-446655440001",
  "proposal_categories": ["technology"],
  "expiry_date": "2023-10-31T23:59:59Z"
}
```

### Update Proposal Status Example
```json
PATCH /api/voting/proposals
{
  "proposal_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active"
}
```