/**
 * DexScreener API Client
 *
 * Fetches token data from DexScreener for finding opportunities.
 * Documentation: https://docs.dexscreener.com/api/reference
 *
 * Rate Limits (conservative - 50% of documented to avoid 429s):
 * - Slow tier (30 req/min): token-boosts, token-profiles, community-takeovers, ads
 * - Fast tier (150 req/min): dex/search, dex/pairs, token-pairs, tokens (batch)
 *
 * Caching:
 * - Boosted tokens: 2.5 minute cache (reduces API calls by ~80%)
 */

import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import { dexScreenerLimiter } from '../utils/rate-limiter';
import { boostsCache } from '../utils/cache';

// ============================================================================
// CONFIG
// ============================================================================

const API_BASE = 'https://api.dexscreener.com';
const USER_AGENT = 'SolanaTradingBot/1.0';

// Conservative rate limits (50% of documented)
const RATE_LIMITS = {
  slow: 30, // boosts, profiles, community-takeovers (documented: 60)
  fast: 150, // search, pairs, tokens (batch) (documented: 300)
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Token boost response from DexScreener
 * Tokens that are being promoted/boosted
 */
export interface DexScreenerTokenBoost {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  header?: string;
  description?: string | null;
  links?: Array<{
    type?: string;
    label?: string;
    url: string;
  }>;
}

export interface DexScreenerTokenInfo {
  chainId: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals?: number;
  logo?: string;
  visited: boolean;
  volumeH1?: number;
  volumeH6?: number;
  volumeH24?: number;
  priceChangeH1?: number;
  priceChangeH6?: number;
  priceChangeH24?: number;
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  pairAddress?: string;
  pairCreatedAt?: number;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
    decimals?: number;
    liquidity?: number;
    fdv?: number;
  };
  quoteToken: {
    symbol: string;
    address: string;
    decimals?: number;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    h24?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    m5?: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  pairCreatedAt?: number;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

export interface TokenSearchResult {
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  dexId: string;
  pairAddress: string;
  priceUsd: number;
  liquidity: number;
  volumeH24: number;
  volumeH6?: number;  // Volume in last 6 hours
  volumeH1?: number;  // Volume in last 1 hour
  priceChangeH24: number;
  priceChangeH1: number;
  txnsH24: { buys: number; sells: number };
  pairAge: number; // Hours since pair creation
  opportunityScore?: number; // Calculated opportunity score (0-100)
}

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * Get token info from DexScreener by token address
 * Uses /token-pairs/v1/{chainId}/{tokenAddress} endpoint (fast tier)
 */
export async function getTokenInfo(
  tokenAddress: string
): Promise<DexScreenerTokenInfo | null> {
  logger.debug({ tokenAddress }, 'Fetching token info from DexScreener');

  try {
    await dexScreenerLimiter.waitForFast();

    const response = await retry(
      async () => {
        const res = await fetch(
          `${API_BASE}/token-pairs/v1/solana/${tokenAddress}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`DexScreener API returned ${res.status}`);
        }

        return res;
      },
      { maxAttempts: 3, initialDelayMs: 1000 }
    );

    const data = (await response.json()) as DexScreenerPair[];

    if (!Array.isArray(data) || data.length === 0) {
      logger.debug({ tokenAddress }, 'No pairs found for token');
      return null;
    }

    // Find the best pair (highest liquidity)
    const bestPair = data.sort((a, b) =>
      (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    )[0];

    if (!bestPair) {
      return null;
    }

    return pairToTokenInfo(bestPair);
  } catch (error) {
    logger.error({ error, tokenAddress }, 'Failed to fetch token info');
    return null;
  }
}

/**
 * Get pair info from DexScreener by pair address
 * Uses /latest/dex/pairs/{chainId}/{pairId} endpoint (fast tier)
 */
export async function getPairInfo(
  pairAddress: string
): Promise<DexScreenerPair | null> {
  logger.debug({ pairAddress }, 'Fetching pair info from DexScreener');

  try {
    await dexScreenerLimiter.waitForFast();

    const response = await retry(
      async () => {
        const res = await fetch(
          `${API_BASE}/latest/dex/pairs/solana/${pairAddress}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`DexScreener API returned ${res.status}`);
        }

        return res;
      },
      { maxAttempts: 3, initialDelayMs: 1000 }
    );

    const data = (await response.json()) as DexScreenerResponse;

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    return data.pairs[0] ?? null;
  } catch (error) {
    logger.error({ error, pairAddress }, 'Failed to fetch pair info');
    return null;
  }
}

/**
 * Search for tokens by symbol
 * Uses /latest/dex/search endpoint (fast tier)
 * Returns Solana tokens matching the symbol
 */
export async function searchBySymbol(
  symbol: string
): Promise<TokenSearchResult[]> {
  logger.debug({ symbol }, 'Searching tokens by symbol');

  try {
    await dexScreenerLimiter.waitForFast();

    const response = await retry(
      async () => {
        const res = await fetch(
          `${API_BASE}/latest/dex/search?q=${encodeURIComponent(symbol)}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`DexScreener API returned ${res.status}`);
        }

        return res;
      },
      { maxAttempts: 3, initialDelayMs: 1000 }
    );

    const data = (await response.json()) as DexScreenerResponse;

    if (!data.pairs) {
      return [];
    }

    // Filter for Solana pairs and convert to search results
    return data.pairs
      .filter(p => p.chainId === 'solana')
      .map(pairToSearchResult);
  } catch (error) {
    logger.error({ error, symbol }, 'Failed to search by symbol');
    return [];
  }
}

/**
 * Get latest boosted tokens from DexScreener
 * Uses /token-boosts/latest/v1 endpoint (slow tier: 30 req/min conservative)
 * Returns tokens that are being actively promoted
 *
 * Results are cached for 2.5 minutes to reduce API calls
 */
export async function getBoostedTokens(
  limit: number = 50
): Promise<DexScreenerTokenBoost[]> {
  logger.debug({ limit }, 'Fetching boosted tokens from DexScreener');

  try {
    // Use a single cache key for ALL Solana boosts (without limit in key)
    // We'll slice the cached data based on the limit parameter
    const cacheKey = 'boosts:latest:solana';

    const fetcher = async (): Promise<DexScreenerTokenBoost[]> => {
      await dexScreenerLimiter.waitForSlow();

      const response = await retry(
        async () => {
          const res = await fetch(`${API_BASE}/token-boosts/latest/v1`, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          });

          if (!res.ok) {
            throw new Error(`DexScreener boosts API returned ${res.status}`);
          }

          return res;
        },
        { maxAttempts: 3, initialDelayMs: 1000 }
      );

      const data = (await response.json()) as DexScreenerTokenBoost[];

      if (!Array.isArray(data)) {
        logger.debug({ dataType: typeof data }, 'Boosts API returned non-array');
        return [];
      }

      // Filter for Solana tokens only - cache ALL of them
      const solanaBoosts = data.filter(
        (boost) => boost.chainId === 'solana'
      );

      logger.debug(
        { total: data.length, solana: solanaBoosts.length },
        'Filtered boosts by chain'
      );

      return solanaBoosts;
    };

    // Use cache - get full Solana boosts
    const { data, cached } = await boostsCache.getOrFetch(cacheKey, fetcher);

    if (cached) {
      logger.debug({ cached: true, count: data.length }, 'Returning cached boosts');
    }

    // Slice based on limit AFTER fetching from cache
    return data.slice(0, limit);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch boosted tokens');
    return [];
  }
}

/**
 * Get top boosted tokens (most active boosts)
 * Uses /token-boosts/top/v1 endpoint (slow tier: 30 req/min conservative)
 *
 * Results are cached for 2.5 minutes to reduce API calls
 */
export async function getTopBoostedTokens(
  limit: number = 50
): Promise<DexScreenerTokenBoost[]> {
  logger.debug({ limit }, 'Fetching top boosted tokens from DexScreener');

  try {
    // Use a single cache key for ALL Solana boosts (without limit in key)
    const cacheKey = 'boosts:top:solana';

    const fetcher = async (): Promise<DexScreenerTokenBoost[]> => {
      await dexScreenerLimiter.waitForSlow();

      const response = await retry(
        async () => {
          const res = await fetch(`${API_BASE}/token-boosts/top/v1`, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          });

          if (!res.ok) {
            throw new Error(`DexScreener boosts API returned ${res.status}`);
          }

          return res;
        },
        { maxAttempts: 3, initialDelayMs: 1000 }
      );

      const data = (await response.json()) as DexScreenerTokenBoost[];

      if (!Array.isArray(data)) {
        return [];
      }

      // Filter for Solana tokens only - cache ALL of them
      const solanaBoosts = data.filter(
        (boost) => boost.chainId === 'solana'
      );

      return solanaBoosts;
    };

    // Use cache - get full Solana boosts
    const { data, cached } = await boostsCache.getOrFetch(cacheKey, fetcher);

    if (cached) {
      logger.debug({ cached: true, count: data.length }, 'Returning cached top boosts');
    }

    // Slice based on limit AFTER fetching from cache
    return data.slice(0, limit);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch top boosted tokens');
    return [];
  }
}

/**
 * Get trending pairs on Solana
 *
 * Uses a two-step approach:
 * 1. Get boosted tokens (latest promotions) - slow tier
 * 2. Fetch full pair data using batch endpoint - fast tier
 *
 * Batch endpoint /tokens/v1/{chainId}/{addr1,addr2,...} supports up to 30 addresses
 */
export async function getTrendingPairs(
  limit: number = 50
): Promise<TokenSearchResult[]> {
  logger.debug({ limit }, 'Fetching trending Solana pairs via token-boosts');

  try {
    // Step 1: Get boosted tokens (slow tier)
    const boostedTokens = await getBoostedTokens(limit * 2); // Get extra for filtering

    if (boostedTokens.length === 0) {
      logger.debug('No boosted tokens found');
      return [];
    }

    logger.debug({ boostedCount: boostedTokens.length }, 'Fetched boosted tokens');

    // Step 2: Fetch full pair data using BATCH endpoint (fast tier)
    // /tokens/v1/{chainId}/{addr1,addr2,...} - supports up to 30 addresses
    const pairs: DexScreenerPair[] = [];
    const BATCH_SIZE = 30; // DexScreener's max

    for (let i = 0; i < boostedTokens.length; i += BATCH_SIZE) {
      const batch = boostedTokens.slice(i, i + BATCH_SIZE);
      const addresses = batch.map((b) => b.tokenAddress);

      await dexScreenerLimiter.waitForFast();

      try {
        const response = await retry(
          async () => {
            const res = await fetch(
              `${API_BASE}/tokens/v1/solana/${addresses.join(',')}`,
              {
                headers: {
                  'User-Agent': USER_AGENT,
                  'Accept': 'application/json',
                },
              }
            );

            if (!res.ok) {
              throw new Error(`Tokens batch API returned ${res.status}`);
            }

            return res;
          },
          { maxAttempts: 3, initialDelayMs: 1000 }
        );

        const data = (await response.json()) as DexScreenerPair[];

        if (Array.isArray(data)) {
          // Filter to keep only one pair per token address (best liquidity)
          const seenAddresses = new Set<string>();
          for (const pair of data) {
            const addr = pair.baseToken.address;
            if (!seenAddresses.has(addr)) {
              seenAddresses.add(addr);
              pairs.push(pair);
              if (pairs.length >= limit) break;
            }
          }
        }
      } catch (error) {
        logger.debug(
          { batchSize: batch.length, error },
          'Failed to fetch batch token data'
        );
      }

      if (pairs.length >= limit) break;
    }

    logger.debug({ pairsFound: pairs.length }, 'Retrieved pair data for boosted tokens');

    return pairs.map(pairToSearchResult);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch trending pairs');
    return [];
  }
}

/**
 * Get multi-pair info for multiple token addresses (batch lookup)
 * Uses /tokens/v1/{chainId}/{addr1,addr2,...} endpoint (fast tier)
 * Supports up to 30 token addresses per request
 */
export async function getBatchTokenInfo(
  tokenAddresses: string[]
): Promise<TokenSearchResult[]> {
  if (tokenAddresses.length === 0) {
    return [];
  }

  if (tokenAddresses.length > 30) {
    logger.warn(
      { requested: tokenAddresses.length, limit: 30 },
      'Too many addresses, truncating to 30'
    );
    tokenAddresses = tokenAddresses.slice(0, 30);
  }

  logger.debug(
    { count: tokenAddresses.length },
    'Fetching batch token info'
  );

  try {
    await dexScreenerLimiter.waitForFast();

    const response = await retry(
      async () => {
        const res = await fetch(
          `${API_BASE}/tokens/v1/solana/${tokenAddresses.join(',')}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`DexScreener API returned ${res.status}`);
        }

        return res;
      },
      { maxAttempts: 3, initialDelayMs: 1000 }
    );

    const data = (await response.json()) as DexScreenerPair[];

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(pairToSearchResult);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch batch token info');
    return [];
  }
}

