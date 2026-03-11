```typescript
import { createClient, RealtimeChannel, User } from '@supabase/supabase-js';
import { EventEmitter } from 'events';

/**
 * Represents a user's skill with proficiency level
 */
interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  verified: boolean;
  endorsements: number;
}

/**
 * User profile for peer learning platform
 */
interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  skills: Skill[];
  interests: string[];
  learningGoals: string[];
  availability: {
    timezone: string;
    preferredTimes: string[];
    hoursPerWeek: number;
  };
  reputation: number;
  isMentor: boolean;
  joinedAt: Date;
}

/**
 * Study group configuration and state
 */
interface StudyGroup {
  id: string;
  name: string;
  description: string;
  category: string;
  skills: string[];
  members: UserProfile[];
  maxMembers: number;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  schedule: {
    frequency: 'weekly' | 'biweekly' | 'monthly';
    dayOfWeek: number;
    time: string;
    timezone: string;
  };
  status: 'active' | 'inactive' | 'completed';
  resources: Resource[];
  chatChannel: string;
}

/**
 * Collaborative project definition
 */
interface CollaborativeProject {
  id: string;
  title: string;
  description: string;
  category: string;
  skillsRequired: string[];
  skillsToLearn: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDuration: number;
  maxParticipants: number;
  currentParticipants: UserProfile[];
  createdBy: string;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  tasks: ProjectTask[];
  milestones: Milestone[];
  resources: Resource[];
  chatChannel: string;
  createdAt: Date;
  deadline?: Date;
}

/**
 * Project task with assignment and status
 */
interface ProjectTask {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high';
  skillsRequired: string[];
  estimatedHours: number;
  actualHours?: number;
  dependencies: string[];
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Project milestone tracking
 */
interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate: Date;
  completedDate?: Date;
  progress: number;
  tasks: string[];
}

/**
 * Shared learning resource
 */
interface Resource {
  id: string;
  title: string;
  type: 'article' | 'video' | 'document' | 'link' | 'file';
  url?: string;
  content?: string;
  uploadedBy: string;
  tags: string[];
  rating: number;
  downloads: number;
  createdAt: Date;
}

/**
 * Achievement badge definition
 */
interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  criteria: {
    type: 'skill_endorsements' | 'project_completion' | 'mentorship' | 'collaboration' | 'resource_sharing';
    threshold: number;
    skills?: string[];
    timeframe?: number;
  };
  points: number;
}

/**
 * User's earned badge with timestamp
 */
interface UserBadge {
  badge: Badge;
  earnedAt: Date;
  progress?: number;
}

/**
 * Learning progress tracking
 */
interface LearningProgress {
  userId: string;
  skillId: string;
  currentLevel: number;
  targetLevel: number;
  hoursSpent: number;
  activitiesCompleted: number;
  lastActivity: Date;
  milestones: {
    level: number;
    achievedAt: Date;
    evidence: string[];
  }[];
}

/**
 * Peer matching recommendation
 */
interface PeerMatch {
  user: UserProfile;
  matchScore: number;
  commonSkills: string[];
  complementarySkills: string[];
  availabilityOverlap: number;
  reason: string;
}

/**
 * Learning session record
 */
interface LearningSession {
  id: string;
  type: 'study_group' | 'project_work' | 'mentorship' | 'peer_session';
  participants: string[];
  duration: number;
  skills: string[];
  activities: string[];
  outcomes: string[];
  rating: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Real-time chat message
 */
interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'file' | 'image' | 'code' | 'system';
  timestamp: Date;
  edited?: boolean;
  replyTo?: string;
}

/**
 * Skill matching engine using ML algorithms for peer recommendations
 */
class SkillMatchingEngine extends EventEmitter {
  private users: Map<string, UserProfile> = new Map();
  private skillGraph: Map<string, string[]> = new Map();

  /**
   * Initialize skill matching engine
   */
  constructor() {
    super();
    this.buildSkillGraph();
  }

  /**
   * Build skill relationship graph for better matching
   */
  private buildSkillGraph(): void {
    const skillRelations = {
      'javascript': ['typescript', 'react', 'node.js', 'vue.js'],
      'python': ['django', 'flask', 'data-science', 'machine-learning'],
      'react': ['javascript', 'jsx', 'redux', 'next.js'],
      'machine-learning': ['python', 'tensorflow', 'pytorch', 'data-science'],
      'data-science': ['python', 'r', 'statistics', 'machine-learning']
    };

    Object.entries(skillRelations).forEach(([skill, related]) => {
      this.skillGraph.set(skill, related);
    });
  }

  /**
   * Register user profile for matching
   */
  registerUser(profile: UserProfile): void {
    this.users.set(profile.id, profile);
    this.emit('userRegistered', profile);
  }

  /**
   * Find peer matches for a user based on skills and preferences
   */
  findMatches(userId: string, maxMatches: number = 10): PeerMatch[] {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const matches: PeerMatch[] = [];
    const userSkills = new Set(user.skills.map(s => s.name.toLowerCase()));
    const userInterests = new Set(user.interests.map(i => i.toLowerCase()));

    for (const [candidateId, candidate] of this.users) {
      if (candidateId === userId) continue;

      const candidateSkills = new Set(candidate.skills.map(s => s.name.toLowerCase()));
      const candidateInterests = new Set(candidate.interests.map(i => i.toLowerCase()));

      const commonSkills = Array.from(userSkills).filter(skill => candidateSkills.has(skill));
      const complementarySkills = this.findComplementarySkills(userSkills, candidateSkills);
      const commonInterests = Array.from(userInterests).filter(interest => candidateInterests.has(interest));
      
      const availabilityOverlap = this.calculateAvailabilityOverlap(user.availability, candidate.availability);
      const reputationScore = Math.min(candidate.reputation / 1000, 1);

      const matchScore = this.calculateMatchScore({
        commonSkills: commonSkills.length,
        complementarySkills: complementarySkills.length,
        commonInterests: commonInterests.length,
        availabilityOverlap,
        reputationScore
      });

      if (matchScore > 0.3) {
        matches.push({
          user: candidate,
          matchScore,
          commonSkills,
          complementarySkills,
          availabilityOverlap,
          reason: this.generateMatchReason(commonSkills, complementarySkills, commonInterests)
        });
      }
    }

    return matches
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxMatches);
  }

  /**
   * Find skills that complement user's existing skills
   */
  private findComplementarySkills(userSkills: Set<string>, candidateSkills: Set<string>): string[] {
    const complementary: string[] = [];

    for (const userSkill of userSkills) {
      const relatedSkills = this.skillGraph.get(userSkill) || [];
      for (const related of relatedSkills) {
        if (candidateSkills.has(related) && !userSkills.has(related)) {
          complementary.push(related);
        }
      }
    }

    return [...new Set(complementary)];
  }

  /**
   * Calculate availability overlap between two users
   */
  private calculateAvailabilityOverlap(avail1: UserProfile['availability'], avail2: UserProfile['availability']): number {
    if (avail1.timezone !== avail2.timezone) {
      return 0.5; // Simplified: reduce score for different timezones
    }

    const overlap = avail1.preferredTimes.filter(time => avail2.preferredTimes.includes(time));
    return overlap.length / Math.max(avail1.preferredTimes.length, avail2.preferredTimes.length);
  }

  /**
   * Calculate overall match score using weighted factors
   */
  private calculateMatchScore(factors: {
    commonSkills: number;
    complementarySkills: number;
    commonInterests: number;
    availabilityOverlap: number;
    reputationScore: number;
  }): number {
    const weights = {
      commonSkills: 0.3,
      complementarySkills: 0.25,
      commonInterests: 0.2,
      availabilityOverlap: 0.15,
      reputationScore: 0.1
    };

    return (
      Math.min(factors.commonSkills * weights.commonSkills, weights.commonSkills) +
      Math.min(factors.complementarySkills * weights.complementarySkills, weights.complementarySkills) +
      Math.min(factors.commonInterests * weights.commonInterests, weights.commonInterests) +
      factors.availabilityOverlap * weights.availabilityOverlap +
      factors.reputationScore * weights.reputationScore
    );
  }

  /**
   * Generate human-readable match reason
   */
  private generateMatchReason(commonSkills: string[], complementarySkills: string[], commonInterests: string[]): string {
    const reasons: string[] = [];

    if (commonSkills.length > 0) {
      reasons.push(`Shares ${commonSkills.length} skills: ${commonSkills.slice(0, 3).join(', ')}`);
    }

    if (complementarySkills.length > 0) {
      reasons.push(`Can teach: ${complementarySkills.slice(0, 3).join(', ')}`);
    }

    if (commonInterests.length > 0) {
      reasons.push(`Common interests: ${commonInterests.slice(0, 2).join(', ')}`);
    }

    return reasons.join(' | ') || 'Similar learning goals';
  }
}

/**
 * Study group management with real-time collaboration
 */
class StudyGroupManager extends EventEmitter {
  private groups: Map<string, StudyGroup> = new Map();
  private supabase: any;
  private channels: Map<string, RealtimeChannel> = new Map();

  constructor(supabase: any) {
    super();
    this.supabase = supabase;
  }

  /**
   * Create a new study group
   */
  async createGroup(groupData: Omit<StudyGroup, 'id' | 'createdAt' | 'chatChannel'>): Promise<StudyGroup> {
    const id = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chatChannel = `chat_${id}`;

    const group: StudyGroup = {
      ...groupData,
      id,
      createdAt: new Date(),
      chatChannel,
      resources: []
    };

    this.groups.set(id, group);

    try {
      const { error } = await this.supabase
        .from('study_groups')
        .insert([{
          id: group.id,
          name: group.name,
          description: group.description,
          category: group.category,
          skills: group.skills,
          max_members: group.maxMembers,
          is_private: group.isPrivate,
          created_by: group.createdBy,
          schedule: group.schedule,
          status: group.status,
          chat_channel: group.chatChannel
        }]);

      if (error) throw error;

      this.setupGroupChannel(group);
      this.emit('groupCreated', group);

      return group;
    } catch (error) {
      this.groups.delete(id);
      throw new Error(`Failed to create study group: ${error}`);
    }
  }

  /**
   * Join a study group
   */
  async joinGroup(groupId: string, user: UserProfile): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error('Study group not found');
    }

    if (group.members.length >= group.maxMembers) {
      throw new Error('Study group is full');
    }

    if (group.members.some(member => member.id === user.id)) {
      throw new Error('User already in group');
    }

    group.members.push(user);

    try {
      const { error } = await this.supabase
        .from('study_group_members')
        .insert([{
          group_id: groupId,
          user_id: user.id,
          joined_at: new Date()
        }]);

      if (error) throw error;

      this.emit('memberJoined', { group, user });
      
      // Notify group channel
      const channel = this.channels.get(group.chatChannel);
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'member_joined',
          payload: { user: user.name, userId: user.id }
        });
      }
    } catch (error) {
      // Rollback local change
      group.members = group.members.filter(member => member.id !== user.id);
      throw new Error(`Failed to join group: ${error}`);
    }
  }

  /**
   * Leave a study group
   */
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error('Study group not found');
    }

    const memberIndex = group.members.findIndex(member => member.id === userId);
    if (memberIndex === -1) {
      throw new Error('User not in group');
    }

    const user = group.members[memberIndex];
    group.members.splice(memberIndex, 1);

    try {
      const { error } = await this.supabase
        .from('study_group_members')
        .delete()
        .match({ group_id: groupId, user_id: userId });

      if (error) throw error;

      this.emit('memberLeft', { group, userId });

      // Notify group channel
      const channel = this.channels.get(group.chatChannel);
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'member_left',
          payload: { user: user.name, userId }
        });
      }
    } catch (error) {
      // Rollback local change
      group.members.splice(memberIndex, 0, user);
      throw new Error(`Failed to leave group: ${error}`);
    }
  }

  /**
   * Schedule a study session
   */
  async scheduleSession(groupId: string, sessionData: {
    title: string;
    description: string;
    scheduledFor: Date;
    duration: number;
    topics: string[];
  }): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error('Study group not found');
    }

    try {
      const { error } = await this.supabase
        .from('study_sessions')
        .insert([{
          group_id: groupId,
          title: sessionData.title,
          description: sessionData.description,
          scheduled_for: sessionData.scheduledFor,
          duration: sessionData.duration,
          topics: sessionData.topics,
          status: 'scheduled'
        }]);

      if (error) throw error;

      this.emit('sessionScheduled', { group, sessionData });

      // Notify group members
      const channel = this.channels.get(group.chatChannel);
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'session_scheduled',
          payload: sessionData
        });
      }
    } catch (error) {
      throw new Error(`Failed to schedule session: ${error}`);
    }
  }

  /**
   * Get study groups for a user
   */
  getUserGroups(userId: string): StudyGroup[] {
    return Array.from(this.groups.values()).filter(group =>
      group.members.some(member => member.id === userId)
    );
  }

  /**
   * Search study groups by criteria
   */
  searchGroups(criteria: {
    skills?: string[];
    category?: string;
    availability?: string;
    maxMembers?: number;
  }): StudyGroup[] {
    return Array.from(this.groups.values()).filter(group => {
      if (criteria.skills && !criteria.skills.some(skill => group.skills.includes(skill))) {
        return false;
      }
      if (criteria.category && group.category !== criteria.category) {
        return false;
      }
      if (criteria.maxMembers && group.members.length >= criteria.maxMembers) {
        return false;
      }
      return group.status === 'active' && !group.isPrivate;
    });
  }

  /**
   * Setup real-time channel for group communication
   */
  private setupGroupChannel(group: StudyGroup): void {
    const channel = this.supabase.channel(group.chatChannel);

    channel.on('broadcast', { event: 'message' }, (payload: any) => {
      this.emit('groupMessage', { groupId: group.id, ...payload });
    });

    channel.on('broadcast', { event: 'typing' }, (payload: any) => {
      this.emit('userTyping', { groupId: group.id, ...payload });
    });

    channel.subscribe();
    this.channels.set(group.chatChannel, channel);
  }
}

/**
 * Collaborative project workspace with task management
 */
class CollaborativeProjectWorkspace extends EventEmitter {
  private projects: Map<string, CollaborativeProject> = new Map();
  private tasks: Map<string, ProjectTask> = new Map();
  private supabase: any;
  private channels: Map<string, RealtimeChannel> = new Map();

  constructor(supabase: any) {
    super();
    this.supabase = supabase;
  }

  /**
   * Create a new collaborative project
   */
  async createProject(projectData: Omit<CollaborativeProject, 'id' | 'createdAt' | 'chatChannel' | 'currentParticipants' | 'tasks' | 'milestones' | 'resources'>): Promise<CollaborativeProject> {
    const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chatChannel = `project_${id}`;

    const project: CollaborativeProject = {
      ...projectData,
      id,
      createdAt: new Date(),
      chatChannel,
      currentParticipants: [],
      tasks: [],
      milestones: [],
      resources: []
    };

    this.projects.set(id, project);

    try {
      const { error } = await this.supabase
        .from('collaborative_projects')
        .insert([{
          id: project.id,
          title: project.title,
          description: project.description,
          category: project.category,
          skills_required: project.skillsRequired,
          skills_to_learn: project.skillsToLearn,
          difficulty: project.difficulty,
          estimated_duration: project.estimatedDuration,
          max_participants: project.maxParticipants,
          created_by: project.createdBy,
          status: project.status,
          chat_channel: project.chatChannel,
          deadline: project.deadline
        }]);

      if (error) throw error;

      this.setupProjectChannel(project);
      this.emit('projectCreated', project);

      return project;
    } catch (error) {
      this.projects.delete(id);
      throw new Error(`Failed to create project: ${error}`);
    }
  }

  /**
   * Join a collaborative project
   */
  async joinProject(projectId: string, user: UserProfile): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.currentParticipants.length >= project.maxParticipants) {
      throw new Error('Project is full');
    }

    if (project.currentParticipants.some(participant => participant.id === user.id)) {
      throw new Error('User already in project');
    }

    // Check if user has required skills
    const userSkills = user.skills.map(s => s.name.toLowerCase());
    const hasRequiredSkills = project.skillsRequired.some(skill => 
      userSkills.includes(skill.toLowerCase())
    );

    if (!hasRequiredSkills && project.skillsRequired.length > 0) {
      throw new Error('User does not have required skills');
    }

    project.currentParticipants.push(user);

    try {
      const { error } = await this.supabase
        .from('project_participants')
        .insert([{
          project_id: projectId,
          user_id: user.id,
          joined_at: new Date(),
          role: 'contributor'