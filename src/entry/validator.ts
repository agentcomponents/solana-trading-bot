/**
 * Entry Validator
 *
 * Validates whether a token meets entry criteria.
 * Part of the entry decision flow before executing a trade.
 */

import { logger } from '../utils/logger';
import type { TokenSearchResult } from '../scanner/dexscreener';
import type { AggregateSafetyResult } from '../safety/aggregator';

// ============================================================================
// TYPES
// ============================================================================

export interface EntryValidationOptions {
  minLiquidityUsd: number;
  maxLiquidityUsd: number;
  minPriceChange1h: number;
  maxPriceChange24h: number; // Avoid already pumped too much
  minHolders: number;
  maxHolderConcentrationPct: number;
  requireSafetyCheck: boolean;
}

export interface EntryValidationResult {
  valid: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  data: {
    token: TokenSearchResult | null;
    safety: AggregateSafetyResult | null;
  };
}

export interface EntrySignal {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  priceChange1h: number;
  priceChangeH24: number;
  opportunityScore: number;
  safetyScore: number;
  entryScore: number; // Combined score 0-100
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_ENTRY_VALIDATION: EntryValidationOptions = {
  minLiquidityUsd: 15000,
  maxLiquidityUsd: 500000, // Not too established
  minPriceChange1h: 5, // At least 5% pump in 1h
  maxPriceChange24h: 200, // Not already pumped 200%
  minHolders: 100,
  maxHolderConcentrationPct: 60, // Alert if > 60% owned by top wallet
  requireSafetyCheck: true,
};

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Validate if a token is a good entry candidate
 */
export async function validateEntry(
  token: TokenSearchResult,
  safety: AggregateSafetyResult | null,
  options: EntryValidationOptions = DEFAULT_ENTRY_VALIDATION
): Promise<EntryValidationResult> {
  const reasons: string[] = [];
  let valid = true;
  let confidence: 'high' | 'medium' | 'low' = 'high';

  // 1. Safety Check (critical)
  if (options.requireSafetyCheck) {
    if (!safety) {
      valid = false;
      reasons.push('Safety check not performed');
      confidence = 'low';
    } else if (!safety.safe) {
      valid = false;
      reasons.push(...safety.reasons.slice(0, 3));
      confidence = safety.confidence;
    } else {
      // Safe, but check confidence level
      if (safety.confidence === 'low') {
        confidence = 'medium';
        reasons.push('Safety confidence is low');
      }
    }
  }

  // 2. Liquidity Check
  if (token.liquidity < options.minLiquidityUsd) {
    valid = false;
    reasons.push(
      `Insufficient liquidity: $${token.liquidity.toLocaleString()} < $${options.minLiquidityUsd.toLocaleString()}`
    );
  }

  if (token.liquidity > options.maxLiquidityUsd) {
    valid = false;
    reasons.push(
      `Too much liquidity: $${token.liquidity.toLocaleString()} > $${options.maxLiquidityUsd.toLocaleString()}`
    );
  }

  // 3. Price Momentum Check
  if (token.priceChangeH1 < options.minPriceChange1h) {
    valid = false;
    reasons.push(
      `Insufficient momentum: ${token.priceChangeH1.toFixed(2)}% < ${options.minPriceChange1h}%`
    );
  }

  if (token.priceChangeH24 > options.maxPriceChange24h) {
    valid = false;
    reasons.push(
      `Already pumped too much: ${token.priceChangeH24.toFixed(2)}% > ${options.maxPriceChange24h}%`
    );
  }

  // 4. Check for negative price momentum (dumping)
  if (token.priceChangeH1 < -10) {
    valid = false;
    reasons.push(`Price dumping: ${token.priceChangeH1.toFixed(2)}% in 1h`);
  }

  // 5. Safety-specific checks
  if (safety && safety.safe) {
    // Check holder concentration
    const topHolderPct = safety.data.holderCheck.topHolderPct;
    if (topHolderPct > options.maxHolderConcentrationPct) {
      confidence = 'low';
      reasons.push(
        `High holder concentration: ${topHolderPct}% > ${options.maxHolderConcentrationPct}%`
      );
    }

    // Check authority risks
    if (safety.data.authorityCheck.isMintable) {
      valid = false;
      reasons.push('Token is mintable');
    }

    if (safety.data.authorityCheck.isFreezable) {
      valid = false;
      reasons.push('Token is freezable');
    }
  }

  // Build result
  const result: EntryValidationResult = {
    valid,
    confidence,
    reasons,
    data: {
      token,
      safety,
    },
  };

  logger.debug(
    {
      address: token.address,
      valid,
      confidence,
      reasonsCount: reasons.length,
    },
    'Entry validation complete'
  );

  return result;
}

/**
 * Create an entry signal for a validated token
 * Calculates combined entry score
 */
export function createEntrySignal(
  token: TokenSearchResult,
  safety: AggregateSafetyResult | null
): EntrySignal {
  // Calculate safety score (0-100)
  let safetyScore = 50; // Base score

  if (safety) {
    if (safety.safe) {
      if (safety.confidence === 'high') safetyScore = 90;
      else if (safety.confidence === 'medium') safetyScore = 70;
      else safetyScore = 50;
    } else {
      safetyScore = 0;
    }

    // Deduct for risks
    safetyScore -= safety.data.holderCheck.topHolderPct * 0.5;
    if (safety.data.authorityCheck.isMetadataMutable) safetyScore -= 10;
    safetyScore = Math.max(0, Math.min(100, safetyScore));
  }

  // Calculate entry score (60% opportunity, 40% safety)
  const opportunityScore = Math.min(token.opportunityScore ?? 50, 100);
  const entryScore = Math.round(
    (opportunityScore * 0.6) + (safetyScore * 0.4)
  );

  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    priceUsd: token.priceUsd,
    liquidity: token.liquidity,
    volume24h: token.volumeH24,
    priceChange1h: token.priceChangeH1,
    priceChangeH24: token.priceChangeH24,
    opportunityScore,
    safetyScore,
    entryScore,
  };
}

