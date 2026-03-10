/**
 * Exit Strategy Configuration
 *
 * Memecoin-optimized exit thresholds.
 * Reads from environment variables with sensible defaults.
 */

// Read from environment with defaults
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PERCENTAGE) || 10;
const TRAILING_STOP_PCT = Number(process.env.TRAILING_STOP_PERCENTAGE) || 7;
const TRAILING_ACTIVATION_PCT = Number(process.env.TRAILING_STOP_ACTIVATION_PERCENTAGE) || 10;
const MAX_HOLD_HRS = Number(process.env.MAX_HOLD_TIME_HOURS) || 4;

/**
 * Exit strategy configuration
 *
 * Memecoin-optimized strategy:
 * - Stop Loss: -15% (tight, catch dumps early)
 * - Take Profit 1: +10% (lock in gains early)
 * - Take Profit 2: +25% (catch bigger pumps, activate trailing)
 * - Trailing Stop: 10% below peak (after TP2)
 * - Max Hold Time: 4 hours
 */
export const EXIT_CONFIG = {
  // Exit condition thresholds (percentages)
  STOP_LOSS_PERCENT: -STOP_LOSS_PCT,  // Negative = loss
  TAKE_PROFIT_1_PERCENT: 10,           // Lock in 10% gains
  TAKE_PROFIT_2_PERCENT: TRAILING_ACTIVATION_PCT, // Activate trailing at this gain
  TRAILING_STOP_PERCENT: TRAILING_STOP_PCT,

  // Position sizes for partial exits (percent of remaining position)
  TAKE_PROFIT_1_SELL_PERCENT: 50,  // Sell 50% at TP1
  TAKE_PROFIT_2_SELL_PERCENT: 0,   // Disabled - trailing activates at TP1
  STOP_LOSS_SELL_PERCENT: 100,  // Full exit on stop loss (memecoins dump fast)

  // Time limits
  MAX_HOLD_TIME_MS: MAX_HOLD_HRS * 60 * 60 * 1000,

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
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'TRAILING'],
    toState: 'FAILED',
    sellPercentOfRemaining: 100,  // Full exit on stop loss
  },
  take_profit_1: {
    fromStates: ['ACTIVE'],
    toState: 'TRAILING',  // Activate trailing after TP1
    sellPercentOfRemaining: 50,  // Sell 50%
  },
  take_profit_2: {
    fromStates: [],  // Disabled
    toState: 'PARTIAL_EXIT_2',
    sellPercentOfRemaining: 0,
  },
  trailing_stop: {
    fromStates: ['TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100, // Sell remaining 50%
  },
  max_hold: {
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100,
  },
  emergency: {
    fromStates: ['ACTIVE', 'PARTIAL_EXIT_1', 'TRAILING'],
    toState: 'CLOSED',
    sellPercentOfRemaining: 100,
  },
} as const;
