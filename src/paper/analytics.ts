/**
 * Performance Analytics for Paper Trading
 *
 * Generates comprehensive reports on paper trading performance:
 * - Win rate, average win/loss
 * - Maximum drawdown
 * - Sharpe ratio
 * - Slippage analysis
 * - Live trading readiness
 */

import type { Database } from 'better-sqlite3';
import { createPositionRepository } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export interface PerformanceReport {
  // Basic metrics
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;

  // P&L metrics
  totalPnL: number;
  totalPnLPercent: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;

  // Risk metrics
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgTradeDuration: number; // minutes
  sharpeRatio: number;

  // Slippage analysis
  avgEntrySlippage: number; // bps
  avgExitSlippage: number; // bps
  slippageCost: number; // SOL lost to slippage

  // Readiness
  readyForLive: boolean;
  recommendations: string[];
}

export interface TradeStats {
  id: string;
  pnl: number;
  pnlPercent: number;
  duration: number; // minutes
  entrySlippage?: number; // bps
  exitSlippage?: number; // bps
  isWin: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const READINESS_CRITERIA = {
  minTrades: 20,
  minWinRate: 40, // percent
  maxDrawdown: 30, // percent
  positivePnL: true,
};

// ============================================================================
// PERFORMANCE ANALYTICS
// ============================================================================

export class PerformanceAnalytics {
  private positionsRepo: ReturnType<typeof createPositionRepository>;

  constructor(db: Database) {
    this.positionsRepo = createPositionRepository(db);
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(): Promise<PerformanceReport> {
    const closedPositions = this.getClosedPositionsWithPnL();

    if (closedPositions.length === 0) {
      return this.emptyReport();
    }

    // Calculate basic metrics
    const wins = closedPositions.filter(p => (p.pnl || 0) > 0);
    const losses = closedPositions.filter(p => (p.pnl || 0) < 0);
    const winRate = (wins.length / closedPositions.length) * 100;

    // Calculate P&L metrics
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + (p.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, p) => sum + (p.pnl || 0), 0) / losses.length : 0;
    const largestWin = Math.max(...wins.map(p => p.pnl || 0), 0);
    const largestLoss = Math.min(...losses.map(p => p.pnl || 0), 0);

    const grossProfit = wins.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, p) => sum + (p.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Calculate max drawdown
    let peak = 0;
    let runningPnL = 0;
    let maxDrawdown = 0;

    for (const position of closedPositions) {
      runningPnL += position.pnl || 0;
      if (runningPnL > peak) peak = runningPnL;
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const initialBalance = closedPositions.length * 0.1; // Assume 0.1 SOL per trade
    const maxDrawdownPercent = (maxDrawdown / initialBalance) * 100;
    const totalPnLPercent = (totalPnL / initialBalance) * 100;

    // Calculate average trade duration
    const durations = closedPositions
      .filter(p => p.exitTimestamp && p.entryTimestamp)
      .map(p => (p.exitTimestamp! - p.entryTimestamp) / (1000 * 60)); // minutes
    const avgTradeDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Calculate Sharpe ratio (simplified, assumes risk-free rate = 0)
    const pnlValues = closedPositions.map(p => p.pnl || 0);
    const avgReturn = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const variance = pnlValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) / pnlValues.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Calculate readiness and recommendations
    const readyForLive = this.checkReadiness({
      totalTrades: closedPositions.length,
      winRate,
      maxDrawdownPercent,
      totalPnL,
    });

    const recommendations = this.generateRecommendations({
      totalTrades: closedPositions.length,
      winRate,
      maxDrawdownPercent,
      totalPnL,
    });

    return {
      totalTrades: closedPositions.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate,
      totalPnL,
      totalPnLPercent,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      avgTradeDuration,
      sharpeRatio,
      avgEntrySlippage: 0, // TODO: Track slippage separately
      avgExitSlippage: 0,
      slippageCost: 0,
      readyForLive,
      recommendations,
    };
  }

