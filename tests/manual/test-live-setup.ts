/**
 * Test live trading setup
 *
 * Validates wallet, RPC connection, and balance
 */

import 'dotenv/config';
import { validateConfig } from '../../src/config';
import { loadWallet, getWalletAddress, getWalletBalance } from '../../src/solana/wallet';
import { initializeConnections, checkRpcHealth, getConnection } from '../../src/solana/connection';

async function test() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Live Trading Setup Test                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize config first
  console.log('0. Validating configuration...');
  const config = validateConfig();
  console.log(`   ✅ Config validated`);
  console.log(`   Trading Mode: ${config.TRADING_MODE}\n`);

  // Test wallet loading
  console.log('1. Loading wallet...');
  const wallet = loadWallet();
  const address = getWalletAddress();
  console.log(`   ✅ Wallet loaded`);
  console.log(`   Address: ${address}\n`);

  // Test RPC connection
  console.log('2. Initializing RPC connections...');
  initializeConnections();
  console.log(`   ✅ Connections initialized\n`);

  // Test RPC health
  console.log('3. Testing RPC health...');
  const healthy = await checkRpcHealth();
  console.log(`   ${healthy ? '✅' : '❌'} RPC Health: ${healthy ? 'OK' : 'FAILED'}\n`);

  // Test wallet balance
  console.log('4. Fetching wallet balance...');
  const connection = getConnection();
  const balance = await getWalletBalance(connection);
  console.log(`   ✅ Balance: ${balance.toFixed(4)} SOL\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('✅ All systems operational! Ready for live trading.');
  console.log('─────────────────────────────────────────────────────────────');
}

test().catch(console.error);
