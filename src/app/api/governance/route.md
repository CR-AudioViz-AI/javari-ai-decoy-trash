# Create Decentralized Voting API

# Decentralized Voting API Documentation

## Purpose

The Decentralized Voting API provides functionalities for creating proposals, casting votes, and querying governance data on a blockchain platform. It enables users to engage in governance by proposing, voting, and tracking voting outcomes in a decentralized manner.

## Usage

This API exposes several HTTP endpoints for creating proposals, voting on proposals, and querying proposal data. It is designed to work with blockchain smart contracts and requires integration with Supabase for data storage and Ethereum for blockchain interactions.

## Endpoints

### 1. Create Proposal

**Method:** POST  
**Endpoint:** `/api/governance/proposals`

**Parameters:**
- `title` (string): Title of the proposal (10-200 characters).
- `description` (string): Description of the proposal (50-5000 characters).
- `category` (enum): The category of proposal (`technical`, `economic`, `governance`, `community`).
- `votingPeriod` (number): Voting period in hours (minimum 24, maximum 336).
- `quorumThreshold` (number): Minimum required percentage to pass (0.1-1).
- `options` (array): Array of voting options (2-10 strings).
- `metadata` (object, optional): Additional metadata for the proposal.

**Return Values:**
- `201 Created`: On successful proposal creation.
- `400 Bad Request`: If validation fails.

### 2. Cast Vote

**Method:** POST  
**Endpoint:** `/api/governance/vote`

**Parameters:**
- `proposalId` (string): UUID of the proposal.
- `optionIndex` (number): Index of the selected voting option.
- `signature` (string): Ethereum signature for authentication (length 132).
- `walletAddress` (string): Address of the wallet (in `0x` format).
- `timestamp` (number): Timestamp in Unix format when the vote is cast.

**Return Values:**
- `200 OK`: On successful vote casting.
- `400 Bad Request`: If validation fails or if voting is closed.

### 3. Query Proposals

**Method:** GET  
**Endpoint:** `/api/governance/proposals`

**Parameters:**
- `status` (enum, optional): The status of proposals to query (`active`, `pending`, `executed`, `failed`, `all`, default: `active`).
- `category` (enum, optional): Proposal category to filter (`technical`, `economic`, `governance`, `community`, `all`, default: `all`).
- `page` (number, optional): Pagination page number (default: 1).
- `limit` (number, optional): Number of results per page (max 50, default: 20).
- `sortBy` (enum, optional): Field to sort results by (`created_at`, `vote_count`, `quorum_progress`, default: `created_at`).
- `sortOrder` (enum, optional): Order of sorting (`asc`, `desc`, default: `desc`).

**Return Values:**
- `200 OK`: Returns an array of proposals matching the criteria.
- `400 Bad Request`: If validation fails.

## Examples

### Create Proposal Example
```json
POST /api/governance/proposals
{
  "title": "Improve Community Engagement",
  "description": "This proposal aims to improve community engagement by organizing weekly AMA sessions.",
  "category": "community",
  "votingPeriod": 72,
  "quorumThreshold": 0.5,
  "options": ["Yes", "No"],
  "metadata": {"tags": ["community", "engagement"]}
}
```

### Cast Vote Example
```json
POST /api/governance/vote
{
  "proposalId": "a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6",
  "optionIndex": 0,
  "signature": "0x123...abc",
  "walletAddress": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  "timestamp": 1660000000
}
```

### Query Proposals Example
```http
GET /api/governance/proposals?status=active&category=all&page=1&limit=20
```