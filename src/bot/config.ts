/**
 * Bot Configuration
 *
 * Loads and validates bot-specific configuration that combines
 * environment variables with bot-specific defaults.
 */

import { validateConfig as loadEnvConfig, type EnvConfig } from '../config/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Trading mode - paper trading or live trading
 */
export type TradingMode = 'paper' | 'live';

/**
 * Bot configuration interface
 *
 * Combines environment configuration with bot-specific settings
 * for the trading orchestrator.
 */
export interface TradingBotConfig {
  // Trading mode
  mode: TradingMode;

  // Capital
  initialSol: number;

  // Scanning
  scanIntervalSeconds: number;
  maxPositions: number;

  // Slippage
  entrySlippageBps: number;
  exitSlippageBps: number;

  // Risk management
  stopLossPercentage: number;
  trailingStopPercentage: number;
  trailingStopActivationPercentage: number;
  maxHoldTimeHours: number;

  // Liquidity filters
  minLiquidityUsd: number;
  maxLiquidityUsd: number;
  minPoolSolAmount: number;

  // Take profit
  takeProfit1Percent: number;
  takeProfit2Percent: number;
  takeProfit1SellPercent: number;
  takeProfit2SellPercent: number;

  // System
  databasePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// ============================================================================
// CONFIG STATE
// ============================================================================

let botConfig: TradingBotConfig | null = null;
let envConfig: EnvConfig | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load bot configuration from environment
 *
 * Combines environment config with bot-specific defaults.
 * Caches the result for subsequent calls.
 *
 * @returns Bot configuration
 * @throws Error if environment config is invalid
 *
 * @example
 * ```ts
 * import { loadBotConfig } from './bot/config';
 *
 * const config = loadBotConfig();
 * console.log('Trading mode:', config.mode);
 * console.log('Initial SOL:', config.initialSol);
 * ```
 */
export function loadBotConfig(): TradingBotConfig {
  if (botConfig) {
    return botConfig;
  }

  // Load environment config
  envConfig = loadEnvConfig();

  // Create bot config from environment
  botConfig = {
    mode: envConfig.TRADING_MODE,
    initialSol: envConfig.INITIAL_SOL_AMOUNT,
    scanIntervalSeconds: envConfig.SCAN_INTERVAL_SECONDS,
    maxPositions: envConfig.MAX_POSITIONS,
    entrySlippageBps: envConfig.ENTRY_SLIPPAGE_BPS,
    exitSlippageBps: envConfig.EXIT_SLIPPAGE_BPS,
    stopLossPercentage: envConfig.STOP_LOSS_PERCENTAGE,
    trailingStopPercentage: envConfig.TRAILING_STOP_PERCENTAGE,
    trailingStopActivationPercentage: envConfig.TRAILING_STOP_ACTIVATION_PERCENTAGE,
    maxHoldTimeHours: envConfig.MAX_HOLD_TIME_HOURS,
    minLiquidityUsd: envConfig.MIN_LIQUIDITY_USD,
    maxLiquidityUsd: 500000, // Default max
    minPoolSolAmount: envConfig.MIN_POOL_SOL_AMOUNT,
    takeProfit1Percent: 50, // +50% trigger
    takeProfit2Percent: 100, // +100% trigger
    takeProfit1SellPercent: 25, // Sell 25% at TP1
    takeProfit2SellPercent: 25, // Sell 25% at TP2
    databasePath: envConfig.DATABASE_PATH,
    logLevel: envConfig.LOG_LEVEL,
  };

  return botConfig;
}

/**
 * Get the bot configuration
 *
 * Returns cached config. Must call loadBotConfig() first.
 *
 * @returns Bot configuration
 * @throws Error if config not loaded
 */
export function getBotConfig(): TradingBotConfig {
  if (!botConfig) {
    throw new Error('Bot config not loaded. Call loadBotConfig() first.');
  }
  return botConfig;
}

/**
 * Get the environment config
 *
 * Returns cached environment config.
 *
 * @returns Environment configuration
 * @throws Error if config not loaded
 */
export function getEnvConfig(): EnvConfig {
  if (!envConfig) {
    throw new Error('Env config not loaded. Call loadBotConfig() first.');
  }
  return envConfig;
}

/**
 * Check if in paper trading mode
 *
 * @returns True if paper trading mode
 */
export function isPaperTrading(): boolean {
  return getBotConfig().mode === 'paper';
}

/**
 * Check if in live trading mode
 *
 * @returns True if live trading mode
 */
export function isLiveTrading(): boolean {
  return getBotConfig().mode === 'live';
}

/**
 * Reset configuration (mainly for testing)
 *
 * @internal
 */
export function _resetBotConfig(): void {
  botConfig = null;
  envConfig = null;
}
