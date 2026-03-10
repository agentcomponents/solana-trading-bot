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
}

export interface ScanResult {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  liquidity: number;
  volumeH24: number;
  priceChangeH1: number;
  priceChangeH24: number;
  pairAge: number;
  opportunityScore: number;
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
  minLiquidityUsd: 15000,
  maxLiquidityUsd: 5000000, // Max $5M to avoid very established tokens
  minVolume24h: 5000,
  minPriceChange1h: 5, // At least 5% pump in 1h
  maxPairAgeHours: 24, // Maximum 24 hours old (fresh tokens)
  minPairAgeHours: 0.5, // At least 30 minutes old (avoid brand new rugs)
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
      priceUsd: candidate.priceUsd,
      liquidity: candidate.liquidity,
      volumeH24: candidate.volumeH24,
      priceChangeH1: candidate.priceChangeH1,
      priceChangeH24: candidate.priceChangeH24,
      pairAge: candidate.pairAge,
      opportunityScore: score,
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
    priceUsd: candidate.priceUsd,
    liquidity: candidate.liquidity,
    volumeH24: candidate.volumeH24,
    priceChangeH1: candidate.priceChangeH1,
    priceChangeH24: candidate.priceChangeH24,
    pairAge: candidate.pairAge,
    opportunityScore: calculateOpportunityScoreForResult(candidate),
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
    priceUsd: candidate.priceUsd,
    liquidity: candidate.liquidity,
    volumeH24: candidate.volumeH24,
    priceChangeH1: candidate.priceChangeH1,
    priceChangeH24: candidate.priceChangeH24,
    pairAge: candidate.pairAge,
    opportunityScore: calculateOpportunityScoreForResult(candidate),
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

  // Price change check (pumping)
  if (criteria.minPriceChange1h && pair.priceChangeH1 < criteria.minPriceChange1h) {
    return false;
  }

  // Pair age check
  if (criteria.maxPairAgeHours && pair.pairAge > criteria.maxPairAgeHours) {
    return false;
  }
  if (criteria.minPairAgeHours && pair.pairAge < criteria.minPairAgeHours) {
    return false;
  }

  return true;
}

function calculateOpportunityScoreForResult(pair: TokenSearchResult): number {
  return calculateOpportunityScore(pair);
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