/**
 * @deprecated Use getBatchTokenInfo for token addresses
 * This function is kept for backward compatibility
 */
export async function getMultiPairInfo(
  pairAddresses: string[]
): Promise<TokenSearchResult[]> {
  // Note: DexScreener doesn't support batch lookup by pair addresses
  // Only token addresses. This is a limitation of the API.
  // For now, fetch pairs individually
  if (pairAddresses.length === 0) {
    return [];
  }

  const results: TokenSearchResult[] = [];

  for (const pairAddress of pairAddresses.slice(0, 10)) {
    // Limit to 10 for safety
    const pair = await getPairInfo(pairAddress);
    if (pair) {
      results.push(pairToSearchResult(pair));
    }
  }

  return results;
}

// ============================================================================
// HELPERS
// ============================================================================

function pairToTokenInfo(pair: DexScreenerPair): DexScreenerTokenInfo {
  return {
    chainId: pair.chainId,
    tokenAddress: pair.baseToken.address,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    decimals: pair.baseToken.decimals,
    logo: undefined,
    visited: true,
    volumeH1: pair.volume.h1,
    volumeH6: pair.volume.h6,
    volumeH24: pair.volume.h24,
    priceChangeH1: pair.priceChange.h1,
    priceChangeH6: pair.priceChange.h6,
    priceChangeH24: pair.priceChange.h24,
    liquidity: pair.liquidity,
    fdv: pair.fdv,
    pairAddress: pair.pairAddress,
    pairCreatedAt: pair.pairCreatedAt,
  };
}

