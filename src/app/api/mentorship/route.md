# Build Creator Mentorship Matching API

# Creator Mentorship Matching API Documentation

## Purpose
The Creator Mentorship Matching API facilitates the creation of mentorship profiles, finding mentor-mentee matches based on specified criteria, creating mentorship matches, and scheduling mentorship sessions.

## Usage
This API is designed for creators looking to mentor or be mentored, allowing users to create profiles, find matches, establish connections, and schedule meetings efficiently.

### Endpoints
1. **Create Mentorship Profile**
2. **Find Matches**
3. **Create Match**
4. **Schedule Session**

## Parameters/Props

### 1. Create Mentorship Profile
- **user_id**: `string` (UUID) required - Unique identifier for the user.
- **role**: `enum` - ['mentor' | 'mentee'] required - Defines the role of the user.
- **skills**: `array of strings` required - List of skills the user possesses.
- **interests**: `array of strings` required - List of interests of the user.
- **experience_level**: `enum` - ['beginner' | 'intermediate' | 'advanced' | 'expert'] required - User's experience level.
- **availability**: `object` required - User's availability for mentoring:
  - **timezone**: `string` - Timezone of the user.
  - **weekly_hours**: `number` (1-40) - Hours available per week.
  - **preferred_times**: `array of objects` - Preferred availability times with fields:
    - **day**: `enum` - ['monday'... 'sunday']
    - **start_time**: `string` - Start time in string format.
    - **end_time**: `string` - End time in string format.
- **goals**: `string` optional - User's goals for mentorship.
- **bio**: `string` (max 500) optional - Brief biography of the user.
- **max_mentees**: `number` (1-10) optional - Maximum number of mentees for mentors.
- **preferred_communication**: `array of enum` - ['video' | 'audio' | 'chat' | 'email'] optional - Preferred communication methods.

### 2. Find Matches
- **user_id**: `string` (UUID) required - Unique identifier for the user.
- **filters**: `object` optional - Filtering criteria for matching:
  - **skills**: `array of strings` optional - Skills to filter on.
  - **experience_level**: `array of strings` optional - Experience levels to filter on.
  - **availability_overlap**: `number` (0-1) optional - Availability matching percentage.
  - **max_distance**: `number` optional - Distance filter for locating matches.
  - **language**: `string` optional - Language preference.

### 3. Create Match
- **mentor_id**: `string` (UUID) required - Mentor's user ID.
- **mentee_id**: `string` (UUID) required - Mentee's user ID.
- **program_id**: `string` (UUID) optional - Associated program ID.
- **goals**: `string` optional - Goals for the mentorship.
- **duration_weeks**: `number` (1-52) default: 12 - Duration of the mentorship.

### 4. Schedule Session
- **match_id**: `string` (UUID) required - ID of the mentorship match.
- **scheduled_at**: `string` (datetime) required - Scheduled date and time of the session.
- **duration_minutes**: `number` (15-180) default: 60 - Duration of the session in minutes.
- **session_type**: `enum` - ['introduction' | 'regular' | 'milestone' | 'final'] required - Type of the session.
- **agenda**: `string` optional - Agenda for the session.

## Return Values
Each API call returns a structured response indicating success or failure, including any relevant data such as match IDs or profiles created.

## Examples
### Create a Mentorship Profile
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "role": "mentor",
  "skills": ["JavaScript", "React"],
  "interests": ["Web Development"],
  "experience_level": "advanced",
  "availability": {
    "timezone": "UTC",
    "weekly_hours": 10,
    "preferred_times": [
      {
        "day": "monday",
        "start_time": "10:00",
        "end_time": "12:00"
      }
    ]
  }
}
```

### Find Matches
```json