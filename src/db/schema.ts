/**
 * Database Schema for Solana Trading Bot
 *
 * Uses Better SQLite3 with WAL mode for performance.
 * Schema version: 1
 *
 * CRITICAL: positions.tokensReceivedRaw stores the raw BN amount from Jupiter
 * to ensure accurate exit calculations without decimal conversion issues.
 *
 * NOTE: All column names use camelCase to match TypeScript interfaces
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Token metadata cache to avoid repeated RPC calls
 */
export interface TokenMetadata {
  id: string; // mint address (primary key)
  symbol: string | null;
  name: string | null;
  decimals: number; // 0-9 for SPL tokens
  supply: string | null; // Raw supply as string
  lastFetchedAt: number; // Unix timestamp
  createdAt: number;
  updatedAt: number;
}

/**
 * Position tracking with CRITICAL raw amount storage
 *
 * IMPORTANT: tokensReceivedRaw is the exact value from Jupiter quote.outAmount
 * Use this directly for exit - NO conversion needed!
 */
export interface Position {
  id: string; // UUID primary key
  state: PositionState;
  tokenMint: string; // Foreign key to token_metadata

  // Entry data
  entrySolSpent: string; // Raw lamports spent (BN as string)
  entryTimestamp: number; // Unix timestamp
  entryPricePerToken: number; // SOL per token (for display/P&L)

  // CRITICAL: Store raw amount for accurate exit
  tokensReceivedRaw: string; // Raw from Jupiter (BN as string)
  tokenDecimals: number; // Fetched at entry time

  // Score at entry (0-100)
  entryScore: number | null;

  // Exit data (null until exit)
  exitTimestamp: number | null;
  exitSolReceived: string | null; // Raw lamports received
  exitPricePerToken: number | null;
  exitReason: ExitReason | null;

  // Performance tracking
  peakPricePerToken: number; // Highest price seen (for trailing stop)
  peakTimestamp: number; // When peak occurred

  // Metadata
  createdAt: number;
  updatedAt: number;
}

export type PositionState =
  | 'ENTERING' // Entry transaction submitted
  | 'ACTIVE' // Entry confirmed, monitoring
  | 'PARTIAL_EXIT_1' // First 25% exit complete
  | 'PARTIAL_EXIT_2' // Second 25% exit complete
  | 'TRAILING' // Trailing stop active
  | 'EXITING' // Exit transaction submitted
  | 'CLOSED' // Exit confirmed
  | 'FAILED'; // Entry or exit failed

export type ExitReason =
  | 'STOP_LOSS' // -40% loss
  | 'TAKE_PROFIT_1' // +50% (25% exit)
  | 'TAKE_PROFIT_2' // +100% (25% exit)
  | 'TRAILING_STOP' // 15% below peak
  | 'MAX_HOLD_TIME' // 4 hours elapsed
  | 'EMERGENCY' // Liquidity crash, rug detected
  | 'MANUAL'; // User intervention

/**
 * Safety check results from various APIs
 */
export interface SafetyCheck {
  id: string; // UUID primary key
  tokenMint: string; // Foreign key to token_metadata
  checkType: SafetyCheckType;
  result: SafetyCheckResult;
  details: string; // JSON string of check data
  checkedAt: number; // Unix timestamp
  createdAt: number;
}

export type SafetyCheckType = 'RUGCHECK' | 'GOPLUS' | 'TOKEN_SNIFFER' | 'LIQUIDITY';
export type SafetyCheckResult = 'SAFE' | 'SUSPICIOUS' | 'UNSAFE' | 'ERROR';

/**
 * Trade execution log
 */
export interface Trade {
  id: string; // UUID primary key
  positionId: string | null; // Foreign key to positions (null if safety check failed)
  tokenMint: string; // Foreign key to token_metadata
  tradeType: 'ENTRY' | 'EXIT' | 'PARTIAL_EXIT';
  solAmount: string; // Raw lamports (always positive)
  tokenAmountRaw: string; // Raw token amount (BN as string)
  tokenDecimals: number;
  signature: string | null; // Transaction signature
  state: TradeState;
  errorMessage: string | null;
  submittedAt: number;
  confirmedAt: number | null;
  createdAt: number;
}

export type TradeState = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';

/**
 * Compounding state (single-row table)
 */
