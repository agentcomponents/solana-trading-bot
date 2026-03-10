/**
 * Core types and interfaces for the Solana Trading Bot
 *
 * This file defines all TypeScript types and Zod validation schemas
 * used throughout the application.
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Trading mode - determines if bot runs in paper trading or live mode
 */
export enum TradingMode {
  /** Simulated trading with virtual funds */
  PAPER = 'paper',
  /** Real trading with actual funds */
  LIVE = 'live'
}

/**
 * Position state machine states
 */
export enum PositionState {
  /** Entry transaction submitted, awaiting confirmation */
  ENTERING = 'entering',
  /** Position is open and being monitored */
  ACTIVE = 'active',
  /** First partial exit completed (+50%) */
  PARTIAL_EXIT_1 = 'partial_1',
  /** Second partial exit completed (+100%), trailing stop active */
  PARTIAL_EXIT_2 = 'partial_2',
  /** Trailing stop is active */
  TRAILING = 'trailing',
  /** Exit transaction submitted */
  EXITING = 'exiting',
  /** Position fully closed */
  CLOSED = 'closed',
  /** Entry failed or position failed */
  FAILED = 'failed'
}

/**
 * Reasons why a position was exited
 */
export enum ExitReason {
  /** Stop loss hit (-40%) */
  STOP_LOSS = 'stop_loss',
  /** Trailing stop hit (15% below peak) */
  TRAILING_STOP = 'trailing_stop',
  /** Take profit at +50% */
  TAKE_PROFIT_50 = 'take_profit_50',
  /** Take profit at +100% */
  TAKE_PROFIT_100 = 'take_profit_100',
  /** Maximum hold time reached (4 hours) */
  MAX_HOLD_TIME = 'max_hold_time',
  /** Manual intervention */
  MANUAL = 'manual',
  /** Emergency exit (liquidity crash, rug detected) */
  EMERGENCY = 'emergency'
}

/**
 * Transaction states for monitoring
 */
export enum TransactionState {
  /** Created but not sent */
  PENDING = 'pending',
  /** Sent to network, awaiting confirmation */
  SUBMITTED = 'submitted',
  /** Seen in mempool, checking confirmations */
  CONFIRMING = 'confirming',
  /** Required confirmations reached */
  CONFIRMED = 'confirmed',
  /** Transaction failed */
  FAILED = 'failed',
  /** Too long without confirmation */
  STUCK = 'stuck',
  /** Network error, status unclear */
  UNKNOWN = 'unknown'
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Position - represents an open or closed trading position
 *
 * CRITICAL: The tokensReceivedRaw field stores the EXACT raw amount from
 * Jupiter at entry time. This must be used directly for exit without any
 * conversion. See design/02-decimal-handling.md for details.
 */
export interface Position {
  /** Unique position identifier */
  id: string;
  /** Token mint address (base58, 44 chars) */
  tokenMint: string;
  /** Token symbol (e.g., "BONK") */
  tokenSymbol: string;

  // Entry data
  /** SOL value at entry (human-readable) */
  entryPrice: number;
  /** SOL spent at entry (human-readable) */
  entrySolAmount: number;
  /**
   * Raw token amount received from Jupiter (as string)
   * CRITICAL: Store exact value from Jupiter, use directly at exit
   */
  tokensReceivedRaw: string;
  /** Token decimals (0-9) fetched from mint at entry */
  tokenDecimals: number;

  // Current data
  /** Current price in SOL (human-readable) */
  currentPrice: number;
  /** Highest price seen (for trailing stop) */
  peakPrice: number;

  // Tracking
  /** Timestamp when position was entered */
  enteredAt: number;
  /** Timestamp of last update */
  updatedAt: number;
  /** Percentage of position still held (starts at 100) */
  remainingPercent: number;

