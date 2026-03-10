/**
 * Token Scanner
 *
 * Scans for trading opportunities by combining DexScreener data
 * with safety checks from the Safety Aggregator.
 */

import { logger } from '../utils/logger';
import type { TokenSearchResult } from './dexscreener';
import {
  getTrendingPairs,
  searchBySymbol,
  calculateOpportunityScore,
} from './dexscreener';
import {
  checkTokenSafetyAggregate,
  filterSafeTokens,
  type SafetyThresholds,
} from '../safety/aggregator';

// ============================================================================
// TYPES
// ============================================================================

export interface ScanCriteria {
  minLiquidityUsd?: number;
  maxLiquidityUsd?: number;
  minVolume24h?: number;
  minPriceChange1h?: number;
  maxPairAgeHours?: number;
  minPairAgeHours?: number;
  // Volume spike detection
  minVolumeRatio?: number;  // h1/h6 volume ratio (e.g., 2x = h1 volume is 2x what you'd expect)
  minBuyPressure?: number;   // buy/sell ratio (e.g., 1.5 = 1.5x more buys than sells)
}

export interface ScanResult {
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  dexId: string;
  pairAddress: string;
  priceUsd: number;
  liquidity: number;
  volumeH24: number;
  priceChangeH1: number;
  priceChangeH24: number;
  pairAge: number;
  opportunityScore: number;
  txnsH24: { buys: number; sells: number };
  safety: {
    safe: boolean | null;
    confidence: 'high' | 'medium' | 'low';
    reasons: string[];
  };
}

