/**
 * Safety Aggregator Tests
 *
 * Tests the unified safety checker that combines RugCheck and GoPlus
 */

import { describe, it, expect } from 'vitest';
import {
  checkTokenSafetyAggregate,
  isTokenSafe,
  getSafetyVerdict,
  checkMultipleTokensSafe,
  filterSafeTokens,
  formatSafetyResult,
  DEFAULT_THRESHOLDS,
  MINIMUM_LIQUIDITY_USD,
  MAX_TOP_HOLDER_PCT,
  type SafetyThresholds,
} from '../../src/safety/aggregator';

describe('Safety Aggregator', () => {
  describe('checkTokenSafetyAggregate', () => {
    it('should check USDC (known token)', async () => {
      const result = await checkTokenSafetyAggregate('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(result).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.reasons).toBeInstanceOf(Array);
      expect(result.data.liquidityCheck).toBeDefined();
      expect(result.data.holderCheck).toBeDefined();
      expect(result.data.authorityCheck).toBeDefined();

      console.log('✅ USDC Aggregate Safety:');
      console.log(`  Safe: ${result.safe}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Reasons: ${result.reasons.length}`);
      console.log(`  Liquidity: $${result.data.liquidityCheck.liquidity.toLocaleString()}`);
    });

    it('should check RAY token', async () => {
      const result = await checkTokenSafetyAggregate('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      expect(result).toBeDefined();
      expect(result.data.rugcheck).toBeDefined();

      console.log('✅ RAY Aggregate Safety:');
      console.log(`  Safe: ${result.safe}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Reasons:`, result.reasons);
      console.log(`  Liquidity: $${result.data.liquidityCheck.liquidity.toLocaleString()}`);
      console.log(`  Authority Check:`);
      console.log(`    Mintable: ${result.data.authorityCheck.isMintable}`);
      console.log(`    Freezable: ${result.data.authorityCheck.isFreezable}`);
      console.log(`    Mutable Metadata: ${result.data.authorityCheck.isMetadataMutable}`);
    });

    it('should handle custom thresholds', async () => {
      const customThresholds: SafetyThresholds = {
        minLiquidityUsd: 1000000, // Very high
        maxTopHolderPct: 10, // Very strict
        maxRugcheckNormalizedScore: 5,
        minHolders: 10000,
      };

      const result = await checkTokenSafetyAggregate(
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        customThresholds
      );

      expect(result).toBeDefined();
      expect(result.data.liquidityCheck.minimum).toBe(1000000);

      console.log('✅ Custom Thresholds Test:');
      console.log(`  Safe with custom thresholds: ${result.safe}`);
    });
  });

  describe('isTokenSafe', () => {
    it('should return boolean for USDC', async () => {
      const safe = await isTokenSafe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(typeof safe).toBe('boolean');
      console.log(`✅ USDC is safe: ${safe}`);
    });

    it('should return false for invalid token', async () => {
      const safe = await isTokenSafe('InvalidTokenAddress123');

      expect(safe).toBe(false);
    });
  });

  describe('getSafetyVerdict', () => {
    it('should return verdict for RAY', async () => {
      const verdict = await getSafetyVerdict('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      expect(verdict).toBeDefined();
      expect(typeof verdict).toBe('string');

      console.log('✅ RAY Verdict:');
      console.log(`  ${verdict}`);
    });

    it('should return UNSAFE for invalid token', async () => {
      const verdict = await getSafetyVerdict('InvalidToken123');

      expect(verdict).toContain('UNSAFE');
      console.log(`✅ Invalid Token Verdict: ${verdict}`);
    });
  });

  describe('checkMultipleTokensSafe', () => {
    it('should check multiple tokens', async () => {
      const tokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
      ];

      const results = await checkMultipleTokensSafe(tokens);

      expect(Object.keys(results).length).toBeGreaterThan(0);
      expect(Object.keys(results)).toEqual(expect.arrayContaining(tokens));

      console.log('✅ Multiple Tokens Check:');
      for (const [address, result] of Object.entries(results)) {
        console.log(`  ${address.substring(0, 8)}...: Safe=${result.safe}, Confidence=${result.confidence}`);
      }
    });

    it('should handle empty array', async () => {
      const results = await checkMultipleTokensSafe([]);
      expect(results).toEqual({});
    });
  });

  describe('filterSafeTokens', () => {
    it('should filter safe tokens from list', async () => {
      const tokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      ];

      const safeTokens = await filterSafeTokens(tokens);

      expect(safeTokens).toBeInstanceOf(Array);

      console.log('✅ Filter Safe Tokens:');
      console.log(`  Input: ${tokens.length} tokens`);
      console.log(`  Safe: ${safeTokens.length} tokens`);
      for (const token of safeTokens) {
        console.log(`    - ${token.substring(0, 8)}...`);
      }
    });
  });

  describe('formatSafetyResult', () => {
    it('should format safety result', async () => {
      const result = await checkTokenSafetyAggregate('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      const formatted = formatSafetyResult(result);

      expect(formatted).toContain('Safety:');
      expect(formatted).toContain('Confidence:');
      expect(formatted).toContain('Liquidity:');
      expect(formatted).toContain('Authority:');

      console.log('✅ Formatted Safety Result:');
      console.log(formatted);
    });
  });

  describe('Threshold Constants', () => {
    it('should have correct default thresholds', () => {
      expect(DEFAULT_THRESHOLDS.minLiquidityUsd).toBe(15000);
      expect(DEFAULT_THRESHOLDS.maxTopHolderPct).toBe(50);
      expect(DEFAULT_THRESHOLDS.maxRugcheckNormalizedScore).toBe(30);
      expect(DEFAULT_THRESHOLDS.minHolders).toBe(100);
    });

    it('should export threshold constants', () => {
      expect(MINIMUM_LIQUIDITY_USD).toBe(15000);
      expect(MAX_TOP_HOLDER_PCT).toBe(50);
    });
  });

  describe('Real-World Token Safety Examples', () => {
    it('should test tokens from previous session', async () => {
      // Tokens tested in previous session
      const tokens = {
        shroom: 'xyzR4s6H724bUq6q7MTqWxUnhi8LM5fiKKUq38h8M1P',
        miracil: '8yW8gpJh4BoXMTHPmt2JWT4XEoQqDEvMcea3WurNpump',
        hate: '5NFHTLFBQ3GgQ9QwjeWzHkVpCTQwwcko3vDpkakvpump',
      };

      console.log('\n✅ Previous Session Tokens Re-check:');

      for (const [name, address] of Object.entries(tokens)) {
        const result = await checkTokenSafetyAggregate(address);

        const emoji = result.safe ? '✅' : '🚨';
        console.log(`\n  ${name.toUpperCase()} (${address.substring(0, 8)}...):`);
        console.log(`  ${emoji} Safe: ${result.safe} | Confidence: ${result.confidence}`);
        console.log(`  Liquidity: $${result.data.liquidityCheck.liquidity.toLocaleString()}`);
        console.log(`  Reasons: ${result.reasons.length > 0 ? result.reasons.slice(0, 2).join('; ') : 'None'}`);
      }
    });
  });
});
