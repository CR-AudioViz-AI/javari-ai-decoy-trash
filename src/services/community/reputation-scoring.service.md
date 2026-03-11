# Build Community Reputation Scoring Service

```markdown
# Community Reputation Scoring Service

## Purpose
The Community Reputation Scoring Service calculates and maintains a reputation score for users within a community based on various metrics, including profile completeness, contributions, and engagement. The service tracks user actions and events to update scores and manage reputation badges, enhancing community interaction.

## Usage
This service is used to manage and assess user reputations within a platform. It provides functionality for scoring, event tracking, and badge allocation based on user achievements.

### Importing the Service
```typescript
import { ReputationMetrics, ReputationEvent, ReputationBadge, UserReputationProfile } from './community/reputation-scoring.service';
```

## Parameters/Props

### Interfaces

- **ReputationMetrics**
  - `profileScore`: Base score from user profile completeness (number).
  - `contributionScore`: Score from content contributions (number).
  - `reviewScore`: Score from peer reviews received (number).
  - `engagementScore`: Score from community engagement (number).
  - `helpfulnessScore`: Score from helping other users (number).
  - `penaltyScore`: Penalty score for violations (number).
  - `totalScore`: Total calculated reputation score (number).
  - `level`: Reputation level based on total score (ReputationLevel).
  - `lastUpdated`: Last score update timestamp (Date).

- **ReputationEvent**
  - `userId`: Unique identifier for the user (string).
  - `eventType`: Type of event that triggered the score update (ReputationEventType).
  - `eventData`: Additional data related to the event (Record<string, any>).
  - `points`: Points associated with the event (number).
  - `timestamp`: Time when the event occurred (Date).
  - `sourceId`: Optional identifier for the event source (string).
  - `category`: Category of the event (string).

- **ReputationBadge**
  - `id`: Unique identifier for the badge (string).
  - `name`: Name of the badge (string).
  - `description`: Description of the badge (string).
  - `icon`: Icon associated with the badge (string).
  - `requirements`: Requirements to earn the badge (BadgeRequirement[]).
  - `rarity`: Rarity of the badge (BadgeRarity).
  - `pointsAwarded`: Points awarded upon receiving the badge (number).

- **UserReputationProfile**
  - `userId`: Unique identifier for the user (string).
  - `metrics`: User's reputation metrics (ReputationMetrics).
  - `badges`: List of badge identifiers earned by the user (string[]).
  - `privileges`: List of user privileges (ReputationPrivilege[]).
  - `history`: User's reputation event history (ReputationEvent[]).
  - `rank`: User's rank within the community (number).
  - `percentile`: User's percentile score (number).
  - `streak`: Current and longest activity streak along with the last activity date (object).

## Return Values
This service performs various functions such as:
- Calculating user reputation metrics.
- Managing the assignment of badges based on specified requirements.
- Tracking user events and updating their reputation scores accordingly.

## Examples

### Fetching User Reputation Profile
```typescript
const userProfile: UserReputationProfile = await reputationService.getUserProfile(userId);
```

### Logging a Reputation Event
```typescript
const event: ReputationEvent = {
  userId: "123",
  eventType: ReputationEventType.CONTRIBUTION,
  eventData: { contentId: "abc" },
  points: 10,
  timestamp: new Date(),
  category: "content"
};
reputationService.logEvent(event);
```

### Awarding a Badge
```typescript
const badge: ReputationBadge = {
  id: "badge1",
  name: "Top Contributor",
  description: "Awarded for significant contributions to the community.",
  icon: "top_contributor_icon.png",
  requirements: [{ metric: 'contributionScore', operator: 'gte', value: 100 }],
  rarity: BadgeRarity.RARE,
  pointsAwarded: 50
};
reputationService.awardBadge(userId, badge);
```

This service is a comprehensive solution for managing and enhancing user reputations within a community setting.
```