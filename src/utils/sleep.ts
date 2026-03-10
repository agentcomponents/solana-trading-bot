/**
 * Async sleep utilities
 *
 * Provides Promise-based delay functions for async operations.
 * Used for rate limiting, retries, and polling.
 */

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep (must be non-negative)
 * @returns Promise that resolves after ms milliseconds
 * @throws {Error} If ms is negative
 *
 * @example
 * ```ts
 * // Sleep for 1 second
 * await sleep(1000);
 *
 * // Sleep for 5 seconds
 * await sleep(5000);
 * ```
 */
export function sleep(ms: number): Promise<void> {
  if (ms < 0) {
    throw new Error(`Sleep duration cannot be negative: ${ms}`);
  }

  if (!Number.isFinite(ms)) {
    throw new Error(`Sleep duration must be finite: ${ms}`);
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep until a specific timestamp
 *
 * If the timestamp is in the past, resolves immediately.
 *
 * @param timestamp - Unix timestamp (milliseconds since epoch) to sleep until
 * @returns Promise that resolves at or after the timestamp
 *
 * @example
 * ```ts
 * // Sleep until next minute
 * const nextMinute = Math.ceil(Date.now() / 60000) * 60000;
 * await sleepUntil(nextMinute);
 * ```
 */
export function sleepUntil(timestamp: number): Promise<void> {
  const now = Date.now();
  const delay = timestamp - now;

  if (delay <= 0) {
    return Promise.resolve();
  }

  return sleep(delay);
}
