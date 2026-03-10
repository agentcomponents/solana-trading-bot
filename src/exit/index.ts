/**
 * Exit Module
 *
 * Exports all exit-related functionality.
 *
 * This module provides:
 * - Exit Strategy: Evaluates exit conditions (stop loss, take profits, trailing stop)
 * - Exit Executor: Executes exit trades via Jupiter
 * - Price Monitor: Polls Jupiter API for price updates
 * - Exit Orchestrator: Coordinates monitoring and execution
 */

// ============================================================================
// CONFIG
// ============================================================================

export {
  EXIT_CONFIG,
  STATE_TRANSITIONS,
  type ExitType,
} from './config';

// ============================================================================
// STRATEGY
// ============================================================================

export {
  ExitStrategy,
  exitStrategy,
  calculatePnlPercent,
  calculateTrailingPercent,
  formatPrice,
  getRemainingPercent,
  isTrailingActive,
  type ExitDecision,
  type PriceUpdate,
} from './strategy';

// ============================================================================
// EXECUTOR
// ============================================================================

export {
  executeExit,
  recordExit,
  ExitExecutor,
  exitExecutor,
  type ExitResult,
  type ExitOptions,
} from './executor';

// ============================================================================
// MONITOR
// ============================================================================

export {
  PriceMonitor,
  getPriceMonitor,
  closePriceMonitor,
  type PriceCallback,
} from './monitor';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export {
  ExitOrchestrator,
  getExitOrchestrator,
  closeExitOrchestrator,
  type OrchestratorOptions,
  type OrchestratorStatus,
} from './orchestrator';
