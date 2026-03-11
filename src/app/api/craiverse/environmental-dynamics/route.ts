```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

// Supabase client initialization
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schemas
const weatherSystemSchema = z.object({
  temperature: z.number().min(-100).max(100),
  humidity: z.number().min(0).max(100),
  pressure: z.number().min(800).max(1200),
  windSpeed: z.number().min(0).max(200),
  windDirection: z.number().min(0).max(360),
  precipitation: z.number().min(0).max(100),
  cloudCover: z.number().min(0).max(100),
  visibility: z.number().min(0).max(100)
});

const dayNightCycleSchema = z.object({
  currentTime: z.number().min(0).max(24),
  sunPosition: z.object({
    elevation: z.number().min(-90).max(90),
    azimuth: z.number().min(0).max(360)
  }),
  lightIntensity: z.number().min(0).max(100),
  ambientColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  shadowLength: z.number().min(0).max(100)
});

const seasonalDataSchema = z.object({
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  dayOfYear: z.number().min(1).max(365),
  seasonProgress: z.number().min(0).max(1),
  temperatureModifier: z.number().min(-50).max(50),
  vegetationDensity: z.number().min(0).max(100)
});

const environmentUpdateSchema = z.object({
  craiverse_id: z.string().uuid(),
  weather: weatherSystemSchema.optional(),
  dayNight: dayNightCycleSchema.optional(),
  seasonal: seasonalDataSchema.optional(),
  physics: z.object({
    gravity: z.number().min(0).max(20),
    airDensity: z.number().min(0).max(2),
    windResistance: z.number().min(0).max(10)
  }).optional(),
  timeScale: z.number().min(0.1).max(100).optional()
});

const environmentQuerySchema = z.object({
  craiverse_id: z.string().uuid(),
  include: z.array(z.enum(['weather', 'daynight', 'seasonal', 'physics', 'ai_effects'])).optional()
});

// Environmental dynamics classes
class WeatherSystem {
  static calculateAtmosphericPressure(temperature: number, humidity: number, elevation: number = 0): number {
    const basePressure = 1013.25;
    const temperatureK = temperature + 273.15;
    const humidityFactor = 1 - (humidity / 100) * 0.02;
    const elevationFactor = Math.exp(-elevation / 8400);
    return basePressure * humidityFactor * elevationFactor * (temperatureK / 288.15);
  }

  static calculateWindChill(temperature: number, windSpeed: number): number {
    if (temperature > 10 || windSpeed < 4.8) return temperature;
    return 13.12 + 0.6215 * temperature - 11.37 * Math.pow(windSpeed, 0.16) + 0.3965 * temperature * Math.pow(windSpeed, 0.16);
  }

  static generateWeatherEffects(weather: z.infer<typeof weatherSystemSchema>) {
    return {
      visibility: Math.max(0, weather.visibility - weather.precipitation * 0.5 - weather.cloudCover * 0.2),
      airResistance: 1 + (weather.windSpeed / 100) + (weather.humidity / 200),
      thermalComfort: this.calculateWindChill(weather.temperature, weather.windSpeed),
      precipitationIntensity: weather.precipitation > 20 ? 'heavy' : weather.precipitation > 5 ? 'moderate' : 'light'
    };
  }
}

class DayNightCycle {
  static calculateSunPosition(time: number, latitude: number = 0, dayOfYear: number = 180): { elevation: number; azimuth: number } {
    const declination = 23.45 * Math.sin((360 * (284 + dayOfYear) / 365) * Math.PI / 180);
    const hourAngle = 15 * (time - 12);
    
    const elevation = Math.asin(
      Math.sin(declination * Math.PI / 180) * Math.sin(latitude * Math.PI / 180) +
      Math.cos(declination * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.cos(hourAngle * Math.PI / 180)
    ) * 180 / Math.PI;
    
    const azimuth = Math.atan2(
      Math.sin(hourAngle * Math.PI / 180),
      Math.cos(hourAngle * Math.PI / 180) * Math.sin(latitude * Math.PI / 180) - 
      Math.tan(declination * Math.PI / 180) * Math.cos(latitude * Math.PI / 180)
    ) * 180 / Math.PI + 180;

    return { elevation: Math.max(-90, Math.min(90, elevation)), azimuth: azimuth % 360 };
  }

  static calculateLightingConditions(sunPosition: { elevation: number; azimuth: number }, cloudCover: number = 0) {
    const maxIntensity = Math.max(0, Math.sin((sunPosition.elevation + 10) * Math.PI / 180));
    const cloudReduction = 1 - (cloudCover / 100) * 0.8;
    const lightIntensity = maxIntensity * cloudReduction * 100;
    
    const ambientLight = Math.max(5, lightIntensity * 0.3);
    const shadowLength = sunPosition.elevation > 0 ? 100 / Math.tan(sunPosition.elevation * Math.PI / 180) : 0;
    
    return {
      lightIntensity,
      ambientLight,
      shadowLength: Math.min(100, shadowLength),
      phase: this.getDayPhase(sunPosition.elevation)
    };
  }

  private static getDayPhase(elevation: number): string {
    if (elevation > 30) return 'day';
    if (elevation > 0) return 'dawn_dusk';
    if (elevation > -18) return 'twilight';
    return 'night';
  }
}

class SeasonalProcessor {
  static calculateSeasonalEffects(seasonal: z.infer<typeof seasonalDataSchema>) {
    const baseTemperature = this.getBaseTemperatureForSeason(seasonal.season);
    const vegetationMultiplier = this.getVegetationMultiplier(seasonal.season, seasonal.seasonProgress);
    
    return {
      baseTemperature,
      vegetationMultiplier,
      dayLengthModifier: this.getDayLengthModifier(seasonal.dayOfYear),
      precipitationModifier: this.getPrecipitationModifier(seasonal.season),
      windPatterns: this.getWindPatterns(seasonal.season)
    };
  }

  private static getBaseTemperatureForSeason(season: string): number {
    const seasonTemps = { spring: 15, summer: 25, autumn: 10, winter: -5 };
    return seasonTemps[season as keyof typeof seasonTemps] || 15;
  }

  private static getVegetationMultiplier(season: string, progress: number): number {
    const seasonVeg = { spring: 0.3 + progress * 0.4, summer: 0.8, autumn: 0.8 - progress * 0.5, winter: 0.2 };
    return seasonVeg[season as keyof typeof seasonVeg] || 0.5;
  }

  private static getDayLengthModifier(dayOfYear: number): number {
    return Math.sin(2 * Math.PI * (dayOfYear - 81) / 365) * 0.4 + 1;
  }

  private static getPrecipitationModifier(season: string): number {
    const seasonPrecip = { spring: 1.2, summer: 0.8, autumn: 1.4, winter: 1.1 };
    return seasonPrecip[season as keyof typeof seasonPrecip] || 1.0;
  }

  private static getWindPatterns(season: string): { strength: number; variability: number } {
    const patterns = {
      spring: { strength: 1.2, variability: 1.5 },
      summer: { strength: 0.8, variability: 0.8 },
      autumn: { strength: 1.4, variability: 1.8 },
      winter: { strength: 1.6, variability: 1.2 }
    };
    return patterns[season as keyof typeof patterns] || { strength: 1.0, variability: 1.0 };
  }
}

class AIBehaviorModulator {
  static calculateBehaviorModifiers(environmentalState: any) {
    const weather = environmentalState.weather || {};
    const lighting = environmentalState.lighting || {};
    const seasonal = environmentalState.seasonal || {};

    return {
      activityLevel: this.calculateActivityLevel(weather, lighting),
      socialBehavior: this.calculateSocialBehavior(weather, seasonal),
      explorationTendency: this.calculateExplorationTendency(weather, lighting),
      restingProbability: this.calculateRestingProbability(lighting, weather),
      alertnessLevel: this.calculateAlertnessLevel(weather, lighting)
    };
  }

  private static calculateActivityLevel(weather: any, lighting: any): number {
    let activity = 0.5;
    
    // Weather effects
    if (weather.temperature < -10 || weather.temperature > 35) activity -= 0.2;
    if (weather.precipitation > 50) activity -= 0.3;
    if (weather.windSpeed > 50) activity -= 0.2;
    
    // Light effects
    if (lighting.phase === 'day') activity += 0.3;
    else if (lighting.phase === 'night') activity -= 0.4;
    
    return Math.max(0, Math.min(1, activity));
  }

  private static calculateSocialBehavior(weather: any, seasonal: any): number {
    let social = 0.5;
    
    if (weather.temperature > 20 && weather.temperature < 28) social += 0.2;
    if (weather.precipitation < 10) social += 0.1;
    if (seasonal.season === 'spring' || seasonal.season === 'summer') social += 0.1;
    
    return Math.max(0, Math.min(1, social));
  }

  private static calculateExplorationTendency(weather: any, lighting: any): number {
    let exploration = 0.4;
    
    if (weather.visibility > 80) exploration += 0.2;
    if (weather.windSpeed < 20) exploration += 0.1;
    if (lighting.lightIntensity > 30) exploration += 0.2;
    
    return Math.max(0, Math.min(1, exploration));
  }

  private static calculateRestingProbability(lighting: any, weather: any): number {
    let resting = 0.1;
    
    if (lighting.phase === 'night') resting += 0.6;
    if (lighting.phase === 'twilight') resting += 0.3;
    if (weather.precipitation > 30) resting += 0.2;
    if (weather.temperature < 5 || weather.temperature > 30) resting += 0.1;
    
    return Math.max(0, Math.min(1, resting));
  }

  private static calculateAlertnessLevel(weather: any, lighting: any): number {
    let alertness = 0.5;
    
    if (weather.windSpeed > 30) alertness += 0.2;
    if (weather.visibility < 50) alertness += 0.3;
    if (lighting.phase === 'twilight' || lighting.phase === 'night') alertness += 0.2;
    
    return Math.max(0, Math.min(1, alertness));
  }
}

class EnvironmentalStateManager {
  static async saveEnvironmentalState(craiverse_id: string, state: any) {
    const { data, error } = await supabase
      .from('craiverse_environmental_states')
      .upsert({
        craiverse_id,
        weather_data: state.weather,
        daynight_data: state.dayNight,
        seasonal_data: state.seasonal,
        physics_data: state.physics,
        ai_behavior_modifiers: state.aiBehaviorModifiers,
        last_updated: new Date().toISOString()
      })
      .select();

    if (error) throw error;
    return data;
  }

  static async getEnvironmentalState(craiverse_id: string, include: string[] = []) {
    const { data, error } = await supabase
      .from('craiverse_environmental_states')
      .select('*')
      .eq('craiverse_id', craiverse_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    if (!data) {
      return this.generateDefaultState(craiverse_id);
    }

    const result: any = { craiverse_id: data.craiverse_id };
    
    if (include.length === 0 || include.includes('weather')) {
      result.weather = data.weather_data;
    }
    if (include.length === 0 || include.includes('daynight')) {
      result.dayNight = data.daynight_data;
    }
    if (include.length === 0 || include.includes('seasonal')) {
      result.seasonal = data.seasonal_data;
    }
    if (include.length === 0 || include.includes('physics')) {
      result.physics = data.physics_data;
    }
    if (include.length === 0 || include.includes('ai_effects')) {
      result.aiBehaviorModifiers = data.ai_behavior_modifiers;
    }

    return result;
  }

  private static generateDefaultState(craiverse_id: string) {
    const now = new Date();
    const currentTime = now.getHours() + now.getMinutes() / 60;
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      craiverse_id,
      weather: {
        temperature: 22,
        humidity: 60,
        pressure: 1013.25,
        windSpeed: 10,
        windDirection: 180,
        precipitation: 0,
        cloudCover: 30,
        visibility: 100
      },
      dayNight: {
        currentTime,
        sunPosition: DayNightCycle.calculateSunPosition(currentTime, 0, dayOfYear),
        lightIntensity: 70,
        ambientColor: "#87CEEB",
        shadowLength: 20
      },
      seasonal: {
        season: this.getCurrentSeason(dayOfYear),
        dayOfYear,
        seasonProgress: 0.5,
        temperatureModifier: 0,
        vegetationDensity: 70
      },
      physics: {
        gravity: 9.8,
        airDensity: 1.225,
        windResistance: 1.0
      }
    };
  }

  private static getCurrentSeason(dayOfYear: number): string {
    if (dayOfYear < 80 || dayOfYear > 355) return 'winter';
    if (dayOfYear < 172) return 'spring';
    if (dayOfYear < 266) return 'summer';
    return 'autumn';
  }
}

// POST endpoint for updating environmental dynamics
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = request.ip || 'anonymous';
    const { success } = await rateLimit.limit(identifier);
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = environmentUpdateSchema.parse(body);

    // Calculate environmental effects
    let environmentalState: any = {
      craiverse_id: validatedData.craiverse_id
    };

    if (validatedData.weather) {
      const weatherEffects = WeatherSystem.generateWeatherEffects(validatedData.weather);
      environmentalState.weather = { ...validatedData.weather, ...weatherEffects };
    }

    if (validatedData.dayNight) {
      const lightingConditions = DayNightCycle.calculateLightingConditions(
        validatedData.dayNight.sunPosition,
        validatedData.weather?.cloudCover || 0
      );
      environmentalState.dayNight = { ...validatedData.dayNight, ...lightingConditions };
      environmentalState.lighting = lightingConditions;
    }

    if (validatedData.seasonal) {
      const seasonalEffects = SeasonalProcessor.calculateSeasonalEffects(validatedData.seasonal);
      environmentalState.seasonal = { ...validatedData.seasonal, ...seasonalEffects };
    }

    if (validatedData.physics) {
      environmentalState.physics = validatedData.physics;
    }

    // Calculate AI behavior modifiers
    const aiBehaviorModifiers = AIBehaviorModulator.calculateBehaviorModifiers(environmentalState);
    environmentalState.aiBehaviorModifiers = aiBehaviorModifiers;

    // Save to database
    await EnvironmentalStateManager.saveEnvironmentalState(
      validatedData.craiverse_id,
      environmentalState
    );

    // Broadcast real-time updates
    await supabase
      .channel(`craiverse-${validatedData.craiverse_id}`)
      .send({
        type: 'broadcast',
        event: 'environmental_update',
        payload: {
          craiverse_id: validatedData.craiverse_id,
          timestamp: new Date().toISOString(),
          changes: environmentalState
        }
      });

    return NextResponse.json({
      success: true,
      environmentalState,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error) {
    console.error('Environmental dynamics API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Invalid input data',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to update environmental dynamics'
    }, { status: 500 });
  }
}

// GET endpoint for querying environmental state
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const craiverse_id = searchParams.get('craiverse_id');
    const includeParam = searchParams.get('include');
    
    if (!craiverse_id) {
      return NextResponse.json({ error: 'craiverse_id parameter is required' }, { status: 400 });
    }

    const queryData = environmentQuerySchema.parse({
      craiverse_id,
      include: includeParam ? includeParam.split(',') : undefined
    });

    const environmentalState = await EnvironmentalStateManager.getEnvironmentalState(
      queryData.craiverse_id,
      queryData.include || []
    );

    return NextResponse.json({
      success: true,
      environmentalState,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error) {
    console.error('Environmental dynamics query error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Invalid query parameters',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      message: 'Failed to retrieve environmental state'
    }, { status: 500 });
  }
}
```