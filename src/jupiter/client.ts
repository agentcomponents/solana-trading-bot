/**
 * Jupiter API Client
 *
 * Handles Jupiter quote and swap operations using the @jup-ag/api package.
 */

import {
  createJupiterApiClient,
  QuoteGetRequest,
  QuoteResponse,
  SwapPostRequest
} from '@jup-ag/api';
import { logger } from '../utils/logger';

// ============================================================================
// CONFIG
// ============================================================================

// Create Jupiter API client
const jupiterApi = createJupiterApiClient({
  // Default base URL is already set to https://quote-api.jup.ag/v6
});

// ============================================================================
// TYPES
// ============================================================================

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string | number; // Amount in smallest unit (lamports for SOL) - SDK accepts number
  slippageBps?: number;
  swapMode?: 'ExactIn' | 'ExactOut';
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
}

export type JupiterQuoteResponse = QuoteResponse;

export interface JupiterSwapParams {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFeeLamports?: number;
  // For more control over priority fees
  priorityLevel?: 'veryHigh' | 'high' | 'medium' | 'low' | 'veryLow';
  maxPriorityFeeLamports?: number;
}

export interface JupiterSwapResult {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
}

// ============================================================================
// CLIENT
// ============================================================================

/**
 * Get a quote from Jupiter
 */
export async function getQuote(params: JupiterQuoteParams): Promise<QuoteResponse> {
  logger.debug(
    { inputMint: params.inputMint, outputMint: params.outputMint, amount: params.amount },
    'Fetching Jupiter quote'
  );

  try {
    const requestParams = {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps ?? 100,
      swapMode: params.swapMode ?? 'ExactIn',
      onlyDirectRoutes: params.onlyDirectRoutes ?? false,
      asLegacyTransaction: params.asLegacyTransaction ?? false
    } as QuoteGetRequest;

    const quote = await jupiterApi.quoteGet(requestParams);

    logger.debug(
      {
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      },
      'Jupiter quote received'
    );

    return quote;
  } catch (error) {
    logger.error({ error }, 'Jupiter quote request failed');
    throw new Error(`Jupiter quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a quote with retries
 */
export async function getQuoteWithRetry(
  params: JupiterQuoteParams,
  maxAttempts = 3,
  delayMs = 1000
): Promise<QuoteResponse> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getQuote(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        { attempt, maxAttempts, error: lastError.message },
        'Quote request failed, retrying'
      );

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError ?? new Error('Quote request failed after retries');
}

/**
 * Prepare a swap transaction (doesn't execute)
 */
export async function prepareSwap(params: JupiterSwapParams): Promise<JupiterSwapResult> {
  logger.debug(
    { outputMint: params.quoteResponse.outputMint, outAmount: params.quoteResponse.outAmount },
    'Preparing Jupiter swap'
  );

  try {
    // Build prioritization fee if specified
    let prioritizationFeeLamports = undefined;

    if (params.priorityLevel) {
      prioritizationFeeLamports = {
        priorityLevelWithMaxLamports: {
          priorityLevel: params.priorityLevel,
          maxLamports: params.maxPriorityFeeLamports ?? 1000000, // Default 0.001 SOL
          global: false
        }
      };
    }

    const requestParams: SwapPostRequest = {
      swapRequest: {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
        dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
        ...prioritizationFeeLamports
      }
    };

    const response = await jupiterApi.swapPost(requestParams);

    logger.info(
      { lastValidBlockHeight: response.lastValidBlockHeight },
      'Jupiter swap transaction prepared'
    );

    return {
      swapTransaction: response.swapTransaction,
      lastValidBlockHeight: response.lastValidBlockHeight
    };
  } catch (error) {
    logger.error({ error }, 'Jupiter swap preparation failed');
    throw new Error(`Jupiter swap preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate price impact percentage
 */
export function getPriceImpact(quote: QuoteResponse): number {
  return parseFloat(quote.priceImpactPct ?? '0');
}

/**
 * Calculate expected output amount (in human-readable format)
 */
export function getExpectedOutput(quote: QuoteResponse, outputDecimals: number): number {
  return parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);
}

/**
 * Calculate minimum output amount (with slippage)
 */
export function getMinOutput(quote: QuoteResponse, outputDecimals: number): number {
  return parseFloat(quote.otherAmountThreshold) / Math.pow(10, outputDecimals);
}

/**
 * Get route info for logging
 */
export function getRouteSummary(quote: QuoteResponse): string {
  const steps = quote.routePlan?.length ?? 0;
  const labels = quote.routePlan?.map(r => r.swapInfo.label).join(' -> ') ?? 'Unknown';
  return `${steps} step${steps !== 1 ? 's' : ''}: ${labels}`;
}

/**
 * Get all route steps
 */
export function getRouteSteps(quote: QuoteResponse) {
  return quote.routePlan ?? [];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Solana mint addresses
 */
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

/**
 * Common slippage values in basis points
 */
export const SLIPPAGE = {
  ONE_PERCENT: 100,    // 1%
  TWO_PERCENT: 200,    // 2%
  THREE_PERCENT: 300,  // 3%
  FIVE_PERCENT: 500    // 5%
} as const;
