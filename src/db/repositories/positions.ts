/**
 * Position Repository
 *
 * CRITICAL: Manages trading positions with proper raw amount storage.
 *
 * IMPORTANT: tokensReceivedRaw is stored exactly as received from Jupiter
 * to ensure accurate exit calculations without decimal conversion issues.
 */

import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { BaseRepository } from '../repository';
import type {
  Position,
  PositionState,
  ExitReason
} from '../schema';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatePositionInput {
  tokenMint: string;
  entrySolSpent: string; // Raw lamports
  entryTimestamp: number;
  entryPricePerToken: number;
  tokensReceivedRaw: string; // CRITICAL: Raw from Jupiter
  tokenDecimals: number;
  entryScore?: number; // 0-100 score at entry
  peakPricePerToken?: number;
  peakTimestamp?: number;
}

export interface UpdatePositionInput {
  state?: PositionState;
  exitTimestamp?: number | null;
  exitSolReceived?: string | null;
  exitPricePerToken?: number | null;
  exitReason?: ExitReason | null;
  peakPricePerToken?: number;
  peakTimestamp?: number;
}

export interface PositionStats {
  total: number;
  active: number;
  entering: number;
  closed: number;
  failed: number;
}

// ============================================================================
// REPOSITORY
// ============================================================================

export class PositionRepository extends BaseRepository<
  Position,
  CreatePositionInput,
  UpdatePositionInput
