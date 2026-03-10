import Database from 'better-sqlite3';
import path from 'path';

// Path to the main bot's database
const DB_PATH = path.join(process.cwd(), '..', 'data', 'trading-bot.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    console.log('Opening database at:', DB_PATH);
    try {
      db = new Database(DB_PATH, { readonly: true });
      // Enable WAL mode for better concurrent access
      db.pragma('journal_mode = WAL');
    } catch (error) {
      console.error('Failed to open database:', error);
      throw error;
    }
  }
  return db;
}

export interface Position {
  id: string;
  state: string;
  tokenMint: string;
  entrySolSpent: string;
  entryTimestamp: number;
  entryPricePerToken: number;
  tokensReceivedRaw: string;
  tokenDecimals: number;
  exitTimestamp: number | null;
  exitSolReceived: string | null;
  exitPricePerToken: number | null;
  exitReason: string | null;
  peakPricePerToken: number;
  peakTimestamp: number;
  createdAt: number;
  updatedAt: number;
}

export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface ScannedToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChangeH1: number;
  priceChangeH24: number;
  liquidity: number;
  volume24h: number;
  opportunityScore: number;
}
