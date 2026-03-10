/**
 * Test the caching implementation
 */

import { getBoostedTokens, getTopBoostedTokens, quickScan } from '../../src/scanner/dexscreener';
import { boostsCache } from '../../src/utils/cache';

async function testCaching() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Cache Implementation Test                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Clear cache first
  boostsCache.clear();

  console.log('Test 1: First call should fetch from API\n');
  const start1 = Date.now();
  const tokens1 = await getBoostedTokens(10);
  const elapsed1 = Date.now() - start1;
  const stats1 = boostsCache.getStats();

  console.log(`  Result: ${tokens1.length} tokens in ${elapsed1}ms`);
  console.log(`  Cache stats: hits=${stats1.hits}, misses=${stats1.misses}, size=${stats1.size}`);
  console.log(`  Hit rate: ${boostsCache.getHitRate()}%\n`);

  console.log('Test 2: Second call should hit cache\n');
  const start2 = Date.now();
  const tokens2 = await getBoostedTokens(10);
  const elapsed2 = Date.now() - start2;
  const stats2 = boostsCache.getStats();

  console.log(`  Result: ${tokens2.length} tokens in ${elapsed2}ms`);
  console.log(`  Cache stats: hits=${stats2.hits}, misses=${stats2.misses}, size=${stats2.size}`);
  console.log(`  Hit rate: ${boostsCache.getHitRate()}%\n`);

  console.log('Test 3: Third call should also hit cache\n');
  const start3 = Date.now();
  const tokens3 = await getBoostedTokens(10);
  const elapsed3 = Date.now() - start3;
  const stats3 = boostsCache.getStats();

  console.log(`  Result: ${tokens3.length} tokens in ${elapsed3}ms`);
  console.log(`  Cache stats: hits=${stats3.hits}, misses=${stats3.misses}, size=${stats3.size}`);
  console.log(`  Hit rate: ${boostsCache.getHitRate()}%\n`);

  console.log('Test 4: Different limit should still use cache (same data, just sliced)\n');
  const start4 = Date.now();
  const tokens4 = await getBoostedTokens(5);
  const elapsed4 = Date.now() - start4;
  const stats4 = boostsCache.getStats();

  console.log(`  Result: ${tokens4.length} tokens in ${elapsed4}ms`);
  console.log(`  Cache stats: hits=${stats4.hits}, misses=${stats4.misses}, size=${stats4.size}`);
  console.log(`  Hit rate: ${boostsCache.getHitRate()}%\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('Summary:');
  console.log(`  First call: ${elapsed1}ms (API call)`);
  console.log(`  Cached calls: ${Math.min(elapsed2, elapsed3)}ms avg (from cache)`);
  console.log(`  Speedup: ~${Math.round(elapsed1 / Math.min(elapsed2, elapsed3))}x faster from cache`);
  console.log(`  Hit rate: ${boostsCache.getHitRate()}%`);
  console.log('─────────────────────────────────────────────────────────────\n');

  // Verify data consistency
  const sameData =
    tokens1.length === tokens2.length &&
    tokens1.every((t, i) => t.tokenAddress === tokens2[i]?.tokenAddress);

  if (sameData) {
    console.log('✅ Cache returns consistent data');
  } else {
    console.log('❌ Cache data inconsistency detected');
  }

  return {
    firstCallMs: elapsed1,
    cachedAvgMs: (elapsed2 + elapsed3) / 2,
    hitRate: boostsCache.getHitRate(),
    success: sameData,
  };
}

testCaching().catch(console.error);
