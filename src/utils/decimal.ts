/**
 * Decimal conversion utilities
 *
 * CRITICAL: This module handles conversion between human-readable amounts
 * and raw token amounts used by Solana and Jupiter.
 *
 * See design/02-decimal-handling.md for detailed explanation of why this
 * is critical and the correct patterns to follow.
 *
 * @example
 * ```ts
 * // At entry: Store raw amount from Jupiter
 * const position = {
 *   tokensReceivedRaw: quote.outAmount,  // Store raw!
 *   tokenDecimals: 9
 * }
 *
 * // At exit: Use stored raw directly (NO conversion!)
 * await jupiter.swap({
 *   amount: new BN(position.tokensReceivedRaw)  // Use raw directly
 * })
 * ```
 */

import BN from 'bn.js';

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert human-readable amount to raw token amount
 *
 * Multiplies the amount by 10^decimals to get the raw amount used on-chain.
 * Uses Math.floor() to truncate excess decimals (does NOT round).
 *
 * @param amount - Human-readable amount (e.g., 1.5 for 1.5 USDC)
 * @param decimals - Token decimals (e.g., 6 for USDC, 9 for SOL)
 * @returns Raw amount as BN
 * @throws {Error} If amount is negative
 * @throws {Error} If decimals is not 0-9
 *
 * @example
 * ```ts
 * humanToRaw(100.5, 6) // Returns BN('100500000') for USDC
 * humanToRaw(0.1, 9)    // Returns BN('100000000') for SOL
 * humanToRaw(1, 0)      // Returns BN('1') for whole tokens
 * ```
 */
