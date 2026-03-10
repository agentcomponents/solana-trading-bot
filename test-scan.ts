import { quickScan } from './src/scanner/scanner';

async function test() {
  const results = await quickScan({ maxResults: 10 });
  console.log('Found', results.length, 'tokens');
  results.slice(0, 5).forEach(r => {
    console.log(`${r.symbol}: score=${r.opportunityScore}, liq=$${r.liquidity}, vol=$${r.volumeH24}, chg=${r.priceChangeH1}%`);
  });
}

test();
