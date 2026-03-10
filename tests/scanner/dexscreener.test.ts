/**
 * DexScreener API Integration Tests
 *
 * Tests DexScreener API connection and data retrieval
 */

import { describe, it, expect } from 'vitest';
import {
  getTokenInfo,
  searchBySymbol,
  getTrendingPairs,
  calculateOpportunityScore,
} from '../../src/scanner/dexscreener';

describe('DexScreener API Integration Tests', () => {
  it('should get trending Solana pairs', async () => {
    const pairs = await getTrendingPairs(10);

    expect(pairs).toBeDefined();
    expect(Array.isArray(pairs)).toBe(true);

    console.log('✅ Trending Pairs:');
    console.log(`  Fetched: ${pairs.length} pairs`);

    if (pairs.length > 0) {
      console.log('  Sample pairs:');
      for (const pair of pairs.slice(0, 3)) {
        console.log(`    - ${pair.symbol}: $${pair.liquidity.toLocaleString()} liquidity`);
      }
    } else {
      console.log('  ⚠️  No pairs returned (API may be having issues)');
    }
  });

  it('should get token info for USDC', async () => {
    const usdcAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const info = await getTokenInfo(usdcAddress);

    expect(info).toBeDefined();
    // Note: DexScreener may return a pair where USDC is the quote token,
    // so the returned address might differ from input
    expect(info?.chainId).toBe('solana');

    console.log('✅ USDC Token Info:');
    console.log(`  Queried: ${usdcAddress}`);
    console.log(`  Found: ${info?.name} (${info?.symbol})`);
    console.log(`  Address: ${info?.tokenAddress}`);
    console.log(`  Liquidity: $${(info?.liquidity?.usd ?? 0).toLocaleString()}`);
    console.log(`  Volume 24h: $${(info?.volumeH24 ?? 0).toLocaleString()}`);
    console.log(`  Price Change 24h: ${info?.priceChangeH24 ?? 0}%`);
  });

  it('should get token info for RAY', async () => {
    const rayAddress = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
    const info = await getTokenInfo(rayAddress);

    expect(info).toBeDefined();

    console.log('✅ RAY Token Info:');
    console.log(`  Name: ${info?.name}`);
    console.log(`  Symbol: ${info?.symbol}`);
    console.log(`  Liquidity: $${(info?.liquidity?.usd ?? 0).toLocaleString()}`);
    console.log(`  FDV: $${(info?.fdv ?? 0).toLocaleString()}`);
  });

  it('should search by symbol', async () => {
    const results = await searchBySymbol('BONK');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    console.log('✅ Search by Symbol (BONK):');
    console.log(`  Found: ${results.length} pairs`);

    if (results.length > 0) {
      console.log('  Top results:');
      for (const result of results.slice(0, 3)) {
        console.log(`    - ${result.symbol}: $${result.liquidity.toLocaleString()} liquidity`);
      }
    }
  });

  it('should handle invalid token address', async () => {
    const info = await getTokenInfo('InvalidTokenAddress123');

    expect(info).toBeNull();
    console.log('✅ Invalid token returns null');
  });

  it('should calculate opportunity score', async () => {
    // Create a mock result
    const mockResult = {
      address: 'test',
      name: 'Test',
      symbol: 'TEST',
      chainId: 'solana',
      dexId: 'raydium',
      pairAddress: 'test',
      priceUsd: 0.0001,
      liquidity: 50000, // $50K
      volumeH24: 100000, // $100K
      priceChangeH24: 25,
      priceChangeH1: 15,
      txnsH24: { buys: 800, sells: 200 },
      pairAge: 2, // 2 hours
    };

    const score = calculateOpportunityScore(mockResult);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);

    console.log('✅ Opportunity Score Calculation:');
    console.log(`  Score: ${score}/100`);
    console.log(`  Liquidity: $${mockResult.liquidity.toLocaleString()}`);
    console.log(`  Volume: $${mockResult.volumeH24.toLocaleString()}`);
    console.log(`  Price Change 1h: ${mockResult.priceChangeH1}%`);
    console.log(`  Buy Ratio: ${(mockResult.txnsH24.buys / (mockResult.txnsH24.buys + mockResult.txnsH24.sells) * 100).toFixed(0)}%`);
  });

  it('should fetch real trending tokens and analyze', async () => {
    const pairs = await getTrendingPairs(20);

    console.log('✅ Real Market Analysis:');

    if (pairs.length === 0) {
      console.log('  ⚠️  No pairs returned (DexScreener API may be having issues)');
      console.log('  Skipping analysis...');
      return;
    }

    // Analyze the top 5 pairs
    for (let i = 0; i < Math.min(5, pairs.length); i++) {
      const pair = pairs[i];
      if (!pair) continue;

      const score = calculateOpportunityScore(pair);

      const buyRatio = pair.txnsH24.buys + pair.txnsH24.sells > 0
        ? (pair.txnsH24.buys / (pair.txnsH24.buys + pair.txnsH24.sells) * 100).toFixed(0)
        : '0';

      console.log(`\n  ${i + 1}. ${pair.symbol} (${pair.name})`);
      console.log(`     Price: $${pair.priceUsd.toFixed(6)}`);
      console.log(`     Liquidity: $${pair.liquidity.toLocaleString()}`);
      console.log(`     Volume 24h: $${pair.volumeH24.toLocaleString()}`);
      console.log(`     Change 1h: ${pair.priceChangeH1.toFixed(2)}%`);
      console.log(`     Change 24h: ${pair.priceChangeH24.toFixed(2)}%`);
      console.log(`     Buy Ratio: ${buyRatio}%`);
      console.log(`     Pair Age: ${pair.pairAge.toFixed(1)}h`);
      console.log(`     Score: ${score}/100`);
    }
  });
});
