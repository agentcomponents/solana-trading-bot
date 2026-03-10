/**
 * WebSocket Token Discovery
 *
 * Real-time token discovery using DexScreener WebSocket.
 * Monitors token boosts and classifies them by age for different strategies.
 *
 * FRESH tokens (<1 hour): Early entry, 10% target, tighter stop
 * WARM tokens (1-4 hours): Momentum entry, 5% target, standard stop
 *
 * CRITICAL: Only discovers tokens that are TRADEABLE on Jupiter.
 */

import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { getTokenInfo, type DexScreenerTokenInfo } from './dexscreener';
import { checkTokenSafetyAggregate } from '../safety/aggregator';
import { getQuote } from '../jupiter/client';
import type { AggregateSafetyResult } from '../safety/aggregator';

// ============================================================================
// CONFIG
// ============================================================================

const DEXSCREENER_WS_URL = 'wss://api.dexscreener.com/token-boosts/latest/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

// Age classification thresholds (in hours)
const AGE_THRESHOLDS = {
  FRESH_MAX: 1,      // < 1 hour = FRESH (early movers)
  WARM_MAX: 4,       // 1-4 hours = WARM (momentum)
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Token age classification
 */
export enum TokenAge {
  /** New token, less than 1 hour old */
  FRESH = 'fresh',
  /** Established momentum, 1-4 hours old */
  WARM = 'warm',
  /** Too old for our strategy */
  STALE = 'stale',
}

/**
 * WebSocket boost message from DexScreener
 */
export interface DexScreenerBoostMessage {
  limit?: number;
  data?: Array<{
    url: string;
    chainId: string;
    tokenAddress: string;
    amount?: number;
    totalAmount?: number;
    icon?: string;
    header?: string;
    description?: string;
  }>;
}

/**
 * Discovered token with full analysis
 */
export interface DiscoveredToken {
  // Basic info
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  dexId: string;
  pairAddress: string;

  // Price and volume
  priceUsd: number;
  liquidity: number;
  volumeH24: number;
  priceChangeH1: number;
  priceChangeH6: number;
  priceChangeH24: number;

  // Age classification
  pairAge: number;
  age: TokenAge;
  ageCategory: 'FRESH' | 'WARM' | 'STALE';

  // Strategy parameters (based on age)
  targetProfit: number;
  stopLoss: number;
  maxHoldTime: number;
  suggestedPositionSize: number;

  // Safety
  safety: AggregateSafetyResult;

  // Opportunity scoring
  opportunityScore: number;

  // Metadata
  discoveredAt: number;
  dexscreenerUrl: string;
}

/**
 * Strategy configuration for each token age
 */
export interface StrategyConfig {
  name: string;
  minLiquidityUsd: number;
  minVolume24h: number;
  minPriceChange1h: number;
  targetProfit: number;
  stopLoss: number;
  maxHoldHours: number;
  suggestedPositionSol: number;
}

// ============================================================================
// STRATEGY CONFIGURATIONS
// ============================================================================

/**
 * Strategy configurations by token age
 */
export const STRATEGIES: Record<TokenAge, StrategyConfig> = {
  [TokenAge.FRESH]: {
    name: 'FRESH - Early Entry',
    minLiquidityUsd: 10000,
    minVolume24h: 1000,
    minPriceChange1h: 0, // No pump required for fresh tokens
    targetProfit: 0.10,  // 10% target
    stopLoss: 0.20,      // -20% stop (tighter for new tokens)
    maxHoldHours: 1,     // 1 hour max
    suggestedPositionSol: 0.05,
  },
  [TokenAge.WARM]: {
    name: 'WARM - Momentum Entry',
    minLiquidityUsd: 25000,
    minVolume24h: 5000,
    minPriceChange1h: 3, // Must show momentum
    targetProfit: 0.05,  // 5% target
    stopLoss: 0.25,      // -25% stop
    maxHoldHours: 4,     // 4 hours max
    suggestedPositionSol: 0.10,
  },
  [TokenAge.STALE]: {
    name: 'STALE - Skip',
    minLiquidityUsd: Infinity,
    minVolume24h: Infinity,
    minPriceChange1h: Infinity,
    targetProfit: 0,
    stopLoss: 0,
    maxHoldHours: 0,
    suggestedPositionSol: 0,
  },
};

// ============================================================================
// WEBSOCKET DISCOVERY
// ============================================================================

/**
 * WebSocket discovery service
 */
export class WebSocketDiscovery {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<(token: DiscoveredToken) => void> = new Set();
  private errorHandlers: Set<(error: Error) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnected = false;
  private discoveredTokens = new Map<string, DiscoveredToken>();
  private duplicateProtectionWindow = 5 * 60 * 1000; // 5 minutes

  constructor(private wsUrl: string = DEXSCREENER_WS_URL) {}

  /**
   * Connect to DexScreener WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info({ url: this.wsUrl }, 'Connecting to DexScreener WebSocket');

      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        logger.info('✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = async (event) => {
        try {
          await this.handleMessage(event.data);
        } catch (error) {
          logger.error({ error }, 'Failed to handle WebSocket message');
        }
      };

      this.ws.onerror = (error) => {
        logger.error({ error }, 'WebSocket error');
        reject(error);
      };

      this.ws.onclose = () => {
        logger.warn('WebSocket closed');
        this.isConnected = false;
        this.ws = null;
        this.scheduleReconnect();
      };
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached, giving up');
      this.errorHandlers.forEach(handler => {
        handler(new Error('Max reconnect attempts reached'));
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Scheduling reconnect'
    );

    setTimeout(() => {
      this.connect().catch(() => {
        // Error already logged in connect()
      });
    }, delay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(data: string | Buffer): Promise<void> {
    let message: DexScreenerBoostMessage;

    try {
      message = JSON.parse(data.toString());
    } catch {
      return; // Ignore non-JSON messages
    }

    if (!message.data || !Array.isArray(message.data)) {
      return;
    }

    // Filter for Solana tokens only
    const solanaBoosts = message.data.filter(
      boost => boost.chainId === 'solana' && boost.tokenAddress
    );

    if (solanaBoosts.length === 0) {
      return;
    }

    logger.debug(
      { total: message.data.length, solana: solanaBoosts.length },
      'Received token boosts'
    );

    // Process each boost
    for (const boost of solanaBoosts) {
      await this.processToken(boost.tokenAddress);
    }
  }

  /**
   * Process a discovered token
   */
  private async processToken(tokenAddress: string): Promise<void> {
    // Duplicate protection
    const existing = this.discoveredTokens.get(tokenAddress);
    if (existing) {
      const timeSinceDiscovery = Date.now() - existing.discoveredAt;
      if (timeSinceDiscovery < this.duplicateProtectionWindow) {
        return; // Skip duplicate
      }
      // Remove old entry after window expires
      this.discoveredTokens.delete(tokenAddress);
    }

    try {
      // Fetch token info from DexScreener
      const tokenInfo = await getTokenInfo(tokenAddress);

      if (!tokenInfo) {
        logger.debug({ tokenAddress }, 'No token info found');
        return;
      }

      // Calculate pair age from pairCreatedAt
      const now = Date.now();
      const pairAgeHours = tokenInfo.pairCreatedAt
        ? (now - tokenInfo.pairCreatedAt) / (1000 * 60 * 60)
        : 0;

      // Classify token by age
      const age = this.classifyTokenAge(pairAgeHours);

      // Get strategy for this age
      const strategy = STRATEGIES[age];

      // Check if token meets basic criteria
      if (!this.meetsBasicCriteriaForToken(tokenInfo, strategy)) {
        logger.debug(
          { tokenAddress, symbol: tokenInfo.symbol, age },
          'Token does not meet basic criteria'
        );
        return;
      }

      // CRITICAL: Check if token is tradeable on Jupiter
      const jupiterTradeable = await this.checkJupiterTradeability(tokenAddress);
      if (!jupiterTradeable) {
        logger.debug(
          { tokenAddress, symbol: tokenInfo.symbol },
          'Token not tradeable on Jupiter - skipping'
        );
        return;
      }

      // Run safety check
      const safety = await checkTokenSafetyAggregate(tokenAddress);

      if (!safety.safe) {
        logger.debug(
          { tokenAddress, symbol: tokenInfo.symbol, reasons: safety.reasons },
          'Token failed safety check'
        );
        return;
      }

      // Calculate opportunity score
      const opportunityScore = this.calculateOpportunityScoreForToken(tokenInfo, age, safety);

      // Build discovered token
      const discovered: DiscoveredToken = {
        address: tokenInfo.tokenAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        chainId: tokenInfo.chainId,
        dexId: 'unknown', // Not provided by getTokenInfo
        pairAddress: tokenInfo.pairAddress ?? '',
        priceUsd: 0, // Not provided directly
        liquidity: tokenInfo.liquidity?.usd ?? 0,
        volumeH24: tokenInfo.volumeH24 ?? 0,
        priceChangeH1: tokenInfo.priceChangeH1 ?? 0,
        priceChangeH6: tokenInfo.priceChangeH6 ?? 0,
        priceChangeH24: tokenInfo.priceChangeH24 ?? 0,
        pairAge: pairAgeHours,
        age,
        ageCategory: age.toUpperCase() as 'FRESH' | 'WARM' | 'STALE',
        targetProfit: strategy.targetProfit,
        stopLoss: strategy.stopLoss,
        maxHoldTime: strategy.maxHoldHours * 60 * 60 * 1000,
        suggestedPositionSize: strategy.suggestedPositionSol,
        safety,
        opportunityScore,
        discoveredAt: Date.now(),
        dexscreenerUrl: tokenInfo.pairAddress
          ? `https://dexscreener.com/solana/${tokenInfo.pairAddress}`
          : `https://dexscreener.com/solana/${tokenAddress}`,
      };

      // Store in discovered tokens
      this.discoveredTokens.set(tokenAddress, discovered);

      // Notify handlers
      this.messageHandlers.forEach(handler => handler(discovered));

      logger.info(
        {
          symbol: discovered.symbol,
          age: discovered.ageCategory,
          score: discovered.opportunityScore,
          target: `${(discovered.targetProfit * 100).toFixed(0)}%`,
          stop: `${-(discovered.stopLoss * 100).toFixed(0)}%`,
          liquidity: `$${discovered.liquidity.toLocaleString()}`,
        },
        '🎯 New token discovered'
      );
    } catch (error) {
      logger.error({ error, tokenAddress }, 'Failed to process token');
    }
  }

  /**
   * Classify token by age
   */
  private classifyTokenAge(pairAgeHours: number): TokenAge {
    if (pairAgeHours < AGE_THRESHOLDS.FRESH_MAX) {
      return TokenAge.FRESH;
    }
    if (pairAgeHours < AGE_THRESHOLDS.WARM_MAX) {
      return TokenAge.WARM;
    }
    return TokenAge.STALE;
  }

  /**
   * Check if token meets basic criteria for its age category
   */
  private meetsBasicCriteriaForToken(tokenInfo: DexScreenerTokenInfo, strategy: StrategyConfig): boolean {
    // Liquidity check
    const liquidity = tokenInfo.liquidity?.usd ?? 0;
    if (liquidity < strategy.minLiquidityUsd) {
      return false;
    }

    // Volume check
    if ((tokenInfo.volumeH24 ?? 0) < strategy.minVolume24h) {
      return false;
    }

    // Price change check (skip for FRESH tokens)
    if (strategy.minPriceChange1h > 0) {
      if ((tokenInfo.priceChangeH1 ?? 0) < strategy.minPriceChange1h) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if token is tradeable on Jupiter
   *
   * CRITICAL: If we can't get a quote, we can't trade the token.
   * This filters out tokens that aren't on Jupiter or have no liquidity path.
   */
  private async checkJupiterTradeability(tokenAddress: string): Promise<boolean> {
    try {
      // Try to get a quote for a small amount
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: tokenAddress,
        amount: String(0.01 * LAMPORTS_PER_SOL), // 0.01 SOL test amount
        slippageBps: 100, // 1%
      });

      // If we get a quote with a valid output amount, token is tradeable
      const tradeable = Boolean(
        quote &&
        quote.outAmount &&
        BigInt(quote.outAmount) > 0n
      );

      if (tradeable) {
        logger.debug(
          { tokenAddress },
          'Token is tradeable on Jupiter'
        );
      }

      return tradeable;
    } catch (error) {
      // Jupiter quote failed - token not tradeable
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.debug(
        { tokenAddress, error: errorMessage },
        'Token not tradeable on Jupiter'
      );
      return false;
    }
  }

  /**
   * Calculate opportunity score for token
   */
  private calculateOpportunityScoreForToken(
    tokenInfo: DexScreenerTokenInfo,
    age: TokenAge,
    safety: AggregateSafetyResult
  ): number {
    let score = 0;

    // Safety score (0-30 points)
    if (safety.confidence === 'high') score += 30;
    else if (safety.confidence === 'medium') score += 15;

    // Liquidity score (0-20 points)
    const liquidity = tokenInfo.liquidity?.usd ?? 0;
    if (age === TokenAge.FRESH) {
      if (liquidity >= 20000 && liquidity <= 100000) score += 20;
      else if (liquidity >= 10000) score += 10;
    } else {
      if (liquidity >= 50000 && liquidity <= 200000) score += 20;
      else if (liquidity >= 25000) score += 10;
    }

    // Volume spike score (0-25 points)
    if (tokenInfo.volumeH1 && tokenInfo.volumeH6) {
      const expectedH1 = tokenInfo.volumeH6 / 6;
      const volumeRatio = tokenInfo.volumeH1 / expectedH1;
      if (volumeRatio >= 2) score += 25;
      else if (volumeRatio >= 1.5) score += 15;
      else if (volumeRatio >= 1.2) score += 5;
    }

    // Early momentum bonus for FRESH tokens (0-25 points)
    if (age === TokenAge.FRESH) {
      const priceChangeH1 = tokenInfo.priceChangeH1 ?? 0;
      if (priceChangeH1 > 0 && priceChangeH1 < 10) {
        score += 25; // Fresh with some momentum but not over-pumped
      } else if (priceChangeH1 >= 0) {
        score += 15;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Subscribe to discovered tokens
   */
  onDiscovered(handler: (token: DiscoveredToken) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to errors
   */
  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Check if connected
   */
  active(): boolean {
    return this.isConnected;
  }

  /**
   * Get recently discovered tokens
   */
  getRecentTokens(minutes: number = 10): DiscoveredToken[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return Array.from(this.discoveredTokens.values())
      .filter(t => t.discoveredAt > cutoff)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Clear old discovered tokens
   */
  clearOldTokens(hours: number = 1): void {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    for (const [address, token] of this.discoveredTokens.entries()) {
      if (token.discoveredAt < cutoff) {
        this.discoveredTokens.delete(address);
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalDiscovery: WebSocketDiscovery | null = null;

/**
 * Get global WebSocket discovery instance
 */
export function getWebSocketDiscovery(): WebSocketDiscovery {
  if (!globalDiscovery) {
    globalDiscovery = new WebSocketDiscovery();
  }
  return globalDiscovery;
}

/**
 * Start WebSocket discovery service
 */
export async function startWebSocketDiscovery(): Promise<WebSocketDiscovery> {
  const discovery = getWebSocketDiscovery();
  if (!discovery.active()) {
    await discovery.connect();
  }
  return discovery;
}

/**
 * Stop WebSocket discovery service
 */
export function stopWebSocketDiscovery(): void {
  if (globalDiscovery) {
    globalDiscovery.disconnect();
    globalDiscovery = null;
  }
}
