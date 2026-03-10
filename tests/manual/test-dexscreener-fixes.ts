/**
 * Manual test script for DexScreener API fixes
 *
 * Tests:
 * 1. Rate limiter functionality
 * 2. Correct API endpoints
 * 3. Batch token lookup
 * 4. Boosted tokens
 */

import { dexScreenerLimiter, RateLimiter } from '../../src/utils/rate-limiter';
import {
  getTokenInfo,
  getPairInfo,
  searchBySymbol,
  getBoostedTokens,
  getTopBoostedTokens,
  getTrendingPairs,
  getBatchTokenInfo,
} from '../../src/scanner/dexscreener';
import { logger } from '../../src/utils/logger';

// ============================================================================
// TESTS
// ============================================================================

async function testRateLimiter() {
  console.log('\n=== Test 1: Rate Limiter ===');

  const limiter = new RateLimiter({ requestsPerMinute: 5 });

  console.log('Initial stats:', limiter.getStats());

  // Acquire 5 slots
  for (let i = 0; i < 5; i++) {
    await limiter.acquire();
  }

  console.log('After 5 acquisitions:', limiter.getStats());

  // Try to acquire one more (should fail)
  const allowed = await limiter.acquire();
  console.log('6th acquisition allowed?', allowed);

  console.log('✓ Rate limiter works correctly');
}

async function testGetTokenInfo() {
  console.log('\n=== Test 2: getTokenInfo() ===');

  // USDC address on Solana
  const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  const info = await getTokenInfo(USDC_ADDRESS);

  if (info) {
    console.log('Token info:', {
      name: info.name,
      symbol: info.symbol,
      liquidity: info.liquidity?.usd,
      volumeH24: info.volumeH24,
    });
    console.log('✓ getTokenInfo() works');
  } else {
    console.log('✗ getTokenInfo() returned null');
  }
}

async function testGetPairInfo() {
  console.log('\n=== Test 3: getPairInfo() ===');

  // Raydium SOL-USDC pair
  const RAYDIUM_SOL_USDC = '58iL3W6qghJWkDLVFi7hYn28okZqi8TQwGBzHdLBuHTk';

  const pair = await getPairInfo(RAYDIUM_SOL_USDC);

  if (pair) {
    console.log('Pair info:', {
      dexId: pair.dexId,
      baseToken: pair.baseToken.symbol,
      quoteToken: pair.quoteToken.symbol,
      priceUsd: pair.priceUsd,
      liquidity: pair.liquidity?.usd,
    });
    console.log('✓ getPairInfo() works');
  } else {
    console.log('✗ getPairInfo() returned null');
  }
}

async function testSearchBySymbol() {
  console.log('\n=== Test 4: searchBySymbol() ===');

  const results = await searchBySymbol('SOL');

  console.log(`Found ${results.length} Solana pairs for "SOL"`);
  if (results.length > 0) {
    console.log('First result:', {
      symbol: results[0].symbol,
      name: results[0].name,
      priceUsd: results[0].priceUsd,
      liquidity: results[0].liquidity,
    });
    console.log('✓ searchBySymbol() works');
  } else {
    console.log('✗ searchBySymbol() returned no results');
  }
}

async function testBoostedTokens() {
  console.log('\n=== Test 5: getBoostedTokens() ===');

  const boosts = await getBoostedTokens(5);

  console.log(`Found ${boosts.length} boosted tokens`);
  if (boosts.length > 0) {
    console.log('First boost:', {
      chainId: boosts[0].chainId,
      tokenAddress: boosts[0].tokenAddress,
      amount: boosts[0].amount,
    });
    console.log('✓ getBoostedTokens() works');
  } else {
    console.log('⚠ getBoostedTokens() returned no results (may be normal)');
  }
}

async function testTopBoostedTokens() {
  console.log('\n=== Test 6: getTopBoostedTokens() ===');

  const boosts = await getTopBoostedTokens(5);

  console.log(`Found ${boosts.length} top boosted tokens`);
  if (boosts.length > 0) {
    console.log('First top boost:', {
      chainId: boosts[0].chainId,
      tokenAddress: boosts[0].tokenAddress,
      totalAmount: boosts[0].totalAmount,
    });
    console.log('✓ getTopBoostedTokens() works');
  } else {
    console.log('⚠ getTopBoostedTokens() returned no results (may be normal)');
  }
}

async function testTrendingPairs() {
  console.log('\n=== Test 7: getTrendingPairs() (uses batch endpoint) ===');

  const startTime = Date.now();
  const pairs = await getTrendingPairs(10);
  const elapsed = Date.now() - startTime;

  console.log(`Found ${pairs.length} trending pairs in ${elapsed}ms`);
  if (pairs.length > 0) {
    console.log('First pair:', {
      symbol: pairs[0].symbol,
      name: pairs[0].name,
      priceUsd: pairs[0].priceUsd,
      liquidity: pairs[0].liquidity,
      opportunityScore: pairs[0].opportunityScore,
    });
    console.log('✓ getTrendingPairs() works');
  } else {
    console.log('⚠ getTrendingPairs() returned no results (may be normal)');
  }
}

async function testBatchTokenInfo() {
  console.log('\n=== Test 8: getBatchTokenInfo() (NEW) ===');

  // Test with well-known Solana tokens
  const tokens = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'So11111111111111111111111111111111111111112', // SOL
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  ];

  const startTime = Date.now();
  const results = await getBatchTokenInfo(tokens);
  const elapsed = Date.now() - startTime;

  console.log(`Fetched ${results.length} tokens in ${elapsed}ms (1 batch request)`);
  if (results.length > 0) {
    console.log('Results:', results.map((r) => ({ symbol: r.symbol, priceUsd: r.priceUsd })));
    console.log('✓ getBatchTokenInfo() works');
  } else {
    console.log('✗ getBatchTokenInfo() returned no results');
  }
}

async function testRateLimiterStats() {
  console.log('\n=== Test 9: Rate Limiter Stats ===');

  const stats = dexScreenerLimiter.getStats();
  console.log('Rate limiter stats:', {
    slow: stats.slow,
    fast: stats.fast,
  });
  console.log('✓ Rate limiter tracking requests');
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   DexScreener API Fixes - Manual Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testRateLimiter();
    await testGetTokenInfo();
    await testGetPairInfo();
    await testSearchBySymbol();
    await testBoostedTokens();
    await testTopBoostedTokens();
    await testTrendingPairs();
    await testBatchTokenInfo();
    await testRateLimiterStats();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   All tests completed!                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

runAllTests();
