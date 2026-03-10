/**
 * Test token discovery system
 */

import { getTrendingPairs } from '../../src/scanner/dexscreener.js';

async function testDiscovery() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Token Discovery Test                                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const pairs = await getTrendingPairs(5);
  console.log(`Trending pairs found: ${pairs.length}\n`);

  console.log(`Found ${pairs.length} trending Solana tokens:\n`);

  for (const p of pairs.slice(0, 5)) {
    console.log(`  • ${p.symbol} (${p.name})`);
    console.log(`    Address: ${p.address.slice(0, 8)}...${p.address.slice(-6)}`);
    console.log(`    Price: $${p.priceUsd.toFixed(6)}`);
    console.log(`    Liquidity: $${(p.liquidity / 1000).toFixed(1)}K`);
    console.log(`    24h Volume: $${(p.volumeH24 / 1000).toFixed(1)}K`);
    console.log(`    1h Change: ${p.priceChangeH1?.toFixed(1) ?? 'N/A'}%`);
    console.log(`    24h Change: ${p.priceChangeH24?.toFixed(1) ?? 'N/A'}%`);
    console.log(`    Score: ${p.opportunityScore ?? 'N/A'}`);
    console.log('');
  }

  return pairs;
}

testDiscovery().catch(console.error);
