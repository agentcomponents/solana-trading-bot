/**
 * Exit Orchestrator
 *
 * Coordinates the exit monitoring flow:
 * 1. Monitor active positions
 * 2. Evaluate exit conditions
 * 3. Execute exit trades
 * 4. Update position states
 */

import type { Position } from '../db/schema';
import { getDbClient } from '../db/client';
import { createPositionRepository } from '../db/repositories/positions';
import { logger } from '../utils/logger';
import { exitStrategy, type PriceUpdate } from './strategy';
import { executeExit } from './executor';
import { getPriceMonitor } from './monitor';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Orchestrator configuration
 */
export interface OrchestratorOptions {
  pollIntervalMs?: number;
  dryRun?: boolean;
}

/**
 * Orchestrator status
 */
export interface OrchestratorStatus {
  isRunning: boolean;
  monitoringCount: number;
  activePositions: Position[];
  lastCheckTime: number;
  totalExits: number;
}

// ============================================================================
// EXIT ORCHESTRATOR
// ============================================================================

/**
 * Exit Orchestrator Class
 *
 * Monitors active positions and executes exit strategies.
 */
export class ExitOrchestrator {
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private dryRun: boolean = true;
  private totalExits: number = 0;

  private readonly positionsRepo = createPositionRepository(getDbClient().getDb());
  private readonly priceMonitor = getPriceMonitor();

  constructor(options: OrchestratorOptions = {}) {
    this.dryRun = options.dryRun ?? true;
  }

  /**
   * Start monitoring all active positions
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    logger.info('Starting exit orchestrator');

    this.isRunning = true;

    // Load active positions and start monitoring
    await this.loadActivePositions();

    // Set up periodic check for new positions
    this.checkInterval = setInterval(() => {
      this.loadActivePositions().catch((error) => {
        logger.error({ error }, 'Failed to load active positions');
      });
    }, 30_000); // Check for new positions every 30 seconds

    logger.info('Exit orchestrator started');
  }

  /**
   * Stop all monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping exit orchestrator');

    this.isRunning = false;

    // Clear interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop price monitoring
    this.priceMonitor.stopAll();

    logger.info('Exit orchestrator stopped');
  }

  /**
   * Load active positions and start monitoring them
   */
  private async loadActivePositions(): Promise<void> {
    try {
      // Get positions that need monitoring
      const activePositions = this.positionsRepo.findMonitored();

      logger.debug(
        {
          count: activePositions.length,
        },
        'Loading active positions'
      );

      // Start monitoring each position
      for (const position of activePositions) {
        const status = this.priceMonitor.getStatus();

        // Skip if already monitoring this token
        if (status.monitoredTokens.includes(position.tokenMint)) {
          continue;
        }

        // Skip closed/failed positions
        if (position.state === 'CLOSED' || position.state === 'FAILED') {
          continue;
        }

        // Start monitoring
        this.priceMonitor.startMonitoring(position, (update) =>
          this.handlePriceUpdate(position, update)
        );
      }

    } catch (error) {
      logger.error({ error }, 'Failed to load active positions');
    }
  }

  /**
   * Handle price update for a position
   *
   * This is called by the price monitor on each price update.
   */
  private async handlePriceUpdate(
    position: Position,
    update: PriceUpdate
  ): Promise<void> {
    try {
      // Refresh position from database
      const freshPosition = this.positionsRepo.findById(position.id);
      if (!freshPosition) {
        logger.warn({ positionId: position.id }, 'Position not found, stopping monitoring');
        this.priceMonitor.stopMonitoring(position.tokenMint);
        return;
      }

      // Check if position is still active
      if (freshPosition.state === 'CLOSED' || freshPosition.state === 'FAILED') {
        logger.info(
          {
            tokenMint: position.tokenMint,
            state: freshPosition.state,
          },
          'Position no longer active, stopping monitoring'
        );
        this.priceMonitor.stopMonitoring(position.tokenMint);
        return;
      }

      // Update peak price if new high
      if (update.currentPrice > freshPosition.peakPricePerToken) {
        await this.positionsRepo.updatePeakPrice(
          freshPosition.id,
          update.currentPrice,
          update.timestamp
        );

        logger.debug(
          {
            tokenMint: position.tokenMint,
            oldPeak: freshPosition.peakPricePerToken,
            newPeak: update.currentPrice,
            peakPercent: calculatePnlPercent(freshPosition.entryPricePerToken, update.currentPrice).toFixed(1),
          },
          'New peak price'
        );

        // Update position reference
        freshPosition.peakPricePerToken = update.currentPrice;
        freshPosition.peakTimestamp = update.timestamp;
      }

      // Evaluate exit conditions
      const decision = exitStrategy.evaluate(freshPosition, update.currentPrice);

      if (decision && decision.shouldExit) {
        await this.executeExitDecision(freshPosition, decision);
      }

    } catch (error) {
      logger.error(
        {
          error,
          tokenMint: position.tokenMint,
        },
        'Failed to handle price update'
      );
    }
  }

