```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';
import { z } from 'zod';

// Environment variables validation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Request validation schema
const payoutRequestSchema = z.object({
  creator_id: z.string().uuid(),
  amount: z.number().positive().max(1000000),
  currency: z.string().length(3),
  destination_currency: z.string().length(3).optional(),
  payment_method: z.enum(['stripe', 'wise', 'bank_transfer', 'paypal']),
  destination_country: z.string().length(2),
  tax_form_submitted: z.boolean().optional(),
  compliance_verified: z.boolean().optional(),
});

// Currency converter service
class CurrencyConverter {
  private static async getExchangeRates(from: string, to: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.fixer.io/v1/convert?access_key=${process.env.FIXER_API_KEY}&from=${from}&to=${to}&amount=1`,
        { next: { revalidate: 300 } } // Cache for 5 minutes
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }
      
      const data = await response.json();
      return data.result || 1;
    } catch (error) {
      console.error('Exchange rate fetch failed:', error);
      return 1; // Fallback to 1:1 rate
    }
  }

  static async convertAmount(amount: number, from: string, to: string): Promise<{
    converted_amount: number;
    exchange_rate: number;
    conversion_fee: number;
  }> {
    if (from === to) {
      return { converted_amount: amount, exchange_rate: 1, conversion_fee: 0 };
    }

    const rate = await this.getExchangeRates(from, to);
    const converted_amount = amount * rate;
    const conversion_fee = converted_amount * 0.015; // 1.5% conversion fee
    
    return {
      converted_amount: converted_amount - conversion_fee,
      exchange_rate: rate,
      conversion_fee,
    };
  }
}

// Tax calculator service
class TaxCalculator {
  static async calculateTax(
    amount: number,
    currency: string,
    creatorCountry: string,
    creatorTaxStatus: string
  ): Promise<{
    tax_amount: number;
    tax_rate: number;
    tax_jurisdiction: string;
    withholding_required: boolean;
  }> {
    try {
      // Integration with tax calculation service (Avalara/TaxJar)
      const response = await fetch(`${process.env.TAX_SERVICE_URL}/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TAX_SERVICE_TOKEN}`,
        },
        body: JSON.stringify({
          amount,
          currency,
          country: creatorCountry,
          tax_status: creatorTaxStatus,
          transaction_type: 'creator_payout',
        }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Tax calculation service error:', error);
    }

    // Fallback tax calculation
    const defaultRates: Record<string, number> = {
      US: 0.24,
      GB: 0.20,
      CA: 0.26,
      DE: 0.25,
      FR: 0.25,
    };

    const tax_rate = defaultRates[creatorCountry] || 0.15;
    const tax_amount = amount * tax_rate;

    return {
      tax_amount,
      tax_rate,
      tax_jurisdiction: creatorCountry,
      withholding_required: creatorCountry !== 'US',
    };
  }
}

// Compliance checker service
class ComplianceReporter {
  static async performComplianceChecks(
    creatorId: string,
    amount: number,
    destinationCountry: string
  ): Promise<{
    passed: boolean;
    checks: Record<string, boolean>;
    risk_score: number;
    requires_manual_review: boolean;
  }> {
    const checks = {
      kyc_verified: false,
      sanctions_clear: false,
      aml_compliant: false,
      tax_info_complete: false,
      threshold_compliant: false,
    };

    try {
      // Check creator KYC status
      const { data: creator } = await supabase
        .from('creator_profiles')
        .select('kyc_status, tax_info_complete, country')
        .eq('id', creatorId)
        .single();

      checks.kyc_verified = creator?.kyc_status === 'verified';
      checks.tax_info_complete = creator?.tax_info_complete || false;

      // Sanctions screening
      const sanctionsResponse = await fetch(`${process.env.SANCTIONS_API_URL}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SANCTIONS_API_KEY}`,
        },
        body: JSON.stringify({
          creator_id: creatorId,
          destination_country: destinationCountry,
        }),
      });

      if (sanctionsResponse.ok) {
        const sanctionsResult = await sanctionsResponse.json();
        checks.sanctions_clear = !sanctionsResult.is_sanctioned;
      }

