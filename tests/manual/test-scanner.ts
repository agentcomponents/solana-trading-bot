// test-scanner.ts - Investigation: why tokens are being filtered out
/**
 * This script scans Dexscreener trending tokens and logs the rejection reasons.
 * 
 * Purpose: Investigate why filters might be too tight
 * and what adjustments could improve win rate.
 */

import { config } from 'dotenv';
config();

import { logger } from '../utils/logger';
import { DexscreenerClient } from '../scanner/dexscreener';
import type { TokenSearchResult } from '../scanner/dexscreener';

const SCAN_CRITERIA = {
  minLiquidityUsd: number;
  maxLiquidityUsd: number;
  minVolume24h: number;
  minPriceChange1h: number;
  maxPairAgeHours: number;
  minPairAgeHours: number;
  minVolumeRatio: number;
  minBuyPressure: number;
};

async function testScanner(): Promise<void> {
  const criteria: ScanCriteria = {
    minLiquidityUsd: config.MIN_LIQUIDITY_USD,
    maxLiquidityUsd: config.MAX_LIQUIDITY_USD,
    minVolume24h: config.MIN_VOLUME_24H,
    minPriceChange1h: config.MIN_PRICE_CHANGE_1H,
    maxPairAgeHours: config.MAX_PAIR_AGE_HOURS,
    minPairAgeHours: config.MIN_PAIR_AGE_HOURS,
    minVolumeRatio: config.MIN_VOLUME_RATIO,
    minBuyPressure: config.MIN_BUY_PRESSURE,
  };

  console.log('\n🔍 Scanner Investigation');
  console.log('Criteria:', criteria);
  console.log('');

  // Scan for trending tokens
  const dexscreener = new DexscreenerClient();
  const tokens = await dexscreener.getTrendingPairs('solana');

  if (!tokens || tokens.length === 0) {
    console.log('No tokens found');
    return;
  }

  console.log(`\n📊 Scan Results:`);
  console.log(`   Total tokens scanned: ${tokens.length}`);

  // Track filter statistics
  let passedLiquidity = 0;
  let passedAge = 0;
  let passedVolume = 0;
  let passedPriceChange = 0;
  let passedVolumeRatio = 0;
  let passedBuyPressure = 0;
  let rejectedLiquidity = 0;
  let rejectedAge = 0;
  let rejectedVolume = 0;
  let rejectedPriceChange = 0;
  let rejectedVolumeRatio = 0;
  let rejectedBuyPressure = 0;

  tokens.forEach((token) => {
    // Liquidity check
    if (token.liquidity.usd < criteria.minLiquidityUsd) {
      rejectedLiquidity++;
      console.log(`  ❌ ${token.baseToken.symbol.pad(4)} | Liquidity too low: $${token.liquidity.usd.toLocaleString()} < $${criteria.minLiquidityUsd.toLocaleString()}`);
      return;
    } else if (token.liquidity.usd > criteria.maxLiquidityUsd) {
      rejectedLiquidity++;
      console.log(`  ❌ ${token.baseToken.symbol.pad(4)} | Liquidity too high: $${token.liquidity.usd.toLocaleString()} > $${criteria.maxLiquidityUsd.toLocaleString()}`);
      return;
    } else {
      passedLiquidity++;
    }

    // Age check
    const pairAgeHours =
      (token.pairCreatedAt
        ? Math.floor((Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60))
        : undefined;
    if (pairAgeHours === undefined) {
      passedAge++;
    } else if (pairAgeHours < criteria.minPairAgeHours) {
      rejectedAge++;
      console.log(`  ❌ ${token.baseToken.symbol.pad(4)} | Token too new: ${pairAgeHours.toFixed(1)}h < ${criteria.minPairAgeHours}h (min)`);
      return;
    } else if (pairAgeHours > criteria.maxPairAgeHours) {
      rejectedAge++;
      console.log(`  ❌ ${token.baseToken.symbol.pad(4)} | Token too old: ${pairAgeHours.toFixed(1)}h > ${criteria.maxPairAgeHours}h (max)`);
      return;
    } else {
      passedAge++;
    }

    // Volume check
    if (token.volume.h24 < criteria.minVolume24h) {
      rejectedVolume++;
      console.log(`  ❌ ${token.baseToken.symbol.pad(4)} | Volume 24h too low: $${token.volume.h24.toLocaleString()} < $${criteria.minVolume24h.toLocaleString()}`);
      return;
    } else {
      passedVolume++;
    }

    // Price change check
    if (
      token.priceChange.h1 === undefined ||
      token.priceChange.h1 < criteria.minPriceChange1h
    ) {
      rejectedPriceChange++;
      console.log(
        `  ❌ ${token.baseToken.symbol.pad(4)} | Price change too low: ${token.priceChange.h1?.toFixed(2)}% < ${criteria.minPriceChange1h}%`
      );
      return;
    } else {
      passedPriceChange++;
    }

    // Volume ratio check (h1/h6)
    if (token.priceChange.h6 && token.priceChange.h1) {
      const h1 = token.priceChange.h1;
      const h6 = token.priceChange.h6;
      if (h6 === 0) {
        passedVolumeRatio++;
      } else {
        const volumeRatio = h1 / h6;
        if (volumeRatio < criteria.minVolumeRatio) {
          rejectedVolumeRatio++;
          console.log(
            `  ❌ ${token.baseToken.symbol.pad(4)} | Volume ratio too low: ${volumeRatio.toFixed(2)} (h1/h6) < ${criteria.minVolumeRatio}}`
          );
          return;
        } else {
          passedVolumeRatio++;
        }
      }
    } else if (token.priceChange.h6 === undefined || token.priceChange.h1 === undefined) {
        passedVolumeRatio++;
      } else {
        // No h6 data, skip volume ratio check
        passedVolumeRatio++;
      }

    // Buy pressure check (buys/sells ratio)
    const buys = token.txns.h24?.buys || 0;
    const sells = token.txns.h24?.sells || 0;
    if (buys === 0 || sells === 0) || buys === sells) {
      passedBuyPressure++;
    } else {
      const buyPressure = buys / sells;
      if (buyPressure < criteria.minBuyPressure) {
        rejectedBuyPressure++;
        console.log(
          `  ❌ ${token.baseToken.symbol.pad(4)} | Buy pressure too low: ${buyPressure.toFixed(2)} (buys/sells) < ${criteria.minBuyPressure}}`
        );
        return;
      } else {
        passedBuyPressure++;
      }
    }
  });

  // Log final summary
  console.log('\n📊 Filter Summary:');
  console.log(`  ✅ Passed liquidity: ${passedLiquidity}`);
  console.log(`  ✅ Passed age: ${passedAge}`);
  console.log(`  ✅ Passed volume: ${passedVolume}`);
  console.log(`  ✅ Passed price change: ${passedPriceChange}`);
  console.log(`  ✅ Passed volume ratio: ${passedVolumeRatio}`);
  console.log(`  ✅ Passed buy pressure: ${passedBuyPressure}`);
  console.log('');
  console.log(`  ❌ Rejected liquidity: ${rejectedLiquidity}`);
  console.log(`  ❌ Rejected age: ${rejectedAge}`);
  console.log(`  ❌ Rejected volume: ${rejectedVolume}`);
  console.log(`  ❌ Rejected price change: ${rejectedPriceChange}`);
  console.log(`  ❌ Rejected volume ratio: ${rejectedVolumeRatio}`);
  console.log(`  ❌ Rejected buy pressure: ${rejectedBuyPressure}`);
  console.log('\n📊 Final Results:');
  console.log(`  Total scanned: ${tokens.length}`);
  console.log(`  Passed all filters: ${passedBuyPressure}`); // Last check is buy pressure
 so console.log('\n💡 Recommendations:');
  console.log('1. REDUCE minVolumeRatio to 0.8 (catch tokens with volume spikes but low activity)');
  console.log('2. Reduce minBuyPressure to 0.9 (catch tokens with balanced buy/sell ratio)');
  console.log('3. Reduce minLiquidityUsd to $10,000 (allow smaller liquidity pools)');
  console.log('4. Reduce minVolume24h to $1,000 (allow lower volume tokens)');
  console.log('5. Reduce minPriceChange1h to 1% (catch smaller moves early)');
  console.log('\nThese changes should significantly increase the number of tokens passing filters.');
}

testScanner().catch(console.error => {
  console.error('Test failed:', error);
  process.exit(1);
});
