/**
 * Entry Executor (Simplified)
 *
 * Handles position sizing and preparation for entry trades.
 * Swap execution can be added as a follow-up.
 */

import { logger } from '../utils/logger';
import type { EntrySignal } from './validator';
import type { JupiterQuoteResponse } from '../jupiter/client';
import { getQuote } from '../jupiter/client';
import type { Position } from '../db/schema';
import { getDbClient } from '../db/client';
import { createPositionRepository } from '../db/repositories/positions';
import { createTokenMetadataRepository } from '../db/repositories/token-metadata';

// Get database client and initialize repositories
const positionsRepo = createPositionRepository(getDbClient().getDb());
const tokenMetadataRepo = createTokenMetadataRepository(getDbClient().getDb());

// ============================================================================
// TYPES
// ============================================================================

export interface EntryOptions {
  // Amount of SOL to spend (in lamports, as string for precision)
  inputAmount: string;
  // Slippage tolerance in basis points (1% = 100 bps)
  slippageBps: number;
}

export interface EntryResult {
  success: boolean;
  dryRun?: boolean;
  position?: Position;
  error?: string;
  data: {
    signal: EntrySignal;
    quote?: JupiterQuoteResponse;
    inputAmount: string;
    expectedOutput?: string;
  };
}

export interface PositionSizeInfo {
  inputAmountSol: number;
  inputAmountLamports: string;
  expectedTokens: string;
  tokenDecimals: number;
  entryPricePerToken: number;
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_ENTRY_OPTIONS: EntryOptions = {
  inputAmount: '100000000', // 0.1 SOL = 100M lamports
  slippageBps: 100, // 1%
};

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Prepare an entry trade (dry run)
 *
 * Gets quote and calculates position details without executing.
 */
export async function prepareEntry(
  signal: EntrySignal,
  options: EntryOptions = DEFAULT_ENTRY_OPTIONS
): Promise<EntryResult> {
  logger.info(
    {
      symbol: signal.symbol,
      address: signal.address,
      inputAmount: options.inputAmount,
    },
    'Preparing entry trade'
  );

  try {
    // 1. Get Jupiter quote
    const quote = await getQuote({
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: signal.address,
      amount: options.inputAmount,
      slippageBps: options.slippageBps,
    });

    if (!quote) {
      return {
        success: false,
        error: 'Failed to get quote from Jupiter',
        data: {
          signal,
          inputAmount: options.inputAmount,
        },
      };
    }

    logger.debug(
      {
        inputAmount: options.inputAmount,
        expectedOutput: quote.outAmount,
        priceImpact: quote.priceImpactPct,
      },
      'Got Jupiter quote'
    );

    // 2. Calculate position size info
    const positionSize = calculatePositionSize(signal, quote, options);

    // 3. Store "dry run" position in database
    const position = await storePosition(
      signal,
      null, // No TX ID for dry run
      positionSize,
      quote,
      true // dry run
    );

    logger.info(
      {
        positionId: position.id,
        symbol: position.tokenMint,
        dryRun: true,
      },
      'Entry prepared successfully (dry run)'
    );

    return {
      success: true,
      dryRun: true,
      position,
      data: {
        signal,
        quote,
        inputAmount: options.inputAmount,
        expectedOutput: quote.outAmount,
      },
    };
  } catch (error) {
    logger.error({ error, signal }, 'Entry preparation failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: {
        signal,
        inputAmount: options.inputAmount,
      },
    };
  }
}

/**
 * Calculate position size information
 *
 * CRITICAL: This captures all data needed for accurate exit later
 */
function calculatePositionSize(
  signal: EntrySignal,
  quote: JupiterQuoteResponse,
  options: EntryOptions
): PositionSizeInfo {
  // The quote gives us the expected output in raw format
  const expectedTokens = quote.outAmount;

  // For now, we'll use a default decimal - in production this would be fetched
  const tokenDecimals = 6;

  // Calculate entry price in SOL per token
  const solAmount = parseFloat(options.inputAmount) / 1_000_000_000; // Convert lamports to SOL
  const tokenAmount = parseFloat(expectedTokens) / Math.pow(10, tokenDecimals);
  const entryPricePerToken = tokenAmount > 0 ? solAmount / tokenAmount : 1 / signal.priceUsd;

  return {
    inputAmountSol: solAmount,
    inputAmountLamports: options.inputAmount,
    expectedTokens, // RAW AMOUNT - CRITICAL for accurate exit
    tokenDecimals,
    entryPricePerToken,
  };
}

/**
 * Store position in database
 *
 * CRITICAL: Stores tokensReceivedRaw as the exact value from Jupiter
 */
