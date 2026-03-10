/**
 * RugCheck API Client
 *
 * Token security checks using RugCheck API for Solana.
 * Documentation: https://api.rugcheck.xyz/swagger/index.html
 * Free to use - no API key required.
 */

import { logger } from '../utils/logger';
import { RugCheckReportSchema } from '../types';
import { RateLimiter, Cache, retryWithBackoff } from '../utils/rate-limiter';
import { z } from 'zod';

// ============================================================================
// CONFIG
// ============================================================================

const BASE_URL = 'https://api.rugcheck.xyz';

// Rate limiter: 1 request per second to avoid 429 errors
const rateLimiter = new RateLimiter(1, 2);

// Cache: 5 minute TTL for safety results
const cache = new Cache<RugCheckTokenSecurity | null>(5 * 60 * 1000);

// ============================================================================
// TYPES
// ============================================================================

// Risk level from RugCheck
export type RugCheckRiskLevel = 'info' | 'warn' | 'error' | 'critical';

// Individual risk factor
export interface RugCheckRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: RugCheckRiskLevel;
}

// Token information
export interface RugCheckToken {
  mintAuthority: string | null;
  supply: number;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: string | null;
}

// Token metadata
export interface RugCheckTokenMeta {
  name: string;
  symbol: string;
  uri: string;
  mutable: boolean;
  updateAuthority: string;
}

// Liquidity locker
export interface RugCheckLocker {
  programID: string;
  tokenAccount: string;
  owner: string;
  uri: string;
  unlockDate: number;
  usdcLocked: number;
  type: string;
}

