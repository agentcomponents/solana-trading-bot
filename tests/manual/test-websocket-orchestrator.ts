/**
 * WebSocket Orchestrator Test
 *
 * Tests the continuous real-time entry flow using WebSocket discovery.
 * Runs in monitor mode (no auto-entry) to demonstrate functionality.
 */

import {
  createWebSocketOrchestrator,
  DEFAULT_ORCHESTRATOR_OPTIONS,
  type DiscoveredToken,
  type EntryResult,
} from '../../src/entry/websocket-orchestrator.js';

// ============================================================================
// TEST CONFIG
// ============================================================================

const TEST_DURATION_MS = 60 * 1000; // 1 minute test

const options = {
  ...DEFAULT_ORCHESTRATOR_OPTIONS,
  autoEnter: false, // Monitor mode only - no actual entries
  maxPositions: 3,
  currentSolHolding: 0.1,
  minOpportunityScore: 50,
  minSafetyConfidence: 'medium' as const,
  enabledAges: ['fresh', 'warm'] as const,

  // Callbacks for monitoring
  onTokenDiscovered: (token: DiscoveredToken) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] 🔍 Discovered: ${token.symbol}`);
    console.log(`    Age: ${token.ageCategory} | Score: ${token.opportunityScore}/100`);
    console.log(`    Safety: ${token.safety.confidence.toUpperCase()} | Liquidity: $${token.liquidity.toLocaleString()}`);
    console.log(`    Strategy: ${(token.targetProfit * 100).toFixed(0)}% target / -${(token.stopLoss * 100).toFixed(0)}% stop`);
  },

  onEntryPrepared: (entry: EntryResult) => {
    console.log(`✅ Entry prepared: ${entry.token.symbol}`);
    console.log(`    Position: ${entry.position?.id?.substring(0, 8)}...`);
  },

  onEntryFailed: (token: DiscoveredToken, error: string) => {
    console.log(`❌ Entry failed: ${token.symbol} - ${error}`);
  },
};

// ============================================================================
// TEST
// ============================================================================

let startTime = Date.now();

async function testWebSocketOrchestrator(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     WebSocket Orchestrator Test                            ║');
  console.log('║     Continuous real-time token discovery & entry           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  startTime = Date.now();

  // Create and start orchestrator
  console.log('Starting orchestrator in MONITOR mode (no auto-entry)...\n');
  console.log('Configuration:');
  console.log(`  Auto-Entry: ${options.autoEntry ? 'YES' : 'NO (monitor only)'}`);
  console.log(`  Max Positions: ${options.maxPositions}`);
  console.log(`  Min Opportunity Score: ${options.minOpportunityScore}`);
  console.log(`  Enabled Ages: ${options.enabledAges.join(', ').toUpperCase()}`);
  console.log('');

  const orchestrator = await createWebSocketOrchestrator(options);

  console.log('✅ Orchestrator started\n');
  console.log('Listening for tokens...\n');

  // Run for specified duration
  await new Promise((resolve) => {
    setTimeout(async () => {
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('Test duration reached, stopping orchestrator...');
      await orchestrator.stop();
      resolve();
    }, TEST_DURATION_MS);
  });

  // Get final stats
  const stats = orchestrator.getStats();
  printStats(stats);
}

function printStats(stats: any): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('ORCHESTRATOR STATS');
  console.log('═════════════════════════════════════════════════════════════\n');

  console.log(`Duration: ${elapsed}s`);
  console.log(`Tokens Discovered: ${stats.tokensDiscovered}`);
  console.log(`Tokens Evaluated: ${stats.tokensEvaluated}`);
  console.log(`Entries Prepared: ${stats.entriesPrepared}`);
  console.log(`Entries Successful: ${stats.entriesSuccessful}`);
  console.log(`Entries Failed: ${stats.entriesFailed}`);
  console.log(`Current Positions: ${stats.currentPositions}`);
  console.log('');

  if (stats.byAge) {
    console.log('By Age Category:');
    for (const [age, counts] of Object.entries(stats.byAge)) {
      console.log(`  ${age.toUpperCase()}:`);
      console.log(`    Discovered: ${counts.discovered}`);
      console.log(`    Entered: ${counts.entered}`);
      console.log(`    Failed: ${counts.failed}`);
    }
  }

  console.log('\n═════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// RUN TEST
// ============================================================================

testWebSocketOrchestrator().catch(console.error);
