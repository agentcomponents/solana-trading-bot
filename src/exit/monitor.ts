/**
 * Price Monitor
 *
 * Polls Jupiter API for current token prices and emits updates.
 * Uses price caching to avoid excessive API calls.
 */

import type { Position } from '../db/schema';
import { getQuote } from '../jupiter/client';
import { logger } from '../utils/logger';
import { EXIT_CONFIG } from './config';
import { calculatePnlPercent, type PriceUpdate } from './strategy';

// ============================================================================
// CONSTANTS
// ============================================================================

/** SOL mint address */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/** Maximum poll interval (fallback) */
const MAX_POLL_INTERVAL = 10_000; // 10 seconds

// ============================================================================
// TYPES
// ============================================================================

/**
 * Price update callback
 */
export type PriceCallback = (update: PriceUpdate) => void | Promise<void>;

/**
 * Monitoring state for a single position
 */
interface MonitoringState {
  position: Position;
  callback: PriceCallback;
  intervalId: NodeJS.Timeout | null;
  lastPrice: number;
  lastUpdate: number;
}

// ============================================================================
// PRICE MONITOR
// ============================================================================

/**
 * Fetch current price for a position
 *
 * Gets a quote from Jupiter for selling the full position.
 * Returns the expected SOL output (price per token).
 */
async function fetchCurrentPrice(position: Position): Promise<number> {
  try {
    const quote = await getQuote({
      inputMint: position.tokenMint,
      outputMint: SOL_MINT,
      amount: position.tokensReceivedRaw, // Full position
      slippageBps: 100, // 1% - just for price discovery
    });

    // Calculate price per token in SOL
    const outLamports = BigInt(quote.outAmount);
    const outSol = Number(outLamports) / 1_000_000_000; // Convert to SOL

    // Calculate price per token (entry was in SOL per token)
    const tokenAmount = parseFloat(position.tokensReceivedRaw) / Math.pow(10, position.tokenDecimals);
    const pricePerToken = tokenAmount > 0 ? outSol / tokenAmount : outSol;

    return pricePerToken;
  } catch (error) {
    logger.error({ error, tokenMint: position.tokenMint }, 'Failed to fetch price');
    throw error;
  }
}

/**
 * Price Monitor Class
 *
 * Manages price polling for multiple positions.
 */
export class PriceMonitor {
  private monitoringStates: Map<string, MonitoringState> = new Map();
  private pollInterval: number;
  private isRunning: boolean = false;

  constructor(pollIntervalMs: number = EXIT_CONFIG.PRICE_POLL_INTERVAL_MS) {
    this.pollInterval = Math.min(pollIntervalMs, MAX_POLL_INTERVAL);
  }

  /**
   * Start monitoring a position
   *
   * Begins polling Jupiter API for price updates.
   * Callback is invoked on each price update.
   */
  startMonitoring(position: Position, callback: PriceCallback): void {
    const tokenMint = position.tokenMint;

    // Check if already monitoring
    if (this.monitoringStates.has(tokenMint)) {
      logger.warn({ tokenMint }, 'Already monitoring this position');
      return;
    }

    logger.info(
      {
        tokenMint,
        state: position.state,
        entryPrice: position.entryPricePerToken,
        pollInterval: this.pollInterval,
      },
      'Starting price monitoring'
    );

    // Create monitoring state
    const state: MonitoringState = {
      position,
      callback,
      intervalId: null,
      lastPrice: position.entryPricePerToken,
      lastUpdate: Date.now(),
    };

    // Start polling immediately
    this.pollPosition(state);

    // Set up recurring poll
    state.intervalId = setInterval(() => {
      this.pollPosition(state).catch((error) => {
        logger.error({ error, tokenMint }, 'Polling error');
      });
    }, this.pollInterval);

    this.monitoringStates.set(tokenMint, state);
    this.isRunning = this.monitoringStates.size > 0;
  }

  /**
   * Stop monitoring a position
   */
  stopMonitoring(tokenMint: string): void {
    const state = this.monitoringStates.get(tokenMint);
    if (!state) {
      return;
    }

    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    this.monitoringStates.delete(tokenMint);
    this.isRunning = this.monitoringStates.size > 0;

    logger.info({ tokenMint }, 'Stopped price monitoring');
  }

  /**
   * Stop monitoring all positions
   */
  stopAll(): void {
    for (const tokenMint of this.monitoringStates.keys()) {
      this.stopMonitoring(tokenMint);
    }
  }

  /**
   * Poll a single position for price update
   */
  private async pollPosition(state: MonitoringState): Promise<void> {
    const { position } = state;

    try {
      // Fetch current price
      const currentPrice = await fetchCurrentPrice(position);

      // Calculate P&L
      const pnlPercent = calculatePnlPercent(position.entryPricePerToken, currentPrice);

      // Update state
      state.lastPrice = currentPrice;
      state.lastUpdate = Date.now();

      // Create price update
      const update: PriceUpdate = {
        tokenMint: position.tokenMint,
        currentPrice,
        pnlPercent,
        timestamp: Date.now(),
      };

      // Invoke callback
      await state.callback(update);

    } catch (error) {
      logger.error(
        {
          error,
          tokenMint: position.tokenMint,
        },
        'Failed to poll position'
      );
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    monitoringCount: number;
    monitoredTokens: string[];
  } {
    return {
      isRunning: this.isRunning,
      monitoringCount: this.monitoringStates.size,
      monitoredTokens: Array.from(this.monitoringStates.keys()),
    };
  }

  /**
   * Get cached price for a token
   */
  getCachedPrice(tokenMint: string): number | null {
    const state = this.monitoringStates.get(tokenMint);
    if (!state) {
      return null;
    }

    // Check if cache is stale
    const age = Date.now() - state.lastUpdate;
    if (age > EXIT_CONFIG.PRICE_CACHE_TTL_MS) {
      return null;
    }

    return state.lastPrice;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalMonitor: PriceMonitor | null = null;

/**
 * Get global price monitor instance
 */
export function getPriceMonitor(pollIntervalMs?: number): PriceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PriceMonitor(pollIntervalMs);
  }
  return globalMonitor;
}

/**
 * Close global price monitor
 */
export function closePriceMonitor(): void {
  if (globalMonitor) {
    globalMonitor.stopAll();
    globalMonitor = null;
  }
}
