/**
 * Tests for Token Metadata Repository
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../src/db/client';
import { initializeDatabase } from '../../src/db/init';
import {
  createTokenMetadataRepository,
  type TokenMetadata
} from '../../src/db';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Token Metadata Repository', () => {
  let db = createTestDb();

  beforeEach(() => {
    db = createTestDb();
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Create', () => {
    it('should create token metadata', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const metadata = repo.create({
        id: 'mint1',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        supply: '1000000000000'
      });

      expect(metadata.id).toBe('mint1');
      expect(metadata.symbol).toBe('USDC');
      expect(metadata.name).toBe('USD Coin');
      expect(metadata.decimals).toBe(6);
      expect(metadata.supply).toBe('1000000000000');
    });

    it('should create with null values', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const metadata = repo.create({
        id: 'mint1',
        decimals: 6
      });

      expect(metadata.symbol).toBeNull();
      expect(metadata.name).toBeNull();
      expect(metadata.supply).toBeNull();
    });

    it('should set timestamps', () => {
      const repo = createTokenMetadataRepository(db.getDb());
      const now = Date.now();

      const metadata = repo.create({
        id: 'mint1',
        decimals: 6
      });

      expect(metadata.createdAt).toBeGreaterThanOrEqual(now);
      expect(metadata.updatedAt).toBeGreaterThanOrEqual(now);
      expect(metadata.lastFetchedAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe('Find', () => {
    it('should find by id', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        symbol: 'USDC',
        decimals: 6
      });

      const found = repo.findById('mint1');

      expect(found).toBeDefined();
      expect(found?.id).toBe('mint1');
      expect(found?.symbol).toBe('USDC');
    });

    it('should return undefined when not found', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const found = repo.findById('nonexistent');

      expect(found).toBeUndefined();
    });

    it('should find by mint address', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        symbol: 'USDC',
        decimals: 6
      });

      const found = repo.findByMint('mint1');

      expect(found).toBeDefined();
      expect(found?.id).toBe('mint1');
    });

    it('should find by symbol', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', symbol: 'USDC', decimals: 6 });
      repo.create({ id: 'mint2', symbol: 'USDC', decimals: 9 });
      repo.create({ id: 'mint3', symbol: 'SOL', decimals: 9 });

      const usdcTokens = repo.findBySymbol('USDC');

      expect(usdcTokens).toHaveLength(2);
      expect(usdcTokens[0]?.symbol).toBe('USDC');
      expect(usdcTokens[1]?.symbol).toBe('USDC');
    });

    it('should find all with options', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', symbol: 'USDC', decimals: 6 });
      repo.create({ id: 'mint2', symbol: 'USDT', decimals: 6 });
      repo.create({ id: 'mint3', symbol: 'SOL', decimals: 9 });

      const all = repo.findAll();

      expect(all).toHaveLength(3);
    });

    it('should find with where clause', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', symbol: 'USDC', decimals: 6 });
      repo.create({ id: 'mint2', symbol: 'USDT', decimals: 6 });
      repo.create({ id: 'mint3', symbol: 'SOL', decimals: 9 });

      const sixDecimal = repo.findAll({
        where: { decimals: 6 } as Partial<TokenMetadata>
      });

      expect(sixDecimal).toHaveLength(2);
    });
  });

  describe('Update', () => {
    it('should update metadata', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        symbol: 'USDC',
        decimals: 6
      });

      const updated = repo.update('mint1', {
        symbol: 'NEW_USDC',
        name: 'New USD Coin'
      });

      expect(updated).toBeDefined();
      expect(updated?.symbol).toBe('NEW_USDC');
      expect(updated?.name).toBe('New USD Coin');
    });

    it('should return undefined when updating non-existent', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const updated = repo.update('nonexistent', {
        symbol: 'NEW'
      });

      expect(updated).toBeUndefined();
    });

    it('should touch to update timestamp', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        decimals: 6
      });

      // Wait a bit to ensure timestamp difference
      const startTime = Date.now();
      while (Date.now() - startTime < 2) {
        // Busy wait
      }

      repo.touch('mint1');

      const found = repo.findById('mint1');
      expect(found?.lastFetchedAt).toBeGreaterThan(0);
    });
  });

  describe('Delete', () => {
    it('should delete by id', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        decimals: 6
      });

      const deleted = repo.delete('mint1');

      expect(deleted).toBe(true);

      const found = repo.findById('mint1');
      expect(found).toBeUndefined();
    });

    it('should return false when deleting non-existent', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const deleted = repo.delete('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should delete many', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', symbol: 'A', decimals: 6 });
      repo.create({ id: 'mint2', symbol: 'A', decimals: 6 });
      repo.create({ id: 'mint3', symbol: 'B', decimals: 9 });

      const count = repo.deleteMany(
        { symbol: 'A' } as Partial<TokenMetadata>
      );

      expect(count).toBe(2);

      const remaining = repo.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe('mint3');
    });
  });

  describe('Count', () => {
    it('should count all records', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', decimals: 6 });
      repo.create({ id: 'mint2', decimals: 6 });
      repo.create({ id: 'mint3', decimals: 9 });

      expect(repo.count()).toBe(3);
    });

    it('should count with where clause', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({ id: 'mint1', symbol: 'A', decimals: 6 });
      repo.create({ id: 'mint2', symbol: 'A', decimals: 6 });
      repo.create({ id: 'mint3', symbol: 'B', decimals: 9 });

      expect(repo.count({ symbol: 'A' } as Partial<TokenMetadata>)).toBe(2);
    });

    it('should check existence', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      repo.create({
        id: 'mint1',
        decimals: 6
      });

      expect(repo.exists({ id: 'mint1' } as Partial<TokenMetadata>)).toBe(true);
      expect(repo.exists({ id: 'nonexistent' } as Partial<TokenMetadata>)).toBe(false);
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      const repo = createTokenMetadataRepository(db.getDb());

      for (let i = 1; i <= 15; i++) {
        repo.create({
          id: `mint${i}`,
          symbol: `T${i}`,
          decimals: 6
        });
      }
    });

    it('should paginate results', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const page1 = repo.findPaginated({ page: 1, limit: 5 });

      expect(page1.data).toHaveLength(5);
      expect(page1.total).toBe(15);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(5);
      expect(page1.totalPages).toBe(3);
    });

    it('should get second page', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const page2 = repo.findPaginated({ page: 2, limit: 5 });

      expect(page2.data).toHaveLength(5);
      expect(page2.page).toBe(2);
    });

    it('should get last page', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const page3 = repo.findPaginated({ page: 3, limit: 5 });

      expect(page3.data).toHaveLength(5);
      expect(page3.page).toBe(3);
    });

    it('should return empty for page beyond range', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const page100 = repo.findPaginated({ page: 100, limit: 5 });

      expect(page100.data).toHaveLength(0);
      expect(page100.page).toBe(100);
    });
  });

  describe('Utility Methods', () => {
    it('should get or create', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      // First call creates
      const metadata1 = repo.getOrCreate('mint1', {
        symbol: 'USDC',
        decimals: 6
      });

      expect(metadata1.id).toBe('mint1');
      expect(metadata1.symbol).toBe('USDC');

      // Second call returns existing
      const metadata2 = repo.getOrCreate('mint1', {
        symbol: 'DIFFERENT',
        decimals: 9
      });

      expect(metadata2.id).toBe('mint1');
      expect(metadata2.symbol).toBe('USDC'); // Unchanged

      // Only one record exists
      expect(repo.count()).toBe(1);
    });

    it('should find stale metadata', () => {
      const repo = createTokenMetadataRepository(db.getDb());
      const now = Date.now();

      // Insert old metadata directly with custom timestamp
      db.getDb().prepare(
        'INSERT INTO token_metadata (id, decimals, lastFetchedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
      ).run('old_mint', 6, now - 1000 * 60 * 10, now - 1000 * 60 * 10, now - 1000 * 60 * 10);

      // Insert recent metadata
      repo.create({
        id: 'new_mint',
        decimals: 6
      });

      const stale = repo.findStale(60); // Older than 1 minute

      expect(stale).toHaveLength(1);
      expect(stale[0]?.id).toBe('old_mint');
    });
  });

  describe('Create Many', () => {
    it('should create multiple records in transaction', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      const result = repo.createMany([
        { id: 'mint1', symbol: 'A', decimals: 6 },
        { id: 'mint2', symbol: 'B', decimals: 9 },
        { id: 'mint3', symbol: 'C', decimals: 6 }
      ]);

      expect(result).toHaveLength(3);
      expect(repo.count()).toBe(3);
    });

    it('should rollback all on error', () => {
      const repo = createTokenMetadataRepository(db.getDb());

      // Create first one to establish constraint
      repo.create({ id: 'mint1', decimals: 6 });

      // Try to create duplicate - should fail and rollback
      expect(() =>
        repo.createMany([
          { id: 'mint2', decimals: 6 },
          { id: 'mint1', decimals: 9 } // Duplicate!
        ])
      ).toThrow();

      // Original record still exists, but mint2 was not added
      expect(repo.count()).toBe(1);
      expect(repo.findById('mint2')).toBeUndefined();
    });
  });
});
