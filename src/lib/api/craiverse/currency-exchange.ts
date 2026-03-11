```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { Redis } from 'ioredis'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { validateApiKey } from '@/lib/auth'

// Types and Interfaces
interface Currency {
  id: string
  symbol: string
  name: string
  decimals: number
  total_supply: number
  circulating_supply: number
  world_id: string
  created_at: string
}

interface ExchangeRate {
  from_currency: string
  to_currency: string
  rate: number
  timestamp: string
  volume_24h: number
}

interface Order {
  id: string
  user_id: string
  world_id: string
  from_currency: string
  to_currency: string
  amount: number
  expected_amount: number
  type: 'market' | 'limit'
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  created_at: string
}

interface LiquidityPool {
  id: string
  currency_a: string
  currency_b: string
  reserve_a: number
  reserve_b: number
  lp_token_supply: number
  fee_rate: number
  world_id: string
}

// Validation Schemas
const ExchangeRequestSchema = z.object({
  worldId: z.string().uuid(),
  fromCurrency: z.string().min(1).max(10),
  toCurrency: z.string().min(1).max(10),
  amount: z.number().positive(),
  slippageTolerance: z.number().min(0).max(0.1).optional().default(0.005),
  orderType: z.enum(['market', 'limit']).optional().default('market')
})

const AddLiquiditySchema = z.object({
  worldId: z.string().uuid(),
  currencyA: z.string().min(1).max(10),
  currencyB: z.string().min(1).max(10),
  amountA: z.number().positive(),
  amountB: z.number().positive()
})

const PriceQuerySchema = z.object({
  worldId: z.string().uuid().optional(),
  fromCurrency: z.string().min(1).max(10).optional(),
  toCurrency: z.string().min(1).max(10).optional()
})

// Redis client for caching and real-time data
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

class CurrencyExchangeAPI {
  private supabase = createClient()
  
  // Automated Market Maker using Constant Product Formula (x * y = k)
  async calculateExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    worldId: string
  ): Promise<{ rate: number; expectedAmount: number; priceImpact: number }> {
    // Get liquidity pool
    const { data: pool } = await this.supabase
      .from('liquidity_pools')
      .select('*')
      .eq('world_id', worldId)
      .or(`currency_a.eq.${fromCurrency},currency_b.eq.${fromCurrency}`)
      .or(`currency_a.eq.${toCurrency},currency_b.eq.${toCurrency}`)
      .single()

    if (!pool) {
      throw new Error('No liquidity pool found for currency pair')
    }

    const isAtoB = pool.currency_a === fromCurrency
    const reserveIn = isAtoB ? pool.reserve_a : pool.reserve_b
    const reserveOut = isAtoB ? pool.reserve_b : pool.reserve_a

    // Apply 0.3% fee
    const amountInWithFee = amount * (1 - pool.fee_rate)
    
    // Constant product formula: (x + Δx) * (y - Δy) = x * y
    const expectedAmount = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee)
    const rate = expectedAmount / amount
    
    // Calculate price impact
    const spotRate = reserveOut / reserveIn
    const priceImpact = Math.abs((rate - spotRate) / spotRate)

    return { rate, expectedAmount, priceImpact }
  }

  async executeExchange(
    userId: string,
    worldId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    expectedAmount: number,
    slippageTolerance: number
  ): Promise<Order> {
    const orderId = crypto.randomUUID()

    try {
      // Start transaction
      const { data: order, error: orderError } = await this.supabase
        .from('exchange_orders')
        .insert({
          id: orderId,
          user_id: userId,
          world_id: worldId,
          from_currency: fromCurrency,
          to_currency: toCurrency,
          amount,
          expected_amount: expectedAmount,
          type: 'market',
          status: 'pending'
        })
        .select()
        .single()

      if (orderError) throw orderError

      // Check user balance
      const { data: wallet } = await this.supabase
        .from('user_wallets')
        .select('balance')
        .eq('user_id', userId)
        .eq('world_id', worldId)
        .eq('currency', fromCurrency)
        .single()

      if (!wallet || wallet.balance < amount) {
        await this.updateOrderStatus(orderId, 'failed')
        throw new Error('Insufficient balance')
      }

      // Recalculate rate to prevent MEV attacks
      const { rate, expectedAmount: currentExpectedAmount } = await this.calculateExchangeRate(
        fromCurrency,
        toCurrency,
        amount,
        worldId
      )

      // Check slippage
      const slippage = Math.abs(currentExpectedAmount - expectedAmount) / expectedAmount
      if (slippage > slippageTolerance) {
        await this.updateOrderStatus(orderId, 'failed')
        throw new Error(`Slippage tolerance exceeded: ${slippage * 100}%`)
      }

      // Update liquidity pool and user balances atomically
      await this.processExchange(
        userId,
        worldId,
        fromCurrency,
        toCurrency,
        amount,
        currentExpectedAmount
      )

      // Update order status
      await this.updateOrderStatus(orderId, 'completed')

      // Update cached rates
      await this.updateCachedRates(worldId, fromCurrency, toCurrency, rate)

      // Publish real-time update
      await redis.publish(`exchange:${worldId}`, JSON.stringify({
        type: 'trade_executed',
        fromCurrency,
        toCurrency,
        amount,
        rate,
        timestamp: new Date().toISOString()
      }))

      return { ...order, status: 'completed' }

    } catch (error) {
      await this.updateOrderStatus(orderId, 'failed')
      throw error
    }
  }

  private async processExchange(
    userId: string,
    worldId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    expectedAmount: number
  ): Promise<void> {
    // This should be done in a database transaction
    const { error } = await this.supabase.rpc('execute_currency_exchange', {
      p_user_id: userId,
      p_world_id: worldId,
      p_from_currency: fromCurrency,
      p_to_currency: toCurrency,
      p_amount: amount,
      p_expected_amount: expectedAmount
    })

    if (error) throw error
  }

  private async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    await this.supabase
      .from('exchange_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  private async updateCachedRates(
    worldId: string,
    fromCurrency: string,
    toCurrency: string,
    rate: number
  ): Promise<void> {
    const cacheKey = `rates:${worldId}:${fromCurrency}:${toCurrency}`
    await redis.setex(cacheKey, 60, JSON.stringify({
      rate,
      timestamp: new Date().toISOString()
    }))
  }

  async addLiquidity(
    userId: string,
    worldId: string,
    currencyA: string,
    currencyB: string,
    amountA: number,
    amountB: number
  ): Promise<{ lpTokens: number }> {
    const { error, data } = await this.supabase.rpc('add_liquidity', {
      p_user_id: userId,
      p_world_id: worldId,
      p_currency_a: currencyA,
      p_currency_b: currencyB,
      p_amount_a: amountA,
      p_amount_b: amountB
    })

    if (error) throw error

    return { lpTokens: data.lp_tokens }
  }

  async getCurrentRates(worldId?: string): Promise<ExchangeRate[]> {
    let query = this.supabase
      .from('exchange_rates_view')
      .select('*')
      .order('timestamp', { ascending: false })

    if (worldId) {
      query = query.eq('world_id', worldId)
    }

    const { data, error } = await query.limit(100)
    
    if (error) throw error
    return data || []
  }

  async getOrderHistory(userId: string, worldId?: string): Promise<Order[]> {
    let query = this.supabase
      .from('exchange_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (worldId) {
      query = query.eq('world_id', worldId)
    }

    const { data, error } = await query.limit(50)
    
    if (error) throw error
    return data || []
  }
}

const exchangeAPI = new CurrencyExchangeAPI()

// GET - Fetch exchange rates and order history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Validate API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || !await validateApiKey(apiKey)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Rate limiting
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit.limit(identifier)
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    switch (action) {
      case 'rates': {
        const validation = PriceQuerySchema.safeParse(Object.fromEntries(searchParams))
        if (!validation.success) {
          return NextResponse.json(
            { error: 'Invalid parameters', details: validation.error.errors },
            { status: 400 }
          )
        }

        const rates = await exchangeAPI.getCurrentRates(validation.data.worldId)
        return NextResponse.json({ rates })
      }

      case 'orders': {
        const userId = searchParams.get('userId')
        const worldId = searchParams.get('worldId') || undefined

        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required' },
            { status: 400 }
          )
        }

        const orders = await exchangeAPI.getOrderHistory(userId, worldId)
        return NextResponse.json({ orders })
      }

      case 'quote': {
        const worldId = searchParams.get('worldId')
        const fromCurrency = searchParams.get('fromCurrency')
        const toCurrency = searchParams.get('toCurrency')
        const amount = parseFloat(searchParams.get('amount') || '0')

        if (!worldId || !fromCurrency || !toCurrency || !amount) {
          return NextResponse.json(
            { error: 'Missing required parameters' },
            { status: 400 }
          )
        }

        const quote = await exchangeAPI.calculateExchangeRate(
          fromCurrency,
          toCurrency,
          amount,
          worldId
        )

        return NextResponse.json({ quote })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Exchange API GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Execute exchanges and manage liquidity
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || !await validateApiKey(apiKey)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Rate limiting
    const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
    const { success } = await rateLimit.limit(identifier)
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const action = body.action

    switch (action) {
      case 'exchange': {
        const validation = ExchangeRequestSchema.safeParse(body)
        if (!validation.success) {
          return NextResponse.json(
            { error: 'Invalid request data', details: validation.error.errors },
            { status: 400 }
          )
        }

        const userId = request.headers.get('x-user-id')
        if (!userId) {
          return NextResponse.json(
            { error: 'User ID required' },
            { status: 401 }
          )
        }

        const {
          worldId,
          fromCurrency,
          toCurrency,
          amount,
          slippageTolerance
        } = validation.data

        // Get quote first
        const { expectedAmount } = await exchangeAPI.calculateExchangeRate(
          fromCurrency,
          toCurrency,
          amount,
          worldId
        )

        // Execute exchange
        const order = await exchangeAPI.executeExchange(
          userId,
          worldId,
          fromCurrency,
          toCurrency,
          amount,
          expectedAmount,
          slippageTolerance
        )

        return NextResponse.json({ order }, { status: 201 })
      }

      case 'add_liquidity': {
        const validation = AddLiquiditySchema.safeParse(body)
        if (!validation.success) {
          return NextResponse.json(
            { error: 'Invalid request data', details: validation.error.errors },
            { status: 400 }
          )
        }

        const userId = request.headers.get('x-user-id')
        if (!userId) {
          return NextResponse.json(
            { error: 'User ID required' },
            { status: 401 }
          )
        }

        const {
          worldId,
          currencyA,
          currencyB,
          amountA,
          amountB
        } = validation.data

        const result = await exchangeAPI.addLiquidity(
          userId,
          worldId,
          currencyA,
          currencyB,
          amountA,
          amountB
        )

        return NextResponse.json({ result }, { status: 201 })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Exchange API POST error:', error)
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// OPTIONS - CORS support
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-user-id',
    },
  })
}
```