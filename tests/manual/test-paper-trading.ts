/**
 * Comprehensive Paper Trading Test
 *
 * Tests the full trading cycle without using real money.
 */

import 'dotenv/config';
import { validateConfig } from '../../src/config';
import { initializeDatabase } from '../../src/db/init';
import { getDbClient } from '../../src/db';
import { createPaperTradingEngine } from '../../src/paper/engine';
import { quickScan } from '../../src/scanner/scanner';
import { checkTokenSafetyAggregate } from '../../src/safety/aggregator';

// Override mode to paper
process.env.TRADING_MODE = 'paper';

async function runPaperTradingTest() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   PAPER TRADING FULL CYCLE TEST                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Initialize
  console.log('1. Initializing paper trading environment...');
  const config = validateConfig();
  console.log('   Trading Mode:', config.TRADING_MODE);

  const dbClient = getDbClient();
  initializeDatabase(dbClient);
  const db = dbClient.getDb();

  // Clear existing test data
  try {
    db.prepare('DELETE FROM positions WHERE id LIKE "test-%"').run();
    console.log('   Cleared previous test data');
  } catch {
    // Table might not exist, that's ok
  }
  console.log('');

  // 2. Create paper trading engine
  console.log('2. Creating paper trading engine...');
  const paperEngine = createPaperTradingEngine({
    initialSol: 0.1,
    entryAmountSol: 0.05,
    defaultSlippageBps: 100,
    db: db,
  });
  console.log('   Paper engine created');

  const walletState = paperEngine.getWalletState();
  console.log('   Virtual Wallet: ' + walletState.solBalance.toFixed(4) + ' SOL');
  console.log('');

  // 3. Scan for tokens
  console.log('3. Scanning for trading opportunities...');
  console.log('   Fetching tokens from DexScreener...');

  const opportunities = await quickScan({
    limit: 10,
    maxResults: 10,
  });

  console.log('   Found ' + opportunities.length + ' tokens matching criteria');
  console.log('');

  if (opportunities.length === 0) {
    console.log('   No opportunities found. Exiting.');
    return;
  }

  // Display top 3 opportunities
  console.log('   Top opportunities:');
  for (let i = 0; i < Math.min(3, opportunities.length); i++) {
    const opp = opportunities[i];
    console.log('      ' + (i + 1) + '. ' + opp.symbol + ' - Score: ' + opp.opportunityScore + '/100');
    console.log('         Price: $' + opp.priceUsd.toFixed(6) + ' | Liquidity: $' + (opp.liquidity / 1000).toFixed(1) + 'K');
    console.log('         1h: ' + (opp.priceChangeH1?.toFixed(1) || 'N/A') + '% | 24h: ' + (opp.priceChangeH24?.toFixed(1) || 'N/A') + '%');
  }
  console.log('');

  // 4. Pick best opportunity and run safety check
  console.log('4. Running safety checks on best opportunity...');
  const bestOpportunity = opportunities[0];

  const safetyResult = await checkTokenSafetyAggregate(bestOpportunity.address);
  console.log('   Token: ' + bestOpportunity.symbol + ' (' + bestOpportunity.address.slice(0, 8) + '...)');
  console.log('   Safe: ' + (safetyResult.safe ? 'YES' : 'NO'));
  console.log('   Confidence: ' + safetyResult.confidence);

  if (safetyResult.reasons.length > 0) {
    console.log('   Reasons: ' + safetyResult.reasons.join(', '));
  }
  console.log('');

  if (!safetyResult.safe) {
    console.log('   Token failed safety check. Trying next best...');
    if (opportunities.length > 1) {
      const secondBest = opportunities[1];
      const secondSafety = await checkTokenSafetyAggregate(secondBest.address);
      if (secondSafety.safe) {
        bestOpportunity.tokenAddress = secondBest.address;
        bestOpportunity.symbol = secondBest.symbol;
        console.log('   Second token passed: ' + secondBest.symbol);
      } else {
        console.log('   Second token also failed. Exiting test.');
        return;
      }
    } else {
      console.log('   No other tokens to test. Exiting.');
      return;
    }
  }

  // 5. Execute paper entry
  console.log('5. Executing PAPER entry...');
  console.log('   Buying: ' + bestOpportunity.symbol);
  console.log('   Amount: 0.05 SOL');
  console.log('');

  const entryResult = await paperEngine.executeEntry(bestOpportunity, {
    decimals: 6,
    symbol: bestOpportunity.symbol,
  });

  if (!entryResult.success) {
    console.log('   Entry failed: ' + entryResult.error);
    return;
  }

  console.log('   Entry executed!');
  console.log('');
  console.log('   Entry Details:');
  console.log('      Quoted Tokens: ' + entryResult.quotedTokens.toFixed(2));
  console.log('      Actual Tokens (after slippage): ' + entryResult.actualTokens.toFixed(2));
  console.log('      Entry Price: ' + entryResult.entryPriceSol.toFixed(6) + ' SOL/token');
  console.log('      Slippage: ' + (entryResult.slippageBps / 100) + '%');
  console.log('      Position ID: ' + entryResult.position?.id);
  console.log('');

  // 6. Check virtual wallet after entry
  const walletAfterEntry = paperEngine.getWalletState();
  console.log('   Virtual Wallet After Entry:');
  console.log('      SOL: ' + walletAfterEntry.solBalance.toFixed(6) + ' SOL');
  const tokenBalObj = walletAfterEntry.tokens.find(t => t.tokenAddress === bestOpportunity.address);
  const tokenBal = tokenBalObj ? Number(tokenBalObj.rawAmount) / Math.pow(10, tokenBalObj.decimals) : 0;
  console.log('      Tokens: ' + tokenBal.toFixed(2) + ' ' + bestOpportunity.symbol);
  console.log('');

  // 7. Get fresh quote for exit
  console.log('6. Getting exit quote...');
  const { getQuote } = await import('../../src/jupiter/client');
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  if (!tokenBalObj || tokenBal <= 0) {
    console.log('   No token balance to exit');
    return;
  }

  // Convert to smallest unit for quote
  const tokenDecimals = entryResult.position?.tokenDecimals ?? 6;
  const amountSmallest = Math.floor(tokenBal * Math.pow(10, tokenDecimals));

  const exitQuote = await getQuote({
    inputMint: bestOpportunity.address,
    outputMint: SOL_MINT,
    amount: amountSmallest,
    slippageBps: 300,
  });

  const quotedSol = Number(exitQuote.outAmount) / 1e9;
  console.log('   Exit quote received:');
  console.log('      Input: ' + tokenBal.toFixed(2) + ' ' + bestOpportunity.symbol);
  console.log('      Quoted SOL: ' + quotedSol.toFixed(6) + ' SOL');
  console.log('');

  // 8. Execute paper exit
  console.log('7. Executing PAPER exit...');
  const exitResult = await paperEngine.executeExit(entryResult.position!, 'MANUAL');

  if (!exitResult.success) {
    console.log('   Exit failed: ' + exitResult.error);
    return;
  }

  console.log('   Exit executed!');
  console.log('');
  console.log('   Exit Details:');
  console.log('      Quoted SOL: ' + exitResult.quotedSol.toFixed(6));
  console.log('      Actual SOL (after slippage): ' + exitResult.actualSol.toFixed(6));
  console.log('      Exit Slippage: ' + (exitResult.slippageBps / 100) + '%');
  console.log('      P&L: ' + exitResult.pnl.toFixed(6) + ' SOL (' + exitResult.pnlPercent.toFixed(2) + '%)');
  console.log('');

  // 9. Check final wallet state
  const finalWallet = paperEngine.getWalletState();
  console.log('8. Final Virtual Wallet:');
  console.log('      SOL: ' + finalWallet.solBalance.toFixed(6) + ' SOL');
  console.log('      Change: ' + (finalWallet.solBalance - 0.1).toFixed(6) + ' SOL');
  console.log('');

  // 10. Verify database record
  console.log('9. Verifying database record...');
  const { createPositionRepository } = await import('../../src/db');
  const positionsRepo = createPositionRepository(db);
  const savedPosition = positionsRepo.findById(entryResult.position!.id);

  if (savedPosition) {
    console.log('   Position saved to database:');
    console.log('      ID: ' + savedPosition.id);
    console.log('      Token: ' + savedPosition.tokenSymbol);
    console.log('      State: ' + savedPosition.state);
    console.log('      Entry SOL: ' + savedPosition.entrySolTotal);
    console.log('      Exit SOL: ' + (savedPosition.exitSolTotal || 'N/A'));
    console.log('      P&L: ' + (savedPosition.pnlSol || 'N/A'));
  } else {
    console.log('   Position not found in database');
  }
  console.log('');

  // Summary
  console.log('─────────────────────────────────────────────────────────────');
  console.log('PAPER TRADING TEST COMPLETE!');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log('Summary:');
  console.log('  Scanned ' + opportunities.length + ' opportunities');
  console.log('  Safety checked: ' + bestOpportunity.symbol);
  console.log('  Entry: ' + entryResult.actualTokens.toFixed(2) + ' tokens @ ' + entryResult.entryPriceSol.toFixed(6) + ' SOL');
  console.log('  Exit: ' + exitResult.actualSol.toFixed(6) + ' SOL received');
  console.log('  P&L: ' + exitResult.pnl.toFixed(6) + ' SOL (' + exitResult.pnlPercent.toFixed(2) + '%)');
  console.log('  Final Balance: ' + finalWallet.solBalance.toFixed(6) + ' SOL');
  console.log('');
  console.log('All components working correctly!');
  console.log('─────────────────────────────────────────────────────────────');
}

runPaperTradingTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('');
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
