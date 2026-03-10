/**
 * Test token discovery system with filters applied
 */

import { quickScan } from '../../src/scanner/scanner.js';

async function testDiscovery() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Token Discovery Test (With Filters)                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Filter criteria:');
  console.log('  • Min Liquidity: $15,000');
  console.log('  • Min Volume (24h): $5,000');
  console.log('  • Min Price Change (1h): +5%');
  console.log('  • Max Pair Age: 24 hours');
  console.log('');

  const tokens = await quickScan({ limit: 10, maxResults: 10 });
  console.log(`Tokens matching criteria: ${tokens.length}\n`);

  if (tokens.length === 0) {
    console.log('No tokens match the scan criteria.');
    return [];
  }

  console.log(`Found ${tokens.length} tokens matching criteria:\n`);

  for (const t of tokens.slice(0, 10)) {
    const safeEmoji = t.safety.safe === null ? '❓' :
      t.safety.safe ? '✅' : '🚨';

    console.log(`${safeEmoji} ${t.symbol} (${t.name})`);
    console.log(`    Address: ${t.address.slice(0, 8)}...${t.address.slice(-6)}`);
    console.log(`    Price: $${t.priceUsd.toFixed(6)}`);
    console.log(`    Liquidity: $${(t.liquidity / 1000).toFixed(1)}K`);
    console.log(`    24h Volume: $${(t.volumeH24 / 1000).toFixed(1)}K`);
    console.log(`    1h Change: ${t.priceChangeH1?.toFixed(1) ?? 'N/A'}%`);
    console.log(`    24h Change: ${t.priceChangeH24?.toFixed(1) ?? 'N/A'}%`);
    console.log(`    Score: ${t.opportunityScore ?? 'N/A'}/100`);
    if (t.safety.confidence) {
      console.log(`    Safety: ${t.safety.confidence}`);
    }
    console.log('');
  }

  return tokens;
}

testDiscovery().catch(console.error);
