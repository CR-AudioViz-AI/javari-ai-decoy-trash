'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import { io, Socket } from 'socket.io-client';
import {
  Users,
  FolderOpen,
  MessageSquare,
  Video,
  Settings,
  Bell,
  Plus,
  Search,
  Filter,
  Calendar,
  File,
  Upload,
  Download,
  Edit3,
  Trash2,
  UserPlus,
  Crown,
  Shield,
  Eye,
  Play,
  Pause,
  MoreHorizontal,
  CheckCircle,
  Clock,
  AlertCircle,
  Share2,
  Lock,
  Unlock
} from 'lucide-react';

/**
 * Workspace entity interfaces
 */
interface Workspace {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  visibility: 'public' | 'private' | 'team';
  permissions: {
    invite_members: boolean;
    manage_projects: boolean;
    access_resources: boolean;
    admin_settings: boolean;
  };
  integrations: {
    enable_chat: boolean;
    enable_video: boolean;
    enable_file_sharing: boolean;
  };
}

interface TeamMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  last_active: string;
  profile: {
    full_name: string;
    avatar_url: string;
    email: string;
  };
}

interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'on_hold';
  priority: 'low' | 'medium' | 'high';
  created_by: string;
  assigned_to: string[];
  due_date: string;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assigned_to: string;
  created_by: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

interface Resource {
  id: string;
  workspace_id: string;
  name: string;
  type: 'file' | 'folder' | 'link';
  size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  version: number;
  tags: string[];
  shared_with: string[];
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  workspace_id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'file' | 'system';
  reply_to: string | null;
  created_at: string;
  sender: {
    full_name: string;
    avatar_url: string;
  };
}

interface Activity {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  target_type: 'project' | 'task' | 'resource' | 'member';
  target_id: string;
  metadata: Record<string, any>;
  created_at: string;
  user: {
    full_name: string;
    avatar_url: string;
  };
}

/**
 * Main workspace collaboration page component
 */