export interface CompoundingState {
  id: number; // Always 1 (single row)
  stage: CompoundingStage;
  currentSolBalance: string; // Raw lamports
  basePositionSize: string; // Raw lamports for next trade
  targetProfitAmount: string; // Raw lamports needed to compound
  peakSolBalance: string; // Highest balance seen (for drawdown detection)
  peakTimestamp: number;
  lastCompoundAt: number | null;
  lastWithdrawalAt: number | null;
  updatedAt: number;
}

export type CompoundingStage = 'BUILD' | 'GROWTH' | 'EXPANSION' | 'DRAWDOWN_RECOVERY';

/**
 * Performance snapshots for tracking growth
 */
export interface PerformanceSnapshot {
  id: string; // UUID primary key
  tradingMode: 'PAPER' | 'LIVE';
  solBalance: string; // Raw lamports
  totalPositions: number;
  activePositions: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalProfit: string; // Raw lamports
  maxDrawdown: number; // Percentage
  timestamp: number; // Unix timestamp
  createdAt: number;
}

/**
 * Position sizing history
 */
export interface PositionSize {
  id: string; // UUID primary key
  tradingMode: 'PAPER' | 'LIVE';
  stage: CompoundingStage;
  solAmount: string; // Raw lamports
  percentageOfPortfolio: number; // For expansion stage
  reason: string; // Why this size was chosen
  timestamp: number;
  createdAt: number;
}

/**
 * Profit withdrawals (live trading only)
 */
export interface Withdrawal {
  id: string; // UUID primary key
  amount: string; // Raw lamports withdrawn
  reason: WithdrawalReason;
  signature: string | null; // Transaction signature
  timestamp: number;
  createdAt: number;
}

export type WithdrawalReason = 'PROFIT_TAKING' | 'PARTIAL_EXIT' | 'MANUAL';

// ============================================================================
// SQL SCHEMA (using camelCase columns to match TypeScript interfaces)
// ============================================================================

/**
 * Complete SQL schema for database initialization
 */
