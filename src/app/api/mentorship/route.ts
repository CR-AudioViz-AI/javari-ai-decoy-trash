```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schemas
const CreateMentorshipProfileSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['mentor', 'mentee']),
  skills: z.array(z.string()).min(1),
  interests: z.array(z.string()).min(1),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  availability: z.object({
    timezone: z.string(),
    weekly_hours: z.number().min(1).max(40),
    preferred_times: z.array(z.object({
      day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
      start_time: z.string(),
      end_time: z.string()
    }))
  }),
  goals: z.string().optional(),
  bio: z.string().max(500).optional(),
  max_mentees: z.number().min(1).max(10).optional(),
  preferred_communication: z.array(z.enum(['video', 'audio', 'chat', 'email'])).optional()
});

const FindMatchesSchema = z.object({
  user_id: z.string().uuid(),
  filters: z.object({
    skills: z.array(z.string()).optional(),
    experience_level: z.array(z.string()).optional(),
    availability_overlap: z.number().min(0).max(1).optional(),
    max_distance: z.number().optional(),
    language: z.string().optional()
  }).optional()
});

const CreateMatchSchema = z.object({
  mentor_id: z.string().uuid(),
  mentee_id: z.string().uuid(),
  program_id: z.string().uuid().optional(),
  goals: z.string().optional(),
  duration_weeks: z.number().min(1).max(52).default(12)
});

const ScheduleSessionSchema = z.object({
  match_id: z.string().uuid(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().min(15).max(180).default(60),
  session_type: z.enum(['introduction', 'regular', 'milestone', 'final']),
  agenda: z.string().optional()
});

const UpdateProgressSchema = z.object({
  match_id: z.string().uuid(),
  milestone_id: z.string().uuid().optional(),
  progress_notes: z.string(),
  completion_percentage: z.number().min(0).max(100),
  skills_developed: z.array(z.string()).optional(),
  challenges: z.array(z.string()).optional(),
  next_steps: z.array(z.string()).optional()
});

// Utility functions
class MentorshipMatchingEngine {
  static calculateCompatibilityScore(mentor: any, mentee: any): number {
    let score = 0;
    const weights = {
      skills: 0.3,
      interests: 0.2,
      availability: 0.25,
      experience_gap: 0.15,
      communication_style: 0.1
    };

    // Skills compatibility
    const skillOverlap = mentor.skills.filter((skill: string) => 
      mentee.skills.includes(skill) || mentee.interests.includes(skill)
    );
    score += (skillOverlap.length / Math.max(mentor.skills.length, 1)) * weights.skills;

    // Interest alignment
    const interestOverlap = mentor.interests.filter((interest: string) => 
      mentee.interests.includes(interest)
    );
    score += (interestOverlap.length / Math.max(mentor.interests.length, 1)) * weights.interests;

    // Availability overlap
    const availabilityScore = this.calculateAvailabilityOverlap(mentor.availability, mentee.availability);
    score += availabilityScore * weights.availability;

    // Experience gap appropriateness
    const experienceGap = this.calculateExperienceGap(mentor.experience_level, mentee.experience_level);
    score += experienceGap * weights.experience_gap;

    // Communication style compatibility
    const communicationScore = this.calculateCommunicationCompatibility(
      mentor.preferred_communication || [],
      mentee.preferred_communication || []
    );
    score += communicationScore * weights.communication_style;

    return Math.round(score * 100);
  }

  static calculateAvailabilityOverlap(mentorAvailability: any, menteeAvailability: any): number {
    if (!mentorAvailability || !menteeAvailability) return 0;

    const mentorTimes = mentorAvailability.preferred_times || [];
    const menteeTimes = menteeAvailability.preferred_times || [];

    let overlapHours = 0;
    let totalMenteeHours = 0;

    for (const menteeSlot of menteeTimes) {
      const menteeStart = this.timeToMinutes(menteeSlot.start_time);
      const menteeEnd = this.timeToMinutes(menteeSlot.end_time);
      totalMenteeHours += (menteeEnd - menteeStart) / 60;

      for (const mentorSlot of mentorTimes) {
        if (mentorSlot.day === menteeSlot.day) {
          const mentorStart = this.timeToMinutes(mentorSlot.start_time);
          const mentorEnd = this.timeToMinutes(mentorSlot.end_time);

          const overlapStart = Math.max(menteeStart, mentorStart);
          const overlapEnd = Math.min(menteeEnd, mentorEnd);

          if (overlapStart < overlapEnd) {
            overlapHours += (overlapEnd - overlapStart) / 60;
          }
        }
      }
    }

    return totalMenteeHours > 0 ? overlapHours / totalMenteeHours : 0;
  }

  static timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  static calculateExperienceGap(mentorLevel: string, menteeLevel: string): number {
    const levels = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
    const gap = levels[mentorLevel as keyof typeof levels] - levels[menteeLevel as keyof typeof levels];
    
    // Optimal gap is 1-2 levels
    if (gap >= 1 && gap <= 2) return 1;
    if (gap === 3) return 0.7;
    if (gap === 0) return 0.3;
    return 0.1;
  }

  static calculateCommunicationCompatibility(mentorPrefs: string[], menteePrefs: string[]): number {
    if (mentorPrefs.length === 0 || menteePrefs.length === 0) return 0.5;
    
    const overlap = mentorPrefs.filter(pref => menteePrefs.includes(pref));
    return overlap.length / Math.max(mentorPrefs.length, menteePrefs.length);
  }
}

class NotificationService {
  static async sendMatchNotification(mentorId: string, menteeId: string, matchId: string): Promise<void> {
    try {
      // In a real implementation, integrate with email/SMS service
      const { data: mentor } = await supabase
        .from('mentorship_profiles')
        .select('user_id, bio')
        .eq('user_id', mentorId)
        .single();

      const { data: mentee } = await supabase
        .from('mentorship_profiles')
        .select('user_id, bio')
        .eq('user_id', menteeId)
        .single();

      // Store notification in database
      await supabase.from('notifications').insert([
        {
          user_id: mentorId,
          type: 'mentorship_match',
          title: 'New Mentee Match Found',
          message: `You've been matched with a new mentee. Review the match and schedule your first session.`,
          metadata: { match_id: matchId, other_user_id: menteeId }
        },
        {
          user_id: menteeId,
          type: 'mentorship_match',
          title: 'Mentor Match Found',
          message: `You've been matched with an experienced mentor. Start your mentorship journey today!`,
          metadata: { match_id: matchId, other_user_id: mentorId }
        }
      ]);
    } catch (error) {
      console.error('Failed to send match notifications:', error);
    }
  }
}

