/**
 * Exit Strategy
 *
 * Evaluates all exit conditions and determines when to exit positions.
 * Implements the user-approved exit strategy:
 * - Stop Loss: -40%
 * - Take Profit 1: +50% (sell 25%)
 * - Take Profit 2: +100% (sell 25%, activate trailing)
 * - Trailing Stop: 15% below peak
 * - Max Hold Time: 4 hours
 * - Emergency: Liquidity crash / rug detected
 */

import type { Position, PositionState } from '../db/schema';
import { logger } from '../utils/logger';
import { EXIT_CONFIG, STATE_TRANSITIONS, type ExitType } from './config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Exit decision returned by strategy evaluation
 */
export interface ExitDecision {
  shouldExit: boolean;
  reason: string;
  exitType: ExitType;
  percentToSell: number; // % of remaining position to sell
  priorityFee: number; // Lamports
  slippageBps: number;
}

/**
 * Price update for monitoring
 */
export interface PriceUpdate {
  tokenMint: string;
  currentPrice: number; // Current price in SOL per token
  pnlPercent: number; // P&L as percentage
  timestamp: number;
}

// ============================================================================
// EXIT STRATEGY
// ============================================================================

/**
 * Calculate P&L percentage from entry price
 */
export function calculatePnlPercent(entryPrice: number, currentPrice: number): number {
  if (entryPrice <= 0) return 0;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

/**
 * Calculate how far below peak price we are (for trailing stop)
 */
export function calculateTrailingPercent(peakPrice: number, currentPrice: number): number {
  if (peakPrice <= 0) return 0;
  return ((peakPrice - currentPrice) / peakPrice) * 100;
}

/**
 * Get human-readable price format
 */
export function formatPrice(price: number): string {
  return `${price.toFixed(6)} SOL`;
}

/**
 * Get the percent of position remaining based on state
 *
 * This tracks how much of the original position is still held
 * after partial exits.
 */
export function getRemainingPercent(state: PositionState): number {
  switch (state) {
    case 'ACTIVE':
      return 100;
    case 'PARTIAL_EXIT_1':
      return 50; // Sold 50% at TP1
    case 'PARTIAL_EXIT_2':
      return 50;
    case 'TRAILING':
      return 50; // Sold 50% at TP1, trailing active
    case 'ENTERING':
    case 'EXITING':
    case 'CLOSED':
    case 'FAILED':
      return 0;
    default:
      return 100;
  }
}

/**
 * Check if trailing stop should be active for current state
 */
export function isTrailingActive(state: PositionState): boolean {
  return state === 'PARTIAL_EXIT_2' || state === 'TRAILING';
}

/**
 * Exit Strategy Class
 *
 * Evaluates all exit conditions and returns exit decisions.
 */
export class ExitStrategy {
  /**
   * Evaluate all exit conditions for a position
   *
   * Returns an exit decision if any condition is triggered, null otherwise.
   */
  evaluate(position: Position, currentPrice: number): ExitDecision | null {
    const pnlPercent = calculatePnlPercent(position.entryPricePerToken, currentPrice);

    // Check conditions in priority order (most urgent first)
    return (
      this.checkStopLoss(position, currentPrice, pnlPercent) ??
      this.checkTakeProfit1(position, currentPrice, pnlPercent) ??
      this.checkTakeProfit2(position, currentPrice, pnlPercent) ??
      this.checkTrailingStop(position, currentPrice, pnlPercent) ??
      this.checkMaxHoldTime(position) ??
      null
    );
  }

  /**
   * Check Stop Loss condition: -40% from entry
   *
   * Triggers when P&L is -40% or worse.
   * Sells 50% of position immediately.
   */
  private checkStopLoss(
    position: Position,
    _currentPrice: number,
    pnlPercent: number
  ): ExitDecision | null {
    if (pnlPercent <= EXIT_CONFIG.STOP_LOSS_PERCENT) {
      const remaining = getRemainingPercent(position.state);
      const sellPercent = Math.min(EXIT_CONFIG.STOP_LOSS_SELL_PERCENT, remaining);

      logger.warn(
        {
          tokenMint: position.tokenMint,
          pnlPercent: pnlPercent.toFixed(2),
          threshold: EXIT_CONFIG.STOP_LOSS_PERCENT,
        },
        'Stop loss triggered'
      );

      return {
        shouldExit: true,
        reason: `Stop loss hit (${pnlPercent.toFixed(2)}%)`,
        exitType: 'stop_loss',
        percentToSell: sellPercent,
        priorityFee: EXIT_CONFIG.URGENT_FEE,
        slippageBps: EXIT_CONFIG.URGENT_SLIPPAGE_BPS,
      };
    }

    return null;
  }

  /**
   * Check Take Profit 1 condition: +50% from entry
   *
   * Only triggers if position is still ACTIVE (no partial exits yet).
   * Sells 25% of position.
   */
  private checkTakeProfit1(
    position: Position,
    _currentPrice: number,
    pnlPercent: number
  ): ExitDecision | null {
    // Only trigger if in ACTIVE state (no exits yet)
    if (position.state !== 'ACTIVE') {
      return null;
    }

    if (pnlPercent >= EXIT_CONFIG.TAKE_PROFIT_1_PERCENT) {
      logger.info(
        {
          tokenMint: position.tokenMint,
          pnlPercent: pnlPercent.toFixed(2),
          threshold: EXIT_CONFIG.TAKE_PROFIT_1_PERCENT,
        },
        'Take profit 1 triggered'
      );

      return {
        shouldExit: true,
        reason: `Take profit +50% (${pnlPercent.toFixed(2)}%)`,
        exitType: 'take_profit_1',
        percentToSell: EXIT_CONFIG.TAKE_PROFIT_1_SELL_PERCENT,
        priorityFee: EXIT_CONFIG.NORMAL_FEE,
        slippageBps: EXIT_CONFIG.NORMAL_SLIPPAGE_BPS,
      };
    }

    return null;
  }

  /**
   * Check Take Profit 2 condition: +100% from entry
   *
   * Only triggers if in PARTIAL_EXIT_1 state (first profit already taken).
   * Sells 25% of remaining position and activates trailing stop.
   */
  private checkTakeProfit2(
    position: Position,
    _currentPrice: number,
    pnlPercent: number
  ): ExitDecision | null {
    // Only trigger if in PARTIAL_EXIT_1 state
    if (position.state !== 'PARTIAL_EXIT_1') {
      return null;
    }

    if (pnlPercent >= EXIT_CONFIG.TAKE_PROFIT_2_PERCENT) {
      logger.info(
        {
          tokenMint: position.tokenMint,
          pnlPercent: pnlPercent.toFixed(2),
          threshold: EXIT_CONFIG.TAKE_PROFIT_2_PERCENT,
          peakPrice: position.peakPricePerToken,
        },
        'Take profit 2 triggered, activating trailing stop'
      );

      return {
        shouldExit: true,
        reason: `Take profit +100% (${pnlPercent.toFixed(2)}%)`,
        exitType: 'take_profit_2',
        percentToSell: EXIT_CONFIG.TAKE_PROFIT_2_SELL_PERCENT,
        priorityFee: EXIT_CONFIG.URGENT_FEE,
        slippageBps: EXIT_CONFIG.NORMAL_SLIPPAGE_BPS,
      };
    }

    return null;
  }

  /**
   * Check Trailing Stop condition: 15% below peak
   *
   * Only active after +100% (PARTIAL_EXIT_2 or TRAILING state).
   * Triggers when price drops 15% from the peak price.
   * Sells remaining position.
   */
  private checkTrailingStop(
    position: Position,
    currentPrice: number,
    _pnlPercent: number
  ): ExitDecision | null {
    // Only active if trailing is enabled
    if (!isTrailingActive(position.state)) {
      return null;
    }

    const trailingPercent = calculateTrailingPercent(
      position.peakPricePerToken,
      currentPrice
    );

    if (trailingPercent >= EXIT_CONFIG.TRAILING_STOP_PERCENT) {
      const remaining = getRemainingPercent(position.state);

      logger.info(
        {
          tokenMint: position.tokenMint,
          peakPrice: position.peakPricePerToken,
          currentPrice,
          trailingPercent: trailingPercent.toFixed(2),
          threshold: EXIT_CONFIG.TRAILING_STOP_PERCENT,
        },
        'Trailing stop triggered'
      );

      return {
        shouldExit: true,
        reason: `Trailing stop hit (${trailingPercent.toFixed(1)}% below peak)`,
        exitType: 'trailing_stop',
        percentToSell: remaining, // Sell all remaining
        priorityFee: EXIT_CONFIG.TRAILING_FEE,
        slippageBps: EXIT_CONFIG.URGENT_SLIPPAGE_BPS,
      };
    }

    return null;
  }

  /**
   * Check Max Hold Time condition: 4 hours from entry
   *
   * Triggers after 4 hours regardless of P&L.
   * Sells remaining position.
   */
  private checkMaxHoldTime(position: Position): ExitDecision | null {
    // Don't trigger if already exiting/closed
    if (position.state === 'EXITING' || position.state === 'CLOSED') {
      return null;
    }

    const holdTime = Date.now() - position.entryTimestamp;

    if (holdTime >= EXIT_CONFIG.MAX_HOLD_TIME_MS) {
      const remaining = getRemainingPercent(position.state);

      logger.info(
        {
          tokenMint: position.tokenMint,
          holdTimeMs: holdTime,
          holdTimeHours: (holdTime / (60 * 60 * 1000)).toFixed(1),
        },
        'Max hold time reached'
      );

      return {
        shouldExit: true,
        reason: `Max hold time reached (${(holdTime / (60 * 60 * 1000)).toFixed(1)}h)`,
        exitType: 'max_hold',
        percentToSell: remaining, // Sell all remaining
        priorityFee: EXIT_CONFIG.NORMAL_FEE,
        slippageBps: EXIT_CONFIG.NORMAL_SLIPPAGE_BPS,
      };
    }

    return null;
  }

  /**
   * Get the next state after an exit decision
   *
   * Handles state transitions for partial exits.
   */
  getNextState(currentState: PositionState, exitType: ExitType): PositionState {
    const transition = STATE_TRANSITIONS[exitType];

    // Verify current state is valid for this exit type
    if (!transition.fromStates.includes(currentState)) {
      logger.warn(
        { currentState, exitType, validStates: transition.fromStates },
        'Invalid state transition, closing position instead'
      );
      return 'CLOSED' as PositionState;
    }

    return transition.toState as PositionState;
  }

  /**
   * Get human-readable status for a position
   *
   * Shows current P&L, peak, and distance to next exit condition.
   */
  getPositionStatus(position: Position, currentPrice: number): string {
    const pnlPercent = calculatePnlPercent(position.entryPricePerToken, currentPrice);
    const remaining = getRemainingPercent(position.state);
    const trailingPercent = calculateTrailingPercent(
      position.peakPricePerToken,
      currentPrice
    );

    const lines = [
      `Position: ${position.tokenMint.slice(0, 8)}...`,
      `State: ${position.state}`,
      `Entry: ${formatPrice(position.entryPricePerToken)}`,
      `Current: ${formatPrice(currentPrice)}`,
      `Peak: ${formatPrice(position.peakPricePerToken)}`,
      `P&L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
      `Remaining: ${remaining}%`,
    ];

    // Add trailing info if active
    if (isTrailingActive(position.state)) {
      lines.push(`Trailing: ${trailingPercent.toFixed(1)}% below peak`);
    }

    // Add next exit condition
    const nextExit = this.getNextExitCondition(position, currentPrice, pnlPercent);
    if (nextExit) {
      lines.push(`Next Exit: ${nextExit}`);
    }

    return lines.join('\n');
  }

  /**
   * Get description of next exit condition that will trigger
   */
  private getNextExitCondition(
    position: Position,
    currentPrice: number,
    pnlPercent: number
  ): string | null {
    // Check each condition and return the closest one
    const toTarget = (target: number, current: number) =>
      target > current ? (target - current).toFixed(1) + '%' : 'NOW';

    if (position.state === 'ACTIVE') {
      if (pnlPercent < EXIT_CONFIG.STOP_LOSS_PERCENT) {
        return `Stop Loss at ${EXIT_CONFIG.STOP_LOSS_PERCENT}% (${toTarget(EXIT_CONFIG.STOP_LOSS_PERCENT, pnlPercent)} away)`;
      }
      if (pnlPercent < EXIT_CONFIG.TAKE_PROFIT_1_PERCENT) {
        return `Take Profit 1 at +${EXIT_CONFIG.TAKE_PROFIT_1_PERCENT}% (${toTarget(EXIT_CONFIG.TAKE_PROFIT_1_PERCENT, pnlPercent)} away)`;
      }
    }

    if (position.state === 'PARTIAL_EXIT_1') {
      if (pnlPercent < EXIT_CONFIG.TAKE_PROFIT_2_PERCENT) {
        return `Take Profit 2 at +${EXIT_CONFIG.TAKE_PROFIT_2_PERCENT}% (${toTarget(EXIT_CONFIG.TAKE_PROFIT_2_PERCENT, pnlPercent)} away)`;
      }
    }

    if (isTrailingActive(position.state)) {
      const trailingPercent = calculateTrailingPercent(
        position.peakPricePerToken,
        currentPrice
      );
      const toTrailing = EXIT_CONFIG.TRAILING_STOP_PERCENT - trailingPercent;
      return `Trailing Stop at ${EXIT_CONFIG.TRAILING_STOP_PERCENT}% below peak (${Math.max(0, toTrailing).toFixed(1)}% away)`;
    }

    // Max hold time
    const holdTime = Date.now() - position.entryTimestamp;
    const remainingTime = EXIT_CONFIG.MAX_HOLD_TIME_MS - holdTime;
    if (remainingTime > 0) {
      return `Max hold in ${(remainingTime / (60 * 60 * 1000)).toFixed(1)}h`;
    }

    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const exitStrategy = new ExitStrategy();
