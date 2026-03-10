/**
 * Entry Orchestrator (Simplified)
 *
 * Main entry flow: Scan → Validate → Prepare → Store
 */

import { logger } from '../utils/logger';
import { quickScan } from '../scanner/scanner';
import type { TokenSearchResult } from '../scanner/dexscreener';
import { checkTokenSafetyAggregate } from '../safety/aggregator';
import { validateMultipleEntries } from './validator';
import { prepareEntry, calculatePositionSizeForStage } from './executor';
import type { EntrySignal } from './validator';
import type { EntryValidationOptions } from './validator';
import type { ScanCriteria } from '../scanner/scanner';

// ============================================================================
// TYPES
// ============================================================================

export interface EntryOrchestratorOptions {
  // Scan criteria
  scanCriteria?: ScanCriteria;
  // Entry validation options
  entryValidation?: EntryValidationOptions;
  // Whether this is a dry run (no actual trades)
  dryRun?: boolean;
  // Maximum number of entries to prepare
  maxEntries: number;
  // Current SOL holdings for position sizing
  currentSolHolding: number;
  // Entry options (will be calculated if not provided)
  entryOptions?: {
    inputAmount: string;
    slippageBps: number;
  };
}

export interface OrchestratorResult {
  scanCount: number;
  validatedCount: number;
  entriesAttempted: number;
  entriesSuccessful: number;
  entries: any[];
  signals: EntrySignal[];
  dryRun: boolean;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Run the full entry flow:
 * 1. Scan for opportunities
 * 2. Validate each token
 * 3. Prepare entries (dry run or live)
 */
export async function runEntryFlow(
  options: EntryOrchestratorOptions
): Promise<OrchestratorResult> {
  const dryRun = options.dryRun !== false; // Default to dry run

  logger.info({ dryRun }, 'Starting entry flow');

  const entries: any[] = [];

  // 1. Scan for tokens
  logger.info('Step 1: Scanning for opportunities...');
  const scannedTokens = await quickScan({
    criteria: options.scanCriteria,
    maxResults: 50,
  });

  logger.info({ found: scannedTokens.length }, 'Scan complete');

  if (scannedTokens.length === 0) {
    logger.info('No tokens found, stopping entry flow');
    return {
      scanCount: 0,
      validatedCount: 0,
      entriesAttempted: 0,
      entriesSuccessful: 0,
      entries: [],
      signals: [],
      dryRun,
    };
  }

  // 2. Safety check all tokens
  logger.info(`Step 2: Running safety checks on ${scannedTokens.length} tokens...`);

  const safetyResults = new Map<string, any>();

  for (const token of scannedTokens) {
    const safety = await checkTokenSafetyAggregate(token.address);
    safetyResults.set(token.address, safety);
  }

  // 3. Validate entries
  logger.info('Step 3: Validating entry criteria...');

  // Convert ScanResult to TokenSearchResult (ScanResult has all TokenSearchResult fields)
  const tokensForValidation = scannedTokens as unknown as TokenSearchResult[];

  const signals = await validateMultipleEntries(
    tokensForValidation,
    safetyResults,
    options.entryValidation
  );

  logger.info({ validated: signals.length }, 'Validation complete');

  if (signals.length === 0) {
    logger.info('No tokens passed validation, stopping entry flow');
    return {
      scanCount: scannedTokens.length,
      validatedCount: 0,
      entriesAttempted: 0,
      entriesSuccessful: 0,
      entries: [],
      signals: [],
      dryRun,
    };
  }

  // Log top signals
  logger.info('Top entry signals:');
  for (let i = 0; i < Math.min(3, signals.length); i++) {
    const s = signals[i]!;
    logger.info(
      `  ${i + 1}. ${s.symbol} - Entry Score: ${s.entryScore}/100`
    );
  }

  // 4. Prepare entries (up to maxEntries)
  const entriesToPrepare = signals.slice(0, options.maxEntries);

  logger.info(
    {
      dryRun,
      count: entriesToPrepare.length,
    },
    'Step 4: Preparing entries...'
  );

  for (const signal of entriesToPrepare) {
    // Calculate position size if not provided
    const entryOptions = options.entryOptions ?? calculateEntryOptionsInternal(
      options.currentSolHolding
    );

    const entryResult = await prepareEntry(signal, entryOptions);
    entries.push(entryResult);

    // Stop if we hit a failure
    if (!entryResult.success) {
      logger.warn({ error: entryResult.error }, 'Entry preparation failed, stopping');
      break;
    }

    // Small delay between entries
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const successful = entries.filter(e => e.success).length;

  logger.info(
    {
      scanned: scannedTokens.length,
      validated: signals.length,
      attempted: entriesToPrepare.length,
      successful,
    },
    'Entry flow complete'
  );

  return {
    scanCount: scannedTokens.length,
    validatedCount: signals.length,
    entriesAttempted: entriesToPrepare.length,
    entriesSuccessful: successful,
    entries,
    signals,
    dryRun,
  };
}

/**
 * Calculate entry options based on current holdings
 */
function calculateEntryOptionsInternal(currentSolHolding: number) {
  const { amountLamports } = calculatePositionSizeForStage(currentSolHolding);

  return {
    inputAmount: amountLamports,
    slippageBps: 100, // 1%
  };
}

/**
 * Run a quick entry scan (dry run, no safety check)
 * Useful for seeing what opportunities exist
 */
export async function quickEntryScan(
  scanCriteria?: ScanCriteria
): Promise<EntrySignal[]> {
  logger.info('Running quick entry scan (dry run)...');

  const tokens = await quickScan({
    criteria: scanCriteria,
    maxResults: 20,
  });

  logger.info({ found: tokens.length }, 'Quick scan complete');

  // Create signals without safety check
  const signals = tokens.map(token => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    priceUsd: token.priceUsd,
    liquidity: token.liquidity,
    volume24h: token.volumeH24,
    priceChange1h: token.priceChangeH1,
    priceChangeH24: token.priceChangeH24,
    opportunityScore: token.opportunityScore || 50,
    safetyScore: 50, // Unknown
    entryScore: (token.opportunityScore || 50) * 0.6, // Opportunity only
  }));

  return signals.sort((a, b) => b.entryScore - a.entryScore);
}

/**
 * Format orchestrator result
 */
export function formatOrchestratorResult(result: OrchestratorResult): string {
  const lines = [
    'Entry Flow Results:',
    `  Dry Run: ${result.dryRun ? 'YES' : 'NO'}`,
    `  Scanned: ${result.scanCount} tokens`,
    `  Validated: ${result.validatedCount} tokens`,
    `  Attempted: ${result.entriesAttempted} entries`,
    `  Successful: ${result.entriesSuccessful} entries`,
    '',
  ];

  if (result.signals.length > 0) {
    lines.push('Top Signals:');
    for (let i = 0; i < Math.min(3, result.signals.length); i++) {
      const s = result.signals[i]!;
      lines.push(`  ${i + 1}. ${s.symbol} - Score: ${s.entryScore}/100`);
    }
    lines.push('');
  }

  if (result.entries.length > 0) {
    lines.push('Entry Results:');
    for (const entry of result.entries) {
      if (entry.success) {
        const posId = entry.position?.id ?? 'unknown';
        lines.push(`  ✅ ${entry.data.signal.symbol} - Position: ${posId.substring(0, 8)}...`);
      } else {
        lines.push(`  ❌ ${entry.data.signal.symbol} - ${entry.error}`);
      }
    }
  }

  return lines.join('\n');
}
