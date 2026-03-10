/**
 * WebSocket Paper Trading Orchestrator
 *
 * Continuous real-time paper trading using WebSocket discovery.
 * Discovers tokens → validates → simulates entry → monitors → simulates exit
 *
 * This validates the trading strategy with ZERO risk before going live.
 */

import { logger } from '../utils/logger';
import { startWebSocketDiscovery, type DiscoveredToken, TokenAge } from '../scanner/websocket-discovery';
import { PaperTradingEngine, type PaperEntryResult } from './engine';
import type { Database } from 'better-sqlite3';

// ============================================================================
// TYPES
// ============================================================================

export interface PaperTradingOrchestratorOptions {
  // Paper trading config
  initialSol: number;
  entryAmountSol: number;
  defaultSlippageBps: number;
  db: Database;

  // Discovery filters
  minOpportunityScore: number;
  minSafetyConfidence?: 'high' | 'medium' | 'low';
  enabledAges: TokenAge[];

  // Position limits
  maxPositions: number;

  // Exit strategy (per age category)
  exitStrategy: {
    fresh: {
      targetProfit: number;  // e.g., 0.10 = 10%
      stopLoss: number;      // e.g., 0.20 = -20%
      maxHoldMinutes: number;
    };
    warm: {
      targetProfit: number;
      stopLoss: number;
      maxHoldMinutes: number;
    };
  };

  // Callbacks
  onTokenDiscovered?: (token: DiscoveredToken) => void;
  onEntryExecuted?: (result: PaperEntryWithToken) => void;
  onEntryFailed?: (token: DiscoveredToken, error: string) => void;
  onExitExecuted?: (result: PaperExitResult) => void;
}

export interface PaperEntryWithToken extends PaperEntryResult {
  token: DiscoveredToken;
  age: TokenAge;
  targetProfit: number;
  stopLoss: number;
  maxHoldMinutes: number;
  enteredAt: number;
}

export interface PaperExitResult {
  success: boolean;
  positionId: string;
  token: string;
  symbol: string;
  exitReason: string;
  pnl: number;
  pnlPercent: number;
  heldMinutes: number;
  targetProfit: number;
  stopLoss: number;
}

export interface PaperTradingStats {
  startTime: number;
  uptime: number;
  tokensDiscovered: number;
  entriesAttempted: number;
  entriesSuccessful: number;
  entriesFailed: number;
  exitsExecuted: number;
  currentPositions: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  byAge: Record<string, {
    entries: number;
    wins: number;
    losses: number;
    avgPnl: number;
  }>;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * WebSocket Paper Trading Orchestrator
 *
 * Runs continuous paper trading with real-time discovery.
 */
export class WebSocketPaperOrchestrator {
  private discovery: Awaited<ReturnType<typeof startWebSocketDiscovery>> | null = null;
  private paperEngine: PaperTradingEngine;
  private isRunning = false;
  private unsubscribe: (() => void) | null = null;

  // Track positions with their metadata
  private positionMetadata = new Map<string, {
    token: DiscoveredToken;
    age: TokenAge;
    targetProfit: number;
    stopLoss: number;
    maxHoldMinutes: number;
    enteredAt: number;
  }>();

  // Monitoring interval
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITOR_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

  // Stats
  private stats: PaperTradingStats = {
    startTime: Date.now(),
    uptime: 0,
    tokensDiscovered: 0,
    entriesAttempted: 0,
    entriesSuccessful: 0,
    entriesFailed: 0,
    exitsExecuted: 0,
    currentPositions: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    winRate: 0,
    byAge: {
      fresh: { entries: 0, wins: 0, losses: 0, avgPnl: 0 },
      warm: { entries: 0, wins: 0, losses: 0, avgPnl: 0 },
    },
  };

  constructor(private options: PaperTradingOrchestratorOptions) {
    this.paperEngine = new PaperTradingEngine({
      initialSol: options.initialSol,
      entryAmountSol: options.entryAmountSol,
      defaultSlippageBps: options.defaultSlippageBps,
      db: options.db,
    });
  }