function pairToSearchResult(pair: DexScreenerPair): TokenSearchResult {
  const now = Date.now();
  const pairAge = pair.pairCreatedAt
    ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) // Hours
    : 0;

  return {
    address: pair.baseToken.address,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    priceUsd: parseFloat(pair.priceUsd) || 0,
    liquidity: pair.liquidity?.usd || 0,
    volumeH24: pair.volume.h24,
    volumeH6: pair.volume.h6,
    volumeH1: pair.volume.h1,
    priceChangeH24: pair.priceChange.h24,
    priceChangeH1: pair.priceChange.h1,
    txnsH24: {
      buys: pair.txns.h24?.buys || 0,
      sells: pair.txns.h24?.sells || 0,
    },
    pairAge,
    opportunityScore: calculateOpportunityScoreFromPair(pair),
  };
}

/**
 * Calculate pair score for ranking opportunities
 * Higher score = better opportunity
 */
export function calculateOpportunityScore(
  result: TokenSearchResult
): number {
  // Use the score if already calculated
  if (result.opportunityScore !== undefined) {
    return result.opportunityScore;
  }

  return calculateOpportunityScoreFromResult(result);
}

function calculateOpportunityScoreFromResult(result: TokenSearchResult): number {
  let score = 0;

  // Volume spike detection (0-35 points)
  if (result.volumeH6 && result.volumeH1) {
    const expectedH1 = result.volumeH6 / 6;
    const volumeRatio = result.volumeH1 / expectedH1;
    score += Math.min(Math.max((volumeRatio - 1) * 15, 0), 35);
  }

  // Early momentum bonus (0-30 points) - reward 2-10% range
  if (result.priceChangeH1 > 0) {
    if (result.priceChangeH1 >= 2 && result.priceChangeH1 <= 10) {
      score += 30;
    } else if (result.priceChangeH1 < 2) {
      score += result.priceChangeH1 * 10;
    } else {
      score += Math.max(30 - (result.priceChangeH1 - 10) * 2, 10);
    }
  }

  // Buy pressure (0-25 points)
  const totalTxns = result.txnsH24.buys + result.txnsH24.sells;
  if (totalTxns > 0) {
    const buyRatio = result.txnsH24.buys / totalTxns;
    score += Math.max((buyRatio - 0.5) * 50, 0);
  }

  // Liquidity score (0-10 points)
  const liq = result.liquidity;
  if (liq >= 15000 && liq <= 100000) {
    score += 10;
  } else if (liq >= 10000 && liq < 15000) {
    score += 5;
  } else if (liq > 100000 && liq <= 500000) {
    score += 5;
  }

  return Math.round(Math.min(score, 100));
}

