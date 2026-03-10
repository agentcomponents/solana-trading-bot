/**
 * GoPlus Security API Client
 *
 * Token security checks using GoPlus Security API for Solana.
 * Documentation: https://docs.gopluslabs.io/reference/token-security-api-for-solana-beta
 */

import { logger } from '../utils/logger';

// ============================================================================
// CONFIG
// ============================================================================

const BASE_URL = 'https://api.gopluslabs.io/api/v1';
const API_KEY = process.env['GOPLUS_API_KEY'] ?? '';

// ============================================================================
// TYPES
// ============================================================================

// Raw GoPlus API response types
interface GoPlusAuthorityStatus {
  authority: string[];
  status: '0' | '1'; // '0' = no, '1' = yes
}

interface GoPlusMetadataMutable {
  metadata_upgrade_authority: Array<{
    address: string;
    malicious_address: 0 | 1;
  }>;
  status: '0' | '1';
}

interface GoPlusMetadata {
  name: string;
  symbol: string;
  description: string;
  uri: string;
}

interface GoPlusDexInfo {
  id: string;
  dex_name: string;
  price: string;
  tvl: string;
  lp_amount: string | null;
  fee_rate: string;
  burn_percent: number;
  type: 'Standard' | 'Concentrated';
  day?: {
    volume: string;
    price_max: string;
    price_min: string;
  };
  week?: {
    volume: string;
    price_max: string;
    price_min: string;
  };
  month?: {
    volume: string;
    price_max: string;
    price_min: string;
  };
}

export interface GoPlusTokenSecurityRaw {
  // Basic info
  metadata: GoPlusMetadata;
  holder_count: string;
  total_supply: string;
  transfer_fee: Record<string, unknown>;

  // Security flags
  mintable: GoPlusAuthorityStatus;
  freezable: GoPlusAuthorityStatus;
  metadata_mutable: GoPlusMetadataMutable;

  // Other flags
  balance_mutable_authority: GoPlusAuthorityStatus;
  closable: GoPlusAuthorityStatus;
  default_account_state: GoPlusAuthorityStatus;
  default_account_state_upgradable: GoPlusAuthorityStatus;
  non_transferable: GoPlusAuthorityStatus;
  transfer_fee_upgradable: GoPlusAuthorityStatus;
  transfer_hook: GoPlusAuthorityStatus;
  transfer_hook_upgradable: GoPlusAuthorityStatus;

  // DEX data
  dex: GoPlusDexInfo[];

  // Trust status
  trusted_token?: {
    status: '0' | '1';
  };

  // Other fields
  creators: unknown[];
  holders?: unknown[];
  lp_holders?: unknown[];
}

export interface GoPlusTokenSecurityResponse {
  code: number;
  message: string;
  result: Record<string, GoPlusTokenSecurityRaw>;
}

// Simplified token security interface
export interface GoPlusTokenSecurity {
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
  is_trusted: '0' | '1';
  confidence: string;
}

export interface TokenSecurityCheck {
  isSafe: boolean;
  confidence: 'high' | 'medium' | 'low';
  risks: string[];
  token: GoPlusTokenSecurity | null;
}

// ============================================================================
// ACCESS TOKEN
// ============================================================================

/**
 * Get GoPlus access token
 * The API key is used as the access token directly
 */
function getAccessToken(): string {
  if (!API_KEY) {
    throw new Error('GOPLUS_API_KEY not configured');
  }
  return API_KEY;
}

// ============================================================================
// TOKEN SECURITY
// ============================================================================

/**
 * Check token security for multiple Solana tokens
 */
