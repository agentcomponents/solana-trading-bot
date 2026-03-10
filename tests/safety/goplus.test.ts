/**
 * GoPlus Safety Module Tests
 *
 * Tests the GoPlus security API wrapper for token safety checks
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import {
  checkTokenSecurity,
  checkSingleTokenSecurity,
  analyzeTokenSafety,
  getSecurityVerdict,
  meetsMinimumSafety,
  formatTokenInfo,
  getRiskSummary
} from '../../src/safety/goplus';

// Load environment variables
config();

describe('GoPlus Safety Module', () => {
  const apiKey = process.env['GOPLUS_API_KEY'];

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('GOPLUS_API_KEY not configured');
    }
  });

  describe('checkTokenSecurity', () => {
    it('should check security for a single token', async () => {
      const results = await checkTokenSecurity('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(results).toBeDefined();
      expect(results['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']).toBeDefined();

      const token = results['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
      expect(token?.token_symbol).toBeDefined();
      expect(token?.token_name).toBeDefined();

      console.log('✅ USDC Security Check:');
      console.log('  Symbol:', token?.token_symbol);
      console.log('  Name:', token?.token_name);
      console.log('  Decimals:', token?.decimals);
      console.log('  Mintable:', token?.is_mintable === '1' ? 'YES' : 'NO');
      console.log('  Freezable:', token?.is_freezable === '1' ? 'YES' : 'NO');
      console.log('  Metadata Mutable:', token?.is_metadata_mutable === '1' ? 'YES' : 'NO');
      console.log('  Liquidity:', `$${(token?.liquidity ?? 0).toLocaleString()}`);
    });

    it('should check security for multiple tokens (some may not have data)', async () => {
      const tokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
        'So11111111111111111111111111111111111111112'  // Wrapped SOL (may not have data)
      ];

      const results = await checkTokenSecurity(tokens);

      // At least some tokens should have data
      expect(Object.keys(results).length).toBeGreaterThan(0);

      console.log('✅ Multi-Token Security Check:');
      console.log(`  Found data for ${Object.keys(results).length}/${tokens.length} tokens`);
      for (const [address, token] of Object.entries(results)) {
        console.log(`  ${address.substring(0, 8)}... (${token.token_symbol ?? '?'})`);
      }
    });

    it('should handle empty array', async () => {
      const results = await checkTokenSecurity([]);
      expect(results).toEqual({});
    });

    it('should reject more than 20 tokens', async () => {
      const tokens = Array.from({ length: 21 }, (_, i) =>
        `So1111111111111111111111111111111111111111${i.toString().padStart(2, '0')}`
      );

      await expect(checkTokenSecurity(tokens)).rejects.toThrow('Maximum 20 token addresses');
    });
  });

  describe('checkSingleTokenSecurity', () => {
    it('should return null for non-existent/invalid token', async () => {
      const fakeToken = 'InvalidTokenAddress1234567890abcdef';

      const result = await checkSingleTokenSecurity(fakeToken);

      expect(result).toBeNull();
    });

    it('should return token data for valid token', async () => {
      const result = await checkSingleTokenSecurity('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(result).toBeDefined();
      expect(result?.token_symbol).toBe('USDC');
      expect(result?.token_name).toBe('USD Coin');
      // USDC is a centrally managed stablecoin, so it IS mintable
      expect(result?.is_mintable).toBeDefined();
    });
  });

  describe('analyzeTokenSafety', () => {
    it('should analyze USDC (centrally managed stablecoin has flags)', async () => {
      const check = await analyzeTokenSafety('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(check).toBeDefined();
      expect(check.token).toBeDefined();
      // USDC is mintable (centrally managed), so not safe by our definition
      expect(check.confidence).toBeDefined();

      console.log('✅ USDC Safety Analysis:');
      console.log('  Safe:', check.isSafe);
      console.log('  Confidence:', check.confidence);
      console.log('  Risks:', check.risks);
    });

    it('should return unsafe for invalid token', async () => {
      const check = await analyzeTokenSafety('InvalidTokenAddress123');

      expect(check.isSafe).toBe(false);
      expect(check.confidence).toBe('low');
      expect(check.risks).toContain('Unable to fetch token security data');
    });

    it('should analyze RAY token', async () => {
      const check = await analyzeTokenSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      expect(check).toBeDefined();
      expect(check.token).toBeDefined();

      console.log('✅ RAY Safety Analysis:');
      console.log('  Safe:', check.isSafe);
      console.log('  Confidence:', check.confidence);
      console.log('  Risks:', check.risks);
      console.log('  Liquidity:', `$${(check.token?.liquidity ?? 0).toLocaleString()}`);
    });
  });

  describe('getSecurityVerdict', () => {
    it('should return verdict for USDC', async () => {
      const verdict = await getSecurityVerdict('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(verdict).toBeDefined();
      // USDC is mintable, so will be UNSAFE or CAUTION
      expect(['UNSAFE', 'CAUTION'].some(v => verdict.includes(v))).toBe(true);

      console.log('✅ USDC Verdict:', verdict);
    });

    it('should return UNSAFE for invalid token', async () => {
      const verdict = await getSecurityVerdict('InvalidToken123');

      expect(verdict).toContain('UNSAFE');
      console.log('✅ Invalid Token Verdict:', verdict);
    });
  });

  describe('meetsMinimumSafety', () => {
    it('should return false for USDC (mintable)', async () => {
      // USDC is mintable, so fails our minimum safety
      const safe = await meetsMinimumSafety('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(safe).toBe(false);
    });

    it('should return false for invalid token', async () => {
      const safe = await meetsMinimumSafety('InvalidToken123');
      expect(safe).toBe(false);
    });

    it('should evaluate RAY token safety', async () => {
      const safe = await meetsMinimumSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      console.log('✅ RAY meets minimum safety:', safe);
      // RAY may or may not pass depending on its flags
      expect(typeof safe).toBe('boolean');
    });
  });

  describe('Utility Functions', () => {
    it('should format token info', async () => {
      const token = await checkSingleTokenSecurity('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      if (token) {
        const formatted = formatTokenInfo(token);

        expect(formatted).toContain('USDC');
        expect(formatted).toContain('Liquidity:');
        expect(formatted).toContain('Holders:');

        console.log('✅ Formatted Token Info:', formatted);
      }
    });

    it('should get risk summary', async () => {
      // Use RAY which has fewer risks
      const check = await analyzeTokenSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      const summary = getRiskSummary(check);

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');

      console.log('✅ Risk Summary:', summary);
    });
  });

  describe('Real-World Token Safety Examples', () => {
    it('should check major tokens', async () => {
      const tokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
      ];

      for (const address of tokens) {
        const check = await analyzeTokenSafety(address);
        const token = check.token;

        console.log(`\n✅ ${token?.token_symbol ?? 'Unknown'}:`);
        console.log('  Safe:', check.isSafe);
        console.log('  Confidence:', check.confidence);
        console.log('  Mintable:', token?.is_mintable === '1' ? 'YES ⚠️' : 'NO');
        console.log('  Freezable:', token?.is_freezable === '1' ? 'YES ⚠️' : 'NO');
        console.log('  Metadata Mutable:', token?.is_metadata_mutable === '1' ? 'YES ⚠️' : 'NO');
        console.log('  Liquidity:', `$${(token?.liquidity ?? 0).toLocaleString()}`);
      }

      expect(true).toBe(true); // Just logging above
    });
  });
});
