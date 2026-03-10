/**
 * Solana Wallet Management
 *
 * Handles wallet keypair loading from private key and balance queries.
 */

import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../utils/logger';
import { getConfig } from '../config';

// ============================================================================
// STATE
// ============================================================================

let keypair: Keypair | null = null;

// ============================================================================
// WALLET LOADING
// ============================================================================

/**
 * Load wallet keypair from private key in environment
 *
 * The WALLET_PRIVATE_KEY should be in Base58 format.
 * This decodes it and creates a Keypair for signing transactions.
 *
 * @throws Error if private key is invalid or not set
 */
export function loadWallet(): Keypair {
  if (keypair) {
    return keypair;
  }

  const config = getConfig();
  const privateKeyBase58 = config.WALLET_PRIVATE_KEY;

  try {
    // Decode Base58 private key to bytes
    const privateKeyBytes = bs58.decode(privateKeyBase58);

    // Validate key length (64 bytes for standard Ed25519 keypair)
    if (privateKeyBytes.length !== 64) {
      throw new Error(
        `Invalid private key length: ${privateKeyBytes.length} bytes. Expected 64 bytes.`
      );
    }

    // Create keypair from secret key
    keypair = Keypair.fromSecretKey(privateKeyBytes);

    logger.info(
      { publicKey: keypair.publicKey.toBase58() },
      'Wallet loaded successfully'
    );

    return keypair;
  } catch (error) {
    logger.error({ error }, 'Failed to load wallet');
    throw new Error(
      `Failed to load wallet from private key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get the wallet keypair (loads if not already loaded)
 */
export function getWalletKeypair(): Keypair {
  if (!keypair) {
    return loadWallet();
  }
  return keypair;
}

/**
 * Get the wallet public key as a PublicKey object
 */
export function getWalletPublicKey(): PublicKey {
  return getWalletKeypair().publicKey;
}

/**
 * Get the wallet public key as a Base58 string
 */
export function getWalletAddress(): string {
  return getWalletKeypair().publicKey.toBase58();
}

// ============================================================================
// BALANCE
// ============================================================================

/**
 * Get SOL balance for the wallet
 *
 * @param connection Solana RPC connection
 * @returns Balance in SOL (not lamports)
 */
export async function getWalletBalance(connection: Connection): Promise<number> {
  const publicKey = getWalletPublicKey();

  try {
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

    logger.debug({ balance: balanceSol }, 'Wallet balance fetched');

    return balanceSol;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch wallet balance');
    throw new Error(
      `Failed to get wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if wallet has sufficient SOL balance
 *
 * @param connection Solana RPC connection
 * @param requiredSol Required SOL amount
 * @returns True if balance is sufficient
 */
export async function hasSufficientBalance(
  connection: Connection,
  requiredSol: number
): Promise<boolean> {
  const balance = await getWalletBalance(connection);

  // Add buffer for transaction fees (0.001 SOL)
  const feeBuffer = 0.001;
  const requiredWithFees = requiredSol + feeBuffer;

  return balance >= requiredWithFees;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Validate a Base58 encoded private key
 *
 * @param privateKeyBase58 Private key in Base58 format
 * @returns True if valid
 */
export function isValidPrivateKey(privateKeyBase58: string): boolean {
  try {
    const bytes = bs58.decode(privateKeyBase58);
    return bytes.length === 64;
  } catch {
    return false;
  }
}

/**
 * Get a clean keypair (for testing only)
 *
 * @internal
 */
export function _resetWallet(): void {
  keypair = null;
}
