/**
 * Rate Limiter Utility
 *
 * Simple token bucket rate limiter for API calls.
 */

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillMs: number;

  /**
   * Create a rate limiter
   * @param requestsPerSecond Maximum requests per second
   * @param burstSize Maximum burst size (default: same as requestsPerSecond)
   */
  constructor(requestsPerSecond: number, burstSize?: number) {
    this.maxTokens = burstSize ?? requestsPerSecond;
    this.tokens = this.maxTokens;
    this.refillMs = 1000 / requestsPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a token is available
   * @returns Promise that resolves when a token is acquired
   */
  async waitForToken(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Calculate wait time
    const waitMs = this.refillMs;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    
    return this.waitForToken();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed / this.refillMs;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Simple in-memory cache with TTL
 */
export class Cache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffFactor = 2,
    shouldRetry = (error) => {
      const msg = error.message.toLowerCase();
      return msg.includes('429') || msg.includes('rate') || msg.includes('limit');
    },
  } = options;

  let lastError: Error | undefined;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
    }
  }

  throw lastError;
}
