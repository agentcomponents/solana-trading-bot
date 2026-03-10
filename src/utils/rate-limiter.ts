/**
 * Sliding Window Rate Limiter
 *
 * Tracks API requests within a sliding time window to enforce rate limits.
 */

export interface RateLimiterConfig {
  /** Requests per minute allowed */
  requestsPerMinute: number;
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
}

export class RateLimiter {
  private requests: number[] = [];
  private readonly requestsPerMinute: number;
  private readonly windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.requestsPerMinute = config.requestsPerMinute;
    this.windowMs = config.windowMs ?? 60000;
  }

  /**
   * Check if a request would exceed the rate limit
   * @returns true if request is allowed, false if rate limited
   */
  async acquire(): Promise<boolean> {
    const now = Date.now();

    // Remove requests outside the current window
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // Check if we can make a request
    if (this.requests.length < this.requestsPerMinute) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Wait until a request slot is available
   * @returns true when request is allowed
   */
  async waitForSlot(): Promise<void> {
    while (!(await this.acquire())) {
      // Calculate wait time until oldest request expires
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.windowMs - Date.now() + 100;

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Get current usage statistics
   */
  getStats(): { used: number; limit: number; remaining: number } {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    return {
      used: this.requests.length,
      limit: this.requestsPerMinute,
      remaining: this.requestsPerMinute - this.requests.length,
    };
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.requests = [];
  }
}

/**
 * Two-tier rate limiter for DexScreener API
 *
 * Using CONSERVATIVE limits (50% of documented) to avoid 429s:
 * - Slow tier: 30 req/min (documented: 60) for boosts, profiles
 * - Fast tier: 150 req/min (documented: 300) for search, pairs, tokens
 */
export class DexScreenerRateLimiter {
  readonly slow: RateLimiter;
  readonly fast: RateLimiter;

  constructor() {
    this.slow = new RateLimiter({ requestsPerMinute: 30 });
    this.fast = new RateLimiter({ requestsPerMinute: 150 });
  }

  /**
   * Wait for a slow-tier slot (boosts, profiles)
   */
  async waitForSlow(): Promise<void> {
    await this.slow.waitForSlot();
  }

  /**
   * Wait for a fast-tier slot (search, pairs, tokens)
   */
  async waitForFast(): Promise<void> {
    await this.fast.waitForSlot();
  }

  /**
   * Get stats for both tiers
   */
  getStats(): {
    slow: ReturnType<RateLimiter['getStats']>;
    fast: ReturnType<RateLimiter['getStats']>;
  } {
    return {
      slow: this.slow.getStats(),
      fast: this.fast.getStats(),
    };
  }
}

// Singleton instance
export const dexScreenerLimiter = new DexScreenerRateLimiter();
