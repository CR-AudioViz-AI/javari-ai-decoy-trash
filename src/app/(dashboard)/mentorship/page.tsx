'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Users,
  Target,
  Calendar,
  TrendingUp,
  MessageCircle,
  Star,
  Clock,
  Award,
  Brain,
  Heart,
  ChevronRight,
  Plus,
  Filter,
  Search,
  Settings
} from 'lucide-react';

interface MentorshipProfile {
  id: string;
  user_id: string;
  role: 'mentor' | 'mentee' | 'both';
  skills: string[];
  interests: string[];
  goals: string[];
  experience_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  availability: {
    timezone: string;
    days: string[];
    hours: { start: string; end: string };
  };
  personality_traits: {
    communication_style: string;
    learning_preference: string;
    meeting_frequency: string;
  };
  bio: string;
  created_at: string;
  updated_at: string;
  user: {
    full_name: string;
    avatar_url?: string;
    email: string;
  };
}

interface MatchResult {
  profile: MentorshipProfile;
  compatibility_score: number;
  matching_factors: {
    skill_overlap: number;
    goal_alignment: number;
    personality_compatibility: number;
    schedule_compatibility: number;
  };
  reasons: string[];
}

interface MentorshipSession {
  id: string;
  mentor_id: string;
  mentee_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  goals: string[];
  notes?: string;
  feedback_mentor?: number;
  feedback_mentee?: number;
  created_at: string;
}

