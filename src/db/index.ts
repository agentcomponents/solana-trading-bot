/**
 * Database Module
 *
 * Exports all database functionality:
 * - Client connection
 * - Schema definitions
 * - Initialization/migrations
 * - Repository implementations
 */

// ============================================================================
// CLIENT
// ============================================================================
export {
  getDbClient,
  closeDbClient,
  createTestDb,
  type DatabaseConfig
} from './client';

export { default as Database } from 'better-sqlite3';

// ============================================================================
// SCHEMA
// ============================================================================
export {
  SCHEMA_SQL,
  MIGRATIONS_SQL,
  SCHEMA_VERSION
} from './schema';

export type {
  TokenMetadata,
  Position,
  PositionState,
  ExitReason,
  SafetyCheck,
  SafetyCheckType,
  SafetyCheckResult,
  Trade,
  TradeState,
  CompoundingState,
  CompoundingStage,
  PerformanceSnapshot,
  PositionSize,
  Withdrawal,
  WithdrawalReason
} from './schema';

// ============================================================================
// INIT & MIGRATIONS
// ============================================================================
export {
  initializeDatabase,
  needsMigration,
  runMigrations,
  rollbackTo,
  getSchemaVersion,
  resetDatabase,
  seedDatabase
} from './init';

export type { Migration, MigrationRecord } from './init';

// ============================================================================
// REPOSITORY BASE
// ============================================================================
export {
  BaseRepository,
  type Repository,
  type FindOptions,
  type PaginationOptions,
  type PaginatedResult
} from './repository';

// ============================================================================
// REPOSITORIES
// ============================================================================
export {
  TokenMetadataRepository,
  createTokenMetadataRepository
} from './repositories/token-metadata';

export type {
  CreateTokenMetadataInput,
  UpdateTokenMetadataInput
} from './repositories/token-metadata';

export {
  PositionRepository,
  createPositionRepository
} from './repositories/positions';

export type {
  CreatePositionInput,
  UpdatePositionInput,
  PositionStats
} from './repositories/positions';