/**
 * Validate multiple tokens and return entry signals for valid ones
 */
export async function validateMultipleEntries(
  tokens: TokenSearchResult[],
  safetyResults: Map<string, AggregateSafetyResult>,
  options?: EntryValidationOptions
): Promise<EntrySignal[]> {
  const signals: EntrySignal[] = [];

  for (const token of tokens) {
    const safety = safetyResults.get(token.address) ?? null;

    const validation = await validateEntry(token, safety, options);

    if (validation.valid) {
      const signal = createEntrySignal(token, safety);
      signals.push(signal);
    }
  }

  // Sort by entry score (descending)
  signals.sort((a, b) => b.entryScore - a.entryScore);

  return signals;
}

/**
 * Format entry validation result
 */
export function formatValidationResult(result: EntryValidationResult): string {
  const emoji = result.valid ? '✅' : '❌';
  const lines = [
    `${emoji} Entry Validation: ${result.confidence.toUpperCase()}`,
    '',
  ];

  if (result.reasons.length > 0) {
    lines.push('Reasons:');
    for (const reason of result.reasons) {
      lines.push(`  - ${reason}`);
    }
    lines.push('');
  }

  if (result.data.token) {
    const t = result.data.token;
    lines.push('Token Data:');
    lines.push(`  Symbol: ${t.symbol}`);
    lines.push(`  Price: $${t.priceUsd.toFixed(6)}`);
    lines.push(`  Liquidity: $${t.liquidity.toLocaleString()}`);
    lines.push(`  Change 1h: ${t.priceChangeH1.toFixed(2)}%`);
    lines.push(`  Opportunity Score: ${t.opportunityScore}/100`);
  }

  return lines.join('\n');
}

/**
 * Format entry signal
 */
export function formatEntrySignal(signal: EntrySignal): string {
  return [
    `📈 ${signal.symbol} (${signal.name})`,
    `  Entry Score: ${signal.entryScore}/100`,
    `  Opportunity: ${signal.opportunityScore}/100`,
    `  Safety: ${signal.safetyScore}/100`,
    `  Price: $${signal.priceUsd.toFixed(6)}`,
    `  Change 1h: ${signal.priceChange1h.toFixed(2)}%`,
    `  Volume 24h: $${signal.volume24h.toLocaleString()}`,
  ].join('\n');
}
