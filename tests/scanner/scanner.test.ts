/**
 * Scanner Module Tests
 *
 * Tests the token scanner functionality
 */

import { describe, it, expect } from 'vitest';
import {
  scanTrendingTokens,
  scanBySymbol,
  quickScan,
  DEFAULT_SCAN_CRITERIA,
  formatScanResult,
  formatScanSummary,
} from '../../src/scanner/scanner';

describe('Scanner Module', () => {
  describe('quickScan', () => {
    it('should scan trending tokens without safety check', async () => {
      const results = await quickScan({
        criteria: {
          minLiquidityUsd: 10000,
          minVolume24h: 1000,
          minPriceChange1h: 0, // No minimum for testing
        },
        maxResults: 10,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      console.log('✅ Quick Scan Results:');
      console.log(`  Found: ${results.length} tokens`);

      if (results.length > 0) {
        console.log('\n  Top 3 Results:');
        for (const result of results.slice(0, 3)) {
          console.log(`\n    ${result.symbol} (${result.name})`);
          console.log(`      Score: ${result.opportunityScore}/100`);
          console.log(`      Liquidity: $${result.liquidity.toLocaleString()}`);
          console.log(`      Change 1h: ${result.priceChangeH1.toFixed(2)}%`);
          console.log(`      Safety: ${result.safety.confidence}`);
        }
      }
    });

    it('should respect custom scan criteria', async () => {
      const results = await quickScan({
        criteria: {
          minLiquidityUsd: 100000, // Higher threshold
          minVolume24h: 50000,
          minPriceChange1h: 10, // At least 10% pump
        },
        maxResults: 5,
      });

      console.log('✅ Custom Criteria Scan:');
      console.log(`  Min Liquidity: $100,000`);
      console.log(`  Min Volume: $50,000`);
      console.log(`  Min Price Change 1h: 10%`);
      console.log(`  Results: ${results.length} tokens`);

      // Verify all results meet criteria
      for (const result of results) {
        expect(result.liquidity).toBeGreaterThanOrEqual(100000);
        expect(result.volumeH24).toBeGreaterThanOrEqual(50000);
        expect(result.priceChangeH1).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('scanTrendingTokens with safety check', () => {
    it('should scan and check safety for trending tokens', async () => {
      // Use lenient criteria to get more results
      const results = await scanTrendingTokens({
        criteria: {
          minLiquidityUsd: 10000,
          minVolume24h: 1000,
          minPriceChange1h: 0,
          maxPairAgeHours: 48, // 48 hours for more candidates
        },
        maxResults: 5,
        requireSafetyCheck: true,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      console.log('✅ Safety Scan Results:');
      console.log(`  Found: ${results.length} safe tokens`);

      if (results.length > 0) {
        console.log('\n  Safe Tokens:');
        for (const result of results) {
          console.log(`\n    ${result.symbol} - Score: ${result.opportunityScore}`);
          console.log(`      Liquidity: $${result.liquidity.toLocaleString()}`);
          console.log(`      Safety: ${result.safety.confidence}`);
        }
      }
    }, 60000); // 60 second timeout for API calls
  });

  describe('scanBySymbol', () => {
    it('should search for tokens by symbol', async () => {
      const results = await scanBySymbol('BONK', {
        criteria: {
          minLiquidityUsd: 50000,
        },
        maxResults: 3,
        requireSafetyCheck: false,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      console.log('✅ Symbol Search (BONK):');
      console.log(`  Results: ${results.length}`);

      if (results.length > 0) {
        for (const result of results) {
          console.log(`    - ${result.symbol}: $${result.liquidity.toLocaleString()} liquidity`);
        }
      }
    });
  });

  describe('formatting functions', () => {
    it('should format scan result', async () => {
      const results = await quickScan({ maxResults: 1 });

      if (results.length > 0) {
        const result = results[0];
        if (!result) return;

        const formatted = formatScanResult(result);

        expect(formatted).toContain('Address:');
        expect(formatted).toContain('Price:');
        expect(formatted).toContain('Liquidity:');
        expect(formatted).toContain('Score:');

        console.log('✅ Formatted Result:');
        console.log(formatted);
      }
    });

    it('should format scan summary', async () => {
      const results = await quickScan({ maxResults: 10 });

      const summary = formatScanSummary(results);

      expect(summary).toContain('Scan Summary:');
      expect(summary).toContain('Total:');

      console.log('✅ Scan Summary:');
      console.log(summary);
    });
  });

  describe('DEFAULT_SCAN_CRITERIA', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SCAN_CRITERIA.minLiquidityUsd).toBe(15000);
      expect(DEFAULT_SCAN_CRITERIA.maxLiquidityUsd).toBe(5000000);
      expect(DEFAULT_SCAN_CRITERIA.minVolume24h).toBe(5000);
      expect(DEFAULT_SCAN_CRITERIA.minPriceChange1h).toBe(5);
      expect(DEFAULT_SCAN_CRITERIA.maxPairAgeHours).toBe(24);
      expect(DEFAULT_SCAN_CRITERIA.minPairAgeHours).toBe(0.5);

      console.log('✅ Default Scan Criteria:');
      console.log(`  Min Liquidity: $${DEFAULT_SCAN_CRITERIA.minLiquidityUsd?.toLocaleString()}`);
      console.log(`  Max Pair Age: ${DEFAULT_SCAN_CRITERIA.maxPairAgeHours}h`);
      console.log(`  Min Price Change 1h: ${DEFAULT_SCAN_CRITERIA.minPriceChange1h}%`);
    });
  });

  describe('Real-world scanning', () => {
    it('should find actual opportunities with analysis', async () => {
      console.log('\n✅ Real Market Scan:');
      console.log('  Scanning for pumping tokens on Solana...\n');

      const results = await quickScan({
        criteria: {
          minLiquidityUsd: 15000,
          maxLiquidityUsd: 200000,
          minVolume24h: 5000,
          minPriceChange1h: 5, // At least 5% pump
          maxPairAgeHours: 24, // Fresh tokens
          minPairAgeHours: 1, // At least 1 hour old
        },
        maxResults: 10,
      });

      console.log(`  Scan complete: ${results.length} candidates found\n`);

      if (results.length > 0) {
        console.log('  Top Opportunities:');
        console.log('  ' + '='.repeat(60));

        for (let i = 0; i < Math.min(5, results.length); i++) {
          const r = results[i];
          if (!r) continue;

          const emoji = r.safety.safe === null ? '❓' : r.safety.safe ? '✅' : '🚨';

          console.log(`\n  ${i + 1}. ${emoji} ${r.symbol} (${r.name})`);
          console.log(`     Price: $${r.priceUsd.toFixed(6)}`);
          console.log(`     Liquidity: $${r.liquidity.toLocaleString()}`);
          console.log(`     Volume 24h: $${r.volumeH24.toLocaleString()}`);
          console.log(`     Pump: ${r.priceChangeH1.toFixed(2)}% (1h) / ${r.priceChangeH24.toFixed(2)}% (24h)`);
          console.log(`     Age: ${r.pairAge.toFixed(1)}h`);
          console.log(`     Score: ${r.opportunityScore}/100`);
        }
      } else {
        console.log('  No tokens matched criteria (may need to adjust thresholds)');
      }
    }, 60000);
  });
});