  /**
   * Get closed positions with P&L calculated
   */
  private getClosedPositionsWithPnL(): Array<{
    id: string;
    pnl?: number;
    entryTimestamp: number;
    exitTimestamp?: number;
  }> {
    const positions = this.positionsRepo.findAll().filter(p => p.state === 'CLOSED');

    return positions.map(p => {
      const entrySol = Number(p.entrySolSpent) / 1_000_000_000;
      const exitSol = p.exitSolReceived ? Number(p.exitSolReceived) / 1_000_000_000 : 0;
      const pnl = exitSol - entrySol;

      return {
        id: p.id,
        pnl,
        entryTimestamp: p.entryTimestamp,
        exitTimestamp: p.exitTimestamp ?? undefined,
      };
    });
  }

  /**
   * Check if ready for live trading
   */
  private checkReadiness(metrics: {
    totalTrades: number;
    winRate: number;
    maxDrawdownPercent: number;
    totalPnL: number;
  }): boolean {
    return (
      metrics.totalTrades >= READINESS_CRITERIA.minTrades &&
      metrics.winRate >= READINESS_CRITERIA.minWinRate &&
      metrics.maxDrawdownPercent < READINESS_CRITERIA.maxDrawdown &&
      metrics.totalPnL > 0
    );
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(metrics: {
    totalTrades: number;
    winRate: number;
    maxDrawdownPercent: number;
    totalPnL: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.totalTrades < READINESS_CRITERIA.minTrades) {
      recommendations.push(`Run more paper trades (need ${READINESS_CRITERIA.minTrades}+, have ${metrics.totalTrades})`);
    }

    if (metrics.winRate < READINESS_CRITERIA.minWinRate) {
      recommendations.push(`Win rate below ${READINESS_CRITERIA.minWinRate}% (currently ${metrics.winRate.toFixed(1)}%). Consider tightening entry criteria.`);
    }

    if (metrics.maxDrawdownPercent >= READINESS_CRITERIA.maxDrawdown) {
      recommendations.push(`Max drawdown too high (${metrics.maxDrawdownPercent.toFixed(1)}% >= ${READINESS_CRITERIA.maxDrawdown}%). Consider reducing position size or tightening stop loss.`);
    }

    if (metrics.totalPnL < 0) {
      recommendations.push('Total P&L is negative. Review entry strategy and consider more stringent filtering.');
    }

    if (recommendations.length === 0) {
      recommendations.push('All criteria met! Ready for live trading.');
    }

    return recommendations;
  }

  /**
   * Create empty report
   */
  private emptyReport(): PerformanceReport {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      avgTradeDuration: 0,
      sharpeRatio: 0,
      avgEntrySlippage: 0,
      avgExitSlippage: 0,
      slippageCost: 0,
      readyForLive: false,
      recommendations: ['No trades yet. Start paper trading to generate metrics.'],
    };
  }

  /**
   * Format report as readable string
   */
  formatReport(report: PerformanceReport): string {
    const pnlSign = report.totalPnL >= 0 ? '+' : '';
    const emoji = report.readyForLive ? '🚀' : '📝';

    return `
${emoji} PAPER TRADING PERFORMANCE REPORT
${'='.repeat(50)}

📊 BASIC METRICS
  Total Trades: ${report.totalTrades}
  Wins: ${report.winCount} | Losses: ${report.lossCount}
  Win Rate: ${report.winRate.toFixed(1)}%

💰 P&L METRICS
  Total P&L: ${pnlSign}${report.totalPnL.toFixed(6)} SOL (${pnlSign}${report.totalPnLPercent.toFixed(2)}%)
  Avg Win: ${report.avgWin.toFixed(6)} SOL
  Avg Loss: ${report.avgLoss.toFixed(6)} SOL
  Largest Win: ${report.largestWin.toFixed(6)} SOL
  Largest Loss: ${report.largestLoss.toFixed(6)} SOL
  Profit Factor: ${report.profitFactor.toFixed(2)}

⚠️  RISK METRICS
  Max Drawdown: ${report.maxDrawdown.toFixed(6)} SOL (${report.maxDrawdownPercent.toFixed(2)}%)
  Avg Trade Duration: ${report.avgTradeDuration.toFixed(1)} minutes
  Sharpe Ratio: ${report.sharpeRatio.toFixed(2)}

📋 READINESS
  Ready for Live: ${report.readyForLive ? '✅ YES' : '❌ NO'}

  Recommendations:
${report.recommendations.map(r => `    • ${r}`).join('\n')}
${'='.repeat(50)}
    `.trim();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPerformanceAnalytics(db: Database): PerformanceAnalytics {
  return new PerformanceAnalytics(db);
}
