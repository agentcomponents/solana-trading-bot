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

/**
 * Infer types from Zod schemas for use in application code
 */
export type ValidatedPosition = z.infer<typeof PositionSchema>;
export type ValidatedTokenMetadata = z.infer<typeof TokenMetadataSchema>;
export type ValidatedTrade = z.infer<typeof TradeSchema>;
export type ValidatedSafetyCheckResult = z.infer<typeof SafetyCheckResultSchema>;
export type ValidatedCompoundingState = z.infer<typeof CompoundingStateSchema>;
