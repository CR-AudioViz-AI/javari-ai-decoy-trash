```tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  TrendingUp, 
  Filter, 
  Settings, 
  Zap,
  Clock,
  Users,
  Eye,
  ChevronDown,
  RefreshCw,
  Bell,
  Sparkles,
  MoreHorizontal,
  Play,
  Pause,
  Volume2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@supabase/supabase-js';

// Types
interface FeedPost {
  id: string;
  user_id: string;
  content: string;
  media_urls: string[];
  audio_url?: string;
  visualization_data?: any;
  topics: string[];
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
    verified: boolean;
  };
  created_at: string;
  is_liked?: boolean;
  is_saved?: boolean;
  relevance_score?: number;
  content_type: 'text' | 'audio' | 'visualization' | 'mixed';
}

interface Topic {
  id: string;
  name: string;
  slug: string;
  color: string;
  post_count: number;
}

interface UserPreferences {
  topics: string[];
  content_types: string[];
  engagement_threshold: number;
  show_recommendations: boolean;
  real_time_updates: boolean;
  algorithmic_sorting: boolean;
}

interface RecommendationCard {
  id: string;
  type: 'user' | 'topic' | 'content';
  title: string;
  description: string;
  action_label: string;
  confidence: number;
  metadata: any;
}

interface AdvancedSocialFeedProps {
  userId?: string;
  initialPosts?: FeedPost[];
  className?: string;
  showPersonalization?: boolean;
  enableRealTime?: boolean;
  maxPosts?: number;
  onPostInteraction?: (postId: string, type: 'like' | 'comment' | 'share' | 'save') => void;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const AdvancedSocialFeed: React.FC<AdvancedSocialFeedProps> = ({
  userId,
  initialPosts = [],
  className,
  showPersonalization = true,
  enableRealTime = true,
  maxPosts = 50,
  onPostInteraction
}) => {
  // State management
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationCard[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    topics: [],
    content_types: ['text', 'audio', 'visualization', 'mixed'],
    engagement_threshold: 50,
    show_recommendations: true,
    real_time_updates: true,
    algorithmic_sorting: true
  });
  
  const [loading, setLoading] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'relevance' | 'recent' | 'trending'>('relevance');
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [isPlaying, setIsPlaying] = useState<{ [key: string]: boolean }>({});

  // Refs
  const feedRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  // URL params
  const searchParams = useSearchParams();
  const router = useRouter();

  // Load initial data
  useEffect(() => {
    loadTopics();
    loadUserPreferences();
    if (posts.length === 0) {
      loadPosts();
    }
    if (preferences.show_recommendations) {
      loadRecommendations();
    }
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    if (!enableRealTime || !preferences.real_time_updates) return;

    const channel = supabase
      .channel('social_feed_updates')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'posts',
          filter: selectedTopics.length > 0 ? `topics.cs.{${selectedTopics.join(',')}}` : undefined
        },
        (payload) => {
          handleRealTimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopics, preferences.real_time_updates]);

  // URL param synchronization
  useEffect(() => {
    const topicsParam = searchParams.get('topics');
    const sortParam = searchParams.get('sort') as typeof sortBy;
    
    if (topicsParam) {
      setSelectedTopics(topicsParam.split(','));
    }
    if (sortParam && ['relevance', 'recent', 'trending'].includes(sortParam)) {
      setSortBy(sortParam);
    }
  }, [searchParams]);

  // Data loading functions
  const loadTopics = async () => {
    try {
      const response = await fetch('/api/topics');
      const data = await response.json();
      setTopics(data);
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const loadUserPreferences = async () => {
    if (!userId) {
      const stored = localStorage.getItem('feed_preferences');
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
      return;
    }

    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .single();
      
      if (data?.preferences) {
        setPreferences({ ...preferences, ...data.preferences });
      }
    } catch (error) {
      console.error('Failed to load user preferences:', error);
    }
  };

  const loadPosts = async (offset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: offset.toString(),
        topics: selectedTopics.join(','),
        sort: sortBy,
        user_id: userId || '',
        content_types: preferences.content_types.join(','),
        engagement_threshold: preferences.engagement_threshold.toString()
      });

      const response = await fetch(`/api/posts?${params}`);
      const data = await response.json();
      
      if (offset === 0) {
        setPosts(data);
      } else {
        setPosts(prev => [...prev, ...data]);
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    if (!userId) return;
    
    try {
      const response = await fetch(`/api/recommendations?user_id=${userId}`);
      const data = await response.json();
      setRecommendations(data);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  };

  // Event handlers
  const handleRealTimeUpdate = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      setHasNewPosts(true);
      setRealTimeUpdates(prev => prev + 1);
    } else if (payload.eventType === 'UPDATE') {
      setPosts(prev => prev.map(post => 
        post.id === payload.new.id ? { ...post, ...payload.new } : post
      ));
    }
  };

  const handlePostInteraction = async (postId: string, type: 'like' | 'comment' | 'share' | 'save') => {
    if (!userId) return;

    try {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, type, user_id: userId })
      });

      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          const updatedPost = { ...post };
          if (type === 'like') {
            updatedPost.engagement.likes += post.is_liked ? -1 : 1;
            updatedPost.is_liked = !post.is_liked;
          } else if (type === 'save') {
            updatedPost.is_saved = !post.is_saved;
          } else if (type === 'share') {
            updatedPost.engagement.shares += 1;
          }
          return updatedPost;
        }
        return post;
      }));

      onPostInteraction?.(postId, type);
    } catch (error) {
      console.error('Failed to handle interaction:', error);
    }
  };

  const handleTopicFilter = (topicId: string) => {
    const newTopics = selectedTopics.includes(topicId)
      ? selectedTopics.filter(id => id !== topicId)
      : [...selectedTopics, topicId];
    
    setSelectedTopics(newTopics);
    
    const params = new URLSearchParams(searchParams.toString());
    if (newTopics.length > 0) {
      params.set('topics', newTopics.join(','));
    } else {
      params.delete('topics');
    }
    router.replace(`?${params.toString()}`);
  };

  const handleSortChange = (newSort: typeof sortBy) => {
    setSortBy(newSort);
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', newSort);
    router.replace(`?${params.toString()}`);
    loadPosts(0);
  };

  const handlePreferenceChange = async (key: keyof UserPreferences, value: any) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    
    localStorage.setItem('feed_preferences', JSON.stringify(newPreferences));
    
    if (userId) {
      try {
        await supabase
          .from('user_preferences')
          .upsert({ user_id: userId, preferences: newPreferences });
      } catch (error) {
        console.error('Failed to save preferences:', error);
      }
    }
  };

  const handleRefreshFeed = () => {
    setHasNewPosts(false);
    loadPosts(0);
  };

  const handleAudioPlay = (postId: string) => {
    const audio = audioRefs.current[postId];
    if (!audio) return;

    if (isPlaying[postId]) {
      audio.pause();
    } else {
      // Pause all other audio
      Object.entries(audioRefs.current).forEach(([id, audioElement]) => {
        if (id !== postId) {
          audioElement.pause();
        }
      });
      audio.play();
    }
    
    setIsPlaying(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  // Filtered and sorted posts
  const filteredPosts = useMemo(() => {
    let filtered = posts;

    if (selectedTopics.length > 0) {
      filtered = filtered.filter(post => 
        post.topics.some(topic => selectedTopics.includes(topic))
      );
    }

    if (preferences.algorithmic_sorting && sortBy === 'relevance') {
      filtered.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'trending') {
      filtered.sort((a, b) => {
        const scoreA = a.engagement.likes + a.engagement.comments + a.engagement.shares;
        const scoreB = b.engagement.likes + b.engagement.comments + b.engagement.shares;
        return scoreB - scoreA;
      });
    }

    return filtered.slice(0, maxPosts);
  }, [posts, selectedTopics, sortBy, preferences.algorithmic_sorting, maxPosts]);

  // Components
  const TopicFilter: React.FC = () => (
    <div className="flex flex-wrap gap-2 p-4 border-b">
      <div className="flex items-center gap-2 mr-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Topics:</span>
      </div>
      {topics.map((topic) => (
        <Badge
          key={topic.id}
          variant={selectedTopics.includes(topic.id) ? "default" : "outline"}
          className={cn(
            "cursor-pointer transition-colors",
            selectedTopics.includes(topic.id) && "bg-primary text-primary-foreground"
          )}
          onClick={() => handleTopicFilter(topic.id)}
          style={{
            backgroundColor: selectedTopics.includes(topic.id) ? topic.color : undefined,
            borderColor: topic.color
          }}
        >
          {topic.name}
          <span className="ml-1 text-xs opacity-70">{topic.post_count}</span>
        </Badge>
      ))}
    </div>
  );

  const FeedPost: React.FC<{ post: FeedPost }> = ({ post }) => (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.user.avatar_url} alt={post.user.display_name} />
              <AvatarFallback>
                {post.user.display_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{post.user.display_name}</h4>
                {post.user.verified && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    <Sparkles className="h-3 w-3" />
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{post.user.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(post.created_at).toLocaleDateString()}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{post.content}</p>

          {post.audio_url && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAudioPlay(post.id)}
                className="h-8 w-8 p-0"
              >
                {isPlaying[post.id] ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full w-1/3" />
                </div>
              </div>
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <audio
                ref={el => {
                  if (el) audioRefs.current[post.id] = el;
                }}
                src={post.audio_url}
                onPlay={() => setIsPlaying(prev => ({ ...prev, [post.id]: true }))}
                onPause={() => setIsPlaying(prev => ({ ...prev, [post.id]: false }))}
                onEnded={() => setIsPlaying(prev => ({ ...prev, [post.id]: false }))}
              />
            </div>
          )}

          {post.topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.topics.map((topicId) => {
                const topic = topics.find(t => t.id === topicId);
                return topic ? (
                  <Badge key={topicId} variant="outline" className="text-xs">
                    {topic.name}
                  </Badge>
                ) : null;
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePostInteraction(post.id, 'like')}
                className={cn(
                  "gap-1",
                  post.is_liked && "text-red-500"
                )}
              >
                <Heart className={cn("h-4 w-4", post.is_liked && "fill-current")} />
                {post.engagement.likes}
              </Button>
              
              <Button variant="ghost" size="sm" className="gap-1">
                <MessageCircle className="h-4 w-4" />
                {post.engagement.comments}
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handlePostInteraction(post.id, 'share')}
                className="gap-1"
              >
                <Share2 className="h-4 w-4" />
                {post.engagement.shares}
              </Button>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePostInteraction(post.id, 'save')}
              className={cn(post.is_saved && "text-blue-500")}
            >
              <Bookmark className={cn("h-4 w-4", post.is_saved && "fill-current")} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const RecommendationCard: React.FC<{ recommendation: RecommendationCard }> = ({ recommendation }) => (
    <Card className="p-4 border-dashed">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Recommended for you</span>
            <Badge variant="outline" className="text-xs">
              {Math.round(recommendation.confidence * 100)}% match
            </Badge>
          </div>
          <h4 className="font-semibold mb-1">{recommendation.title}</h4>
          <p className="text-sm text-muted-foreground mb-3">{recommendation.description}</p>
          <Button size="sm" variant="outline">
            {recommendation.action_label}
          </Button>
        </div>
      </div>
    </Card>
  );

  const PersonalizationSettings: React.FC = () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Personalize
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Feed Personalization</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="real-time">Real-time updates</Label>
              <Switch
                id="real-time"
                checked={preferences.real_time_updates}
                onCheckedChange={(checked) => handlePreferenceChange('real_time_updates', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="algorithmic">Smart sorting</Label>
              <Switch
                id="algorithmic"
                checked={preferences.algorithmic_sorting}
                onCheckedChange={(checked) => handlePreferenceChange('algorithmic_sorting', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="recommendations">Show recommendations</Label>
              <Switch
                id="recommendations"
                checked={preferences.show_recommendations}
                onCheckedChange={(checked) => handlePreferenceChange('show_recommendations', checked)}
              />
            </div>
          </div>
          
          <div className="space-y-3">
            <Label>Engagement threshold</Label>
            <Slider
              value={[preferences.engagement_threshold]}
              onValueChange={([value]) => handlePreferenceChange('engagement_threshold', value)}