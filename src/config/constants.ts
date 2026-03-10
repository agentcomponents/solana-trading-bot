/**
 * Trading strategy constants
 *
 * Centralized configuration for trading parameters, thresholds, and addresses.
 */

// ============================================================================
// SOLANA TOKEN ADDRESSES
// ============================================================================

/**
 * Native SOL mint address (wrapped SOL)
 */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * USDC mint address on Solana
 */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * USDT mint address on Solana
 */
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// ============================================================================
// COMPOUNDING STAGES
// ============================================================================

/**
 * Build stage: Start with 0.1 SOL, target 0.3 SOL
 */
export const BUILD_STAGE = {
  INITIAL_BASE: 0.1,
  TARGET: 0.3,
  COMPOUNDING_RATE: 0.05,
  COMPOUNDING_THRESHOLD: 0.05
} as const;

/**
 * Growth stage: Scale position 0.15 → 0.25 SOL, target 1.0 SOL
 */
export const GROWTH_STAGE = {
  TARGET: 1.0,
  MIN_POSITION: 0.15,
  MAX_POSITION: 0.25,
  COMPOUNDING_RATE: 0.1,
  COMPOUNDING_THRESHOLD: 0.1
} as const;

/**
 * Expansion stage: 20% of portfolio, profit taking at 50% gain
 */
export const EXPANSION_STAGE = {
  POSITION_PERCENTAGE: 0.2,
  MIN_POSITION: 0.25,
  PROFIT_TAKING_THRESHOLD: 50
} as const;

// ============================================================================
// PRIORITY FEES (in lamports)
// ============================================================================

/**
 * Priority fee configuration for different scenarios
 * See design/06-priority-fees.md for details
 */
export const PRIORITY_FEES = {
  /** Entry: Standard fee */
  ENTRY_STANDARD: 10_000,
  /** Entry: Maximum fee */
  ENTRY_MAX: 50_000,
  /** Exit: Base fee */
  EXIT_BASE: 100_000,
  /** Exit: High profit (≥100%) */
  EXIT_HIGH_PROFIT: 500_000,
  /** Exit: Emergency (trailing stop, stop loss) */
  EXIT_EMERGENCY: 1_000_000,
  /** Exit: Maximum emergency */
  EXIT_MAX_EMERGENCY: 2_000_000
} as const;

// ============================================================================
// EXIT THRESHOLDS (percentages)
// ============================================================================

/**
 * Exit strategy thresholds
 * See design/04-monitoring-exit.md for details
 */
export const EXIT_THRESHOLDS = {
  /** Stop loss: -40% */
  STOP_LOSS_PCT: -40,
  /** Take profit 1: +50% */
  TAKE_PROFIT_50_PCT: 50,
  /** Take profit 2: +100% */
  TAKE_PROFIT_100_PCT: 100,
  /** Trailing stop: 15% below peak */
  TRAILING_STOP_DISTANCE_PCT: 15,
  /** Trailing stop activates after: +100% */
  TRAILING_STOP_ACTIVATION_PCT: 100
} as const;

/**
 * Partial exit percentages
 */
export const PARTIAL_EXITS = {
  /** Sell 25% at +50% */
  AT_50_PCT: 25,
  /** Sell 25% at +100% */
  AT_100_PCT: 25,
  /** Remaining 50% for trailing stop */
  TRAILING_AMOUNT: 50
} as const;

// ============================================================================
// SAFETY CHECK SOURCES
// ============================================================================

/**
 * Safety check API sources
 */
export const SAFETY_SOURCES = {
  RUGCHECK: 'rugcheck',
  GOPLUS: 'goplus',
  TOKEN_SNIFFER: 'tokensniffer'
} as const;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/**
 * Default retry configuration with exponential backoff
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1_000,
  MAX_DELAY_MS: 30_000,
  BACKOFF_MULTIPLIER: 2,
  JITTER: true
} as const;

// ============================================================================
// CIRCUIT BREAKER CONFIGURATION
// ============================================================================

/**
 * Circuit breaker thresholds for external services
 */
export const CIRCUIT_BREAKER = {
  /** Open circuit after N failures */
  THRESHOLD: 5,
  /** Try again after N milliseconds */
  TIMEOUT_MS: 60_000,
  /** Successful attempts to close circuit */
  HALF_OPEN_ATTEMPTS: 3
} as const;

// ============================================================================
// TRANSACTION MONITORING
// ============================================================================

/**
 * Transaction monitoring thresholds
 */
export const TRANSACTION_MONITOR = {
  /** Consider transaction stuck after N milliseconds */
  STUCK_TIMEOUT_MS: 60_000,
  /** Maximum wait time before giving up */
  MAX_CONFIRM_TIME_MS: 120_000,
  /** How often to check transaction status */
  CHECK_INTERVAL_MS: 2_000,
  /** Default required confirmations */
  REQUIRED_CONFIRMATIONS: 2
} as const;

// ============================================================================
// PRICE MONITORING
// ============================================================================

/**
 * Price monitoring configuration
 */
export const PRICE_MONITOR = {
  /** Poll interval for Jupiter API */
  POLL_INTERVAL_MS: 2_000,
  /** Price cache TTL */
  CACHE_TTL_MS: 5_000
} as const;

// ============================================================================
// EMERGENCY CONDITIONS
// ============================================================================

/**
 * Emergency exit triggers
 */
export const EMERGENCY_CONDITIONS = {
  /** Liquidity crash: price drops X% in Y milliseconds */
  LIQUIDITY_CRASH_PCT: 20,
  LIQUIDITY_CRASH_DURATION_MS: 60_000
} as const;
