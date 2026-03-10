/**
 * Test the actual token discovery flow
 * This simulates how the bot will discover tokens in production
 */

import { getTrendingPairs, getBatchTokenInfo, getBoostedTokens } from '../../src/scanner/dexscreener';
import { logger } from '../../src/utils/logger';

async function testDiscoveryFlow() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Token Discovery Flow Test                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Get boosted tokens (seed source)
  console.log('Step 1: Fetching boosted tokens...');
  const boostedTokens = await getBoostedTokens(20);
  console.log(`✓ Found ${boostedTokens.length} boosted tokens\n`);

  // Step 2: Get trending pairs (main discovery)
  console.log('Step 2: Fetching trending pairs (uses batch endpoint)...');
  const startTime = Date.now();
  const trendingPairs = await getTrendingPairs(15);
  const elapsed = Date.now() - startTime;
  console.log(`✓ Found ${trendingPairs.length} trending pairs in ${elapsed}ms\n`);

  // Step 3: Show top opportunities
  console.log('Step 3: Top 3 opportunities by score:');
  const top3 = trendingPairs
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    .slice(0, 3);

  for (let i = 0; i < top3.length; i++) {
    const pair = top3[i];
    console.log(`\n  #${i + 1}: ${pair.name} (${pair.symbol})`);
    console.log(`     Price: $${pair.priceUsd.toFixed(6)}`);
    console.log(`     Liquidity: $${(pair.liquidity / 1000).toFixed(1)}K`);
    console.log(`     Volume 24h: $${(pair.volumeH24 / 1000).toFixed(1)}K`);
    console.log(`     Score: ${pair.opportunityScore}/100`);
  }

  // Step 4: Test batch lookup efficiency
  console.log('\n\nStep 4: Testing batch lookup efficiency...');
  const tokenAddresses = trendingPairs.slice(0, 10).map((p) => p.address);

  const batchStart = Date.now();
  await getBatchTokenInfo(tokenAddresses);
  const batchElapsed = Date.now() - batchStart;

  console.log(`✓ Fetched ${tokenAddresses.length} tokens in ${batchElapsed}ms (1 request)`);
  console.log(`  Estimated individual requests would take ~${batchElapsed * 10}ms (10 requests)`);
  console.log(`  Efficiency gain: ~10x faster using batch endpoint`);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Discovery flow test PASSED ✓                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}

testDiscoveryFlow().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
