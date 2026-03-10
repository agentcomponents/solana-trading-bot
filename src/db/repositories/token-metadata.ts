/**
 * Token Metadata Repository
 *
 * Manages cached token metadata (decimals, symbol, name) to avoid
 * repeated RPC calls to the blockchain.
 */

import type { Database } from 'better-sqlite3';
import { BaseRepository } from '../repository';
import type { TokenMetadata } from '../schema';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateTokenMetadataInput {
  id: string; // mint address
  symbol?: string | null;
  name?: string | null;
  decimals: number;
  supply?: string | null;
}

export interface UpdateTokenMetadataInput {
  symbol?: string | null;
  name?: string | null;
  decimals?: number;
  supply?: string | null;
  lastFetchedAt?: number;
}

// ============================================================================
// REPOSITORY
// ============================================================================

export class TokenMetadataRepository extends BaseRepository<
  TokenMetadata,
  CreateTokenMetadataInput,
  UpdateTokenMetadataInput
> {
  constructor(db: Database) {
    super(db, 'token_metadata', 'id');
  }

  /**
   * Create token metadata with automatic timestamps
   */
  override create(input: CreateTokenMetadataInput): TokenMetadata {
    const now = Date.now();

    const metadata: TokenMetadata = {
      id: input.id,
      symbol: input.symbol ?? null,
      name: input.name ?? null,
      decimals: input.decimals,
      supply: input.supply ?? null,
      lastFetchedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const sql = `
      INSERT INTO token_metadata (id, symbol, name, decimals, supply, lastFetchedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;

    return this.db.prepare(sql).get(
      metadata.id,
      metadata.symbol,
      metadata.name,
      metadata.decimals,
      metadata.supply,
      metadata.lastFetchedAt,
      metadata.createdAt,
      metadata.updatedAt
    ) as TokenMetadata;
  }

  /**
   * Find by mint address
   */
  findByMint(mint: string): TokenMetadata | undefined {
    return this.findById(mint);
  }

  /**
   * Find by symbol
   */
  findBySymbol(symbol: string): TokenMetadata[] {
    return this.findAll({
      where: { symbol } as Partial<TokenMetadata>
    });
  }

  /**
   * Get or create token metadata
   *
   * Returns existing metadata if found, creates new entry if not.
   */
  getOrCreate(mint: string, defaults: Partial<CreateTokenMetadataInput>): TokenMetadata {
    const existing = this.findByMint(mint);

    if (existing) {
      return existing;
    }

    return this.create({
      id: mint,
      symbol: defaults.symbol ?? null,
      name: defaults.name ?? null,
      decimals: defaults.decimals ?? 0, // Default to 0 if not provided
      supply: defaults.supply ?? null
    });
  }

  /**
   * Update last fetched timestamp
   */
  touch(mint: string): void {
    const now = Date.now();
    const sql = `
      UPDATE token_metadata
      SET lastFetchedAt = ?, updatedAt = ?
      WHERE id = ?
    `;
    void this.db.prepare(sql).run(now, now, mint);
  }

  /**
   * Find stale metadata (older than specified seconds)
   */
  findStale(maxAgeSeconds: number): TokenMetadata[] {
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE lastFetchedAt < ?
      ORDER BY lastFetchedAt ASC
    `;
    return this.db.prepare(sql).all(cutoff) as TokenMetadata[];
  }

  /**
   * Delete old metadata (older than specified days)
   */
  deleteOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE lastFetchedAt < ?
      AND id NOT IN (SELECT DISTINCT tokenMint FROM positions)
    `;
    const result = this.db.prepare(sql).run(cutoff);
    return result.changes;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createTokenMetadataRepository(
  db: Database
): TokenMetadataRepository {
  return new TokenMetadataRepository(db);
}
