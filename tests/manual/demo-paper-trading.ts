/**
 * Paper Trading Demo
 *
 * Demonstrates the paper trading functionality:
 * - Virtual wallet tracking
 * - Slippage simulation
 * - Performance analytics
 */

import { config } from 'dotenv';
import {
  getSlippageSimulator,
  createVirtualWallet,
  createPerformanceAnalytics,
} from '../../src/paper';
import { initializeDatabase, getDbClient, type Database } from '../../src/db';

// Load environment
config();

// ============================================================================
// DEMO FUNCTIONS
// ============================================================================

async function demoSlippageSimulator() {
  console.log('\n' + '='.repeat(60));
  console.log('  PAPER TRADING: SLIPPAGE SIMULATOR');
  console.log('='.repeat(60));

  const slippageSim = getSlippageSimulator();

  const scenarios = [
    {
      name: 'Small trade ($10 SOL) with high liquidity ($50k)',
      params: {
        tokenAddress: 'TOKEN_A',
        inputAmountSol: 0.01,
        liquidity: 50000,
        isBuy: true,
      },
    },
    {
      name: 'Large trade ($50 SOL) with low liquidity ($5k)',
      params: {
        tokenAddress: 'TOKEN_B',
        inputAmountSol: 0.05,
        liquidity: 5000,
        isBuy: true,
      },
    },
    {
      name: 'Selling tokens (typically higher slippage)',
      params: {
        tokenAddress: 'TOKEN_C',
        inputAmountSol: 0.02,
        liquidity: 20000,
        isBuy: false,
      },
    },
  ];

  for (const scenario of scenarios) {
    const result = await slippageSim.calculateSlippage(scenario.params);
    console.log(`\n${scenario.name}`);
    console.log(`  Slippage: ${result.slippageBps / 100}% (${result.slippageBps} bps)`);
    console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`  Factors:`);
    console.log(`    Liquidity Depth: ${(result.factors.liquidityDepth * 100).toFixed(0)}%`);
    console.log(`    Price Impact: ${result.factors.priceImpact.toFixed(2)}%`);
    console.log(`    Volatility: ${(result.factors.volatility * 100).toFixed(0)}%`);
    console.log(`    Size vs Pool: ${result.factors.sizeVsPool.toFixed(2)}%`);
  }
}

async function demoVirtualWallet() {
  console.log('\n' + '='.repeat(60));
  console.log('  PAPER TRADING: VIRTUAL WALLET');
  console.log('='.repeat(60));

  const wallet = createVirtualWallet(0.1); // Start with 0.1 SOL

  console.log('\nInitial state:');
  console.log(wallet.toString());

  // Simulate some trades
  console.log('\n--- Simulating Trades ---');

  // Entry: Buy tokens
  console.log('\n1. Entry: 0.01 SOL → TOKEN_A');
  wallet.deductSol(0.01);
  wallet.addTokens('TOKEN_A', 'TKA', '1000000', 6, 0.01);
  console.log(`   Deducted: 0.01 SOL`);
  console.log(`   Added: 1,000,000 TKA (6 decimals)`);

  // Another entry
  console.log('\n2. Entry: 0.02 SOL → TOKEN_B');
  wallet.deductSol(0.02);
  wallet.addTokens('TOKEN_B', 'TKB', '500000', 6, 0.04);
  console.log(`   Deducted: 0.02 SOL`);
  console.log(`   Added: 500,000 TKB (6 decimals)`);

  // Exit: Sell TOKEN_A with profit
  console.log('\n3. Exit: TOKEN_A → 0.015 SOL (+50% profit)');
  wallet.removeTokens('TOKEN_A');
  wallet.addSol(0.015);
  wallet.recordTrade(0.005);
  console.log(`   Received: 0.015 SOL`);
  console.log(`   P&L: +0.005 SOL (+50%)`);

  // Exit: Sell TOKEN_B with loss
  console.log('\n4. Exit: TOKEN_B → 0.015 SOL (-25% loss)');
  wallet.removeTokens('TOKEN_B');
  wallet.addSol(0.015);
  wallet.recordTrade(-0.005);
  console.log(`   Received: 0.015 SOL`);
  console.log(`   P&L: -0.005 SOL (-25%)`);

  console.log('\nFinal state:');
  console.log(wallet.toString());
}

async function demoPerformanceAnalytics() {
  console.log('\n' + '='.repeat(60));
  console.log('  PAPER TRADING: PERFORMANCE ANALYTICS');
  console.log('='.repeat(60));

  // Initialize database
  initializeDatabase();
  const db = getDbClient().connect() as Database;

  const analytics = createPerformanceAnalytics(db);

  console.log('\nGenerating performance report...');
  const report = await analytics.generateReport();

  console.log(analytics.formatReport(report));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '🎯'.repeat(30));
  console.log('  PAPER TRADING MODULE DEMO');
  console.log('  '.repeat(30));

  try {
    await demoSlippageSimulator();
    await demoVirtualWallet();
    await demoPerformanceAnalytics();

    console.log('\n' + '='.repeat(60));
    console.log('  DEMO COMPLETE');
    console.log('  '.repeat(60));
    console.log('\n✅ Paper Trading Module is ready!');
    console.log('\nNext steps:');
    console.log('  1. Run the bot in paper mode: npm run start:paper');
    console.log('  2. Generate performance report: npm run report');
    console.log('  3. Check readiness for live trading\n');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
  }
}

// Run demo
main().catch(console.error);