export default function WorkspacePage(): JSX.Element {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { 
    activeWorkspace, 
    setActiveWorkspace,
    socket,
    setSocket,
    isConnected,
    setIsConnected 
  } = useWorkspaceStore();

  // Component state
  const [activeView, setActiveView] = useState<'dashboard' | 'projects' | 'resources' | 'team' | 'chat'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showVideoCall, setShowVideoCall] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterOptions, setFilterOptions] = useState({
    status: 'all',
    priority: 'all',
    assignee: 'all'
  });

  /**
   * Initialize workspace socket connection
   */
  useEffect(() => {
    if (!user || !activeWorkspace) return;

    const newSocket: Socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:3001', {
      query: {
        userId: user.id,
        workspaceId: activeWorkspace.id
      }
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Workspace socket connected');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Workspace socket disconnected');
    });

    newSocket.on('workspace:update', (data) => {
      queryClient.invalidateQueries(['workspace', activeWorkspace.id]);
    });

    newSocket.on('project:update', (data) => {
      queryClient.invalidateQueries(['projects', activeWorkspace.id]);
    });

    newSocket.on('message:new', (message: Message) => {
      queryClient.setQueryData(['messages', activeWorkspace.id], (old: Message[] = []) => {
        return [message, ...old];
      });
    });

    newSocket.on('activity:new', (activity: Activity) => {
      queryClient.setQueryData(['activities', activeWorkspace.id], (old: Activity[] = []) => {
        return [activity, ...old];
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [user, activeWorkspace, setSocket, setIsConnected, queryClient]);

  /**
   * Fetch workspace data
   */
  const { data: workspace, isLoading: workspaceLoading } = useQuery({
    queryKey: ['workspace', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', activeWorkspace.id)
        .single();

      if (error) throw error;
      return data as Workspace;
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Fetch team members
   */
  const { data: teamMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          *,
          profile:profiles(full_name, avatar_url, email)
        `)
        .eq('workspace_id', activeWorkspace.id);

      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Fetch projects
   */
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Project[];
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Fetch tasks for selected project
   */
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', selectedProject],
    queryFn: async () => {
      if (!selectedProject) throw new Error('No selected project');
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', selectedProject)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!selectedProject
  });

  /**
   * Fetch resources
   */
  const { data: resources = [] } = useQuery({
    queryKey: ['resources', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Resource[];
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Fetch messages
   */
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(full_name, avatar_url)
        `)
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Fetch activities
   */
  const { data: activities = [] } = useQuery({
    queryKey: ['activities', activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');
      
      const { data, error } = await supabase
        .from('activities')
        .select(`
          *,
          user:profiles(full_name, avatar_url)
        `)
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Activity[];
    },
    enabled: !!activeWorkspace?.id
  });

  /**
   * Create new project mutation
   */
  const createProjectMutation = useMutation({
    mutationFn: async (projectData: Partial<Project>) => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');

      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...projectData,
          workspace_id: activeWorkspace.id,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects', activeWorkspace?.id]);
      socket?.emit('project:created');
    }
  });

  /**
   * Update project mutation
   */
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Project> }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects', activeWorkspace?.id]);
      socket?.emit('project:updated');
    }
  });

  /**
   * Create task mutation
   */
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: Partial<Task>) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...taskData,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks', selectedProject]);
      socket?.emit('task:created');
    }
  });

  /**
   * Send message mutation
   */
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { content: string; type: 'text' | 'file' }) => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          workspace_id: activeWorkspace.id,
          sender_id: user?.id,
          channel_id: 'general',
          ...messageData
        })
        .select()
        .single();

      if (error) throw error;
      return data as Message;
    },
    onSuccess: (message) => {
      socket?.emit('message:send', message);
    }
  });

  /**
   * Upload resource mutation
   */
  const uploadResourceMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${activeWorkspace.id}/resources/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('workspace-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('resources')
        .insert({
          workspace_id: activeWorkspace.id,
          name: file.name,
          type: 'file',
          size: file.size,
          mime_type: file.type,
          storage_path: filePath,
          uploaded_by: user?.id,
          version: 1,
          tags: [],
          shared_with: []
        })
        .select()
        .single();

      if (error) throw error;
      return data as Resource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['resources', activeWorkspace?.id]);
      socket?.emit('resource:uploaded');
    }
  });

  /**
   * Invite team member mutation
   */
  const inviteTeamMemberMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: TeamMember['role'] }) => {
      if (!activeWorkspace?.id) throw new Error('No active workspace');

      // Send invitation email
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          workspace_id: activeWorkspace.id,
          email,
          role,
          invited_by: user?.id
        }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['team-members', activeWorkspace?.id]);
    }
  });

  /**
   * Handle file upload
   */
  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        await uploadResourceMutation.mutateAsync(file);
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    }
  }, [uploadResourceMutation]);

  /**
   * Handle drag and drop
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  /**
   * Format activity message
   */
  const formatActivityMessage = useCallback((activity: Activity): string => {
    const { action, target_type, metadata } = activity;
    const userName = activity.user.full_name;

    switch (action) {
      case 'created':
        return `${userName} created ${target_type} "${metadata.name}"`;
      case 'updated':
        return `${userName} updated ${target_type} "${metadata.name}"`;
      case 'deleted':
        return `${userName} deleted ${target_type} "${metadata.name}"`;
      case 'joined':
        return `${userName} joined the workspace`;
      case 'invited':
        return `${userName} invited ${metadata.email} to the workspace`;
      default:
        return `${userName} performed ${action} on ${target_type}`;
    }
  }, []);

  /**
   * Filter projects based on search and filters
   */
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterOptions.status === 'all' || project.status === filterOptions.status;
    const matchesPriority = filterOptions.priority === 'all' || project.priority === filterOptions.priority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  /**
   * Get status color
   */
  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'on_hold': return 'text-yellow-600 bg-yellow-100';
      case 'todo': return 'text-gray-600 bg-gray-100';
      case 'review': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }, []);

  /**
   * Get priority color
   */
  const getPriorityColor = useCallback((priority: string): string => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  }, []);

  /**
   * Render sidebar navigation
   */
  const renderSidebar = (): JSX.Element => (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">{workspace?.name}</h1>
        <p className="text-sm text-gray-600 mt-1">{workspace?.description}</p>
        <div className="flex items-center mt-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="ml-2 text-xs text-gray-600">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <button
          onClick={() => setActiveView('dashboard')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
            activeView === 'dashboard' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setActiveView('projects')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
            activeView === 'projects' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <FolderOpen className="w-5 h-5" />
          <span>Projects</span>
          <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
            {projects.length}
          </span>
        </button>

        <button
          onClick={() => setActiveView('resources')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
            activeView === 'resources' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <File className="w-5 h-5" />
          <span>Resources</span>
          <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
            {resources.length}
          </span>
        </button>

        <button
          onClick={() => setActiveView('team')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
            activeView === 'team' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Team</span>
          <span className="ml-auto bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
            {teamMembers.length}
          </span