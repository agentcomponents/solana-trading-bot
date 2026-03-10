/**
 * Option B: Cache Boosted Tokens
 *
 * Cache /token-boosts/latest/v1 results for 2-3 minutes
 * Boosts don't change that frequently, so this reduces API calls significantly
 */

import { dexScreenerLimiter } from '../../src/utils/rate-limiter';

const API_BASE = 'https://api.dexscreener.com';
const USER_AGENT = 'SolanaTradingBot/1.0';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class BoostsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private ttlMs: number;

  constructor(ttlMinutes: number = 2) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; cached: boolean }> {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      const age = ((Date.now() - cached.timestamp) / 1000).toFixed(0);
      return { data: cached.data as T, cached: true };
    }

    // Cache miss or expired, fetch fresh data
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });

    return { data, cached: false };
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

const boostsCache = new BoostsCache(2); // 2 minute TTL

async function fetchBoostedTokens(): Promise<any[]> {
  await dexScreenerLimiter.waitForSlow();

  const response = await fetch(`${API_BASE}/token-boosts/latest/v1`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json();
}

// Test: Fetch boosts 5 times, should only hit API once (rest from cache)
async function testOptionB() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Option B: Cache Boosted Tokens                           ║');
  console.log('║   Cache TTL: 2 minutes                                      ║');
  console.log('║   Expected: 1 API call, 4 cache hits                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let apiCallCount = 0;
  let cacheHitCount = 0;
  const results: any[] = [];

  for (let i = 1; i <= 5; i++) {
    console.log(`Request ${i}/5...`);
    const reqStart = Date.now();

    try {
      const { data, cached } = await boostsCache.getOrFetch(
        'boosts:latest',
        fetchBoostedTokens
      );

      if (cached) {
        cacheHitCount++;
        console.log(`  ✓ Cache HIT (${Array.isArray(data) ? data.length : 0} tokens) in ${Date.now() - reqStart}ms`);
      } else {
        apiCallCount++;
        const solanaCount = Array.isArray(data)
          ? data.filter((b: any) => b.chainId === 'solana').length
          : 0;
        console.log(`  ✓ API CALL (${solanaCount} Solana boosts) in ${Date.now() - reqStart}ms`);
      }

      results.push(data);
    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
    }

    // Small delay between iterations
    if (i < 5) await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const elapsed = Date.now() - startTime;
  const stats = dexScreenerLimiter.getStats();

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Results:');
  console.log(`  API calls: ${apiCallCount}/5`);
  console.log(`  Cache hits: ${cacheHitCount}/5`);
  console.log(`  Total time: ${elapsed}ms (${(elapsed / 5).toFixed(0)}ms avg)`);
  console.log(`  Cache stats:`, boostsCache.getStats());
  console.log(`  Rate limiter stats:`, stats);
  console.log('─────────────────────────────────────────────────────────────\n');

  return {
    option: 'B',
    success: true,
    apiCallCount,
    cacheHitCount,
    avgTimeMs: elapsed / 5,
    stats,
  };
}

export { testOptionB };