// Full RugCheck API response
export interface RugCheckReportRaw {
  mint: string;
  tokenProgram: string;
  creator: string | null;
  creatorBalance: number;
  token: RugCheckToken | null;
  token_extensions: unknown;
  tokenMeta: RugCheckTokenMeta | null;
  topHolders: unknown[] | null;
  freezeAuthority: string | null;
  mintAuthority: string | null;
  risks: RugCheckRisk[] | null;
  score: number;
  score_normalised: number;
  fileMeta: unknown;
  lockerOwners: Record<string, unknown> | null;
  lockers: Record<string, RugCheckLocker> | null;
  markets: unknown[] | null;
  totalMarketLiquidity: number;
  totalStableLiquidity: number;
  totalLPProviders: number;
  totalHolders: number;
  price: number;
  rugged: boolean;
  tokenType: string;
  transferFee: {
    pct: number;
    maxAmount: number;
    authority: string;
  };
  knownAccounts: unknown[] | null;
  events: unknown[] | null;
  verification: unknown;
  graphInsidersDetected: number;
  insiderNetworks: unknown[] | null;
  detectedAt: string;
  creatorTokens: unknown[] | null;
  launchpad: string | null;
  deployPlatform: string;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Validated RugCheck report (from Zod schema)
 */
export type ValidatedRugCheckReport = z.infer<typeof import('../types').RugCheckReportSchema>;

// Simplified token security interface (matches GoPlus pattern)
export interface RugCheckTokenSecurity {
  token_address: string;
  token_name: string;
  token_symbol: string;
  decimals: number;
  total_supply: string;
  holder_count: number;
  liquidity: number;
  is_mintable: '0' | '1';
  is_freezable: '0' | '1';
  is_metadata_mutable: '0' | '1';
  confidence: string;
  rugcheck_score: number;
  rugcheck_score_normalised: number;
  is_rugged: boolean;
  risks: RugCheckRisk[];
  locked_liquidity_usd: number;
}

export interface TokenSecurityCheck {
  isSafe: boolean;
  confidence: 'high' | 'medium' | 'low';
  risks: string[];
  token: RugCheckTokenSecurity | null;
}

// ============================================================================
// TOKEN SECURITY
// ============================================================================

/**
 * Check token security for a single Solana token
 * Returns the full detailed report
 */
export async function checkTokenSecurity(tokenAddress: string): Promise<RugCheckTokenSecurity | null> {
  logger.debug({ tokenAddress }, 'Checking RugCheck token security');

  // Check cache first
  const cached = cache.get(tokenAddress);
  if (cached !== undefined) {
    logger.debug({ tokenAddress, cached: true }, 'Using cached RugCheck result');
    return cached;
  }

  // Wait for rate limiter
  await rateLimiter.waitForToken();

  try {
    const result = await retryWithBackoff(
      async () => {
        const response = await fetch(`${BASE_URL}/v1/tokens/${tokenAddress}/report`);

        if (response.status === 429) {
          throw new Error('Rate limited (429)');
        }

        if (!response.ok) {
          logger.warn({ status: response.status }, 'RugCheck API returned non-success status');
          return null;
        }

        const rawData = await response.json();

        // SECURITY: Validate API response structure before using
        const validationResult = RugCheckReportSchema.safeParse(rawData);
        if (!validationResult.success) {
          logger.warn(
            { tokenAddress, errors: validationResult.error.flatten() },
            'RugCheck API response validation failed'
          );
          return null;
        }

        return validationResult.data;
      },
      { maxRetries: 3, initialDelayMs: 2000 }
    );

    if (!result) {
      cache.set(tokenAddress, null);
      return null;
    }

    const security = convertToTokenSecurity(result);
    cache.set(tokenAddress, security);
    
    logger.debug(
      { score: result.score, normalizedScore: result.score_normalised, risks: result.risks?.length },
      'RugCheck token security check complete'
    );

    return security;
  } catch (error) {
    logger.error({ error, tokenAddress }, 'RugCheck token security check failed');
    cache.set(tokenAddress, null);
    return null;
  }
}

/**
 * Check token security for multiple tokens (summary only)
 * Note: Bulk endpoint requires API key, so we use parallel single requests
 */
export async function checkMultipleTokensSecurity(
  tokenAddresses: string[]
): Promise<Record<string, RugCheckTokenSecurity>> {
  if (tokenAddresses.length === 0) {
    return {};
  }

  // Maximum 10 concurrent requests
  const chunks: string[][] = [];
  for (let i = 0; i < tokenAddresses.length; i += 10) {
    chunks.push(tokenAddresses.slice(i, i + 10));
  }

  const result: Record<string, RugCheckTokenSecurity> = {};

  for (const chunk of chunks) {
    const promises = chunk.map(async (address) => {
      const data = await checkTokenSecurity(address);
      return { address, data };
    });

    const results = await Promise.all(promises);

    for (const { address, data } of results) {
      if (data) {
        result[address] = data;
      }
    }
  }

  return result;
}

/**
 * Get a quick summary of token security
 */
export async function getTokenSummary(tokenAddress: string): Promise<RugCheckReportRaw | null> {
  try {
    const response = await fetch(`${BASE_URL}/v1/tokens/${tokenAddress}/report/summary`);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RugCheckReportRaw;
  } catch (error) {
    logger.error({ error, tokenAddress }, 'RugCheck summary fetch failed');
    return null;
  }
}

/**
 * Convert raw RugCheck response to simplified format
 */
function convertToTokenSecurity(raw: z.infer<typeof RugCheckReportSchema>): RugCheckTokenSecurity {
  // Calculate locked liquidity from all lockers
  const lockedLiquidity = Object.values(raw.lockers ?? {}).reduce(
    (sum, locker) => sum + (locker.usdcLocked ?? 0),
    0
  );

  // Determine if mintable (has mint authority)
  const isMintable = raw.token?.mintAuthority !== null &&
    raw.token?.mintAuthority !== '11111111111111111111111111111111' ? '1' : '0';

  // Determine if freezable (has freeze authority)
  const isFreezable = raw.token?.freezeAuthority !== null &&
    raw.token?.freezeAuthority !== '11111111111111111111111111111111' ? '1' : '0';

  // Determine if metadata is mutable
  const isMetadataMutable = raw.tokenMeta?.mutable === true ? '1' : '0';

  return {
    token_address: raw.mint,
    token_name: raw.tokenMeta?.name ?? 'Unknown',
    token_symbol: raw.tokenMeta?.symbol ?? '?',
    decimals: raw.token?.decimals ?? 0,
    total_supply: raw.token?.supply?.toString() ?? '0',
    holder_count: raw.totalHolders ?? 0,
    liquidity: raw.totalMarketLiquidity + raw.totalStableLiquidity,
    is_mintable: isMintable,
    is_freezable: isFreezable,
    is_metadata_mutable: isMetadataMutable,
    confidence: calculateConfidence(raw),
    rugcheck_score: raw.score,
    rugcheck_score_normalised: raw.score_normalised,
    is_rugged: raw.rugged,
    risks: raw.risks ?? [],
    locked_liquidity_usd: lockedLiquidity
  };
}

/**
 * Calculate confidence score based on RugCheck data
 */
function calculateConfidence(token: z.infer<typeof RugCheckReportSchema>): string {
  let score = 100;

  // Determine authority risks from token data
  const hasMintAuthority = token.token?.mintAuthority !== null &&
    token.token?.mintAuthority !== '11111111111111111111111111111111';
  const hasFreezeAuthority = token.token?.freezeAuthority !== null &&
    token.token?.freezeAuthority !== '11111111111111111111111111111111';

  // Deduct for risks
  if (hasMintAuthority) score -= 30;
  if (hasFreezeAuthority) score -= 20;
  if (token.tokenMeta?.mutable) score -= 10;

  // Deduct based on RugCheck risk score (0 = best, higher = worse)
  score -= Math.min(token.score * 0.1, 30);

  // Deduct if token was rugged
  if (token.rugged) score -= 50;

  // Boost for positive signs
  if (token.score_normalised < 10) score += 10;
  if (token.totalHolders > 1000) score += 10;
  if (token.totalMarketLiquidity > 50000) score += 10;

  // Boost for locked liquidity
  const lockedLiquidity = Object.values(token.lockers ?? {}).reduce(
    (sum, locker) => sum + (locker.usdcLocked ?? 0),
    0
  );
  if (lockedLiquidity > 10000) score += 10;

  return Math.max(0, Math.min(100, score)).toString();
}

/**
 * Analyze token safety and return a simplified safety check
 */
export async function analyzeTokenSafety(tokenAddress: string): Promise<TokenSecurityCheck> {
  try {
    const token = await checkTokenSecurity(tokenAddress);

    if (!token) {
      return {
        isSafe: false,
        confidence: 'low',
        risks: ['Unable to fetch token security data'],
        token: null
      };
    }

    const risks: string[] = [];

    // Critical risk factors
    if (token.is_mintable === '1') {
      risks.push('MINTABLE: Owner can mint unlimited tokens');
    }

    if (token.is_freezable === '1') {
      risks.push('FREEZABLE: Tokens can be frozen');
    }

    if (token.is_metadata_mutable === '1') {
      risks.push('METADATA_MUTABLE: Token metadata can be changed');
    }

    if (token.is_rugged) {
      risks.push('RUGGED: This token has been flagged as rugged');
    }

    // Low liquidity risk
    if (token.liquidity < 10000) {
      risks.push(`LOW_LIQUIDITY: Only $${token.liquidity.toFixed(2)} liquidity`);
    }

    // Low holder count
    if (token.holder_count < 100) {
      risks.push(`LOW_HOLDERS: Only ${token.holder_count} holders`);
    }

    // Add RugCheck-specific risks
    for (const risk of token.risks) {
      if (risk.level === 'critical' || risk.level === 'error') {
        risks.push(`${risk.level.toUpperCase()}: ${risk.description}`);
      } else if (risk.level === 'warn' && risk.score > 200) {
        risks.push(`WARNING: ${risk.description}`);
      }
    }

    // Determine overall safety
    const criticalRisks = risks.filter(r =>
      r.includes('MINTABLE') ||
      r.includes('FREEZABLE') ||
      r.includes('RUGGED') ||
      r.includes('CRITICAL')
    );

    const isSafe = criticalRisks.length === 0 && !token.is_rugged;

    let confidence: 'high' | 'medium' | 'low';
    const confScore = parseInt(token.confidence, 10);
    if (confScore >= 80) {
      confidence = 'high';
    } else if (confScore >= 50) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      isSafe,
      confidence,
      risks,
      token
    };
  } catch (error) {
    logger.error({ error, tokenAddress }, 'Token safety analysis failed');
    return {
      isSafe: false,
      confidence: 'low',
      risks: ['Security check failed'],
      token: null
    };
  }
}

