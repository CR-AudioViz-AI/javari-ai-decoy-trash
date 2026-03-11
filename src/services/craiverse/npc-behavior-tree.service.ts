```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

/**
 * Behavior tree node execution results
 */
export enum BehaviorStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  RUNNING = 'RUNNING'
}

/**
 * Base behavior tree node interface
 */
export interface IBehaviorTreeNode {
  id: string;
  type: string;
  tick(context: NPCContext): Promise<BehaviorStatus>;
  reset(): void;
  getChildren(): IBehaviorTreeNode[];
  addChild(node: IBehaviorTreeNode): void;
  removeChild(nodeId: string): void;
}

/**
 * NPC execution context
 */
export interface NPCContext {
  npcId: string;
  position: { x: number; y: number; z: number };
  health: number;
  energy: number;
  mood: string;
  memory: NPCMemory;
  worldState: WorldState;
  deltaTime: number;
  blackboard: Map<string, any>;
}

/**
 * NPC memory system interface
 */
export interface NPCMemory {
  shortTerm: Map<string, MemoryItem>;
  longTerm: Map<string, MemoryItem>;
  relationships: Map<string, RelationshipData>;
  addMemory(key: string, value: any, importance: number, type: 'short' | 'long'): void;
  getMemory(key: string): MemoryItem | null;
  forgetMemory(key: string): void;
  decay(deltaTime: number): void;
}

/**
 * Memory item structure
 */
export interface MemoryItem {
  value: any;
  timestamp: number;
  importance: number;
  decayRate: number;
  strength: number;
}

/**
 * Relationship data between NPCs
 */
export interface RelationshipData {
  npcId: string;
  affection: number;
  trust: number;
  respect: number;
  lastInteraction: number;
  sharedMemories: string[];
}

/**
 * World state snapshot
 */
export interface WorldState {
  nearbyNPCs: Array<{ id: string; position: { x: number; y: number; z: number }; state: string }>;
  nearbyObjects: Array<{ id: string; type: string; position: { x: number; y: number; z: number } }>;
  currentEvents: StoryEvent[];
  environmentData: Record<string, any>;
}

/**
 * Story event structure
 */
export interface StoryEvent {
  id: string;
  type: string;
  participants: string[];
  location: { x: number; y: number; z: number };
  timestamp: number;
  importance: number;
  narrative: string;
  outcomes: string[];
}

/**
 * Behavior tree configuration
 */
export interface BehaviorTreeConfig {
  id: string;
  npcId: string;
  name: string;
  rootNode: BehaviorNodeConfig;
  priority: number;
  conditions: string[];
  metadata: Record<string, any>;
}

/**
 * Behavior node configuration
 */
export interface BehaviorNodeConfig {
  id: string;
  type: string;
  parameters: Record<string, any>;
  children: BehaviorNodeConfig[];
}

/**
 * Emergent storyline data
 */
export interface EmergentStoryline {
  id: string;
  title: string;
  participants: string[];
  events: StoryEvent[];
  startTime: number;
  endTime?: number;
  importance: number;
  themes: string[];
  outcomes: string[];
  isActive: boolean;
}

/**
 * Abstract base class for behavior tree nodes
 */
abstract class BehaviorTreeNode implements IBehaviorTreeNode {
  public id: string;
  public type: string;
  protected children: IBehaviorTreeNode[] = [];
  protected isRunning = false;

  constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  abstract tick(context: NPCContext): Promise<BehaviorStatus>;

  reset(): void {
    this.isRunning = false;
    this.children.forEach(child => child.reset());
  }

  getChildren(): IBehaviorTreeNode[] {
    return [...this.children];
  }

  addChild(node: IBehaviorTreeNode): void {
    this.children.push(node);
  }

  removeChild(nodeId: string): void {
    this.children = this.children.filter(child => child.id !== nodeId);
  }
}

/**
 * Sequence composite node - executes children in order until one fails
 */
class SequenceNode extends BehaviorTreeNode {
  private currentChildIndex = 0;

  constructor(id: string) {
    super(id, 'Sequence');
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    while (this.currentChildIndex < this.children.length) {
      const child = this.children[this.currentChildIndex];
      const status = await child.tick(context);

      if (status === BehaviorStatus.FAILURE) {
        this.reset();
        return BehaviorStatus.FAILURE;
      }

      if (status === BehaviorStatus.RUNNING) {
        return BehaviorStatus.RUNNING;
      }

      this.currentChildIndex++;
    }

    this.reset();
    return BehaviorStatus.SUCCESS;
  }

  reset(): void {
    super.reset();
    this.currentChildIndex = 0;
  }
}

/**
 * Selector composite node - executes children until one succeeds
 */
class SelectorNode extends BehaviorTreeNode {
  private currentChildIndex = 0;

  constructor(id: string) {
    super(id, 'Selector');
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    while (this.currentChildIndex < this.children.length) {
      const child = this.children[this.currentChildIndex];
      const status = await child.tick(context);

      if (status === BehaviorStatus.SUCCESS) {
        this.reset();
        return BehaviorStatus.SUCCESS;
      }

      if (status === BehaviorStatus.RUNNING) {
        return BehaviorStatus.RUNNING;
      }

      this.currentChildIndex++;
    }

    this.reset();
    return BehaviorStatus.FAILURE;
  }

  reset(): void {
    super.reset();
    this.currentChildIndex = 0;
  }
}

/**
 * Parallel composite node - executes all children simultaneously
 */
class ParallelNode extends BehaviorTreeNode {
  private requiredSuccesses: number;
  private requiredFailures: number;

  constructor(id: string, requiredSuccesses = 1, requiredFailures = 1) {
    super(id, 'Parallel');
    this.requiredSuccesses = requiredSuccesses;
    this.requiredFailures = requiredFailures;
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    const results = await Promise.all(
      this.children.map(child => child.tick(context))
    );

    const successes = results.filter(status => status === BehaviorStatus.SUCCESS).length;
    const failures = results.filter(status => status === BehaviorStatus.FAILURE).length;
    const running = results.filter(status => status === BehaviorStatus.RUNNING).length;

    if (successes >= this.requiredSuccesses) {
      return BehaviorStatus.SUCCESS;
    }

    if (failures >= this.requiredFailures) {
      return BehaviorStatus.FAILURE;
    }

    return BehaviorStatus.RUNNING;
  }
}

/**
 * Repeater decorator node
 */
class RepeaterNode extends BehaviorTreeNode {
  private maxRepeats: number;
  private currentRepeats = 0;

  constructor(id: string, maxRepeats = -1) {
    super(id, 'Repeater');
    this.maxRepeats = maxRepeats;
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    if (this.children.length !== 1) {
      return BehaviorStatus.FAILURE;
    }

    const child = this.children[0];
    const status = await child.tick(context);

    if (status === BehaviorStatus.RUNNING) {
      return BehaviorStatus.RUNNING;
    }

    this.currentRepeats++;

    if (this.maxRepeats > 0 && this.currentRepeats >= this.maxRepeats) {
      this.reset();
      return BehaviorStatus.SUCCESS;
    }

    child.reset();
    return BehaviorStatus.RUNNING;
  }

  reset(): void {
    super.reset();
    this.currentRepeats = 0;
  }
}

/**
 * Cooldown decorator node
 */
class CooldownNode extends BehaviorTreeNode {
  private cooldownTime: number;
  private lastExecutionTime = 0;

  constructor(id: string, cooldownTime: number) {
    super(id, 'Cooldown');
    this.cooldownTime = cooldownTime;
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    if (this.children.length !== 1) {
      return BehaviorStatus.FAILURE;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastExecutionTime < this.cooldownTime) {
      return BehaviorStatus.FAILURE;
    }

    const child = this.children[0];
    const status = await child.tick(context);

    if (status !== BehaviorStatus.RUNNING) {
      this.lastExecutionTime = currentTime;
    }

    return status;
  }
}

/**
 * Move action node
 */
class MoveActionNode extends BehaviorTreeNode {
  private targetPosition: { x: number; y: number; z: number };
  private speed: number;

  constructor(id: string, targetPosition: { x: number; y: number; z: number }, speed = 1.0) {
    super(id, 'MoveAction');
    this.targetPosition = targetPosition;
    this.speed = speed;
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    const distance = this.calculateDistance(context.position, this.targetPosition);
    
    if (distance < 0.1) {
      return BehaviorStatus.SUCCESS;
    }

    // Move towards target
    const direction = this.normalize({
      x: this.targetPosition.x - context.position.x,
      y: this.targetPosition.y - context.position.y,
      z: this.targetPosition.z - context.position.z
    });

    const moveDistance = this.speed * context.deltaTime;
    context.position.x += direction.x * moveDistance;
    context.position.y += direction.y * moveDistance;
    context.position.z += direction.z * moveDistance;

    return BehaviorStatus.RUNNING;
  }

  private calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private normalize(vector: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    if (magnitude === 0) return { x: 0, y: 0, z: 0 };
    return {
      x: vector.x / magnitude,
      y: vector.y / magnitude,
      z: vector.z / magnitude
    };
  }
}

/**
 * Distance condition node
 */
class DistanceConditionNode extends BehaviorTreeNode {
  private targetId: string;
  private maxDistance: number;

  constructor(id: string, targetId: string, maxDistance: number) {
    super(id, 'DistanceCondition');
    this.targetId = targetId;
    this.maxDistance = maxDistance;
  }

  async tick(context: NPCContext): Promise<BehaviorStatus> {
    const target = context.worldState.nearbyNPCs.find(npc => npc.id === this.targetId);
    
    if (!target) {
      return BehaviorStatus.FAILURE;
    }

    const distance = this.calculateDistance(context.position, target.position);
    return distance <= this.maxDistance ? BehaviorStatus.SUCCESS : BehaviorStatus.FAILURE;
  }

  private calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * NPC Memory System implementation
 */
class NPCMemorySystem implements NPCMemory {
  public shortTerm = new Map<string, MemoryItem>();
  public longTerm = new Map<string, MemoryItem>();
  public relationships = new Map<string, RelationshipData>();

  addMemory(key: string, value: any, importance: number, type: 'short' | 'long'): void {
    const memory: MemoryItem = {
      value,
      timestamp: Date.now(),
      importance,
      decayRate: type === 'short' ? 0.1 : 0.01,
      strength: 1.0
    };

    if (type === 'short') {
      this.shortTerm.set(key, memory);
    } else {
      this.longTerm.set(key, memory);
    }
  }

  getMemory(key: string): MemoryItem | null {
    return this.shortTerm.get(key) || this.longTerm.get(key) || null;
  }

  forgetMemory(key: string): void {
    this.shortTerm.delete(key);
    this.longTerm.delete(key);
  }

  decay(deltaTime: number): void {
    this.decayMemoryMap(this.shortTerm, deltaTime);
    this.decayMemoryMap(this.longTerm, deltaTime);
  }

  private decayMemoryMap(memoryMap: Map<string, MemoryItem>, deltaTime: number): void {
    const keysToRemove: string[] = [];

    for (const [key, memory] of memoryMap.entries()) {
      memory.strength -= memory.decayRate * deltaTime;
      
      if (memory.strength <= 0) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => memoryMap.delete(key));
  }
}

/**
 * Behavior Tree Builder for dynamic construction
 */
class BehaviorTreeBuilder {
  private nodeFactories = new Map<string, (id: string, params: any) => IBehaviorTreeNode>();

  constructor() {
    this.registerDefaultNodes();
  }

  private registerDefaultNodes(): void {
    this.nodeFactories.set('Sequence', (id: string) => new SequenceNode(id));
    this.nodeFactories.set('Selector', (id: string) => new SelectorNode(id));
    this.nodeFactories.set('Parallel', (id: string, params: any) => 
      new ParallelNode(id, params.requiredSuccesses, params.requiredFailures));
    this.nodeFactories.set('Repeater', (id: string, params: any) => 
      new RepeaterNode(id, params.maxRepeats));
    this.nodeFactories.set('Cooldown', (id: string, params: any) => 
      new CooldownNode(id, params.cooldownTime));
    this.nodeFactories.set('MoveAction', (id: string, params: any) => 
      new MoveActionNode(id, params.targetPosition, params.speed));
    this.nodeFactories.set('DistanceCondition', (id: string, params: any) => 
      new DistanceConditionNode(id, params.targetId, params.maxDistance));
  }

  buildFromConfig(config: BehaviorNodeConfig): IBehaviorTreeNode {
    const factory = this.nodeFactories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown node type: ${config.type}`);
    }

    const node = factory(config.id, config.parameters);

    config.children.forEach(childConfig => {
      const childNode = this.buildFromConfig(childConfig);
      node.addChild(childNode);
    });

    return node;
  }

  registerNodeType(type: string, factory: (id: string, params: any) => IBehaviorTreeNode): void {
    this.nodeFactories.set(type, factory);
  }
}

