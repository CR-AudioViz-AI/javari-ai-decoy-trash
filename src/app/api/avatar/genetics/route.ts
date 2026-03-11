```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { randomBytes, createHash } from 'crypto';

// Environment validation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);

// Validation schemas
const CreateGeneticsSchema = z.object({
  avatarId: z.string().uuid(),
  parentGenetics: z.array(z.string().uuid()).optional(),
  environmentalFactors: z.record(z.number()).optional(),
  initialTraits: z.record(z.any()).optional()
});

const EvolutionTriggerSchema = z.object({
  avatarId: z.string().uuid(),
  interactionType: z.enum(['social', 'environmental', 'challenge', 'time']),
  intensity: z.number().min(0).max(1),
  context: z.record(z.any()).optional()
});

const BreedingSchema = z.object({
  parent1Id: z.string().uuid(),
  parent2Id: z.string().uuid(),
  environmentalContext: z.record(z.number()).optional()
});

// Trait definitions
interface Trait {
  id: string;
  name: string;
  type: 'dominant' | 'recessive' | 'codominant' | 'polygenic';
  category: 'physical' | 'behavioral' | 'cognitive' | 'special';
  dominance: number;
  mutationRate: number;
  environmentalSensitivity: number;
  expressionRules: Record<string, any>;
}

interface GeneticProfile {
  id: string;
  avatarId: string;
  generation: number;
  chromosomes: string[];
  expressedTraits: Record<string, any>;
  dormantTraits: Record<string, any>;
  mutationHistory: MutationEvent[];
  evolutionPoints: number;
  environmentalAdaptations: Record<string, number>;
  parentage: string[];
  createdAt: Date;
  lastEvolution: Date;
}

interface MutationEvent {
  id: string;
  timestamp: Date;
  type: 'random' | 'environmental' | 'interaction';
  affectedTraits: string[];
  intensity: number;
  cause: string;
}

// Genetics Engine
class GeneticsEngine {
  private traitDefinitions: Map<string, Trait> = new Map();

  constructor() {
    this.initializeTraitDefinitions();
  }

  private initializeTraitDefinitions() {
    // Base trait definitions
    const baseTraits: Trait[] = [
      {
        id: 'eye_color',
        name: 'Eye Color',
        type: 'codominant',
        category: 'physical',
        dominance: 0.5,
        mutationRate: 0.001,
        environmentalSensitivity: 0.1,
        expressionRules: {
          alleles: ['brown', 'blue', 'green', 'hazel'],
          expression: 'blend'
        }
      },
      {
        id: 'creativity',
        name: 'Creativity Level',
        type: 'polygenic',
        category: 'cognitive',
        dominance: 0.3,
        mutationRate: 0.005,
        environmentalSensitivity: 0.8,
        expressionRules: {
          range: [0, 100],
          genes: ['CREA1', 'CREA2', 'CREA3'],
          environmental_boost: 0.3
        }
      },
      {
        id: 'social_tendency',
        name: 'Social Tendency',
        type: 'dominant',
        category: 'behavioral',
        dominance: 0.7,
        mutationRate: 0.003,
        environmentalSensitivity: 0.6,
        expressionRules: {
          dominant_allele: 'extroverted',
          recessive_allele: 'introverted'
        }
      }
    ];

    baseTraits.forEach(trait => {
      this.traitDefinitions.set(trait.id, trait);
    });
  }

  generateInitialGenetics(
    avatarId: string,
    parentGenetics?: GeneticProfile[],
    environmentalFactors: Record<string, number> = {}
  ): GeneticProfile {
    const generation = parentGenetics ? Math.max(...parentGenetics.map(p => p.generation)) + 1 : 0;
    
    const chromosomes = this.generateChromosomes(parentGenetics);
    const expressedTraits = this.calculateExpressedTraits(chromosomes, environmentalFactors);
    const dormantTraits = this.calculateDormantTraits(chromosomes);

    return {
      id: this.generateGeneticId(),
      avatarId,
      generation,
      chromosomes,
      expressedTraits,
      dormantTraits,
      mutationHistory: [],
      evolutionPoints: 0,
      environmentalAdaptations: { ...environmentalFactors },
      parentage: parentGenetics?.map(p => p.id) || [],
      createdAt: new Date(),
      lastEvolution: new Date()
    };
  }

  private generateChromosomes(parentGenetics?: GeneticProfile[]): string[] {
    if (!parentGenetics || parentGenetics.length === 0) {
      // Generate random initial chromosomes
      return Array.from({ length: 23 }, () => this.generateRandomChromosome());
    }

    // Inherit from parents with genetic recombination
    const chromosomes: string[] = [];
    for (let i = 0; i < 23; i++) {
      const parent1Chromosome = parentGenetics[0].chromosomes[i];
      const parent2Chromosome = parentGenetics[1]?.chromosomes[i] || parent1Chromosome;
      
      chromosomes.push(this.recombineChromosomes(parent1Chromosome, parent2Chromosome));
    }

    return chromosomes;
  }

  private generateRandomChromosome(): string {
    return randomBytes(32).toString('hex');
  }

  private recombineChromosomes(chr1: string, chr2: string): string {
    // Simulate genetic crossover
    const crossoverPoint = Math.floor(Math.random() * Math.min(chr1.length, chr2.length));
    return chr1.slice(0, crossoverPoint) + chr2.slice(crossoverPoint);
  }

  private calculateExpressedTraits(
    chromosomes: string[],
    environmentalFactors: Record<string, number>
  ): Record<string, any> {
    const expressed: Record<string, any> = {};

    for (const [traitId, trait] of this.traitDefinitions) {
      const geneticValue = this.extractTraitFromChromosomes(chromosomes, traitId);
      const environmentalModifier = environmentalFactors[traitId] || 0;
      
      expressed[traitId] = this.calculateTraitExpression(
        trait,
        geneticValue,
        environmentalModifier
      );
    }

    return expressed;
  }

  private calculateDormantTraits(chromosomes: string[]): Record<string, any> {
    const dormant: Record<string, any> = {};

    for (const [traitId] of this.traitDefinitions) {
      const allPossibleValues = this.extractAllTraitPossibilities(chromosomes, traitId);
      dormant[traitId] = allPossibleValues;
    }

    return dormant;
  }

  private extractTraitFromChromosomes(chromosomes: string[], traitId: string): number {
    const hash = createHash('sha256').update(chromosomes.join('') + traitId).digest('hex');
    return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  }

  private extractAllTraitPossibilities(chromosomes: string[], traitId: string): any[] {
    // Extract all possible trait expressions from genetic material
    return chromosomes.map(chr => {
      const hash = createHash('sha256').update(chr + traitId).digest('hex');
      return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
    });
  }

  private calculateTraitExpression(
    trait: Trait,
    geneticValue: number,
    environmentalModifier: number
  ): any {
    const baseExpression = geneticValue;
    const environmentalInfluence = environmentalModifier * trait.environmentalSensitivity;
    
    switch (trait.type) {
      case 'dominant':
        return baseExpression > 0.5 ? 
          trait.expressionRules.dominant_allele : 
          trait.expressionRules.recessive_allele;
      
      case 'polygenic':
        const scaledValue = (baseExpression + environmentalInfluence) * trait.expressionRules.range[1];
        return Math.max(trait.expressionRules.range[0], Math.min(trait.expressionRules.range[1], scaledValue));
      
      case 'codominant':
        const alleles = trait.expressionRules.alleles;
        const index = Math.floor((baseExpression + environmentalInfluence) * alleles.length);
        return alleles[Math.min(index, alleles.length - 1)];
      
      default:
        return baseExpression + environmentalInfluence;
    }
  }

  private generateGeneticId(): string {
    return randomBytes(16).toString('hex');
  }
}

// Evolution Processor
class EvolutionProcessor {
  private geneticsEngine: GeneticsEngine;

  constructor(geneticsEngine: GeneticsEngine) {
    this.geneticsEngine = geneticsEngine;
  }

  processEvolution(
    currentGenetics: GeneticProfile,
    trigger: { type: string; intensity: number; context?: Record<string, any> }
  ): GeneticProfile {
    const mutationEvents = this.calculateMutations(currentGenetics, trigger);
    const updatedChromosomes = this.applyMutations(currentGenetics.chromosomes, mutationEvents);
    
    const environmentalFactors = {
      ...currentGenetics.environmentalAdaptations,
      ...this.deriveEnvironmentalFactors(trigger.context || {})
    };

    const newExpressedTraits = this.geneticsEngine['calculateExpressedTraits'](
      updatedChromosomes,
      environmentalFactors
    );

    return {
      ...currentGenetics,
      chromosomes: updatedChromosomes,
      expressedTraits: newExpressedTraits,
      mutationHistory: [...currentGenetics.mutationHistory, ...mutationEvents],
      evolutionPoints: currentGenetics.evolutionPoints + Math.floor(trigger.intensity * 10),
      environmentalAdaptations: environmentalFactors,
      lastEvolution: new Date()
    };
  }

  private calculateMutations(
    genetics: GeneticProfile,
    trigger: { type: string; intensity: number }
  ): MutationEvent[] {
    const mutations: MutationEvent[] = [];
    const baseMutationRate = 0.001;
    const mutationChance = baseMutationRate * trigger.intensity * 10;

    if (Math.random() < mutationChance) {
      mutations.push({
        id: randomBytes(8).toString('hex'),
        timestamp: new Date(),
        type: trigger.type as any,
        affectedTraits: this.selectTraitsForMutation(),
        intensity: trigger.intensity,
        cause: `Evolution triggered by ${trigger.type}`
      });
    }

    return mutations;
  }

  private selectTraitsForMutation(): string[] {
    const allTraits = ['eye_color', 'creativity', 'social_tendency'];
    const numTraits = Math.floor(Math.random() * 2) + 1;
    return allTraits.sort(() => 0.5 - Math.random()).slice(0, numTraits);
  }

  private applyMutations(chromosomes: string[], mutations: MutationEvent[]): string[] {
    let mutatedChromosomes = [...chromosomes];

    for (const mutation of mutations) {
      const chromosomeIndex = Math.floor(Math.random() * mutatedChromosomes.length);
      mutatedChromosomes[chromosomeIndex] = this.mutateChromosome(
        mutatedChromosomes[chromosomeIndex],
        mutation.intensity
      );
    }

    return mutatedChromosomes;
  }

  private mutateChromosome(chromosome: string, intensity: number): string {
    const mutationPoints = Math.floor(intensity * 5);
    let mutated = chromosome;

    for (let i = 0; i < mutationPoints; i++) {
      const position = Math.floor(Math.random() * mutated.length);
      const newChar = Math.floor(Math.random() * 16).toString(16);
      mutated = mutated.slice(0, position) + newChar + mutated.slice(position + 1);
    }

    return mutated;
  }

  private deriveEnvironmentalFactors(context: Record<string, any>): Record<string, number> {
    const factors: Record<string, number> = {};

    // Extract environmental influences from context
    if (context.social_interactions) {
      factors.social_tendency = Math.min(context.social_interactions * 0.1, 0.5);
    }
    
    if (context.creative_challenges) {
      factors.creativity = Math.min(context.creative_challenges * 0.15, 0.7);
    }

    return factors;
  }
}

// Database operations
class GeneticDatabase {
  async saveGenetics(genetics: GeneticProfile): Promise<void> {
    const { error } = await supabase
      .from('avatar_genetics')
      .upsert({
        id: genetics.id,
        avatar_id: genetics.avatarId,
        generation: genetics.generation,
        chromosomes: genetics.chromosomes,
        expressed_traits: genetics.expressedTraits,
        dormant_traits: genetics.dormantTraits,
        mutation_history: genetics.mutationHistory,
        evolution_points: genetics.evolutionPoints,
        environmental_adaptations: genetics.environmentalAdaptations,
        parentage: genetics.parentage,
        created_at: genetics.createdAt.toISOString(),
        last_evolution: genetics.lastEvolution.toISOString()
      });

    if (error) {
      throw new Error(`Failed to save genetics: ${error.message}`);
    }
  }

  async getGenetics(avatarId: string): Promise<GeneticProfile | null> {
    const { data, error } = await supabase
      .from('avatar_genetics')
      .select('*')
      .eq('avatar_id', avatarId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch genetics: ${error.message}`);
    }

    if (!data) return null;

    return {
      id: data.id,
      avatarId: data.avatar_id,
      generation: data.generation,
      chromosomes: data.chromosomes,
      expressedTraits: data.expressed_traits,
      dormantTraits: data.dormant_traits,
      mutationHistory: data.mutation_history,
      evolutionPoints: data.evolution_points,
      environmentalAdaptations: data.environmental_adaptations,
      parentage: data.parentage,
      createdAt: new Date(data.created_at),
      lastEvolution: new Date(data.last_evolution)
    };
  }

  async getMultipleGenetics(avatarIds: string[]): Promise<GeneticProfile[]> {
    const { data, error } = await supabase
      .from('avatar_genetics')
      .select('*')
      .in('avatar_id', avatarIds);

    if (error) {
      throw new Error(`Failed to fetch multiple genetics: ${error.message}`);
    }

    return data.map(row => ({
      id: row.id,
      avatarId: row.avatar_id,
      generation: row.generation,
      chromosomes: row.chromosomes,
      expressedTraits: row.expressed_traits,
      dormantTraits: row.dormant_traits,
      mutationHistory: row.mutation_history,
      evolutionPoints: row.evolution_points,
      environmentalAdaptations: row.environmental_adaptations,
      parentage: row.parentage,
      createdAt: new Date(row.created_at),
      lastEvolution: new Date(row.last_evolution)
    }));
  }
}

