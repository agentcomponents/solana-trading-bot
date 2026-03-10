/**
 * WebSocket Entry Orchestrator
 *
 * Continuous real-time entry flow using WebSocket discovery.
 * Discovers tokens via WebSocket, validates them, and optionally auto-enters.
 *
 * Flow: WebSocket → Discovery → Age Classification → Safety Check → Validation → Entry
 */

import { logger } from '../utils/logger';
import { startWebSocketDiscovery, type DiscoveredToken, TokenAge } from '../scanner/websocket-discovery';
import { checkTokenSafetyAggregate } from '../safety/aggregator';
import { validateMultipleEntries } from './validator';
import { prepareEntry } from './executor';
import type { EntrySignal } from './validator';
import type { EntryValidationOptions } from './validator';

// ============================================================================
// TYPES
// ============================================================================

export interface WebSocketOrchestratorOptions {
  // Entry validation options
  entryValidation?: EntryValidationOptions;
  // Whether to automatically enter positions
  autoEnter: boolean;
  // Maximum positions to hold at once
  maxPositions: number;
  // Current SOL holdings for position sizing
  currentSolHolding: number;
  // Minimum opportunity score to consider
  minOpportunityScore: number;
  // Minimum safety confidence required
  minSafetyConfidence?: 'high' | 'medium' | 'low';
  // Which age categories to trade
  enabledAges: TokenAge[];
  // Entry options (will be calculated if not provided)
  entryOptions?: {
    inputAmount: string;
    slippageBps: number;
  };
  // Callback when a token is discovered
  onTokenDiscovered?: (token: DiscoveredToken) => void;
  // Callback when entry is prepared
  onEntryPrepared?: (entry: WebSocketEntryResult) => void;
  // Callback when entry fails
  onEntryFailed?: (token: DiscoveredToken, error: string) => void;
}

export interface WebSocketEntryResult {
  success: boolean;
  token: DiscoveredToken;
  signal?: EntrySignal;
  position?: any;
  error?: string;
  timestamp: number;
}

export interface OrchestratorStats {
  startTime: number;
  tokensDiscovered: number;
  tokensEvaluated: number;
  entriesPrepared: number;
  entriesSuccessful: number;
  entriesFailed: number;
  currentPositions: number;
  byAge: Record<string, {
    discovered: number;
    entered: number;
    failed: number;
  }>;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * WebSocket Entry Orchestrator
 *
 * Runs continuous real-time token discovery and entry.
 */
export class WebSocketEntryOrchestrator {
  private discovery: Awaited<ReturnType<typeof startWebSocketDiscovery>> | null = null;
  private activePositions = new Set<string>();
  private isRunning = false;
  private stats: OrchestratorStats = {
    startTime: Date.now(),
    tokensDiscovered: 0,
    tokensEvaluated: 0,
    entriesPrepared: 0,
    entriesSuccessful: 0,
    entriesFailed: 0,
    currentPositions: 0,
    byAge: {},
  };

  private unsubscribe: (() => void) | null = null;

  constructor(private options: WebSocketOrchestratorOptions) {
    // Initialize byAge stats
    for (const age of options.enabledAges) {
      this.stats.byAge[age] = {
        discovered: 0,
        entered: 0,
        failed: 0,
      };
    }
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    logger.info('Starting WebSocket Entry Orchestrator');
    logger.info({
      autoEnter: this.options.autoEnter,
      maxPositions: this.options.maxPositions,
      minScore: this.options.minOpportunityScore,
      enabledAges: this.options.enabledAges,
    }, 'Configuration');

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start WebSocket discovery
    this.discovery = await startWebSocketDiscovery();

    // Subscribe to discovered tokens
    this.unsubscribe = this.discovery.onDiscovered((token) => {
      this.handleDiscoveredToken(token);
    });

    logger.info('✅ Orchestrator started');
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping WebSocket Entry Orchestrator');
    this.isRunning = false;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.discovery) {
      this.discovery.disconnect();
      this.discovery = null;
    }

    logger.info('Orchestrator stopped');
  }