      // AML threshold check
      const { data: recentPayouts } = await supabase
        .from('payout_requests')
        .select('amount')
        .eq('creator_id', creatorId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const monthlyTotal = (recentPayouts?.reduce((sum, payout) => sum + payout.amount, 0) || 0) + amount;
      checks.threshold_compliant = monthlyTotal <= 10000; // $10K monthly limit
      checks.aml_compliant = monthlyTotal <= 50000; // $50K AML threshold

      const risk_score = Object.values(checks).filter(Boolean).length / Object.keys(checks).length;
      
      return {
        passed: Object.values(checks).every(Boolean),
        checks,
        risk_score,
        requires_manual_review: risk_score < 0.8 || amount > 25000,
      };
    } catch (error) {
      console.error('Compliance check failed:', error);
      return {
        passed: false,
        checks,
        risk_score: 0,
        requires_manual_review: true,
      };
    }
  }
}

// Payment gateway adapter
class PaymentGatewayAdapter {
  static async processStripePayout(
    amount: number,
    currency: string,
    destination: string,
    metadata: Record<string, any>
  ): Promise<{ payout_id: string; status: string; estimated_arrival: string }> {
    try {
      const payout = await stripe.payouts.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        destination,
        metadata: {
          ...metadata,
          processor: 'stripe',
        },
      });

      return {
        payout_id: payout.id,
        status: payout.status,
        estimated_arrival: new Date(payout.arrival_date * 1000).toISOString(),
      };
    } catch (error: any) {
      throw new Error(`Stripe payout failed: ${error.message}`);
    }
  }

  static async processWisePayout(
    amount: number,
    currency: string,
    destinationCountry: string,
    bankDetails: Record<string, any>
  ): Promise<{ payout_id: string; status: string; estimated_arrival: string }> {
    try {
      const response = await fetch(`${process.env.WISE_API_URL}/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WISE_API_TOKEN}`,
        },
        body: JSON.stringify({
          amount,
          sourceCurrency: currency,
          targetCurrency: currency,
          targetCountry: destinationCountry,
          bankDetails,
        }),
      });

      if (!response.ok) {
        throw new Error('Wise transfer creation failed');
      }

      const transfer = await response.json();
      
      return {
        payout_id: transfer.id,
        status: transfer.status,
        estimated_arrival: transfer.estimatedDelivery,
      };
    } catch (error: any) {
      throw new Error(`Wise payout failed: ${error.message}`);
    }
  }
}

