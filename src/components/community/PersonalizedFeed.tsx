```tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useIntersection } from '@mantine/hooks';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  Filter,
  TrendingUp,
  Users,
  Clock,
  Music
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFeedStore } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface FeedPost {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  tags: string[];
  audioTrack?: {
    id: string;
    title: string;
    duration: number;
    waveformUrl: string;
  };
  engagementScore: number;
  relevanceScore: number;
}

interface FeedFilters {
  contentType: 'all' | 'audio' | 'text' | 'collaboration';
  timeRange: 'today' | 'week' | 'month' | 'all';
  sortBy: 'relevance' | 'latest' | 'trending' | 'social';
  tags: string[];
  following: boolean;
}

interface PersonalizedFeedProps {
  className?: string;
  initialFilters?: Partial<FeedFilters>;
  showFilters?: boolean;
  maxWidth?: string;
}

const DEFAULT_FILTERS: FeedFilters = {
  contentType: 'all',
  timeRange: 'week',
  sortBy: 'relevance',
  tags: [],
  following: false
};

const POSTS_PER_PAGE = 10;

export function PersonalizedFeed({
  className,
  initialFilters = {},
  showFilters = true,
  maxWidth = 'max-w-2xl'
}: PersonalizedFeedProps) {
  const { user } = useAuthStore();
  const { 
    filters, 
    setFilters, 
    engagementEvents, 
    addEngagementEvent,
    socialGraph,
    updateSocialGraph 
  } = useFeedStore();
  const queryClient = useQueryClient();
  
  const [activeFilters, setActiveFilters] = useState<FeedFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
    ...filters
  });

  const lastPostRef = useRef<HTMLDivElement>(null);
  const { ref: intersectionRef, entry } = useIntersection({
    root: lastPostRef.current,
    threshold: 1
  });

  // Fetch personalized feed data
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch
  } = useInfiniteQuery({
    queryKey: ['personalizedFeed', user?.id, activeFilters],
    queryFn: async ({ pageParam }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('get_personalized_feed', {
        user_id: user.id,
        filters: activeFilters,
        cursor: pageParam,
        limit: POSTS_PER_PAGE
      });

      if (error) throw error;
      return data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.length || lastPage.length < POSTS_PER_PAGE) {
        return undefined;
      }
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false
  });

  const posts = useMemo(() => {
    return data?.pages.flat() || [];
  }, [data]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('posts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts'
      }, (payload) => {
        queryClient.invalidateQueries({
          queryKey: ['personalizedFeed', user.id]
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Infinite scroll trigger
  useEffect(() => {
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [entry?.isIntersecting, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<FeedFilters>) => {
    const updatedFilters = { ...activeFilters, ...newFilters };
    setActiveFilters(updatedFilters);
    setFilters(updatedFilters);
  }, [activeFilters, setFilters]);

  // Handle engagement actions
  const handleEngagement = useCallback(async (
    postId: string, 
    action: 'like' | 'comment' | 'share' | 'bookmark',
    value?: boolean | string
  ) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase.rpc('handle_post_engagement', {
        user_id: user.id,
        post_id: postId,
        action,
        value
      });

      if (error) throw error;

      // Track engagement for personalization
      addEngagementEvent({
        postId,
        action,
        timestamp: Date.now(),
        value
      });

      // Optimistic update
      queryClient.setQueryData(
        ['personalizedFeed', user.id, activeFilters],
        (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page: FeedPost[]) =>
              page.map(post => 
                post.id === postId 
                  ? updatePostEngagement(post, action, value)
                  : post
              )
            )
          };
        }
      );

    } catch (error) {
      console.error('Engagement action failed:', error);
    }
  }, [user?.id, addEngagementEvent, queryClient, activeFilters]);

  const updatePostEngagement = (post: FeedPost, action: string, value?: boolean | string) => {
    switch (action) {
      case 'like':
        return {
          ...post,
          isLiked: Boolean(value),
          likesCount: post.likesCount + (value ? 1 : -1)
        };
      case 'bookmark':
        return {
          ...post,
          isBookmarked: Boolean(value)
        };
      case 'comment':
        return {
          ...post,
          commentsCount: post.commentsCount + 1
        };
      case 'share':
        return {
          ...post,
          sharesCount: post.sharesCount + 1
        };
      default:
        return post;
    }
  };

  if (!user) {
    return (
      <EmptyFeedState 
        title="Sign In Required"
        description="Please sign in to view your personalized community feed"
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-6", maxWidth, className)}>
      {showFilters && (
        <FeedFilters 
          filters={activeFilters}
          onFilterChange={handleFilterChange}
        />
      )}

      {isLoading ? (
        <LoadingFeedSkeleton />
      ) : isError ? (
        <EmptyFeedState 
          title="Failed to Load Feed"
          description="Unable to load your personalized feed. Please try again."
          action={
            <Button onClick={() => refetch()} variant="outline">
              <Clock className="w-4 h-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : posts.length === 0 ? (
        <EmptyFeedState 
          title="No Posts Found"
          description="Try adjusting your filters or following more community members to see content."
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <div
              key={post.id}
              ref={index === posts.length - 1 ? intersectionRef : undefined}
            >
              <FeedPost 
                post={post}
                onEngagement={handleEngagement}
              />
            </div>
          ))}

          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Loading more posts...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedFilters({ 
  filters, 
  onFilterChange 
}: { 
  filters: FeedFilters;
  onFilterChange: (filters: Partial<FeedFilters>) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4" />
          <h3 className="font-medium">Feed Filters</h3>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs 
          value={filters.sortBy} 
          onValueChange={(value) => onFilterChange({ sortBy: value as any })}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="relevance" className="flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Smart</span>
            </TabsTrigger>
            <TabsTrigger value="latest" className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Latest</span>
            </TabsTrigger>
            <TabsTrigger value="trending" className="flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Trending</span>
            </TabsTrigger>
            <TabsTrigger value="social" className="flex items-center space-x-1">
              <Users className="w-3 h-3" />
              <span>Social</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 flex flex-wrap gap-2">
          {['all', 'audio', 'text', 'collaboration'].map((type) => (
            <Button
              key={type}
              variant={filters.contentType === type ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange({ contentType: type as any })}
              className="text-xs"
            >
              {type === 'audio' && <Music className="w-3 h-3 mr-1" />}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedPost({ 
  post, 
  onEngagement 
}: { 
  post: FeedPost;
  onEngagement: (postId: string, action: 'like' | 'comment' | 'share' | 'bookmark', value?: boolean | string) => void;
}) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={post.author.avatarUrl} alt={post.author.displayName} />
              <AvatarFallback>
                {post.author.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-medium text-sm">{post.author.displayName}</h4>
                {post.author.isVerified && (
                  <Badge variant="secondary" className="text-xs px-1 py-0">
                    ✓
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <span>@{post.author.username}</span>
                <span>•</span>
                <span>{formatTimeAgo(post.createdAt)}</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{post.content}</p>

          {post.audioTrack && (
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Music className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-sm">{post.audioTrack.title}</h5>
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(post.audioTrack.duration / 60)}:
                      {(post.audioTrack.duration % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Play
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <FeedPostActions 
            post={post}
            onEngagement={onEngagement}
          />

          <UserEngagementIndicator 
            relevanceScore={post.relevanceScore}
            engagementScore={post.engagementScore}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FeedPostActions({ 
  post, 
  onEngagement 
}: { 
  post: FeedPost;
  onEngagement: (postId: string, action: 'like' | 'comment' | 'share' | 'bookmark', value?: boolean | string) => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2 border-t">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEngagement(post.id, 'like', !post.isLiked)}
          className={cn(
            "space-x-1",
            post.isLiked && "text-red-500 hover:text-red-600"
          )}
        >
          <Heart 
            className={cn("w-4 h-4", post.isLiked && "fill-current")} 
          />
          <span className="text-xs">{post.likesCount}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEngagement(post.id, 'comment')}
          className="space-x-1"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-xs">{post.commentsCount}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEngagement(post.id, 'share')}
          className="space-x-1"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-xs">{post.sharesCount}</span>
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEngagement(post.id, 'bookmark', !post.isBookmarked)}
        className={cn(
          post.isBookmarked && "text-blue-500 hover:text-blue-600"
        )}
      >
        <Bookmark 
          className={cn("w-4 h-4", post.isBookmarked && "fill-current")} 
        />
      </Button>
    </div>
  );
}

function UserEngagementIndicator({ 
  relevanceScore, 
  engagementScore 
}: { 
  relevanceScore: number;
  engagementScore: number;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "bg-green-500";
    if (score >= 0.6) return "bg-yellow-500";
    return "bg-gray-500";
  };

  return (
    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
      <div className="flex items-center space-x-1">
        <div className={cn("w-2 h-2 rounded-full", getScoreColor(relevanceScore))} />
        <span>Relevance: {Math.round(relevanceScore * 100)}%</span>
      </div>
      <div className="flex items-center space-x-1">
        <div className={cn("w-2 h-2 rounded-full", getScoreColor(engagementScore))} />
        <span>Engagement: {Math.round(engagementScore * 100)}%</span>
      </div>
    </div>
  );
}

function LoadingFeedSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex space-x-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyFeedState({ 
  title, 
  description, 
  action,
  className 
}: { 
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("text-center py-12", className)}>
      <CardContent className="space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {description}
          </p>
        </div>
        {action && <div>{action}</div>}
      </CardContent>
    </Card>
  );
}

export default PersonalizedFeed;
```