export interface ScannerOptions {
  criteria?: ScanCriteria;
  safetyThresholds?: SafetyThresholds;
  maxResults?: number;
  requireSafetyCheck?: boolean;
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_SCAN_CRITERIA: ScanCriteria = {
  // Loosened filters for better token discovery (2026-03-10)
  minLiquidityUsd: 10000,      // Lowered from 15000 - allow smaller pools
  maxLiquidityUsd: 5000000,    // Max $5M to avoid very established tokens
  minVolume24h: 1000,          // Lowered from 5000 - allow lower volume tokens
  minPriceChange1h: 1,         // Lowered from 2% - catch smaller moves early
  maxPairAgeHours: 6,          // Maximum 6 hours old (catch early moves)
  minPairAgeHours: 0.25,       // At least 15 minutes old (avoid brand new rugs)
  minVolumeRatio: 0.8,         // Lowered from 1.5 - catch volume spikes earlier
  minBuyPressure: 0.9,         // Lowered from 1.3 - allow balanced buy/sell
};

// ============================================================================
// SCANNER
// ============================================================================

/**
 * Scan trending tokens on Solana
 * Returns opportunities that match criteria and pass safety checks
 */
export async function scanTrendingTokens(
  options: ScannerOptions = {}
): Promise<ScanResult[]> {
  const {
    criteria = DEFAULT_SCAN_CRITERIA,
    safetyThresholds,
    maxResults = 20,
    requireSafetyCheck = true,
  } = options;

  logger.info({ criteria, maxResults }, 'Scanning trending tokens');

  // Fetch trending pairs from DexScreener
  const pairs = await getTrendingPairs(100);

  logger.debug({ fetched: pairs.length }, 'Fetched trending pairs');

  // Filter by basic criteria
  let candidates = pairs.filter(pair => matchesCriteria(pair, criteria));

  logger.debug({ candidates: candidates.length }, 'Pairs match basic criteria');

  // If safety check is required, filter by safety
  if (requireSafetyCheck && candidates.length > 0) {
    const tokenAddresses = candidates.map(c => c.address);

    logger.info(
      { checking: tokenAddresses.length },
      'Running safety checks on candidates'
    );

    const safeAddresses = await filterSafeTokens(tokenAddresses, safetyThresholds);

    logger.debug({ safe: safeAddresses.length }, 'Tokens passed safety check');

    // Keep only safe tokens
    candidates = candidates.filter(c => safeAddresses.includes(c.address));
  }

  // Calculate opportunity scores and build results
  const results: ScanResult[] = [];

  for (const candidate of candidates.slice(0, maxResults)) {
    const score = calculateOpportunityScore(candidate);

    const result: ScanResult = {
      address: candidate.address,
      name: candidate.name,
      symbol: candidate.symbol,
      chainId: candidate.chainId,
      dexId: candidate.dexId,
      pairAddress: candidate.pairAddress,
      priceUsd: candidate.priceUsd,
      liquidity: candidate.liquidity,
      volumeH24: candidate.volumeH24,
      priceChangeH1: candidate.priceChangeH1,
      priceChangeH24: candidate.priceChangeH24,
      pairAge: candidate.pairAge,
      opportunityScore: score,
      txnsH24: candidate.txnsH24,
      safety: {
        safe: true, // Already filtered
        confidence: 'high', // Placeholder, will be filled if we run full check
        reasons: [],
      } as const,
    };

    results.push(result);
  }

  // Sort by opportunity score (descending)
  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  logger.info(
    { found: results.length },
    'Scan complete'
  );

  return results;
}

/**
 * Scan for tokens matching a specific symbol
 * Useful for finding specific tokens or meme coins
 */
export async function scanBySymbol(
  symbol: string,
  options: ScannerOptions = {}
): Promise<ScanResult[]> {
  const {
    criteria = DEFAULT_SCAN_CRITERIA,
    safetyThresholds,
    maxResults = 10,
    requireSafetyCheck = true,
  } = options;

  logger.info({ symbol }, 'Scanning tokens by symbol');

  const pairs = await searchBySymbol(symbol);

  logger.debug({ found: pairs.length }, `Found ${pairs.length} pairs for ${symbol}`);

  // Filter by criteria
  let candidates = pairs.filter(pair => matchesCriteria(pair, criteria));

  // Safety check
  if (requireSafetyCheck && candidates.length > 0) {
    const safeAddresses = await filterSafeTokens(
      candidates.map(c => c.address),
      safetyThresholds
    );
    candidates = candidates.filter(c => safeAddresses.includes(c.address));
  }

  // Build results
  const results: ScanResult[] = candidates.slice(0, maxResults).map(candidate => ({
    address: candidate.address,
    name: candidate.name,
    symbol: candidate.symbol,
    chainId: candidate.chainId,
    dexId: candidate.dexId,
    pairAddress: candidate.pairAddress,
    priceUsd: candidate.priceUsd,
    liquidity: candidate.liquidity,
    volumeH24: candidate.volumeH24,
    priceChangeH1: candidate.priceChangeH1,
    priceChangeH24: candidate.priceChangeH24,
    pairAge: candidate.pairAge,
    opportunityScore: candidate.opportunityScore ?? 50,
    txnsH24: candidate.txnsH24,
    safety: {
      safe: true,
      confidence: 'high',
      reasons: [],
    },
  }));

  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return results;
}

/**
 * Quick scan - returns tokens that match criteria without safety check
 * Useful for getting a broad view of the market
 */
export async function quickScan(
  options: ScannerOptions = {}
): Promise<ScanResult[]> {
  const {
    criteria = DEFAULT_SCAN_CRITERIA,
    maxResults = 50,
  } = options;

  logger.info({ criteria }, 'Quick scan (no safety check)');

  const pairs = await getTrendingPairs(200);

  const candidates = pairs.filter(pair => matchesCriteria(pair, criteria));

  const results: ScanResult[] = candidates.slice(0, maxResults).map(candidate => ({
    address: candidate.address,
    name: candidate.name,
    symbol: candidate.symbol,
    chainId: candidate.chainId,
    dexId: candidate.dexId,
    pairAddress: candidate.pairAddress,
    priceUsd: candidate.priceUsd,
    liquidity: candidate.liquidity,
    volumeH24: candidate.volumeH24,
    priceChangeH1: candidate.priceChangeH1,
    priceChangeH24: candidate.priceChangeH24,
    pairAge: candidate.pairAge,
    opportunityScore: candidate.opportunityScore ?? 50,
    txnsH24: candidate.txnsH24,
    safety: {
      safe: null, // Unknown
      confidence: 'low',
      reasons: ['Safety check not performed'],
    },
  }));

  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return results;
}

/**
 * Get detailed safety info for a scan result
 * Runs full safety check and adds detailed info
 */
export async function enrichWithSafetyInfo(
  result: ScanResult,
  safetyThresholds?: SafetyThresholds
): Promise<ScanResult> {
  const safety = await checkTokenSafetyAggregate(result.address, safetyThresholds);

  return {
    ...result,
    safety: {
      safe: safety.safe,
      confidence: safety.confidence,
      reasons: safety.reasons,
    },
  };
}

/**
 * Enrich multiple scan results with safety info
 */
export async function enrichScanResults(
  results: ScanResult[],
  safetyThresholds?: SafetyThresholds
): Promise<ScanResult[]> {
  const enriched = await Promise.all(
    results.map(r => enrichWithSafetyInfo(r, safetyThresholds))
  );

  // Re-sort after safety check - safe tokens first
  return enriched.sort((a, b) => {
    if (a.safety.safe && !b.safety.safe) return -1;
    if (!a.safety.safe && b.safety.safe) return 1;
    return b.opportunityScore - a.opportunityScore;
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function matchesCriteria(
  pair: TokenSearchResult,
  criteria: ScanCriteria
): boolean {
  // Liquidity check
  if (criteria.minLiquidityUsd && pair.liquidity < criteria.minLiquidityUsd) {
    return false;
  }
  if (criteria.maxLiquidityUsd && pair.liquidity > criteria.maxLiquidityUsd) {
    return false;
  }

  // Volume check
  if (criteria.minVolume24h && pair.volumeH24 < criteria.minVolume24h) {
    return false;
  }

  // Price change check (pumping) - EARLY at only 2%
  if (criteria.minPriceChange1h && pair.priceChangeH1 < criteria.minPriceChange1h) {
    return false;
  }

  // Pair age check (15 min to 6 hours)
  if (criteria.maxPairAgeHours && pair.pairAge > criteria.maxPairAgeHours) {
    return false;
  }
  if (criteria.minPairAgeHours && pair.pairAge < criteria.minPairAgeHours) {
    return false;
  }

  // Volume spike check: h1 volume should be elevated compared to h6
  if (criteria.minVolumeRatio && pair.volumeH6) {
    // If h6 has X volume, h1 should have > X/6 * ratio
    // For example: if h6 = $60K (so $10K/hour avg), and ratio = 1.5
    // Then h1 should be > $10K * 1.5 = $15K
    const expectedH1Volume = pair.volumeH6 / 6;
    const actualH1Volume = pair.volumeH1 || 0;
    if (actualH1Volume < expectedH1Volume * criteria.minVolumeRatio) {
      return false;
    }
  }

  // Buy pressure check: more buys than sells
  if (criteria.minBuyPressure && pair.txnsH24) {
    const { buys, sells } = pair.txnsH24;
    if (sells > 0) {
      const buyRatio = buys / sells;
      if (buyRatio < criteria.minBuyPressure) {
        return false;
      }
    } else if (buys === 0) {
      // No transactions at all
      return false;
    }
  }

  return true;
}

/**
 * Format scan result for logging/display
 */
export function formatScanResult(result: ScanResult): string {
  const safeEmoji = result.safety.safe === null ? '❓' :
    result.safety.safe ? '✅' : '🚨';

  return [
    `${safeEmoji} ${result.symbol} (${result.name})`,
    `  Address: ${result.address.substring(0, 8)}...`,
    `  Price: $${result.priceUsd.toFixed(6)}`,
    `  Liquidity: $${result.liquidity.toLocaleString()}`,
    `  Volume 24h: $${result.volumeH24.toLocaleString()}`,
    `  Change 1h: ${result.priceChangeH1.toFixed(2)}%`,
    `  Change 24h: ${result.priceChangeH24.toFixed(2)}%`,
    `  Pair Age: ${result.pairAge.toFixed(1)}h`,
    `  Score: ${result.opportunityScore}/100`,
    result.safety.confidence ? `  Safety: ${result.safety.confidence}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Print scan results summary
 */
export function formatScanSummary(results: ScanResult[]): string {
  const safeCount = results.filter(r => r.safety.safe === true).length;
  const unsafeCount = results.filter(r => r.safety.safe === false).length;
  const unknownCount = results.filter(r => r.safety.safe === null).length;

  const lines = [
    'Scan Summary:',
    `  Total: ${results.length}`,
    `  Safe: ${safeCount}`,
    `  Unsafe: ${unsafeCount}`,
    `  Unknown: ${unknownCount}`,
    '',
  ];

  if (results.length > 0) {
    lines.push('Top Opportunities:');
    results.slice(0, 5).forEach((r, i) => {
      const emoji = r.safety.safe === null ? '❓' :
        r.safety.safe ? '✅' : '🚨';
      lines.push(`  ${i + 1}. ${emoji} ${r.symbol} - Score: ${r.opportunityScore}`);
    });
  }

  return lines.join('\n');
}
