/**
 * WebSocket Paper Trading Test
 *
 * Runs continuous paper trading using WebSocket discovery.
 * Validates the trading strategy with ZERO risk.
 */

import 'dotenv/config';
import { validateConfig } from '../../src/config';
import { initializeDatabase } from '../../src/db/init';
import { getDbClient } from '../../src/db';
import {
  createWebSocketPaperOrchestrator,
  DEFAULT_PAPER_OPTIONS,
  type DiscoveredToken,
  type PaperEntryWithToken,
  type PaperExitResult,
} from '../../src/paper/websocket-orchestrator';

// Override mode to paper
process.env.TRADING_MODE = 'paper';

// ============================================================================
// TEST CONFIG
// ============================================================================

const TEST_DURATION_MS = 120 * 1000; // 2 minutes (extend for longer testing)

const options = {
  ...DEFAULT_PAPER_OPTIONS,
  initialSol: 0.1,
  entryAmountSol: 0.05,
  defaultSlippageBps: 100,
  minOpportunityScore: 50,
  minSafetyConfidence: 'medium' as const,
  enabledAges: ['fresh', 'warm'] as const,
  maxPositions: 3,
  exitStrategy: {
    fresh: {
      targetProfit: 0.10, // 10%
      stopLoss: 0.20,     // -20%
      maxHoldMinutes: 30, // 30 min (shorter for testing)
    },
    warm: {
      targetProfit: 0.05, // 5%
      stopLoss: 0.25,     // -25%
      maxHoldMinutes: 60, // 1 hour (shorter for testing)
    },
  },

  // Callbacks
  onTokenDiscovered: (token: DiscoveredToken) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] 🔍 ${token.symbol} (${token.ageCategory}) - Score: ${token.opportunityScore}/100`);
  },

  onEntryExecuted: (result: PaperEntryWithToken) => {
    console.log(`\n✅ ENTRY EXECUTED: ${result.token.symbol}`);
    console.log(`   Position: ${result.position?.id?.substring(0, 8)}...`);
    console.log(`   Age: ${result.age.toUpperCase()}`);
    console.log(`   Quoted: ${result.quotedTokens.toFixed(2)} → Actual: ${result.actualTokens.toFixed(2)}`);
    console.log(`   Entry Price: ${result.entryPriceSol.toFixed(8)} SOL/token`);
    console.log(`   Slippage: ${(result.slippageBps / 100).toFixed(2)}%`);
    console.log(`   Target: +${(result.targetProfit * 100).toFixed(0)}% | Stop: -${(result.stopLoss * 100).toFixed(0)}%`);
    console.log(`   Max Hold: ${result.maxHoldMinutes} min`);
  },

  onEntryFailed: (token: DiscoveredToken, error: string) => {
    console.log(`❌ ENTRY FAILED: ${token.symbol} - ${error}`);
  },

  onExitExecuted: (result: PaperExitResult) => {
    const pnlStr = result.pnl >= 0 ? '+' : '';
    console.log(`\n🔄 EXIT EXECUTED: ${result.symbol}`);
    console.log(`   Reason: ${result.exitReason}`);
    console.log(`   P&L: ${pnlStr}${result.pnl.toFixed(6)} SOL (${result.pnlPercent.toFixed(2)}%)`);
    console.log(`   Held: ${result.heldMinutes.toFixed(0)} min`);
    console.log(`   Target was: +${(result.targetProfit * 100).toFixed(0)}% | Stop was: -${(result.stopLoss * 100).toFixed(0)}%`);
  },
};

let startTime = Date.now();
let orchestrator: Awaited<ReturnType<typeof createWebSocketPaperOrchestrator>> | null = null;

// ============================================================================
// TEST
// ============================================================================

async function testWebSocketPaperTrading(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   WEBSOCKET PAPER TRADING TEST                             ║');
  console.log('║   Real-time discovery + simulated trading (ZERO RISK)       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  startTime = Date.now();

  // 1. Initialize
  console.log('1. Initializing paper trading environment...');
  const config = validateConfig();
  console.log(`   Trading Mode: ${config.TRADING_MODE}`);

  const dbClient = getDbClient();
  initializeDatabase(dbClient);
  const db = dbClient.getDb();

  // Clear existing test data
  try {
    db.prepare('DELETE FROM positions WHERE id LIKE "test-%"').run();
    console.log('   Cleared previous test data');
  } catch {
    // Table might not exist, that's ok
  }
  console.log('');

  // 2. Show configuration
  console.log('2. Configuration:');
  console.log(`   Initial SOL: ${options.initialSol} SOL`);
  console.log(`   Entry Amount: ${options.entryAmountSol} SOL`);
  console.log(`   Max Positions: ${options.maxPositions}`);
  console.log(`   Min Opportunity Score: ${options.minOpportunityScore}`);
  console.log(`   Enabled Ages: ${options.enabledAges.join(', ').toUpperCase()}`);
  console.log('');
  console.log('   Exit Strategy:');
  console.log(`     FRESH: Target +${(options.exitStrategy.fresh.targetProfit * 100).toFixed(0)}% | Stop -${(options.exitStrategy.fresh.stopLoss * 100).toFixed(0)}% | Max ${options.exitStrategy.fresh.maxHoldMinutes}min`);
  console.log(`     WARM:  Target +${(options.exitStrategy.warm.targetProfit * 100).toFixed(0)}% | Stop -${(options.exitStrategy.warm.stopLoss * 100).toFixed(0)}% | Max ${options.exitStrategy.warm.maxHoldMinutes}min`);
  console.log('');

  // 3. Add database to options
  const optionsWithDb = { ...options, db };

  // 4. Start orchestrator
  console.log('3. Starting WebSocket Paper Trading Orchestrator...');
  orchestrator = await createWebSocketPaperOrchestrator(optionsWithDb);
  console.log('✅ Orchestrator started');
  console.log('');
  console.log('Listening for tokens and executing paper trades...');
  console.log('');

  // 5. Run for specified duration
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, TEST_DURATION_MS - elapsed);

      if (elapsed % 30000 < 5000) { // Every 30 seconds
        const stats = orchestrator?.getStats();
        if (stats) {
          console.log(`\n[${(elapsed / 1000).toFixed(0)}s] 📊 STATS UPDATE:`);
          console.log(`   Discovered: ${stats.tokensDiscovered}`);
          console.log(`   Entries: ${stats.entriesSuccessful}/${stats.entriesAttempted} attempted`);
          console.log(`   Current Positions: ${stats.currentPositions}`);
          console.log(`   Exits: ${stats.exitsExecuted}`);
          if (stats.exitsExecuted > 0) {
            console.log(`   Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
            console.log(`   Total P&L: ${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(6)} SOL`);
          }
          console.log('');
        }
      }

      if (remaining <= 0) {
        clearInterval(interval);
        resolve(true);
      }
    }, 5000);

    setTimeout(async () => {
      clearInterval(interval);
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('Test duration reached, stopping orchestrator...');
      if (orchestrator) {
        await orchestrator.stop();
      }
      resolve(true);
    }, TEST_DURATION_MS);
  });

  // 6. Print final stats
  if (orchestrator) {
    const stats = orchestrator.getStats();
    printFinalStats(stats);
  }
}

