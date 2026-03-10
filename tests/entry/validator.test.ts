/**
 * Entry Module Tests
 *
 * Tests the entry validator and orchestrator
 */

import { describe, it, expect } from 'vitest';
import {
  validateEntry,
  createEntrySignal,
  validateMultipleEntries,
  formatValidationResult,
  formatEntrySignal,
  DEFAULT_ENTRY_VALIDATION,
} from '../../src/entry/validator';
import type { TokenSearchResult } from '../../src/scanner/dexscreener';
import type { AggregateSafetyResult } from '../../src/safety/aggregator';
import type { EntryValidationResult } from '../../src/entry/validator';
import type { EntrySignal } from '../../src/entry/validator';
import { calculatePositionSizeForStage } from '../../src/entry/executor';

describe('Entry Validator', () => {
  describe('validateEntry', () => {
    it('should validate a safe token with good metrics', async () => {
      const token: TokenSearchResult = {
        address: 'test_address',
        name: 'Test Token',
        symbol: 'TEST',
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: 'pair_test',
        priceUsd: 0.0001,
        liquidity: 50000,
        volumeH24: 50000,
        priceChangeH1: 15,
        priceChangeH24: 50,
        txnsH24: { buys: 800, sells: 200 },
        pairAge: 2,
        opportunityScore: 75,
      };

      const safety: AggregateSafetyResult = {
        safe: true,
        confidence: 'high',
        reasons: [],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: {
            passed: true,
            liquidity: 50000,
            minimum: 15000,
          },
          holderCheck: {
            passed: true,
            topHolderPct: 30,
            maximum: 60,
          },
          authorityCheck: {
            passed: true,
            isMintable: false,
            isFreezable: false,
            isMetadataMutable: false,
          },
        },
      };

      const result = await validateEntry(token, safety);

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe('high');

      console.log('✅ Valid Token:');
      console.log(`  Valid: ${result.valid}`);
      console.log(`  Confidence: ${result.confidence}`);
    });

    it('should reject token with insufficient liquidity', async () => {
      const token: TokenSearchResult = {
        address: 'test_address',
        name: 'Test Token',
        symbol: 'TEST',
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: 'pair_test',
        priceUsd: 0.0001,
        liquidity: 10000, // Below minimum
        volumeH24: 50000,
        priceChangeH1: 15,
        priceChangeH24: 50,
        txnsH24: { buys: 800, sells: 200 },
        pairAge: 2,
        opportunityScore: 75,
      };

      const safety: AggregateSafetyResult = {
        safe: true,
        confidence: 'high',
        reasons: [],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: {
            passed: false,
            liquidity: 10000,
            minimum: 15000,
          },
          holderCheck: {
            passed: true,
            topHolderPct: 30,
            maximum: 60,
          },
          authorityCheck: {
            passed: true,
            isMintable: false,
            isFreezable: false,
            isMetadataMutable: false,
          },
        },
      };

      const result = await validateEntry(token, safety);

      expect(result.valid).toBe(false);
      expect(result.reasons.some(r => r.includes('Insufficient liquidity'))).toBe(true);

      console.log('✅ Low Liquidity Token:');
      console.log(`  Valid: ${result.valid}`);
      console.log(`  Reasons: ${result.reasons.join('; ')}`);
    });

    it('should reject unsafe token', async () => {
      const token: TokenSearchResult = {
        address: 'test_address',
        name: 'Rug Token',
        symbol: 'RUG',
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: 'pair_test',
        priceUsd: 0.0001,
        liquidity: 50000,
        volumeH24: 50000,
        priceChangeH1: 15,
        priceChangeH24: 50,
        txnsH24: { buys: 800, sells: 200 },
        pairAge: 2,
        opportunityScore: 75,
      };

      const safety: AggregateSafetyResult = {
        safe: false,
        confidence: 'low',
        reasons: ['Token is mintable', 'Token is freezable'],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: {
            passed: true,
            liquidity: 50000,
            minimum: 15000,
          },
          holderCheck: {
            passed: false,
            topHolderPct: 80,
            maximum: 60,
          },
          authorityCheck: {
            passed: false,
            isMintable: true,
            isFreezable: true,
            isMetadataMutable: true,
          },
        },
      };

      const result = await validateEntry(token, safety);

      expect(result.valid).toBe(false);

      console.log('✅ Unsafe Token:');
      console.log(`  Valid: ${result.valid}`);
      console.log(`  Reasons: ${result.reasons.join('; ')}`);
    });
  });

  describe('createEntrySignal', () => {
    it('should create entry signal with combined score', () => {
      const token: TokenSearchResult = {
        address: 'test_address',
        name: 'Test Token',
        symbol: 'TEST',
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: 'pair_test',
        priceUsd: 0.0001,
        liquidity: 50000,
        volumeH24: 100000,
        priceChangeH1: 20,
        priceChangeH24: 60,
        txnsH24: { buys: 900, sells: 100 },
        pairAge: 1,
        opportunityScore: 80,
      };

      const safety: AggregateSafetyResult = {
        safe: true,
        confidence: 'high',
        reasons: [],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: {
            passed: true,
            liquidity: 50000,
            minimum: 15000,
          },
          holderCheck: {
            passed: true,
            topHolderPct: 20,
            maximum: 60,
          },
          authorityCheck: {
            passed: true,
            isMintable: false,
            isFreezable: false,
            isMetadataMutable: false,
          },
        },
      };

      const signal = createEntrySignal(token, safety);

      expect(signal.address).toBe(token.address);
      expect(signal.symbol).toBe(token.symbol);
      expect(signal.opportunityScore).toBe(80);
      expect(signal.safetyScore).toBeGreaterThan(0);
      expect(signal.entryScore).toBeGreaterThan(0);
      expect(signal.entryScore).toBeLessThanOrEqual(100);

      console.log('✅ Entry Signal:');
      console.log(`  Symbol: ${signal.symbol}`);
      console.log(`  Opportunity Score: ${signal.opportunityScore}/100`);
      console.log(`  Safety Score: ${signal.safetyScore}/100`);
      console.log(`  Entry Score: ${signal.entryScore}/100`);
    });
  });

  describe('validateMultipleEntries', () => {
    it('should validate multiple tokens and return signals', async () => {
      const tokens: TokenSearchResult[] = [
        {
          address: 'token1',
          name: 'Token 1',
          symbol: 'TK1',
          chainId: 'solana',
          dexId: 'raydium',
          pairAddress: 'pair1',
          priceUsd: 0.001,
          liquidity: 30000,
          volumeH24: 30000,
          priceChangeH1: 10,
          priceChangeH24: 40,
          txnsH24: { buys: 700, sells: 300 },
          pairAge: 3,
          opportunityScore: 70,
        },
        {
          address: 'token2',
          name: 'Token 2',
          symbol: 'TK2',
          chainId: 'solana',
          dexId: 'raydium',
          pairAddress: 'pair2',
          priceUsd: 0.002,
          liquidity: 20000,
          volumeH24: 20000,
          priceChangeH1: 8,
          priceChangeH24: 30,
          txnsH24: { buys: 600, sells: 400 },
          pairAge: 4,
          opportunityScore: 60,
        },
      ];

      const safetyMap = new Map<string, AggregateSafetyResult>();
      safetyMap.set('token1', {
        safe: true,
        confidence: 'high',
        reasons: [],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: { passed: true, liquidity: 30000, minimum: 15000 },
          holderCheck: { passed: true, topHolderPct: 25, maximum: 60 },
          authorityCheck: { passed: true, isMintable: false, isFreezable: false, isMetadataMutable: false },
        },
      });

      safetyMap.set('token2', {
        safe: true,
        confidence: 'medium',
        reasons: ['Mutable metadata'],
        data: {
          rugcheck: null,
          goplus: null,
          liquidityCheck: { passed: true, liquidity: 20000, minimum: 15000 },
          holderCheck: { passed: true, topHolderPct: 30, maximum: 60 },
          authorityCheck: { passed: true, isMintable: false, isFreezable: false, isMetadataMutable: true },
        },
      });

      const signals = await validateMultipleEntries(tokens, safetyMap);

      expect(signals.length).toBe(2);
      expect(signals[0]?.entryScore).toBeGreaterThan(0);

      console.log('✅ Multiple Entry Signals:');
      for (const signal of signals) {
        console.log(`  ${signal.symbol}: Score ${signal.entryScore}/100`);
      }
    });
  });

  describe('calculatePositionSizeForStage', () => {
    it('should calculate build stage position size', () => {
      const result = calculatePositionSizeForStage(0.15);

      expect(result.amountSol).toBe(0.1); // Fixed 0.1 SOL in build stage
      expect(result.amountLamports).toBe('100000000'); // 0.1 SOL in lamports

      console.log('✅ Build Stage (0.15 SOL holding):');
      console.log(`  Position Size: ${result.amountSol} SOL`);
      console.log(`  Lamports: ${result.amountLamports}`);
    });

    it('should calculate growth stage position size', () => {
      const result = calculatePositionSizeForStage(0.5);

      expect(result.amountSol).toBeGreaterThan(0.1);
      expect(result.amountSol).toBeLessThan(0.25);

      console.log('✅ Growth Stage (0.5 SOL holding):');
      console.log(`  Position Size: ${result.amountSol.toFixed(3)} SOL`);
    });

    it('should calculate expansion stage position size', () => {
      const result = calculatePositionSizeForStage(1.5);

      expect(result.amountSol).toBeCloseTo(0.3, 1); // 20% of 1.5 = 0.3

      console.log('✅ Expansion Stage (1.5 SOL holding):');
      console.log(`  Position Size: ${result.amountSol.toFixed(3)} SOL`);
    });
  });

  describe('formatting functions', () => {
    it('should format validation result', () => {
      const result: EntryValidationResult = {
        valid: true,
        confidence: 'high',
        reasons: [],
        data: {
          token: {
            address: 'test',
            name: 'Test',
            symbol: 'TEST',
            chainId: 'solana',
            dexId: 'raydium',
            pairAddress: 'pair',
            priceUsd: 0.001,
            liquidity: 50000,
            volumeH24: 50000,
            priceChangeH1: 10,
            priceChangeH24: 50,
            txnsH24: { buys: 800, sells: 200 },
            pairAge: 2,
            opportunityScore: 70,
          },
          safety: null,
        },
      };

      const formatted = formatValidationResult(result);

      expect(formatted).toContain('Entry Validation');
      expect(formatted).toContain('HIGH');

      console.log('✅ Formatted Validation:');
      console.log(formatted);
    });

    it('should format entry signal', () => {
      const signal: EntrySignal = {
        address: 'test',
        symbol: 'TEST',
        name: 'Test Token',
        priceUsd: 0.001,
        liquidity: 50000,
        volume24h: 50000,
        priceChange1h: 15,
        priceChangeH24: 50,
        opportunityScore: 80,
        safetyScore: 90,
        entryScore: 84,
      };

      const formatted = formatEntrySignal(signal);

      expect(formatted).toContain('TEST');
      expect(formatted).toContain('84/100');

      console.log('✅ Formatted Signal:');
      console.log(formatted);
    });
  });

  describe('DEFAULT_ENTRY_VALIDATION', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ENTRY_VALIDATION.minLiquidityUsd).toBe(15000);
      expect(DEFAULT_ENTRY_VALIDATION.maxLiquidityUsd).toBe(500000);
      expect(DEFAULT_ENTRY_VALIDATION.minPriceChange1h).toBe(5);
      expect(DEFAULT_ENTRY_VALIDATION.maxPriceChange24h).toBe(200);
      expect(DEFAULT_ENTRY_VALIDATION.requireSafetyCheck).toBe(true);

      console.log('✅ Default Entry Validation:');
      console.log(`  Min Liquidity: $${DEFAULT_ENTRY_VALIDATION.minLiquidityUsd.toLocaleString()}`);
      console.log(`  Max Price Change 1h: ${DEFAULT_ENTRY_VALIDATION.minPriceChange1h}%`);
    });
  });
});
