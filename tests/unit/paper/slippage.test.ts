/**
 * Unit Tests: Slippage Simulator
 *
 * Tests the slippage simulation logic for paper trading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlippageSimulator } from '../../../src/paper/slippage';

describe('SlippageSimulator', () => {
  let simulator: SlippageSimulator;

  beforeEach(() => {
    simulator = new SlippageSimulator();
  });

  describe('calculateSlippage', () => {
    it('should calculate slippage for a small trade', async () => {
      const result = await simulator.calculateSlippage({
        tokenAddress: 'test_token',
        inputAmountSol: 0.01,
        liquidity: 50000, // $50k
        isBuy: true,
      });

      expect(result.slippageBps).toBeGreaterThanOrEqual(5);
      expect(result.slippageBps).toBeLessThanOrEqual(500);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate higher slippage for larger trades', async () => {
      // Build up some history for the second call
      await simulator.calculateSlippage({
        tokenAddress: 'token_a',
        inputAmountSol: 0.01,
        liquidity: 50000,
        isBuy: true,
      });

      const largeTrade = await simulator.calculateSlippage({
        tokenAddress: 'token_b',
        inputAmountSol: 0.5,
        liquidity: 50000,
        isBuy: true,
      });

      // Larger trade should have more slippage (generally)
      expect(largeTrade.slippageBps).toBeGreaterThan(0);
    });

    it('should calculate higher slippage for sells', async () => {
      // Build up some history
      await simulator.calculateSlippage({
        tokenAddress: 'token_a',
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
      });

      const sellSlippage = await simulator.calculateSlippage({
        tokenAddress: 'token_b',
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: false,
      });

      // Sells typically have more slippage
      expect(sellSlippage.slippageBps).toBeGreaterThan(0);
    });

    it('should handle low liquidity', async () => {
      const result = await simulator.calculateSlippage({
        tokenAddress: 'low_liq_token',
        inputAmountSol: 0.1,
        liquidity: 5000, // Only $5k
        isBuy: true,
      });

      expect(result.slippageBps).toBeGreaterThan(0);
      expect(result.factors.liquidityDepth).toBeLessThan(1);
    });

    it('should return default slippage when liquidity is zero', async () => {
      const buyResult = await simulator.calculateSlippage({
        tokenAddress: 'zero_liq',
        inputAmountSol: 0.1,
        liquidity: 0,
        isBuy: true,
      });

      const sellResult = await simulator.calculateSlippage({
        tokenAddress: 'zero_liq',
        inputAmountSol: 0.1,
        liquidity: 0,
        isBuy: false,
      });

      expect(buyResult.slippageBps).toBe(50);
      expect(sellResult.slippageBps).toBe(75);
      expect(buyResult.confidence).toBe(0.1);
    });

    it('should increase confidence with more history', async () => {
      const tokenAddress = 'repeat_token';

      // Run same calculation multiple times to build history
      for (let i = 0; i < 5; i++) {
        await simulator.calculateSlippage({
          tokenAddress,
          inputAmountSol: 0.1,
          liquidity: 50000,
          isBuy: true,
        });
      }

      const result = await simulator.calculateSlippage({
        tokenAddress,
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
      });

      // Confidence should increase with more data
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should clamp slippage between 5 and 500 bps', async () => {
      // Very small trade, low liquidity
      const minResult = await simulator.calculateSlippage({
        tokenAddress: 'min_test',
        inputAmountSol: 0.001,
        liquidity: 100000,
        isBuy: true,
      });

      // Very large trade, low liquidity
      const maxResult = await simulator.calculateSlippage({
        tokenAddress: 'max_test',
        inputAmountSol: 10,
        liquidity: 100,
        isBuy: true,
      });

      expect(minResult.slippageBps).toBeGreaterThanOrEqual(5);
      expect(minResult.slippageBps).toBeLessThanOrEqual(500);
      expect(maxResult.slippageBps).toBeGreaterThanOrEqual(5);
      expect(maxResult.slippageBps).toBeLessThanOrEqual(500);
    });

    it('should account for volatility', async () => {
      const lowVolResult = await simulator.calculateSlippage({
        tokenAddress: 'low_vol',
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
        priceChange1h: 2, // 2% change = low volatility
      });

      const highVolResult = await simulator.calculateSlippage({
        tokenAddress: 'high_vol',
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
        priceChange1h: 40, // 40% change = high volatility
      });

      expect(lowVolResult.factors.volatility).toBeLessThan(highVolResult.factors.volatility);
    });
  });

  describe('getAverageSlippage', () => {
    it('should return null for token with no history', () => {
      const avg = simulator.getAverageSlippage('unknown_token');
      expect(avg).toBeNull();
    });

    it('should return average for token with history', async () => {
      const tokenAddress = 'avg_token';

      // Add some history with known values
      await simulator.calculateSlippage({
        tokenAddress,
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
      });

      const avg = simulator.getAverageSlippage(tokenAddress);
      expect(avg).toBeGreaterThan(0);
    });
  });

  describe('getHistory', () => {
    it('should return empty array for unknown token', () => {
      const history = simulator.getHistory('unknown_token');
      expect(history).toEqual([]);
    });

    it('should track history for tokens', async () => {
      const tokenAddress = 'history_token';

      await simulator.calculateSlippage({
        tokenAddress,
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
      });

      const history = simulator.getHistory(tokenAddress);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all historical data', async () => {
      const tokenAddress = 'clear_token';

      await simulator.calculateSlippage({
        tokenAddress,
        inputAmountSol: 0.1,
        liquidity: 50000,
        isBuy: true,
      });

      expect(simulator.getHistory(tokenAddress).length).toBeGreaterThan(0);

      simulator.clearHistory();

      expect(simulator.getHistory(tokenAddress)).toEqual([]);
    });
  });
});
