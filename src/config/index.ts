/**
 * Environment configuration validation
 *
 * Loads and validates all environment variables using Zod schemas.
 * Throws an error at startup if configuration is invalid.
 */

import { z } from 'zod';
import { error } from '../utils/logger.js';

// ============================================================================
// ZOD SCHEMA FOR ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Environment variable schema with validation
 *
 * All required fields must be present or the application will fail to start.
 * Numeric values are parsed from strings and validated.
 */
const EnvSchema = z
  .object({
    // ========================================================================
    // WALLET
    // ========================================================================
    /**
     * Wallet private key (Base58 encoded)
     * Can be 64 bytes (standard) or up to 128 bytes (extended)
     */
    WALLET_PRIVATE_KEY: z
      .string()
      .min(64)
      .max(128)
      .regex(
        /^[1-9A-HJ-NP-Za-km-z]+$/,
        'Invalid Base58 format (must be valid Base58 string)'
      )
      .describe('Wallet private key in Base58 format'),

    // ========================================================================
    // APIs - HELIUS
    // ========================================================================
    /**
     * Helius RPC URL for primary connection
     */
    HELIUS_RPC_URL: z.string().url().describe('Helius RPC endpoint URL'),

    /**
     * Helius WebSocket URL for real-time updates
     */
    HELIUS_WS_URL: z
      .string()
      .url()
      .startsWith('wss://')
      .describe('Helius WebSocket URL'),

    /**
     * Backup RPC URL for failover
     */
    BACKUP_RPC_URL: z.string().url().describe('Backup RPC endpoint URL'),

    // ========================================================================
    // APIs - JUPITER
    // ========================================================================
    /**
     * Jupiter API key (optional)
     */
    JUPITER_API_KEY: z.string().optional().describe('Jupiter API key'),

    // ========================================================================
    // APIs - SECURITY (optional)
    // ========================================================================
    /**
     * GoPlus Security API key (optional)
     */
    GOPLUS_API_KEY: z.string().optional().describe('GoPlus Security API key'),

    /**
     * Enable RugCheck integration
     */
    RUGCHECK_ENABLED: z
      .string()
      .default('true')
      .transform((val) => val === 'true')
      .describe('Enable RugCheck integration'),

    /**
     * Token Sniffer API key (optional)
     */
    TOKEN_SNIFFER_API_KEY: z.string().optional().describe('Token Sniffer API key'),

    // ========================================================================
    // TRADING STRATEGY
    // ========================================================================
    /**
     * Initial SOL amount to start trading with
     */
    INITIAL_SOL_AMOUNT: z
      .string()
      .default('0.1')
      .transform((val) => Number(val))
      .pipe(z.number().positive().max(10))
      .describe('Initial SOL amount for trading'),

    /**
     * Base SOL amount (fixed position size in build stage)
     */
    BASE_SOL: z
      .string()
      .default('0.1')
      .transform((val) => Number(val))
      .pipe(z.number().positive().max(10))
      .describe('Base SOL position size'),

    /**
     * How often to scan for new tokens (seconds)
     */
    SCAN_INTERVAL_SECONDS: z
      .string()
      .default('10')
      .transform((val) => Number(val))
      .pipe(z.number().int().min(1).max(60))
      .describe('Token scan interval in seconds'),

    /**
     * Maximum concurrent positions
     */
    MAX_POSITIONS: z
      .string()
      .default('1')
      .transform((val) => Number(val))
      .pipe(z.number().int().min(1).max(10))
      .describe('Maximum concurrent positions'),

    // ========================================================================
    // RISK MANAGEMENT
    // ========================================================================
    /**
     * Stop loss percentage (e.g., 40 = -40%)
     */
    STOP_LOSS_PERCENTAGE: z
      .string()
      .default('40')
      .transform((val) => Number(val))
      .pipe(z.number().min(1).max(100))
      .describe('Stop loss percentage'),

    /**
     * Trailing stop distance from peak (e.g., 15 = 15%)
     */
    TRAILING_STOP_PERCENTAGE: z
      .string()
      .default('15')
      .transform((val) => Number(val))
      .pipe(z.number().min(1).max(50))
      .describe('Trailing stop percentage'),

    /**
     * Trailing stop activation threshold (e.g., 100 = +100%)
     */
    TRAILING_STOP_ACTIVATION_PERCENTAGE: z
      .string()
      .default('100')
      .transform((val) => Number(val))
      .pipe(z.number().min(50).max(200))
      .describe('Trailing stop activation percentage'),

    /**
     * Maximum hold time before exit (hours)
     */
    MAX_HOLD_TIME_HOURS: z
      .string()
      .default('4')
      .transform((val) => Number(val))
      .pipe(z.number().positive().max(24))
      .describe('Maximum hold time in hours'),

    // ========================================================================
    // LIQUIDITY REQUIREMENTS
    // ========================================================================
    /**
     * Minimum liquidity in USD
     */
    MIN_LIQUIDITY_USD: z
      .string()
      .default('15000')
      .transform((val) => Number(val))
      .pipe(z.number().positive())
      .describe('Minimum liquidity in USD'),

    /**
     * Minimum pool SOL amount
     */
    MIN_POOL_SOL_AMOUNT: z
      .string()
      .default('50')
      .transform((val) => Number(val))
      .pipe(z.number().positive())
      .describe('Minimum SOL in pool'),

    // ========================================================================
    // SLIPPAGE
    // ========================================================================
    /**
     * Entry slippage in basis points (100 = 1%)
     */
    ENTRY_SLIPPAGE_BPS: z
      .string()
      .default('100')
      .transform((val) => Number(val))
      .pipe(z.number().int().min(1).max(1000))
      .describe('Entry slippage in basis points'),

    /**
     * Exit slippage in basis points
     */
    EXIT_SLIPPAGE_BPS: z
      .string()
      .default('300')
      .transform((val) => Number(val))
      .pipe(z.number().int().min(1).max(1000))
      .describe('Exit slippage in basis points'),

    // ========================================================================
    // DATABASE
    // ========================================================================
    /**
     * SQLite database file path
     */
    DATABASE_PATH: z
      .string()
      .default('./data/trading-bot.db')
      .describe('SQLite database file path'),

    // ========================================================================
    // TRADING MODE
    // ========================================================================
    /**
     * Trading mode: paper (simulation) or live (real)
     */
    TRADING_MODE: z
      .enum(['paper', 'live'])
      .default('paper')
      .describe('Trading mode: paper or live'),

    // ========================================================================
    // LOGGING
    // ========================================================================
    /**
     * Log level: debug, info, warn, error
     */
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .default('info')
      .describe('Logging level'),

    /**
     * Enable logging to file
     */
    LOG_TO_FILE: z
      .string()
      .default('false')
      .transform((val) => val === 'true')
      .describe('Enable file logging'),

    /**
     * Log file path (required if LOG_TO_FILE is true)
     */
    LOG_FILE_PATH: z.string().optional().describe('Log file path')
  })
  .refine(
    (data) => {
      // If LOG_TO_FILE is true, LOG_FILE_PATH must be provided
      if (data.LOG_TO_FILE && data.LOG_FILE_PATH === undefined) {
        return false;
      }
      return true;
    },
    {
      message: 'LOG_FILE_PATH is required when LOG_TO_FILE is true'
    }
  );

