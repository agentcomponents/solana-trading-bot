/**
 * Jupiter API Integration Tests
 *
 * Tests Jupiter quote and swap API endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';

// Load environment variables
config();

describe('Jupiter API Integration Tests', () => {
  const apiKey = process.env['JUPITER_API_KEY'];
  const baseUrl = 'https://quote-api.jup.ag/v6';

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('JUPITER_API_KEY not configured');
    }
  });

  it('should have API key configured', () => {
    expect(apiKey).toBeDefined();
  });

  it('should get a SOL -> USDC quote', async () => {
    // SOL mint
    const inputMint = 'So11111111111111111111111111111111111111112';
    // USDC mint
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: '100000000', // 0.1 SOL in lamports
      slippageBps: '100', // 1%
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });

    const response = await fetch(`${baseUrl}/quote?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    expect(response.ok).toBe(true);

    const quote = await response.json() as JupiterQuoteResponse;

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

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: '100000000', // 100 USDC (6 decimals)
      slippageBps: '100' // 1%
    });

    const response = await fetch(`${baseUrl}/quote?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    expect(response.ok).toBe(true);

    const quote = await response.json() as JupiterQuoteResponse;

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

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: '100000000', // 0.1 SOL
      slippageBps: '100',
      swapMode: 'ExactIn'
    });

    const response = await fetch(`${baseUrl}/quote?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    expect(response.ok).toBe(true);

    const quote = await response.json() as JupiterQuoteResponse;

    console.log('✅ ExactIn Quote:');
    console.log('  input amount:', quote.inAmount);
    console.log('  min output:', quote.outAmount);
    console.log('  platform fee:', quote.platformFee);
  });

  it('should get quote list (multiple routes)', async () => {
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: '100000000', // 0.1 SOL
      slippageBps: '100',
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });

    const response = await fetch(`${baseUrl}/quote?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    expect(response.ok).toBe(true);

    const quote = await response.json() as JupiterQuoteResponse;

    console.log('✅ Route Plan:');
    quote.routePlan?.forEach((route, index) => {
      console.log(`  Route ${index + 1}:`);
      console.log('    swap info:', route.swapInfo);
      console.log('    percent:', route.percent);
      route.swapInfo?.ammKey && console.log('    amm:', route.swapInfo.ammKey);
    });
  });

  it('should handle invalid mint address gracefully', async () => {
    const params = new URLSearchParams({
      inputMint: 'invalid_mint_address',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '100000000'
    });

    const response = await fetch(`${baseUrl}/quote?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    // Should return error, not throw
    expect(response.ok).toBe(false);

    console.log('✅ Invalid mint handled correctly:', response.status);
  });
});

// Types based on Jupiter API response
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | {
    amount: string;
    feeBps: number;
    feeLamports: number;
  };
  priceImpactPct: string;
  routePlan: JupiterRouteStep[];
  context?: {
    slot?: number;
    timeInSeconds?: number;
  };
  targetUnit?: string;
}

interface JupiterRouteStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
    feePct?: number;
  };
  percent: number;
}