  // Exit data
  /** Position state */
  state: PositionState;
  /** Reason for exit (if closed) */
  exitReason?: ExitReason;
}

/**
 * Token metadata from chain
 */
export interface TokenMetadata {
  /** Token mint address */
  address: string;
  /** Token decimals (0-9) */
  decimals: number;
  /** Token symbol (optional) */
  symbol?: string;
  /** Token name (optional) */
  name?: string;
  /** Is mint authority revoked? */
  mintAuthorityRevoked?: boolean;
  /** Is freeze authority revoked? */
  freezeAuthorityRevoked?: boolean;
}

/**
 * Trade record for entry/exit transactions
 */
export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Associated position ID */
  positionId: string;
  /** Trade type */
  type: 'entry' | 'exit';
  /** Transaction signature */
  signature: string;
  /** Input token mint */
  inputToken: string;
  /** Output token mint */
  outputToken: string;
  /** Input amount (raw string from Jupiter) */
  inputAmountRaw: string;
  /** Output amount (raw string from Jupiter) */
  outputAmountRaw: string;
  /** Input amount (human-readable) */
  inputAmountHuman: number;
  /** Output amount (human-readable) */
  outputAmountHuman: number;
  /** Slippage in basis points */
  slippageBps: number;
  /** Priority fee in lamports */
  priorityFee?: number;
  /** Execution timestamp */
  executedAt: number;
  /** Was trade successful? */
  success: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Safety check result from security APIs
 */
export interface SafetyCheckResult {
  /** Token address checked */
  tokenAddress: string;
  /** Source of the check */
  source: 'rugcheck' | 'goplus' | 'tokensniffer';
  /** Is the token safe to trade? */
  safe: boolean;
  /** Safety score (0-100, if available) */
  score?: number;
  /** List of issues found */
  issues: string[];
  /** When the check was performed */
  checkedAt: number;
}

/**
 * Compounding state for position sizing
 */
export interface CompoundingState {
  /** Current stage */
  stage: 'build' | 'growth' | 'expansion';
  /** Total SOL held */
  totalSol: number;
  /** Base SOL (not compounded) */
  baseSol: number;
  /** Profit SOL available for compounding */
  profitSol: number;
  /** Initial base when stage started */
  initialBase: number;
  /** Total SOL deposited */
  totalDeposits: number;
  /** Total SOL withdrawn */
  totalWithdrawals: number;
  /** All-time high balance */
  allTimeHigh: number;
  /** Total trades executed */
  totalTrades: number;
  /** Current win streak */
  winStreak: number;
  /** Current loss streak */
  lossStreak: number;
}

/**
 * Price update from monitoring
 */
export interface PriceUpdate {
  /** Token mint address */
  tokenMint: string;
  /** Current price in SOL */
  price: number;
  /** Update timestamp */
  timestamp: number;
  /** Data source */
  source: 'jupiter' | 'helius' | 'dexscreener';
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for Position validation
 */
export const PositionSchema = z.object({
  id: z.string().uuid(),
  tokenMint: z.string().length(44),
  tokenSymbol: z.string().min(1).max(10),
  entryPrice: z.number().positive(),
  entrySolAmount: z.number().positive(),
  tokensReceivedRaw: z.string().min(1),
  tokenDecimals: z.number().int().min(0).max(9),
  currentPrice: z.number().nonnegative(),
  peakPrice: z.number().nonnegative(),
  enteredAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  remainingPercent: z.number().int().min(0).max(100),
  state: z.nativeEnum(PositionState),
  exitReason: z.nativeEnum(ExitReason).optional()
});

/**
 * Zod schema for TokenMetadata validation
 */
export const TokenMetadataSchema = z.object({
  address: z.string().length(44),
  decimals: z.number().int().min(0).max(9),
  symbol: z.string().max(10).optional(),
  name: z.string().max(50).optional(),
  mintAuthorityRevoked: z.boolean().optional(),
  freezeAuthorityRevoked: z.boolean().optional()
});

/**
 * Zod schema for Trade validation
 */
export const TradeSchema = z.object({
  id: z.string().uuid(),
  positionId: z.string().uuid(),
  type: z.enum(['entry', 'exit']),
  signature: z.string().length(88),
  inputToken: z.string().length(44),
  outputToken: z.string().length(44),
  inputAmountRaw: z.string().min(1),
  outputAmountRaw: z.string().min(1),
  inputAmountHuman: z.number().nonnegative(),
  outputAmountHuman: z.number().nonnegative(),
  slippageBps: z.number().int().min(0).max(1000),
  priorityFee: z.number().int().min(0).optional(),
  executedAt: z.number().int().positive(),
  success: z.boolean(),
  errorMessage: z.string().optional()
});

/**
 * Zod schema for SafetyCheckResult validation
 */
export const SafetyCheckResultSchema = z.object({
  tokenAddress: z.string().length(44),
  source: z.enum(['rugcheck', 'goplus', 'tokensniffer']),
  safe: z.boolean(),
  score: z.number().int().min(0).max(100).optional(),
  issues: z.array(z.string()),
  checkedAt: z.number().int().positive()
});

/**
 * Zod schema for CompoundingState validation
 */
export const CompoundingStateSchema = z.object({
  stage: z.enum(['build', 'growth', 'expansion']),
  totalSol: z.number().nonnegative(),
  baseSol: z.number().nonnegative(),
  profitSol: z.number().nonnegative(),
  initialBase: z.number().positive(),
  totalDeposits: z.number().nonnegative(),
  totalWithdrawals: z.number().nonnegative(),
  allTimeHigh: z.number().nonnegative(),
  totalTrades: z.number().int().nonnegative(),
  winStreak: z.number().int().nonnegative(),
  lossStreak: z.number().int().nonnegative()
});

// ============================================================================
// TYPE INFERENCE
// ============================================================================

// ============================================================================
// API RESPONSE VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schemas for validating external API responses
 * These provide security by ensuring all API data matches expected structure
 */

/**
 * DexScreener WebSocket boost message validation
 */
export const DexScreenerBoostSchema = z.object({
  url: z.string().optional(),
  chainId: z.string(),
  tokenAddress: z.string().length(44),
  amount: z.number().optional(),
  totalAmount: z.number().optional(),
  icon: z.string().optional(),
  header: z.string().optional(),
  description: z.string().nullable().optional(),
});

export const DexScreenerBoostMessageSchema = z.object({
  limit: z.number().optional(),
  data: z.array(DexScreenerBoostSchema).max(100), // Max 100 items for DoS protection
});

/**
 * RugCheck API risk level validation
 */
export const RugCheckRiskLevelSchema = z.enum(['info', 'warn', 'error', 'critical']);

/**
 * RugCheck API risk factor validation
 */
export const RugCheckRiskSchema = z.object({
  name: z.string(),
  value: z.string(),
  description: z.string(),
  score: z.number(),
  level: RugCheckRiskLevelSchema,
});

/**
 * RugCheck API token info validation
 */
export const RugCheckTokenSchema = z.object({
  mintAuthority: z.string().nullable(),
  supply: z.number(),
  decimals: z.number().int().min(0).max(9),
  isInitialized: z.boolean(),
  freezeAuthority: z.string().nullable(),
}).nullable();

/**
 * RugCheck API token metadata validation
 */
export const RugCheckTokenMetaSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  uri: z.string(),
  mutable: z.boolean(),
  updateAuthority: z.string(),
}).nullable();

