```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schemas
const teamMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  role: z.enum(['architect', 'engineer', 'designer', 'analyst', 'coordinator']),
  status: z.enum(['active', 'idle', 'busy', 'offline']),
  currentTask: z.string().optional(),
  lastActivity: z.string().datetime(),
});

const collaborationStateSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
  members: z.array(teamMemberSchema),
  sharedContext: z.record(z.any()),
  activeWorkflows: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.enum(['pending', 'in-progress', 'completed', 'blocked']),
    assignedTo: z.array(z.string().uuid()),
    dependencies: z.array(z.string().uuid()),
    progress: z.number().min(0).max(100),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })),
  communicationLog: z.array(z.object({
    id: z.string().uuid(),
    fromMemberId: z.string().uuid(),
    toMemberId: z.string().uuid().optional(),
    message: z.string(),
    type: z.enum(['task-assignment', 'status-update', 'question', 'response', 'notification']),
    timestamp: z.string().datetime(),
  })),
  metrics: z.object({
    totalTasks: z.number().int().min(0),
    completedTasks: z.number().int().min(0),
    activeMembers: z.number().int().min(0),
    sessionDuration: z.number().int().min(0),
    collaborationScore: z.number().min(0).max(100),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const updateStateSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  sessionId: z.string().uuid(),
  updates: z.object({
    members: z.array(teamMemberSchema).optional(),
    sharedContext: z.record(z.any()).optional(),
    activeWorkflows: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.enum(['pending', 'in-progress', 'completed', 'blocked']),
      assignedTo: z.array(z.string().uuid()),
      dependencies: z.array(z.string().uuid()),
      progress: z.number().min(0).max(100),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })).optional(),
    communicationLog: z.array(z.object({
      id: z.string().uuid(),
      fromMemberId: z.string().uuid(),
      toMemberId: z.string().uuid().optional(),
      message: z.string(),
      type: z.enum(['task-assignment', 'status-update', 'question', 'response', 'notification']),
      timestamp: z.string().datetime(),
    })).optional(),
  }),
});

// Helper functions
async function getTeamState(teamId: string): Promise<any> {
  try {
    const stateKey = `team:${teamId}:state`;
    const state = await redis.get(stateKey);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    console.error('Error getting team state:', error);
    throw new Error('Failed to retrieve team state');
  }
}

async function setTeamState(teamId: string, state: any): Promise<void> {
  try {
    const stateKey = `team:${teamId}:state`;
    const progressKey = `team:${teamId}:progress`;
    
    // Update main state
    await redis.setex(stateKey, 3600, JSON.stringify(state)); // 1 hour TTL
    
    // Update progress metrics
    const progressData = {
      teamId,
      completedTasks: state.metrics.completedTasks,
      totalTasks: state.metrics.totalTasks,
      activeMembers: state.metrics.activeMembers,
      collaborationScore: state.metrics.collaborationScore,
      lastUpdated: new Date().toISOString(),
    };
    await redis.setex(progressKey, 3600, JSON.stringify(progressData));
    
    // Publish state update to subscribers
    await redis.publish(`team:${teamId}:state`, JSON.stringify({
      type: 'state-update',
      teamId,
      data: state,
      timestamp: new Date().toISOString(),
    }));
    
  } catch (error) {
    console.error('Error setting team state:', error);
    throw new Error('Failed to update team state');
  }
}

async function logCollaborationActivity(teamId: string, activity: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('collaboration_logs')
      .insert({
        team_id: teamId,
        activity_type: activity.type,
        activity_data: activity,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('Error logging collaboration activity:', error);
    }
  } catch (error) {
    console.error('Error logging to Supabase:', error);
  }
}

async function calculateCollaborationMetrics(state: any): Promise<any> {
  const now = new Date();
  const sessionStart = new Date(state.createdAt);
  const sessionDuration = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
  
  const totalTasks = state.activeWorkflows.length;
  const completedTasks = state.activeWorkflows.filter((w: any) => w.status === 'completed').length;
  const activeMembers = state.members.filter((m: any) => m.status === 'active' || m.status === 'busy').length;
  
  // Calculate collaboration score based on various factors
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const memberEngagement = state.members.length > 0 ? (activeMembers / state.members.length) * 100 : 0;
  const communicationActivity = Math.min(state.communicationLog.length / 10, 1) * 100; // Max score at 10+ messages
  
  const collaborationScore = Math.round(
    (taskCompletionRate * 0.4) + (memberEngagement * 0.4) + (communicationActivity * 0.2)
  );
  
  return {
    totalTasks,
    completedTasks,
    activeMembers,
    sessionDuration,
    collaborationScore: Math.min(collaborationScore, 100),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }
    
    // Validate team ID format
    if (!z.string().uuid().safeParse(teamId).success) {
      return NextResponse.json(
        { error: 'Invalid team ID format' },
        { status: 400 }
      );
    }
    
    const teamState = await getTeamState(teamId);
    
    if (!teamState) {
      return NextResponse.json(
        { error: 'Team state not found' },
        { status: 404 }
      );
    }
    
    // Update metrics before returning
    const updatedMetrics = await calculateCollaborationMetrics(teamState);
    teamState.metrics = updatedMetrics;
    teamState.updatedAt = new Date().toISOString();
    
    // Update the cached state with new metrics
    await setTeamState(teamId, teamState);
    
    return NextResponse.json({
      success: true,
      data: teamState,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('GET /api/team-collaboration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const headersList = headers();
    const contentType = headersList.get('content-type');
    
    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    // Check if this is a state update or new state creation
    if (body.updates) {
      // Update existing state
      const validation = updateStateSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { 
            error: 'Invalid request data', 
            details: validation.error.format() 
          },
          { status: 400 }
        );
      }
      
      const { teamId, updates } = validation.data;
      const existingState = await getTeamState(teamId);
      
      if (!existingState) {
        return NextResponse.json(
          { error: 'Team state not found' },
          { status: 404 }
        );
      }
      
      // Merge updates with existing state
      const updatedState = {
        ...existingState,
        ...updates,
        metrics: await calculateCollaborationMetrics({
          ...existingState,
          ...updates,
        }),
        updatedAt: new Date().toISOString(),
      };
      
      await setTeamState(teamId, updatedState);
      
      // Log the update activity
      await logCollaborationActivity(teamId, {
        type: 'state-update',
        updates,
        updatedBy: 'system', // Could be extracted from auth
        timestamp: new Date().toISOString(),
      });
      
      return NextResponse.json({
        success: true,
        data: updatedState,
        message: 'Team state updated successfully',
        timestamp: new Date().toISOString(),
      });
      
    } else {
      // Create new state
      const validation = collaborationStateSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { 
            error: 'Invalid request data', 
            details: validation.error.format() 
          },
          { status: 400 }
        );
      }
      
      const stateData = validation.data;
      
      // Calculate initial metrics
      stateData.metrics = await calculateCollaborationMetrics(stateData);
      
      await setTeamState(stateData.teamId, stateData);
      
      // Log the creation activity
      await logCollaborationActivity(stateData.teamId, {
        type: 'team-session-created',
        teamId: stateData.teamId,
        projectId: stateData.projectId,
        sessionId: stateData.sessionId,
        memberCount: stateData.members.length,
        timestamp: new Date().toISOString(),
      });
      
      return NextResponse.json({
        success: true,
        data: stateData,
        message: 'Team collaboration state created successfully',
        timestamp: new Date().toISOString(),
      }, { status: 201 });
    }
    
  } catch (error) {
    console.error('POST /api/team-collaboration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }
    
    // Validate team ID format
    if (!z.string().uuid().safeParse(teamId).success) {
      return NextResponse.json(
        { error: 'Invalid team ID format' },
        { status: 400 }
      );
    }
    
    const existingState = await getTeamState(teamId);
    
    if (!existingState) {
      return NextResponse.json(
        { error: 'Team state not found' },
        { status: 404 }
      );
    }
    
    // Clean up Redis keys
    const stateKey = `team:${teamId}:state`;
    const progressKey = `team:${teamId}:progress`;
    
    await redis.del(stateKey);
    await redis.del(progressKey);
    
    // Publish cleanup notification
    await redis.publish(`team:${teamId}:state`, JSON.stringify({
      type: 'session-ended',
      teamId,
      timestamp: new Date().toISOString(),
    }));
    
    // Log the cleanup activity
    await logCollaborationActivity(teamId, {
      type: 'team-session-ended',
      teamId,
      sessionDuration: existingState.metrics.sessionDuration,
      finalMetrics: existingState.metrics,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json({
      success: true,
      message: 'Team collaboration state cleaned up successfully',
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('DELETE /api/team-collaboration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function PUT(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PATCH(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
```