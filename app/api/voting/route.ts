```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { validateRequest } from '@/lib/validation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schemas
const createProposalSchema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().min(50).max(5000),
  options: z.array(z.string().min(1).max(100)).min(2).max(10),
  voting_type: z.enum(['simple', 'weighted', 'quadratic']),
  duration_hours: z.number().min(1).max(168), // Max 1 week
  requires_delegation: z.boolean().optional().default(false),
  minimum_weight: z.number().min(0).optional().default(1),
});

const submitVoteSchema = z.object({
  proposal_id: z.string().uuid(),
  option_index: z.number().int().min(0),
  weight_override: z.number().min(0).optional(),
});

const createDelegationSchema = z.object({
  delegate_to: z.string().uuid(),
  proposal_categories: z.array(z.string()).optional(),
  expiry_date: z.string().datetime().optional(),
});

const updateProposalStatusSchema = z.object({
  proposal_id: z.string().uuid(),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']),
});

// Voting weight calculator
class WeightedVotingEngine {
  static async calculateVotingWeight(
    userId: string, 
    proposalId: string, 
    votingType: string
  ): Promise<number> {
    try {
      // Get user's base weight
      const { data: userWeight } = await supabase
        .from('voting_weights')
        .select('weight, reputation_score, stake_amount')
        .eq('user_id', userId)
        .single();

      if (!userWeight) return 1; // Default weight

      switch (votingType) {
        case 'weighted':
          return Math.max(1, userWeight.weight * (1 + userWeight.reputation_score * 0.1));
        
        case 'quadratic':
          return Math.sqrt(userWeight.stake_amount || 1);
        
        default:
          return 1;
      }
    } catch (error) {
      console.error('Weight calculation error:', error);
      return 1;
    }
  }

  static async applyDelegatedWeight(
    userId: string, 
    proposalId: string, 
    baseWeight: number
  ): Promise<number> {
    try {
      const { data: delegations } = await supabase
        .from('delegations')
        .select('delegator_id, weight_multiplier')
        .eq('delegate_id', userId)
        .eq('is_active', true)
        .lte('created_at', new Date().toISOString());

      const delegatedWeight = delegations?.reduce((total, delegation) => {
        return total + (delegation.weight_multiplier || 1);
      }, 0) || 0;

      return baseWeight + delegatedWeight;
    } catch (error) {
      console.error('Delegation weight error:', error);
      return baseWeight;
    }
  }
}

// Results calculator with transparency
class ResultsCalculator {
  static async calculateResults(proposalId: string) {
    try {
      const { data: proposal } = await supabase
        .from('voting_proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (!proposal) throw new Error('Proposal not found');

      const { data: votes } = await supabase
        .from('votes')
        .select(`
          *,
          users(id, username),
          delegations(delegator_id, weight_multiplier)
        `)
        .eq('proposal_id', proposalId);

      const results = proposal.options.map((option: string, index: number) => ({
        option,
        index,
        votes: 0,
        weight: 0,
        voters: [] as any[]
      }));

      let totalWeight = 0;
      let totalVotes = 0;

      for (const vote of votes || []) {
        const optionIndex = vote.option_index;
        if (optionIndex >= 0 && optionIndex < results.length) {
          results[optionIndex].votes += 1;
          results[optionIndex].weight += vote.voting_weight || 1;
          results[optionIndex].voters.push({
            user_id: vote.user_id,
            username: vote.users?.username,
            weight: vote.voting_weight || 1,
            timestamp: vote.created_at
          });
          
          totalWeight += vote.voting_weight || 1;
          totalVotes += 1;
        }
      }

      return {
        proposal_id: proposalId,
        status: proposal.status,
        total_votes: totalVotes,
        total_weight: totalWeight,
        results: results.map(result => ({
          ...result,
          percentage: totalWeight > 0 ? (result.weight / totalWeight) * 100 : 0
        })),
        voting_ended: new Date() > new Date(proposal.end_time),
        transparency: {
          voting_type: proposal.voting_type,
          minimum_weight: proposal.minimum_weight,
          delegation_enabled: proposal.requires_delegation
        }
      };
    } catch (error) {
      console.error('Results calculation error:', error);
      throw error;
    }
  }
}

// Vote validator
class VoteValidator {
  static async validateVoteEligibility(
    userId: string, 
    proposalId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if user already voted
      const { data: existingVote } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', userId)
        .eq('proposal_id', proposalId)
        .single();

      if (existingVote) {
        return { valid: false, reason: 'User has already voted' };
      }

      // Check proposal status and timing
      const { data: proposal } = await supabase
        .from('voting_proposals')
        .select('status, start_time, end_time, minimum_weight')
        .eq('id', proposalId)
        .single();

      if (!proposal) {
        return { valid: false, reason: 'Proposal not found' };
      }

      if (proposal.status !== 'active') {
        return { valid: false, reason: 'Proposal is not active' };
      }

      const now = new Date();
      if (now < new Date(proposal.start_time) || now > new Date(proposal.end_time)) {
        return { valid: false, reason: 'Voting period has ended or not started' };
      }

      // Check minimum weight requirement
      const userWeight = await WeightedVotingEngine.calculateVotingWeight(
        userId, 
        proposalId, 
        'weighted'
      );

      if (userWeight < (proposal.minimum_weight || 0)) {
        return { valid: false, reason: 'Insufficient voting weight' };
      }

      return { valid: true };
    } catch (error) {
      console.error('Vote validation error:', error);
      return { valid: false, reason: 'Validation failed' };
    }
  }
}

// Main API handlers
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(request, { max: 10, window: 60000 });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = auth.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'create_proposal': {
        const body = await request.json();
        const validatedData = createProposalSchema.parse(body);

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + validatedData.duration_hours * 60 * 60 * 1000);

        const { data: proposal, error } = await supabase
          .from('voting_proposals')
          .insert({
            title: validatedData.title,
            description: validatedData.description,
            options: validatedData.options,
            voting_type: validatedData.voting_type,
            creator_id: user.id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            status: 'active',
            requires_delegation: validatedData.requires_delegation,
            minimum_weight: validatedData.minimum_weight,
          })
          .select()
          .single();

        if (error) throw error;

        // Log transparency event
        await supabase.from('voting_audit_log').insert({
          proposal_id: proposal.id,
          user_id: user.id,
          action: 'create_proposal',
          details: { proposal_data: validatedData },
          timestamp: new Date().toISOString()
        });

        return NextResponse.json({ proposal }, { status: 201 });
      }

      case 'submit_vote': {
        const body = await request.json();
        const validatedData = submitVoteSchema.parse(body);

        const eligibility = await VoteValidator.validateVoteEligibility(
          user.id, 
          validatedData.proposal_id
        );

        if (!eligibility.valid) {
          return NextResponse.json(
            { error: eligibility.reason },
            { status: 400 }
          );
        }

        // Get proposal info for weight calculation
        const { data: proposal } = await supabase
          .from('voting_proposals')
          .select('voting_type')
          .eq('id', validatedData.proposal_id)
          .single();

        const baseWeight = await WeightedVotingEngine.calculateVotingWeight(
          user.id,
          validatedData.proposal_id,
          proposal?.voting_type || 'simple'
        );

        const finalWeight = await WeightedVotingEngine.applyDelegatedWeight(
          user.id,
          validatedData.proposal_id,
          validatedData.weight_override || baseWeight
        );

        const { data: vote, error } = await supabase
          .from('votes')
          .insert({
            user_id: user.id,
            proposal_id: validatedData.proposal_id,
            option_index: validatedData.option_index,
            voting_weight: finalWeight,
            ip_address: request.headers.get('x-forwarded-for') || 'unknown',
          })
          .select()
          .single();

        if (error) throw error;

        // Log vote for transparency
        await supabase.from('voting_audit_log').insert({
          proposal_id: validatedData.proposal_id,
          user_id: user.id,
          action: 'submit_vote',
          details: { 
            option_index: validatedData.option_index,
            voting_weight: finalWeight 
          },
          timestamp: new Date().toISOString()
        });

        return NextResponse.json({ vote }, { status: 201 });
      }

      case 'create_delegation': {
        const body = await request.json();
        const validatedData = createDelegationSchema.parse(body);

        // Prevent self-delegation
        if (validatedData.delegate_to === user.id) {
          return NextResponse.json(
            { error: 'Cannot delegate to yourself' },
            { status: 400 }
          );
        }

        // Check for circular delegation
        const { data: existingDelegation } = await supabase
          .from('delegations')
          .select('delegator_id')
          .eq('delegate_id', user.id)
          .eq('delegator_id', validatedData.delegate_to)
          .eq('is_active', true);

        if (existingDelegation && existingDelegation.length > 0) {
          return NextResponse.json(
            { error: 'Circular delegation detected' },
            { status: 400 }
          );
        }

        const { data: delegation, error } = await supabase
          .from('delegations')
          .insert({
            delegator_id: user.id,
            delegate_id: validatedData.delegate_to,
            proposal_categories: validatedData.proposal_categories || [],
            expiry_date: validatedData.expiry_date,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ delegation }, { status: 201 });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('POST /api/voting error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
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
    const rateLimitResult = await rateLimit(request, { max: 30, window: 60000 });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const proposalId = url.searchParams.get('proposal_id');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = (page - 1) * limit;

    switch (action) {
      case 'get_proposals': {
        const status = url.searchParams.get('status');
        const category = url.searchParams.get('category');

        let query = supabase
          .from('voting_proposals')
          .select(`
            *,
            users(username),
            votes(count)
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) {
          query = query.eq('status', status);
        }

        if (category) {
          query = query.contains('categories', [category]);
        }

        const { data: proposals, error } = await query;

        if (error) throw error;

        return NextResponse.json({
          proposals,
          pagination: {
            page,
            limit,
            has_more: proposals.length === limit
          }
        });
      }

      case 'get_results': {
        if (!proposalId) {
          return NextResponse.json(
            { error: 'Proposal ID required' },
            { status: 400 }
          );
        }

        const results = await ResultsCalculator.calculateResults(proposalId);
        return NextResponse.json({ results });
      }

      case 'get_user_delegations': {
        const auth = request.headers.get('authorization');
        if (!auth?.startsWith('Bearer ')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = auth.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
          return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { data: delegations, error } = await supabase
          .from('delegations')
          .select(`
            *,
            delegate:users!delegate_id(username),
            delegator:users!delegator_id(username)
          `)
          .or(`delegator_id.eq.${user.id},delegate_id.eq.${user.id}`)
          .eq('is_active', true);

        if (error) throw error;

        return NextResponse.json({ delegations });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GET /api/voting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(request, { max: 5, window: 60000 });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = auth.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateProposalStatusSchema.parse(body);

    // Verify user owns the proposal or is admin
    const { data: proposal } = await supabase
      .from('voting_proposals')
      .select('creator_id')
      .eq('id', validatedData.proposal_id)
      .single();

    if (!proposal || proposal.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to update this proposal' },
        { status: 403 }
      );
    }

    const { data: updatedProposal, error } = await supabase
      .from('voting_proposals')
      .update({ status: validatedData.status })
      .eq('id', validatedData.proposal_id)
      .select()
      .single();

    if (error) throw error;

    // Log status change
    await supabase.from('voting_audit_log').insert({
      proposal_id: validatedData.proposal_id,
      user_id: user.id,
      action: 'update_status',
      details: { new_status: validatedData.status },
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ proposal: updatedProposal });
  } catch (error) {
    console.error('PUT /api/voting error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
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