/**
 * Paper Trading Module
 *
 * Simulates live trading using real market data but no actual transactions.
 *
 * This module provides:
 * - Slippage Simulator: Realistic slippage beyond Jupiter quotes
 * - Virtual Wallet: Track virtual holdings without real funds
 * - Paper Trading Engine: Main orchestrator for paper trading
 * - Performance Analytics: Track metrics and live trading readiness
 */

// ============================================================================
// SLIPPAGE SIMULATOR
// ============================================================================

export {
  SlippageSimulator,
  getSlippageSimulator,
  closeSlippageSimulator,
  type SlippageSimulation,
  type SlippageFactors,
  type SlippageCalculationParams,
} from './slippage';

// ============================================================================
// VIRTUAL WALLET
// ============================================================================

export {
  VirtualWalletManager,
  createVirtualWallet,
  type VirtualWallet,
  type VirtualTokenBalance,
  type WalletState,
} from './wallet';

// ============================================================================
// PAPER TRADING ENGINE
// ============================================================================

export {
  PaperTradingEngine,
  createPaperTradingEngine,
  type PaperEntryResult,
  type PaperExitResult as EngineExitResult,
  type PaperTradeConfig,
} from './engine';

// ============================================================================
// PERFORMANCE ANALYTICS
// ============================================================================

export {
  PerformanceAnalytics,
  createPerformanceAnalytics,
  type PerformanceReport,
  type TradeStats,
} from './analytics';

// ============================================================================
// WEBSOCKET ORCHESTRATOR
// ============================================================================

export {
  WebSocketPaperOrchestrator,
  createWebSocketPaperOrchestrator,
  DEFAULT_PAPER_OPTIONS,
  type PaperTradingOrchestratorOptions,
  type PaperEntryWithToken,
  type PaperExitResult,
  type PaperTradingStats,
} from './websocket-orchestrator';