/**
 * Emergent Storyline Tracker
 */
class EmergentStorylineTracker extends EventEmitter {
  private activeStorylines = new Map<string, EmergentStoryline>();
  private storyPatterns = new Map<string, (events: StoryEvent[]) => boolean>();

  constructor() {
    super();
    this.registerDefaultPatterns();
  }

  private registerDefaultPatterns(): void {
    // Romance pattern
    this.storyPatterns.set('romance', (events: StoryEvent[]) => {
      const interactions = events.filter(e => e.type === 'interaction');
      const participants = new Set();
      
      interactions.forEach(e => e.participants.forEach(p => participants.add(p)));
      
      return participants.size === 2 && interactions.length >= 3;
    });

    // Conflict pattern
    this.storyPatterns.set('conflict', (events: StoryEvent[]) => {
      return events.some(e => e.type === 'argument' || e.type === 'fight');
    });

    // Discovery pattern
    this.storyPatterns.set('discovery', (events: StoryEvent[]) => {
      return events.some(e => e.type === 'discovery' && e.importance > 0.7);
    });
  }

  analyzeEvents(events: StoryEvent[]): EmergentStoryline[] {
    const newStorylines: EmergentStoryline[] = [];

    for (const [patternName, pattern] of this.storyPatterns.entries()) {
      if (pattern(events)) {
        const participants = [...new Set(events.flatMap(e => e.participants))];
        const storyline: EmergentStoryline = {
          id: `${patternName}_${Date.now()}`,
          title: this.generateStorylineTitle(patternName, participants),
          participants,
          events: events.slice(),
          startTime: Math.min(...events.map(e => e.timestamp)),
          importance: Math.max(...events.map(e => e.importance)),
          themes: [patternName],
          outcomes: [],
          isActive: true
        };

        newStorylines.push(storyline);
        this.activeStorylines.set(storyline.id, storyline);
        this.emit('storylineEmergent', storyline);
      }
    }

    return newStorylines;
  }

