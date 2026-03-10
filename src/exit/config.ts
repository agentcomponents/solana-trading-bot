/**
 * Exit Strategy Configuration
 *
 * User-confirmed exit thresholds and parameters.
 * Reference: design/04-monitoring-exit.md
 */

/**
 * Exit strategy configuration
 *
 * These values are based on user-approved exit strategy:
 * - Stop Loss: -40% from entry
 * - Take Profit 1: +50% (sell 25%)
 * - Take Profit 2: +100% (sell 25%, activate trailing)
 * - Trailing Stop: 15% below peak
 * - Max Hold Time: 4 hours
 */
export const EXIT_CONFIG = {
  // Exit condition thresholds (percentages)
  STOP_LOSS_PERCENT: -40,
  TAKE_PROFIT_1_PERCENT: 50,
  TAKE_PROFIT_2_PERCENT: 100,
  TRAILING_STOP_PERCENT: 15, // Below peak

  // Position sizes for partial exits (percent of remaining position)
  TAKE_PROFIT_1_SELL_PERCENT: 25,
  TAKE_PROFIT_2_SELL_PERCENT: 25,
  STOP_LOSS_SELL_PERCENT: 50,

  // Time limits
  MAX_HOLD_TIME_MS: 4 * 60 * 60 * 1000, // 4 hours in milliseconds

  // Price monitoring
  PRICE_POLL_INTERVAL_MS: 2000, // Poll every 2 seconds
  PRICE_CACHE_TTL_MS: 5000, // Cache prices for 5 seconds

  // Slippage tolerance (basis points: 100 = 1%)
  NORMAL_SLIPPAGE_BPS: 100, // 1%
  URGENT_SLIPPAGE_BPS: 300, // 3%
  EMERGENCY_SLIPPAGE_BPS: 500, // 5%

  // Priority fees (lamports)
  NORMAL_FEE: 100_000, // 0.0001 SOL
  URGENT_FEE: 500_000, // 0.0005 SOL
  TRAILING_FEE: 1_000_000, // 0.001 SOL - protect peak
  EMERGENCY_FEE: 2_000_000, // 0.002 SOL - emergency exit

  // Emergency conditions
  LIQUIDITY_CRASH_PERCENT: 20, // 20% drop in 1 minute
  LIQUIDITY_CRASH_DURATION_MS: 60_000, // 1 minute
} as const;

/**
 * Exit type definitions
 */
export type ExitType =
  | 'stop_loss'
  | 'take_profit_1'
  | 'take_profit_2'
  | 'trailing_stop'
  | 'max_hold'
  | 'emergency';

/**
 * Position state transition mapping
 *
 * Defines valid state transitions for partial exits.
 */
export const STATE_TRANSITIONS: Record<
  ExitType,
  {
    fromStates: string[];
    toState: string;
    sellPercentOfRemaining: number;
  }
> = {
  stop_loss: {
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING'],
    toState: 'FAILED',
    sellPercentOfRemaining: 50,
  },
  take_profit_1: {
    fromStates: ['ACTIVE'],
    toState: 'PARTIAL_EXIT_1',
    sellPercentOfRemaining: 25,
  },
  take_profit_2: {
    fromStates: ['PARTIAL_EXIT_1'],
    toState: 'PARTIAL_EXIT_2',
    sellPercentOfRemaining: 25,
  },
  trailing_stop: {
    fromStates: ['PARTIAL_EXIT_2', 'TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100, // Sell remaining
  },
  max_hold: {
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100,
  },
  emergency: {
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100,
  },
} as const;
