/**
 * Repository Pattern Implementation
 *
 * Provides a consistent interface for data access with:
 * - Standard CRUD operations
 * - Query building
 * - Transaction support
 * - Type safety
 */

import type { Database, RunResult } from 'better-sqlite3';
import { logger } from '../utils/logger';

// ============================================================================
// BASE TYPES
// ============================================================================

export type Id = string | number;

export interface FindOptions<T> {
  where?: Partial<Record<keyof T, unknown>>;
  orderBy?: keyof T | readonly [keyof T, 'ASC' | 'DESC'];
  limit?: number;
  offset?: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// BASE REPOSITORY INTERFACE
// ============================================================================

/**
 * Base repository interface with standard CRUD operations
 */
export interface Repository<T, CreateInput, UpdateInput = Partial<CreateInput>> {
  /**
   * Find all records matching options
   */
  findAll(options?: FindOptions<T>): T[];

  /**
   * Find a single record by ID
   */
  findById(id: Id): T | undefined;

  /**
   * Find a single record matching criteria
   */
  findOne(where: Partial<Record<keyof T, unknown>>): T | undefined;

  /**
   * Create a new record
   */
  create(input: CreateInput): T;

  /**
   * Create multiple records
   */
  createMany(inputs: CreateInput[]): T[];

  /**
   * Update a record by ID
   */
  update(id: Id, input: UpdateInput): T | undefined;

  /**
   * Update multiple records matching criteria
   */
  updateMany(
    where: Partial<Record<keyof T, unknown>>,
    input: UpdateInput
  ): number;

  /**
   * Delete a record by ID
   */
  delete(id: Id): boolean;

  /**
   * Delete multiple records matching criteria
   */
  deleteMany(where: Partial<Record<keyof T, unknown>>): number;

  /**
   * Count records matching criteria
   */
  count(where?: Partial<Record<keyof T, unknown>>): number;

  /**
   * Check if any records exist matching criteria
   */
  exists(where: Partial<Record<keyof T, unknown>>): boolean;

  /**
   * Find records with pagination
   */
  findPaginated(
    options?: FindOptions<T> & PaginationOptions
  ): PaginatedResult<T>;
}

// ============================================================================
// BASE REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * Abstract base repository with common functionality
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput>
  implements Repository<T, CreateInput, UpdateInput>
{
  constructor(
    protected db: Database,
    protected tableName: string,
    protected idColumn: keyof T = 'id' as keyof T
  ) {}

  // ------------------------------------------------------------------
  // CRUD OPERATIONS
  // ------------------------------------------------------------------

  findAll(options?: FindOptions<T>): T[] {
    const sql = this.buildSelectQuery(options);
    const params = this.buildParams(options?.where);
    return this.db.prepare(sql).all(...params) as T[];
  }

  findById(id: Id): T | undefined {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${this.idColumn as string} = ? LIMIT 1`;
    return this.db.prepare(sql).get(id) as T | undefined;
  }

  findOne(where: Partial<Record<keyof T, unknown>>): T | undefined {
    const whereClause = this.buildWhereClause(where);
    const params = Object.values(where);
    const sql = `SELECT * FROM ${this.tableName} ${whereClause} LIMIT 1`;
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  create(input: CreateInput): T {
    const columns = Object.keys(input as Record<string, unknown>);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(input as Record<string, unknown>);

    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = this.db.prepare(sql).get(...values) as T;

    logger.debug(
      { table: this.tableName, id: (result as Record<string, unknown>)[this.idColumn as string] },
      'Created record'
    );

    return result;
  }

  createMany(inputs: CreateInput[]): T[] {
    return this.db.transaction(() => {
      const results: T[] = [];
      for (const input of inputs) {
        results.push(this.create(input));
      }
      return results;
    })();
  }

  update(id: Id, input: UpdateInput): T | undefined {
    const updates = Object.keys(input as Record<string, unknown>)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = [...Object.values(input as Record<string, unknown>), id];

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates}
      WHERE ${this.idColumn as string} = ?
      RETURNING *
    `;

    const result = this.db.prepare(sql).get(...values) as T | undefined;

    if (result) {
      logger.debug(
        { table: this.tableName, id },
        'Updated record'
      );
    }

    return result;
  }

  updateMany(
    where: Partial<Record<keyof T, unknown>>,
    input: UpdateInput
  ): number {
    const whereClause = this.buildWhereClause(where);
    const updates = Object.keys(input as Record<string, unknown>)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = [
      ...Object.values(input as Record<string, unknown>),
      ...Object.values(where)
    ];

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates}
      ${whereClause}
    `;

    const result = this.db.prepare(sql).run(...values);

    logger.debug(
      { table: this.tableName, count: result.changes },
      'Updated records'
    );

    return result.changes;
  }

  delete(id: Id): boolean {
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.idColumn as string} = ?`;
    const result = this.db.prepare(sql).run(id);

    if (result.changes > 0) {
      logger.debug({ table: this.tableName, id }, 'Deleted record');
      return true;
    }

    return false;
  }

