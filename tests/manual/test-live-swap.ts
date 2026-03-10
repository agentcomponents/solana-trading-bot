/**
 * Test live swap: SOL → USDC
 *
 * This performs a real on-chain swap to test the system.
 * Uses 0.01 SOL for testing.
 */

import 'dotenv/config';
import { validateConfig } from '../../src/config';
import { loadWallet } from '../../src/solana/wallet';
import { initializeConnections, getConnection } from '../../src/solana/connection';
import { getQuote, executeSwap, USDC_MINT, SOL_MINT } from '../../src/jupiter/client';

const SWAP_AMOUNT_SOL = 0.01;
const SLIPPAGE_BPS = 100; // 1%

async function testSwap() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   LIVE SWAP TEST: SOL → USDC                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize
  console.log('1. Initializing...');
  const config = validateConfig();
  if (config.TRADING_MODE !== 'live') {
    throw new Error('Set TRADING_MODE=live in .env for live trading');
  }

  loadWallet();
  initializeConnections();
  const connection = getConnection();
  console.log('   ✅ Initialized\n');

  // Get quote
  console.log(`2. Getting quote: ${SWAP_AMOUNT_SOL} SOL → USDC...`);
  const amountLamports = Math.floor(SWAP_AMOUNT_SOL * 1e9);

  const quote = await getQuote({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: amountLamports,
    slippageBps: SLIPPAGE_BPS,
  });

  console.log(`   ✅ Quote received:`);
  console.log(`      Input: ${Number(quote.inAmount) / 1e9} SOL`);
  console.log(`      Output: ${Number(quote.outAmount) / 1e6} USDC`);
  console.log(`      Price Impact: ${quote.priceImpactPct}%`);
  console.log(`      Route: ${quote.routePlan?.length || 0} hops\n`);

  // Confirm
  console.log('3. Preparing to swap...');
  console.log(`   ⚠️  This will send a REAL transaction on Solana mainnet!`);
  console.log(`   ⚠️  Amount: ${SWAP_AMOUNT_SOL} SOL`);
  console.log(`   ⚠️  Press Ctrl+C NOW to cancel!\n`);

  // Small delay to allow cancellation
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Execute swap
  console.log('4. Executing swap...');
  const result = await executeSwap({
    quoteResponse: quote,
    priorityLevel: 'high',
    maxPriorityFeeLamports: 1000000,
  });

  if (result.success && result.signature) {
    console.log(`\n   ✅ SWAP SUCCESSFUL!\n`);
    console.log(`   Signature: ${result.signature}`);
    console.log(`   Explorer: ${result.explorerUrl}\n`);

    // Wait for final confirmation
    console.log('5. Waiting for final confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check new balance
    const { getWalletBalance } = await import('../../src/solana/wallet');
    const balance = await getWalletBalance(connection);
    console.log(`   ✅ New wallet balance: ${balance.toFixed(4)} SOL\n`);

    console.log('─────────────────────────────────────────────────────────────');
    console.log('✅ Live swap test completed successfully!');
    console.log('─────────────────────────────────────────────────────────────');
  } else {
    console.log(`\n   ❌ SWAP FAILED: ${result.error}\n`);
    console.log('─────────────────────────────────────────────────────────────');
    console.log('❌ Live swap test failed');
    console.log('─────────────────────────────────────────────────────────────');
  }

  return result;
}

testSwap()
  .then(result => {
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
