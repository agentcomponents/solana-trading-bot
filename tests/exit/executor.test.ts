/**
 * Exit Executor Tests
 *
 * Tests for exit execution logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import BN from 'bn.js';
import type { Position } from '../../src/db/schema';
import { executeExit } from '../../src/exit/executor';
import { EXIT_CONFIG } from '../../src/exit/config';

// Mock Jupiter client
vi.mock('../../src/jupiter/client', () => ({
  getQuote: vi.fn(async () => ({
    inAmount: '1000000',
    outAmount: '90000000', // 0.09 SOL
    priceImpactPct: '1.5',
    routePlan: [],
  })),
}));

describe('Exit Executor', () => {
  let mockPosition: Position;

  beforeEach(() => {
    mockPosition = {
      id: 'test-position-id',
      state: 'ACTIVE',
      tokenMint: 'TestTokenAbcd123456789',
      entrySolSpent: '100000000', // 0.1 SOL
      entryTimestamp: Date.now(),
      entryPricePerToken: 0.0001, // SOL per token
      tokensReceivedRaw: '1000000', // Raw from Jupiter
      tokenDecimals: 6,
      exitTimestamp: null,
      exitSolReceived: null,
      exitPricePerToken: null,
      exitReason: null,
      peakPricePerToken: 0.00012, // Peak at +20%
      peakTimestamp: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  describe('executeExit - Dry Run', () => {
    it('should execute full exit dry run', async () => {
      const result = await executeExit(mockPosition, 100, 'Test exit', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.expectedSol).toBeDefined();
      expect(result.newState).toBe('CLOSED');
      expect(result.newRemainingRaw).toBe('0'); // All sold
    });

    it('should execute partial exit dry run (25%)', async () => {
      const result = await executeExit(mockPosition, 25, 'Take profit +50%', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);

      // 25% of 1,000,000 = 250,000 sold, 750,000 remaining
      const remainingRaw = new BN(mockPosition.tokensReceivedRaw);
      const soldRaw = remainingRaw.divn(4); // 25%
      const expectedRemaining = remainingRaw.sub(soldRaw).toString();

      expect(result.newRemainingRaw).toBe(expectedRemaining);
      expect(result.newState).toBe('PARTIAL_EXIT_1');
    });

    it('should execute partial exit dry run (50% - stop loss)', async () => {
      mockPosition.state = 'PARTIAL_EXIT_1';
      mockPosition.tokensReceivedRaw = '750000'; // 75% remaining

      const result = await executeExit(mockPosition, 50, 'Stop loss hit', { dryRun: true });

      expect(result.success).toBe(true);

      // 50% of 750,000 = 375,000 sold, 375,000 remaining
      const remainingRaw = new BN(mockPosition.tokensReceivedRaw);
      const soldRaw = remainingRaw.divn(2); // 50%
      const expectedRemaining = remainingRaw.sub(soldRaw).toString();

      expect(result.newRemainingRaw).toBe(expectedRemaining);
      expect(result.newState).toBe('FAILED');
    });
  });

  describe('executeExit - Calculation Accuracy', () => {
    it('should correctly calculate 25% of raw amount', async () => {
      const result = await executeExit(mockPosition, 25, 'Test', { dryRun: true });

      const totalRaw = new BN(mockPosition.tokensReceivedRaw);
      const soldRaw = totalRaw.muln(25).divn(100);
      const expectedRemaining = totalRaw.sub(soldRaw).toString();

      expect(result.newRemainingRaw).toBe(expectedRemaining);
    });

    it('should correctly calculate 50% of raw amount', async () => {
      const result = await executeExit(mockPosition, 50, 'Test', { dryRun: true });

      const totalRaw = new BN(mockPosition.tokensReceivedRaw);
      const soldRaw = totalRaw.divn(2); // 50%
      const expectedRemaining = totalRaw.sub(soldRaw).toString();

      expect(result.newRemainingRaw).toBe(expectedRemaining);
    });

    it('should correctly calculate 100% of raw amount', async () => {
      const result = await executeExit(mockPosition, 100, 'Test', { dryRun: true });

      expect(result.newRemainingRaw).toBe('0');
    });

    it('should handle odd raw amounts correctly', async () => {
      mockPosition.tokensReceivedRaw = '1000001'; // Odd number

      const result = await executeExit(mockPosition, 25, 'Test', { dryRun: true });

      const totalRaw = new BN(mockPosition.tokensReceivedRaw);
      const soldRaw = totalRaw.muln(25).divn(100);
      const expectedRemaining = totalRaw.sub(soldRaw).toString();

      expect(result.newRemainingRaw).toBe(expectedRemaining);
    });
  });

  describe('executeExit - Large Amounts', () => {
    it('should handle large raw amounts (9 decimals)', async () => {
      mockPosition.tokensReceivedRaw = '1000000000'; // 1 billion tokens
      mockPosition.tokenDecimals = 9;

      const result = await executeExit(mockPosition, 10, 'Test', { dryRun: true });

      // Verify calculation was performed (actual value depends on Jupiter mock)
      expect(result.newRemainingRaw).toBeDefined();
      expect(result.newRemainingRaw).not.toBe(mockPosition.tokensReceivedRaw); // Should be different after selling 10%
    });
  });

  describe('executeExit - Options', () => {
    it('should use custom priority fee', async () => {
      const priorityFee = 500000;
      const result = await executeExit(
        mockPosition,
        100,
        'Test',
        { dryRun: true, priorityFee }
      );

      expect(result.success).toBe(true);
      // Priority fee is logged, not in result
    });

    it('should use custom slippage', async () => {
      const slippageBps = 300; // 3%
      const result = await executeExit(
        mockPosition,
        100,
        'Test',
        { dryRun: true, slippageBps }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('executeExit - State Transitions', () => {
    it('should transition to PARTIAL_EXIT_1 for 25% exit from ACTIVE', async () => {
      const result = await executeExit(mockPosition, 25, 'Take profit +50%', { dryRun: true });

      expect(result.newState).toBe('PARTIAL_EXIT_1');
    });

    it('should transition to PARTIAL_EXIT_2 for 25% exit from PARTIAL_EXIT_1', async () => {
      mockPosition.state = 'PARTIAL_EXIT_1';
      mockPosition.tokensReceivedRaw = '750000';

      const result = await executeExit(mockPosition, 25, 'Take profit +100%', { dryRun: true });

      expect(result.newState).toBe('PARTIAL_EXIT_2');
    });

    it('should transition to CLOSED for full exit from PARTIAL_EXIT_2', async () => {
      mockPosition.state = 'PARTIAL_EXIT_2';
      mockPosition.tokensReceivedRaw = '500000';

      const result = await executeExit(mockPosition, 50, 'Trailing stop', { dryRun: true });

      expect(result.newState).toBe('CLOSED');
    });
  });

  describe('executeExit - Error Handling', () => {
    it('should handle invalid position data gracefully', async () => {
      mockPosition.tokensReceivedRaw = 'invalid';

      // Executor catches errors and returns failure result
      const result = await executeExit(mockPosition, 100, 'Test', { dryRun: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('EXIT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(EXIT_CONFIG.STOP_LOSS_PERCENT).toBe(-40);
      expect(EXIT_CONFIG.TAKE_PROFIT_1_PERCENT).toBe(50);
      expect(EXIT_CONFIG.TAKE_PROFIT_2_PERCENT).toBe(100);
      expect(EXIT_CONFIG.TRAILING_STOP_PERCENT).toBe(15);
      expect(EXIT_CONFIG.TAKE_PROFIT_1_SELL_PERCENT).toBe(25);
      expect(EXIT_CONFIG.TAKE_PROFIT_2_SELL_PERCENT).toBe(25);
      expect(EXIT_CONFIG.STOP_LOSS_SELL_PERCENT).toBe(50);
      expect(EXIT_CONFIG.MAX_HOLD_TIME_MS).toBe(4 * 60 * 60 * 1000);
      expect(EXIT_CONFIG.PRICE_POLL_INTERVAL_MS).toBe(2000);
      expect(EXIT_CONFIG.NORMAL_SLIPPAGE_BPS).toBe(100); // 1%
      expect(EXIT_CONFIG.URGENT_SLIPPAGE_BPS).toBe(300); // 3%
      expect(EXIT_CONFIG.EMERGENCY_SLIPPAGE_BPS).toBe(500); // 5%
      expect(EXIT_CONFIG.NORMAL_FEE).toBe(100_000);
      expect(EXIT_CONFIG.URGENT_FEE).toBe(500_000);
      expect(EXIT_CONFIG.TRAILING_FEE).toBe(1_000_000);
      expect(EXIT_CONFIG.EMERGENCY_FEE).toBe(2_000_000);
    });
  });
});
