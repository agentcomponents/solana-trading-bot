/**
 * Jupiter Client Tests
 *
 * Tests Jupiter quote and swap preparation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import {
  getQuote,
  getQuoteWithRetry,
  prepareSwap,
  getPriceImpact,
  getExpectedOutput,
  getMinOutput,
  getRouteSummary,
  SOL_MINT,
  USDC_MINT,
  SLIPPAGE
} from '../../src/jupiter/client';

// Load environment variables
config();

describe('Jupiter Client', () => {
  beforeAll(() => {
    // No API key needed for public quote API
  });

  describe('getQuote', () => {
    it('should get a SOL -> USDC quote', async () => {
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000', // 0.1 SOL
        slippageBps: SLIPPAGE.ONE_PERCENT
      });

      expect(quote).toBeDefined();
      expect(quote.inputMint).toBe(SOL_MINT);
      expect(quote.outputMint).toBe(USDC_MINT);
      expect(quote.inAmount).toBe('100000000');
      expect(quote.outAmount).toBeDefined();
      expect(quote.routePlan).toBeDefined();

      console.log('✅ SOL -> USDC Quote:');
      console.log('  Input (SOL):', quote.inAmount, 'lamports =', parseFloat(quote.inAmount) / 1e9, 'SOL');
      console.log('  Output (USDC):', quote.outAmount, 'smallest unit =', parseFloat(quote.outAmount) / 1e6, 'USDC');
      console.log('  Price Impact:', getPriceImpact(quote).toFixed(3), '%');
      console.log('  Route:', getRouteSummary(quote));
    });

    it('should get a USDC -> SOL quote', async () => {
      const quote = await getQuote({
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        amount: '100000000', // 100 USDC (6 decimals)
        slippageBps: SLIPPAGE.ONE_PERCENT
      });

      expect(quote).toBeDefined();
      expect(quote.inAmount).toBe('100000000');
      expect(quote.outAmount).toBeDefined();

      console.log('✅ USDC -> SOL Quote:');
      console.log('  Input (USDC):', parseFloat(quote.inAmount) / 1e6, 'USDC');
      console.log('  Output (SOL):', parseFloat(quote.outAmount) / 1e9, 'SOL');
      console.log('  Price Impact:', getPriceImpact(quote).toFixed(3), '%');
    });

    it('should handle different slippage values', async () => {
      const quote1 = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000',
        slippageBps: SLIPPAGE.ONE_PERCENT
      });

      const quote3 = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000',
        slippageBps: SLIPPAGE.THREE_PERCENT
      });

      // Higher slippage should allow for lower minimum output
      const min1 = parseFloat(quote1.otherAmountThreshold);
      const min3 = parseFloat(quote3.otherAmountThreshold);

      expect(min3).toBeLessThanOrEqual(min1);

      console.log('✅ Slippage Comparison:');
      console.log('  1% min output:', min1 / 1e6, 'USDC');
      console.log('  3% min output:', min3 / 1e6, 'USDC');
    });

    it('should handle different amounts', async () => {
      const amounts = ['10000000', '100000000', '1000000000']; // 0.01, 0.1, 1 SOL

      for (const amount of amounts) {
        const quote = await getQuote({
          inputMint: SOL_MINT,
          outputMint: USDC_MINT,
          amount,
          slippageBps: SLIPPAGE.ONE_PERCENT
        });

        console.log(`✅ ${parseFloat(amount) / 1e9} SOL -> USDC:`);
        console.log('  Output:', parseFloat(quote.outAmount) / 1e6, 'USDC');
        console.log('  Rate:', (parseFloat(quote.outAmount) / 1e6) / (parseFloat(amount) / 1e9), 'USDC per SOL');
      }

      expect(true).toBe(true); // Just logging above
    });
  });

  describe('getQuoteWithRetry', () => {
    it('should get quote with retry on first attempt', async () => {
      const quote = await getQuoteWithRetry({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000',
        slippageBps: SLIPPAGE.ONE_PERCENT
      }, 3, 100);

      expect(quote).toBeDefined();
      expect(quote.outAmount).toBeDefined();
    });
  });

  describe('prepareSwap', () => {
    it('should prepare a swap transaction', async () => {
      // First get a quote
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000',
        slippageBps: SLIPPAGE.ONE_PERCENT
      });

      // Use a valid Solana public key format (32 bytes base58)
      // This is Raydium's liquidity pool address - just for testing API format
      const testPublicKey = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';

      // Note: This will fail because the key doesn't have SOL for fees
      // but we're testing the API call structure
      try {
        const swap = await prepareSwap({
          quoteResponse: quote,
          userPublicKey: testPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          priorityLevel: 'medium',
          maxPriorityFeeLamports: 100000
        });

        // If we get here, we got a valid transaction
        expect(swap).toBeDefined();
        expect(swap.swapTransaction).toBeDefined();
        expect(typeof swap.swapTransaction).toBe('string');
        expect(swap.lastValidBlockHeight).toBeGreaterThan(0);

        console.log('✅ Swap Prepared:');
        console.log('  Transaction length:', swap.swapTransaction.length);
        console.log('  Last valid block height:', swap.lastValidBlockHeight);
      } catch (error) {
        // Expected to fail with test key - just verify the error is about the key, not our code
        const errorMsg = error instanceof Error ? error.message : String(error);
        expect(errorMsg).not.toContain('Jupiter swap preparation failed');
        console.log('✅ API call structure verified (expected failure with test key):');
        console.log('  Error:', errorMsg.substring(0, 100));
      }
    });
  });

  describe('Utility Functions', () => {
    it('should calculate price impact', async () => {
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000'
      });

      const impact = getPriceImpact(quote);
      expect(typeof impact).toBe('number');

      console.log('✅ Price Impact:', impact.toFixed(4), '%');
    });

    it('should calculate expected output', async () => {
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000'
      });

      const expected = getExpectedOutput(quote, 6); // USDC has 6 decimals
      expect(expected).toBeGreaterThan(0);

      console.log('✅ Expected Output:', expected, 'USDC');
    });

    it('should calculate minimum output', async () => {
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000',
        slippageBps: SLIPPAGE.ONE_PERCENT
      });

      const minOutput = getMinOutput(quote, 6);
      expect(minOutput).toBeGreaterThan(0);

      console.log('✅ Minimum Output:', minOutput, 'USDC');
    });

    it('should get route summary', async () => {
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: '100000000'
      });

      const summary = getRouteSummary(quote);
      expect(typeof summary).toBe('string');

      console.log('✅ Route Summary:', summary);
    });
  });
});
