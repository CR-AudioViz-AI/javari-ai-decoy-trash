```tsx
'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp,
  Users,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Filter,
  Sparkles,
  Clock,
  Eye,
  ArrowUp,
  RefreshCw,
  Zap
} from 'lucide-react'

interface User {
  id: string
  name: string
  avatar?: string
  username: string
  isVerified?: boolean
}

interface InterestTag {
  id: string
  name: string
  relevanceScore: number
  color: string
}

interface EngagementMetrics {
  likes: number
  comments: number
  shares: number
  views: number
  bookmarks: number
  engagementRate: number
}

interface TimelinePost {
  id: string
  content: string
  author: User
  createdAt: string
  updatedAt?: string
  mediaUrls?: string[]
  interestTags: InterestTag[]
  engagementMetrics: EngagementMetrics
  recommendationScore: number
  algorithmFactors: {
    trendingWeight: number
    friendActivityWeight: number
    interestWeight: number
    recencyWeight: number
    qualityScore: number
  }
  isTrending: boolean
  friendActivity?: {
    friends: User[]
    action: 'liked' | 'commented' | 'shared'
    timestamp: string
  }
  isBookmarked: boolean
  isLiked: boolean
}

interface FeedFilters {
  contentType: 'all' | 'trending' | 'friends' | 'interests'
  timeRange: 'today' | 'week' | 'month' | 'all'
  interests: string[]
  minEngagement: number
}

interface AlgorithmicTimelineProps {
  userId: string
  initialPosts?: TimelinePost[]
  className?: string
  enableRealTimeUpdates?: boolean
  maxPostsPerLoad?: number
  virtualScrollHeight?: number
}

const TrendingIndicator: React.FC<{ isVisible: boolean; score: number }> = ({
  isVisible,
  score
}) => {
  if (!isVisible) return null

  return (
    <div className="flex items-center gap-1 text-orange-500 text-xs font-medium">
      <TrendingUp className="h-3 w-3" />
      <span>Trending</span>
      <Badge variant="secondary" className="text-xs px-1 py-0">
        {Math.round(score * 100)}%
      </Badge>
    </div>
  )
}

const FriendActivityBadge: React.FC<{ activity?: TimelinePost['friendActivity'] }> = ({
  activity
}) => {
  if (!activity) return null

  const { friends, action } = activity
  const displayFriends = friends.slice(0, 3)
  const remainingCount = friends.length - displayFriends.length

  const actionText = {
    liked: 'liked this',
    commented: 'commented on this',
    shared: 'shared this'
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
      <div className="flex -space-x-1">
        {displayFriends.map((friend) => (
          <Avatar key={friend.id} className="h-4 w-4 border border-background">
            <AvatarImage src={friend.avatar} alt={friend.name} />
            <AvatarFallback className="text-xs">
              {friend.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span>
        <span className="font-medium">
          {displayFriends[0]?.name}
          {remainingCount > 0 && ` +${remainingCount} others`}
        </span>{' '}
        {actionText[action]}
      </span>
    </div>
  )
}

const InterestTagComponent: React.FC<{ tag: InterestTag }> = ({ tag }) => (
  <Badge
    variant="secondary"
    className="text-xs"
    style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
  >
    {tag.name}
    <span className="ml-1 opacity-70">
      {Math.round(tag.relevanceScore * 100)}%
    </span>
  </Badge>
)

const RecommendationScore: React.FC<{ score: number; factors: TimelinePost['algorithmFactors'] }> = ({
  score,
  factors
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500'
    if (score >= 0.6) return 'text-yellow-500'
    return 'text-gray-500'
  }

  return (
    <div className="flex items-center gap-1">
      <Sparkles className={`h-3 w-3 ${getScoreColor(score)}`} />
      <span className={`text-xs font-medium ${getScoreColor(score)}`}>
        {Math.round(score * 100)}% match
      </span>
    </div>
  )
}

const EngagementMetricsComponent: React.FC<{ metrics: EngagementMetrics; isLiked: boolean; isBookmarked: boolean }> = ({
  metrics,
  isLiked,
  isBookmarked
}) => (
  <div className="flex items-center justify-between pt-3">
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="sm" className="p-1 h-auto">
        <Heart className={`h-4 w-4 mr-1 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
        <span className="text-xs">{metrics.likes}</span>
      </Button>
      <Button variant="ghost" size="sm" className="p-1 h-auto">
        <MessageCircle className="h-4 w-4 mr-1" />
        <span className="text-xs">{metrics.comments}</span>
      </Button>
      <Button variant="ghost" size="sm" className="p-1 h-auto">
        <Share2 className="h-4 w-4 mr-1" />
        <span className="text-xs">{metrics.shares}</span>
      </Button>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Eye className="h-3 w-3" />
        {metrics.views}
      </div>
      <Button variant="ghost" size="sm" className="p-1 h-auto">
        <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
      </Button>
    </div>
  </div>
)

