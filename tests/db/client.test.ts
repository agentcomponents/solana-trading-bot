/**
 * Tests for Database Client
 *
 * Tests database connection, basic operations, and utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestDb,
  type DatabaseClient
} from '../../src/db/client';
import { initializeDatabase } from '../../src/db/init';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Database Client', () => {
  let db: DatabaseClient;

  beforeEach(() => {
    db = createTestDb();
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Connection', () => {
    it('should connect to in-memory database', () => {
      expect(db.isConnected()).toBe(true);
    });

    it('should close connection', () => {
      db.close();
      expect(db.isConnected()).toBe(false);
    });

    it('should reconnect after close', () => {
      db.close();
      db.connect();
      expect(db.isConnected()).toBe(true);
    });
  });

  describe('Table Operations', () => {
    it('should list all tables', () => {
      const tables = db.getTables();

      expect(tables).toContain('token_metadata');
      expect(tables).toContain('positions');
      expect(tables).toContain('safety_checks');
      expect(tables).toContain('trades');
      expect(tables).toContain('compounding_state');
      expect(tables).toContain('performance_snapshots');
      expect(tables).toContain('position_sizes');
      expect(tables).toContain('withdrawals');
      expect(tables).toContain('schema_migrations');
    });

    it('should check if table exists', () => {
      expect(db.tableExists('positions')).toBe(true);
      expect(db.tableExists('nonexistent')).toBe(false);
    });
  });

  describe('Basic Operations', () => {
    it('should insert and select data', () => {
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, ['test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now()]);

      const row = db.get<{ id: string }>(
        'SELECT id FROM token_metadata WHERE id = ?',
        ['test_mint']
      );

      expect(row).toBeDefined();
      expect(row?.id).toBe('test_mint');
    });

    it('should select all rows', () => {
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, ['mint1', 'A', 6, Date.now(), Date.now(), Date.now()]);
      db.run(sql, ['mint2', 'B', 9, Date.now(), Date.now(), Date.now()]);

      const rows = db.all<{ id: string }>(
        'SELECT id FROM token_metadata ORDER BY id'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]?.id).toBe('mint1');
      expect(rows[1]?.id).toBe('mint2');
    });

    it('should update data', () => {
      const insertSql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(insertSql, ['test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now()]);

      const updateSql = 'UPDATE token_metadata SET symbol = ? WHERE id = ?';
      const result = db.run(updateSql, ['NEW', 'test_mint']);

      expect(result.changes).toBe(1);

      const row = db.get<{ symbol: string }>(
        'SELECT symbol FROM token_metadata WHERE id = ?',
        ['test_mint']
      );

      expect(row?.symbol).toBe('NEW');
    });

    it('should delete data', () => {
      const insertSql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(insertSql, ['test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now()]);

      const deleteSql = 'DELETE FROM token_metadata WHERE id = ?';
      const result = db.run(deleteSql, ['test_mint']);

      expect(result.changes).toBe(1);

      const row = db.get('SELECT * FROM token_metadata WHERE id = ?', ['test_mint']);

      expect(row).toBeUndefined();
    });
  });

  describe('Transactions', () => {
    it('should commit transaction', () => {
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.getDb().transaction(() => {
        db.getDb().prepare(sql).run('test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now());
      })();

      const row = db.get('SELECT * FROM token_metadata WHERE id = ?', ['test_mint']);
      expect(row).toBeDefined();
    });

    it('should rollback on error', () => {
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      expect(() =>
        db.getDb().transaction(() => {
          const stmt = db.getDb().prepare(sql);
          stmt.run('test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now());
          throw new Error('Intentional error');
        })()
      ).toThrow('Intentional error');

      const row = db.get('SELECT * FROM token_metadata WHERE id = ?', ['test_mint']);
      expect(row).toBeUndefined();
    });

    it('should handle nested transactions', () => {
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const stmt = db.getDb().prepare(sql);

      db.getDb().transaction(() => {
        stmt.run('mint1', 'A', 6, Date.now(), Date.now(), Date.now());
        stmt.run('mint2', 'B', 9, Date.now(), Date.now(), Date.now());
      })();

      const count = db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM token_metadata'
      );

      expect(count?.count).toBe(2);
    });
  });

  describe('Prepared Statements', () => {
    it('should prepare and reuse statement', () => {
      const stmt = db.prepare(
        'INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
      );

      stmt.run(['mint1', 'A', 6, Date.now(), Date.now(), Date.now()]);
      stmt.run(['mint2', 'B', 9, Date.now(), Date.now(), Date.now()]);
      stmt.run(['mint3', 'C', 6, Date.now(), Date.now(), Date.now()]);

      const count = db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM token_metadata'
      );

      expect(count?.count).toBe(3);
    });

    it('should get single row with prepared statement', () => {
      db.run(
        'INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        ['test_mint', 'TEST', 6, Date.now(), Date.now(), Date.now()]
      );

      const stmt = db.prepare('SELECT * FROM token_metadata WHERE id = ?');
      const row = stmt.get(['test_mint']);

      expect(row).toBeDefined();
      expect((row as { id: string }).id).toBe('test_mint');
    });

    it('should get all rows with prepared statement', () => {
      const stmt = db.prepare(
        'INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
      );

      stmt.run(['mint1', 'A', 6, Date.now(), Date.now(), Date.now()]);
      stmt.run(['mint2', 'B', 9, Date.now(), Date.now(), Date.now()]);

      const selectStmt = db.prepare('SELECT id FROM token_metadata ORDER BY id');
      const rows = selectStmt.all();

      expect(rows).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    it('should get database stats', () => {
      const stats = db.getStats();

      expect(stats.tables).toBeGreaterThan(0);
      expect(stats.pageSize).toBeGreaterThan(0);
      expect(stats.pageCount).toBeGreaterThanOrEqual(0);
      expect(stats.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Exec', () => {
    it('should execute multiple statements', () => {
      const now = Date.now();
      const sql = `
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES ('mint1', 'A', 6, ${now}, ${now}, ${now});
        INSERT INTO token_metadata (id, symbol, decimals, lastFetchedAt, createdAt, updatedAt)
        VALUES ('mint2', 'B', 9, ${now}, ${now}, ${now});
      `;

      db.exec(sql);

      const count = db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM token_metadata'
      );

      expect(count?.count).toBe(2);
    });
  });
});
