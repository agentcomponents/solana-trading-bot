/**
 * DexScreener API Client
 *
 * Fetches token data from DexScreener for finding opportunities.
 * Documentation: https://docs.dexscreener.com/api/v2
 */

import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

// ============================================================================
// CONFIG
// ============================================================================

const BASE_URL = 'https://api.dexscreener.com/latest';
const BOOSTS_BASE_URL = 'https://api.dexscreener.com';
const USER_AGENT = 'SolanaTradingBot/1.0';

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
 */
export async function getTokenInfo(
  tokenAddress: string
): Promise<DexScreenerTokenInfo | null> {
  logger.debug({ tokenAddress }, 'Fetching token info from DexScreener');

  try {
    const response = await retry(
      async () => {
        const res = await fetch(
          `${BASE_URL}/dex/tokens/${tokenAddress}`,
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
      logger.debug({ tokenAddress }, 'No pairs found for token');
      return null;
    }

    // Find the best pair (highest liquidity on Solana)
    const solanaPairs = data.pairs.filter(p => p.chainId === 'solana');

    if (solanaPairs.length === 0) {
      logger.debug({ tokenAddress }, 'No Solana pairs found');
      return null;
    }

    // Sort by liquidity and pick the best one
    const bestPair = solanaPairs.sort((a, b) =>
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
 */
export async function getPairInfo(
  pairAddress: string
): Promise<DexScreenerPair | null> {
  logger.debug({ pairAddress }, 'Fetching pair info from DexScreener');

  try {
    const response = await retry(
      async () => {
        const res = await fetch(
          `${BASE_URL}/dex/pairs/solana/${pairAddress}`,
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
 * Returns Solana tokens matching the symbol
 */
export async function searchBySymbol(
  symbol: string
): Promise<TokenSearchResult[]> {
  logger.debug({ symbol }, 'Searching tokens by symbol');

  try {
    const response = await retry(
      async () => {
        const res = await fetch(
          `${BASE_URL}/dex/search/?q=${encodeURIComponent(symbol)}`,
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
 * Returns tokens that are being actively promoted
 */
export async function getBoostedTokens(
  limit: number = 50
): Promise<DexScreenerTokenBoost[]> {
  logger.debug({ limit }, 'Fetching boosted tokens from DexScreener');

  try {
    const response = await retry(
      async () => {
        const res = await fetch(`${BOOSTS_BASE_URL}/token-boosts/latest/v1`, {
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

    // Filter for Solana tokens only
    const solanaBoosts = data.filter(
      (boost) => boost.chainId === 'solana'
    );

    logger.debug(
      { total: data.length, solana: solanaBoosts.length },
      'Filtered boosts by chain'
    );

    return solanaBoosts.slice(0, limit);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch boosted tokens');
    return [];
  }
}

/**
 * Get top boosted tokens (most active boosts)
 */
export async function getTopBoostedTokens(
  limit: number = 50
): Promise<DexScreenerTokenBoost[]> {
  logger.debug({ limit }, 'Fetching top boosted tokens from DexScreener');

  try {
    const response = await retry(
      async () => {
        const res = await fetch(`${BOOSTS_BASE_URL}/token-boosts/top/v1`, {
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

    // Filter for Solana tokens only
    const solanaBoosts = data.filter(
      (boost) => boost.chainId === 'solana'
    );

    return solanaBoosts.slice(0, limit);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch top boosted tokens');
    return [];
  }
}

/**
 * Get trending pairs on Solana
 *
 * Uses a two-step approach:
 * 1. Get boosted tokens (latest promotions)
 * 2. Fetch full pair data for each token
 */
export async function getTrendingPairs(
  limit: number = 50
): Promise<TokenSearchResult[]> {
  logger.debug({ limit }, 'Fetching trending Solana pairs via token-boosts');

  try {
    // Step 1: Get boosted tokens
    const boostedTokens = await getBoostedTokens(limit * 2); // Get extra for filtering

    if (boostedTokens.length === 0) {
      logger.debug('No boosted tokens found');
      return [];
    }

    logger.debug({ boostedCount: boostedTokens.length }, 'Fetched boosted tokens');

    // Step 2: Fetch full pair data for each token (in batches)
    const pairs: DexScreenerPair[] = [];
    const batchSize = 5;

    for (let i = 0; i < boostedTokens.length && pairs.length < limit; i += batchSize) {
      const batch = boostedTokens.slice(i, i + batchSize);

      const batchPairs = await Promise.all(
        batch.map(async (boost) => {
          try {
            const response = await retry(
              async () => {
                const res = await fetch(
                  `${BOOSTS_BASE_URL}/token-pairs/v1/solana/${boost.tokenAddress}`,
                  {
                    headers: {
                      'User-Agent': USER_AGENT,
                      'Accept': 'application/json',
                    },
                  }
                );

                if (!res.ok) {
                  throw new Error(`Token pairs API returned ${res.status}`);
                }

                return res;
              },
              { maxAttempts: 2, initialDelayMs: 500 }
            );

            const data = (await response.json()) as DexScreenerPair[];

            if (Array.isArray(data) && data.length > 0) {
              // Return the best pair (highest liquidity)
              return data.sort(
                (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
              )[0];
            }

            return null;
          } catch (error) {
            logger.debug(
              { tokenAddress: boost.tokenAddress, error },
              'Failed to fetch token pairs'
            );
            return null;
          }
        })
      );

      // Add non-null pairs
      for (const pair of batchPairs) {
        if (pair && pairs.length < limit) {
          pairs.push(pair);
        }
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < boostedTokens.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    logger.debug({ pairsFound: pairs.length }, 'Retrieved pair data for boosted tokens');

    return pairs.map(pairToSearchResult);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch trending pairs');
    return [];
  }
}

/**
 * Get multi-pair info for multiple pair addresses
 */
export async function getMultiPairInfo(
  pairAddresses: string[]
): Promise<TokenSearchResult[]> {
  if (pairAddresses.length === 0) {
    return [];
  }

  if (pairAddresses.length > 30) {
    // DexScreener limits to 30 addresses per request
    logger.warn(
      { requested: pairAddresses.length, limit: 30 },
      'Too many addresses, truncating to 30'
    );
    pairAddresses = pairAddresses.slice(0, 30);
  }

  logger.debug(
    { count: pairAddresses.length },
    'Fetching multi-pair info'
  );

  try {
    const response = await fetch(
      `${BASE_URL}/dex/pairs/solana/${pairAddresses.join(',')}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`DexScreener API returned ${response.status}`);
    }

    const data = (await response.json()) as DexScreenerResponse;

    if (!data.pairs) {
      return [];
    }

    return data.pairs.map(pairToSearchResult);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch multi-pair info');
    return [];
  }
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

  // Volume score (0-40 points)
  const volumeScore = Math.min(result.volumeH24 / 100000, 40); // Max 40 at $100K volume
  score += volumeScore;

  // Price momentum (0-30 points)
  if (result.priceChangeH1 > 0) {
    score += Math.min(result.priceChangeH1, 30); // Max 30 for +30% in 1h
  }

  // Liquidity score (0-20 points)
  const liquidityScore = Math.min(result.liquidity / 50000, 20); // Max 20 at $50K liquidity
  score += liquidityScore;

  // Buy pressure (0-10 points)
  const totalTxns = result.txnsH24.buys + result.txnsH24.sells;
  if (totalTxns > 0) {
    const buyRatio = result.txnsH24.buys / totalTxns;
    score += buyRatio * 10;
  }

  return Math.round(score);
}

function calculateOpportunityScoreFromPair(pair: DexScreenerPair): number {
  let score = 0;

  // Volume score (0-40 points)
  const volumeScore = Math.min(pair.volume.h24 / 100000, 40);
  score += volumeScore;

  // Price momentum (0-30 points)
  if (pair.priceChange.h1 > 0) {
    score += Math.min(pair.priceChange.h1, 30);
  }

  // Liquidity score (0-20 points)
  const liquidityScore = Math.min((pair.liquidity?.usd ?? 0) / 50000, 20);
  score += liquidityScore;

  // Buy pressure (0-10 points)
  const totalTxns = (pair.txns.h24?.buys || 0) + (pair.txns.h24?.sells || 0);
  if (totalTxns > 0) {
    const buyRatio = (pair.txns.h24?.buys || 0) / totalTxns;
    score += buyRatio * 10;
  }

  return Math.round(score);
}