const TimelinePostComponent: React.FC<{ post: TimelinePost; onInteraction: (postId: string, action: string) => void }> = ({
  post,
  onInteraction
}) => (
  <Card className="mb-4">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author.avatar} alt={post.author.name} />
            <AvatarFallback>{post.author.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{post.author.name}</span>
              {post.author.isVerified && <Zap className="h-3 w-3 text-blue-500" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>@{post.author.username}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(post.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RecommendationScore score={post.recommendationScore} factors={post.algorithmFactors} />
          <Button variant="ghost" size="sm" className="p-1 h-auto">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <TrendingIndicator isVisible={post.isTrending} score={post.algorithmFactors.trendingWeight} />
        <div className="flex gap-1">
          {post.interestTags.slice(0, 3).map((tag) => (
            <InterestTagComponent key={tag.id} tag={tag} />
          ))}
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <FriendActivityBadge activity={post.friendActivity} />
      <p className="text-sm leading-relaxed mb-3">{post.content}</p>
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {post.mediaUrls.slice(0, 4).map((url, index) => (
            <div key={index} className="aspect-video bg-muted rounded-md"></div>
          ))}
        </div>
      )}
      <EngagementMetricsComponent
        metrics={post.engagementMetrics}
        isLiked={post.isLiked}
        isBookmarked={post.isBookmarked}
      />
    </CardContent>
  </Card>
)

const FeedFiltersComponent: React.FC<{
  filters: FeedFilters
  onFiltersChange: (filters: FeedFilters) => void
  availableInterests: string[]
}> = ({ filters, onFiltersChange, availableInterests }) => (
  <Card className="mb-6">
    <CardContent className="pt-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium text-sm">Filters</span>
        </div>
        <Select
          value={filters.contentType}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, contentType: value as FeedFilters['contentType'] })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="friends">Friends</SelectItem>
            <SelectItem value="interests">Interests</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.timeRange}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, timeRange: value as FeedFilters['timeRange'] })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
)

const LoadMoreTrigger: React.FC<{ onLoadMore: () => void; isLoading: boolean }> = ({
  onLoadMore,
  isLoading
}) => (
  <div className="flex justify-center py-6">
    <Button onClick={onLoadMore} disabled={isLoading} className="gap-2">
      {isLoading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowUp className="h-4 w-4 rotate-180" />
      )}
      {isLoading ? 'Loading...' : 'Load More Posts'}
    </Button>
  </div>
)

const PostSkeleton: React.FC = () => (
  <Card className="mb-4">
    <CardHeader className="pb-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-4" />
      <div className="flex gap-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </CardContent>
  </Card>
)