// GET handler - Retrieve mentorship data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'profile':
        const { data: profile, error: profileError } = await supabase
          .from('mentorship_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        return NextResponse.json({ profile });

      case 'matches':
        const { data: matches, error: matchesError } = await supabase
          .from('mentorship_matches')
          .select(`
            *,
            mentor_profile:mentorship_profiles!mentor_id(*),
            mentee_profile:mentorship_profiles!mentee_id(*),
            program:mentorship_programs(*)
          `)
          .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`)
          .order('created_at', { ascending: false });

        if (matchesError) throw matchesError;

        return NextResponse.json({ matches });

      case 'sessions':
        const matchId = searchParams.get('match_id');
        if (!matchId) {
          return NextResponse.json(
            { error: 'Match ID is required for sessions' },
            { status: 400 }
          );
        }

        const { data: sessions, error: sessionsError } = await supabase
          .from('mentorship_sessions')
          .select('*')
          .eq('match_id', matchId)
          .order('scheduled_at', { ascending: false });

        if (sessionsError) throw sessionsError;

        return NextResponse.json({ sessions });

      case 'programs':
        const { data: programs, error: programsError } = await supabase
          .from('mentorship_programs')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (programsError) throw programsError;

        return NextResponse.json({ programs });

      case 'analytics':
        // Fetch user's mentorship analytics
        const { data: analyticsData, error: analyticsError } = await supabase
          .rpc('get_mentorship_analytics', { user_id: userId });

        if (analyticsError) throw analyticsError;

        return NextResponse.json({ analytics: analyticsData });

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GET /api/mentorship error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST handler - Create mentorship resources
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create_profile':
        const profileData = CreateMentorshipProfileSchema.parse(body);
        
        const { data: existingProfile } = await supabase
          .from('mentorship_profiles')
          .select('id')
          .eq('user_id', profileData.user_id)
          .single();

        if (existingProfile) {
          return NextResponse.json(
            { error: 'Mentorship profile already exists' },
            { status: 409 }
          );
        }

        const { data: profile, error: profileError } = await supabase
          .from('mentorship_profiles')
          .insert([{
            ...profileData,
            compatibility_preferences: {},
            last_active: new Date().toISOString()
          }])
          .select()
          .single();

        if (profileError) throw profileError;

        return NextResponse.json({ profile }, { status: 201 });

      case 'find_matches':
        const matchData = FindMatchesSchema.parse(body);
        
        const { data: userProfile, error: userError } = await supabase
          .from('mentorship_profiles')
          .select('*')
          .eq('user_id', matchData.user_id)
          .single();

        if (userError) throw userError;

        const oppositeRole = userProfile.role === 'mentor' ? 'mentee' : 'mentor';
        
        let query = supabase
          .from('mentorship_profiles')
          .select('*')
          .eq('role', oppositeRole)
          .neq('user_id', matchData.user_id);

        // Apply filters
        if (matchData.filters?.skills) {
          query = query.overlaps('skills', matchData.filters.skills);
        }

        if (matchData.filters?.experience_level) {
          query = query.in('experience_level', matchData.filters.experience_level);
        }

        const { data: potentialMatches, error: matchesError } = await query;
        if (matchesError) throw matchesError;

        // Calculate compatibility scores and rank matches
        const scoredMatches = potentialMatches
          .map(match => ({
            ...match,
            compatibility_score: userProfile.role === 'mentor' 
              ? MentorshipMatchingEngine.calculateCompatibilityScore(userProfile, match)
              : MentorshipMatchingEngine.calculateCompatibilityScore(match, userProfile)
          }))
          .filter(match => match.compatibility_score >= 30)
          .sort((a, b) => b.compatibility_score - a.compatibility_score)
          .slice(0, 10);

        return NextResponse.json({ matches: scoredMatches });

      case 'create_match':
        const createMatchData = CreateMatchSchema.parse(body);
        
        // Verify both users exist and have appropriate roles
        const { data: mentorProfile } = await supabase
          .from('mentorship_profiles')
          .select('role, max_mentees')
          .eq('user_id', createMatchData.mentor_id)
          .eq('role', 'mentor')
          .single();

        const { data: menteeProfile } = await supabase
          .from('mentorship_profiles')
          .select('role')
          .eq('user_id', createMatchData.mentee_id)
          .eq('role', 'mentee')
          .single();

        if (!mentorProfile || !menteeProfile) {
          return NextResponse.json(
            { error: 'Invalid mentor or mentee profile' },
            { status: 400 }
          );
        }

        // Check mentor capacity
        if (mentorProfile.max_mentees) {
          const { count } = await supabase
            .from('mentorship_matches')
            .select('*', { count: 'exact' })
            .eq('mentor_id', createMatchData.mentor_id)
            .eq('status', 'active');

          if (count && count >= mentorProfile.max_mentees) {
            return NextResponse.json(
              { error: 'Mentor has reached maximum capacity' },
              { status: 400 }
            );
          }
        }

        const { data: newMatch, error: matchError } = await supabase
          .from('mentorship_matches')
          .insert([{
            ...createMatchData,
            status: 'pending',
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + createMatchData.duration_weeks * 7 * 24 * 60 * 60 * 1000).toISOString()
          }])
          .select()
          .single();

        if (matchError) throw matchError;

        // Create initial milestones if program is specified
        if (createMatchData.program_id) {
          const { data: program } = await supabase
            .from('mentorship_programs')
            .select('curriculum')
            .eq('id', createMatchData.program_id)
            .single();

          if (program?.curriculum?.milestones) {
            const milestones = program.curriculum.milestones.map((milestone: any, index: number) => ({
              match_id: newMatch.id,
              title: milestone.title,
              description: milestone.description,
              target_date: new Date(Date.now() + (index + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
              order_index: index
            }));

            await supabase.from('mentorship_milestones').insert(milestones);
          }
        }

        // Send notifications
        await NotificationService.sendMatchNotification(
          createMatchData.mentor_id,
          createMatchData.mentee_id,
          newMatch.id
        );

        return NextResponse.json({ match: newMatch }, { status: 201 });

      case 'schedule_session':
        const sessionData = ScheduleSessionSchema.parse(body);
        
        const { data: session, error: sessionError } = await supabase
          .from('mentorship_sessions')
          .insert([{
            ...sessionData,
            status: 'scheduled'
          }])
          .select()
          .single();

        if (sessionError) throw sessionError;

        return NextResponse.json({ session }, { status: 201 });

      case 'update_progress':
        const progressData = UpdateProgressSchema.parse(body);
        
        const { data: progress, error: progressError } = await supabase
          .from('mentorship_progress')
          .insert([{
            ...progressData,
            recorded_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (progressError) throw progressError;

        // Update match progress percentage
        await supabase
          .from('mentorship_matches')
          .update({ 
            progress_percentage: progressData.completion_percentage,
            last_activity: new Date().toISOString()
          })
          .eq('id', progressData.match_id);

        return NextResponse.json({ progress }, { status: 201 });

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('POST /api/mentorship error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT handler - Update mentorship resources
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Resource ID is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'update_profile':
        const profileUpdates = CreateMentorshipProfileSchema.partial().parse(body);
        delete profileUpdates.user_id; // Prevent user_id updates

        const { data: updatedProfile, error: profileError } = await supabase
          .from('mentorship_profiles')
          .update({
            ...profileUpdates,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        if (profileError) throw profileError;

        return NextResponse.json({ profile: updatedProfile });

      case 'update_match_status':
        const { status, feedback } = body;
        
        if (!['pending', 'active', 'paused', 'completed', 'cancelled'].includes(status)) {
          return NextResponse.json(
            { error: 'Invalid status' },
            { status: 400 }
          );
        }

        const updateData: any = { 
          status,
          updated_at: new Date().toISOString()
        };

        if (status === 'completed') {
          updateData.end_date = new Date().toISOString();
        }

        if (feedback) {
          updateData.completion_feedback = feedback;
        }

        const { data: updatedMatch, error: matchError } = await supabase
          .from('mentorship_matches')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (matchError) throw matchError;

        return NextResponse.json({ match: updatedMatch });

      case 'update_session':
        const sessionUpdates = z.object({
          status: z.enum(['scheduled', 'completed', 'cancelled', 'rescheduled']).optional(),
          notes: z.string().optional(),
          feedback_mentor: z.string().optional(),
          feedback_mentee: z.string().optional(),
          actual_duration_minutes: z.number().optional(),
          reschedule_reason: z.string().optional()
        }).parse(body);

        const { data: updatedSession, error: sessionError } = await supabase
          .from('mentorship_sessions')
          .update({
            ...sessionUpdates,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        if (sessionError) throw sessionError;

        return NextResponse.json({ session: updatedSession });

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('PUT /api/mentorship error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE handler - Remove mentorship resources
export async function DELETE(request: NextRequest