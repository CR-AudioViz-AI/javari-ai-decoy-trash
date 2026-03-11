# Build Community Social Activity Feed

# Community Social Activity Feed

## Purpose
The Community Social Activity Feed component displays a dynamic feed of community activities, showcasing content from creators, project showcases, collaborations, and trending discussions. It enhances user engagement by allowing interactions (likes, comments, shares) with each item in the feed.

## Usage
To utilize the Community Social Activity Feed, import the component into your page and integrate it within your React application. This component fetches and displays social activities, allowing users to interact with various posts.

```tsx
import CommunityFeed from 'src/app/(dashboard)/community/feed/page';
```

## Parameters / Props
The Community Social Activity Feed does not accept any external props directly as it fetches data internally. However, it interacts with the following data structures:

### FeedItem
- `id` (string): Unique identifier for the feed item.
- `type` (string): Type of the feed item, can be one of:
  - `'creator_update'`
  - `'project_showcase'`
  - `'collaboration'`
  - `'trending_discussion'`
- `author` (object): Information about the author, including:
  - `id` (string): Author's unique identifier.
  - `name` (string): Author's name.
  - `avatar` (string): URL to the author's avatar image.
  - `verified` (boolean): Whether the author is verified.
  - `followers` (number): Count of followers.
  
- `content` (object): Content details including:
  - `title` (string): Title of the post.
  - `description` (string): Description of the post.
  - `media` (object, optional): Media details that can include:
    - `type` (string): Media type ('audio', 'video', 'image').
    - `url` (string): Media URL.
    - `thumbnail` (string, optional): Thumbnail URL for media.
    - `duration` (number, optional): Duration of media (if applicable).
  - `tags` (array of strings): Tags associated with the post.
  - `metadata` (object, optional): Additional metadata.

- `engagement` (object): Engagement statistics including:
  - `likes` (number): Count of likes.
  - `comments` (number): Count of comments.
  - `shares` (number): Count of shares.
  - `bookmarks` (number): Count of bookmarks.
  - `views` (number): Count of views.
  - `isLiked` (boolean): Indicates if the user liked the post.
  - `isBookmarked` (boolean): Indicates if the post is bookmarked.

- `timestamp` (string): Time when the post was created.

### TrendingTopic
- `id` (string): Unique identifier for the trending topic.
- `name` (string): Name of the trending topic.
- `posts` (number): Count of posts related to the topic.
- `trend` (string): Trend status ('up', 'down', 'stable').

### SuggestedCreator
- `id` (string): Unique identifier for the suggested creator.
- `name` (string): Name of the creator.
- `avatar` (string): URL to the creator's avatar image.
- `specialty` (string): Creator's specialty.
- `followers` (number): Count of followers.

## Return Values
This component returns a JSX element representing the activity feed, which includes a collection of feed items, trending topics, and suggested creators.

## Examples
```tsx
const ExampleUsage = () => {
  return (
    <div>
      <h1>Community Feed</h1>
      <CommunityFeed />
    </div>
  );
};
```

This example demonstrates how to integrate the Community Social Activity Feed into a parent component, rendering it effectively within the application.