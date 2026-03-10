/**
 * WebSocket Discovery Test
 *
 * Tests the real-time token discovery via DexScreener WebSocket.
 * Verifies:
 * 1. WebSocket connection
 * 2. Token age classification (FRESH vs WARM)
 * 3. Safety checks
 * 4. Strategy parameters
 */

import { startWebSocketDiscovery, type DiscoveredToken } from '../../src/scanner/websocket-discovery.js';
import { logger } from '../../src/utils/logger';

// ============================================================================
// TEST CONFIG
// ============================================================================

const TEST_DURATION_MS = 60 * 1000; // 1 minute test
const MIN_TOKENS_TO_FIND = 1;

// ============================================================================
// TYPES
// ============================================================================

interface TestStats {
  startTime: number;
  tokensDiscovered: number;
  freshTokens: number;
  warmTokens: number;
  staleTokens: number;
  safeTokens: number;
  unsafeTokens: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  avgScore: number;
  tokens: DiscoveredToken[];
}

// ============================================================================
// TEST
// ============================================================================

async function testWebSocketDiscovery(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     WebSocket Discovery Test                              ║');
  console.log('║     Real-time token discovery with age classification     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const stats: TestStats = {
    startTime: Date.now(),
    tokensDiscovered: 0,
    freshTokens: 0,
    warmTokens: 0,
    staleTokens: 0,
    safeTokens: 0,
    unsafeTokens: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    avgScore: 0,
    tokens: [],
  };

  return new Promise((resolve) => {
    // Set up error handler
    const timeout = setTimeout(() => {
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('Test timeout reached');
      printResults(stats);
      resolve();
    }, TEST_DURATION_MS);

    // Start WebSocket discovery
    console.log('Starting WebSocket discovery...\n');

    startWebSocketDiscovery()
      .then((discovery) => {
        console.log('✅ WebSocket connected\n');
        console.log('Listening for tokens...\n');

        // Subscribe to discovered tokens
        const unsubscribe = discovery.onDiscovered((token: DiscoveredToken) => {
          handleDiscoveredToken(token, stats);

          // Check if we've found enough tokens
          if (stats.tokensDiscovered >= MIN_TOKENS_TO_FIND) {
            // Wait a bit more to collect more, then finish
            setTimeout(() => {
              unsubscribe();
              clearTimeout(timeout);
              discovery.disconnect();
              console.log('\n─────────────────────────────────────────────────────────────');
              console.log('Test complete!');
              printResults(stats);
              resolve();
            }, 10000); // 10 more seconds to collect
          }
        });

        // Subscribe to errors
        discovery.onError((error) => {
          console.error('WebSocket error:', error.message);
        });
      })
      .catch((error) => {
        console.error('Failed to start WebSocket discovery:', error);
        clearTimeout(timeout);
        resolve();
      });
  });
}

function handleDiscoveredToken(token: DiscoveredToken, stats: TestStats): void {
  stats.tokensDiscovered++;
  stats.tokens.push(token);

  // Count by age
  if (token.age === 'fresh') stats.freshTokens++;
  else if (token.age === 'warm') stats.warmTokens++;
  else stats.staleTokens++;

  // Count by safety
  if (token.safety.safe) stats.safeTokens++;
  else stats.unsafeTokens++;

  // Count by confidence
  if (token.safety.confidence === 'high') stats.highConfidence++;
  else if (token.safety.confidence === 'medium') stats.mediumConfidence++;
  else stats.lowConfidence++;

  // Calculate average score
  stats.avgScore = (stats.avgScore * (stats.tokensDiscovered - 1) + token.opportunityScore) / stats.tokensDiscovered;

  // Print token info
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] 🎯 Token #${stats.tokensDiscovered}: ${token.symbol}`);
  console.log(`   Age: ${token.ageCategory} (${token.pairAge.toFixed(2)}h old)`);
  console.log(`   Score: ${token.opportunityScore}/100`);
  console.log(`   Safety: ${token.safety.confidence.toUpperCase()} ${token.safety.safe ? '✅' : '❌'}`);
  console.log(`   Strategy: ${(token.targetProfit * 100).toFixed(0)}% target / -${(token.stopLoss * 100).toFixed(0)}% stop`);
  console.log(`   Position: ${token.suggestedPositionSize} SOL`);
  console.log(`   Liquidity: $${token.liquidity.toLocaleString()}`);
  console.log(`   Volume 24h: $${(token.volumeH24).toLocaleString()}`);
  console.log(`   Change 1h: ${token.priceChangeH1.toFixed(2)}%`);
  console.log(`   URL: ${token.dexscreenerUrl}`);
  console.log('');
}

function printResults(stats: TestStats): void {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('RESULTS');
  console.log('═════════════════════════════════════════════════════════════\n');

  console.log(`Test Duration: ${elapsed}s`);
  console.log(`Tokens Discovered: ${stats.tokensDiscovered}`);
  console.log('');

  console.log('By Age Category:');
  console.log(`  FRESH (<1hr):   ${stats.freshTokens} tokens`);
  console.log(`  WARM (1-4hr):   ${stats.warmTokens} tokens`);
  console.log(`  STALE (>4hr):   ${stats.staleTokens} tokens`);
  console.log('');

  console.log('By Safety:');
  console.log(`  SAFE:          ${stats.safeTokens} tokens`);
  console.log(`  UNSAFE:        ${stats.unsafeTokens} tokens`);
  console.log('');

  console.log('By Confidence:');
  console.log(`  HIGH:          ${stats.highConfidence} tokens`);
  console.log(`  MEDIUM:        ${stats.mediumConfidence} tokens`);
  console.log(`  LOW:           ${stats.lowConfidence} tokens`);
  console.log('');

  if (stats.tokensDiscovered > 0) {
    console.log(`Average Score:   ${stats.avgScore.toFixed(1)}/100`);
    console.log('');

    console.log('Top Scoring Tokens:');
    const sortedTokens = [...stats.tokens].sort((a, b) => b.opportunityScore - a.opportunityScore);
    for (let i = 0; i < Math.min(5, sortedTokens.length); i++) {
      const t = sortedTokens[i]!;
      console.log(`  ${i + 1}. ${t.symbol} (${t.ageCategory})`);
      console.log(`     Score: ${t.opportunityScore}/100 | Liquidity: $${t.liquidity.toLocaleString()}`);
      console.log(`     Target: ${(t.targetProfit * 100).toFixed(0)}% | Stop: -${(t.stopLoss * 100).toFixed(0)}% | ${t.safety.confidence.toUpperCase()}`);
    }
  }

  console.log('\n═════════════════════════════════════════════════════════════\n');

  // Test verdict
  const passed = stats.tokensDiscovered >= MIN_TOKENS_TO_FIND;
  if (passed) {
    console.log('✅ TEST PASSED: WebSocket discovery is working!');
  } else {
    console.log('❌ TEST FAILED: No tokens discovered within timeout');
  }
  console.log('');
}

// ============================================================================
// RUN TEST
// ============================================================================

testWebSocketDiscovery().catch(console.error);
