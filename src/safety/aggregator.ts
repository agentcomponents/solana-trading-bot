/**
 * Safety Aggregator
 *
 * Combines RugCheck and GoPlus security APIs into unified safety decisions.
 * Applies minimum trading thresholds for the bot.
 */

import type {
  RugCheckTokenSecurity
} from './rugcheck';
import type {
  GoPlusTokenSecurity
} from './goplus';
import { logger } from '../utils/logger';

// ============================================================================
// CONFIG
// ============================================================================

// Minimum safety thresholds (from design docs)
export const MINIMUM_LIQUIDITY_USD = 15000;
export const MAX_TOP_HOLDER_PCT = 50; // Alert if top holder owns > 50%
export const MAX_RUGCHECK_NORMALIZED_SCORE = 30; // Lower is better
export const MIN_HOLDERS = 100;

// ============================================================================
// TYPES
// ============================================================================

export interface SafetyThresholds {
  minLiquidityUsd: number;
  maxTopHolderPct: number;
  maxRugcheckNormalizedScore: number;
  minHolders: number;
}

export interface AggregateSafetyResult {
  safe: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  data: {
    rugcheck: RugCheckTokenSecurity | null;
    goplus: GoPlusTokenSecurity | null;
    liquidityCheck: {
      passed: boolean;
      liquidity: number;
      minimum: number;
    };
    holderCheck: {
      passed: boolean;
      topHolderPct: number;
      maximum: number;
    };
    authorityCheck: {
      passed: boolean;
      isMintable: boolean;
      isFreezable: boolean;
      isMetadataMutable: boolean;
    };
  };
}

// ============================================================================
// AGGREGATOR
// ============================================================================

/**
 * Default safety thresholds
 */
export const DEFAULT_THRESHOLDS: SafetyThresholds = {
  minLiquidityUsd: MINIMUM_LIQUIDITY_USD,
  maxTopHolderPct: MAX_TOP_HOLDER_PCT,
  maxRugcheckNormalizedScore: MAX_RUGCHECK_NORMALIZED_SCORE,
  minHolders: MIN_HOLDERS,
};

/**
 * Check if a token meets minimum safety requirements
 * Aggregates results from both RugCheck and GoPlus APIs
 */
