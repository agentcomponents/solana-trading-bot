/**
 * Tests for Position Repository
 *
 * CRITICAL: Tests verify proper handling of raw token amounts
 * which is essential for accurate exit calculations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../src/db/client';
import { initializeDatabase } from '../../src/db/init';
import {
  createPositionRepository,
  createTokenMetadataRepository,
  type Position
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

// Helper to create token metadata before position
function createTokenMetadata(db: ReturnType<typeof createTestDb>, mint: string, decimals = 6) {
  const metadataRepo = createTokenMetadataRepository(db.getDb());
  metadataRepo.create({
    id: mint,
    symbol: 'TEST',
    decimals
  });
}

// Helper to create a position with its metadata
function createTestPosition(
  db: ReturnType<typeof createTestDb>,
  mint: string,
  overrides: Partial<Parameters<ReturnType<typeof createPositionRepository>['create']>[0]> = {}
) {
  createTokenMetadata(db, mint);
  const repo = createPositionRepository(db.getDb());
  return repo.create({
    tokenMint: mint,
    entrySolSpent: '100000000',
    entryTimestamp: Date.now(),
    entryPricePerToken: 0.00001,
    tokensReceivedRaw: '10000000',
    tokenDecimals: 6,
    ...overrides
  });
}

describe('Position Repository', () => {
  let db = createTestDb();

  beforeEach(() => {
    db = createTestDb();
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Create', () => {
    it('should create position with required fields', () => {
      const position = createTestPosition(db, 'mint1');

      expect(position.id).toBeDefined();
      expect(position.state).toBe('ENTERING');
      expect(position.tokenMint).toBe('mint1');
      expect(position.entrySolSpent).toBe('100000000');
      expect(position.tokensReceivedRaw).toBe('10000000');
      expect(position.tokenDecimals).toBe(6);
    });

    it('should set default peak price to entry price', () => {
      const position = createTestPosition(db, 'mint1');

      expect(position.peakPricePerToken).toBe(0.00001);
      expect(position.peakTimestamp).toBe(position.entryTimestamp);
    });

    it('should allow custom peak price', () => {
      const timestamp = Date.now();
      createTokenMetadata(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const position = repo.create({
        tokenMint: 'mint1',
        entrySolSpent: '100000000',
        entryTimestamp: timestamp,
        entryPricePerToken: 0.00001,
        tokensReceivedRaw: '10000000',
        tokenDecimals: 6,
        peakPricePerToken: 0.000015,
        peakTimestamp: timestamp + 1000
      });

      expect(position.peakPricePerToken).toBe(0.000015);
      expect(position.peakTimestamp).toBe(timestamp + 1000);
    });

    it('should set null exit values', () => {
      const position = createTestPosition(db, 'mint1');

      expect(position.exitTimestamp).toBeNull();
      expect(position.exitSolReceived).toBeNull();
      expect(position.exitPricePerToken).toBeNull();
      expect(position.exitReason).toBeNull();
    });
  });

  describe('Find', () => {
    beforeEach(() => {
      // Create test positions
      createTestPosition(db, 'mint1', {
        entryTimestamp: Date.now() - 10000
      });

      createTestPosition(db, 'mint2', {
        entrySolSpent: '200000000',
        entryTimestamp: Date.now() - 5000,
        entryPricePerToken: 0.00002,
        tokensReceivedRaw: '20000000'
      });
    });

    it('should find by id', () => {
      const repo = createPositionRepository(db.getDb());
      const all = repo.findAll();
      const firstId = all[0]?.id;

      if (!firstId) {
        throw new Error('No position found');
      }

      const found = repo.findById(firstId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(firstId);
    });

    it('should find all', () => {
      const repo = createPositionRepository(db.getDb());

      const all = repo.findAll();

      expect(all).toHaveLength(2);
    });

    it('should find by state', () => {
      const repo = createPositionRepository(db.getDb());

      const entering = repo.findByState('ENTERING');

      expect(entering).toHaveLength(2);
    });

    it('should find by token', () => {
      const repo = createPositionRepository(db.getDb());

      const mint1Positions = repo.findByToken('mint1');

      expect(mint1Positions).toHaveLength(1);
      expect(mint1Positions[0]?.tokenMint).toBe('mint1');
    });
  });

  describe('Active Positions', () => {
    it('should find active positions', () => {
      const repo = createPositionRepository(db.getDb());

      // Create various states
      const pos1 = createTestPosition(db, 'mint1');
      repo.updateState(pos1.id, 'ACTIVE');

      const pos2 = createTestPosition(db, 'mint2');
      repo.recordExit(pos2.id, '150000000', 0.000015, 'TAKE_PROFIT_1');

      const pos3 = createTestPosition(db, 'mint3');
      repo.updateState(pos3.id, 'PARTIAL_EXIT_1');

      const active = repo.findActive();

      expect(active).toHaveLength(2);
      expect(active.some((p) => p.id === pos1.id)).toBe(true);
      expect(active.some((p) => p.id === pos3.id)).toBe(true);
    });
  });

  describe('Update State', () => {
    it('should update state', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const updated = repo.updateState(position.id, 'ACTIVE');

      expect(updated).toBeDefined();
      expect(updated?.state).toBe('ACTIVE');
    });

    it('should update timestamp on state change', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const originalUpdatedAt = position.updatedAt;

      // Wait to ensure different timestamp
      const startTime = Date.now();
      while (Date.now() - startTime < 2) {
        // Busy wait
      }

      repo.updateState(position.id, 'ACTIVE');

      const updated = repo.findById(position.id);

      expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe('Update Peak Price', () => {
    it('should update peak price when new price is higher', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const updated = repo.updatePeakPrice(position.id, 0.000015, Date.now());

      expect(updated).toBeDefined();
      expect(updated?.peakPricePerToken).toBe(0.000015);
    });

    it('should not update peak price when new price is lower', () => {
      createTokenMetadata(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const position = repo.create({
        tokenMint: 'mint1',
        entrySolSpent: '100000000',
        entryTimestamp: Date.now(),
        entryPricePerToken: 0.00001,
        tokensReceivedRaw: '10000000',
        tokenDecimals: 6,
        peakPricePerToken: 0.00002,
        peakTimestamp: Date.now()
      });

      const updated = repo.updatePeakPrice(position.id, 0.000015, Date.now());

      expect(updated).toBeDefined();
      expect(updated?.peakPricePerToken).toBe(0.00002); // Unchanged
    });

    it('should update peak timestamp when price increases', () => {
      const newTimestamp = Date.now() + 5000;
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      repo.updatePeakPrice(position.id, 0.00002, newTimestamp);

      const updated = repo.findById(position.id);

      expect(updated?.peakTimestamp).toBe(newTimestamp);
    });
  });

  describe('Record Exit', () => {
    it('should record exit data', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const exited = repo.recordExit(
        position.id,
        '150000000', // 0.15 SOL received
        0.000015,
        'TAKE_PROFIT_1'
      );

      expect(exited).toBeDefined();
      expect(exited?.state).toBe('CLOSED');
      expect(exited?.exitSolReceived).toBe('150000000');
      expect(exited?.exitPricePerToken).toBe(0.000015);
      expect(exited?.exitReason).toBe('TAKE_PROFIT_1');
      expect(exited?.exitTimestamp).toBeGreaterThan(0);
    });

    it('should handle all exit reasons', () => {
      const repo = createPositionRepository(db.getDb());

      const reasons = [
        'STOP_LOSS',
        'TAKE_PROFIT_1',
        'TAKE_PROFIT_2',
        'TRAILING_STOP',
        'MAX_HOLD_TIME',
        'EMERGENCY',
        'MANUAL'
      ] as const;

      for (const reason of reasons) {
        const position = createTestPosition(db, `mint_${reason}`);

        const exited = repo.recordExit(
          position.id,
          '150000000',
          0.000015,
          reason
        );

        expect(exited?.exitReason).toBe(reason);
      }
    });
  });

  describe('Mark Failed', () => {
    it('should mark position as failed', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const failed = repo.markFailed(position.id);

      expect(failed).toBeDefined();
      expect(failed?.state).toBe('FAILED');
    });
  });

  describe('Calculate P&L', () => {
    it('should calculate profit', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      repo.recordExit(position.id, '150000000', 0.000015, 'TAKE_PROFIT_1');

      const pnl = repo.calculatePnL(repo.findById(position.id)!);

      expect(pnl).not.toBeNull();
      expect(pnl?.isProfit).toBe(true);
      expect(pnl?.percentage).toBe(50); // +50%
      expect(pnl?.solAmount).toBe('50000000'); // 0.05 SOL profit
    });

    it('should calculate loss', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      repo.recordExit(position.id, '60000000', 0.000006, 'STOP_LOSS');

      const pnl = repo.calculatePnL(repo.findById(position.id)!);

      expect(pnl).not.toBeNull();
      expect(pnl?.isProfit).toBe(false);
      expect(pnl?.percentage).toBe(-40); // -40%
      expect(pnl?.solAmount).toBe('-40000000'); // 0.04 SOL loss
    });

    it('should return null for open position', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const pnl = repo.calculatePnL(position);

      expect(pnl).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should get position stats', () => {
      const repo = createPositionRepository(db.getDb());

      // Create various positions
      const p1 = createTestPosition(db, 'mint1');
      repo.updateState(p1.id, 'ACTIVE');

      const p2 = createTestPosition(db, 'mint2');
      repo.recordExit(p2.id, '150000000', 0.000015, 'TAKE_PROFIT_1');

      const p3 = createTestPosition(db, 'mint3');
      repo.markFailed(p3.id);

      const stats = repo.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.closed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should calculate total P&L', () => {
      const repo = createPositionRepository(db.getDb());

      // Winning trade
      const p1 = createTestPosition(db, 'mint1');
      repo.recordExit(p1.id, '150000000', 0.000015, 'TAKE_PROFIT_1');

      // Losing trade
      const p2 = createTestPosition(db, 'mint2');
      repo.recordExit(p2.id, '60000000', 0.000006, 'STOP_LOSS');

      // Another winning trade
      const p3 = createTestPosition(db, 'mint3');
      repo.recordExit(p3.id, '200000000', 0.00002, 'TAKE_PROFIT_2');

      const totalPnL = repo.getTotalPnL();

      // 0.05 + -0.04 + 0.1 = 0.11 SOL profit
      expect(totalPnL.totalPnlSol).toBe('110000000');
      expect(totalPnL.winCount).toBe(2);
      expect(totalPnL.lossCount).toBe(1);
      expect(totalPnL.winRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('Delete', () => {
    it('should delete position', () => {
      const position = createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      const deleted = repo.delete(position.id);

      expect(deleted).toBe(true);

      const found = repo.findById(position.id);
      expect(found).toBeUndefined();
    });

    it('should delete many', () => {
      const repo = createPositionRepository(db.getDb());

      const p1 = createTestPosition(db, 'mint1');
      repo.updateState(p1.id, 'CLOSED');

      const p2 = createTestPosition(db, 'mint2');
      repo.updateState(p2.id, 'CLOSED');

      createTestPosition(db, 'mint3');

      const count = repo.deleteMany(
        { state: 'CLOSED' } as Partial<Position>
      );

      expect(count).toBe(2);
      expect(repo.count()).toBe(1);
    });
  });

  describe('Count', () => {
    it('should count all positions', () => {
      createTestPosition(db, 'mint1');
      createTestPosition(db, 'mint2');

      const repo = createPositionRepository(db.getDb());
      expect(repo.count()).toBe(2);
    });

    it('should count with where clause', () => {
      const repo = createPositionRepository(db.getDb());

      const p1 = createTestPosition(db, 'mint1');
      repo.updateState(p1.id, 'ACTIVE');

      createTestPosition(db, 'mint2');

      expect(repo.count({ state: 'ACTIVE' } as Partial<Position>)).toBe(1);
    });

    it('should check existence', () => {
      createTestPosition(db, 'mint1');
      const repo = createPositionRepository(db.getDb());

      expect(repo.exists({ tokenMint: 'mint1' } as Partial<Position>)).toBe(true);
      expect(repo.exists({ tokenMint: 'nonexistent' } as Partial<Position>)).toBe(false);
    });
  });
});