export function humanToRaw(amount: number, decimals: number): BN {
  // Validate inputs
  if (isNaN(amount) || !isFinite(amount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  if (amount < 0) {
    throw new Error(`Amount cannot be negative: ${amount}`);
  }

  if (decimals < 0 || decimals > 9) {
    throw new Error(`Invalid decimals: ${decimals}. Must be 0-9.`);
  }

  // Use string-based calculation to avoid floating point precision issues
  // This is more accurate than Math.floor(amount * 10^decimals) for large numbers
  const amountStr = amount.toFixed(decimals + 2); // Add extra precision

  // Split on decimal point
  const parts = amountStr.split('.');
  const integerPart = parts[0];
  const fractionalPart = parts[1] ?? '';

  // Pad or truncate fractional part to exact decimals
  const exactFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);

  // Combine integer and fractional parts as string
  const combinedStr = integerPart + exactFractional;

  // Remove leading zeros but keep at least one digit
  const rawStr = combinedStr.replace(/^0+(\d)/, '$1');

  return new BN(rawStr || '0');
}

/**
 * Convert raw token amount to human-readable amount
 *
 * Divides the raw amount by 10^decimals to get human-readable amount.
 *
 * @param rawAmount - Raw amount from chain/Jupiter (BN, string, or number)
 * @param decimals - Token decimals (e.g., 6 for USDC, 9 for SOL)
 * @returns Human-readable amount
 * @throws {Error} If decimals is not 0-9
 *
 * @example
 * ```ts
 * rawToHuman('100500000', 6) // Returns 100.5 for USDC
 * rawToHuman('100000000', 9)  // Returns 0.1 for SOL
 * rawToHuman(BN('12345'), 2)  // Returns 123.45
 * ```
 */
export function rawToHuman(
  rawAmount: BN | string | number,
  decimals: number
): number {
  // Validate decimals
  if (decimals < 0 || decimals > 9) {
    throw new Error(`Invalid decimals: ${decimals}. Must be 0-9.`);
  }

  // Convert input to BN
  const raw =
    typeof rawAmount === 'string'
      ? new BN(rawAmount)
      : typeof rawAmount === 'number'
        ? new BN(rawAmount)
        : rawAmount;

  // Calculate divisor: 10^decimals
  const divisor = new BN(10).pow(new BN(decimals));

  // Integer division
  const integerPart = raw.div(divisor).toNumber();

  // Modulo for fractional part
  const fractionalRaw = raw.mod(divisor).toNumber();
  const fractionalPart = fractionalRaw / Math.pow(10, decimals);

  return integerPart + fractionalPart;
}

/**
 * Calculate position value in SOL
 *
 * Uses stored raw amount + current price to determine current position value.
 *
 * @param rawTokenAmount - Raw token amount
 * @param tokenDecimals - Token decimals
 * @param currentPricePerToken - Current price in SOL per token
 * @returns Position value in SOL
 *
 * @example
 * ```ts
 * // 1,000,000 tokens (6 decimals) at 0.00001 SOL per token
 * calculatePositionValue(
 *   humanToRaw(1000000, 6),
 *   6,
 *   0.00001
 * ) // Returns 10 SOL
 * ```
 */
export function calculatePositionValue(
  rawTokenAmount: BN,
  tokenDecimals: number,
  currentPricePerToken: number
): number {
  const tokenCount = rawToHuman(rawTokenAmount, tokenDecimals);
  return tokenCount * currentPricePerToken;
}

/**
 * Calculate P&L percentage
 *
 * Returns the profit/loss as a percentage of the entry amount.
 * Positive values = profit, negative values = loss.
 *
 * @param rawTokenAmount - Raw token amount held
 * @param tokenDecimals - Token decimals
 * @param currentPricePerToken - Current price in SOL per token
 * @param entrySolSpent - SOL spent at entry
 * @returns P&L percentage (e.g., 50 = +50%, -40 = -40%)
 *
 * @example
 * ```ts
 * // Entry: 0.1 SOL, Current value: 0.15 SOL
 * calculatePnLPercentage(
 *   humanToRaw(10000, 6),  // 10,000 tokens
 *   6,
 *   0.000015,             // Current price
 *   0.1                   // Entry SOL
 * ) // Returns 50 (50% profit)
 * ```
 */
export function calculatePnLPercentage(
  rawTokenAmount: BN,
  tokenDecimals: number,
  currentPricePerToken: number,
  entrySolSpent: number
): number {
  const currentValue = calculatePositionValue(
    rawTokenAmount,
    tokenDecimals,
    currentPricePerToken
  );

  if (entrySolSpent === 0) {
    throw new Error('Entry SOL spent cannot be zero');
  }

  return ((currentValue - entrySolSpent) / entrySolSpent) * 100;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate raw amount for partial exit
 *
 * When selling a percentage of a position, use this to calculate the
 * exact raw amount to sell.
 *
 * @param totalRawAmount - Total raw amount held
 * @param percentageToSell - Percentage to sell (0-100)
 * @returns Raw amount to sell
 *
 * @example
 * ```ts
 * // Sell 25% of position
 * const sellAmount = calculatePartialExitRaw(
 *   position.tokensReceivedRaw,
 *   25
 * )
 * await jupiter.swap({ amount: sellAmount })
 * ```
 */
export function calculatePartialExitRaw(
  totalRawAmount: BN | string,
  percentageToSell: number
): BN {
  if (percentageToSell < 0 || percentageToSell > 100) {
    throw new Error(`Percentage must be 0-100: ${percentageToSell}`);
  }

  const totalRaw =
    typeof totalRawAmount === 'string'
      ? new BN(totalRawAmount)
      : totalRawAmount;

  // Validate: total amount cannot be negative
  if (totalRaw.isNeg()) {
    throw new Error('Total raw amount cannot be negative');
  }

  // Calculate: (totalRaw * percentage) / 100
  const percentageRaw = new BN(percentageToSell * 100); // Use basis points
  const divisor = new BN(10000);

  return totalRaw.mul(percentageRaw).div(divisor);
}

/**
 * Format amount for display
 *
 * Formats a raw amount with appropriate decimal places based on token decimals.
 *
 * @param rawAmount - Raw amount
 * @param decimals - Token decimals
 * @param maxDecimals - Maximum decimals to display (default: 6)
 * @returns Formatted string
 *
 * @example
 * ```ts
 * formatAmount('1234567890', 6)  // "1,234.56789"
 * formatAmount('100000000', 9)    // "0.1"
 * ```
 */
export function formatAmount(
  rawAmount: BN | string,
  decimals: number,
  maxDecimals: number = 6
): string {
  const human = rawToHuman(rawAmount, decimals);
  return human.toFixed(Math.min(decimals, maxDecimals));
}
