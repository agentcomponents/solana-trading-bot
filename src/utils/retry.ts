/**
 * Retry utilities with exponential backoff
 *
 * Provides retry logic for handling transient failures in API calls
 * and RPC requests.
 */

import { sleep } from './sleep.js';
import { warn } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Retry options configuration
 */
export interface RetryOptions {
  /** Maximum number of attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay between attempts */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Add random jitter to delays */
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitter: true
};

// ============================================================================
// RETRY FUNCTIONS
// ============================================================================

/**
 * Retry an async function with exponential backoff
 *
 * Retries the function on any error. Uses exponential backoff with
 * optional jitter to prevent thundering herd problems.
 *
 * @param fn - Function to retry
 * @param options - Retry options (optional, uses defaults if not provided)
 * @returns Result of successful function call
 * @throws Last error if all attempts fail
 *
 * @example
 * ```ts
 * const result = await retry(
 *   () => fetch('https://api.example.com'),
 *   { maxAttempts: 5 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Last attempt - don't retry
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff and optional jitter
      const actualDelay = opts.jitter
        ? delay * (0.5 + Math.random())
        : delay;

      const cappedDelay = Math.min(actualDelay, opts.maxDelayMs);

      warn(
        `Retry attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. ` +
          `Retrying in ${Math.round(cappedDelay)}ms...`
      );

      await sleep(cappedDelay);

      // Increase delay for next attempt (exponential backoff)
      delay = delay * opts.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Retry only on specific errors
 *
 * Only retries if the shouldRetry predicate returns true. Other errors
 * are thrown immediately without retrying.
 *
 * @param fn - Function to retry
 * @param shouldRetry - Predicate to determine if error is retryable
 * @param options - Retry options (optional)
 * @returns Result of successful function call
 * @throws Last error if all retries fail or if error is not retryable
 *
 * @example
 * ```ts
 * await retryIf(
 *   () => fetch(url),
 *   (err) => err.message.includes('ECONNRESET'),
 *   { maxAttempts: 5 }
 * );
 * ```
 */
export async function retryIf<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!shouldRetry(lastError) || attempt === opts.maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and optional jitter
      const actualDelay = opts.jitter
        ? delay * (0.5 + Math.random())
        : delay;

      const cappedDelay = Math.min(actualDelay, opts.maxDelayMs);

      warn(
        `Retryable error on attempt ${attempt}/${opts.maxAttempts}: ${lastError.message}. ` +
          `Retrying in ${Math.round(cappedDelay)}ms...`
      );

      await sleep(cappedDelay);

      // Increase delay for next attempt
      delay = delay * opts.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Retry with custom timeout
 *
 * Combines retry logic with a timeout for each attempt.
 *
 * @param fn - Function to retry with timeout
 * @param timeoutMs - Timeout per attempt in milliseconds
 * @param options - Retry options (optional)
 * @returns Result of successful function call
 * @throws Error if timeout occurs or all attempts fail
 *
 * @example
 * ```ts
 * const result = await retryWithTimeout(
 *   () => fetch('https://api.example.com'),
 *   5000,
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retry(
    () =>
      Promise.race([
        fn(),
        sleep(timeoutMs).then(() => {
          throw new Error(`Operation timed out after ${timeoutMs}ms`);
        })
      ]),
    options
  );
}