/**
 * RugCheck API locker validation
 */
export const RugCheckLockerSchema = z.object({
  programID: z.string(),
  tokenAccount: z.string(),
  owner: z.string(),
  uri: z.string(),
  unlockDate: z.number(),
  usdcLocked: z.number(),
  type: z.string(),
});

/**
 * RugCheck API known account validation
 * Maps address -> {name, type}
 */
export const RugCheckKnownAccountSchema = z.object({
  name: z.string(),
  type: z.string(),
});

/**
 * RugCheck API launchpad validation
 */
export const RugCheckLaunchpadSchema = z.object({
  name: z.string(),
  logo: z.string().optional(),
  url: z.string().optional(),
  platform: z.string().optional(),
}).nullable();

/**
 * RugCheck API full report validation
 */
export const RugCheckReportSchema = z.object({
  mint: z.string().length(44),
  tokenProgram: z.string(),
  creator: z.string().nullable(),
  creatorBalance: z.number(),
  token: RugCheckTokenSchema,
  token_extensions: z.unknown(),
  tokenMeta: RugCheckTokenMetaSchema,
  topHolders: z.array(z.unknown()).nullable().optional(),
  freezeAuthority: z.string().nullable(),
  mintAuthority: z.string().nullable(),
  risks: z.array(RugCheckRiskSchema).nullable(),
  score: z.number().nonnegative(),
  score_normalised: z.number().nonnegative(),
  fileMeta: z.unknown(),
  lockerOwners: z.record(z.string(), z.unknown()).nullable().optional(),
  lockers: z.record(z.string(), RugCheckLockerSchema).nullable().optional(),
  markets: z.array(z.unknown()).nullable().optional(),
  totalMarketLiquidity: z.number().nonnegative(),
  totalStableLiquidity: z.number().nonnegative(),
  totalLPProviders: z.number().int().nonnegative(),
  totalHolders: z.number().int().nonnegative(),
  price: z.number().nonnegative(),
  rugged: z.boolean(),
  tokenType: z.string(),
  transferFee: z.object({
    pct: z.number(),
    maxAmount: z.number(),
    authority: z.string(),
  }),
  knownAccounts: z.record(z.string(), RugCheckKnownAccountSchema).nullable(),
  events: z.array(z.unknown()).nullable().optional(),
  verification: z.unknown(),
  graphInsidersDetected: z.number().int().nonnegative(),
  insiderNetworks: z.array(z.unknown()).nullable().optional(),
  detectedAt: z.string(),
  creatorTokens: z.array(z.unknown()).nullable().optional(),
  launchpad: RugCheckLaunchpadSchema,
  deployPlatform: z.string(),
}).passthrough(); // Allow additional fields