/**
 * Get security verdict for a token
 */
export async function getSecurityVerdict(tokenAddress: string): Promise<string> {
  const check = await analyzeTokenSafety(tokenAddress);

  if (!check.isSafe) {
    return `UNSAFE: ${check.risks[0] ?? 'Unknown risk'}`;
  }

  if (check.confidence === 'high') {
    return 'SAFE: No security risks detected';
  }

  if (check.confidence === 'medium') {
    return `CAUTION: ${check.risks[0] ?? 'Some risks detected'}`;
  }

  return 'RISKY: Multiple risk factors detected';
}

/**
 * Check if token passes minimum safety requirements
 */
export async function meetsMinimumSafety(tokenAddress: string): Promise<boolean> {
  const check = await analyzeTokenSafety(tokenAddress);

  // Must be safe (no critical risks)
  if (!check.isSafe) {
    return false;
  }

  // Must have at least medium confidence
  if (check.confidence === 'low') {
    return false;
  }

  return true;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format token info for logging
 */
export function formatTokenInfo(token: RugCheckTokenSecurity): string {
  return [
    `${token.token_symbol ?? '?'} (${token.token_address.substring(0, 8)}...)`,
    `Liquidity: $${(token.liquidity ?? 0).toLocaleString()}`,
    `Holders: ${token.holder_count ?? 0}`,
    `Mintable: ${token.is_mintable === '1' ? 'YES' : 'NO'}`,
    `Freezable: ${token.is_freezable === '1' ? 'YES' : 'NO'}`,
    `RugCheck Score: ${token.rugcheck_score}`
  ].join(' | ');
}

/**
 * Get risk summary
 */
export function getRiskSummary(check: TokenSecurityCheck): string {
  if (check.risks.length === 0) {
    return 'No risks detected';
  }
  return check.risks.slice(0, 3).join('; ') + (check.risks.length > 3 ? '...' : '');
}

/**
 * Get liquidity breakdown
 */
export function getLiquidityBreakdown(token: RugCheckTokenSecurity): {
  total: number;
  locked: number;
  lockedPercent: number;
} {
  const total = token.liquidity;
  const locked = token.locked_liquidity_usd;
  const lockedPercent = total > 0 ? (locked / total) * 100 : 0;

  return { total, locked, lockedPercent };
}
