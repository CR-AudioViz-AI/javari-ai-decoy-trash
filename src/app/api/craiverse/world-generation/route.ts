```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { TerrainGenerator } from '@/lib/world-generation/terrain-generator';
import { BuildingPlacer } from '@/lib/world-generation/building-placer';
import { EcosystemCreator } from '@/lib/world-generation/ecosystem-creator';
import { BiomeSystem } from '@/lib/world-generation/biome-system';
import { WorldAIAssistant } from '@/lib/ai/world-ai-assistant';
import { worldParamsSchema } from '@/lib/validation/world-params-schema';
import { 
  WorldGenerationParams, 
  GeneratedWorld, 
  TerrainData,
  BiomeType,
  WorldMetadata 
} from '@/types/world-generation';

// Rate limiting: 3 requests per minute per user
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const WORLD_SIZE_LIMITS = {
  small: 512,
  medium: 1024,
  large: 2048,
  xl: 4096
} as const;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = request.ip ?? 'anonymous';
    const { success } = await limiter.check(3, identifier);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = worldParamsSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid parameters', 
          details: validationResult.error.issues 
        },
        { status: 400 }
      );
    }

    const params: WorldGenerationParams = validationResult.data;

    // Validate world size limits
    const maxSize = WORLD_SIZE_LIMITS[params.size];
    if (params.customDimensions) {
      if (params.customDimensions.width > maxSize || params.customDimensions.height > maxSize) {
        return NextResponse.json(
          { error: `Custom dimensions exceed maximum size for ${params.size} worlds` },
          { status: 400 }
        );
      }
    }

    // Check user's world generation quota
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('world_generation_quota, worlds_generated_today')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (userProfile.worlds_generated_today >= userProfile.world_generation_quota) {
      return NextResponse.json(
        { error: 'Daily world generation quota exceeded' },
        { status: 429 }
      );
    }

    // Initialize generation components
    const terrainGenerator = new TerrainGenerator({
      seed: params.seed || Math.random(),
      size: params.customDimensions || { 
        width: maxSize, 
        height: maxSize 
      },
      noiseScale: params.terrainComplexity || 0.01,
      octaves: params.detailLevel || 6,
      persistence: params.persistence || 0.5,
      lacunarity: params.lacunarity || 2.0
    });

    const biomeSystem = new BiomeSystem({
      temperature: params.climate?.temperature || 0.5,
      humidity: params.climate?.humidity || 0.5,
      elevation: params.climate?.elevation || 0.5
    });

    const aiAssistant = new WorldAIAssistant();
    const buildingPlacer = new BuildingPlacer(aiAssistant);
    const ecosystemCreator = new EcosystemCreator();

    // Generate terrain heightmap
    console.log('Generating terrain...');
    const terrainData: TerrainData = await terrainGenerator.generate();

    // Classify biomes based on terrain
    console.log('Classifying biomes...');
    const biomeMap = biomeSystem.classifyTerrain(terrainData);

    // Generate AI-assisted building placements
    console.log('Placing structures...');
    const structures = await buildingPlacer.placeBuildings({
      terrainData,
      biomeMap,
      density: params.structureDensity || 0.1,
      types: params.structureTypes || ['village', 'outpost', 'monument'],
      style: params.architecturalStyle || 'fantasy'
    });

    // Create ecosystem elements
    console.log('Populating ecosystem...');
    const ecosystem = await ecosystemCreator.populate({
      terrainData,
      biomeMap,
      structures,
      biodiversity: params.biodiversity || 0.5,
      wildlifePopulation: params.wildlifePopulation || 0.3
    });

    // Generate world metadata
    const worldMetadata: WorldMetadata = {
      id: crypto.randomUUID(),
      name: params.name || await aiAssistant.generateWorldName(biomeMap),
      description: await aiAssistant.generateWorldDescription({
        biomes: Array.from(new Set(biomeMap.flat())),
        structures: structures.length,
        ecosystem: ecosystem.species.length
      }),
      size: params.size,
      dimensions: params.customDimensions || { width: maxSize, height: maxSize },
      biomes: Array.from(new Set(biomeMap.flat())),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      parameters: params,
      statistics: {
        totalStructures: structures.length,
        dominantBiome: getMostCommonBiome(biomeMap),
        elevationRange: {
          min: Math.min(...terrainData.heightmap.flat()),
          max: Math.max(...terrainData.heightmap.flat())
        },
        speciesCount: ecosystem.species.length
      }
    };

    // Serialize world data
    const generatedWorld: GeneratedWorld = {
      metadata: worldMetadata,
      terrain: terrainData,
      biomes: biomeMap,
      structures,
      ecosystem,
      assets: {
        heightmapUrl: '', // Will be set after file upload
        previewUrl: '',   // Will be set after preview generation
        configUrl: ''     // Will be set after config upload
      }
    };

    // Upload world assets to storage
    console.log('Uploading world assets...');
    const heightmapBuffer = Buffer.from(JSON.stringify(terrainData.heightmap));
    const configBuffer = Buffer.from(JSON.stringify({
      structures,
      ecosystem,
      biomes: biomeMap
    }));

    const [heightmapUpload, configUpload] = await Promise.all([
      supabase.storage
        .from('world-assets')
        .upload(`worlds/${worldMetadata.id}/heightmap.json`, heightmapBuffer, {
          contentType: 'application/json'
        }),
      supabase.storage
        .from('world-assets')
        .upload(`worlds/${worldMetadata.id}/config.json`, configBuffer, {
          contentType: 'application/json'
        })
    ]);

    if (heightmapUpload.error || configUpload.error) {
      throw new Error('Failed to upload world assets');
    }

    // Get public URLs for assets
    const { data: heightmapUrl } = supabase.storage
      .from('world-assets')
      .getPublicUrl(`worlds/${worldMetadata.id}/heightmap.json`);
    
    const { data: configUrl } = supabase.storage
      .from('world-assets')
      .getPublicUrl(`worlds/${worldMetadata.id}/config.json`);

    generatedWorld.assets.heightmapUrl = heightmapUrl.publicUrl;
    generatedWorld.assets.configUrl = configUrl.publicUrl;

    // Save world metadata to database
    const { error: insertError } = await supabase
      .from('craiverse_worlds')
      .insert({
        id: worldMetadata.id,
        name: worldMetadata.name,
        description: worldMetadata.description,
        user_id: user.id,
        size: worldMetadata.size,
        dimensions: worldMetadata.dimensions,
        biomes: worldMetadata.biomes,
        parameters: worldMetadata.parameters,
        statistics: worldMetadata.statistics,
        assets: generatedWorld.assets,
        created_at: worldMetadata.createdAt,
        is_public: params.makePublic || false
      });

    if (insertError) {
      throw new Error('Failed to save world to database');
    }

    // Update user's daily generation count
    await supabase
      .from('user_profiles')
      .update({ 
        worlds_generated_today: userProfile.worlds_generated_today + 1 
      })
      .eq('user_id', user.id);

    // Log generation event
    await supabase
      .from('world_generation_logs')
      .insert({
        user_id: user.id,
        world_id: worldMetadata.id,
        parameters: params,
        generation_time_ms: Date.now() - performance.now(),
        success: true
      });

    return NextResponse.json({
      success: true,
      world: {
        id: worldMetadata.id,
        name: worldMetadata.name,
        description: worldMetadata.description,
        previewUrl: generatedWorld.assets.previewUrl,
        statistics: worldMetadata.statistics
      },
      metadata: worldMetadata
    }, { status: 201 });

  } catch (error) {
    console.error('World generation error:', error);

    // Log failed generation attempt
    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase
          .from('world_generation_logs')
          .insert({
            user_id: user.id,
            world_id: null,
            parameters: null,
            generation_time_ms: 0,
            success: false,
            error_message: error instanceof Error ? error.message : 'Unknown error'
          });
      }
    } catch (logError) {
      console.error('Failed to log generation error:', logError);
    }

    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('limit')) {
        return NextResponse.json(
          { error: error.message },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'World generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
    const publicOnly = searchParams.get('public') === 'true';
    const biome = searchParams.get('biome');
    const size = searchParams.get('size');

    let query = supabase
      .from('craiverse_worlds')
      .select(`
        id,
        name,
        description,
        size,
        dimensions,
        biomes,
        statistics,
        created_at,
        is_public,
        user_id,
        user_profiles!inner(username, avatar_url)
      `);

    if (publicOnly) {
      query = query.eq('is_public', true);
    } else {
      query = query.eq('user_id', user.id);
    }

    if (biome) {
      query = query.contains('biomes', [biome]);
    }

    if (size) {
      query = query.eq('size', size);
    }

    const { data: worlds, error, count } = await query
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      worlds: worlds || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch worlds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worlds' },
      { status: 500 }
    );
  }
}

// Helper function to find the most common biome
function getMostCommonBiome(biomeMap: BiomeType[][]): BiomeType {
  const biomeCount = new Map<BiomeType, number>();
  
  for (const row of biomeMap) {
    for (const biome of row) {
      biomeCount.set(biome, (biomeCount.get(biome) || 0) + 1);
    }
  }
  
  let mostCommon: BiomeType = 'grassland';
  let maxCount = 0;
  
  for (const [biome, count] of biomeCount.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = biome;
    }
  }
  
  return mostCommon;
}
```