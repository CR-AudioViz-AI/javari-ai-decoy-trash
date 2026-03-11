```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';

/**
 * Mentorship profile interface
 */
export interface MentorProfile {
  userId: string;
  name: string;
  email: string;
  skills: string[];
  expertise: string[];
  experience_years: number;
  mentoring_capacity: number;
  current_mentees: number;
  availability: {
    days: string[];
    hours: string[];
    timezone: string;
  };
  preferences: {
    communication_style: 'formal' | 'casual' | 'structured' | 'flexible';
    meeting_frequency: 'weekly' | 'biweekly' | 'monthly';
    session_duration: number;
    industry_focus?: string[];
  };
  personality_traits: {
    empathy: number;
    patience: number;
    directness: number;
    adaptability: number;
  };
  created_at: Date;
  updated_at: Date;
}

/**
 * Mentee profile interface
 */
export interface MenteeProfile {
  userId: string;
  name: string;
  email: string;
  goals: string[];
  skills_to_learn: string[];
  current_skills: string[];
  experience_level: 'beginner' | 'intermediate' | 'advanced';
  learning_style: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  availability: {
    days: string[];
    hours: string[];
    timezone: string;
  };
  preferences: {
    mentor_experience_min: number;
    communication_style: 'formal' | 'casual' | 'structured' | 'flexible';
    meeting_frequency: 'weekly' | 'biweekly' | 'monthly';
    session_duration: number;
    industry_focus?: string[];
  };
  personality_traits: {
    proactivity: number;
    openness: number;
    goal_orientation: number;
    receptiveness: number;
  };
  created_at: Date;
  updated_at: Date;
}

/**
 * Mentorship relationship interface
 */
export interface MentorshipRelationship {
  id: string;
  mentor_id: string;
  mentee_id: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'terminated';
  compatibility_score: number;
  match_criteria: {
    skill_alignment: number;
    goal_compatibility: number;
    personality_match: number;
    availability_overlap: number;
    preference_alignment: number;
  };
  goals: string[];
  milestones: Milestone[];
  sessions_completed: number;
  relationship_health: number;
  feedback_scores: {
    mentor_satisfaction: number;
    mentee_satisfaction: number;
    progress_rating: number;
  };
  created_at: Date;
  updated_at: Date;
  next_review_date?: Date;
}

/**
 * Milestone interface
 */
export interface Milestone {
  id: string;
  title: string;
  description: string;
  target_date: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  progress_percentage: number;
  created_at: Date;
  completed_at?: Date;
}

/**
 * Session interface
 */
export interface MentorshipSession {
  id: string;
  relationship_id: string;
  scheduled_date: Date;
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  topics_discussed: string[];
  feedback: {
    mentor_notes?: string;
    mentee_notes?: string;
    effectiveness_rating: number;
    next_steps: string[];
  };
  created_at: Date;
  updated_at: Date;
}

/**
 * Match suggestion interface
 */
export interface MatchSuggestion {
  mentor: MentorProfile;
  mentee: MenteeProfile;
  compatibility_score: number;
  match_reasons: string[];
  potential_challenges: string[];
  confidence_level: number;
  recommended_goals: string[];
}

/**
 * Service configuration interface
 */
export interface MentorshipServiceConfig {
  supabaseUrl: string;
  supabaseKey: string;
  aiServiceUrl?: string;
  matchingThreshold?: number;
  maxSuggestionsPerRequest?: number;
  autoMatchEnabled?: boolean;
}

/**
 * Service error class
 */
export class MentorshipMatchingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'MentorshipMatchingError';
  }
}

/**
 * Core mentorship matching service that intelligently pairs mentors and mentees
 * based on skills, goals, experience levels, and personality compatibility
 */
export class MentorshipMatchingService extends EventEmitter {
  private supabase: SupabaseClient;
  private config: Required<MentorshipServiceConfig>;

  constructor(config: MentorshipServiceConfig) {
    super();
    
    this.config = {
      matchingThreshold: 0.7,
      maxSuggestionsPerRequest: 10,
      autoMatchEnabled: false,
      aiServiceUrl: '',
      ...config
    };

    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Find potential matches for a mentee
   */
  async findMentorMatches(menteeId: string): Promise<MatchSuggestion[]> {
    try {
      const mentee = await this.getMenteeProfile(menteeId);
      if (!mentee) {
        throw new MentorshipMatchingError(
          'Mentee profile not found',
          'MENTEE_NOT_FOUND',
          404
        );
      }

      const availableMentors = await this.getAvailableMentors(mentee);
      const suggestions: MatchSuggestion[] = [];

      for (const mentor of availableMentors) {
        const compatibility = await this.calculateCompatibility(mentor, mentee);
        
        if (compatibility.score >= this.config.matchingThreshold) {
          const suggestion: MatchSuggestion = {
            mentor,
            mentee,
            compatibility_score: compatibility.score,
            match_reasons: compatibility.reasons,
            potential_challenges: compatibility.challenges,
            confidence_level: compatibility.confidence,
            recommended_goals: await this.generateRecommendedGoals(mentor, mentee)
          };

          suggestions.push(suggestion);
        }
      }

      // Sort by compatibility score
      suggestions.sort((a, b) => b.compatibility_score - a.compatibility_score);

      this.emit('matches_found', {
        menteeId,
        matchCount: suggestions.length,
        topScore: suggestions[0]?.compatibility_score || 0
      });

      return suggestions.slice(0, this.config.maxSuggestionsPerRequest);
    } catch (error) {
      this.emit('matching_error', { menteeId, error: error.message });
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to find matches: ${error.message}`,
            'MATCHING_FAILED'
          );
    }
  }

  /**
   * Find potential matches for a mentor
   */
  async findMenteeMatches(mentorId: string): Promise<MatchSuggestion[]> {
    try {
      const mentor = await this.getMentorProfile(mentorId);
      if (!mentor) {
        throw new MentorshipMatchingError(
          'Mentor profile not found',
          'MENTOR_NOT_FOUND',
          404
        );
      }

      if (mentor.current_mentees >= mentor.mentoring_capacity) {
        return [];
      }

      const availableMentees = await this.getAvailableMentees(mentor);
      const suggestions: MatchSuggestion[] = [];

      for (const mentee of availableMentees) {
        const compatibility = await this.calculateCompatibility(mentor, mentee);
        
        if (compatibility.score >= this.config.matchingThreshold) {
          const suggestion: MatchSuggestion = {
            mentor,
            mentee,
            compatibility_score: compatibility.score,
            match_reasons: compatibility.reasons,
            potential_challenges: compatibility.challenges,
            confidence_level: compatibility.confidence,
            recommended_goals: await this.generateRecommendedGoals(mentor, mentee)
          };

          suggestions.push(suggestion);
        }
      }

      suggestions.sort((a, b) => b.compatibility_score - a.compatibility_score);

      this.emit('matches_found', {
        mentorId,
        matchCount: suggestions.length,
        topScore: suggestions[0]?.compatibility_score || 0
      });

      return suggestions.slice(0, this.config.maxSuggestionsPerRequest);
    } catch (error) {
      this.emit('matching_error', { mentorId, error: error.message });
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to find matches: ${error.message}`,
            'MATCHING_FAILED'
          );
    }
  }

  /**
   * Create a mentorship relationship
   */
  async createMentorshipRelationship(
    mentorId: string,
    menteeId: string,
    goals: string[]
  ): Promise<MentorshipRelationship> {
    try {
      const mentor = await this.getMentorProfile(mentorId);
      const mentee = await this.getMenteeProfile(menteeId);

      if (!mentor || !mentee) {
        throw new MentorshipMatchingError(
          'Mentor or mentee profile not found',
          'PROFILE_NOT_FOUND',
          404
        );
      }

      if (mentor.current_mentees >= mentor.mentoring_capacity) {
        throw new MentorshipMatchingError(
          'Mentor has reached capacity',
          'MENTOR_CAPACITY_FULL',
          400
        );
      }

      // Check if relationship already exists
      const existingRelationship = await this.getExistingRelationship(mentorId, menteeId);
      if (existingRelationship) {
        throw new MentorshipMatchingError(
          'Mentorship relationship already exists',
          'RELATIONSHIP_EXISTS',
          400
        );
      }

      const compatibility = await this.calculateCompatibility(mentor, mentee);

      const relationship: Omit<MentorshipRelationship, 'id' | 'created_at' | 'updated_at'> = {
        mentor_id: mentorId,
        mentee_id: menteeId,
        status: 'pending',
        compatibility_score: compatibility.score,
        match_criteria: compatibility.criteria,
        goals,
        milestones: await this.generateInitialMilestones(goals),
        sessions_completed: 0,
        relationship_health: 1.0,
        feedback_scores: {
          mentor_satisfaction: 0,
          mentee_satisfaction: 0,
          progress_rating: 0
        },
        next_review_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      const { data, error } = await this.supabase
        .from('mentorship_relationships')
        .insert(relationship)
        .select()
        .single();

      if (error) {
        throw new MentorshipMatchingError(
          `Failed to create relationship: ${error.message}`,
          'DATABASE_ERROR'
        );
      }

      // Update mentor's current mentee count
      await this.supabase
        .from('mentorship_profiles')
        .update({ current_mentees: mentor.current_mentees + 1 })
        .eq('user_id', mentorId);

      this.emit('relationship_created', {
        relationshipId: data.id,
        mentorId,
        menteeId,
        compatibilityScore: compatibility.score
      });

      return data;
    } catch (error) {
      this.emit('relationship_creation_error', { mentorId, menteeId, error: error.message });
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to create relationship: ${error.message}`,
            'CREATION_FAILED'
          );
    }
  }

  /**
   * Update relationship status
   */
  async updateRelationshipStatus(
    relationshipId: string,
    status: MentorshipRelationship['status']
  ): Promise<MentorshipRelationship> {
    try {
      const { data, error } = await this.supabase
        .from('mentorship_relationships')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', relationshipId)
        .select()
        .single();

      if (error) {
        throw new MentorshipMatchingError(
          `Failed to update relationship status: ${error.message}`,
          'DATABASE_ERROR'
        );
      }

      // Update mentor capacity if relationship is terminated or completed
      if (status === 'terminated' || status === 'completed') {
        const mentor = await this.getMentorProfile(data.mentor_id);
        if (mentor) {
          await this.supabase
            .from('mentorship_profiles')
            .update({ current_mentees: Math.max(0, mentor.current_mentees - 1) })
            .eq('user_id', data.mentor_id);
        }
      }

      this.emit('relationship_status_updated', {
        relationshipId,
        newStatus: status,
        mentorId: data.mentor_id,
        menteeId: data.mentee_id
      });

      return data;
    } catch (error) {
      this.emit('status_update_error', { relationshipId, status, error: error.message });
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to update relationship status: ${error.message}`,
            'STATUS_UPDATE_FAILED'
          );
    }
  }

  /**
   * Track session completion
   */
  async recordSession(sessionData: Omit<MentorshipSession, 'id' | 'created_at' | 'updated_at'>): Promise<MentorshipSession> {
    try {
      const { data, error } = await this.supabase
        .from('mentorship_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (error) {
        throw new MentorshipMatchingError(
          `Failed to record session: ${error.message}`,
          'DATABASE_ERROR'
        );
      }

      // Update relationship sessions completed count
      if (sessionData.status === 'completed') {
        await this.supabase
          .from('mentorship_relationships')
          .update({
            sessions_completed: this.supabase.sql`sessions_completed + 1`,
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionData.relationship_id);

        // Update relationship health based on session feedback
        await this.updateRelationshipHealth(sessionData.relationship_id);
      }

      this.emit('session_recorded', {
        sessionId: data.id,
        relationshipId: sessionData.relationship_id,
        status: sessionData.status
      });

      return data;
    } catch (error) {
      this.emit('session_recording_error', { sessionData, error: error.message });
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to record session: ${error.message}`,
            'SESSION_RECORDING_FAILED'
          );
    }
  }

  /**
   * Get relationship progress and analytics
   */
  async getRelationshipProgress(relationshipId: string): Promise<{
    relationship: MentorshipRelationship;
    sessions: MentorshipSession[];
    progressMetrics: {
      goalsCompleted: number;
      totalGoals: number;
      milestonesAchieved: number;
      totalMilestones: number;
      avgSessionRating: number;
      relationshipDuration: number;
    };
  }> {
    try {
      // Get relationship data
      const { data: relationship, error: relationshipError } = await this.supabase
        .from('mentorship_relationships')
        .select('*')
        .eq('id', relationshipId)
        .single();

      if (relationshipError) {
        throw new MentorshipMatchingError(
          `Failed to fetch relationship: ${relationshipError.message}`,
          'DATABASE_ERROR'
        );
      }

      // Get sessions data
      const { data: sessions, error: sessionsError } = await this.supabase
        .from('mentorship_sessions')
        .select('*')
        .eq('relationship_id', relationshipId)
        .order('scheduled_date', { ascending: false });

      if (sessionsError) {
        throw new MentorshipMatchingError(
          `Failed to fetch sessions: ${sessionsError.message}`,
          'DATABASE_ERROR'
        );
      }

      // Calculate progress metrics
      const completedMilestones = relationship.milestones.filter(m => m.status === 'completed');
      const completedSessions = sessions.filter(s => s.status === 'completed');
      const avgRating = completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.feedback.effectiveness_rating, 0) / completedSessions.length
        : 0;
      
      const relationshipStart = new Date(relationship.created_at);
      const relationshipDuration = Math.floor((Date.now() - relationshipStart.getTime()) / (1000 * 60 * 60 * 24));

      const progressMetrics = {
        goalsCompleted: 0, // This would need additional logic to track goal completion
        totalGoals: relationship.goals.length,
        milestonesAchieved: completedMilestones.length,
        totalMilestones: relationship.milestones.length,
        avgSessionRating: avgRating,
        relationshipDuration
      };

      return {
        relationship,
        sessions,
        progressMetrics
      };
    } catch (error) {
      throw error instanceof MentorshipMatchingError 
        ? error 
        : new MentorshipMatchingError(
            `Failed to get relationship progress: ${error.message}`,
            'PROGRESS_FETCH_FAILED'
          );
    }
  }

  /**
   * Get mentor profile
   */
  private async getMentorProfile(userId: string): Promise<MentorProfile | null> {
    const { data, error } = await this.supabase
      .from('mentorship_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('profile_type', 'mentor')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new MentorshipMatchingError(
        `Failed to fetch mentor profile: ${error.message}`,
        'DATABASE_ERROR'
      );
    }

    return data;
  }

  /**
   * Get mentee profile
   */
  private async getMenteeProfile(userId: string): Promise<MenteeProfile | null> {
    const { data, error } = await this.supabase
      .from('mentorship_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('profile_type', 'mentee')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new MentorshipMatchingError(
        `Failed to fetch mentee profile: ${error.message}`,
        'DATABASE_ERROR'
      );
    }

    return data;
  }

  /**
   * Get available mentors for a mentee
   */
  private async getAvailableMentors(mentee: MenteeProfile): Promise<MentorProfile[]> {
    const { data, error } = await this.supabase
      .from('mentorship_profiles')
      .select('*')
      .eq('profile_type', 'mentor')
      .lt('current_mentees', this.supabase.sql`mentoring_capacity`)
      .gte('experience_years', mentee.preferences.mentor_experience_min);

    if (error) {
      throw new MentorshipMatchingError(
        `Failed to fetch available mentors: ${error.message}`,
        'DATABASE_ERROR'
      );
    }

    return data || [];
  }

  /**
   * Get available mentees for a mentor
   */
  private async getAvailableMentees(mentor: MentorProfile): Promise<MenteeProfile[]> {
    // Get mentees who don't have active relationships
    const { data, error } = await this.supabase
      .from('mentorship_profiles')
      .select(`
        *,
        mentorship_relationships!mentee_id(status)
      `)
      .eq('profile_type', 'mentee')
      .is('mentorship_relationships.status', null);

    if (error) {
      throw new MentorshipMatchingError(
        `Failed to fetch available mentees: ${error.message}`,
        'DATABASE_ERROR'
      );
    }

    return data || [];
  }

  /**
   * Calculate compatibility between mentor and mentee
   */
  private async calculateCompatibility(mentor: MentorProfile, mentee: MenteeProfile): Promise<{
    score: number;
    criteria: MentorshipRelationship['match_criteria'];
    reasons: string[];
    challenges: string[];
    confidence: number;
  }> {
    // Skill alignment calculation
    const mentorSkills = new Set(mentor.skills.concat(mentor.expertise));
    const menteeNeeds = new Set(mentee.skills_to_learn);
    const skillOverlap = Array.from(mentorSkills).filter(skill => menteeNeeds.has(skill));
    const skillAlignment = skillOverlap.length / Math.max(menteeNeeds.size, 1);

    // Goal compatibility
    const goalCompatibility = await this.calculateGoalCompatibility(mentor, mentee);

    // Personality match
    const personalityMatch = this.calculatePersonalityCompatibility(
      mentor.personality_traits,
      mentee.personality_traits
    );

    // Availability overlap
    const availabilityOverlap = this.calculateAvailabilityOverlap(
      mentor.availability,
      mentee.availability
    );

    // Preference alignment
    const preferenceAlignment = this.calculatePreferenceAlignment(mentor, mentee);

    const criteria = {
      skill_alignment: skillAlignment,
      goal_compatibility: goalCompatibility,
      personality_match: personalityMatch,
      availability_overlap: availabilityOverlap,
      preference_alignment: preferenceAlignment
    };

    // Weighted score calculation
    const weights = {
      skill_alignment: 0.3,
      goal_compatibility: 0.