export const AlgorithmicTimeline: React.FC<AlgorithmicTimelineProps> = ({
  userId,
  initialPosts = [],
  className = '',
  enableRealTimeUpdates = true,
  maxPostsPerLoad = 20,
  virtualScrollHeight = 800
}) => {
  const [posts, setPosts] = useState<TimelinePost[]>(initialPosts)
  const [filters, setFilters] = useState<FeedFilters>({
    contentType: 'all',
    timeRange: 'week',
    interests: [],
    minEngagement: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [availableInterests, setAvailableInterests] = useState<string[]>([])

  // Simulate API calls
  const fetchPosts = useCallback(async (loadMore = false) => {
    setIsLoading(true)
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Generate mock posts based on current filters
      const newPosts: TimelinePost[] = Array.from({ length: maxPostsPerLoad }, (_, i) => ({
        id: `post-${Date.now()}-${i}`,
        content: `This is a sample post #${i + 1} that demonstrates the algorithmic timeline with personalized content based on user preferences and ML recommendations.`,
        author: {
          id: `user-${i}`,
          name: `User ${i + 1}`,
          username: `user${i + 1}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
          isVerified: Math.random() > 0.7
        },
        createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        interestTags: [
          {
            id: `tag-${i}-1`,
            name: ['Music', 'Tech', 'Art', 'Gaming', 'Science'][Math.floor(Math.random() * 5)],
            relevanceScore: Math.random(),
            color: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'][Math.floor(Math.random() * 5)]
          }
        ],
        engagementMetrics: {
          likes: Math.floor(Math.random() * 1000),
          comments: Math.floor(Math.random() * 100),
          shares: Math.floor(Math.random() * 50),
          views: Math.floor(Math.random() * 5000),
          bookmarks: Math.floor(Math.random() * 200),
          engagementRate: Math.random()
        },
        recommendationScore: Math.random(),
        algorithmFactors: {
          trendingWeight: Math.random(),
          friendActivityWeight: Math.random(),
          interestWeight: Math.random(),
          recencyWeight: Math.random(),
          qualityScore: Math.random()
        },
        isTrending: Math.random() > 0.8,
        friendActivity: Math.random() > 0.7 ? {
          friends: [{
            id: `friend-${i}`,
            name: `Friend ${i}`,
            username: `friend${i}`,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=friend${i}`
          }],
          action: ['liked', 'commented', 'shared'][Math.floor(Math.random() * 3)] as 'liked' | 'commented' | 'shared',
          timestamp: new Date().toISOString()
        } : undefined,
        isBookmarked: Math.random() > 0.8,
        isLiked: Math.random() > 0.6
      }))

      if (loadMore) {
        setPosts(prev => [...prev, ...newPosts])
      } else {
        setPosts(newPosts)
      }
    } catch (error) {
      console.error('Error fetching posts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filters, maxPostsPerLoad])

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchPosts(true)
    }
  }, [fetchPosts, isLoading, hasMore])

  const handleInteraction = useCallback((postId: string, action: string) => {
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        switch (action) {
          case 'like':
            return {
              ...post,
              isLiked: !post.isLiked,
              engagementMetrics: {
                ...post.engagementMetrics,
                likes: post.isLiked 
                  ? post.engagementMetrics.likes - 1 
                  : post.engagementMetrics.likes + 1
              }
            }
          case 'bookmark':
            return { ...post, isBookmarked: !post.isBookmarked }
          default:
            return post
        }
      }
      return post
    }))
  }, [])

  // Filter posts based on current filters
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (filters.contentType === 'trending' && !post.isTrending) return false
      if (filters.contentType === 'friends' && !post.friendActivity) return false
      if (filters.contentType === 'interests' && post.interestTags.length === 0) return false
      
      const postDate = new Date(post.createdAt)
      const now = new Date()
      const daysDiff = (now.getTime() - postDate.getTime()) / (1000 * 3600 * 24)
      
      switch (filters.timeRange) {
        case 'today':
          if (daysDiff > 1) return false
          break
        case 'week':
          if (daysDiff > 7) return false
          break
        case 'month':
          if (daysDiff > 30) return false
          break
      }
      
      return true
    }).sort((a, b) => b.recommendationScore - a.recommendationScore)
  }, [posts, filters])

  useEffect(() => {
    fetchPosts(false)
  }, [fetchPosts])

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      <FeedFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        availableInterests={availableInterests}
      />
      
      <ScrollArea className="h-full">
        <div className="space-y-0">
          {isLoading && posts.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <PostSkeleton key={i} />
            ))
          ) : (
            filteredPosts.map((post) => (
              <TimelinePostComponent
                key={post.id}
                post={post}
                onInteraction={handleInteraction}
              />
            ))
          )}
          
          {hasMore && (
            <LoadMoreTrigger onLoadMore={handleLoadMore} isLoading={isLoading} />
          )}
          
          {!hasMore && posts.length > 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              You've reached the end of your feed
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export default AlgorithmicTimeline
```