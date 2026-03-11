'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  Brain, 
  Target, 
  Users, 
  TrendingUp, 
  Award, 
  Zap, 
  Clock,
  Star,
  ChevronRight,
  Play,
  Pause,
  RefreshCw,
  Filter,
  MapPin,
  Gift
} from 'lucide-react';

/**
 * Quest difficulty levels with numerical values for calculations
 */
enum QuestDifficulty {
  BEGINNER = 1,
  INTERMEDIATE = 2,
  ADVANCED = 3,
  EXPERT = 4,
  LEGENDARY = 5
}

/**
 * Quest categories for classification and filtering
 */
enum QuestCategory {
  EXPLORATION = 'exploration',
  CREATIVE = 'creative',
  SOCIAL = 'social',
  COMPETITIVE = 'competitive',
  LEARNING = 'learning',
  COLLABORATIVE = 'collaborative'
}

/**
 * Quest status tracking
 */
enum QuestStatus {
  AVAILABLE = 'available',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  FAILED = 'failed'
}

/**
 * Player skill assessment interface
 */
interface SkillMetrics {
  creativity: number;
  technical: number;
  social: number;
  leadership: number;
  problem_solving: number;
  collaboration: number;
  communication: number;
  adaptability: number;
}

/**
 * Player profile for quest personalization
 */
interface PlayerProfile {
  id: string;
  username: string;
  level: number;
  experience_points: number;
  skills: SkillMetrics;
  preferences: {
    categories: QuestCategory[];
    difficulty_preference: QuestDifficulty;
    solo_vs_group: number; // 0-1 scale
    time_commitment: number; // minutes per session
  };
  social_connections: string[];
  recent_activity: {
    quests_completed: number;
    success_rate: number;
    avg_completion_time: number;
    preferred_times: string[];
  };
}

/**
 * Quest reward structure
 */
interface QuestReward {
  experience_points: number;
  coins: number;
  items?: string[];
  achievements?: string[];
  skill_boosts?: Partial<SkillMetrics>;
  social_credits: number;
}

/**
 * Complete quest definition
 */
interface Quest {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  estimated_duration: number;
  max_participants: number;
  current_participants: string[];
  requirements: {
    min_level: number;
    required_skills?: Partial<SkillMetrics>;
    prerequisites?: string[];
  };
  objectives: Array<{
    id: string;
    description: string;
    progress: number;
    target: number;
    completed: boolean;
  }>;
  rewards: QuestReward;
  status: QuestStatus;
  created_at: Date;
  expires_at?: Date;
  location?: {
    virtual_space: string;
    coordinates?: { x: number; y: number; z: number };
  };
  narrative: {
    backstory: string;
    current_chapter: string;
    next_steps: string[];
  };
  personalization_score: number;
  collaboration_bonus: number;
}

/**
 * Quest template for generation
 */
interface QuestTemplate {
  id: string;
  name: string;
  category: QuestCategory;
  base_difficulty: QuestDifficulty;
  variable_parameters: string[];
  narrative_hooks: string[];
  objective_patterns: Array<{
    type: string;
    scalable: boolean;
    social_component: boolean;
  }>;
}

/**
 * AI-powered quest generation parameters
 */
interface QuestGenerationParams {
  player_profile: PlayerProfile;
  social_context: {
    online_friends: string[];
    recent_collaborators: string[];
    community_trends: string[];
  };
  current_events: {
    seasonal_themes: string[];
    platform_challenges: string[];
    community_goals: string[];
  };
  generation_constraints: {
    max_duration: number;
    difficulty_range: [QuestDifficulty, QuestDifficulty];
    exclude_categories: QuestCategory[];
    force_social: boolean;
  };
}

/**
 * Player Profile Analyzer Component
 * Analyzes player data to extract preferences and skill levels
 */
