/**
 * Jupiter API Integration Tests
 *
 * Tests Jupiter quote and swap API using the SDK (same as production code)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createJupiterApiClient } from '@jup-ag/api';
import { config } from 'dotenv';

// Load environment variables
config();

describe('Jupiter API Integration Tests', () => {
  // Use the same SDK as production code
  const jupiterApi = createJupiterApiClient();

  beforeAll(() => {
    // SDK doesn't require API key for basic quotes
    console.log('✅ Jupiter SDK initialized');
  });

  it('should get a SOL -> USDC quote', async () => {
    // SOL mint
    const inputMint = 'So11111111111111111111111111111111111111112';
    // USDC mint
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const quote = await jupiterApi.quoteGet({
      inputMint,
      outputMint,
      amount: 100000000, // 0.1 SOL in lamports
      slippageBps: 100, // 1%
      onlyDirectRoutes: false,
      asLegacyTransaction: false
    });

    expect(quote).toBeDefined();
    expect(quote.outAmount).toBeDefined();
    expect(quote.inAmount).toBe('100000000');

    console.log('✅ SOL -> USDC Quote:');
    console.log('  input (SOL):', quote.inAmount, 'lamports');
    console.log('  output (USDC):', quote.outAmount, 'smallest unit');
    console.log('  output (formatted):', Number(quote.outAmount) / 1_000_000, 'USDC');
    console.log('  price impact:', quote.priceImpactPct, '%');
    console.log('  route plan:', JSON.stringify(quote.routePlan, null, 2));
  });

  it('should get a USDC -> SOL quote', async () => {
    const inputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const outputMint = 'So11111111111111111111111111111111111111112'; // SOL

    const quote = await jupiterApi.quoteGet({
      inputMint,
      outputMint,
      amount: 100000000, // 100 USDC (6 decimals)
      slippageBps: 100 // 1%
    });

    expect(quote).toBeDefined();
    expect(quote.outAmount).toBeDefined();

    console.log('✅ USDC -> SOL Quote:');
    console.log('  input (USDC):', Number(quote.inAmount) / 1_000_000);
    console.log('  output (SOL):', Number(quote.outAmount) / 1_000_000_000);
    console.log('  price impact:', quote.priceImpactPct, '%');
  });

  it('should get quote with swap mode (ExactIn)', async () => {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    const quote = await jupiterApi.quoteGet({
      inputMint,
      outputMint,
      amount: 100000000, // 0.1 SOL
      slippageBps: 100,
      swapMode: 'ExactIn'
    });

    expect(quote).toBeDefined();

    console.log('✅ ExactIn Quote:');
    console.log('  input amount:', quote.inAmount);
    console.log('  min output:', quote.outAmount);
    console.log('  platform fee:', quote.platformFee);
  });

  it('should get quote list (multiple routes)', async () => {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    const quote = await jupiterApi.quoteGet({
      inputMint,
      outputMint,
      amount: 100000000, // 0.1 SOL
      slippageBps: 100,
      onlyDirectRoutes: false,
      asLegacyTransaction: false
    });

    expect(quote).toBeDefined();
    expect(quote.routePlan).toBeDefined();

    console.log('✅ Route Plan:');
    quote.routePlan?.forEach((route, index) => {
      console.log(`  Route ${index + 1}:`);
      console.log('    swap info:', route.swapInfo);
      console.log('    percent:', route.percent);
      route.swapInfo?.ammKey && console.log('    amm:', route.swapInfo.ammKey);
    });
  });

  it('should handle invalid mint address gracefully', async () => {
    let errorOccurred = false;

    try {
      await jupiterApi.quoteGet({
        inputMint: 'invalid_mint_address',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: 100000000
      });
    } catch (error) {
      errorOccurred = true;
      console.log('✅ Invalid mint handled correctly:', error instanceof Error ? error.message : error);
    }

    expect(errorOccurred).toBe(true);
  });

  it('should get quote for larger amount', async () => {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    const quote = await jupiterApi.quoteGet({
      inputMint,
      outputMint,
      amount: 1000000000, // 1 SOL
      slippageBps: 100
    });

    expect(quote).toBeDefined();
    expect(quote.outAmount).toBeDefined();

    console.log('✅ 1 SOL -> USDC Quote:');
    console.log('  input (SOL):', Number(quote.inAmount) / 1_000_000_000);
    console.log('  output (USDC):', Number(quote.outAmount) / 1_000_000);
    console.log('  price impact:', quote.priceImpactPct, '%');
  });
});
