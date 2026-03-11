```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { rateLimit } from '@/lib/rate-limit';

// Validation schemas
const sentimentAnalysisSchema = z.object({
  reviewIds: z.array(z.string().uuid()).min(1).max(50),
  options: z.object({
    includeThemes: z.boolean().default(true),
    includeFeedback: z.boolean().default(true),
    forceRefresh: z.boolean().default(false)
  }).optional().default({})
});

const batchAnalysisSchema = z.object({
  agentId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

// Types
interface SentimentResult {
  score: number; // -1 to 1
  confidence: number; // 0 to 1
  label: 'positive' | 'neutral' | 'negative';
}

interface ThemeResult {
  themes: string[];
  keywords: { word: string; relevance: number }[];
  categories: string[];
}

interface FeedbackResult {
  strengths: string[];
  improvements: string[];
  actionableItems: string[];
  priority: 'high' | 'medium' | 'low';
}

interface SentimentAnalysis {
  reviewId: string;
  sentiment: SentimentResult;
  themes?: ThemeResult;
  feedback?: FeedbackResult;
  processedAt: string;
  processingTime: number;
}

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const redis = new Redis(process.env.REDIS_URL!);

// Sentiment analysis functions
async function analyzeSentiment(text: string): Promise<SentimentResult> {
  const prompt = `Analyze the sentiment of this review text and return a JSON object with:
  - score: number between -1 (very negative) and 1 (very positive)
  - confidence: number between 0 and 1 indicating confidence in the analysis
  - label: "positive", "neutral", or "negative"

  Review text: "${text}"

  Return only valid JSON:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a sentiment analysis expert. Return only valid JSON responses.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.1,
    max_tokens: 150
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No sentiment analysis result received');
  }

  try {
    return JSON.parse(content) as SentimentResult;
  } catch (error) {
    throw new Error('Invalid sentiment analysis response format');
  }
}

async function extractThemes(text: string): Promise<ThemeResult> {
  const prompt = `Extract key themes, keywords, and categories from this review text and return a JSON object with:
  - themes: array of main themes/topics (max 5)
  - keywords: array of objects with "word" and "relevance" (0-1) (max 10)
  - categories: array of category labels like "performance", "usability", "support" etc (max 3)

  Review text: "${text}"

  Return only valid JSON:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a theme extraction expert for agent reviews. Focus on AI agent capabilities, performance, and user experience. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.2,
    max_tokens: 300
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No theme extraction result received');
  }

  try {
    return JSON.parse(content) as ThemeResult;
  } catch (error) {
    throw new Error('Invalid theme extraction response format');
  }
}

async function generateFeedback(text: string, sentiment: SentimentResult, themes: ThemeResult): Promise<FeedbackResult> {
  const prompt = `Based on this review analysis, generate actionable feedback and return a JSON object with:
  - strengths: array of identified strengths (max 3)
  - improvements: array of areas for improvement (max 3)
  - actionableItems: array of specific actionable recommendations (max 5)
  - priority: "high", "medium", or "low" based on sentiment and themes

  Review text: "${text}"
  Sentiment: ${JSON.stringify(sentiment)}
  Themes: ${JSON.stringify(themes)}

  Return only valid JSON:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an AI agent improvement consultant. Generate specific, actionable feedback for agent developers. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 400
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No feedback generation result received');
  }

  try {
    return JSON.parse(content) as FeedbackResult;
  } catch (error) {
    throw new Error('Invalid feedback generation response format');
  }
}