  /**
   * Start the paper trading orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Paper trading orchestrator already running');
      return;
    }

    logger.info('Starting WebSocket Paper Trading Orchestrator');
    logger.info({
      initialSol: this.options.initialSol,
      entryAmount: this.options.entryAmountSol,
      maxPositions: this.options.maxPositions,
      enabledAges: this.options.enabledAges,
      freshTarget: `${(this.options.exitStrategy.fresh.targetProfit * 100).toFixed(0)}%`,
      freshStop: `${-(this.options.exitStrategy.fresh.stopLoss * 100).toFixed(0)}%`,
      warmTarget: `${(this.options.exitStrategy.warm.targetProfit * 100).toFixed(0)}%`,
      warmStop: `${-(this.options.exitStrategy.warm.stopLoss * 100).toFixed(0)}%`,
    }, 'Configuration');

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start WebSocket discovery
    this.discovery = await startWebSocketDiscovery();

    // Subscribe to discovered tokens
    this.unsubscribe = this.discovery.onDiscovered((token) => {
      this.handleDiscoveredToken(token);
    });

    // Start position monitoring
    this.startPositionMonitoring();

    logger.info('✅ Paper Trading Orchestrator started');
    this.printWalletStatus();
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Paper Trading Orchestrator');
    this.isRunning = false;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.discovery) {
      this.discovery.disconnect();
      this.discovery = null;
    }

    logger.info('Paper Trading Orchestrator stopped');
  }

  /**
   * Handle a discovered token
   */
  private async handleDiscoveredToken(token: DiscoveredToken): Promise<void> {
    this.stats.tokensDiscovered++;

    // Update uptime
    this.stats.uptime = Date.now() - this.stats.startTime;

    // Notify callback
    if (this.options.onTokenDiscovered) {
      this.options.onTokenDiscovered(token);
    }

    // Quick filters
    if (!this.passesQuickFilters(token)) {
      return;
    }

    // Check if we should enter
    if (!this.shouldEnterToken(token)) {
      return;
    }

    // Execute paper entry
    await this.executePaperEntry(token);
  }

