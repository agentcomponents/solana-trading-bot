/**
 * Rate Limit Solution Comparison
 *
 * Tests all 3 options side-by-side to determine the best approach
 */

import { testOptionA } from './test-option-a-conservative.js';
import { testOptionB } from './test-option-b-cache.js';
import { testOptionC } from './test-option-c-websocket.js';

interface TestResult {
  option: string;
  success: boolean;
  messageCount?: number;
  apiCallCount?: number;
  cacheHitCount?: number;
  failed429?: number;
  avgTimeMs: number;
  solanaCount?: number;
  stats?: any;
  error?: string;
}

async function runComparison() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   DEXSCREENER RATE LIMIT SOLUTION COMPARISON                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const results: TestResult[] = [];

  // Test Option A
  try {
    console.log('\n🔵 Testing Option A (Conservative Rate Limiting)...\n');
    const resultA = await testOptionA() as TestResult;
    results.push(resultA);
    await sleep(30000); // Longer cooldown to let rate limit reset
  } catch (error: any) {
    results.push({ option: 'A', success: false, avgTimeMs: 0, error: error.message });
  }

  // Test Option B
  try {
    console.log('\n🟢 Testing Option B (Cache)...\n');
    const resultB = await testOptionB() as TestResult;
    results.push(resultB);
    await sleep(10000);
  } catch (error: any) {
    results.push({ option: 'B', success: false, avgTimeMs: 0, error: error.message });
  }

  // Test Option C
  try {
    console.log('\n🟡 Testing Option C (WebSocket)...\n');
    const resultC = await testOptionC() as TestResult;
    results.push(resultC);
  } catch (error: any) {
    results.push({ option: 'C', success: false, avgTimeMs: 0, error: error.message });
  }

  // Print comparison table
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   COMPARISON RESULTS                                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('┌──────────────┬──────────┬─────────────┬────────────┬────────────┐');
  console.log('│ Option       │ Status   │ API Calls   │ Avg Time   │ Notes      │');
  console.log('├──────────────┼──────────┼─────────────┼────────────┼────────────┤');

  for (const r of results) {
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    const apiCalls = r.apiCallCount !== undefined
      ? r.apiCallCount.toString()
      : r.messageCount !== undefined
      ? 'N/A (WS)'
      : '5';
    const avgTime = r.avgTimeMs.toFixed(0) + 'ms';
    let notes = '';

    if (r.option === 'A') {
      notes = r.failed429 ? `${r.failed429}x 429` : 'No 429s';
    } else if (r.option === 'B') {
      notes = r.cacheHitCount ? `${r.cacheHitCount} cache hits` : '';
    } else if (r.option === 'C') {
      notes = r.solanaCount ? `${r.solanaCount} boosts` : 'Real-time';
    }

    console.log(`│ ${r.option.padEnd(12)} │ ${status.padStart(8)} │ ${apiCalls.padStart(11)} │ ${avgTime.padStart(10)} │ ${notes.padEnd(10)} │`);
  }

  console.log('└──────────────┴──────────┴─────────────┴────────────┴────────────┘\n');

  // Recommendations
  console.log('📊 RECOMMENDATION:\n');

  const allSuccess = results.every((r) => r.success);
  const optionA = results.find((r) => r.option === 'A');
  const optionB = results.find((r) => r.option === 'B');
  const optionC = results.find((r) => r.option === 'C');

  if (optionC?.success) {
    console.log('  🥇 Option C (WebSocket) is BEST for production:');
    console.log('     • No rate limiting concerns');
    console.log('     • Real-time updates');
    console.log('     • Lowest latency');
  } else if (optionB?.success) {
    console.log('  🥈 Option B (Cache) is great for efficiency:');
    console.log('     • Reduces API calls by ~80%');
    console.log('     • Simple to implement');
    console.log('     • Faster response times');
  } else if (optionA?.success && !(optionA as any).failed429) {
    console.log('  🥉 Option A (Conservative) works reliably:');
    console.log('     • No 429 errors');
    console.log('     • Conservative limits');
  } else {
    console.log('  ⚠️  All options had issues. Consider:');
    console.log('     • Combining A + B (cache + conservative limits)');
    console.log('     • Using a paid DexScreener API key');
  }

  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runComparison().catch(console.error);
