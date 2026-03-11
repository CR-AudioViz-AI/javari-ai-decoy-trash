# Build Community Event Management Service

# Community Event Management Service

## Purpose

The Community Event Management Service provides a comprehensive solution for organizing and managing virtual meetups, hackathons, workshops, webinars, and conferences. It supports functionalities including event registration, scheduling, live streaming, and attendee management.

## Usage

To use the Community Event Management Service, import the necessary classes and interfaces defined in `src/services/community/event-management.service.ts`. Utilize the types and interfaces to create, manage, and stream events effectively.

### Example Usage

```typescript
import { CommunityEvent, EventType, EventStatus } from './src/services/community/event-management.service';

const newEvent: CommunityEvent = {
    id: '1',
    title: 'Virtual Hackathon',
    description: 'Join us for a coding extravaganza!',
    type: EventType.HACKATHON,
    status: EventStatus.DRAFT,
    organizerId: '123',
    organizerName: 'Tech Community',
    startTime: new Date('2023-12-01T10:00:00Z'),
    endTime: new Date('2023-12-01T18:00:00Z'),
    timezone: 'UTC',
    currentAttendees: 0,
    isPublic: true,
    isPaid: false,
    tags: ['hackathon', 'coding', 'community'],
    createdAt: new Date(),
    updatedAt: new Date()
};
```

## Parameters/Props

### CommunityEvent Interface

- **id** (string): Unique identifier for the event.
- **title** (string): Title of the event.
- **description** (string): Detailed description of the event.
- **type** (EventType): Type of the event (e.g., MEETUP, HACKATHON).
- **status** (EventStatus): Current status of the event (e.g., DRAFT, PUBLISHED).
- **organizerId** (string): Identifier for the event organizer.
- **organizerName** (string): Name of the organizer.
- **startTime** (Date): Start date and time of the event.
- **endTime** (Date): End date and time of the event.
- **timezone** (string): Timezone in which the event will take place.
- **maxAttendees** (number, optional): Maximum number of attendees allowed.
- **currentAttendees** (number): Current number of attendees registered.
- **isPublic** (boolean): Indicates if the event is public or private.
- **isPaid** (boolean): Indicates if the event is a paid event.
- **price** (number, optional): Cost of registering for the event.
- **currency** (string, optional): Currency code for the event price.
- **tags** (string[]): Array of tags associated with the event.
- **coverImage** (string, optional): URL for the event cover image.
- **venue** (EventVenue, optional): Information about the event venue.
- **streamConfig** (StreamConfiguration, optional): Configuration for live streaming.
- **registrationDeadline** (Date, optional): Registration deadline for the event.
- **prerequisites** (string[], optional): Prerequisites required to attend.
- **materials** (EventMaterial[], optional): Additional materials for the event.
- **speakers** (EventSpeaker[], optional): List of speakers for the event.
- **agenda** (EventAgendaItem[], optional): Agenda items for the event.
- **recordingUrl** (string, optional): URL for the recorded session after the event.
- **createdAt** (Date): Timestamp for when the event was created.
- **updatedAt** (Date): Timestamp for when the event was last updated.

## Return Values

The Community Event Management Service returns the created or updated `CommunityEvent` object upon successful event creation or modification. 

### Example Return

```typescript
const createdEvent: CommunityEvent = await eventService.createEvent(newEvent);
console.log(createdEvent);
```

This service is designed to enable seamless event management, ensuring users can effectively engage and organize community events in a robust manner.