  /**
   * Handle a discovered token
   */
  private async handleDiscoveredToken(token: DiscoveredToken): Promise<void> {
    this.stats.tokensDiscovered++;

    // Update age stats
    if (this.stats.byAge[token.age]) {
      this.stats.byAge[token.age].discovered++;
    }

    // Notify callback
    if (this.options.onTokenDiscovered) {
      this.options.onTokenDiscovered(token);
    }

    // Log discovery
    logger.info(
      {
        symbol: token.symbol,
        age: token.ageCategory,
        score: token.opportunityScore,
        safety: token.safety.confidence,
      },
      `Token discovered: ${token.symbol}`
    );

    // Quick filters
    if (!this.passesQuickFilters(token)) {
      return;
    }

    this.stats.tokensEvaluated++;

    // Check if we should enter this token
    if (this.options.autoEnter && this.shouldEnterToken(token)) {
      await this.prepareEntry(token);
    }
  }

  /**
   * Check if token passes quick filters
   */
  private passesQuickFilters(token: DiscoveredToken): boolean {
    // Check if age is enabled
    if (!this.options.enabledAges.includes(token.age)) {
      logger.debug(
        { symbol: token.symbol, age: token.ageCategory },
        'Token age not enabled, skipping'
      );
      return false;
    }

    // Check minimum opportunity score
    if (token.opportunityScore < this.options.minOpportunityScore) {
      logger.debug(
        { symbol: token.symbol, score: token.opportunityScore },
        'Token below minimum score, skipping'
      );
      return false;
    }

    // Check safety confidence
    if (this.options.minSafetyConfidence) {
      const confidenceLevels = { high: 3, medium: 2, low: 1 };
      const minLevel = confidenceLevels[this.options.minSafetyConfidence];
      const tokenLevel = confidenceLevels[token.safety.confidence];

      if (tokenLevel < minLevel) {
        logger.debug(
          { symbol: token.symbol, confidence: token.safety.confidence },
          'Token below minimum confidence, skipping'
        );
        return false;
      }
    }

    // Check if we're at max positions
    if (this.activePositions.size >= this.options.maxPositions) {
      logger.debug(
        {
          symbol: token.symbol,
          currentPositions: this.activePositions.size,
          maxPositions: this.options.maxPositions,
        },
        'At max positions, skipping'
      );
      return false;
    }

    return true;
  }

  /**
   * Check if we should enter this token
   */
  private shouldEnterToken(token: DiscoveredToken): boolean {
    // Check if we already have a position in this token
    if (this.activePositions.has(token.address)) {
      logger.debug(
        { symbol: token.symbol },
        'Already have position, skipping'
      );
      return false;
    }

    return true;
  }