function calculateOpportunityScoreFromPair(pair: DexScreenerPair): number {
  let score = 0;

  // Volume spike detection (0-35 points) - HIGHER WEIGHT for early movers
  if (pair.volume.h6 > 0 && pair.volume.h1 > 0) {
    const expectedH1 = pair.volume.h6 / 6;
    const volumeRatio = pair.volume.h1 / expectedH1;
    score += Math.min(Math.max((volumeRatio - 1) * 15, 0), 35);
  }

  // Early momentum bonus (0-30 points) - reward 2-10% range
  if (pair.priceChange.h1 > 0) {
    if (pair.priceChange.h1 >= 2 && pair.priceChange.h1 <= 10) {
      score += 30;
    } else if (pair.priceChange.h1 < 2) {
      score += pair.priceChange.h1 * 10;
    } else {
      score += Math.max(30 - (pair.priceChange.h1 - 10) * 2, 10);
    }
  }

  // Buy pressure (0-25 points) - HIGHER WEIGHT
  const totalTxns = (pair.txns.h24?.buys || 0) + (pair.txns.h24?.sells || 0);
  if (totalTxns > 0) {
    const buyRatio = (pair.txns.h24?.buys || 0) / totalTxns;
    score += Math.max((buyRatio - 0.5) * 50, 0);
  }

  // Liquidity score (0-10 points)
  const liq = (pair.liquidity?.usd ?? 0);
  if (liq >= 15000 && liq <= 100000) {
    score += 10;
  } else if (liq >= 10000 && liq < 15000) {
    score += 5;
  } else if (liq > 100000 && liq <= 500000) {
    score += 5;
  }

  return Math.round(Math.min(score, 100));
}