  private generateStorylineTitle(pattern: string, participants: string[]): string {
    const participantNames = participants.slice(0, 2).join(' and ');
    
    switch (pattern) {
      case 'romance':
        return `A budding romance between ${participantNames}`;
      case 'conflict':
        return `Tensions rise between ${participantNames}`;
      case 'discovery':
        return `${participantNames} make an important discovery`;
      default:
        return `An emerging story involving ${participantNames}`;
    }
  }

  getActiveStorylines(): EmergentStoryline[] {
    return Array.from(this.activeStorylines.values()).filter(s => s.isActive);
  }

  closeStoryline(storylineId: string, outcomes: string[]): void {
    const storyline = this.activeStorylines.get(storylineId);
    if (storyline) {
      storyline.isActive = false;
      storyline.endTime = Date.now();
      storyline.outcomes = outcomes;
      this.emit('storylineCompleted', storyline);
    }
  }
}

/**
 * Main NPC Behavior Tree Service
 */
export class NPCBehaviorTreeService extends EventEmitter {
  private supabase: SupabaseClient;
  private openai: OpenAI;
  private behaviorTreeBuilder: BehaviorTreeBuilder;
  private emergentTracker: EmergentStorylineTracker;
  private npcTrees = new Map<string, IBehaviorTreeNode>();
  private npcMemories = new Map<string, NPCMemorySystem>();
  private npcContexts = new Map<string, NPCContext>();
  private executionInterval: NodeJS.Timeout | null = null;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    openaiApiKey: string
  ) {
    super();
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.behaviorTreeBuilder = new BehaviorTreeBuilder();
    this.emergentTracker = new EmergentStorylineTracker();

    this.setupEventListeners();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      await this.loadBehaviorTrees();
      await this.loadNPCStates();
      await this.setupRealtimeSubscriptions();
      
      this.startExecutionLoop();
      
      this.emit('initialized');
    } catch (error) {
      this.emit('error', { operation: 'initialize', error });
      throw error;
    }
  }

  /**
   * Create a new behavior tree for an NPC
   */
  async createBehaviorTree(config: BehaviorTreeConfig): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('npc_behavior_trees')
        .insert({
          id: config.id,
          npc_id: config.npcId,
          name: config.name,
          root_node: config.rootNode,
          priority: config.priority,
          conditions: config.conditions,
          metadata: config.metadata,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      const tree = this.behaviorTreeBuilder.buildFromConfig(config.rootNode);
      this.npcTrees.set(config.npcId, tree);

      this.emit('behaviorTreeCreated', { npcId: config.npcId, treeId: config.id });
    } catch