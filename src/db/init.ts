/**
 * Database Initialization
 *
 * Handles schema creation and migrations for the trading bot database.
 */

import { getDbClient, type DatabaseClient } from './client';
import { SCHEMA_SQL, MIGRATIONS_SQL, SCHEMA_VERSION } from './schema';
import { logger } from '../utils/logger';

// ============================================================================
// MIGRATION TYPES
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

export interface MigrationRecord {
  version: number;
  appliedAt: number;
}

// ============================================================================
// MIGRATIONS
// ============================================================================

/**
 * All migrations in order
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: SCHEMA_SQL
  }
  // Future migrations go here
];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize database with schema
 */
export function initializeDatabase(client?: DatabaseClient): void {
  const db = client ?? getDbClient();

  logger.info('Initializing database schema');

  // Create schema
  db.exec(SCHEMA_SQL);

  // Create migrations table if not exists
  db.exec(MIGRATIONS_SQL);

  logger.info(`Database initialized with schema v${SCHEMA_VERSION}`);
}

/**
 * Check if database needs migration
 */
export function needsMigration(client?: DatabaseClient): boolean {
  const db = client ?? getDbClient();

  const record = db.get<MigrationRecord>(
    'SELECT version FROM schema_migrations WHERE version = ?',
    [SCHEMA_VERSION]
  );

  return !record;
}

/**
 * Run pending migrations
 */
export function runMigrations(client?: DatabaseClient): void {
  const db = client ?? getDbClient();

  logger.info('Checking for migrations...');

  // Get current version
  const currentRecord = db.get<MigrationRecord>(
    'SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  const currentVersion = currentRecord?.version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    logger.info(`Database up to date (v${SCHEMA_VERSION})`);
    return;
  }

  logger.info(
    { currentVersion, targetVersion: SCHEMA_VERSION },
    'Running migrations'
  );

  // Run migrations in transaction
  db.getDb().transaction(() => {
    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue; // Skip already applied
      }

      logger.info(
        { version: migration.version, name: migration.name },
        'Applying migration'
      );

      db.exec(migration.up);

      // Record migration
      db.run(
        'INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)',
        [migration.version, Date.now()]
      );

      logger.info(`Migration v${migration.version} applied`);
    }
  })();

  logger.info(`Migrations complete. Database now at v${SCHEMA_VERSION}`);
}

/**
 * Rollback to specific migration version
 *
 * WARNING: This may cause data loss if rolling back multiple versions.
 */
export function rollbackTo(
  targetVersion: number,
  client?: DatabaseClient
): void {
  const db = client ?? getDbClient();

  logger.info({ targetVersion }, 'Rolling back migrations');

  // Get current version
  const currentRecord = db.get<MigrationRecord>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  const currentVersion = currentRecord?.version ?? 0;

  if (currentVersion <= targetVersion) {
    logger.info('Already at target version');
    return;
  }

  // Find migrations to rollback (in reverse order)
  const toRollback = MIGRATIONS.filter(
    (m) => m.version > targetVersion && m.version <= currentVersion
  ).sort((a, b) => b.version - a.version);

  if (toRollback.length === 0) {
    logger.warn('No rollback scripts available');
    return;
  }

  // Rollback in transaction
  db.getDb().transaction(() => {
    for (const migration of toRollback) {
      if (!migration.down) {
        logger.warn(
          { version: migration.version },
          'No rollback script available, skipping'
        );
        continue;
      }

      logger.info(
        { version: migration.version, name: migration.name },
        'Rolling back migration'
      );

      db.exec(migration.down);

      // Remove migration record
      db.run('DELETE FROM schema_migrations WHERE version = ?', [
        migration.version
      ]);

      logger.info(`Rolled back to v${migration.version - 1}`);
    }
  })();

  logger.info('Rollback complete');
}

/**
 * Get current schema version
 */
export function getSchemaVersion(client?: DatabaseClient): number {
  const db = client ?? getDbClient();

  const record = db.get<MigrationRecord>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  return record?.version ?? 0;
}

/**
 * Reset database (drop all tables and recreate)
 *
 * WARNING: This will delete all data!
 */
export function resetDatabase(client?: DatabaseClient): void {
  const db = client ?? getDbClient();

  logger.warn('Resetting database - all data will be lost!');

  // Drop all tables
  const tables = db.getTables();
  for (const table of tables) {
    if (table !== 'schema_migrations') {
      db.run(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  // Recreate schema
  initializeDatabase(db);

  logger.info('Database reset complete');
}

/**
 * Seed initial data for testing
 */
export function seedDatabase(client?: DatabaseClient): void {
  const db = client ?? getDbClient();

  logger.info('Seeding database with initial data');

  db.getDb().transaction(() => {
    // Initialize compounding state
    const hasState = db.get<{ id: number }>(
      'SELECT id FROM compounding_state WHERE id = 1'
    );

    if (!hasState) {
      db.run(
        `INSERT INTO compounding_state (
          id, stage, currentSolBalance, basePositionSize,
          targetProfitAmount, peakSolBalance, peakTimestamp,
          lastCompoundAt, lastWithdrawalAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          1,
          'BUILD',
          '100000000', // 0.1 SOL in lamports
          '100000000', // 0.1 SOL position size
          '50000000', // 0.05 SOL profit target
          '100000000', // Peak balance
          Date.now(),
          null,
          null,
          Date.now()
        ]
      );
    }

    logger.info('Initial compounding state created');
  })();

  logger.info('Database seeded');
}

// ============================================================================
// EXPORTS
// ============================================================================

export { MIGRATIONS, SCHEMA_VERSION };
