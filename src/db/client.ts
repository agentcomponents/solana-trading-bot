/**
 * Database Client - Better SQLite3
 *
 * Provides a singleton database connection with:
 * - WAL mode for performance
 * - Prepared statements
 * - Transaction support
 * - In-memory option for testing
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { logger } from '../utils/logger';

// ============================================================================
// CONFIG
// ============================================================================

export interface DatabaseConfig {
  readonly?: boolean;
  file?: string;
  inMemory?: boolean;
  verbose?: boolean;
}

const DEFAULT_CONFIG: DatabaseConfig = {
  readonly: false,
  inMemory: false,
  verbose: false
};

// ============================================================================
// CLIENT CLASS
// ============================================================================

class DatabaseClient {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize database connection
   */
  connect(options?: any): Database.Database {
    if (this.db) {
      return this.db;
    }

    const filePath = this.getFilePath();
    logger.info({ database: filePath }, 'Connecting to database');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    this.db = new Database(filePath, {
      readonly: this.config.readonly,
      fileMustExist: false,
      timeout: 5000,
      verbose: this.config.verbose
        ? ((msg: string): void => logger.debug({ sql: msg }, 'SQL'))
        : undefined,
      ...options
    });

    // Enable WAL mode for better concurrent performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    logger.info('Database connected');
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database closed');
    }
  }

  /**
   * Get database instance (connects if not already connected)
   */
  getDb(): Database.Database {
    if (!this.db) {
      return this.connect();
    }
    return this.db;
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  /**
   * Execute a SQL statement
   */
  exec(sql: string): void {
    this.getDb().exec(sql);
  }

  /**
   * Prepare a SQL statement
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare(sql: string): any {
    return this.getDb().prepare(sql);
  }

  /**
   * Run a SQL statement (returns info)
   */
  run(sql: string, params?: unknown[]): Database.RunResult {
    const stmt = this.prepare(sql);
    if (params && params.length > 0) {
      return stmt.run(params);
    }
    return stmt.run();
  }

  /**
   * Get a single row
   */
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.prepare(sql);
    if (params && params.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return stmt.get(params);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stmt.get();
  }

  /**
   * Get all rows
   */
  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.prepare(sql);
    if (params && params.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return stmt.all(params);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stmt.all();
  }

  /**
   * Execute in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  /**
   * Get database file path
   */
  private getFilePath(): string | ':memory:' {
    if (this.config.inMemory) {
      return ':memory:';
    }

    const file = this.config.file || this.getDefaultFilePath();
    return path.resolve(file);
  }

  /**
   * Get default database file path
   */
  private getDefaultFilePath(): string {
    const defaultPath = process.env['DB_PATH'] || './data/trading-bot.db';
    return path.resolve(defaultPath);
  }

  /**
   * Check if a table exists
   */
  tableExists(tableName: string): boolean {
    const result = this.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      [tableName]
    );
    return !!result;
  }

  /**
   * Get all table names
   */
  getTables(): string[] {
    const rows = this.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    return rows.map((r) => r.name);
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    const db = this.getDb();
    db.pragma('journal_mode = DELETE');
    db.exec('VACUUM');
    db.pragma('journal_mode = WAL');
    logger.info('Database vacuumed');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    tables: number;
    size: number;
    walSize: number;
    pageSize: number;
    pageCount: number;
  } {
    const db = this.getDb();

    const tables = this.getTables().length;
    // Use prepare for pragmas as they return values in a specific format
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number })?.page_size ?? 4096;
    const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number })?.page_count ?? 0;
    const walCheckpoint = db.pragma('wal_checkpoint(TRUNCATE)');

    return {
      tables,
      size: pageSize * pageCount,
      walSize: Number(walCheckpoint ?? 0),
      pageSize,
      pageCount
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalClient: DatabaseClient | null = null;

/**
 * Get global database client instance
 */
export function getDbClient(config?: DatabaseConfig): DatabaseClient {
  if (!globalClient) {
    globalClient = new DatabaseClient(config);
  }
  return globalClient;
}

/**
 * Close global database client
 */
export function closeDbClient(): void {
  if (globalClient) {
    globalClient.close();
    globalClient = null;
  }
}

/**
 * Create test database (in-memory)
 */
export function createTestDb(): DatabaseClient {
  return new DatabaseClient({ inMemory: true, verbose: false });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DatabaseClient };
export default Database;