/**
 * Jupiter API quote response validation
 */
export const JupiterQuoteSchema = z.object({
  inputMint: z.string().length(44),
  inAmount: z.string(),
  outputMint: z.string().length(44),
  outAmount: z.string(),
  otherAmountThreshold: z.string(),
  swapMode: z.enum(['ExactIn', 'ExactOut']),
  slippageBps: z.number().int().nonnegative(),
  routePlan: z.array(z.object({
    swapInfo: z.object({
      ammKey: z.string().optional(),
      label: z.string().optional(),
      inputMint: z.string(),
      outputMint: z.string(),
      inAmount: z.string(),
      outAmount: z.string(),
      feeAmount: z.string(),
      feeMint: z.string().optional(),
    }),
    percent: z.number(),
  })),
  contextSlot: z.number().optional(),
  timeTaken: z.number().optional(),
}).passthrough(); // Allow additional fields

// ============================================================================
// TYPE INFERENCE
// ============================================================================

/**
 * Infer types from Zod schemas for use in application code
 */
export type ValidatedPosition = z.infer<typeof PositionSchema>;
export type ValidatedTokenMetadata = z.infer<typeof TokenMetadataSchema>;
export type ValidatedTrade = z.infer<typeof TradeSchema>;
export type ValidatedSafetyCheckResult = z.infer<typeof SafetyCheckResultSchema>;
export type ValidatedCompoundingState = z.infer<typeof CompoundingStateSchema>;

/**
 * API response validated types
 */
export type ValidatedDexScreenerBoostMessage = z.infer<typeof DexScreenerBoostMessageSchema>;
export type ValidatedRugCheckReport = z.infer<typeof RugCheckReportSchema>;
export type ValidatedJupiterQuote = z.infer<typeof JupiterQuoteSchema>;