// ============================================================================
// TYPE INFERENCE
// ============================================================================

/**
 * Validated configuration type
 */
export type EnvConfig = z.infer<typeof EnvSchema>;

// ============================================================================
// CONFIG STATE
// ============================================================================

let config: EnvConfig | null = null;
let isInitialized = false;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Validate and initialize configuration from environment variables
 *
 * Must be called before `getConfig()`. Throws an error if validation fails.
 *
 * @returns Validated configuration object
 * @throws Error if validation fails
 *
 * @example
 * ```ts
 * import { validateConfig } from './config';
 *
 * try {
 *   const config = validateConfig();
 *   console.log('Trading mode:', config.TRADING_MODE);
 * } catch (error) {
 *   console.error('Configuration error:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function validateConfig(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    error('❌ Configuration validation failed:');
    error('');

    for (const err of result.error.errors) {
      error(`  ❌ ${err.path.join('.')}: ${err.message}`);
    }

    error('');
    error('Please set the required environment variables.');
    error('See .env.example for reference.');

    throw new Error('Invalid environment configuration');
  }

  config = result.data;
  isInitialized = true;

  return config;
}

/**
 * Get the validated configuration
 *
 * Throws an error if `validateConfig()` has not been called.
 *
 * @returns Validated configuration object
 * @throws Error if config not initialized
 *
 * @example
 * ```ts
 * import { getConfig } from './config';
 *
 * const config = getConfig();
 * console.log('Base SOL:', config.BASE_SOL);
 * ```
 */
export function getConfig(): EnvConfig {
  if (!config || !isInitialized) {
    throw new Error(
      'Config not initialized. Call validateConfig() before getConfig().'
    );
  }

  return config;
}

/**
 * Check if configuration has been initialized
 *
 * @returns True if config is initialized
 */
export function isConfigInitialized(): boolean {
  return isInitialized;
}

/**
 * Reset configuration (mainly for testing)
 *
 * @internal
 */
export function _resetConfig(): void {
  config = null;
  isInitialized = false;
}