export const SCHEMA_SQL = `
-- Enable foreign keys and WAL mode
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================================
-- TOKEN METADATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_metadata (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  decimals INTEGER NOT NULL CHECK(decimals >= 0 AND decimals <= 9),
  supply TEXT,
  lastFetchedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Index for symbol lookups
CREATE INDEX IF NOT EXISTS idx_token_metadata_symbol
  ON token_metadata(symbol);

-- ============================================================================
-- POSITIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN (
    'ENTERING', 'ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2',
    'TRAILING', 'EXITING', 'CLOSED', 'FAILED'
  )),
  tokenMint TEXT NOT NULL REFERENCES token_metadata(id) ON DELETE CASCADE,
  entrySolSpent TEXT NOT NULL,
  entryTimestamp INTEGER NOT NULL,
  entryPricePerToken REAL NOT NULL,
  tokensReceivedRaw TEXT NOT NULL,
  tokenDecimals INTEGER NOT NULL CHECK(tokenDecimals >= 0 AND tokenDecimals <= 9),
  entryScore INTEGER,
  exitTimestamp INTEGER,
  exitSolReceived TEXT,
  exitPricePerToken REAL,
  exitReason TEXT CHECK(exitReason IN (
    'STOP_LOSS', 'TAKE_PROFIT_1', 'TAKE_PROFIT_2',
    'TRAILING_STOP', 'MAX_HOLD_TIME', 'EMERGENCY', 'MANUAL'
  )),
  peakPricePerToken REAL NOT NULL DEFAULT 0,
  peakTimestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Index for active positions
CREATE INDEX IF NOT EXISTS idx_positions_state
  ON positions(state);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_positions_tokenMint
  ON positions(tokenMint);

-- ============================================================================
-- SAFETY CHECKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS safety_checks (
  id TEXT PRIMARY KEY,
  tokenMint TEXT NOT NULL REFERENCES token_metadata(id) ON DELETE CASCADE,
  checkType TEXT NOT NULL CHECK(checkType IN (
    'RUGCHECK', 'GOPLUS', 'TOKEN_SNIFFER', 'LIQUIDITY'
  )),
  result TEXT NOT NULL CHECK(result IN ('SAFE', 'SUSPICIOUS', 'UNSAFE', 'ERROR')),
  details TEXT NOT NULL,
  checkedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Index for token safety queries
CREATE INDEX IF NOT EXISTS idx_safety_checks_tokenMint
  ON safety_checks(tokenMint);

-- Index for recent checks
CREATE INDEX IF NOT EXISTS idx_safety_checks_checkedAt
  ON safety_checks(checkedAt);

-- ============================================================================
-- TRADES
-- ============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  positionId TEXT REFERENCES positions(id) ON DELETE SET NULL,
  tokenMint TEXT NOT NULL REFERENCES token_metadata(id) ON DELETE CASCADE,
  tradeType TEXT NOT NULL CHECK(tradeType IN ('ENTRY', 'EXIT', 'PARTIAL_EXIT')),
  solAmount TEXT NOT NULL,
  tokenAmountRaw TEXT NOT NULL,
  tokenDecimals INTEGER NOT NULL CHECK(tokenDecimals >= 0 AND tokenDecimals <= 9),
  signature TEXT,
  state TEXT NOT NULL CHECK(state IN ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
  errorMessage TEXT,
  submittedAt INTEGER NOT NULL,
  confirmedAt INTEGER,
  createdAt INTEGER NOT NULL
);

-- Index for position trades
CREATE INDEX IF NOT EXISTS idx_trades_positionId
  ON trades(positionId);

-- Index for token trades
CREATE INDEX IF NOT EXISTS idx_trades_tokenMint
  ON trades(tokenMint);

-- Index for trade state
CREATE INDEX IF NOT EXISTS idx_trades_state
  ON trades(state);

-- ============================================================================
-- COMPOUNDING STATE (single row)
-- ============================================================================
CREATE TABLE IF NOT EXISTS compounding_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  stage TEXT NOT NULL CHECK(stage IN (
    'BUILD', 'GROWTH', 'EXPANSION', 'DRAWDOWN_RECOVERY'
  )),
  currentSolBalance TEXT NOT NULL,
  basePositionSize TEXT NOT NULL,
  targetProfitAmount TEXT NOT NULL,
  peakSolBalance TEXT NOT NULL,
  peakTimestamp INTEGER NOT NULL,
  lastCompoundAt INTEGER,
  lastWithdrawalAt INTEGER,
  updatedAt INTEGER NOT NULL
);

-- ============================================================================
-- PERFORMANCE SNAPSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  tradingMode TEXT NOT NULL CHECK(tradingMode IN ('PAPER', 'LIVE')),
  solBalance TEXT NOT NULL,
  totalPositions INTEGER NOT NULL,
  activePositions INTEGER NOT NULL,
  totalTrades INTEGER NOT NULL,
  winCount INTEGER NOT NULL,
  lossCount INTEGER NOT NULL,
  totalProfit TEXT NOT NULL,
  maxDrawdown REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_timestamp
  ON performance_snapshots(timestamp);

-- Index for mode queries
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_tradingMode
  ON performance_snapshots(tradingMode);

-- ============================================================================
-- POSITION SIZES
-- ============================================================================
CREATE TABLE IF NOT EXISTS position_sizes (
  id TEXT PRIMARY KEY,
  tradingMode TEXT NOT NULL CHECK(tradingMode IN ('PAPER', 'LIVE')),
  stage TEXT NOT NULL CHECK(stage IN (
    'BUILD', 'GROWTH', 'EXPANSION', 'DRAWDOWN_RECOVERY'
  )),
  solAmount TEXT NOT NULL,
  percentageOfPortfolio REAL NOT NULL,
  reason TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_position_sizes_timestamp
  ON position_sizes(timestamp);

-- ============================================================================
-- WITHDRAWALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  amount TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('PROFIT_TAKING', 'PARTIAL_EXIT', 'MANUAL')),
  signature TEXT,
  timestamp INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

-- Index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_withdrawals_timestamp
  ON withdrawals(timestamp);
`;

/**
 * Schema version for migrations
 */
export const SCHEMA_VERSION = 1;

/**
 * Migration history table
 */
export const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  appliedAt INTEGER NOT NULL
);

-- Initialize with current version
INSERT OR IGNORE INTO schema_migrations (version, appliedAt)
  VALUES (${SCHEMA_VERSION}, ${Date.now()})
`;