export async function checkTokenSafetyAggregate(
  tokenAddress: string,
  thresholds: SafetyThresholds = DEFAULT_THRESHOLDS
): Promise<AggregateSafetyResult> {
  logger.debug({ tokenAddress }, 'Checking aggregate token safety');

  const reasons: string[] = [];
  let safe = true;
  let confidence: 'high' | 'medium' | 'low' = 'high';

  // Import dynamically to avoid circular dependencies
  const { checkTokenSecurity: rugcheckCheck } = await import('./rugcheck');
  const { checkTokenSecurity: goplusCheck } = await import('./goplus');

  // Run both checks in parallel
  const [rugcheckData, goplusRecord] = await Promise.all([
    rugcheckCheck(tokenAddress).catch(err => {
      logger.warn({ error: err.message }, 'RugCheck check failed');
      return null;
    }),
    goplusCheck(tokenAddress).catch(err => {
      logger.warn({ error: err.message }, 'GoPlus check failed');
      return null;
    }),
  ]);

  // Extract single GoPlus result from Record
  const goplusData = goplusRecord?.[tokenAddress] ?? null;

  // If both APIs failed, we can't make a decision
  if (!rugcheckData && !goplusData) {
    return {
      safe: false,
      confidence: 'low',
      reasons: ['Unable to fetch security data from any provider'],
      data: {
        rugcheck: null,
        goplus: null,
        liquidityCheck: {
          passed: false,
          liquidity: 0,
          minimum: thresholds.minLiquidityUsd,
        },
        holderCheck: {
          passed: false,
          topHolderPct: 0,
          maximum: thresholds.maxTopHolderPct,
        },
        authorityCheck: {
          passed: false,
          isMintable: false,
          isFreezable: false,
          isMetadataMutable: false,
        },
      },
    };
  }

  // Prefer RugCheck data for liquidity and holder checks
  const primaryData = rugcheckData ?? goplusData;

  if (!primaryData) {
    // Should never happen due to earlier check, but TypeScript needs it
    throw new Error('No primary data available');
  }

  // 1. Liquidity Check
  const liquidity = typeof primaryData.liquidity === 'number' ? primaryData.liquidity : 0;
  const liquidityPassed = liquidity >= thresholds.minLiquidityUsd;

  if (!liquidityPassed) {
    safe = false;
    reasons.push(
      `Insufficient liquidity: $${liquidity.toLocaleString()} < $${thresholds.minLiquidityUsd.toLocaleString()}`
    );
  }

  // 2. Holder Count Check
  const holders = typeof primaryData.holder_count === 'number' ? primaryData.holder_count : 0;
  if (holders < thresholds.minHolders) {
    confidence = 'low';
    reasons.push(`Low holder count: ${holders} < ${thresholds.minHolders}`);
  }

  // 3. Authority Check (critical)
  let isMintable = false;
  let isFreezable = false;
  let isMetadataMutable = false;

  if (rugcheckData) {
    isMintable = rugcheckData.is_mintable === '1';
    isFreezable = rugcheckData.is_freezable === '1';
    isMetadataMutable = rugcheckData.is_metadata_mutable === '1';
  } else if (goplusData) {
    isMintable = goplusData['is_mintable'] === '1';
    isFreezable = goplusData['is_freezable'] === '1';
    isMetadataMutable = goplusData['is_metadata_mutable'] === '1';
  }

  const authorityPassed = !isMintable && !isFreezable;

  if (isMintable) {
    safe = false;
    reasons.push('Token is mintable - owner can create unlimited tokens');
  }

  if (isFreezable) {
    safe = false;
    reasons.push('Token is freezable - accounts can be frozen');
  }

  if (isMetadataMutable) {
    confidence = confidence === 'high' ? 'medium' : confidence;
    reasons.push('Token metadata is mutable - name/symbol can be changed');
  }

  // 4. RugCheck Score Check
  let topHolderPct = 0;
  if (rugcheckData) {
    const score = rugcheckData.rugcheck_score_normalised;
    if (score > thresholds.maxRugcheckNormalizedScore) {
      confidence = 'low';
      reasons.push(`High RugCheck score: ${score} (threshold: ${thresholds.maxRugcheckNormalizedScore})`);
    }

    // Check if token was rugged
    if (rugcheckData.is_rugged) {
      safe = false;
      reasons.push('Token has been flagged as rugged');
    }
  }

  // 5. Holder Concentration Check (if RugCheck data available)
  let holderPassed = true;
  if (rugcheckData && rugcheckData.risks) {
    // Look for holder concentration risk in RugCheck risks
    for (const risk of rugcheckData.risks) {
      if (risk.name.toLowerCase().includes('concentration') ||
          risk.name.toLowerCase().includes('holder') ||
          risk.name.toLowerCase().includes('centralized')) {
        topHolderPct = parseInt(risk.value) || 0;
        if (topHolderPct > thresholds.maxTopHolderPct) {
          holderPassed = false;
          confidence = 'low';
          reasons.push(
            `High holder concentration: Top wallet owns ${topHolderPct}% > ${thresholds.maxTopHolderPct}%`
          );
        }
      }
    }
  }

  // 6. Cross-validate both APIs
  if (rugcheckData && goplusData) {
    // Check for discrepancies
    const rugcheckMintable = rugcheckData.is_mintable === '1';
    const goplusMintable = goplusData['is_mintable'] === '1';

    if (rugcheckMintable !== goplusMintable) {
      reasons.push('Security API disagreement on mint authority');
      confidence = 'low';
    }
  }

  // Build result
  const result: AggregateSafetyResult = {
    safe,
    confidence,
    reasons,
    data: {
      rugcheck: rugcheckData,
      goplus: goplusData,
      liquidityCheck: {
        passed: liquidityPassed,
        liquidity,
        minimum: thresholds.minLiquidityUsd,
      },
      holderCheck: {
        passed: holderPassed,
        topHolderPct,
        maximum: thresholds.maxTopHolderPct,
      },
      authorityCheck: {
        passed: authorityPassed,
        isMintable,
        isFreezable,
        isMetadataMutable,
      },
    },
  };

  logger.debug(
    {
      tokenAddress,
      safe,
      confidence,
      reasonsCount: reasons.length,
    },
    'Aggregate safety check complete'
  );

  return result;
}