const PlayerProfileAnalyzer: React.FC<{
  profile: PlayerProfile;
  onAnalysisComplete: (analysis: any) => void;
}> = ({ profile, onAnalysisComplete }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  useEffect(() => {
    const analyzeProfile = async () => {
      setAnalyzing(true);
      try {
        // Simulate AI analysis of player profile
        const skillBalance = Object.values(profile.skills).reduce((a, b) => a + b, 0) / Object.keys(profile.skills).length;
        const socialTendency = profile.preferences.solo_vs_group;
        const experienceLevel = Math.floor(profile.level / 10);
        
        const profileAnalysis = {
          primary_strengths: Object.entries(profile.skills)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([skill]) => skill),
          growth_areas: Object.entries(profile.skills)
            .sort(([,a], [,b]) => a - b)
            .slice(0, 2)
            .map(([skill]) => skill),
          play_style: socialTendency > 0.6 ? 'collaborative' : socialTendency < 0.4 ? 'independent' : 'balanced',
          optimal_difficulty: Math.min(Math.max(1, Math.floor(skillBalance / 20)), 5) as QuestDifficulty,
          recommended_duration: profile.preferences.time_commitment,
          engagement_patterns: profile.recent_activity.preferred_times,
          motivation_factors: profile.recent_activity.success_rate > 0.8 ? ['achievement', 'mastery'] : ['exploration', 'social']
        };

        setAnalysis(profileAnalysis);
        onAnalysisComplete(profileAnalysis);
      } catch (error) {
        console.error('Profile analysis failed:', error);
      } finally {
        setAnalyzing(false);
      }
    };

    analyzeProfile();
  }, [profile, onAnalysisComplete]);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Profile Analysis</h3>
      </div>
      
      {analyzing ? (
        <div className="flex items-center gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Analyzing player profile...</span>
        </div>
      ) : analysis ? (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-400">Primary Strengths</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {analysis.primary_strengths.map((strength: string) => (
                <span key={strength} className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">
                  {strength}
                </span>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-sm text-gray-400">Play Style</label>
            <div className="mt-1 text-sm text-white">{analysis.play_style}</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400">Optimal Difficulty</label>
              <div className="flex items-center gap-1 mt-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < analysis.optimal_difficulty ? 'text-yellow-400 fill-current' : 'text-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-sm text-gray-400">Session Duration</label>
              <div className="mt-1 text-sm text-white">{analysis.recommended_duration}min</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Skill Assessment Matrix Component
 * Visual representation of player skills for quest matching
 */
const SkillAssessmentMatrix: React.FC<{
  skills: SkillMetrics;
  onSkillUpdate: (skills: SkillMetrics) => void;
}> = ({ skills, onSkillUpdate }) => {
  const skillEntries = Object.entries(skills);
  const maxSkill = Math.max(...Object.values(skills));

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Skill Assessment</h3>
      </div>
      
      <div className="space-y-3">
        {skillEntries.map(([skillName, value]) => (
          <div key={skillName} className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-300 capitalize">
                {skillName.replace('_', ' ')}
              </label>
              <span className="text-sm text-white font-mono">{value}/100</span>
            </div>
            <div className="relative">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    value === maxSkill ? 'bg-yellow-400' : 'bg-purple-500'
                  }`}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 p-3 bg-gray-700 rounded border border-gray-600">
        <div className="text-sm text-gray-300">
          <strong>Skill Balance Score:</strong> {Math.round(Object.values(skills).reduce((a, b) => a + b, 0) / Object.keys(skills).length)}/100
        </div>
      </div>
    </div>
  );
};

/**
 * Social Network Mapper Component
 * Visualizes social connections for collaborative quest generation
 */
const SocialNetworkMapper: React.FC<{
  connections: string[];
  onConnectionSelect: (connections: string[]) => void;
}> = ({ connections, onConnectionSelect }) => {
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [availableFriends] = useState<Array<{ id: string; name: string; status: string; compatibility: number }>>([
    { id: '1', name: 'AliceCreator', status: 'online', compatibility: 92 },
    { id: '2', name: 'BobBuilder', status: 'busy', compatibility: 87 },
    { id: '3', name: 'CharlieCoder', status: 'online', compatibility: 94 },
    { id: '4', name: 'DianaDesigner', status: 'away', compatibility: 89 },
    { id: '5', name: 'EvanExplorer', status: 'online', compatibility: 91 }
  ]);

  const handleConnectionToggle = (connectionId: string) => {
    const updated = selectedConnections.includes(connectionId)
      ? selectedConnections.filter(id => id !== connectionId)
      : [...selectedConnections, connectionId];
    
    setSelectedConnections(updated);
    onConnectionSelect(updated);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Social Network</h3>
        </div>
        <span className="text-sm text-gray-400">{selectedConnections.length} selected</span>
      </div>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {availableFriends.map((friend) => (
          <div
            key={friend.id}
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
              selectedConnections.includes(friend.id)
                ? 'bg-green-900 border-green-500'
                : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
            }`}
            onClick={() => handleConnectionToggle(friend.id)}
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                friend.status === 'online' ? 'bg-green-400' :
                friend.status === 'busy' ? 'bg-yellow-400' : 'bg-gray-400'
              }`} />
              <div>
                <div className="text-white font-medium">{friend.name}</div>
                <div className="text-sm text-gray-400 capitalize">{friend.status}</div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-white">{friend.compatibility}%</div>
              <div className="text-xs text-gray-400">compatibility</div>
            </div>
          </div>
        ))}
      </div>
      
      {selectedConnections.length > 0 && (
        <div className="mt-4 p-3 bg-gray-700 rounded border border-gray-600">
          <div className="text-sm text-green-400">
            ✓ Ready for collaborative quest generation
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Quest Template Library Component
 * Manages and displays available quest templates
 */
const QuestTemplateLibrary: React.FC<{
  onTemplateSelect: (template: QuestTemplate) => void;
}> = ({ onTemplateSelect }) => {
  const [templates] = useState<QuestTemplate[]>([
    {
      id: 'creative-collaboration',
      name: 'Creative Collaboration',
      category: QuestCategory.CREATIVE,
      base_difficulty: QuestDifficulty.INTERMEDIATE,
      variable_parameters: ['team_size', 'time_limit', 'theme'],
      narrative_hooks: ['mysterious artifact', 'creative challenge', 'community project'],
      objective_patterns: [
        { type: 'creation', scalable: true, social_component: true },
        { type: 'collaboration', scalable: true, social_component: true }
      ]
    },
    {
      id: 'exploration-adventure',
      name: 'Exploration Adventure',
      category: QuestCategory.EXPLORATION,
      base_difficulty: QuestDifficulty.BEGINNER,
      variable_parameters: ['world_size', 'hidden_secrets', 'discovery_rate'],
      narrative_hooks: ['uncharted territory', 'lost civilization', 'hidden treasures'],
      objective_patterns: [
        { type: 'discovery', scalable: true, social_component: false },
        { type: 'collection', scalable: true, social_component: false }
      ]
    },
    {
      id: 'competitive-challenge',
      name: 'Competitive Challenge',
      category: QuestCategory.COMPETITIVE,
      base_difficulty: QuestDifficulty.ADVANCED,
      variable_parameters: ['opponent_skill', 'match_duration', 'victory_conditions'],
      narrative_hooks: ['tournament arc', 'rival encounter', 'championship quest'],
      objective_patterns: [
        { type: 'competition', scalable: false, social_component: true },
        { type: 'achievement', scalable: true, social_component: false }
      ]
    }
  ]);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleTemplateSelect = (template: QuestTemplate) => {
    setSelectedTemplate(template.id);
    onTemplateSelect(template);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-orange-400" />
        <h3 className="text-lg font-semibold text-white">Quest Templates</h3>
      </div>
      
      <div className="grid gap-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              selectedTemplate === template.id
                ? 'bg-orange-900 border-orange-500'
                : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
            }`}
            onClick={() => handleTemplateSelect(template)}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-white font-medium">{template.name}</h4>
              <div className="flex items-center gap-1">
                {Array.from({ length: template.base_difficulty }, (_, i) => (
                  <Star key={i} className="w-3 h-3 text-yellow-400 fill-current" />
                ))}
              </div>
            </div>
            
            <div className="text-sm text-gray-300 mb-3 capitalize">
              {template.category.replace('_', ' ')} • {template.objective_patterns.length} objectives
            </div>
            
            <div className="flex flex-wrap gap-1">
              {template.variable_parameters.slice(0, 3).map((param) => (
                <span key={param} className="px-2 py-1 bg-gray-600 text-gray-300 rounded text-xs">
                  {param.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Adaptive Difficulty System Component
 * Adjusts quest difficulty based on player performance
 */
const AdaptiveDifficultySystem: React.FC<{
  playerProfile: PlayerProfile;
  onDifficultyChange: (difficulty: QuestDifficulty) => void;
}> = ({ playerProfile, onDifficultyChange }) => {
  const [currentDifficulty, setCurrentDifficulty] = useState<QuestDifficulty>(QuestDifficulty.INTERMEDIATE);
  const [adaptationReason, setAdaptationReason] = useState<string>('');

  useEffect(() => {
    // Calculate optimal difficulty based on player performance
    const successRate = playerProfile.recent_activity.success_rate;
    const averageSkill = Object.values(playerProfile.skills).reduce((a, b) => a + b, 0) / Object.keys(playerProfile.skills).length;
    
    let suggestedDifficulty = QuestDifficulty.INTERMEDIATE;
    let reason = '';
    
    if (successRate > 0.9 && averageSkill > 80) {
      suggestedDifficulty = QuestDifficulty.EXPERT;
      reason = 'High success rate and advanced skills detected';
    } else if (successRate > 0.75 && averageSkill > 60) {
      suggestedDifficulty = QuestDifficulty.ADVANCED;
      reason = 'Strong performance indicates readiness for challenge';
    } else if (successRate < 0.5 || averageSkill < 40) {
      suggestedDifficulty = QuestDifficulty.BEGINNER;
      reason = 'Scaling down to build confidence and skills';
    } else if (successRate < 0.6) {
      suggestedDifficulty = QuestDifficulty.INTERMEDIATE;
      reason = 'Maintaining current level for skill development';
    }
    
    setCurrentDifficulty(suggestedDifficulty);
    setAdaptationReason(reason);
    onDifficultyChange(suggestedDifficulty);
  }, [playerProfile, onDifficultyChange]);

  const difficultyLabels = {
    [QuestDifficulty.BEGINNER]: 'Beginner',
    [QuestDifficulty.INTERMEDIATE]: 'Intermediate',
    [QuestDifficulty.ADVANCED]: 'Advanced',
    [QuestDifficulty.EXPERT]: 'Expert',
    [QuestDifficulty.LEGENDARY]: 'Legendary'
  };

  const difficultyColors = {
    [QuestDifficulty.BEGINNER]: 'text-green-400',
    [QuestDifficulty.INTERMEDIATE]: 'text-yellow-400',
    [QuestDifficulty.ADVANCED]: 'text-orange-400',
    [QuestDifficulty.EXPERT]: 'text-red-400',
    [QuestDifficulty.LEGENDARY]: 'text-purple-400'
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-yellow-400" />
        <h3 className="text-lg font-semibold text-white">Adaptive Difficulty</h3>
      </div>
      
      <div className="space-y-4">
        <div className="text-center">
          <div className={`text-2xl font-bold mb-2 ${difficultyColors[currentDifficulty]}`}>
            {difficultyLabels[currentDifficulty]}
          </div>
          <div className="flex justify-center mb-2">