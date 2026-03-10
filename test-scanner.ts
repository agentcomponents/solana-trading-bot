import { quickScan } from './src/scanner/scanner.ts';
import { formatScanSummary, formatScanResult } from './src/scanner/scanner.ts';

async function test() {
  console.log('Testing MINIMAL criteria - see all available tokens...\n');
  console.log('Criteria:');
  console.log('  - Price change: NO MINIMUM (see what we get)');
  console.log('  - Pair age: 15min - 24h');
  console.log('  - Liquidity: $10K minimum');
  console.log('');

  const results = await quickScan({
    maxResults: 50,
    criteria: {
      minLiquidityUsd: 10000,
      maxLiquidityUsd: 5000000,
      minVolume24h: 1000,
      // NO minPriceChange1h - see everything
      maxPairAgeHours: 24,
      minPairAgeHours: 0.25,
      // NO volume ratio or buy pressure
    },
  });

  console.log(`Found ${results.length} tokens\n`);

  // Group by 1h change to see distribution
  const groups = {
    'Negative': 0,
    '0-2%': 0,
    '2-5%': 0,
    '5-10%': 0,
    '10-25%': 0,
    '25%+': 0,
  };

  results.forEach(r => {
    if (r.priceChangeH1 < 0) groups['Negative']++;
    else if (r.priceChangeH1 < 2) groups['0-2%']++;
    else if (r.priceChangeH1 < 5) groups['2-5%']++;
    else if (r.priceChangeH1 < 10) groups['5-10%']++;
    else if (r.priceChangeH1 < 25) groups['10-25%']++;
    else groups['25%+']++;
  });

  console.log('Distribution by 1h change:');
  Object.entries(groups).forEach(([key, count]) => {
    console.log(`  ${key}: ${count} tokens`);
  });
  console.log('');

  // Show tokens in 0-5% range (early movers)
  const earlyTokens = results.filter(r => r.priceChangeH1 >= 0 && r.priceChangeH1 < 5);
  console.log(`=== EARLY TOKENS (0-5% pump) - ${earlyTokens.length} found ===\n`);

  earlyTokens.forEach((r, i) => {
    console.log(`[${i+1}] ${r.symbol} - ${r.priceChangeH1.toFixed(2)}% (1h) | ${r.pairAge.toFixed(1)}h old | $${r.liquidity.toLocaleString()} liq`);
  });

  console.log(`\n=== ALL TOKENS (top 10) ===\n`);
  results.slice(0, 10).forEach((r, i) => {
    console.log(`[${i+1}] ${r.symbol} (${r.name})`);
    console.log(`    Change 1h: ${r.priceChangeH1.toFixed(2)}% | 24h: ${r.priceChangeH24.toFixed(2)}%`);
    console.log(`    Pair Age: ${r.pairAge.toFixed(1)}h | Liquidity: $${r.liquidity.toLocaleString()}`);
    console.log('');
  });
}

test().catch(console.error);