  /**
   * Prepare entry for a token
   */
  private async prepareEntry(token: DiscoveredToken): Promise<void> {
    this.stats.entriesPrepared++;

    logger.info(
      { symbol: token.symbol, age: token.ageCategory },
      `Preparing entry for ${token.symbol}...`
    );

    try {
      // Convert DiscoveredToken to EntrySignal format
      const signal = this.convertToEntrySignal(token);

      // Validate entry
      const safetyResults = new Map<string, any>();
      safetyResults.set(token.address, token.safety);

      const validationResults = await validateMultipleEntries(
        [signal as any],
        safetyResults,
        this.options.entryValidation
      );

      if (validationResults.length === 0) {
        logger.warn(
          { symbol: token.symbol },
          'Token failed validation, skipping entry'
        );
        this.stats.entriesFailed++;
        if (this.stats.byAge[token.age]) {
          this.stats.byAge[token.age].failed++;
        }
        if (this.options.onEntryFailed) {
          this.options.onEntryFailed(token, 'Failed validation');
        }
        return;
      }

      const validatedSignal = validationResults[0];

      // Calculate entry options if not provided
      const entryOptions = this.options.entryOptions ?? this.calculateEntryOptions();

      // Prepare the entry
      const entryResult = await prepareEntry(validatedSignal, entryOptions);

      const result: WebSocketEntryResult = {
        success: entryResult.success,
        token,
        signal: validatedSignal,
        position: entryResult.position,
        error: entryResult.error,
        timestamp: Date.now(),
      };

      if (result.success) {
        this.stats.entriesSuccessful++;
        this.activePositions.add(token.address);
        this.stats.currentPositions = this.activePositions.size;

        if (this.stats.byAge[token.age]) {
          this.stats.byAge[token.age].entered++;
        }

        logger.info(
          {
            symbol: token.symbol,
            age: token.ageCategory,
            positionId: entryResult.position?.id,
            target: `${(token.targetProfit * 100).toFixed(0)}%`,
            stop: `-${(token.stopLoss * 100).toFixed(0)}%`,
          },
          `✅ Entry prepared: ${token.symbol}`
        );

        if (this.options.onEntryPrepared) {
          this.options.onEntryPrepared(result);
        }
      } else {
        this.stats.entriesFailed++;
        if (this.stats.byAge[token.age]) {
          this.stats.byAge[token.age].failed++;
        }

        logger.warn(
          { symbol: token.symbol, error: entryResult.error },
          'Entry preparation failed'
        );

        if (this.options.onEntryFailed) {
          this.options.onEntryFailed(token, entryResult.error ?? 'Unknown error');
        }
      }
    } catch (error) {
      this.stats.entriesFailed++;
      if (this.stats.byAge[token.age]) {
        this.stats.byAge[token.age].failed++;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ symbol: token.symbol, error: errorMessage }, 'Entry preparation error');

      if (this.options.onEntryFailed) {
        this.options.onEntryFailed(token, errorMessage);
      }
    }
  }

  /**
   * Convert DiscoveredToken to EntrySignal format
   */
  private convertToEntrySignal(token: DiscoveredToken): Partial<EntrySignal> {
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      priceUsd: token.priceUsd,
      liquidity: token.liquidity,
      volume24h: token.volumeH24,
      priceChange1h: token.priceChangeH1,
      priceChangeH24: token.priceChangeH24,
      opportunityScore: token.opportunityScore,
      safetyScore: token.safety.confidence === 'high' ? 100 :
                   token.safety.confidence === 'medium' ? 70 : 40,
    };
  }

  /**
   * Calculate entry options based on current holdings
   */
  private calculateEntryOptions() {
    // Use position size from token strategy if available, otherwise use default
    const defaultSolAmount = 0.05; // 0.05 SOL default
    const lamports = defaultSolAmount * 1_000_000_000;

    return {
      inputAmount: lamports.toString(),
      slippageBps: 100, // 1%
    };
  }

  /**
   * Remove a position from active tracking
   */
  removePosition(tokenAddress: string): void {
    if (this.activePositions.has(tokenAddress)) {
      this.activePositions.delete(tokenAddress);
      this.stats.currentPositions = this.activePositions.size;
      logger.debug({ tokenAddress }, 'Removed position from active tracking');
    }
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
  getStats(): OrchestratorStats {
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
 * Create and start a WebSocket entry orchestrator
 */
export async function createWebSocketOrchestrator(
  options: WebSocketOrchestratorOptions
): Promise<WebSocketEntryOrchestrator> {
  const orchestrator = new WebSocketEntryOrchestrator(options);
  await orchestrator.start();
  return orchestrator;
}

/**
 * Default orchestrator options for live trading
 */
export const DEFAULT_ORCHESTRATOR_OPTIONS: Partial<WebSocketOrchestratorOptions> = {
  autoEnter: false, // Default to manual mode
  maxPositions: 3,
  currentSolHolding: 0.1,
  minOpportunityScore: 60,
  minSafetyConfidence: 'medium',
  enabledAges: [TokenAge.FRESH, TokenAge.WARM],
};

/**
 * Conservative options (safer, fewer entries)
 */
export const CONSERVATIVE_ORCHESTRATOR_OPTIONS: Partial<WebSocketOrchestratorOptions> = {
  autoEnter: false,
  maxPositions: 2,
  currentSolHolding: 0.1,
  minOpportunityScore: 75,
  minSafetyConfidence: 'high',
  enabledAges: [TokenAge.FRESH], // Only fresh tokens with high safety
};

/**
 * Aggressive options (more entries, higher risk)
 */
export const AGGRESSIVE_ORCHESTRATOR_OPTIONS: Partial<WebSocketOrchestratorOptions> = {
  autoEnter: false,
  maxPositions: 5,
  currentSolHolding: 0.1,
  minOpportunityScore: 50,
  minSafetyConfidence: 'medium',
  enabledAges: [TokenAge.FRESH, TokenAge.WARM],
};