export async function checkTokenSecurity(
  tokenAddresses: string | string[]
): Promise<Record<string, GoPlusTokenSecurity>> {
  const addresses = Array.isArray(tokenAddresses) ? tokenAddresses : [tokenAddresses];

  if (addresses.length === 0) {
    return {};
  }

  if (addresses.length > 20) {
    throw new Error('Maximum 20 token addresses per request');
  }

  logger.debug({ tokenAddresses: addresses }, 'Checking GoPlus token security');

  try {
    const accessToken = getAccessToken();
    const params = new URLSearchParams({
      contract_addresses: addresses.join(','),
      access_token: accessToken
    });

    const response = await fetch(`${BASE_URL}/solana/token_security?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`GoPlus API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GoPlusTokenSecurityResponse;

    if (data.code !== 1) {
      logger.warn({ code: data.code, message: data.message }, 'GoPlus API returned non-success code');
      // Still return result if available
      return convertToTokenSecurity(data.result ?? {});
    }

    logger.debug(
      { checked: addresses.length, results: Object.keys(data.result ?? {}).length },
      'GoPlus token security check complete'
    );

    return convertToTokenSecurity(data.result ?? {});
  } catch (error) {
    logger.error({ error }, 'GoPlus token security check failed');
    throw error;
  }
}

/**
 * Convert raw GoPlus response to simplified format
 */
function convertToTokenSecurity(
  raw: Record<string, GoPlusTokenSecurityRaw>
): Record<string, GoPlusTokenSecurity> {
  const result: Record<string, GoPlusTokenSecurity> = {};

  for (const [address, token] of Object.entries(raw)) {
    // Calculate total liquidity from all DEX listings
    const liquidity = token.dex.reduce((sum, dex) => {
      const tvl = parseFloat(dex.tvl ?? '0');
      return sum + tvl;
    }, 0);

    result[address] = {
      token_address: address,
      token_name: token.metadata?.name ?? 'Unknown',
      token_symbol: token.metadata?.symbol ?? '?',
      decimals: 0, // Not provided by GoPlus, need to get from mint
      total_supply: token.total_supply ?? '0',
      holder_count: parseInt(token.holder_count ?? '0', 10),
      liquidity,
      is_mintable: token.mintable?.status ?? '0',
      is_freezable: token.freezable?.status ?? '0',
      is_metadata_mutable: token.metadata_mutable?.status ?? '0',
      is_trusted: token.trusted_token?.status ?? '0',
      confidence: calculateConfidence(token)
    };
  }

  return result;
}

/**
 * Calculate confidence score based on token data
 */
function calculateConfidence(token: GoPlusTokenSecurityRaw): string {
  let score = 100;

  // Deduct for risks
  if (token.mintable?.status === '1') score -= 30;
  if (token.freezable?.status === '1') score -= 20;
  if (token.metadata_mutable?.status === '1') score -= 10;
  if (token.metadata_mutable?.metadata_upgrade_authority?.some(a => a.malicious_address === 1)) {
    score -= 50;
  }

  // Boost for positive signs
  if (token.trusted_token?.status === '1') score += 20;
  if (token.holder_count && parseInt(token.holder_count, 10) > 10000) score += 10;

  // Calculate total liquidity
  const liquidity = token.dex.reduce((sum, dex) => sum + parseFloat(dex.tvl ?? '0'), 0);
  if (liquidity > 100000) score += 10;

  return Math.max(0, Math.min(100, score)).toString();
}

/**
 * Check token security for a single token
 */
export async function checkSingleTokenSecurity(
  tokenAddress: string
): Promise<GoPlusTokenSecurity | null> {
  const results = await checkTokenSecurity(tokenAddress);
  return results[tokenAddress] ?? null;
}

/**
 * Analyze token safety and return a simplified safety check
 */
export async function analyzeTokenSafety(tokenAddress: string): Promise<TokenSecurityCheck> {
  try {
    const token = await checkSingleTokenSecurity(tokenAddress);

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

    // Low liquidity risk
    if (token.liquidity < 10000) {
      risks.push(`LOW_LIQUIDITY: Only $${token.liquidity.toFixed(2)} liquidity`);
    }

    // Low holder count
    if (token.holder_count < 100) {
      risks.push(`LOW_HOLDERS: Only ${token.holder_count} holders`);
    }

    // Determine overall safety
    const criticalRisks = risks.filter(r =>
      r.includes('MINTABLE') ||
      r.includes('FREEZABLE')
    );

    const isSafe = criticalRisks.length === 0;

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
export function formatTokenInfo(token: GoPlusTokenSecurity): string {
  return [
    `${token.token_symbol ?? '?'} (${token.token_address.substring(0, 8)}...)`,
    `Liquidity: $${(token.liquidity ?? 0).toLocaleString()}`,
    `Holders: ${token.holder_count ?? 0}`,
    `Mintable: ${token.is_mintable === '1' ? 'YES' : 'NO'}`,
    `Freezable: ${token.is_freezable === '1' ? 'YES' : 'NO'}`
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