interface GoalProgress {
  id: string;
  mentorship_connection_id: string;
  goal: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percentage: number;
  milestones: Array<{
    title: string;
    completed: boolean;
    completed_at?: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface MentorshipConnection {
  id: string;
  mentor_id: string;
  mentee_id: string;
  status: 'pending' | 'active' | 'paused' | 'completed';
  started_at: string;
  goals: GoalProgress[];
  sessions: MentorshipSession[];
  mentor_profile: MentorshipProfile;
  mentee_profile: MentorshipProfile;
}

/**
 * AI-Powered Mentorship System Dashboard
 * 
 * Features:
 * - Intelligent mentor/mentee matching using AI
 * - Personality compatibility analysis
 * - Session scheduling and management
 * - Goal tracking and progress monitoring
 * - Real-time matching notifications
 */
export default function MentorshipPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MentorshipProfile | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [connections, setConnections] = useState<MentorshipConnection[]>([]);
  const [sessions, setSessions] = useState<MentorshipSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'matches' | 'connections' | 'sessions' | 'profile'>('dashboard');
  const [showMatchingWizard, setShowMatchingWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize user session and load mentorship data
   */
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth/signin');
          return;
        }
        
        setUser(user);
        await loadMentorshipProfile(user.id);
        await loadConnections(user.id);
        await loadSessions(user.id);
      } catch (err) {
        console.error('Failed to initialize user:', err);
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    initializeUser();
  }, [router, supabase]);

  /**
   * Load user's mentorship profile
   */
  const loadMentorshipProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('mentorship_profiles')
        .select(`
          *,
          user:users(full_name, avatar_url, email)
        `)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfile(data);
        await loadMatches(data);
      }
    } catch (err) {
      console.error('Failed to load mentorship profile:', err);
    }
  };

  /**
   * Load AI-generated matches for the user
   */
  const loadMatches = async (userProfile: MentorshipProfile) => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase.functions.invoke('generate-mentorship-matches', {
        body: {
          profile: userProfile,
          limit: 10
        }
      });

      if (error) throw error;
      setMatches(data.matches || []);
    } catch (err) {
      console.error('Failed to load matches:', err);
    }
  };

  /**
   * Load user's mentorship connections
   */
  const loadConnections = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('mentorship_connections')
        .select(`
          *,
          mentor_profile:mentorship_profiles!mentor_id(*, user:users(full_name, avatar_url, email)),
          mentee_profile:mentorship_profiles!mentee_id(*, user:users(full_name, avatar_url, email)),
          goals:goal_progress(*),
          sessions:mentorship_sessions(*)
        `)
        .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConnections(data || []);
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  /**
   * Load user's mentorship sessions
   */
  const loadSessions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('mentorship_sessions')
        .select('*')
        .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
        .order('scheduled_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  /**
   * Create or update mentorship profile
   */
  const handleProfileUpdate = async (profileData: Partial<MentorshipProfile>) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('mentorship_profiles')
        .upsert({
          user_id: user.id,
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .select(`
          *,
          user:users(full_name, avatar_url, email)
        `)
        .single();

      if (error) throw error;
      
      setProfile(data);
      await loadMatches(data);
      setShowMatchingWizard(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError('Failed to update profile');
    }
  };

  /**
   * Send mentorship connection request
   */
  const handleConnectionRequest = async (targetProfileId: string) => {
    if (!profile || !user) return;

    try {
      const { error } = await supabase
        .from('mentorship_connections')
        .insert({
          mentor_id: profile.role === 'mentor' ? user.id : targetProfileId,
          mentee_id: profile.role === 'mentee' ? user.id : targetProfileId,
          status: 'pending'
        });

      if (error) throw error;
      
      // Send notification
      await supabase.functions.invoke('send-mentorship-notification', {
        body: {
          type: 'connection_request',
          from_user_id: user.id,
          to_user_id: targetProfileId
        }
      });

      await loadConnections(user.id);
    } catch (err) {
      console.error('Failed to send connection request:', err);
      setError('Failed to send connection request');
    }
  };

  /**
   * Schedule a mentorship session
   */
  const handleScheduleSession = async (connectionId: string, sessionData: {
    scheduled_at: string;
    duration_minutes: number;
    goals: string[];
  }) => {
    if (!user) return;

    try {
      const connection = connections.find(c => c.id === connectionId);
      if (!connection) throw new Error('Connection not found');

      const { error } = await supabase
        .from('mentorship_sessions')
        .insert({
          mentor_id: connection.mentor_id,
          mentee_id: connection.mentee_id,
          ...sessionData,
          status: 'scheduled'
        });

      if (error) throw error;

      // Send calendar invites
      await supabase.functions.invoke('send-calendar-invite', {
        body: {
          session: sessionData,
          mentor_email: connection.mentor_profile.user.email,
          mentee_email: connection.mentee_profile.user.email
        }
      });

      await loadSessions(user.id);
    } catch (err) {
      console.error('Failed to schedule session:', err);
      setError('Failed to schedule session');
    }
  };

  /**
   * Update goal progress
   */
  const handleUpdateGoalProgress = async (goalId: string, progress: number, milestoneIndex?: number) => {
    try {
      if (milestoneIndex !== undefined) {
        const { error } = await supabase.rpc('update_goal_milestone', {
          goal_id: goalId,
          milestone_index: milestoneIndex,
          completed: true
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('goal_progress')
          .update({
            progress_percentage: progress,
            status: progress >= 100 ? 'completed' : 'in_progress',
            updated_at: new Date().toISOString()
          })
          .eq('id', goalId);
        if (error) throw error;
      }

      if (user) {
        await loadConnections(user.id);
      }
    } catch (err) {
      console.error('Failed to update goal progress:', err);
      setError('Failed to update progress');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-purple-200">Loading mentorship dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">AI Mentorship Hub</h1>
          <p className="text-purple-200">Connect, learn, and grow with intelligent mentorship matching</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
            {error}
            <button 
              onClick={() => setError(null)}
              className="ml-2 text-red-300 hover:text-red-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-slate-800/50 backdrop-blur-sm rounded-lg p-1 mb-8">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: TrendingUp },
            { key: 'matches', label: 'Matches', icon: Users },
            { key: 'connections', label: 'Connections', icon: Heart },
            { key: 'sessions', label: 'Sessions', icon: Calendar },
            { key: 'profile', label: 'Profile', icon: Settings }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all ${
                activeTab === key
                  ? 'bg-purple-600 text-white'
                  : 'text-purple-200 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Users className="w-8 h-8 text-purple-500" />
                  <span className="text-2xl font-bold text-white">{connections.filter(c => c.status === 'active').length}</span>
                </div>
                <p className="text-purple-200">Active Connections</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Calendar className="w-8 h-8 text-purple-500" />
                  <span className="text-2xl font-bold text-white">{sessions.filter(s => s.status === 'completed').length}</span>
                </div>
                <p className="text-purple-200">Sessions Completed</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Target className="w-8 h-8 text-purple-500" />
                  <span className="text-2xl font-bold text-white">
                    {connections.reduce((acc, c) => acc + c.goals.filter(g => g.status === 'completed').length, 0)}
                  </span>
                </div>
                <p className="text-purple-200">Goals Achieved</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Brain className="w-8 h-8 text-purple-500" />
                  <span className="text-2xl font-bold text-white">{matches.length}</span>
                </div>
                <p className="text-purple-200">AI Matches</p>
              </div>
            </div>

            {/* Quick Actions */}
            {!profile && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-purple-500/20 text-center">
                <Brain className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">Welcome to AI Mentorship</h3>
                <p className="text-purple-200 mb-6">
                  Create your mentorship profile to get started with intelligent matching
                </p>
                <button
                  onClick={() => setShowMatchingWizard(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Create Profile
                </button>
              </div>
            )}

            {/* Recent Activity */}
            {sessions.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                <h3 className="text-xl font-bold text-white mb-4">Recent Sessions</h3>
                <div className="space-y-3">
                  {sessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          session.status === 'completed' ? 'bg-green-500' :
                          session.status === 'scheduled' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}></div>
                        <div>
                          <p className="text-white font-medium">
                            {session.status === 'completed' ? 'Completed Session' : 
                             session.status === 'scheduled' ? 'Upcoming Session' : 
                             'Cancelled Session'}
                          </p>
                          <p className="text-purple-200 text-sm">
                            {new Date(session.scheduled_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-purple-200 text-sm">
                        {session.duration_minutes}min
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matches Tab */}
        {activeTab === 'matches' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">AI-Powered Matches</h2>
              <button
                onClick={() => profile && loadMatches(profile)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Refresh Matches
              </button>
            </div>

            {!profile && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-purple-500/20 text-center">
                <p className="text-purple-200 mb-4">Create your profile to see AI-generated matches</p>
                <button
                  onClick={() => setShowMatchingWizard(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Create Profile
                </button>
              </div>
            )}

            {profile && matches.length === 0 && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-purple-500/20 text-center">
                <Brain className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                <p className="text-purple-200">No matches found. Try updating your profile or expanding your criteria.</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {matches.map((match) => (
                <div key={match.profile.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                  <div className="flex items-start space-x-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                      {match.profile.user.full_name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white">{match.profile.user.full_name}</h3>
                      <p className="text-purple-200 capitalize">{match.profile.role} • {match.profile.experience_level}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-1">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span className="text-white font-bold">{(match.compatibility_score * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-purple-200 text-sm">Compatibility</p>
                    </div>
                  </div>

                  <p className="text-purple-200 text-sm mb-4 line-clamp-2">{match.profile.bio}</p>

                  <div className="space-y-3 mb-4">
                    <div>
                      <p className="text-white font-medium text-sm mb-1">Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {match.profile.skills.slice(0, 3).map((skill) => (