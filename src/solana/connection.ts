/**
 * Solana RPC Connection Manager
 *
 * Manages connection to Solana RPC with automatic failover.
 * Uses Helius as primary and backup RPC as fallback.
 */

import { Connection, ConnectionConfig } from '@solana/web3.js';
import { logger } from '../utils/logger';
import { getConfig } from '../config';

// ============================================================================
// TYPES
// ============================================================================

export type RpcEndpoint = 'primary' | 'backup';

export interface ConnectionState {
  endpoint: RpcEndpoint;
  url: string;
  healthy: boolean;
  lastCheck: number;
  failureCount: number;
}

// ============================================================================
// CONFIG
// ============================================================================

const CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000, // 60 seconds
};

// ============================================================================
// STATE
// ============================================================================

let primaryConnection: Connection | null = null;
let backupConnection: Connection | null = null;
let activeConnection: Connection | null = null;
let activeEndpoint: RpcEndpoint = 'primary';

const state: ConnectionState = {
  endpoint: 'primary',
  url: '',
  healthy: true,
  lastCheck: Date.now(),
  failureCount: 0,
};

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Initialize RPC connections
 *
 * Creates connections to both primary and backup RPC endpoints.
 */
export function initializeConnections(): void {
  const config = getConfig();

  state.url = config.HELIUS_RPC_URL;
  primaryConnection = new Connection(config.HELIUS_RPC_URL, CONNECTION_CONFIG);
  backupConnection = new Connection(config.BACKUP_RPC_URL, CONNECTION_CONFIG);
  activeConnection = primaryConnection;
  activeEndpoint = 'primary';

  logger.info(
    {
      primary: maskUrl(config.HELIUS_RPC_URL),
      backup: maskUrl(config.BACKUP_RPC_URL),
    },
    'RPC connections initialized'
  );
}

/**
 * Get the active RPC connection
 *
 * Automatically fails over to backup if primary fails.
 *
 * @returns Active Connection instance
 * @throws Error if connections not initialized
 */
export function getConnection(): Connection {
  if (!activeConnection) {
    throw new Error('RPC connections not initialized. Call initializeConnections() first.');
  }

  return activeConnection;
}

/**
 * Get the active endpoint name
 */
export function getActiveEndpoint(): RpcEndpoint {
  return activeEndpoint;
}

/**
 * Get connection state info
 */
export function getConnectionState(): ConnectionState {
  return { ...state };
}

/**
 * Force failover to backup RPC
 *
 * Call this manually if you detect issues with primary RPC.
 */
export function failoverToBackup(): void {
  if (!backupConnection) {
    logger.error('Cannot failover: backup connection not initialized');
    return;
  }

  if (activeEndpoint === 'backup') {
    logger.debug('Already on backup endpoint');
    return;
  }

  activeConnection = backupConnection;
  activeEndpoint = 'backup';
  state.endpoint = 'backup';
  state.failureCount++;

  logger.warn('Failed over to backup RPC endpoint');
}

/**
 * Reset to primary RPC
 *
 * Call this to attempt switching back to primary after a failover.
 */
export function resetToPrimary(): void {
  if (!primaryConnection) {
    logger.error('Cannot reset: primary connection not initialized');
    return;
  }

  if (activeEndpoint === 'primary') {
    logger.debug('Already on primary endpoint');
    return;
  }

  activeConnection = primaryConnection;
  activeEndpoint = 'primary';
  state.endpoint = 'primary';
  state.failureCount = 0;

  logger.info('Switched back to primary RPC endpoint');
}

/**
 * Check RPC health
 *
 * @returns True if RPC is responding
 */
export async function checkRpcHealth(): Promise<boolean> {
  const connection = getConnection();

  try {
    const slot = await connection.getSlot();
    state.healthy = true;
    state.lastCheck = Date.now();

    logger.debug({ slot, endpoint: activeEndpoint }, 'RPC health check passed');
    return true;
  } catch (error) {
    state.healthy = false;
    state.lastCheck = Date.now();

    logger.warn({ error, endpoint: activeEndpoint }, 'RPC health check failed');

    // Auto-failover if primary fails
    if (activeEndpoint === 'primary') {
      logger.info('Primary RPC unhealthy, failing over to backup');
      failoverToBackup();
    }

    return false;
  }
}

/**
 * Get current slot number
 */
export async function getCurrentSlot(): Promise<number> {
  const connection = getConnection();
  return await connection.getSlot();
}

/**
 * Get latest block height
 */
export async function getLatestBlockheight(): Promise<number> {
  const connection = getConnection();
  const { lastValidBlockHeight } = await connection.getLatestBlockhash();
  return lastValidBlockHeight;
}

// ============================================================================
// TRANSACTION HELPERS
// ============================================================================

/**
 * Confirm a transaction
 *
 * Waits for transaction to be confirmed.
 *
 * @param signature Transaction signature
 * @returns True if confirmed
 */
export async function confirmTransaction(
  signature: string
): Promise<boolean> {
  const connection = getConnection();

  try {
    const confirmation = await connection.confirmTransaction(
      signature,
      'confirmed'
    );

    if (confirmation.value.err) {
      logger.error({ error: confirmation.value.err }, 'Transaction failed on-chain');
      return false;
    }

    logger.info({ signature }, 'Transaction confirmed');
    return true;
  } catch (error) {
    logger.error({ error, signature }, 'Transaction confirmation failed');

    // Try failover on error
    if (activeEndpoint === 'primary') {
      failoverToBackup();
    }

    return false;
  }
}

/**
 * Get transaction signature URL for explorer
 *
 * @param signature Transaction signature
 * @returns Solscan explorer URL
 */
export function getExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Mask URL for logging (hide API keys)
 */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove potential API key from pathname
    if (parsed.pathname.length > 20) {
      parsed.pathname = parsed.pathname.slice(0, 10) + '...';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Reset connections (for testing)
 *
 * @internal
 */
export function _resetConnections(): void {
  primaryConnection = null;
  backupConnection = null;
  activeConnection = null;
  activeEndpoint = 'primary';
  state.endpoint = 'primary';
  state.healthy = true;
  state.lastCheck = Date.now();
  state.failureCount = 0;
}