// Initialize services
const geneticsEngine = new GeneticsEngine();
const evolutionProcessor = new EvolutionProcessor(geneticsEngine);
const geneticsDatabase = new GeneticDatabase();

// API Routes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateGeneticsSchema.parse(body);

    // Check if genetics already exist
    const existingGenetics = await geneticsDatabase.getGenetics(validatedData.avatarId);
    if (existingGenetics) {
      return NextResponse.json(
        { error: 'Genetics already exist for this avatar' },
        { status: 409 }
      );
    }

    // Get parent genetics if specified
    let parentGenetics: GeneticProfile[] | undefined;
    if (validatedData.parentGenetics && validatedData.parentGenetics.length > 0) {
      const parentData = await geneticsDatabase.getMultipleGenetics(validatedData.parentGenetics);
      parentGenetics = parentData;
    }

    // Generate initial genetics
    const newGenetics = geneticsEngine.generateInitialGenetics(
      validatedData.avatarId,
      parentGenetics,
      validatedData.environmentalFactors
    );

    // Apply initial traits if provided
    if (validatedData.initialTraits) {
      newGenetics.expressedTraits = {
        ...newGenetics.expressedTraits,
        ...validatedData.initialTraits
      };
    }

    // Save to database
    await geneticsDatabase.saveGenetics(newGenetics);

    // Cache for quick access
    await redis.setex(
      `genetics:${validatedData.avatarId}`,
      3600,
      JSON.stringify(newGenetics)
    );

    return NextResponse.json({
      success: true,
      genetics: newGenetics
    });

  } catch (error) {
    console.error('Error creating genetics:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const avatarId = searchParams.get('avatarId');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    if (!avatarId) {
      return NextResponse.json(
        { error: 'Avatar ID is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cachedGenetics = await redis.get(`genetics:${avatarId}`);
    if (cachedGenetics) {
      const genetics = JSON.parse(cachedGenetics);
      return NextResponse.json({
        success: true,
        genetics: includeHistory ? genetics : {
          ...genetics,
          mutationHistory: genetics.mutationHistory.slice(-5) // Last 5 mutations only
        }
      });
    }

    // Fetch from database
    const genetics = await geneticsDatabase.getGenetics(avatarId);
    
    if (!genetics) {
      return NextResponse.json(
        { error: 'Genetics not found for avatar' },
        { status: 404 }
      );
    }

    // Cache the result
    await redis.setex(
      `genetics:${avatarId}`,
      3600,
      JSON.stringify(genetics)
    );

    return NextResponse.json({
      success: true,
      genetics: includeHistory ? genetics : {
        ...genetics,
        mutationHistory: genetics.mutationHistory.slice(-5)
      }
    });

  } catch (error) {
    console.error('Error fetching genetics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'evolve') {
      const validatedData = EvolutionTriggerSchema.parse(body);

      // Get current genetics
      const currentGenetics = await geneticsDatabase.getGenetics(validatedData.avatarId);
      if (!currentGenetics) {
        return NextResponse.json(
          { error: 'Avatar genetics not found' },
          { status: 404 }
        );
      }

      // Process evolution
      const evolvedGenetics = evolutionProcessor.processEvolution(currentGenetics, {
        type: validatedData.interactionType,
        intensity: validatedData.intensity,
        context: validatedData.context
      });

      // Save evolved genetics
      await geneticsDatabase.saveGenetics(evolvedGenetics);

      // Update cache
      await redis.setex(
        `genetics:${validatedData.avatarId}`,
        3600,
        JSON.stringify(evolvedGenetics)
      );

      return NextResponse.json({
        success: true,
        genetics: evolvedGenetics,
        evolutionDelta: {
          pointsGained: evolvedGenetics.evolutionPoints - currentGenetics.evolutionPoints,
          newMutations: evolvedGenetics.mutationHistory.length - currentGenetics.mutationHistory.length,
          traitChanges: this.calculateTraitChanges(currentGenetics.expressedTraits, evolvedGenetics.expressedTraits)
        }
      });

    } else if (action === 'breed') {
      const validatedData = BreedingSchema.parse(body);

      // Get parent genetics
      const parentGenetics = await geneticsDatabase.getMultipleGenetics([
        validatedData.parent1Id,
        validatedData.parent2Id
      ]);

      if (parentGenetics.length !== 2) {
        return NextResponse.json(
          { error: 'Both parent genetics must exist' },
          { status: 400 }
        );
      }

      // Generate offspring genetics profile (for preview)
      const offspringPreview = geneticsEngine.generateInitialGenetics(
        'preview-' + randomBytes(8).toString('hex'),
        parentGenetics,
        validatedData.environmentalContext
      );

      return NextResponse.json({
        success: true,
        offspringPreview: {
          generation: offspringPreview.generation