/**
 * Test the full discovery flow
 * Simulates what the TradingBot orchestrator does
 */

import { quickScan, formatScanResult, formatScanSummary } from '../../src/scanner/scanner';
import { checkTokenSafetyAggregate } from '../../src/safety/aggregator';

async function testFullDiscovery() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Full Token Discovery Flow Test                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Quick scan (what the bot does initially)
  console.log('Step 1: Running quickScan()...');
  const startTime = Date.now();
  const scannedTokens = await quickScan({
    maxResults: 50,
  });
  const elapsed = Date.now() - startTime;

  console.log(`✓ Found ${scannedTokens.length} tokens in ${elapsed}ms\n`);

  if (scannedTokens.length === 0) {
    console.log('⚠️  No tokens found. Possible reasons:');
    console.log('   - Rate limited (wait 1-2 minutes)');
    console.log('   - No tokens match criteria');
    console.log('   - DexScreener API issues\n');
    return;
  }

  // Step 2: Show top candidates
  console.log('Step 2: Top 5 candidates by opportunity score:\n');
  const top5 = scannedTokens.slice(0, 5);

  for (let i = 0; i < top5.length; i++) {
    console.log(`  #${i + 1}: ${top5[i].symbol} - Score: ${top5[i].opportunityScore}/100`);
    console.log(`      Price: $${top5[i].priceUsd.toFixed(6)} | Liquidity: $${(top5[i].liquidity / 1000).toFixed(1)}K`);
    console.log(`      Volume 24h: $${(top5[i].volumeH24 / 1000).toFixed(1)}K | Change 1h: ${top5[i].priceChangeH1.toFixed(1)}%`);
    console.log(`      Pair Age: ${top5[i].pairAge.toFixed(1)}h\n`);
  }

  // Step 3: Safety check on top 3
  console.log('Step 3: Running safety checks on top 3 candidates...\n');

  for (let i = 0; i < Math.min(3, top5.length); i++) {
    const token = top5[i];
    console.log(`  Checking ${token.symbol}...`);

    const safety = await checkTokenSafetyAggregate(token.address);

    console.log(`    Safe: ${safety.safe ? '✅ YES' : safety.safe === false ? '🚨 NO' : '❓ UNKNOWN'}`);
    console.log(`    Confidence: ${safety.confidence}`);
    if (safety.reasons.length > 0) {
      console.log(`    Reasons: ${safety.reasons.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Discovery flow test PASSED ✓                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}

testFullDiscovery().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