async function storePosition(
  signal: EntrySignal,
  _txId: string | null,
  positionSize: PositionSizeInfo,
  _quote: JupiterQuoteResponse | null,
  _dryRun: boolean
): Promise<Position> {
  const now = Math.floor(Date.now() / 1000);

  // First, ensure token metadata exists
  try {
    tokenMetadataRepo.create({
      id: signal.address,
      symbol: signal.symbol,
      name: signal.name,
      decimals: positionSize.tokenDecimals,
    });
  } catch (error) {
    // Metadata may already exist, that's fine
    logger.debug({ error }, 'Token metadata may already exist');
  }

  // Create position with correct schema fields
  const position: Position = {
    id: crypto.randomUUID(),
    state: _dryRun ? 'ENTERING' : 'ACTIVE',
    tokenMint: signal.address,
    entrySolSpent: positionSize.inputAmountLamports,
    entryTimestamp: now,
    entryPricePerToken: positionSize.entryPricePerToken,
    // CRITICAL: Store raw amount from Jupiter
    tokensReceivedRaw: positionSize.expectedTokens,
    tokenDecimals: positionSize.tokenDecimals,
    // Exit data (null until exit)
    exitTimestamp: null,
    exitSolReceived: null,
    exitPricePerToken: null,
    exitReason: null,
    // Performance tracking
    peakPricePerToken: positionSize.entryPricePerToken,
    peakTimestamp: now,
    // Metadata
    createdAt: now,
    updatedAt: now,
  };

  // Store in database
  await positionsRepo.create(position);

  logger.debug(
    {
      positionId: position.id,
      tokenMint: position.tokenMint,
      tokensReceivedRaw: position.tokensReceivedRaw,
      entryPricePerToken: position.entryPricePerToken,
    },
    'Position stored in database'
  );

  return position;
}

/**
 * Get current open positions
 */
export async function getOpenPositions(): Promise<Position[]> {
  const positions = await positionsRepo.findAll();
  return positions.filter(p => p.state === 'ACTIVE' || p.state === 'ENTERING');
}

/**
 * Calculate recommended position size based on compounding stage
 */
export function calculatePositionSizeForStage(
  currentSolHolding: number
): { amountSol: number; amountLamports: string } {
  const BUILD_STAGE_TARGET = 0.3;
  const GROWTH_STAGE_TARGET = 1.0;

  let amountSol: number;

  if (currentSolHolding < BUILD_STAGE_TARGET) {
    // Build Stage: Fixed 0.1 SOL
    amountSol = 0.1;
  } else if (currentSolHolding < GROWTH_STAGE_TARGET) {
    // Growth Stage: Scale from 0.15 to 0.25 SOL
    const progress = (currentSolHolding - BUILD_STAGE_TARGET) / (GROWTH_STAGE_TARGET - BUILD_STAGE_TARGET);
    amountSol = 0.15 + (progress * 0.10);
  } else {
    // Expansion Stage: 20% of portfolio
    amountSol = currentSolHolding * 0.2;
  }

  // Convert to lamports
  const amountLamports = Math.floor(amountSol * 1_000_000_000).toString();

  logger.debug(
    {
      currentSolHolding,
      stage: currentSolHolding < BUILD_STAGE_TARGET ? 'build' :
             currentSolHolding < GROWTH_STAGE_TARGET ? 'growth' : 'expansion',
      amountSol,
    },
    'Calculated position size'
  );

  return { amountSol, amountLamports };
}

/**
 * Format entry result for logging
 */
export function formatEntryResult(result: EntryResult): string {
  if (!result.success) {
    return [
      '❌ Entry Failed',
      `  Error: ${result.error}`,
      `  Token: ${result.data.signal.symbol}`,
    ].join('\n');
  }

  const lines = [
    result.dryRun ? '✅ Entry Prepared (Dry Run)' : '✅ Entry Executed',
    `  Token: ${result.data.signal.symbol} (${result.data.signal.name})`,
    `  SOL Input: ${result.data.inputAmount} lamports`,
    `  Expected Output: ${result.data.expectedOutput}`,
    '',
    'Position Details:',
  ];

  if (result.position) {
    const p = result.position;
    lines.push(
      `  ID: ${p.id}`,
      `  State: ${p.state}`,
      `  Entry Price: ${p.entryPricePerToken.toFixed(6)} SOL/token`,
      `  Raw Tokens: ${p.tokensReceivedRaw}`,
      `  Token Decimals: ${p.tokenDecimals}`
    );
  }

  return lines.join('\n');
}