  /**
   * Check if token passes quick filters
   */
  private passesQuickFilters(token: DiscoveredToken): boolean {
    // Check age is enabled
    if (!this.options.enabledAges.includes(token.age as any)) {
      return false;
    }

    // Check minimum score
    if (token.opportunityScore < this.options.minOpportunityScore) {
      return false;
    }

    // Check safety confidence
    if (this.options.minSafetyConfidence) {
      const levels = { high: 3, medium: 2, low: 1 };
      const minLevel = levels[this.options.minSafetyConfidence];
      const tokenLevel = levels[token.safety.confidence];
      if (tokenLevel < minLevel) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if we should enter this token
   */
  private shouldEnterToken(token: DiscoveredToken): boolean {
    // Check if at max positions
    if (this.positionMetadata.size >= this.options.maxPositions) {
      logger.debug(
        { symbol: token.symbol, currentPositions: this.positionMetadata.size },
        'At max positions, skipping'
      );
      return false;
    }

    // Check if we already have this token
    for (const [_, meta] of this.positionMetadata) {
      if (meta.token.address === token.address) {
        logger.debug(
          { symbol: token.symbol },
          'Already have position, skipping'
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Execute paper entry
   */
  private async executePaperEntry(token: DiscoveredToken): Promise<void> {
    this.stats.entriesAttempted++;

    logger.info(
      { symbol: token.symbol, age: token.ageCategory },
      `Executing PAPER entry for ${token.symbol}...`
    );

    try {
      // Get strategy for this token's age
      const strategy = token.age === TokenAge.FRESH
        ? this.options.exitStrategy.fresh
        : this.options.exitStrategy.warm;

      // Execute entry via paper engine
      const result = await this.paperEngine.executeEntry(
        token as any,
        { decimals: 6, symbol: token.symbol }
      );

      if (!result.success) {
        this.stats.entriesFailed++;
        logger.warn(
          { symbol: token.symbol, error: result.error },
          'Paper entry failed'
        );
        if (this.options.onEntryFailed) {
          this.options.onEntryFailed(token, result.error ?? 'Unknown error');
        }
        return;
      }

      this.stats.entriesSuccessful++;
      const enteredAt = Date.now();

      // Store position metadata
      if (result.position) {
        this.positionMetadata.set(result.position.id, {
          token,
          age: token.age,
          targetProfit: strategy.targetProfit,
          stopLoss: strategy.stopLoss,
          maxHoldMinutes: strategy.maxHoldMinutes,
          enteredAt,
        });

        this.stats.currentPositions = this.positionMetadata.size;

        // Update age stats
        const ageKey = token.age === TokenAge.FRESH ? 'fresh' : 'warm';
        if (this.stats.byAge[ageKey]) {
          this.stats.byAge[ageKey].entries++;
        }
      }

      const entryWithToken: PaperEntryWithToken = {
        ...result,
        token,
        age: token.age,
        targetProfit: strategy.targetProfit,
        stopLoss: strategy.stopLoss,
        maxHoldMinutes: strategy.maxHoldMinutes,
        enteredAt,
      };

      logger.info(
        {
          symbol: token.symbol,
          age: token.ageCategory,
          positionId: result.position?.id,
          quotedTokens: result.quotedTokens.toFixed(2),
          actualTokens: result.actualTokens.toFixed(2),
          entryPrice: result.entryPriceSol.toFixed(8),
          slippage: `${(result.slippageBps / 100).toFixed(2)}%`,
          target: `${(strategy.targetProfit * 100).toFixed(0)}%`,
          stop: `-${(strategy.stopLoss * 100).toFixed(0)}%`,
        },
        `✅ PAPER entry executed: ${token.symbol}`
      );

      if (this.options.onEntryExecuted) {
        this.options.onEntryExecuted(entryWithToken);
      }

      this.printWalletStatus();
    } catch (error) {
      this.stats.entriesFailed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ symbol: token.symbol, error: errorMessage }, 'Paper entry error');
      if (this.options.onEntryFailed) {
        this.options.onEntryFailed(token, errorMessage);
      }
    }
  }

  /**
   * Start position monitoring (checks for exit conditions)
   */
  private startPositionMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.checkExitConditions();
    }, this.MONITOR_INTERVAL_MS);
  }

  /**
   * Check all positions for exit conditions
   */
  private async checkExitConditions(): Promise<void> {
    if (this.positionMetadata.size === 0) {
      return;
    }

    logger.debug(
      { positions: this.positionMetadata.size },
      'Checking exit conditions...'
    );

    const now = Date.now();
    const positionsToExit: Array<{ positionId: string; reason: string }> = [];

    for (const [positionId, meta] of this.positionMetadata) {
      // Get current position data from paper engine
      const walletState = this.paperEngine.getWalletState();
      const tokenBalance = walletState.tokens.find(t => t.tokenAddress === meta.token.address);

      if (!tokenBalance) {
        continue;
      }

      // Calculate current PnL
      const entryPrice = tokenBalance.entryPrice;
      const currentPrice = entryPrice; // In paper trading, we'd track this separately
      const pnlPercent = 0; // Would calculate from current price

      const heldMinutes = (now - meta.enteredAt) / (1000 * 60);

      // Check exit conditions
      let exitReason: string | null = null;

      // Check stop loss (simulated - would need real price tracking)
      // Check target profit (simulated)
      // Check max hold time
      if (heldMinutes >= meta.maxHoldMinutes) {
        exitReason = 'MAX_HOLD_TIME';
      }

      if (exitReason) {
        positionsToExit.push({ positionId, reason: exitReason });
      }
    }

    // Execute exits
    for (const { positionId, reason } of positionsToExit) {
      await this.executePaperExit(positionId, reason);
    }
  }

  /**
   * Execute paper exit
   */
  private async executePaperExit(positionId: string, exitReason: string): Promise<void> {
    const meta = this.positionMetadata.get(positionId);
    if (!meta) {
      return;
    }

    logger.info(
      { positionId, symbol: meta.token.symbol, reason: exitReason },
      `Executing PAPER exit...`
    );

    try {
      // Get position from engine before executing exit
      const position = this.paperEngine.getPosition(positionId);
      if (!position) {
        logger.warn({ positionId }, 'Position not found for exit');
        return;
      }

      const result = await this.paperEngine.executeExit(position, exitReason);

      const heldMinutes = (Date.now() - meta.enteredAt) / (1000 * 60);

      const exitResult: PaperExitResult = {
        success: result.success,
        positionId,
        token: meta.token.address,
        symbol: meta.token.symbol,
        exitReason,
        pnl: result.pnl,
        pnlPercent: result.pnlPercent,
        heldMinutes,
        targetProfit: meta.targetProfit,
        stopLoss: meta.stopLoss,
      };

      // Remove from tracking
      this.positionMetadata.delete(positionId);
      this.stats.currentPositions = this.positionMetadata.size;
      this.stats.exitsExecuted++;

      // Update stats
      const ageKey = meta.age === TokenAge.FRESH ? 'fresh' : 'warm';
      if (result.pnlPercent > 0) {
        if (this.stats.byAge[ageKey]) {
          this.stats.byAge[ageKey].wins++;
        }
      } else {
        if (this.stats.byAge[ageKey]) {
          this.stats.byAge[ageKey].losses++;
        }
      }

      // Update totals
      this.stats.totalPnl += result.pnl;
      this.stats.totalPnlPercent += result.pnlPercent;
      this.stats.winRate = this.stats.exitsExecuted > 0
        ? (this.stats.byAge.fresh.wins + this.stats.byAge.warm.wins) / this.stats.exitsExecuted
        : 0;

      if (result.success) {
        logger.info(
          {
            symbol: meta.token.symbol,
            reason: exitReason,
            pnl: result.pnl.toFixed(6),
            pnlPercent: `${result.pnlPercent.toFixed(2)}%`,
            heldMinutes: heldMinutes.toFixed(0),
          },
          `✅ PAPER exit executed: ${meta.token.symbol}`
        );
      } else {
        logger.warn(
          { symbol: meta.token.symbol, error: result.error },
          'Paper exit failed'
        );
      }

      if (this.options.onExitExecuted) {
        this.options.onExitExecuted(exitResult);
      }

      this.printWalletStatus();
    } catch (error) {
      logger.error({ positionId, error }, 'Paper exit error');
    }
  }

  /**
   * Print current wallet status
   */
  private printWalletStatus(): void {
    const wallet = this.paperEngine.getWalletState();
    logger.info(
      {
        solBalance: wallet.solBalance.toFixed(6),
        tokens: wallet.tokens.length,
        positions: this.positionMetadata.size,
        totalPnl: this.stats.totalPnl.toFixed(6),
        winRate: `${(this.stats.winRate * 100).toFixed(1)}%`,
      },
      '📊 Wallet Status'
    );
  }

  /**
   * Check if orchestrator is running
   */
  active(): boolean {
    return this.isRunning;
  }

  /**
   * Get current stats
   */
  getStats(): PaperTradingStats {
    this.stats.uptime = Date.now() - this.stats.startTime;
    return { ...this.stats };
  }

  /**
   * Get recent discovered tokens
   */
  getRecentTokens(minutes: number = 10): DiscoveredToken[] {
    if (!this.discovery) {
      return [];
    }
    return this.discovery.getRecentTokens(minutes);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create and start a WebSocket paper trading orchestrator
 */
export async function createWebSocketPaperOrchestrator(
  options: PaperTradingOrchestratorOptions
): Promise<WebSocketPaperOrchestrator> {
  const orchestrator = new WebSocketPaperOrchestrator(options);
  await orchestrator.start();
  return orchestrator;
}

/**
 * Default paper trading options
 */
export const DEFAULT_PAPER_OPTIONS: Partial<PaperTradingOrchestratorOptions> = {
  initialSol: 0.1,
  entryAmountSol: 0.05,
  defaultSlippageBps: 100, // 1%
  minOpportunityScore: 60,
  minSafetyConfidence: 'medium',
  enabledAges: [TokenAge.FRESH, TokenAge.WARM],
  maxPositions: 3,
  exitStrategy: {
    fresh: {
      targetProfit: 0.10, // 10%
      stopLoss: 0.20,     // -20%
      maxHoldMinutes: 60, // 1 hour
    },
    warm: {
      targetProfit: 0.05, // 5%
      stopLoss: 0.25,     // -25%
      maxHoldMinutes: 240, // 4 hours
    },
  },
};
