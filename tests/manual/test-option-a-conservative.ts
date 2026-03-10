/**
 * Option A: Conservative Rate Limiting
 *
 * Reduces limits to 50% of documented + adds delays + exponential backoff
 */

import { RateLimiter, DexScreenerRateLimiter } from '../../src/utils/rate-limiter';
import { retry } from '../../src/utils/retry';

const API_BASE = 'https://api.dexscreener.com';
const USER_AGENT = 'SolanaTradingBot/1.0';

// Conservative limits: 50% of documented
const CONSERVATIVE_LIMITS = {
  slow: 30,   // 60/min documented → 30/min
  fast: 150,  // 300/min documented → 150/min
};

// Custom rate limiter with exponential backoff on 429
class ConservativeRateLimiter extends RateLimiter {
  private readonly minDelayMs: number;

  constructor(config: { requestsPerMinute: number; minDelayMs?: number }) {
    super(config);
    this.minDelayMs = config.minDelayMs ?? 1000; // 1 sec min between requests
    this.lastRequestTime = 0;
  }

  private lastRequestTime: number = 0;

  async waitForSlot(): Promise<void> {
    // First, ensure minimum delay between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minDelayMs - timeSinceLastRequest)
      );
    }

    // Then wait for rate limit slot
    await super.waitForSlot();
    this.lastRequestTime = Date.now();
  }
}

class ConservativeDexScreenerLimiter extends DexScreenerRateLimiter {
  constructor() {
    super();
    // Override with conservative limits
    this.slow = new ConservativeRateLimiter({
      requestsPerMinute: CONSERVATIVE_LIMITS.slow,
      minDelayMs: 1000,
    });
    this.fast = new ConservativeRateLimiter({
      requestsPerMinute: CONSERVATIVE_LIMITS.fast,
      minDelayMs: 500, // Fast tier can have shorter delay
    });
  }
}

const conservativeLimiter = new ConservativeDexScreenerLimiter();

// Fetch with exponential backoff on 429
async function fetchWithBackoff(url: string, tier: 'slow' | 'fast'): Promise<Response> {
  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    await (tier === 'slow' ? conservativeLimiter.waitForSlow() : conservativeLimiter.waitForFast());

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      attempt++;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
      console.log(`  ⏳ 429 received, waiting ${backoffMs}ms... (attempt ${attempt}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return response;
  }

  throw new Error('Max retries exceeded due to rate limiting');
}

// Test: Fetch boosted tokens 5 times in a row
async function testOptionA() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Option A: Conservative Rate Limiting                    ║');
  console.log('║   Limits: 30/min slow, 150/min fast (50% of docs)        ║');
  console.log('║   + 1sec min delay between requests                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let successCount = 0;
  let fail429Count = 0;

  for (let i = 1; i <= 5; i++) {
    console.log(`Request ${i}/5...`);
    const reqStart = Date.now();

    try {
      const response = await fetchWithBackoff(
        `${API_BASE}/token-boosts/latest/v1`,
        'slow'
      );
      const data = await response.json();

      if (Array.isArray(data)) {
        const solanaCount = data.filter((b: any) => b.chainId === 'solana').length;
        console.log(`  ✓ Got ${solanaCount} Solana boosts in ${Date.now() - reqStart}ms`);
        successCount++;
      }
    } catch (error: any) {
      if (error.message.includes('429') || error.message.includes('rate limiting')) {
        console.log(`  ✗ 429 Rate Limited`);
        fail429Count++;
      } else {
        console.log(`  ✗ Error: ${error.message}`);
      }
    }

    // Small delay between test iterations
    if (i < 5) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const elapsed = Date.now() - startTime;
  const stats = conservativeLimiter.getStats();

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Results:');
  console.log(`  Success: ${successCount}/5`);
  console.log(`  Failed (429): ${fail429Count}/5`);
  console.log(`  Total time: ${elapsed}ms (${(elapsed / 5).toFixed(0)}ms avg)`);
  console.log(`  Rate limiter stats:`, stats);
  console.log('─────────────────────────────────────────────────────────────\n');

  return {
    option: 'A',
    success: successCount === 5,
    failed429: fail429Count,
    avgTimeMs: elapsed / 5,
    stats,
  };
}

export { testOptionA };
