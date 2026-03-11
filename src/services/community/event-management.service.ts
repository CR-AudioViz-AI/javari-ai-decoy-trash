```typescript
/**
 * Community Event Management Service
 * Comprehensive event management for virtual meetups, hackathons, workshops, and conferences
 * with registration, scheduling, and live streaming capabilities
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * Event types supported by the platform
 */
export enum EventType {
  MEETUP = 'meetup',
  HACKATHON = 'hackathon',
  WORKSHOP = 'workshop',
  CONFERENCE = 'conference',
  WEBINAR = 'webinar'
}

/**
 * Event status enumeration
 */
export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  LIVE = 'live',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

/**
 * Registration status for attendees
 */
export enum RegistrationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  WAITLISTED = 'waitlisted',
  ATTENDED = 'attended'
}

/**
 * Stream quality options
 */
export enum StreamQuality {
  LOW = '360p',
  MEDIUM = '720p',
  HIGH = '1080p',
  ULTRA = '4K'
}

/**
 * Core event interface
 */
export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  status: EventStatus;
  organizerId: string;
  organizerName: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  maxAttendees?: number;
  currentAttendees: number;
  isPublic: boolean;
  isPaid: boolean;
  price?: number;
  currency?: string;
  tags: string[];
  coverImage?: string;
  venue?: EventVenue;
  streamConfig?: StreamConfiguration;
  registrationDeadline?: Date;
  prerequisites?: string[];
  materials?: EventMaterial[];
  speakers?: EventSpeaker[];
  agenda?: EventAgendaItem[];
  recordingUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event venue information (virtual or physical)
 */
export interface EventVenue {
  type: 'virtual' | 'physical' | 'hybrid';
  platform?: string;
  meetingId?: string;
  passcode?: string;
  streamUrl?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  capacity?: number;
}

/**
 * Stream configuration for live events
 */
export interface StreamConfiguration {
  provider: 'webrtc' | 'zoom' | 'teams' | 'custom';
  quality: StreamQuality;
  enableRecording: boolean;
  enableChat: boolean;
  enableScreenShare: boolean;
  enableBreakoutRooms: boolean;
  maxViewers?: number;
  streamKey?: string;
  rtmpUrl?: string;
}

/**
 * Event attendee registration
 */
export interface EventRegistration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  attendeeEmail: string;
  status: RegistrationStatus;
  registeredAt: Date;
  checkedInAt?: Date;
  paymentId?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed' | 'refunded';
  questionsAnswers?: Record<string, string>;
  dietaryRestrictions?: string;
  accessibilityNeeds?: string;
  metadata?: Record<string, any>;
}

/**
 * Event speaker information
 */
export interface EventSpeaker {
  id: string;
  name: string;
  title: string;
  company?: string;
  bio: string;
  avatar?: string;
  social?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };
}

/**
 * Event agenda item
 */
export interface EventAgendaItem {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  speakerId?: string;
  type: 'presentation' | 'workshop' | 'break' | 'networking' | 'qa';
  location?: string;
  materials?: EventMaterial[];
}

/**
 * Event material (slides, documents, etc.)
 */
export interface EventMaterial {
  id: string;
  name: string;
  type: 'pdf' | 'presentation' | 'video' | 'link' | 'document';
  url: string;
  size?: number;
  description?: string;
  isPublic: boolean;
  uploadedAt: Date;
}

/**
 * Live stream session information
 */
export interface StreamSession {
  id: string;
  eventId: string;
  status: 'starting' | 'live' | 'paused' | 'ended';
  viewerCount: number;
  peakViewers: number;
  streamUrl?: string;
  recordingUrl?: string;
  startedAt?: Date;
  endedAt?: Date;
  quality: StreamQuality;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  metadata?: Record<string, any>;
}

/**
 * Event analytics data
 */
export interface EventAnalytics {
  eventId: string;
  totalRegistrations: number;
  totalAttendees: number;
  attendanceRate: number;
  peakViewers: number;
  averageWatchTime: number;
  chatMessages: number;
  engagement: {
    polls: number;
    questions: number;
    reactions: number;
  };
  demographics: {
    countries: Record<string, number>;
    companies: Record<string, number>;
    roles: Record<string, number>;
  };
  feedback: {
    averageRating: number;
    totalResponses: number;
    nps: number;
  };
  revenue?: {
    totalRevenue: number;
    refunds: number;
    netRevenue: number;
  };
}

/**
 * Event notification configuration
 */
export interface EventNotification {
  type: 'email' | 'push' | 'sms';
  template: string;
  recipients: string[];
  scheduledFor: Date;
  sent: boolean;
  sentAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Event template for quick creation
 */
export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  type: EventType;
  duration: number; // in minutes
  defaultCapacity: number;
  agenda: Omit<EventAgendaItem, 'id' | 'startTime' | 'endTime'>[];
  materials: Omit<EventMaterial, 'id' | 'uploadedAt'>[];
  streamConfig: Partial<StreamConfiguration>;
  tags: string[];
  createdBy: string;
  isPublic: boolean;
  createdAt: Date;
}

/**
 * Service error types
 */
export class EventManagementError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'EventManagementError';
  }
}

/**
 * Community Event Management Service
 * Handles all event lifecycle operations from creation to analytics
 */
export class CommunityEventManagementService {
  private supabase: SupabaseClient;
  private emailService: Resend;
  private realtimeChannels: Map<string, RealtimeChannel> = new Map();
  private activeStreams: Map<string, StreamSession> = new Map();
  private webrtcConnections: Map<string, RTCPeerConnection> = new Map();

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    resendApiKey: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.emailService = new Resend(resendApiKey);
  }

  /**
   * Create a new community event
   */
  async createEvent(eventData: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt' | 'currentAttendees'>): Promise<CommunityEvent> {
    try {
      const event: CommunityEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        currentAttendees: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const { data, error } = await this.supabase
        .from('community_events')
        .insert(event)
        .select()
        .single();

      if (error) {
        throw new EventManagementError(
          `Failed to create event: ${error.message}`,
          'CREATE_EVENT_FAILED',
          500
        );
      }

      // Set up realtime subscription for the event
      await this.setupEventRealtimeSubscription(event.id);

      // Send notifications to followers/subscribers
      if (event.status === EventStatus.PUBLISHED) {
        await this.notifyEventPublication(event);
      }

      return data;
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Unexpected error creating event',
        'INTERNAL_ERROR',
        500
      );
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: string, updates: Partial<CommunityEvent>): Promise<CommunityEvent> {
    try {
      const { data: existingEvent, error: fetchError } = await this.supabase
        .from('community_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !existingEvent) {
        throw new EventManagementError(
          'Event not found',
          'EVENT_NOT_FOUND',
          404
        );
      }

      const updatedEvent = {
        ...updates,
        updatedAt: new Date()
      };

      const { data, error } = await this.supabase
        .from('community_events')
        .update(updatedEvent)
        .eq('id', eventId)
        .select()
        .single();

      if (error) {
        throw new EventManagementError(
          `Failed to update event: ${error.message}`,
          'UPDATE_EVENT_FAILED',
          500
        );
      }

      // Notify attendees of significant changes
      if (updates.startTime || updates.endTime || updates.venue) {
        await this.notifyEventChange(data, existingEvent);
      }

      return data;
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Unexpected error updating event',
        'INTERNAL_ERROR',
        500
      );
    }
  }

  /**
   * Register a user for an event
   */
  async registerForEvent(
    eventId: string,
    attendeeData: {
      attendeeId: string;
      attendeeName: string;
      attendeeEmail: string;
      questionsAnswers?: Record<string, string>;
      dietaryRestrictions?: string;
      accessibilityNeeds?: string;
    }
  ): Promise<EventRegistration> {
    try {
      // Check event capacity and availability
      const event = await this.getEventById(eventId);
      if (!event) {
        throw new EventManagementError(
          'Event not found',
          'EVENT_NOT_FOUND',
          404
        );
      }

      if (event.maxAttendees && event.currentAttendees >= event.maxAttendees) {
        throw new EventManagementError(
          'Event is at full capacity',
          'EVENT_FULL',
          400
        );
      }

      // Check if user is already registered
      const { data: existingRegistration } = await this.supabase
        .from('event_registrations')
        .select('*')
        .eq('eventId', eventId)
        .eq('attendeeId', attendeeData.attendeeId)
        .single();

      if (existingRegistration) {
        throw new EventManagementError(
          'User already registered for this event',
          'ALREADY_REGISTERED',
          400
        );
      }

      const registration: EventRegistration = {
        id: crypto.randomUUID(),
        eventId,
        ...attendeeData,
        status: event.isPaid ? RegistrationStatus.PENDING : RegistrationStatus.CONFIRMED,
        registeredAt: new Date()
      };

      const { data, error } = await this.supabase
        .from('event_registrations')
        .insert(registration)
        .select()
        .single();

      if (error) {
        throw new EventManagementError(
          `Failed to register for event: ${error.message}`,
          'REGISTRATION_FAILED',
          500
        );
      }

      // Update attendee count
      await this.supabase
        .from('community_events')
        .update({ currentAttendees: event.currentAttendees + 1 })
        .eq('id', eventId);

      // Send confirmation email
      await this.sendRegistrationConfirmation(event, data);

      return data;
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Unexpected error during registration',
        'INTERNAL_ERROR',
        500
      );
    }
  }

  /**
   * Start a live stream for an event
   */
  async startLiveStream(eventId: string, streamConfig?: Partial<StreamConfiguration>): Promise<StreamSession> {
    try {
      const event = await this.getEventById(eventId);
      if (!event) {
        throw new EventManagementError(
          'Event not found',
          'EVENT_NOT_FOUND',
          404
        );
      }

      // Check if stream is already active
      if (this.activeStreams.has(eventId)) {
        throw new EventManagementError(
          'Stream already active for this event',
          'STREAM_ALREADY_ACTIVE',
          400
        );
      }

      const session: StreamSession = {
        id: crypto.randomUUID(),
        eventId,
        status: 'starting',
        viewerCount: 0,
        peakViewers: 0,
        quality: streamConfig?.quality || event.streamConfig?.quality || StreamQuality.MEDIUM,
        chatEnabled: streamConfig?.enableChat ?? event.streamConfig?.enableChat ?? true,
        screenShareEnabled: streamConfig?.enableScreenShare ?? event.streamConfig?.enableScreenShare ?? true,
        startedAt: new Date()
      };

      // Initialize WebRTC connection for peer-to-peer streaming
      if (event.streamConfig?.provider === 'webrtc') {
        await this.initializeWebRTCStream(session);
      }

      this.activeStreams.set(eventId, session);

      // Update event status to live
      await this.updateEvent(eventId, { status: EventStatus.LIVE });

      // Notify all registered attendees
      await this.notifyStreamStart(event);

      return session;
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Failed to start live stream',
        'STREAM_START_FAILED',
        500
      );
    }
  }

  /**
   * Get event analytics
   */
  async getEventAnalytics(eventId: string): Promise<EventAnalytics> {
    try {
      const [
        { data: registrations },
        { data: attendanceData },
        { data: streamData }
      ] = await Promise.all([
        this.supabase
          .from('event_registrations')
          .select('*')
          .eq('eventId', eventId),
        this.supabase
          .from('event_attendance')
          .select('*')
          .eq('eventId', eventId),
        this.supabase
          .from('stream_analytics')
          .select('*')
          .eq('eventId', eventId)
      ]);

      const analytics: EventAnalytics = {
        eventId,
        totalRegistrations: registrations?.length || 0,
        totalAttendees: attendanceData?.length || 0,
        attendanceRate: registrations?.length ? (attendanceData?.length || 0) / registrations.length : 0,
        peakViewers: Math.max(...(streamData?.map(s => s.peak_viewers) || [0])),
        averageWatchTime: this.calculateAverageWatchTime(streamData || []),
        chatMessages: streamData?.reduce((total, s) => total + (s.chat_messages || 0), 0) || 0,
        engagement: {
          polls: 0, // TODO: Implement poll tracking
          questions: 0, // TODO: Implement Q&A tracking
          reactions: 0 // TODO: Implement reaction tracking
        },
        demographics: await this.calculateDemographics(registrations || []),
        feedback: await this.calculateFeedbackMetrics(eventId)
      };

      return analytics;
    } catch (error) {
      throw new EventManagementError(
        'Failed to fetch event analytics',
        'ANALYTICS_FAILED',
        500
      );
    }
  }

  /**
   * Create event from template
   */
  async createEventFromTemplate(templateId: string, eventData: Partial<CommunityEvent>): Promise<CommunityEvent> {
    try {
      const { data: template, error } = await this.supabase
        .from('event_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error || !template) {
        throw new EventManagementError(
          'Template not found',
          'TEMPLATE_NOT_FOUND',
          404
        );
      }

      const now = new Date();
      const endTime = new Date(now.getTime() + template.duration * 60000);

      const newEvent: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt' | 'currentAttendees'> = {
        title: eventData.title || `${template.name} Event`,
        description: eventData.description || template.description,
        type: template.type,
        status: EventStatus.DRAFT,
        organizerId: eventData.organizerId!,
        organizerName: eventData.organizerName!,
        startTime: eventData.startTime || now,
        endTime: eventData.endTime || endTime,
        timezone: eventData.timezone || 'UTC',
        maxAttendees: eventData.maxAttendees || template.defaultCapacity,
        isPublic: eventData.isPublic ?? true,
        isPaid: eventData.isPaid ?? false,
        price: eventData.price,
        currency: eventData.currency,
        tags: [...template.tags, ...(eventData.tags || [])],
        coverImage: eventData.coverImage,
        venue: eventData.venue,
        streamConfig: { ...template.streamConfig, ...eventData.streamConfig },
        registrationDeadline: eventData.registrationDeadline,
        prerequisites: eventData.prerequisites,
        materials: template.materials as EventMaterial[],
        speakers: eventData.speakers || [],
        agenda: this.adjustAgendaTimes(template.agenda, eventData.startTime || now),
        recordingUrl: eventData.recordingUrl
      };

      return await this.createEvent(newEvent);
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Failed to create event from template',
        'TEMPLATE_CREATION_FAILED',
        500
      );
    }
  }

  /**
   * Get upcoming events with filtering and pagination
   */
  async getUpcomingEvents(
    filters: {
      type?: EventType;
      tags?: string[];
      organizerId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ events: CommunityEvent[]; total: number }> {
    try {
      let query = this.supabase
        .from('community_events')
        .select('*', { count: 'exact' })
        .eq('status', EventStatus.PUBLISHED)
        .gte('startTime', new Date().toISOString())
        .order('startTime', { ascending: true });

      if (filters.type) {
        query = query.eq('type', filters.type);
      }

      if (filters.organizerId) {
        query = query.eq('organizerId', filters.organizerId);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new EventManagementError(
          `Failed to fetch events: ${error.message}`,
          'FETCH_EVENTS_FAILED',
          500
        );
      }

      return {
        events: data || [],
        total: count || 0
      };
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Unexpected error fetching events',
        'INTERNAL_ERROR',
        500
      );
    }
  }

  /**
   * Get event by ID
   */
  async getEventById(eventId: string): Promise<CommunityEvent | null> {
    try {
      const { data, error } = await this.supabase
        .from('community_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new EventManagementError(
          `Failed to fetch event: ${error.message}`,
          'FETCH_EVENT_FAILED',
          500
        );
      }

      return data;
    } catch (error) {
      if (error instanceof EventManagementError) throw error;
      throw new EventManagementError(
        'Unexpected error fetching event',
        'INTERNAL_ERROR',
        500
      );
    }
  }

  /**
   * Cancel an event
   */
  async cancelEvent(eventId: string, reason?: string): Promise<void> {
    try {
      const event = await this.getEventById(eventId);
      if (!event) {
        throw new EventManagementError(
          'Event not found',
          'EVENT_NOT_FOUND',
          404
        );
      }

      await this.updateEvent(eventId, { status: EventStatus.CANCELLED });

      // Stop active stream if any
      if (this.activeStreams.has(eventId)) {
        await this.endLiveStream(eventId);
      }