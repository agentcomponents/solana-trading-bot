/**
 * Exit Executor
 *
 * Executes exit trades via Jupiter API.
 * CRITICAL: Uses tokensReceivedRaw directly for accurate exit amounts.
 */

import BN from 'bn.js';
import type { Position, PositionState, ExitReason } from '../db/schema';
import { getDbClient } from '../db/client';
import { createPositionRepository } from '../db/repositories/positions';
import { getQuote } from '../jupiter/client';
import { logger } from '../utils/logger';
import { EXIT_CONFIG, type ExitType } from './config';
import { exitStrategy, getRemainingPercent } from './strategy';

// ============================================================================
// CONSTANTS
// ============================================================================

/** SOL mint address on Solana */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Exit execution result
 */
export interface ExitResult {
  success: boolean;
  dryRun?: boolean;
  txId?: string;
  expectedSol?: string;
  newRemainingRaw?: string; // Updated tokensReceivedRaw after partial exit
  newState?: PositionState;
  error?: string;
}

/**
 * Exit execution options
 */
export interface ExitOptions {
  dryRun?: boolean;
  priorityFee?: number; // Lamports
  slippageBps?: number;
}

// ============================================================================
// EXIT EXECUTOR
// ============================================================================

/**
 * Calculate the raw amount to sell for a partial exit
 *
 * CRITICAL: This uses the stored tokensReceivedRaw directly.
 * No decimal conversion is performed.
 */
function calculateSellAmount(
  position: Position,
  percentOfRemaining: number
): string {
  const totalRaw = new BN(position.tokensReceivedRaw);
  const sellRaw = totalRaw.muln(percentOfRemaining / 100);
  return sellRaw.toString(10);
}

/**
 * Execute exit trade via Jupiter
 *
 * This function:
 * 1. Gets a quote from Jupiter for the exit
 * 2. Prepares the swap transaction
 * 3. Returns execution details (dry-run only for now)
 *
 * CRITICAL: Uses position.tokensReceivedRaw directly for the exit amount.
 */
