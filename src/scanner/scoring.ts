/**
 * Token Scoring System
 *
 * 8-component scoring based on DexScreener CLI best practices.
 * Each component contributes to a 0-100 score.
 */

import type { TokenSearchResult } from './dexscreener';

// ============================================================================
// TYPES
// ============================================================================

export interface ScoreComponents {
  volume: number;        // 30% - Volume velocity
  transactions: number;  // 20% - Transaction velocity
  liquidity: number;     // 18% - Liquidity depth
  momentum: number;      // 12% - Price movement
  flow: number;          // 8% - Buy/sell pressure
  boost: number;         // 7% - DexScreener boost activity
  recency: number;       // 3% - Age of pair
  profile: number;       // 2% - Has profile
}

export interface ScoreResult {
  score: number;         // 0-100
  components: ScoreComponents;
  tags: string[];        // Descriptive tags
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Calculate hotness score for a token
 * Based on DexScreener CLI scoring algorithm
 */
export function scoreToken(
  pair: TokenSearchResult,
  options: {
    boostTotal?: number;
    boostCount?: number;
    hasProfile?: boolean;
  } = {}
): ScoreResult {
  const { boostTotal = 0, boostCount = 0, hasProfile = false } = options;

  // Extract data with safe defaults
  const volumeH24 = Math.max(pair.volumeH24 || 0, 0);
  const txnsH1 = Math.max(pair.txnsH1 || 0, 0);
  const liquidityUsd = Math.max(pair.liquidity || 0, 0);
  const priceChangeH1 = pair.priceChangeH1 || 0;
  const buysH1 = pair.txnsH24?.buys || 0;
  const sellsH1 = pair.txnsH24?.sells || 0;
  const totalH1 = buysH1 + sellsH1;
  const ageHours = pair.pairAge || 0;

  // Calculate volume velocity (h1 vs baseline)
  const volumeBaseline = pair.volumeH6 
    ? (pair.volumeH6 - (pair.volumeH1 || 0)) / 5.0 
    : volumeH24 / 24.0;
  const volumeVelocity = volumeBaseline > 0 
    ? (pair.volumeH1 || 0) / volumeBaseline 
    : 1.0;

  // Calculate transaction velocity
  const txBaseline = pair.txnsH24 
    ? (pair.txnsH24 - txnsH1) / 23.0 
    : txnsH1;
  const txnVelocity = txBaseline > 0 ? txnsH1 / txBaseline : 1.0;

  // Component 1: Volume (30%)
  // Logarithmic scale - $7.5M volume = max score
  const volComponent = clip(logScale(volumeH24, 7_500_000), 0, 1) * 30;

  // Component 2: Transactions (20%)
  // Logarithmic scale - 4000 txns/h = max score
  const txnComponent = clip(logScale(txnsH1, 4000), 0, 1) * 20;

  // Component 3: Liquidity (18%)
  // Logarithmic scale - $3M liquidity = max score
  const liqComponent = clip(logScale(liquidityUsd, 3_000_000), 0, 1) * 18;

  // Component 4: Momentum (12%)
  // -20% to +50% range normalized to 0-1
  const momentumComponent = clip((priceChangeH1 + 20) / 70, 0, 1) * 12;

  // Component 5: Flow Pressure (8%)
  // Buy/sell imbalance normalized
  let buyPressure = 0;
  if (totalH1 > 0) {
    buyPressure = (buysH1 - sellsH1) / totalH1;
  }
  const pressureComponent = clip((buyPressure + 1) / 2, 0, 1) * 8;

  // Component 6: Boost Velocity (7%)
  // Logarithmic scale - 600 boost = max score
  const boostComponent = clip(logScale(boostTotal, 600), 0, 1) * 7;

  // Component 7: Recency (3%)
  // Newer pairs score higher
  let recencyComponent = 0.2; // Unknown age
  if (ageHours > 0) {
    if (ageHours <= 24) {
      recencyComponent = 1.0;
    } else if (ageHours <= 72) {
      recencyComponent = 0.65;
    } else if (ageHours <= 168) {
      recencyComponent = 0.35;
    }
  }
  recencyComponent *= 3;

  // Component 8: Profile (2%)
  const profileComponent = hasProfile ? 2 : 0;

  // Calculate total score
  const score = Math.round(
    volComponent + 
    txnComponent + 
    liqComponent + 
    momentumComponent + 
    pressureComponent + 
    boostComponent + 
    recencyComponent + 
    profileComponent
  );

  // Generate tags
  const tags: string[] = [];

  if (volumeH24 >= 1_000_000) tags.push('high-volume');
  if (txnsH1 >= 500) tags.push('transaction-spike');
  if (priceChangeH1 >= 8) tags.push('momentum');
  if (buyPressure >= 0.35) tags.push('buy-pressure');
  if (ageHours > 0 && ageHours < 48) tags.push('fresh-pair');
  if (boostTotal >= 100) tags.push('boosted');
  if (boostCount >= 3) tags.push('repeat-boosts');
  if (hasProfile) tags.push('listed-profile');
  if (volumeVelocity >= 2) tags.push('volume-acceleration');
  if (txnVelocity >= 2) tags.push('txn-acceleration');
  if (score >= 80) tags.push('very-hot');
  else if (score >= 60) tags.push('interesting');
  else if (score >= 40) tags.push('moderate');

  return {
    score: Math.max(0, Math.min(100, score)),
    components: {
      volume: Math.round(volComponent * 10) / 10,
      transactions: Math.round(txnComponent * 10) / 10,
      liquidity: Math.round(liqComponent * 10) / 10,
      momentum: Math.round(momentumComponent * 10) / 10,
      flow: Math.round(pressureComponent * 10) / 10,
      boost: Math.round(boostComponent * 10) / 10,
      recency: Math.round(recencyComponent * 10) / 10,
      profile: Math.round(profileComponent * 10) / 10,
    },
    tags,
  };
}

/**
 * Calculate risk profile for a token
 */
export function calculateRiskProfile(pair: TokenSearchResult): {
  riskScore: number;
  riskFlags: string[];
} {
  let riskScore = 100.0;
  const flags: string[] = [];

  const liquidityUsd = pair.liquidity || 0;
  const volumeH24 = pair.volumeH24 || 0;
  const txnsH1 = pair.txnsH1 || 0;
  const priceChangeH1 = pair.priceChangeH1 || 0;
  const buysH1 = pair.txnsH24?.buys || 0;
  const sellsH1 = pair.txnsH24?.sells || 0;

  // Volume to liquidity ratio
  const volLiq = volumeH24 / Math.max(liquidityUsd, 1);

  // Low liquidity
  if (liquidityUsd < 20_000) {
    riskScore -= 18.0;
    flags.push('low-liquidity');
  }

  // High turnover (volume/liquidity)
  if (volLiq >= 80) {
    riskScore -= 12.0;
    flags.push('high-turnover');
  }
  if (volLiq >= 140) {
    riskScore -= 24.0;
    flags.push('thin-exit');
  }

  // Concentration risk (liquidity/market cap)
  // Note: We don't have market cap, so skip this

  // Low participant flow
  if (txnsH1 <= 2 && volumeH24 >= 100_000) {
    riskScore -= 20.0;
    flags.push('low-participant-flow');
  }

  // Blowoff risk (huge pump with low txns)
  if (priceChangeH1 >= 140 && txnsH1 < 50) {
    riskScore -= 12.0;
    flags.push('blowoff-risk');
  }

  // One-way flow (only buys, no sells = potential honeypot)
  if (buysH1 >= 20 && sellsH1 === 0) {
    riskScore -= 18.0;
    flags.push('one-way-flow');
  }

  return {
    riskScore: Math.max(0, Math.min(100, riskScore)),
    riskFlags: flags,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function clip(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function logScale(value: number, max: number): number {
  if (value <= 0) return 0;
  if (max <= 0) return 0;
  return Math.log1p(value) / Math.log1p(max);
}