async function getCachedSentiment(reviewId: string): Promise<SentimentAnalysis | null> {
  try {
    const cached = await redis.get(`sentiment:${reviewId}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

async function cacheSentiment(reviewId: string, analysis: SentimentAnalysis): Promise<void> {
  try {
    await redis.setex(`sentiment:${reviewId}`, 3600 * 24 * 7, JSON.stringify(analysis)); // Cache for 7 days
  } catch (error) {
    console.error('Cache write error:', error);
    // Don't throw - caching is not critical
  }
}

async function processReviewSentiment(
  supabase: any,
  reviewId: string,
  options: any
): Promise<SentimentAnalysis> {
  const startTime = Date.now();

  // Check cache first
  if (!options.forceRefresh) {
    const cached = await getCachedSentiment(reviewId);
    if (cached) {
      return cached;
    }
  }

  // Get review data
  const { data: review, error: reviewError } = await supabase
    .from('agent_reviews')
    .select('id, content, rating, agent_id')
    .eq('id', reviewId)
    .single();

  if (reviewError || !review) {
    throw new Error(`Review not found: ${reviewId}`);
  }

  if (!review.content || review.content.trim().length < 10) {
    throw new Error('Review content too short for analysis');
  }

  // Perform analysis
  const sentiment = await analyzeSentiment(review.content);
  
  let themes: ThemeResult | undefined;
  let feedback: FeedbackResult | undefined;

  if (options.includeThemes) {
    themes = await extractThemes(review.content);
  }

  if (options.includeFeedback && themes) {
    feedback = await generateFeedback(review.content, sentiment, themes);
  }

  const analysis: SentimentAnalysis = {
    reviewId,
    sentiment,
    themes,
    feedback,
    processedAt: new Date().toISOString(),
    processingTime: Date.now() - startTime
  };

  // Update database
  const { error: updateError } = await supabase
    .from('agent_reviews')
    .update({
      sentiment_analysis: analysis,
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId);

  if (updateError) {
    console.error('Database update error:', updateError);
    // Don't throw - analysis is still valid
  }

  // Cache result
  await cacheSentiment(reviewId, analysis);

  // Invalidate related caches
  await redis.del(`agent:sentiment:${review.agent_id}`);

  return analysis;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, {
      maxRequests: 100,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (req) => req.ip || 'anonymous'
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Validate request
    const body = await request.json();
    const { reviewIds, options } = sentimentAnalysisSchema.parse(body);

    // Get user session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Process reviews
    const results: SentimentAnalysis[] = [];
    const errors: { reviewId: string; error: string }[] = [];

    // Process in batches to avoid overwhelming OpenAI API
    const batchSize = 5;
    for (let i = 0; i < reviewIds.length; i += batchSize) {
      const batch = reviewIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (reviewId) => {
        try {
          const analysis = await processReviewSentiment(supabase, reviewId, options);
          results.push(analysis);
        } catch (error) {
          console.error(`Sentiment analysis error for review ${reviewId}:`, error);
          errors.push({
            reviewId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.all(batchPromises);

      // Rate limit between batches
      if (i + batchSize < reviewIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    // Log processing metrics
    console.log(`Sentiment analysis completed: ${results.length} processed, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      data: {
        results,
        errors,
        summary: {
          totalProcessed: results.length,
          totalErrors: errors.length,
          averageProcessingTime: results.length > 0 
            ? Math.round(results.reduce((sum, r) => sum + r.processingTime, 0) / results.length)
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Sentiment analysis API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors
        },
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
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Validate parameters
    batchAnalysisSchema.parse({ agentId, limit, offset });

    // Get user session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check cache first
    const cacheKey = `agent:sentiment:${agentId}:${limit}:${offset}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return NextResponse.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }

    // Get sentiment analysis data
    const { data: reviews, error: reviewsError } = await supabase
      .from('agent_reviews')
      .select(`
        id,
        content,
        rating,
        sentiment_analysis,
        created_at,
        user:profiles(username, avatar_url)
      `)
      .eq('agent_id', agentId)
      .not('sentiment_analysis', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (reviewsError) {
      throw new Error(`Failed to fetch reviews: ${reviewsError.message}`);
    }

    // Calculate aggregate metrics
    const sentimentScores = reviews
      .map(r => r.sentiment_analysis?.sentiment?.score)
      .filter(score => typeof score === 'number');

    const themes = reviews
      .flatMap(r => r.sentiment_analysis?.themes?.themes || [])
      .reduce((acc: Record<string, number>, theme: string) => {
        acc[theme] = (acc[theme] || 0) + 1;
        return acc;
      }, {});

    const topThemes = Object.entries(themes)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([theme, count]) => ({ theme, count }));

    const aggregates = {
      averageSentiment: sentimentScores.length > 0
        ? sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length
        : 0,
      sentimentDistribution: {
        positive: reviews.filter(r => r.sentiment_analysis?.sentiment?.label === 'positive').length,
        neutral: reviews.filter(r => r.sentiment_analysis?.sentiment?.label === 'neutral').length,
        negative: reviews.filter(r => r.sentiment_analysis?.sentiment?.label === 'negative').length
      },
      topThemes,
      totalAnalyzed: reviews.length
    };

    const result = {
      reviews,
      aggregates
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(result));

    return NextResponse.json({
      success: true,
      data: result,
      cached: false
    });

  } catch (error) {
    console.error('Sentiment analysis GET error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```