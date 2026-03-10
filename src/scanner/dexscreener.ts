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
const USER_AGENT = 'SolanaTradingBot/1.0';

// ============================================================================
// TYPES
// ============================================================================

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
 * Get trending pairs on Solana
 */
export async function getTrendingPairs(
  limit: number = 50
): Promise<TokenSearchResult[]> {
  logger.debug({ limit }, 'Fetching trending Solana pairs');

  try {
    const response = await fetch(
      `${BASE_URL}/dex/trending/solana`,
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

    return data.pairs
      .slice(0, limit)
      .map(pairToSearchResult);
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
  };
}

/**
 * Calculate pair score for ranking opportunities
 * Higher score = better opportunity
 */
export function calculateOpportunityScore(
  result: TokenSearchResult
): number {
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
