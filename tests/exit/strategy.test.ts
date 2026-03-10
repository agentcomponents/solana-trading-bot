/**
 * Exit Strategy Tests
 *
 * Tests for exit condition evaluation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  ExitStrategy,
  calculatePnlPercent,
  calculateTrailingPercent,
  formatPrice,
  getRemainingPercent,
  isTrailingActive,
} from '../../src/exit/strategy';
import type { Position } from '../../src/db/schema';
import { EXIT_CONFIG } from '../../src/exit/config';

describe('Exit Strategy', () => {
  describe('calculatePnlPercent', () => {
    it('should calculate positive P&L', () => {
      const result = calculatePnlPercent(0.001, 0.0015);
      expect(result).toBeCloseTo(50); // +50%
    });

    it('should calculate negative P&L', () => {
      const result = calculatePnlPercent(0.001, 0.0006);
      expect(result).toBeCloseTo(-40); // -40%
    });

    it('should handle zero entry price', () => {
      const result = calculatePnlPercent(0, 0.001);
      expect(result).toBe(0);
    });
  });

  describe('calculateTrailingPercent', () => {
    it('should calculate trailing percent below peak', () => {
      const result = calculateTrailingPercent(0.002, 0.0017);
      expect(result).toBeCloseTo(15); // 15% below peak
    });

    it('should return 0 for zero peak price', () => {
      const result = calculateTrailingPercent(0, 0.001);
      expect(result).toBe(0);
    });
  });

  describe('formatPrice', () => {
    it('should format price correctly', () => {
      const result = formatPrice(0.00123456);
      expect(result).toBe('0.001235 SOL');
    });
  });

  describe('getRemainingPercent', () => {
    it('should return 100 for ACTIVE position', () => {
      const result = getRemainingPercent('ACTIVE');
      expect(result).toBe(100);
    });

    it('should return 75 for PARTIAL_EXIT_1', () => {
      const result = getRemainingPercent('PARTIAL_EXIT_1');
      expect(result).toBe(75);
    });

    it('should return 50 for PARTIAL_EXIT_2 or TRAILING', () => {
      const result1 = getRemainingPercent('PARTIAL_EXIT_2');
      const result2 = getRemainingPercent('TRAILING');
      expect(result1).toBe(50);
      expect(result2).toBe(50);
    });

    it('should return 0 for CLOSED positions', () => {
      const result = getRemainingPercent('CLOSED');
      expect(result).toBe(0);
    });
  });

  describe('isTrailingActive', () => {
    it('should return true for PARTIAL_EXIT_2', () => {
      const result = isTrailingActive('PARTIAL_EXIT_2');
      expect(result).toBe(true);
    });

    it('should return true for TRAILING', () => {
      const result = isTrailingActive('TRAILING');
      expect(result).toBe(true);
    });

    it('should return false for other states', () => {
      const result = isTrailingActive('ACTIVE');
      expect(result).toBe(false);
    });
  });

  describe('ExitStrategy - Stop Loss', () => {
    const strategy = new ExitStrategy();

    it('should trigger stop loss at -40%', () => {
      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.001,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0006; // -40%
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).not.toBeNull();
      expect(decision?.shouldExit).toBe(true);
      expect(decision?.exitType).toBe('stop_loss');
      expect(decision?.percentToSell).toBe(50);
      expect(decision?.priorityFee).toBe(EXIT_CONFIG.URGENT_FEE);
    });

    it('should not trigger stop loss above -40%', () => {
      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.001,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0007; // -30%
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).toBeNull();
    });
  });

  describe('ExitStrategy - Take Profit 1', () => {
    const strategy = new ExitStrategy();

    it('should trigger take profit 1 at +50% for ACTIVE position', () => {
      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.0015,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0015; // +50%
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).not.toBeNull();
      expect(decision?.shouldExit).toBe(true);
      expect(decision?.exitType).toBe('take_profit_1');
      expect(decision?.percentToSell).toBe(25);
    });

    it('should not trigger take profit 1 for PARTIAL_EXIT_1 state', () => {
      const position: Position = {
        id: 'test-id',
        state: 'PARTIAL_EXIT_1',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '750000', // 75% remaining
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.0015,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0015; // +50%
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).toBeNull();
    });
  });

  describe('ExitStrategy - Take Profit 2', () => {
    const strategy = new ExitStrategy();

    it('should trigger take profit 2 at +100% for PARTIAL_EXIT_1', () => {
      const position: Position = {
        id: 'test-id',
        state: 'PARTIAL_EXIT_1',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '750000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.002,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.002; // +100%
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).not.toBeNull();
      expect(decision?.shouldExit).toBe(true);
      expect(decision?.exitType).toBe('take_profit_2');
      expect(decision?.percentToSell).toBe(25);
    });
  });

  describe('ExitStrategy - Trailing Stop', () => {
    const strategy = new ExitStrategy();

    it('should trigger trailing stop at 15% below peak', () => {
      const position: Position = {
        id: 'test-id',
        state: 'TRAILING', // Already in trailing state
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '500000', // 50% remaining
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.002, // Peak at +100%
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Use price that's definitely below 15% threshold
      const currentPrice = 0.0016; // 20% below peak (0.002 * 0.8 = 0.0016)
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).not.toBeNull();
      expect(decision?.shouldExit).toBe(true);
      expect(decision?.exitType).toBe('trailing_stop');
      expect(decision?.percentToSell).toBe(50); // Sell remaining
    });

    it('should not trigger trailing stop if within threshold', () => {
      const position: Position = {
        id: 'test-id',
        state: 'PARTIAL_EXIT_2',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '500000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.003,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0027; // Only 10% below peak
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).toBeNull();
    });
  });

  describe('ExitStrategy - Max Hold Time', () => {
    const strategy = new ExitStrategy();

    it('should trigger max hold after 4 hours', () => {
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);

      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: fourHoursAgo,
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.001,
        peakTimestamp: Date.now(),
        createdAt: fourHoursAgo,
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0011; // Slight profit
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).not.toBeNull();
      expect(decision?.shouldExit).toBe(true);
      expect(decision?.exitType).toBe('max_hold');
      expect(decision?.percentToSell).toBe(100); // Sell remaining
    });

    it('should not trigger max hold before 4 hours', () => {
      const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);

      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: threeHoursAgo,
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.001,
        peakTimestamp: Date.now(),
        createdAt: threeHoursAgo,
        updatedAt: Date.now(),
      };

      const currentPrice = 0.001; // Break even
      const decision = strategy.evaluate(position, currentPrice);

      expect(decision).toBeNull();
    });
  });

  describe('ExitStrategy - Priority Order', () => {
    const strategy = new ExitStrategy();

    it('should prioritize stop loss over other conditions', () => {
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);

      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'test-token',
        entrySolSpent: '100000000',
        entryTimestamp: fourHoursAgo, // Also max hold time
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.001,
        peakTimestamp: Date.now(),
        createdAt: fourHoursAgo,
        updatedAt: Date.now(),
      };

      const currentPrice = 0.0005; // -50% (below stop loss)
      const decision = strategy.evaluate(position, currentPrice);

      // Stop loss should trigger, not max hold time
      expect(decision?.exitType).toBe('stop_loss');
    });
  });

  describe('ExitStrategy - State Transitions', () => {
    const strategy = new ExitStrategy();

    it('should transition ACTIVE to PARTIAL_EXIT_1 for take_profit_1', () => {
      const newState = strategy.getNextState('ACTIVE', 'take_profit_1');
      expect(newState).toBe('PARTIAL_EXIT_1');
    });

    it('should transition PARTIAL_EXIT_1 to PARTIAL_EXIT_2 for take_profit_2', () => {
      const newState = strategy.getNextState('PARTIAL_EXIT_1', 'take_profit_2');
      expect(newState).toBe('PARTIAL_EXIT_2');
    });

    it('should transition PARTIAL_EXIT_2 to CLOSED for trailing_stop', () => {
      const newState = strategy.getNextState('PARTIAL_EXIT_2', 'trailing_stop');
      expect(newState).toBe('CLOSED');
    });

    it('should transition to CLOSED for max_hold', () => {
      const newState1 = strategy.getNextState('ACTIVE', 'max_hold');
      const newState2 = strategy.getNextState('PARTIAL_EXIT_1', 'max_hold');
      expect(newState1).toBe('CLOSED');
      expect(newState2).toBe('CLOSED');
    });

    it('should transition to FAILED for stop_loss', () => {
      const newState = strategy.getNextState('ACTIVE', 'stop_loss');
      expect(newState).toBe('FAILED');
    });
  });

  describe('ExitStrategy - Position Status', () => {
    const strategy = new ExitStrategy();

    it('should generate position status summary', () => {
      const position: Position = {
        id: 'test-id',
        state: 'ACTIVE',
        tokenMint: 'AbCdEf123456789',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.001,
        tokensReceivedRaw: '1000000',
        tokenDecimals: 6,
        exitTimestamp: null,
        exitSolReceived: null,
        exitPricePerToken: null,
        exitReason: null,
        peakPricePerToken: 0.0015,
        peakTimestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const status = strategy.getPositionStatus(position, 0.0012);

      expect(status).toContain('AbCdEf12');
      expect(status).toContain('ACTIVE');
      expect(status).toContain('0.001000 SOL');
      expect(status).toContain('0.001200 SOL');
      expect(status).toContain('+20.00%');
      expect(status).toContain('100%');
    });
  });
});