  /**
   * Execute an exit decision
   */
  private async executeExitDecision(
    position: Position,
    decision: {
      shouldExit: boolean;
      reason: string;
      exitType: string;
      percentToSell: number;
      priorityFee: number;
      slippageBps: number;
    }
  ): Promise<void> {
    logger.info(
      {
        tokenMint: position.tokenMint,
        reason: decision.reason,
        percentToSell: decision.percentToSell,
      },
      'Exit condition triggered, executing exit'
    );

    try {
      // Execute exit
      const result = await executeExit(
        position,
        decision.percentToSell,
        decision.reason,
        {
          dryRun: this.dryRun,
          priorityFee: decision.priorityFee,
          slippageBps: decision.slippageBps,
        }
      );

      if (!result.success) {
        logger.error(
          {
            tokenMint: position.tokenMint,
            error: result.error,
          },
          'Exit execution failed'
        );
        return;
      }

      // Update position state
      if (result.newState) {
        const updated = await this.positionsRepo.updateState(position.id, result.newState);

        if (updated) {
          logger.info(
            {
              tokenMint: position.tokenMint,
              oldState: position.state,
              newState: result.newState,
            },
            'Position state updated'
          );
        }
      }

      this.totalExits++;

      // For full exits, stop monitoring
      if (result.newState === 'CLOSED' || result.newState === 'FAILED') {
        this.priceMonitor.stopMonitoring(position.tokenMint);
      }

      logger.info(
        {
          tokenMint: position.tokenMint,
          expectedSol: result.expectedSol,
          totalExits: this.totalExits,
        },
        'Exit complete'
      );

    } catch (error) {
      logger.error(
        {
          error,
          tokenMint: position.tokenMint,
        },
        'Failed to execute exit decision'
      );
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): OrchestratorStatus {
    const priceMonitorStatus = this.priceMonitor.getStatus();
    const activePositions = this.positionsRepo.findMonitored();

    return {
      isRunning: this.isRunning,
      monitoringCount: priceMonitorStatus.monitoringCount,
      activePositions,
      lastCheckTime: Date.now(),
      totalExits: this.totalExits,
    };
  }

  /**
   * Get detailed status for logging
   */
  getStatusSummary(): string {
    const status = this.getStatus();

    const lines = [
      'Exit Orchestrator Status:',
      `  Running: ${status.isRunning}`,
      `  Monitoring: ${status.monitoringCount} positions`,
      `  Total Exits: ${status.totalExits}`,
    ];

    if (status.activePositions.length > 0) {
      lines.push('  Active Positions:');
      for (const pos of status.activePositions.slice(0, 5)) {
        const pnl = calculatePnlPercent(pos.entryPricePerToken, pos.peakPricePerToken);
        lines.push(`    - ${pos.tokenMint.slice(0, 8)}... | ${pos.state} | ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`);
      }
      if (status.activePositions.length > 5) {
        lines.push(`    ... and ${status.activePositions.length - 5} more`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate P&L percentage (re-export for convenience)
 */
function calculatePnlPercent(entryPrice: number, currentPrice: number): number {
  if (entryPrice <= 0) return 0;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalOrchestrator: ExitOrchestrator | null = null;

/**
 * Get global exit orchestrator instance
 */
export function getExitOrchestrator(options?: OrchestratorOptions): ExitOrchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new ExitOrchestrator(options);
  }
  return globalOrchestrator;
}

/**
 * Close global exit orchestrator
 */
export async function closeExitOrchestrator(): Promise<void> {
  if (globalOrchestrator) {
    await globalOrchestrator.stopMonitoring();
    globalOrchestrator = null;
  }
}
