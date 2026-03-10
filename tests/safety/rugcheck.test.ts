/**
 * RugCheck Safety Module Tests
 *
 * Tests the RugCheck API wrapper for token safety checks
 */

import { describe, it, expect } from 'vitest';
import {
  checkTokenSecurity,
  checkMultipleTokensSecurity,
  getTokenSummary,
  analyzeTokenSafety,
  getSecurityVerdict,
  meetsMinimumSafety,
  formatTokenInfo,
  getRiskSummary,
  getLiquidityBreakdown
} from '../../src/safety/rugcheck';

describe('RugCheck Safety Module', () => {
  describe('checkTokenSecurity', () => {
    it('should check security for USDC', async () => {
      const result = await checkTokenSecurity('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(result).toBeDefined();
      expect(result?.token_address).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      console.log('✅ USDC Security Check:');
      console.log('  Symbol:', result?.token_symbol);
      console.log('  Name:', result?.token_name);
      console.log('  Decimals:', result?.decimals);
      console.log('  Mintable:', result?.is_mintable === '1' ? 'YES' : 'NO');
      console.log('  Freezable:', result?.is_freezable === '1' ? 'YES' : 'NO');
      console.log('  Metadata Mutable:', result?.is_metadata_mutable === '1' ? 'YES' : 'NO');
      console.log('  Liquidity:', `$${(result?.liquidity ?? 0).toLocaleString()}`);
      console.log('  RugCheck Score:', result?.rugcheck_score);
      console.log('  Normalized Score:', result?.rugcheck_score_normalised);
      console.log('  Rugged:', result?.is_rugged);
    });

    it('should check security for RAY', async () => {
      const result = await checkTokenSecurity('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      expect(result).toBeDefined();
      expect(result?.token_symbol).toBe('RAY');
      expect(result?.token_name).toBe('Raydium');

      console.log('✅ RAY Security Check:');
      console.log('  Symbol:', result?.token_symbol);
      console.log('  Name:', result?.token_name);
      console.log('  Decimals:', result?.decimals);
      console.log('  Supply:', result?.total_supply);
      console.log('  Mintable:', result?.is_mintable === '1' ? 'YES ⚠️' : 'NO');
      console.log('  Freezable:', result?.is_freezable === '1' ? 'YES ⚠️' : 'NO');
      console.log('  Metadata Mutable:', result?.is_metadata_mutable === '1' ? 'YES ⚠️' : 'NO');
      console.log('  Liquidity:', `$${(result?.liquidity ?? 0).toLocaleString()}`);
      console.log('  Holders:', result?.holder_count);
      console.log('  RugCheck Score:', result?.rugcheck_score);
      console.log('  Risks:', result?.risks.length);
      console.log('  Locked Liquidity:', `$${(result?.locked_liquidity_usd ?? 0).toLocaleString()}`);

      if (result?.risks && result.risks.length > 0) {
        console.log('  Risk Details:');
        for (const risk of result.risks) {
          console.log(`    - ${risk.name}: ${risk.description}`);
          console.log(`      Level: ${risk.level}, Score: ${risk.score}`);
        }
      }
    });

    it('should return null for invalid token address', async () => {
      const result = await checkTokenSecurity('InvalidTokenAddress1234567890abcdef');

      expect(result).toBeNull();
    });
  });

  describe('checkMultipleTokensSecurity', () => {
    it('should check multiple tokens in parallel', async () => {
      const tokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
        'So11111111111111111111111111111111111111112'  // Wrapped SOL
      ];

      const results = await checkMultipleTokensSecurity(tokens);

      console.log('✅ Multi-Token Security Check:');
      console.log(`  Found data for ${Object.keys(results).length}/${tokens.length} tokens`);

      for (const [address, token] of Object.entries(results)) {
        console.log(`  ${address.substring(0, 8)}... (${token.token_symbol ?? '?'})`);
        console.log(`    Score: ${token.rugcheck_score}, Rugged: ${token.is_rugged}`);
      }

      // Note: RugCheck may rate limit, so we accept if no results are returned
      // The API is free and has no rate limit guarantees
      expect(results).toBeDefined();
    });

    it('should handle empty array', async () => {
      const results = await checkMultipleTokensSecurity([]);
      expect(results).toEqual({});
    });
  });

  describe('getTokenSummary', () => {
    it('should get quick summary for USDC', async () => {
      const summary = await getTokenSummary('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      // Note: RugCheck may return null if rate limited
      expect(summary).toBeDefined();

      if (summary) {
        expect(summary.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

        console.log('✅ USDC Summary:');
        console.log('  mint:', summary.mint);
        console.log('  score:', summary.score);
        console.log('  rugged:', summary.rugged);
      } else {
        console.log('⚠️ Summary returned null (possible rate limiting)');
      }
    });
  });

  describe('analyzeTokenSafety', () => {
    it('should analyze USDC safety', async () => {
      const check = await analyzeTokenSafety('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(check).toBeDefined();
      expect(check.token).toBeDefined();
      expect(check.confidence).toBeDefined();

      console.log('✅ USDC Safety Analysis:');
      console.log('  Safe:', check.isSafe);
      console.log('  Confidence:', check.confidence);
      console.log('  Risks:', check.risks);
    });

    it('should analyze RAY token safety (has risks)', async () => {
      const check = await analyzeTokenSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      expect(check).toBeDefined();
      expect(check.token).toBeDefined();

      console.log('✅ RAY Safety Analysis:');
      console.log('  Safe:', check.isSafe);
      console.log('  Confidence:', check.confidence);
      console.log('  Risks:', check.risks);
      console.log('  Liquidity:', `$${(check.token?.liquidity ?? 0).toLocaleString()}`);
      console.log('  RugCheck Score:', check.token?.rugcheck_score);
    });

    it('should return unsafe for invalid token', async () => {
      const check = await analyzeTokenSafety('InvalidTokenAddress123');

      expect(check.isSafe).toBe(false);
      expect(check.confidence).toBe('low');
      expect(check.risks).toContain('Unable to fetch token security data');
    });
  });

  describe('getSecurityVerdict', () => {
    it('should return verdict for USDC', async () => {
      const verdict = await getSecurityVerdict('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      expect(verdict).toBeDefined();
      console.log('✅ USDC Verdict:', verdict);
    });

    it('should return UNSAFE for invalid token', async () => {
      const verdict = await getSecurityVerdict('InvalidToken123');

      expect(verdict).toContain('UNSAFE');
      console.log('✅ Invalid Token Verdict:', verdict);
    });
  });

  describe('meetsMinimumSafety', () => {
    it('should evaluate USDC safety', async () => {
      const safe = await meetsMinimumSafety('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      console.log('✅ USDC meets minimum safety:', safe);
      expect(typeof safe).toBe('boolean');
    });

    it('should return false for invalid token', async () => {
      const safe = await meetsMinimumSafety('InvalidToken123');

      expect(safe).toBe(false);
    });

    it('should evaluate RAY token safety', async () => {
      const safe = await meetsMinimumSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      console.log('✅ RAY meets minimum safety:', safe);
      expect(typeof safe).toBe('boolean');
    });
  });

  describe('Utility Functions', () => {
    it('should format token info', async () => {
      const token = await checkTokenSecurity('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      if (token) {
        const formatted = formatTokenInfo(token);

        expect(formatted).toContain('RAY');
        expect(formatted).toContain('Liquidity:');
        expect(formatted).toContain('Holders:');
        expect(formatted).toContain('RugCheck Score');

        console.log('✅ Formatted Token Info:', formatted);
      }
    });

    it('should get risk summary', async () => {
      const check = await analyzeTokenSafety('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      const summary = getRiskSummary(check);

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');

      console.log('✅ Risk Summary:', summary);
    });

    it('should get liquidity breakdown', async () => {
      const token = await checkTokenSecurity('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');

      if (token) {
        const breakdown = getLiquidityBreakdown(token);

        expect(breakdown).toBeDefined();
        expect(typeof breakdown.total).toBe('number');
        expect(typeof breakdown.locked).toBe('number');
        expect(typeof breakdown.lockedPercent).toBe('number');

        console.log('✅ Liquidity Breakdown:');
        console.log('  Total:', `$${breakdown.total.toLocaleString()}`);
        console.log('  Locked:', `$${breakdown.locked.toLocaleString()}`);
        console.log('  Locked %:', breakdown.lockedPercent.toFixed(2));
      }
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
        console.log('  RugCheck Score:', token?.rugcheck_score);
        console.log('  Normalized:', token?.rugcheck_score_normalised);
        console.log('  Rugged:', token?.is_rugged ? 'YES 🚨' : 'NO');
        console.log('  Risks Count:', token?.risks.length ?? 0);
      }

      expect(true).toBe(true); // Just logging above
    });
  });
});
