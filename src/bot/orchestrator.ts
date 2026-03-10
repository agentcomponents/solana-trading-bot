/**
 * Main Bot Orchestrator
 *
 * Ties all components together into a continuous trading loop:
 * 1. Scan for tokens
 * 2. Validate safety
 * 3. Execute entries
 * 4. Monitor positions
 * 5. Execute exits
 *
 * Supports both paper trading and live trading modes.
 */

import type { Database } from 'better-sqlite3';
import { getDbClient, createPositionRepository } from '../db/index.js';
import { initializeDatabase } from '../db/init.js';
import { getBotConfig, type TradingBotConfig } from './config.js';
import { logger } from '../utils/logger.js';
import { getExitOrchestrator, type ExitOrchestrator } from '../exit/orchestrator.js';
import { createPaperTradingEngine } from '../paper/engine.js';
import { getQuote, executeSwapWithRetry, SOL_MINT } from '../jupiter/client.js';
import { initializeConnections, getWalletBalance, getConnection } from '../solana/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Bot orchestrator options
 */
export interface TradingBotOptions {
  /** Database instance (optional, will create if not provided) */
  db?: Database;
}

/**
 * Bot status snapshot
 */
export interface TradingBotStatus {
  /** Is the bot currently running */
  isRunning: boolean;
  /** Trading mode (paper or live) */
  mode: 'paper' | 'live';
  /** When the bot started */
  startTime: number;
  /** Number of active positions */
  activePositions: number;
  /** Total trades executed */
  totalTrades: number;
  /** Number of scans completed */
  scanCount: number;
  /** Last scan timestamp */
  lastScanTime: number;
  /** Current SOL balance (paper trading) or wallet balance (live) */
  walletSol: number;
}

// ============================================================================
// MAIN BOT ORCHESTRATOR
// ============================================================================

/**
 * Main trading bot orchestrator
 *
 * Coordinates all trading components in a continuous loop.
 */
export class TradingBot {
  private isRunningFlag: boolean = false;
  private startTime: number = 0;
  private scanCount: number = 0;
  private totalTrades: number = 0;
  private lastScanTime: number = 0;
  private scanIntervalId: NodeJS.Timeout | null = null;

  private config: TradingBotConfig;
  private db: Database;
  private exitOrchestrator: ExitOrchestrator;
  private paperEngine?: ReturnType<typeof createPaperTradingEngine>;

  constructor(options: TradingBotOptions) {
    // Load config
    this.config = getBotConfig();

    // Get or create database
    if (options.db) {
      this.db = options.db;
    } else {
      // Initialize database and get the raw Database instance
      const dbClient = getDbClient();
      initializeDatabase(dbClient);
      this.db = dbClient.getDb();
    }

    // Initialize Solana RPC connections for live trading
    if (this.config.mode === 'live') {
      initializeConnections();
      logger.info('Solana RPC connections initialized for live trading');
    }

    // Create exit orchestrator
    this.exitOrchestrator = getExitOrchestrator({
      dryRun: this.config.mode === 'paper',
    });

    // Create paper trading engine if in paper mode
    if (this.config.mode === 'paper') {
      this.paperEngine = createPaperTradingEngine({
        initialSol: this.config.initialSol,
        entryAmountSol: this.config.initialSol / this.config.maxPositions,
        defaultSlippageBps: this.config.entrySlippageBps,
        db: this.db,
      });
    }

    logger.info(
      {
        mode: this.config.mode,
        initialSol: this.config.initialSol,
        scanInterval: this.config.scanIntervalSeconds,
      },
      'Trading bot initialized'
    );
  }

  /**
   * Start the bot
   *
   * Begins the main trading loop.
   */
  async start(): Promise<void> {
    if (this.isRunningFlag) {
      logger.warn('Bot is already running');
      return;
    }

    logger.info('Starting trading bot...');

    this.isRunningFlag = true;
    this.startTime = Date.now();

    // Start exit orchestrator
    await this.exitOrchestrator.startMonitoring();

    // Start main scan loop
    this.startScanLoop();

    logger.info('Trading bot started');
  }