> {
  constructor(db: Database) {
    super(db, 'positions', 'id');
  }

  // ------------------------------------------------------------------
  // CREATE
  // ------------------------------------------------------------------

  /**
   * Create a new position
   *
   * CRITICAL: tokensReceivedRaw must be stored exactly from Jupiter!
   */
  override create(input: CreatePositionInput): Position {
    const id = randomUUID();
    const now = Date.now();

    const position: Position = {
      id,
      state: 'ENTERING',
      tokenMint: input.tokenMint,
      entrySolSpent: input.entrySolSpent,
      entryTimestamp: input.entryTimestamp,
      entryPricePerToken: input.entryPricePerToken,
      tokensReceivedRaw: input.tokensReceivedRaw,
      tokenDecimals: input.tokenDecimals,
      entryScore: input.entryScore ?? null,
      exitTimestamp: null,
      exitSolReceived: null,
      exitPricePerToken: null,
      exitReason: null,
      peakPricePerToken: input.peakPricePerToken ?? input.entryPricePerToken,
      peakTimestamp: input.peakTimestamp ?? input.entryTimestamp,
      createdAt: now,
      updatedAt: now
    };

    const sql = `
      INSERT INTO positions (
        id, state, tokenMint, entrySolSpent, entryTimestamp,
        entryPricePerToken, tokensReceivedRaw, tokenDecimals, entryScore,
        exitTimestamp, exitSolReceived, exitPricePerToken,
        exitReason, peakPricePerToken, peakTimestamp,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;

    const result = this.db.prepare(sql).get(
      id,
      position.state,
      position.tokenMint,
      position.entrySolSpent,
      position.entryTimestamp,
      position.entryPricePerToken,
      position.tokensReceivedRaw,
      position.tokenDecimals,
      position.entryScore,
      position.exitTimestamp,
      position.exitSolReceived,
      position.exitPricePerToken,
      position.exitReason,
      position.peakPricePerToken,
      position.peakTimestamp,
      position.createdAt,
      position.updatedAt
    ) as Position;

    return result;
  }

  // ------------------------------------------------------------------
  // FIND
  // ------------------------------------------------------------------

  /**
   * Find active positions (positions we're currently holding)
   */
  findActive(): Position[] {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE state IN ('ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING')
      ORDER BY entryTimestamp DESC
    `;
    return this.db.prepare(sql).all() as Position[];
  }

  /**
   * Find positions by state
   */
  findByState(state: PositionState): Position[] {
    return this.findAll({
      where: { state } as Partial<Position>
    });
  }

  /**
   * Find positions by token
   */
  findByToken(tokenMint: string): Position[] {
    return this.findAll({
      where: { tokenMint } as Partial<Position>
    });
  }

  /**
   * Find positions that need monitoring
   *
   * Returns positions in ACTIVE state or recently exited
   */
  findMonitored(): Position[] {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE state IN ('ENTERING', 'ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING', 'EXITING')
        AND (exitTimestamp IS NULL OR exitTimestamp > ?)
      ORDER BY entryTimestamp DESC
    `;
    // Positions monitored if exited within last hour or not exited
    const cutoff = Date.now() - 60 * 60 * 1000;
    return this.db.prepare(sql).all(cutoff) as Position[];
  }

  /**
   * Find positions with exit reason
   */
  findByExitReason(reason: ExitReason): Position[] {
    return this.findAll({
      where: { exitReason: reason } as Partial<Position>
    });
  }

  /**
   * Get position statistics
   */
  getStats(): PositionStats {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN state IN ('ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN state = 'ENTERING' THEN 1 ELSE 0 END) as entering,
        SUM(CASE WHEN state = 'CLOSED' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN state = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM ${this.tableName}
    `;

    const row = this.db.prepare(sql).get() as PositionStats;

    return {
      total: row.total ?? 0,
      active: row.active ?? 0,
      entering: row.entering ?? 0,
      closed: row.closed ?? 0,
      failed: row.failed ?? 0
    };
  }

  // ------------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------------

  /**
   * Update position state
   */
  updateState(id: string, state: PositionState): Position | undefined {
    const sql = `
      UPDATE positions
      SET state = ?, updatedAt = ?
      WHERE id = ?
      RETURNING *
    `;

    const result = this.db.prepare(sql).get(state, Date.now(), id) as Position | undefined;

    if (result) {
      return result;
    }

    return this.update(id, {
      state,
      updatedAt: Date.now()
    } as unknown as UpdatePositionInput);
  }

  /**
   * Update peak price
   *
   * Only updates if new price is higher than current peak.
   */
  updatePeakPrice(id: string, price: number, timestamp: number): Position | undefined {
    const position = this.findById(id);
    if (!position) return undefined;

    if (price > position.peakPricePerToken) {
      const sql = `
        UPDATE positions
        SET peakPricePerToken = ?, peakTimestamp = ?, updatedAt = ?
        WHERE id = ?
        RETURNING *
      `;

      return this.db.prepare(sql).get(price, timestamp, Date.now(), id) as Position | undefined;
    }

    return position;
  }

  /**
   * Record exit data
   *
   * CRITICAL: This stores the exit data for final P&L calculation.
   */
  recordExit(
    id: string,
    exitSolReceived: string,
    exitPricePerToken: number,
    reason: ExitReason
  ): Position | undefined {
    const sql = `
      UPDATE positions
      SET state = 'CLOSED',
          exitTimestamp = ?,
          exitSolReceived = ?,
          exitPricePerToken = ?,
          exitReason = ?,
          updatedAt = ?
      WHERE id = ?
      RETURNING *
    `;

    return this.db.prepare(sql).get(
      Date.now(),
      exitSolReceived,
      exitPricePerToken,
      reason,
      Date.now(),
      id
    ) as Position | undefined;
  }

  /**
   * Mark position as failed
   */
  markFailed(id: string): Position | undefined {
    return this.updateState(id, 'FAILED');
  }

  // ------------------------------------------------------------------
  // QUERY HELPERS
  // ------------------------------------------------------------------

  /**
   * Calculate P&L for a position
   *
   * Returns profit/loss as percentage and SOL amount.
   */
  calculatePnL(position: Position): {
    percentage: number;
    solAmount: string;
    isProfit: boolean;
  } | null {
    if (!position.exitSolReceived) {
      return null;
    }

    const entrySol = BigInt(position.entrySolSpent);
    const exitSol = BigInt(position.exitSolReceived);
    const pnlSol = exitSol - entrySol;
    const pnlPercentage = (Number(pnlSol) / Number(entrySol)) * 100;

    return {
      percentage: pnlPercentage,
      solAmount: pnlSol.toString(),
      isProfit: pnlSol > 0n
    };
  }

  /**
   * Get total P&L for all closed positions
   */
  getTotalPnL(): {
    totalPnlSol: string;
    winCount: number;
    lossCount: number;
    winRate: number;
  } {
    const sql = `
      SELECT
        SUM(CAST(exitSolReceived AS INTEGER) - CAST(entrySolSpent AS INTEGER)) as total_pnl,
        SUM(CASE WHEN CAST(exitSolReceived AS INTEGER) > CAST(entrySolSpent AS INTEGER) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN CAST(exitSolReceived AS INTEGER) <= CAST(entrySolSpent AS INTEGER) THEN 1 ELSE 0 END) as losses,
        COUNT(*) as total
      FROM ${this.tableName}
      WHERE state = 'CLOSED' AND exitSolReceived IS NOT NULL
    `;

    const row = this.db.prepare(sql).get() as {
      total_pnl: number | null;
      wins: number;
      losses: number;
      total: number;
    };

    const totalPnlSol = (row.total_pnl ?? 0).toString();
    const winCount = row.wins ?? 0;
    const lossCount = row.losses ?? 0;
    const winRate = row.total > 0 ? (winCount / row.total) * 100 : 0;

    return {
      totalPnlSol,
      winCount,
      lossCount,
      winRate
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPositionRepository(db: Database): PositionRepository {
  return new PositionRepository(db);
}