/**
 * Quick safety check - returns boolean only
 */
export async function isTokenSafe(
  tokenAddress: string,
  thresholds?: SafetyThresholds
): Promise<boolean> {
  const result = await checkTokenSafetyAggregate(tokenAddress, thresholds);
  return result.safe;
}

/**
 * Get human-readable safety verdict
 */
export async function getSafetyVerdict(
  tokenAddress: string,
  thresholds?: SafetyThresholds
): Promise<string> {
  const result = await checkTokenSafetyAggregate(tokenAddress, thresholds);

  if (!result.safe) {
    return `UNSAFE: ${result.reasons[0] ?? 'Unknown risk'}`;
  }

  if (result.confidence === 'high') {
    return 'SAFE: All security checks passed';
  }

  if (result.confidence === 'medium') {
    return `CAUTION: ${result.reasons[0] ?? 'Minor risk factors present'}`;
  }

  return 'RISKY: Multiple risk factors detected';
}

/**
 * Batch check multiple tokens
 * Returns a map of token address to safety result
 */
export async function checkMultipleTokensSafe(
  tokenAddresses: string[],
  thresholds?: SafetyThresholds
): Promise<Record<string, AggregateSafetyResult>> {
  const results: Record<string, AggregateSafetyResult> = {};

  // Process in chunks of 5 to avoid overwhelming APIs
  const chunkSize = 5;
  for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
    const chunk = tokenAddresses.slice(i, i + chunkSize);

    const promises = chunk.map(async (address) => {
      const result = await checkTokenSafetyAggregate(address, thresholds);
      return { address, result };
    });

    const chunkResults = await Promise.all(promises);

    for (const { address, result } of chunkResults) {
      results[address] = result;
    }

    // Small delay between chunks to be nice to APIs
    if (i + chunkSize < tokenAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Filter tokens by safety
 * Returns only tokens that pass safety checks
 */
export async function filterSafeTokens(
  tokenAddresses: string[],
  thresholds?: SafetyThresholds
): Promise<string[]> {
  const results = await checkMultipleTokensSafe(tokenAddresses, thresholds);

  return Object.entries(results)
    .filter(([_, result]) => result.safe)
    .map(([address]) => address);
}

/**
 * Format safety result for logging/display
 */
export function formatSafetyResult(result: AggregateSafetyResult): string {
  const lines = [
    `Safety: ${result.safe ? '✅ SAFE' : '🚨 UNSAFE'}`,
    `Confidence: ${result.confidence.toUpperCase()}`,
    '',
  ];

  if (result.reasons.length > 0) {
    lines.push('Reasons:');
    for (const reason of result.reasons) {
      lines.push(`  - ${reason}`);
    }
    lines.push('');
  }

  lines.push('Checks:');
  lines.push(
    `  Liquidity: ${result.data.liquidityCheck.passed ? '✅' : '❌'} $${result.data.liquidityCheck.liquidity.toLocaleString()}`
  );
  lines.push(
    `  Holder Concentration: ${result.data.holderCheck.passed ? '✅' : '❌'} ${result.data.holderCheck.topHolderPct}%`
  );
  lines.push('  Authority:');
  lines.push(`    Mintable: ${result.data.authorityCheck.isMintable ? '❌ YES' : '✅ NO'}`);
  lines.push(`    Freezable: ${result.data.authorityCheck.isFreezable ? '❌ YES' : '✅ NO'}`);
  lines.push(`    Mutable Metadata: ${result.data.authorityCheck.isMetadataMutable ? '⚠️ YES' : '✅ NO'}`);

  return lines.join('\n');
}
