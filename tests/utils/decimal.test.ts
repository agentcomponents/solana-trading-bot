/**
 * Tests for decimal conversion utilities
 *
 * CRITICAL: These tests must pass before deployment.
 * Bugs in decimal conversion cause incorrect exit amounts.
 *
 * See design/02-decimal-handling.md for details.
 */

import { describe, it, expect } from 'vitest';
import BN from 'bn.js';
import {
  humanToRaw,
  rawToHuman,
  calculatePositionValue,
  calculatePnLPercentage,
  calculatePartialExitRaw,
  formatAmount
} from '../../src/utils/decimal';

describe('Decimal Conversion', () => {
  describe('humanToRaw', () => {
    it('should convert 6 decimal token (USDC-style)', () => {
      const raw = humanToRaw(100.5, 6);
      expect(raw.toString()).toBe('100500000');
    });

    it('should convert 9 decimal token (SOL-style)', () => {
      const raw = humanToRaw(0.123456789, 9);
      expect(raw.toString()).toBe('123456789');
    });

    it('should convert 0 decimal token', () => {
      const raw = humanToRaw(5, 0);
      expect(raw.toString()).toBe('5');
    });

    it('should handle very small amounts', () => {
      const raw = humanToRaw(0.000001, 9);
      expect(raw.toString()).toBe('1000');
    });

    it('should handle zero', () => {
      const raw = humanToRaw(0, 6);
      expect(raw.toString()).toBe('0');
    });

    it('should handle fractional amounts at 6 decimals', () => {
      const raw = humanToRaw(1.234567, 6);
      expect(raw.toString()).toBe('1234567');
    });

    it('should handle large amounts', () => {
      const raw = humanToRaw(10, 9);
      expect(raw.toString()).toBe('10000000000');
    });

    it('should throw on negative amount', () => {
      expect(() => humanToRaw(-1, 9)).toThrow('Amount cannot be negative');
    });

    it('should throw on invalid decimals (negative)', () => {
      expect(() => humanToRaw(1, -1)).toThrow('Invalid decimals');
    });

    it('should throw on invalid decimals (too high)', () => {
      expect(() => humanToRaw(1, 10)).toThrow('Invalid decimals');
    });

    it('should handle all decimal values 0-9', () => {
      for (let decimals = 0; decimals <= 9; decimals++) {
        const amount = 1.23456789;
        const raw = humanToRaw(amount, decimals);
        expect(raw).toBeInstanceOf(BN);
        expect(raw.toString()).toMatch(/^\d+$/);
      }
    });

    it('should truncate excess decimals (not round)', () => {
      const raw = humanToRaw(1.9999999, 6);
      // Should floor to 1.999999, not round to 2
      expect(raw.toString()).toBe('1999999');
    });

    it('should handle 1 decimal (e.g., 2 decimals)', () => {
      const raw = humanToRaw(123.45, 2);
      expect(raw.toString()).toBe('12345');
    });

    it('should handle 3 decimals', () => {
      const raw = humanToRaw(1.234, 3);
      expect(raw.toString()).toBe('1234');
    });

    it('should handle 4 decimals', () => {
      const raw = humanToRaw(1.2345, 4);
      expect(raw.toString()).toBe('12345');
    });

    it('should handle 5 decimals', () => {
      const raw = humanToRaw(1.23456, 5);
      expect(raw.toString()).toBe('123456');
    });

    it('should handle 7 decimals', () => {
      const raw = humanToRaw(1.2345678, 7);
      expect(raw.toString()).toBe('12345678');
    });

    it('should handle 8 decimals', () => {
      const raw = humanToRaw(1.234567, 8);
      expect(raw.toString()).toBe('123456700');
    });
  });

  describe('rawToHuman', () => {
    it('should convert from BN for 6 decimals', () => {
      const human = rawToHuman(new BN('100500000'), 6);
      expect(human).toBe(100.5);
    });

    it('should convert from string for 9 decimals', () => {
      const human = rawToHuman('123456789', 9);
      expect(human).toBeCloseTo(0.123456789, 9);
    });

    it('should convert from number for 8 decimals', () => {
      const human = rawToHuman(123456789, 8);
      expect(human).toBeCloseTo(1.23456789, 8);
    });

    it('should handle zero from BN', () => {
      expect(rawToHuman(new BN('0'), 9)).toBe(0);
    });

    it('should handle zero from string', () => {
      expect(rawToHuman('0', 9)).toBe(0);
    });

    it('should handle zero from number', () => {
      expect(rawToHuman(0, 9)).toBe(0);
    });

    it('should handle large values', () => {
      const human = rawToHuman('10000000000', 9);
      expect(human).toBe(10);
    });

    it('should throw on invalid decimals (negative)', () => {
      expect(() => rawToHuman(100, -1)).toThrow('Invalid decimals');
    });

    it('should throw on invalid decimals (too high)', () => {
      expect(() => rawToHuman(100, 10)).toThrow('Invalid decimals');
    });

    it('should handle 0 decimals correctly', () => {
      expect(rawToHuman('5', 0)).toBe(5);
      expect(rawToHuman(new BN('100'), 0)).toBe(100);
    });

    it('should handle very small values at high decimals', () => {
      const human = rawToHuman('1', 9);
      expect(human).toBeGreaterThan(0);
      expect(human).toBeLessThan(0.00000001);
    });
  });

  describe('calculatePositionValue', () => {
    it('should calculate value for profitable position (6 decimals)', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const value = calculatePositionValue(rawAmount, 6, 0.0000002);
      expect(value).toBeCloseTo(0.2, 6);
    });

    it('should calculate value for break-even position', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const value = calculatePositionValue(rawAmount, 6, 0.0000001);
      expect(value).toBeCloseTo(0.1, 6);
    });

    it('should calculate value for loss position', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const value = calculatePositionValue(rawAmount, 6, 0.00000005);
      expect(value).toBeCloseTo(0.05, 6);
    });

    it('should handle 9 decimal tokens', () => {
      const rawAmount = humanToRaw(1000000, 9);
      // 1 million tokens at 0.00002 SOL each = 20 SOL
      const value = calculatePositionValue(rawAmount, 9, 0.00002);
      expect(value).toBeCloseTo(20, 2);
    });

    it('should handle zero price', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const value = calculatePositionValue(rawAmount, 6, 0);
      expect(value).toBe(0);
    });

    it('should handle very small token amounts', () => {
      const rawAmount = humanToRaw(1000, 9);
      const value = calculatePositionValue(rawAmount, 9, 0.000000001);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(0.00001);
    });
  });

  describe('calculatePnLPercentage', () => {
    it('should calculate 100% profit correctly', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.0000002, 0.1);
      expect(pnl).toBeCloseTo(100, 2);
    });

    it('should calculate 50% profit correctly', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.00000015, 0.1);
      expect(pnl).toBeCloseTo(50, 2);
    });

    it('should calculate -40% loss correctly', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.00000006, 0.1);
      expect(pnl).toBeCloseTo(-40, 2);
    });

    it('should calculate -100% loss (total loss)', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0, 0.1);
      expect(pnl).toBe(-100);
    });

    it('should handle break-even', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.0000001, 0.1);
      expect(pnl).toBeCloseTo(0, 2);
    });

    it('should handle very small profits', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.000000101, 0.1);
      expect(pnl).toBeCloseTo(1, 2);
    });

    it('should handle large profits (500%)', () => {
      const rawAmount = humanToRaw(1000000, 6);
      const pnl = calculatePnLPercentage(rawAmount, 6, 0.0000006, 0.1);
      expect(pnl).toBeCloseTo(500, 2);
    });

    it('should work with 9 decimal tokens', () => {
      const rawAmount = humanToRaw(1000000, 9);
      const pnl = calculatePnLPercentage(rawAmount, 9, 0.0000002, 0.1);
      expect(pnl).toBeCloseTo(100, 2);
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain precision through human->raw->human (6 decimals)', () => {
      const original = 1.234567;
      const raw = humanToRaw(original, 6);
      const converted = rawToHuman(raw, 6);
      expect(converted).toBeCloseTo(original, 6);
    });

    it('should maintain precision through human->raw->human (9 decimals)', () => {
      const original = 0.123456789;
      const raw = humanToRaw(original, 9);
      const converted = rawToHuman(raw, 9);
      expect(converted).toBeCloseTo(original, 9);
    });

    it('should handle full precision SOL round-trip', () => {
      const original = 1.5;
      const raw = humanToRaw(original, 9);
      const converted = rawToHuman(raw, 9);
      expect(converted).toBe(original);
    });

    it('should handle USDC round-trip', () => {
      const original = 100.5;
      const raw = humanToRaw(original, 6);
      const converted = rawToHuman(raw, 6);
      expect(converted).toBe(original);
    });

    it('should handle small amounts in round-trip', () => {
      const original = 0.000001;
      const raw = humanToRaw(original, 9);
      const converted = rawToHuman(raw, 9);
      expect(converted).toBeCloseTo(original, 9);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle 0.1 SOL entry correctly', () => {
      // Entry: 0.1 SOL spent, received tokens at 0.00001 SOL per token
      const entrySol = 0.1;
      const tokenPrice = 0.00001;
      const rawTokens = humanToRaw(entrySol / tokenPrice, 9);

      // Current: Price doubled to 0.00002
      const currentPrice = 0.00002;
      const currentValue = calculatePositionValue(rawTokens, 9, currentPrice);
      const pnl = calculatePnLPercentage(rawTokens, 9, currentPrice, entrySol);

      expect(currentValue).toBeCloseTo(0.2, 6);
      expect(pnl).toBeCloseTo(100, 2);
    });

    it('should handle token with 6 decimals correctly', () => {
      // Entry: 0.1 SOL spent on tokens at 0.00001 SOL per token
      const entrySol = 0.1;
      const tokenPrice = 0.00001;
      const rawTokens = humanToRaw(entrySol / tokenPrice, 6);

      // Verify raw amount is correct
      expect(rawToHuman(rawTokens, 6)).toBe(10000);

      // Check P&L at various prices
      const pnl100 = calculatePnLPercentage(rawTokens, 6, 0.00002, entrySol);
      expect(pnl100).toBeCloseTo(100, 2);

      const pnlMinus40 = calculatePnLPercentage(rawTokens, 6, 0.000006, entrySol);
      expect(pnlMinus40).toBeCloseTo(-40, 2);
    });

    it('should handle partial exit calculations', () => {
      // Position: 1000 tokens at 9 decimals
      const rawTotal = humanToRaw(1000, 9);

      // Sell 25% (250 tokens)
      const rawSell = rawTotal.mul(new BN('250')).div(new BN('1000'));
      expect(rawToHuman(rawSell, 9)).toBe(250);

      // Sell 50% (500 tokens)
      const rawSell50 = rawTotal.mul(new BN('500')).div(new BN('1000'));
      expect(rawToHuman(rawSell50, 9)).toBe(500);
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle NaN input gracefully', () => {
      expect(() => humanToRaw(NaN, 6)).toThrow();
    });

    it('should handle Infinity input', () => {
      expect(() => humanToRaw(Infinity, 6)).toThrow();
    });

    it('should handle very large decimal values', () => {
      const raw = humanToRaw(1000000, 9);
      // Note: JavaScript loses precision with very large numbers
      // The implementation uses Math.floor which is limited by Number.MAX_SAFE_INTEGER
      expect(raw.toString()).toMatch(/^\d+$/);
      // Verify it's in the right ballpark (10^15 range)
      expect(raw.toNumber()).toBeGreaterThanOrEqual(1e15);
    });

    it('should preserve exact precision for exit calculations', () => {
      // Simulate Jupiter response
      const jupiterRawAmount = '1234567890';
      const decimals = 6;
      const humanAmount = rawToHuman(jupiterRawAmount, decimals);
      expect(humanAmount).toBe(1234.56789);

      // Convert back for exit - should match exactly
      const backToRaw = humanToRaw(humanAmount, decimals).toString();
      expect(backToRaw).toBe('1234567890');
    });
  });

  describe('calculatePartialExitRaw', () => {
    it('should calculate 25% exit correctly', () => {
      const raw = humanToRaw(1000, 9);
      const exit = calculatePartialExitRaw(raw, 25);
      expect(rawToHuman(exit, 9)).toBeCloseTo(250, 1);
    });

    it('should calculate 50% exit correctly', () => {
      const raw = humanToRaw(1000, 6);
      const exit = calculatePartialExitRaw(raw, 50);
      expect(rawToHuman(exit, 6)).toBeCloseTo(500, 1);
    });

    it('should handle 100% exit', () => {
      const raw = humanToRaw(1000, 9);
      const exit = calculatePartialExitRaw(raw, 100);
      expect(exit.toString()).toBe(raw.toString());
    });

    it('should handle 0% exit', () => {
      const raw = humanToRaw(1000, 9);
      const exit = calculatePartialExitRaw(raw, 0);
      expect(exit.toString()).toBe('0');
    });

    it('should throw on negative percentage', () => {
      const raw = humanToRaw(1000, 9);
      expect(() => calculatePartialExitRaw(raw, -10)).toThrow(
        'Percentage must be 0-100'
      );
    });

    it('should throw on percentage > 100', () => {
      const raw = humanToRaw(1000, 9);
      expect(() => calculatePartialExitRaw(raw, 101)).toThrow(
        'Percentage must be 0-100'
      );
    });

    it('should throw on negative raw amount', () => {
      const negativeRaw = new BN('-1000000000');
      expect(() => calculatePartialExitRaw(negativeRaw, 50)).toThrow(
        'Total raw amount cannot be negative'
      );
    });

    it('should work with string input', () => {
      const exit = calculatePartialExitRaw('1000000000', 25);
      expect(exit.toString()).toBe('250000000');
    });
  });

  describe('formatAmount', () => {
    it('should format with default maxDecimals (6)', () => {
      expect(formatAmount('1234567890', 6)).toBe('1234.567890');
    });

    it('should format 9 decimals with default maxDecimals (capped at 6)', () => {
      expect(formatAmount('100000000', 9)).toBe('0.100000');
    });

    it('should respect maxDecimals parameter', () => {
      expect(formatAmount('1234567890', 6, 4)).toBe('1234.5679');
    });

    it('should handle zero', () => {
      expect(formatAmount('0', 9)).toBe('0.000000');
    });

    it('should handle very small amounts (with enough maxDecimals)', () => {
      expect(formatAmount('1', 9, 9)).toBe('0.000000001');
    });

    it('should format large amounts', () => {
      expect(formatAmount('1000000000000', 6)).toBe('1000000.000000');
    });
  });
});