// Audit logger
class AuditLogger {
  static async log(
    action: string,
    creatorId: string,
    payoutId: string,
    details: Record<string, any>,
    ipAddress: string
  ): Promise<void> {
    try {
      await supabase.from('audit_logs').insert({
        action,
        creator_id: creatorId,
        payout_id: payoutId,
        details,
        ip_address: ipAddress,
        timestamp: new Date().toISOString(),
        user_agent: details.user_agent || null,
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
}

// Main payout processor
class PayoutProcessor {
  static async processPayout(
    request: z.infer<typeof payoutRequestSchema>,
    ipAddress: string,
    userAgent: string
  ): Promise<{
    payout_id: string;
    status: string;
    converted_amount: number;
    tax_withheld: number;
    fees: number;
    estimated_arrival: string;
  }> {
    const requestId = crypto.randomUUID();
    
    try {
      // Step 1: Validate creator and get profile
      const { data: creator, error: creatorError } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('id', request.creator_id)
        .single();

      if (creatorError || !creator) {
        throw new Error('Creator not found or invalid');
      }

      // Step 2: Compliance checks
      const complianceResult = await ComplianceReporter.performComplianceChecks(
        request.creator_id,
        request.amount,
        request.destination_country
      );

      if (!complianceResult.passed || complianceResult.requires_manual_review) {
        await supabase.from('payout_requests').insert({
          id: requestId,
          creator_id: request.creator_id,
          amount: request.amount,
          currency: request.currency,
          status: 'compliance_review',
          compliance_checks: complianceResult.checks,
          risk_score: complianceResult.risk_score,
        });

        throw new Error('Payout requires manual compliance review');
      }

      // Step 3: Currency conversion
      const destinationCurrency = request.destination_currency || request.currency;
      const conversionResult = await CurrencyConverter.convertAmount(
        request.amount,
        request.currency,
        destinationCurrency
      );

      // Step 4: Tax calculation
      const taxResult = await TaxCalculator.calculateTax(
        conversionResult.converted_amount,
        destinationCurrency,
        request.destination_country,
        creator.tax_status
      );

      const netAmount = conversionResult.converted_amount - taxResult.tax_amount;
      const totalFees = conversionResult.conversion_fee;

      // Step 5: Create payout request record
      const { data: payoutRequest, error: insertError } = await supabase
        .from('payout_requests')
        .insert({
          id: requestId,
          creator_id: request.creator_id,
          amount: request.amount,
          currency: request.currency,
          destination_currency: destinationCurrency,
          converted_amount: conversionResult.converted_amount,
          exchange_rate: conversionResult.exchange_rate,
          conversion_fee: conversionResult.conversion_fee,
          tax_amount: taxResult.tax_amount,
          tax_rate: taxResult.tax_rate,
          net_amount: netAmount,
          payment_method: request.payment_method,
          destination_country: request.destination_country,
          status: 'processing',
          compliance_checks: complianceResult.checks,
          risk_score: complianceResult.risk_score,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create payout request: ${insertError.message}`);
      }

      // Step 6: Process payment through appropriate gateway
      let paymentResult;
      
      switch (request.payment_method) {
        case 'stripe':
          paymentResult = await PaymentGatewayAdapter.processStripePayout(
            netAmount,
            destinationCurrency,
            creator.stripe_account_id,
            {
              creator_id: request.creator_id,
              payout_request_id: requestId,
            }
          );
          break;
          
        case 'wise':
          paymentResult = await PaymentGatewayAdapter.processWisePayout(
            netAmount,
            destinationCurrency,
            request.destination_country,
            creator.bank_details
          );
          break;
          
        default:
          throw new Error(`Unsupported payment method: ${request.payment_method}`);
      }

      // Step 7: Update payout request with payment details
      await supabase
        .from('payout_requests')
        .update({
          external_payout_id: paymentResult.payout_id,
          status: paymentResult.status,
          estimated_arrival: paymentResult.estimated_arrival,
          processed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      // Step 8: Generate compliance report
      await supabase.from('compliance_logs').insert({
        payout_request_id: requestId,
        creator_id: request.creator_id,
        amount: request.amount,
        destination_country: request.destination_country,
        compliance_checks: complianceResult.checks,
        risk_score: complianceResult.risk_score,
        tax_withheld: taxResult.tax_amount,
        reporting_required: taxResult.withholding_required,
      });

      // Step 9: Audit logging
      await AuditLogger.log(
        'payout_processed',
        request.creator_id,
        requestId,
        {
          amount: request.amount,
          currency: request.currency,
          payment_method: request.payment_method,
          user_agent: userAgent,
        },
        ipAddress
      );

      return {
        payout_id: requestId,
        status: paymentResult.status,
        converted_amount: conversionResult.converted_amount,
        tax_withheld: taxResult.tax_amount,
        fees: totalFees,
        estimated_arrival: paymentResult.estimated_arrival,
      };

    } catch (error) {
      // Log error for debugging
      console.error('Payout processing failed:', error);
      
      // Update payout request status if it exists
      await supabase
        .from('payout_requests')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', requestId);

      throw error;
    }
  }
}

// API Routes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = payoutRequestSchema.parse(body);
    
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const result = await PayoutProcessor.processPayout(
      validatedData,
      ipAddress,
      userAgent
    );

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 200 });

  } catch (error) {
    console.error('Multi-currency payout API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorId = searchParams.get('creator_id');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!creatorId) {
      return NextResponse.json({
        success: false,
        error: 'Creator ID is required',
      }, { status: 400 });
    }

    let query = supabase
      .from('payout_requests')
      .select(`
        id,
        amount,
        currency,
        destination_currency,
        net_amount,
        status,
        payment_method,
        estimated_arrival,
        created_at,
        processed_at
      `)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: payouts, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch payouts: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data: payouts,
    }, { status: 200 });

  } catch (error) {
    console.error('Get payouts error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
```