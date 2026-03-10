/**
 * Slippage Simulator for Paper Trading
 *
 * Simulates realistic slippage beyond Jupiter's quote to account for:
 * - Liquidity depth
 * - Price impact
 * - Volatility
 * - Trade size relative to pool
 *
 * Formula from design:
 * baseSlippage = (tradeSize / poolSize)^1.5 × 100 bps
 * finalSlippage = base × volatility × liquidity × side × jitter
 * Clamp: 5 bps to 500 bps
 */

import type { TokenSearchResult } from '../scanner/dexscreener';

// Re-export for external use
export type { TokenSearchResult };

// ============================================================================
// TYPES
// ============================================================================

export interface SlippageSimulation {
  slippageBps: number; // Additional slippage beyond quote (5-500 bps)
  confidence: number; // 0-1
  factors: SlippageFactors;
}

export interface SlippageFactors {
  liquidityDepth: number; // 0-1, higher = better
  priceImpact: number; // % impact from trade size
  volatility: number; // 0-1
  sizeVsPool: number; // Trade size / pool size ratio
}

export interface SlippageCalculationParams {
  tokenAddress: string;
  inputAmountSol: number; // SOL amount being traded
  liquidity: number; // USD liquidity of the pool
  isBuy: boolean;
  priceChange1h?: number; // For volatility calculation
}

// ============================================================================
// SLIPPAGE SIMULATOR
// ============================================================================

export class SlippageSimulator {
  private historicalSlippage: Map<string, number[]> = new Map();
  private readonly maxHistorySize = 100;

  /**
   * Calculate simulated slippage for a trade
   */
  async calculateSlippage(params: SlippageCalculationParams): Promise<SlippageSimulation> {
    const { inputAmountSol, liquidity, isBuy, priceChange1h } = params;

    // Guard against zero liquidity
    if (liquidity <= 0) {
      return this.defaultSlippage(isBuy);
    }

    // 1. Calculate size ratio (trade / pool)
    const poolSolAmount = liquidity / 150; // Rough SOL price estimate
    const sizeRatio = Math.min(inputAmountSol / poolSolAmount, 1);

    // 2. Base slippage (exponential with size)
    const sizeSlippage = Math.pow(sizeRatio, 1.5) * 100;

    // 3. Volatility adjustment (from price change if available)
    const volatility = this.calculateVolatility(priceChange1h);
    const volatilityMultiplier = 1 + (volatility * 2);

    // 4. Liquidity adjustment (more liquidity = less slippage)
    const liquidityScore = Math.min(liquidity / 50000, 1);
    const liquidityMultiplier = 2 - liquidityScore;

    // 5. Side adjustment (sells typically have more slippage)
    const sideMultiplier = isBuy ? 1 : 1.5;

    // 6. Calculate with jitter
    let slippageBps = sizeSlippage * volatilityMultiplier * liquidityMultiplier * sideMultiplier;
    const jitter = slippageBps * 0.2 * (Math.random() * 2 - 1);
    slippageBps += jitter;

    // 7. Clamp to bounds
    slippageBps = Math.max(5, Math.min(slippageBps, 500));
    slippageBps = Math.round(slippageBps);

    // 8. Update history and calculate confidence
    this.updateHistory(params.tokenAddress, slippageBps);
    const confidence = this.calculateConfidence(params.tokenAddress);

    return {
      slippageBps,
      confidence,
      factors: {
        liquidityDepth: liquidityScore,
        priceImpact: sizeRatio * 100,
        volatility,
        sizeVsPool: sizeRatio * 100,
      },
    };
  }

  /**
   * Calculate volatility from price change
   */
  private calculateVolatility(priceChange1h?: number): number {
    if (priceChange1h === undefined) return 0.5; // Default medium volatility
    return Math.min(Math.abs(priceChange1h) / 50, 1); // 50% change = max volatility
  }

  /**
   * Update historical slippage data for a token
   */
  private updateHistory(tokenAddress: string, slippageBps: number): void {
    if (!this.historicalSlippage.has(tokenAddress)) {
      this.historicalSlippage.set(tokenAddress, []);
    }

    const history = this.historicalSlippage.get(tokenAddress)!;
    history.push(slippageBps);

    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Calculate confidence in slippage estimate based on history
   */
  private calculateConfidence(tokenAddress: string): number {
    const history = this.historicalSlippage.get(tokenAddress);
    if (!history || history.length < 3) return 0.3; // Low confidence with little data

    // Calculate standard deviation
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);

    // Lower std deviation = higher confidence
    const coefficientOfVariation = stdDev / mean;
    return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
  }

  /**
   * Get default slippage when data is unavailable
   */
  private defaultSlippage(isBuy: boolean): SlippageSimulation {
    return {
      slippageBps: isBuy ? 50 : 75, // Slightly higher for sells
      confidence: 0.1,
      factors: {
        liquidityDepth: 0,
        priceImpact: 0,
        volatility: 0.5,
        sizeVsPool: 0,
      },
    };
  }

  /**
   * Get historical slippage data for a token
   */
  getHistory(tokenAddress: string): number[] {
    return this.historicalSlippage.get(tokenAddress) || [];
  }

  /**
   * Clear all historical data
   */
  clearHistory(): void {
    this.historicalSlippage.clear();
  }

  /**
   * Get average slippage for a token
   */
  getAverageSlippage(tokenAddress: string): number | null {
    const history = this.historicalSlippage.get(tokenAddress);
    if (!history || history.length === 0) return null;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let slippageSimulatorInstance: SlippageSimulator | null = null;

export function getSlippageSimulator(): SlippageSimulator {
  if (!slippageSimulatorInstance) {
    slippageSimulatorInstance = new SlippageSimulator();
  }
  return slippageSimulatorInstance;
}

export function closeSlippageSimulator(): void {
  slippageSimulatorInstance = null;
}
