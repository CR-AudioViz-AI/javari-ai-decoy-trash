```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ethers } from 'ethers';
import { rateLimit } from '@/lib/rate-limit';
import { validateApiKey } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

// Validation schemas
const createProposalSchema = z.object({
  title: z.string().min(10).max(200).trim(),
  description: z.string().min(50).max(5000).trim(),
  category: z.enum(['technical', 'economic', 'governance', 'community']),
  votingPeriod: z.number().min(24).max(336), // 1 day to 14 days in hours
  quorumThreshold: z.number().min(0.1).max(1), // 10% to 100%
  options: z.array(z.string().min(1).max(100)).min(2).max(10),
  metadata: z.record(z.string()).optional(),
});

const voteSchema = z.object({
  proposalId: z.string().uuid(),
  optionIndex: z.number().min(0),
  signature: z.string().min(132).max(132), // Ethereum signature length
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  timestamp: z.number(),
});

const governanceQuerySchema = z.object({
  status: z.enum(['active', 'pending', 'executed', 'failed', 'all']).optional().default('active'),
  category: z.enum(['technical', 'economic', 'governance', 'community', 'all']).optional().default('all'),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).refine(val => val <= 50).optional().default(20),
  sortBy: z.enum(['created_at', 'vote_count', 'quorum_progress']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Web3 provider setup
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const governanceContract = new ethers.Contract(
  process.env.GOVERNANCE_CONTRACT_ADDRESS!,
  JSON.parse(process.env.GOVERNANCE_CONTRACT_ABI!),
  provider
);

interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  category: string;
  creator_address: string;
  status: 'pending' | 'active' | 'executed' | 'failed';
  voting_starts_at: string;
  voting_ends_at: string;
  quorum_threshold: number;
  vote_count: number;
  quorum_progress: number;
  options: string[];
  results: Record<string, number>;
  blockchain_tx_hash?: string;
  ipfs_hash?: string;
  created_at: string;
  updated_at: string;
}

interface VoteWeight {
  address: string;
  weight: number;
  basis: 'token_balance' | 'reputation' | 'stake_duration';
}

// GET - Fetch governance proposals
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 100, 60); // 100 requests per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    // Validate query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const validatedQuery = governanceQuerySchema.parse(queryParams);

    // Build query
    let query = supabase
      .from('governance_proposals')
      .select(`
        *,
        votes:governance_votes(count),
        vote_results:governance_vote_results(*)
      `);

    // Apply filters
    if (validatedQuery.status !== 'all') {
      query = query.eq('status', validatedQuery.status);
    }

    if (validatedQuery.category !== 'all') {
      query = query.eq('category', validatedQuery.category);
    }

    // Apply sorting and pagination
    const offset = (validatedQuery.page - 1) * validatedQuery.limit;
    query = query
      .order(validatedQuery.sortBy, { ascending: validatedQuery.sortOrder === 'asc' })
      .range(offset, offset + validatedQuery.limit - 1);

    const { data: proposals, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch proposals' },
        { status: 500 }
      );
    }

    // Enrich with blockchain data
    const enrichedProposals = await Promise.all(
      (proposals || []).map(async (proposal: any) => {
        try {
          // Get current vote counts from blockchain
          const blockchainData = await governanceContract.getProposal(proposal.id);
          
          return {
            ...proposal,
            vote_count: blockchainData.totalVotes.toString(),
            quorum_progress: blockchainData.quorumProgress / 100,
            results: blockchainData.results || proposal.results,
          };
        } catch (blockchainError) {
          console.warn('Blockchain data unavailable for proposal:', proposal.id);
          return proposal;
        }
      })
    );

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('governance_proposals')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      data: {
        proposals: enrichedProposals,
        pagination: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / validatedQuery.limit),
        },
      },
    });

  } catch (error) {
    console.error('GET /api/governance error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new governance proposal
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 10, 3600); // 10 proposals per hour
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    // Validate API key or authentication
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = createProposalSchema.parse(body);

    // Extract wallet address from authorization
    const walletAddress = request.headers.get('x-wallet-address');
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Valid wallet address required' },
        { status: 400 }
      );
    }

    // Validate user has sufficient governance tokens
    const userBalance = await governanceContract.balanceOf(walletAddress);
    const minProposalThreshold = await governanceContract.proposalThreshold();
    
    if (userBalance < minProposalThreshold) {
      return NextResponse.json(
        { error: 'Insufficient governance tokens to create proposal' },
        { status: 403 }
      );
    }

    // Calculate voting period
    const votingStartsAt = new Date();
    votingStartsAt.setHours(votingStartsAt.getHours() + 24); // 24 hour delay
    const votingEndsAt = new Date(votingStartsAt);
    votingEndsAt.setHours(votingEndsAt.getHours() + validatedData.votingPeriod);

    // Store in database
    const { data: proposal, error: dbError } = await supabase
      .from('governance_proposals')
      .insert({
        title: validatedData.title,
        description: validatedData.description,
        category: validatedData.category,
        creator_address: walletAddress.toLowerCase(),
        status: 'pending',
        voting_starts_at: votingStartsAt.toISOString(),
        voting_ends_at: votingEndsAt.toISOString(),
        quorum_threshold: validatedData.quorumThreshold,
        options: validatedData.options,
        results: validatedData.options.reduce((acc, _, index) => {
          acc[index.toString()] = 0;
          return acc;
        }, {} as Record<string, number>),
        metadata: validatedData.metadata || {},
        vote_count: 0,
        quorum_progress: 0,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create proposal' },
        { status: 500 }
      );
    }

    try {
      // Deploy voting contract on blockchain
      const signer = new ethers.Wallet(process.env.GOVERNANCE_PRIVATE_KEY!, provider);
      const contractWithSigner = governanceContract.connect(signer);
      
      const tx = await contractWithSigner.createProposal(
        proposal.id,
        validatedData.options.length,
        Math.floor(votingStartsAt.getTime() / 1000),
        Math.floor(votingEndsAt.getTime() / 1000),
        Math.floor(validatedData.quorumThreshold * 10000) // Convert to basis points
      );

      // Update proposal with blockchain transaction hash
      await supabase
        .from('governance_proposals')
        .update({ 
          blockchain_tx_hash: tx.hash,
          status: 'active'
        })
        .eq('id', proposal.id);

      // Log audit event
      await logAuditEvent({
        event_type: 'proposal_created',
        user_address: walletAddress,
        resource_id: proposal.id,
        metadata: {
          title: validatedData.title,
          category: validatedData.category,
          tx_hash: tx.hash,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          proposal: {
            ...proposal,
            blockchain_tx_hash: tx.hash,
            status: 'active',
          },
          transaction: {
            hash: tx.hash,
            confirmationUrl: `${process.env.BLOCKCHAIN_EXPLORER_URL}/tx/${tx.hash}`,
          },
        },
      }, { status: 201 });

    } catch (blockchainError) {
      console.error('Blockchain error:', blockchainError);
      
      // Mark proposal as failed in database
      await supabase
        .from('governance_proposals')
        .update({ status: 'failed' })
        .eq('id', proposal.id);

      return NextResponse.json(
        { error: 'Failed to deploy proposal on blockchain' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('POST /api/governance error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update proposal status or execute proposal
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 20, 3600); // 20 updates per hour
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { proposalId, action, signature } = body;

    if (!proposalId || !action) {
      return NextResponse.json(
        { error: 'Proposal ID and action required' },
        { status: 400 }
      );
    }

    // Get proposal
    const { data: proposal, error: fetchError } = await supabase
      .from('governance_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    if (action === 'execute') {
      // Check if voting period has ended and quorum is met
      const now = new Date();
      const votingEnds = new Date(proposal.voting_ends_at);
      
      if (now < votingEnds) {
        return NextResponse.json(
          { error: 'Voting period has not ended' },
          { status: 400 }
        );
      }

      if (proposal.quorum_progress < proposal.quorum_threshold) {
        return NextResponse.json(
          { error: 'Quorum not reached' },
          { status: 400 }
        );
      }

      // Execute proposal on blockchain
      const signer = new ethers.Wallet(process.env.GOVERNANCE_PRIVATE_KEY!, provider);
      const contractWithSigner = governanceContract.connect(signer);
      
      try {
        const tx = await contractWithSigner.executeProposal(proposalId);
        
        // Update proposal status
        const { error: updateError } = await supabase
          .from('governance_proposals')
          .update({ 
            status: 'executed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', proposalId);

        if (updateError) {
          console.error('Database update error:', updateError);
        }

        return NextResponse.json({
          success: true,
          data: {
            proposalId,
            status: 'executed',
            transactionHash: tx.hash,
          },
        });

      } catch (execError) {
        console.error('Execution error:', execError);
        return NextResponse.json(
          { error: 'Failed to execute proposal' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('PUT /api/governance error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel proposal (only by creator)
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 5, 3600); // 5 cancellations per hour
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', resetTime: rateLimitResult.resetTime },
        { status: 429 }
      );
    }

    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const proposalId = url.searchParams.get('id');
    const walletAddress = request.headers.get('x-wallet-address');

    if (!proposalId || !walletAddress) {
      return NextResponse.json(
        { error: 'Proposal ID and wallet address required' },
        { status: 400 }
      );
    }

    // Get proposal and verify ownership
    const { data: proposal, error: fetchError } = await supabase
      .from('governance_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    if (proposal.creator_address !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Only proposal creator can cancel' },
        { status: 403 }
      );
    }

    if (proposal.status !== 'pending' && proposal.status !== 'active') {
      return NextResponse.json(
        { error: 'Cannot cancel executed or failed proposal' },
        { status: 400 }
      );
    }

    // Update proposal status
    const { error: updateError } = await supabase
      .from('governance_proposals')
      .update({ 
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to cancel proposal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Proposal cancelled successfully',
    });

  } catch (error) {
    console.error('DELETE /api/governance error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```