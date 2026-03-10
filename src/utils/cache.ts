/**
 * Simple in-memory cache with TTL support
 *
 * Used to reduce API calls for data that doesn't change frequently.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  keys: string[];
}

export class TimedCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(ttlSeconds: number = 120) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Get cached data or fetch fresh data
   * @param key Cache key
   * @param fetcher Function to fetch fresh data on cache miss
   * @returns Object with data and whether it was from cache
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; cached: boolean }> {
    const entry = this.cache.get(key);

    // Check if cache exists and is fresh
    if (entry && Date.now() - entry.timestamp < this.ttlMs) {
      this.hits++;
      return { data: entry.data as T, cached: true };
    }

    // Cache miss or expired, fetch fresh data
    this.misses++;
    const data = await fetcher();
    this.set(key, data);

    return { data, cached: false };
  }

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get data from cache without fetching (returns null if not found)
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp >= this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if key exists and is fresh
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Remove if expired
    if (Date.now() - entry.timestamp >= this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    // Cleanup expired entries first
    this.cleanup();

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Get hit rate as percentage
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return Math.round((this.hits / total) * 100);
  }
}

// ============================================================================
// PRE-CONFIGURED CACHES
// ============================================================================

/**
 * Cache for DexScreener boosted tokens
 * Boosts don't change frequently, so 2-3 minute cache is appropriate
 */
export const boostsCache = new TimedCache(150); // 2.5 minutes

/**
 * Cache for token pair data
 * Price data changes more frequently, so shorter cache
 */
export const pairsCache = new TimedCache(30); // 30 seconds

/**
 * Cache for safety check results
 * Safety data doesn't change often, longer cache is fine
 */
export const safetyCache = new TimedCache(300); // 5 minutes