  deleteMany(where: Partial<Record<keyof T, unknown>>): number {
    const whereClause = this.buildWhereClause(where);
    const params = Object.values(where);
    const sql = `DELETE FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).run(...params);

    logger.debug(
      { table: this.tableName, count: result.changes },
      'Deleted records'
    );

    return result.changes;
  }

  count(where?: Partial<Record<keyof T, unknown>>): number {
    const whereClause = where ? this.buildWhereClause(where) : '';
    const params = where ? Object.values(where) : [];

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  exists(where: Partial<Record<keyof T, unknown>>): boolean {
    return this.count(where) > 0;
  }

  findPaginated(
    options?: FindOptions<T> & PaginationOptions
  ): PaginatedResult<T> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 10;
    const offset = (page - 1) * limit;

    // Get total count
    const total = this.count(options?.where);

    // Get data
    const data = this.findAll({
      ...options,
      limit,
      offset
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ------------------------------------------------------------------
  // QUERY BUILDERS
  // ------------------------------------------------------------------

  /**
   * Build SELECT query with optional WHERE, ORDER BY, LIMIT
   */
  protected buildSelectQuery(options?: FindOptions<T>): string {
    const parts: string[] = [`SELECT * FROM ${this.tableName}`];

    if (options?.where && Object.keys(options.where).length > 0) {
      parts.push(this.buildWhereClause(options.where));
    }

    if (options?.orderBy) {
      const column = Array.isArray(options.orderBy)
        ? options.orderBy[0]
        : options.orderBy;
      const direction = Array.isArray(options.orderBy)
        ? options.orderBy[1]
        : 'ASC';
      parts.push(`ORDER BY ${column as string} ${direction}`);
    }

    if (options?.limit) {
      parts.push(`LIMIT ${options.limit}`);
    }

    if (options?.offset) {
      parts.push(`OFFSET ${options.offset}`);
    }

    return parts.join(' ');
  }

  /**
   * Build WHERE clause from object
   */
  protected buildWhereClause(
    where: Partial<Record<keyof T, unknown>>
  ): string {
    const conditions = Object.entries(where)
      .map(([key, value]) => {
        if (value === null) {
          return `${key} IS NULL`;
        }
        return `${key} = ?`;
      })
      .join(' AND ');

    return conditions ? `WHERE ${conditions}` : '';
  }

  /**
   * Build params array from where object
   */
  protected buildParams(
    where?: Partial<Record<keyof T, unknown>>
  ): unknown[] {
    if (!where) return [];

    return Object.values(where).filter((v) => v !== null);
  }

  // ------------------------------------------------------------------
  // UTILITY METHODS
  // ------------------------------------------------------------------

  /**
   * Execute raw SQL query
   */
  protected query<R = unknown>(sql: string, params: unknown[] = []): R[] {
    return this.db.prepare(sql).all(...params) as R[];
  }

  /**
   * Execute raw SQL and get first result
   */
  protected queryFirst<R = unknown>(
    sql: string,
    params: unknown[] = []
  ): R | undefined {
    return this.db.prepare(sql).get(...params) as R | undefined;
  }

  /**
   * Execute update/delete/insert
   */
  protected execute(sql: string, params: unknown[] = []): RunResult {
    return this.db.prepare(sql).run(...params);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types already exported at top of file