function printFinalStats(stats: any): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const elapsedMin = (parseFloat(elapsed) / 60).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PAPER TRADING RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Duration: ${elapsed}s (${elapsedMin} minutes)`);
  console.log('');
  console.log('Discovery:');
  console.log(`  Tokens Discovered: ${stats.tokensDiscovered}`);
  console.log('');
  console.log('Entries:');
  console.log(`  Attempted: ${stats.entriesAttempted}`);
  console.log(`  Successful: ${stats.entriesSuccessful}`);
  console.log(`  Failed: ${stats.entriesFailed}`);
  console.log('');
  console.log('Exits:');
  console.log(`  Executed: ${stats.exitsExecuted}`);
  console.log(`  Current Positions: ${stats.currentPositions}`);
  console.log('');
  console.log('Performance:');
  if (stats.exitsExecuted > 0) {
    console.log(`  Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  Total P&L: ${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(6)} SOL`);
    console.log(`  Total P&L %: ${stats.totalPnlPercent >= 0 ? '+' : ''}${stats.totalPnlPercent.toFixed(2)}%`);
  } else {
    console.log(`  No exits yet - need more time or lower max hold time`);
  }
  console.log('');
  console.log('By Age Category:');
  if (stats.byAge) {
    for (const [age, counts] of Object.entries(stats.byAge)) {
      if (counts.entries > 0) {
        console.log(`  ${age.toUpperCase()}:`);
        console.log(`    Entries: ${counts.entries}`);
        console.log(`    Wins: ${counts.wins} | Losses: ${counts.losses}`);
        if (counts.wins + counts.losses > 0) {
          const wr = (counts.wins / (counts.wins + counts.losses)) * 100;
          console.log(`    Win Rate: ${wr.toFixed(1)}%`);
        }
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Verdict
  if (stats.entriesSuccessful >= 3) {
    console.log('✅ TEST PASSED: Multiple paper trades executed successfully!');
    console.log('   Strategy is ready for longer validation or live trading.');
  } else if (stats.entriesSuccessful > 0) {
    console.log('⚠️  TEST PARTIAL: Some trades executed, but more data needed.');
    console.log('   Run longer to gather more statistics.');
  } else {
    console.log('⏳ TEST INCONCLUSIVE: No trades executed within time window.');
    console.log('   Try running longer or lowering minOpportunityScore.');
  }
  console.log('');
}

// ============================================================================
// RUN TEST
// ============================================================================

testWebSocketPaperTrading().catch(console.error);
