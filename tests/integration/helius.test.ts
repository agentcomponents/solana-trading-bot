/**
 * Helius RPC API Test
 *
 * Tests Helius RPC connection and data retrieval
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';

// Load environment variables
config();

describe('Helius RPC Integration Tests', () => {
  const rpcUrl = process.env['HELIUS_RPC_URL'];

  beforeAll(() => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }
  });

  it('should have RPC URL configured', () => {
    expect(rpcUrl).toBeDefined();
    expect(rpcUrl).toContain('helius');
  });

  it('should connect to Helius RPC', async () => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // Test basic connection
    const version = await connection.getVersion();

    expect(version).toBeDefined();
    expect(version['solana-core']).toBeDefined();

    console.log('✅ Helius Connection:');
    console.log('  solana-core:', version['solana-core']);
    console.log('  feature-set:', version['feature-set']);
  });

  it('should get latest blockhash', async () => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const blockhash = await connection.getLatestBlockhash();

    expect(blockhash).toBeDefined();
    expect(blockhash.blockhash).toBeDefined();
    expect(blockhash.lastValidBlockHeight).toBeGreaterThan(0);

    console.log('✅ Latest Blockhash:');
    console.log('  blockhash:', blockhash.blockhash);
    console.log('  lastValidBlockHeight:', blockhash.lastValidBlockHeight);
  });

  it('should get SOL balance', async () => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // Test with a known address (Raydium liquidity pool)
    const testAddress = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';

    const balance = await connection.getBalance(new PublicKey(testAddress));

    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThanOrEqual(0);

    console.log('✅ Balance Check:');
    console.log('  address:', testAddress);
    console.log('  balance (lamports):', balance);
    console.log('  balance (SOL):', balance / 1_000_000_000);
  });

  it('should get token account balance', async () => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // USDC mint address
    const tokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    // Get token supply
    const supply = await connection.getTokenSupply(tokenMint);

    expect(supply).toBeDefined();
    expect(supply.value).toBeDefined();

    console.log('✅ Token Supply:');
    console.log('  mint:', tokenMint.toBase58());
    console.log('  supply (raw):', supply.value);
    console.log('  decimals:', supply.value.decimals);
    console.log('  supply (formatted):', Number(supply.value.amount) / Math.pow(10, supply.value.decimals));
  });

  it('should get token metadata', async () => {
    if (!rpcUrl) {
      throw new Error('HELIUS_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');

    // USDC mint
    const tokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    // Get mint info
    const mintInfo = await connection.getParsedAccountInfo(tokenMint);

    expect(mintInfo.value).toBeDefined();

    const parsed = mintInfo.value as { data: { parsed: { info: { decimals: number } } } };

    console.log('✅ Token Mint Info:');
    console.log('  mint:', tokenMint.toBase58());
    console.log('  decimals:', parsed.data?.parsed?.info?.decimals);
  });
});