export async function executeExit(
  position: Position,
  percentToSell: number,
  reason: string,
  options: ExitOptions = {}
): Promise<ExitResult> {
  const dryRun = options.dryRun ?? true;
  const slippageBps = options.slippageBps ?? EXIT_CONFIG.NORMAL_SLIPPAGE_BPS;

  logger.info(
    {
      tokenMint: position.tokenMint,
      state: position.state,
      percentToSell,
      dryRun,
      priorityFee: options.priorityFee,
    },
    'Executing exit'
  );

  try {
    // Calculate raw amount to sell
    const sellAmountRaw = calculateSellAmount(position, percentToSell);

    logger.debug(
      {
        tokensReceivedRaw: position.tokensReceivedRaw,
        sellAmountRaw,
        percentToSell,
      },
      'Calculated exit amount'
    );

    // Get quote from Jupiter
    const quote = await getQuote({
      inputMint: position.tokenMint,
      outputMint: SOL_MINT,
      amount: sellAmountRaw,
      slippageBps,
    });

    logger.debug(
      {
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
      },
      'Jupiter exit quote received'
    );

    // Calculate expected SOL output (for display)
    const expectedSolLamports = new BN(quote.outAmount);
    const expectedSol = expectedSolLamports.div(new BN(1_000_000_000)).toString();

    logger.info(
      {
        expectedSol,
        priceImpact: quote.priceImpactPct ? `${quote.priceImpactPct}%` : undefined,
      },
      'Exit quote obtained'
    );

    // For dry run, we don't execute the actual swap
    if (dryRun) {
      // Calculate new remaining amount after partial exit
      const totalRaw = new BN(position.tokensReceivedRaw);
      const soldRaw = new BN(sellAmountRaw);
      const newRemainingRaw = totalRaw.sub(soldRaw).toString(10);

      // Determine new state
      const exitType = determineExitType(reason);
      const newState = exitStrategy.getNextState(position.state, exitType);

      logger.info(
        {
          expectedSol,
          newRemainingRaw,
          newState,
        },
        'Dry run exit complete'
      );

      return {
        success: true,
        dryRun: true,
        expectedSol: expectedSol.toString(),
        newRemainingRaw,
        newState,
      };
    }

    // TODO: Implement actual swap execution
    // For now, only dry run is supported
    logger.warn('Live exit execution not yet implemented');

    return {
      success: false,
      error: 'Live exit execution not yet implemented',
    };

  } catch (error) {
    logger.error({ error }, 'Exit execution failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Determine exit type from reason string
 */
function determineExitType(reason: string): ExitType {
  if (reason.includes('Stop loss')) return 'stop_loss';
  if (reason.includes('+50%')) return 'take_profit_1';
  if (reason.includes('+100%')) return 'take_profit_2';
  if (reason.includes('Trailing')) return 'trailing_stop';
  if (reason.includes('Max hold')) return 'max_hold';
  if (reason.includes('Emergency')) return 'emergency';
  return 'max_hold'; // Default
}

/**
 * Record exit in database
 *
 * This updates the position state and stores exit information.
 */
export async function recordExit(
  positionId: string,
  exitData: {
    exitSolReceived: string; // Raw lamports
    exitPricePerToken: number;
    exitReason: ExitReason;
    newState: PositionState;
  }
): Promise<Position | null> {
  const db = getDbClient();
  const positionsRepo = createPositionRepository(db.getDb());

  // Update position with exit data
  // For full exits, we use recordExit which closes the position
  // For partial exits, we need to update the tokensReceivedRaw

  const position = positionsRepo.findById(positionId);
  if (!position) {
    logger.error({ positionId }, 'Position not found for exit recording');
    return null;
  }

  // Check if this is a full exit
  const remaining = getRemainingPercent(exitData.newState);
  if (remaining === 0) {
    // Full exit - use recordExit
    const result = positionsRepo.recordExit(
      positionId,
      exitData.exitSolReceived,
      exitData.exitPricePerToken,
      exitData.exitReason
    );

    if (!result) {
      logger.error({ positionId }, 'Failed to record exit');
      return null;
    }

    logger.info(
      {
        positionId,
        exitReason: exitData.exitReason,
        exitSolReceived: exitData.exitSolReceived,
      },
      'Full exit recorded'
    );

    return result;
  }

  // Partial exit - update state and remaining amount
  // Calculate new tokensReceivedRaw based on percentage sold
  // This is handled by the executor returning newRemainingRaw
  const updated = positionsRepo.updateState(positionId, exitData.newState);

  if (!updated) {
    logger.error({ positionId }, 'Failed to update position state');
    return null;
  }

  logger.info(
    {
      positionId,
      newState: exitData.newState,
    },
    'Partial exit recorded'
  );

  return updated;
}

/**
 * Exit Executor Class
 *
 * Higher-level interface for executing exits.
 */
export class ExitExecutor {
  /**
   * Execute an exit with full database recording
   */
  async executeAndRecord(
    position: Position,
    percentToSell: number,
    reason: string,
    options: ExitOptions = {}
  ): Promise<ExitResult> {
    // Execute the exit
    const result = await executeExit(position, percentToSell, reason, options);

    if (!result.success) {
      return result;
    }

    // Record the exit if not dry run
    if (!options.dryRun && result.expectedSol) {
      // For dry run, we don't record to database
      // For live trading, we would:
      // 1. Record the exit transaction
      // 2. Update position state
      // 3. Update tokensReceivedRaw for partial exits

      logger.info('Skip database recording for dry run');
    }

    return result;
  }

  /**
   * Execute emergency exit (sell everything immediately)
   */
  async executeEmergencyExit(
    position: Position,
    reason: string
  ): Promise<ExitResult> {
    logger.error(
      {
        tokenMint: position.tokenMint,
        reason,
      },
      'Executing emergency exit'
    );

    return executeExit(position, 100, reason, {
      dryRun: false, // Emergency exits are NOT dry runs
      priorityFee: EXIT_CONFIG.EMERGENCY_FEE,
      slippageBps: EXIT_CONFIG.EMERGENCY_SLIPPAGE_BPS,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const exitExecutor = new ExitExecutor();
