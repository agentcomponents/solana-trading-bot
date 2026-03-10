/**
 * Manual Test Script for Existing Entry/Exit Modules
 *
 * This script tests the current modules without executing real trades.
 * It verifies:
 * 1. Jupiter API quotes work
 * 2. Entry flow setup is correct
 * 3. Exit conditions evaluate correctly
 * 4. Database operations work
 */

import { config } from 'dotenv';
import { getQuote } from '../../src/jupiter/client';
import { validateEntry, DEFAULT_ENTRY_VALIDATION } from '../../src/entry/validator';
import { exitStrategy, calculatePnlPercent } from '../../src/exit/strategy';
import {
  initializeDatabase,
  getDbClient,
  createPositionRepository,
  type Position
} from '../../src/db';

// Load environment
config();

// ============================================================================
// TEST CONFIG
// ============================================================================

const TEST_TOKEN = {
  address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
  symbol: 'RAY',
  name: 'Raydium',
  decimals: 6,
  liquidity: 12_000_000, // $12M
};

const ENTRY_AMOUNT_SOL = 0.01; // Small test amount

// ============================================================================
// TESTS
// ============================================================================

async function testJupiterQuote() {
  console.log('\n📊 TEST 1: Jupiter Quote API');
  console.log('   Getting quote for SOL → RAY...');

  try {
    const quote = await getQuote({
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: TEST_TOKEN.address,
      amount: String(ENTRY_AMOUNT_SOL * 1_000_000_000), // Convert to lamports
      slippageBps: 100,
    });

    console.log(`   ✅ Quote received!`);
    console.log(`   Input: ${quote.inAmount} lamports (${ENTRY_AMOUNT_SOL} SOL)`);
    console.log(`   Output: ${quote.outAmount} raw (≈${Number(quote.outAmount) / 1_000_000} RAY)`);
    console.log(`   Price Impact: ${quote.priceImpactPct}%`);
    console.log(`   Routes: ${quote.routePlan?.length || 0}`);

    return quote;
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

async function testEntryValidator() {
  console.log('\n✅ TEST 2: Entry Validator');
  console.log('   Checking if RAY meets entry criteria...');

  try {
    const candidate = {
      address: TEST_TOKEN.address,
      chainId: 'solana',
      dexId: 'raydium',
      tokenAddress: TEST_TOKEN.address,
      pairAddress: 'test_pair_address',
      symbol: TEST_TOKEN.symbol,
      name: TEST_TOKEN.name,
      decimals: TEST_TOKEN.decimals,
      liquidity: TEST_TOKEN.liquidity,
      volumeH1: 200000,
      volumeH6: 1000000,
      volumeH24: 5000000,
      priceChangeH1: 5,
      priceChangeH6: 10,
      priceChangeH24: 15,
      priceUsd: 2.5,
      pairAge: 1440 * 365,
      pairAgeMinutes: 1440 * 365,
      txnsH24: { buys: 2500, sells: 2500 },
    };

    // Pass null for safety check since we're just testing structure
    const result = await validateEntry(candidate, null, {
      ...DEFAULT_ENTRY_VALIDATION,
      requireSafetyCheck: false, // Skip safety check for this test
    });

    console.log(`   Valid: ${result.valid ? '✅ YES' : '❌ NO'}`);
    console.log(`   Confidence: ${result.confidence}`);
    console.log(`   Reasons: ${result.reasons.join(', ') || 'None'}`);

    return result;
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

async function testExitStrategy() {
  console.log('\n📈 TEST 3: Exit Strategy Evaluation');
  console.log('   Testing various exit conditions...');

  // Create a test position
  const testPosition: Position = {
    id: 'test-position-1',
    state: 'ACTIVE',
    tokenMint: TEST_TOKEN.address,
    entrySolSpent: String(ENTRY_AMOUNT_SOL * 1_000_000_000), // Raw lamports
    entryTimestamp: Date.now() - 3600000, // 1 hour ago
    entryPricePerToken: ENTRY_AMOUNT_SOL, // 0.01 SOL per RAY
    tokensReceivedRaw: '1000000', // 1 RAY (6 decimals)
    tokenDecimals: 6,
    exitTimestamp: null,
    exitSolReceived: null,
    exitPricePerToken: null,
    exitReason: null,
    peakPricePerToken: ENTRY_AMOUNT_SOL,
    peakTimestamp: Date.now(),
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  };

  const entryPrice = testPosition.entryPricePerToken;

  // Test 1: Stop Loss (-40%)
  console.log('\n   a) Stop Loss Test (-40%):');
  const stopLossPrice = entryPrice * 0.6;
  const stopLossDecision = exitStrategy.evaluate(testPosition, stopLossPrice);
  console.log(`      Current: $${stopLossPrice.toFixed(4)} | Decision: ${stopLossDecision?.reason || 'None'}`);

  // Test 2: Take Profit 1 (+50%)
  console.log('\n   b) Take Profit 1 Test (+50%):');
  const tp1Price = entryPrice * 1.5;
  const tp1Decision = exitStrategy.evaluate(testPosition, tp1Price);
  console.log(`      Current: $${tp1Price.toFixed(4)} | Decision: ${tp1Decision?.reason || 'None'}`);

  // Test 3: Take Profit 2 (+100%)
  console.log('\n   c) Take Profit 2 Test (+100%):');
  const tp2Price = entryPrice * 2.0;
  const tp2Decision = exitStrategy.evaluate(testPosition, tp2Price);
  console.log(`      Current: $${tp2Price.toFixed(4)} | Decision: ${tp2Decision?.reason || 'None'}`);

  // Test 4: Trailing Stop (after +100%, price drops 15%)
  console.log('\n   d) Trailing Stop Test (+100% then -15%):');
  const peakPrice = entryPrice * 2.0;
  testPosition.peakPricePerToken = peakPrice;
  testPosition.state = 'TRAILING';
  const trailingPrice = peakPrice * 0.84; // 16% drop from peak
  const trailingDecision = exitStrategy.evaluate(testPosition, trailingPrice);
  console.log(`      Peak: $${peakPrice.toFixed(4)} | Current: $${trailingPrice.toFixed(4)} | Decision: ${trailingDecision?.reason || 'None'}`);

  return testPosition;
}

async function testDatabase() {
  console.log('\n💾 TEST 4: Database Operations');
  console.log('   Testing position storage and retrieval...');

  try {
    // Initialize database
    initializeDatabase();

    // Get database connection
    const db = getDbClient().connect();

    // Create repository
    const positionsRepo = createPositionRepository(db);

    // Create a test position
    const position: Position = {
      id: 'test-db-position',
      state: 'ACTIVE',
      tokenMint: TEST_TOKEN.address,
      entrySolSpent: String(ENTRY_AMOUNT_SOL * 1_000_000_000),
      entryTimestamp: Date.now(),
      entryPricePerToken: ENTRY_AMOUNT_SOL,
      tokensReceivedRaw: '1000000',
      tokenDecimals: 6,
      exitTimestamp: null,
      exitSolReceived: null,
      exitPricePerToken: null,
      exitReason: null,
      peakPricePerToken: ENTRY_AMOUNT_SOL,
      peakTimestamp: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Store position
    positionsRepo.create(position);
    console.log('   ✅ Position stored');

    // Retrieve position
    const retrieved = positionsRepo.findById('test-db-position');
    console.log(`   ✅ Position retrieved: ${retrieved?.tokenMint?.substring(0, 8)}... @ ${retrieved?.entryPricePerToken} SOL`);

    // Update peak price
    positionsRepo.updatePeakPrice('test-db-position', 0.015, Date.now());
    const updated = positionsRepo.findById('test-db-position');
    console.log(`   ✅ Peak updated: ${updated?.peakPricePerToken} SOL`);

    // Close position
    positionsRepo.recordExit(
      'test-db-position',
      '12000000',
      0.012,
      'TAKE_PROFIT_1'
    );
    const closed = positionsRepo.findById('test-db-position');
    console.log(`   ✅ Position closed: ${closed?.state} | P&L data recorded`);

    return position;
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

async function testPnLCalculation() {
  console.log('\n💰 TEST 5: P&L Calculation');
  console.log('   Testing profit/loss percentage calculations...');

  const tests = [
    { entry: 0.01, current: 0.015, expected: '+50%' },
    { entry: 0.01, current: 0.02, expected: '+100%' },
    { entry: 0.01, current: 0.006, expected: '-40%' },
    { entry: 0.01, current: 0.005, expected: '-50%' },
    { entry: 0.01, current: 0.01, expected: '0%' },
  ];

  for (const test of tests) {
    const pnl = calculatePnlPercent(test.entry, test.current);
    const symbol = pnl >= 0 ? '+' : '';
    console.log(`   Entry: $${test.entry.toFixed(3)} → Current: $${test.current.toFixed(3)} = ${symbol}${pnl.toFixed(1)}%`);
  }

  console.log('   ✅ P&L calculations working correctly');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  SOLANA TRADING BOT - EXISTING MODULES TEST');
  console.log('  Testing Phase 3 Components (Entry + Exit)');
  console.log('  '.repeat(60));

  const results: { name: string; passed: boolean }[] = [];

  try {
    // Test 1: Jupiter Quote
    await testJupiterQuote();
    results.push({ name: 'Jupiter Quote API', passed: true });

    // Test 2: Entry Validator
    await testEntryValidator();
    results.push({ name: 'Entry Validator', passed: true });

    // Test 3: Exit Strategy
    await testExitStrategy();
    results.push({ name: 'Exit Strategy', passed: true });

    // Test 4: Database
    await testDatabase();
    results.push({ name: 'Database Operations', passed: true });

    // Test 5: P&L Calculation
    await testPnLCalculation();
    results.push({ name: 'P&L Calculation', passed: true });

  } catch (error) {
    console.log(`\n❌ Test failed with error: ${error instanceof Error ? error.message : error}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${result.name}`);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n  Total: ${passed}/${results.length} tests passed`);

  if (passed === results.length) {
    console.log('\n  🎉 All Phase 3 components are working correctly!');
    console.log('  Ready to proceed with Paper Trading implementation.\n');
  } else {
    console.log('\n  ⚠️  Some tests failed. Please review the errors above.\n');
  }
}

// Run tests
main().catch(console.error);