  /**
   * Stop the bot
   *
   * Gracefully stops the bot after completing current operations.
   */
  async stop(): Promise<void> {
    if (!this.isRunningFlag) {
      logger.warn('Bot is not running');
      return;
    }

    logger.info('Stopping trading bot...');

    this.isRunningFlag = false;

    // Stop scan loop
    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }

    // Stop exit orchestrator
    await this.exitOrchestrator.stopMonitoring();

    logger.info(
      {
        scanCount: this.scanCount,
        totalTrades: this.totalTrades,
        uptime: Date.now() - this.startTime,
      },
      'Trading bot stopped'
    );
  }

  /**
   * Check if bot is running
   */
  isRunning(): boolean {
    return this.isRunningFlag;
  }

  /**
   * Get current bot status
   */
  getStatus(): TradingBotStatus {
    return {
      isRunning: this.isRunningFlag,
      mode: this.config.mode,
      startTime: this.startTime,
      activePositions: this.getActivePositionCount(),
      totalTrades: this.totalTrades,
      scanCount: this.scanCount,
      lastScanTime: this.lastScanTime,
      walletSol: this.getWalletSol(),
    };
  }

  /**
   * Get status as formatted string
   */
  getStatusSummary(): string {
    const status = this.getStatus();
    const uptime = status.isRunning
      ? `${Math.floor((Date.now() - status.startTime) / 1000)}s`
      : '0s';

    const lines = [
      'Trading Bot Status:',
      `  Running: ${status.isRunning ? 'YES' : 'NO'}`,
      `  Mode: ${status.mode.toUpperCase()}`,
      `  Uptime: ${uptime}`,
      `  Active Positions: ${status.activePositions}/${this.config.maxPositions}`,
      `  Total Trades: ${status.totalTrades}`,
      `  Scans Completed: ${status.scanCount}`,
      `  Wallet SOL: ${status.walletSol.toFixed(6)}`,
    ];

    return lines.join('\n');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Start the periodic scan loop
   */
  private startScanLoop(): void {
    // Run initial scan
    this.runMainLoop().catch((error) => {
      logger.error({ error }, 'Main loop error on initial scan');
    });

    // Set up interval
    this.scanIntervalId = setInterval(() => {
      if (this.isRunningFlag) {
        this.runMainLoop().catch((error) => {
          logger.error({ error }, 'Main loop error');
        });
      }
    }, this.config.scanIntervalSeconds * 1000);
  }

  /**
   * Main trading loop
   *
   * 1. Check if we can open new positions
   * 2. Scan for tokens
   * 3. Validate safety
   * 4. Execute entries
   */
  private async runMainLoop(): Promise<void> {
    try {
      // Check if we can open new positions
      const activeCount = this.getActivePositionCount();
      if (activeCount >= this.config.maxPositions) {
        logger.debug(
          { activeCount, maxPositions: this.config.maxPositions },
          'Max positions reached, skipping scan'
        );
        return;
      }

      logger.debug('Starting main scan loop...');

      // Import scanner modules dynamically to avoid circular dependencies
      const { quickScan } = await import('../scanner/scanner.js');
      const { checkTokenSafetyAggregate } = await import('../safety/aggregator.js');
      const { validateMultipleEntries } = await import('../entry/validator.js');

      // Scan for tokens
      const scannedTokens = await quickScan({
        maxResults: 50,
      });

      this.scanCount++;
      this.lastScanTime = Date.now();

      logger.debug({ found: scannedTokens.length }, 'Scan complete');

      if (scannedTokens.length === 0) {
        return;
      }

      // Safety check all tokens
      const safetyResults = new Map<string, any>();
      for (const token of scannedTokens) {
        const safety = await checkTokenSafetyAggregate(token.address);
        safetyResults.set(token.address, safety);
      }

      // Validate entries
      const signals = await validateMultipleEntries(
        scannedTokens as any,
        safetyResults
      );

      logger.debug({ validated: signals.length }, 'Validation complete');

      if (signals.length === 0) {
        return;
      }

      // Filter out tokens already in active positions
      const activeTokenMints = this.getActiveTokenMints();
      const filteredSignals = signals.filter(s => !activeTokenMints.has(s.address || s.tokenMint));

      if (filteredSignals.length < signals.length) {
        logger.debug(
          { filtered: signals.length - filteredSignals.length, alreadyHeld: activeTokenMints.size },
          'Filtered out tokens already in portfolio'
        );
      }

      if (filteredSignals.length === 0) {
        return;
      }

      // Execute entries (up to max positions remaining)
      const slotsRemaining = this.config.maxPositions - activeCount;
      const entriesToExecute = filteredSignals.slice(0, slotsRemaining);

      for (const signal of entriesToExecute) {
        const result = await this.executeEntry(signal);

        if (result.success) {
          this.totalTrades++;
        }

        // Small delay between entries
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      logger.info(
        {
          scanned: scannedTokens.length,
          validated: signals.length,
          executed: entriesToExecute.length,
        },
        'Scan cycle complete'
      );
    } catch (error) {
      logger.error({ error }, 'Main loop error');
    }
  }

  /**
   * Execute an entry trade
   */
  private async executeEntry(signal: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.config.mode === 'paper' && this.paperEngine) {
        // Paper trading entry
        const result = await this.paperEngine.executeEntry(signal, {
          decimals: 0, // Will fetch from metadata
          symbol: signal.symbol,
          score: signal.opportunityScore,
        });

        if (result.success) {
          logger.info(
            { symbol: signal.symbol, positionId: result.position?.id },
            'Paper entry executed'
          );
        }

        return { success: result.success, error: result.error };
      } else {
        // Live trading entry
        return await this.executeLiveEntry(signal);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, symbol: signal.symbol }, 'Entry execution failed');
      return { success: false, error: message };
    }
  }

  /**
   * Execute a live trading entry using Jupiter
   */
  private async executeLiveEntry(signal: any): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(
        { symbol: signal.symbol, address: signal.address },
        'Executing live entry'
      );

      // Calculate entry amount in lamports
      const entryAmountSol = this.config.initialSol / this.config.maxPositions;
      const entryAmountLamports = Math.floor(entryAmountSol * 1e9);

      // Get quote from Jupiter (SOL -> Token)
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: signal.address,
        amount: entryAmountLamports,
        slippageBps: this.config.entrySlippageBps,
      });

      logger.info(
        {
          symbol: signal.symbol,
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
          priceImpact: quote.priceImpactPct,
        },
        'Jupiter quote received'
      );

      // Execute swap
      const result = await executeSwapWithRetry({
        quoteResponse: quote,
        priorityLevel: 'high',
        maxPriorityFeeLamports: 1000000, // 0.001 SOL
      });

      if (result.success && result.signature) {
        logger.info(
          {
            symbol: signal.symbol,
            signature: result.signature,
            explorerUrl: result.explorerUrl,
          },
          'Live entry executed successfully'
        );

        // TODO: Create position in database
        // This would be done by recording the entry with the signature

        return { success: true };
      } else {
        logger.error(
          { symbol: signal.symbol, error: result.error },
          'Live entry failed'
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, symbol: signal.symbol }, 'Live entry execution failed');
      return { success: false, error: message };
    }
  }

  /**
   * Get active position count
   */
  private getActivePositionCount(): number {
    const positionsRepo = createPositionRepository(this.db);
    const activePositions = positionsRepo.findActive();
    return activePositions.length;
  }

  /**
   * Get list of token mints already in active positions
   */
  private getActiveTokenMints(): Set<string> {
    const positionsRepo = createPositionRepository(this.db);
    const activePositions = positionsRepo.findActive();
    return new Set(activePositions.map(p => p.tokenMint));
  }

  /**
   * Get wallet SOL balance
   */
  private getWalletSol(): number {
    if (this.config.mode === 'paper' && this.paperEngine) {
      const state = this.paperEngine.getWalletState();
      return state.solBalance;
    }

    // For live trading, fetch actual wallet balance asynchronously
    // Note: This returns the cached value; actual balance should be fetched periodically
    return this.config.initialSol;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new trading bot instance
 *
 * @param options Bot options
 * @returns Trading bot instance
 */
export function createTradingBot(options: TradingBotOptions): TradingBot {
  return new TradingBot(options);
}
