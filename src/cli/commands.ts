/**
 * CLI Commands
 *
 * Command implementations for the trading bot CLI.
 */

import { loadBotConfig } from '../bot/config.js';
import { createTradingBot } from '../bot/orchestrator.js';
import { logger } from '../utils/logger.js';
import { getDbClient } from '../db/client.js';
import { initializeDatabase } from '../db/init.js';
import type { Database } from 'better-sqlite3';

// ============================================================================
// TYPES
// ============================================================================

export interface CliOptions {
  command: 'start:paper' | 'start:live' | 'report' | 'status';
  args?: string[];
}

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Start paper trading bot
 */
export async function startPaperTrading(): Promise<CommandResult> {
  try {
    logger.info('Starting paper trading bot...');

    // Force paper mode regardless of .env setting
    process.env.TRADING_MODE = 'paper';

    const config = loadBotConfig();

    if (config.mode !== 'paper') {
      logger.warn('Configuration mode is not paper, forcing paper mode...');
    }

    const dbClient = getDbClient();
    initializeDatabase(dbClient);
    const db = dbClient.getDb();
    const bot = createTradingBot({ db });

    // Handle graceful shutdown
    const shutdownHandler = async () => {
      logger.info('Shutting down...');
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);

    await bot.start();

    logger.info(bot.getStatusSummary());

    return {
      success: true,
      message: 'Paper trading bot started',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed to start paper trading bot');
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Start live trading bot
 */
export async function startLiveTrading(): Promise<CommandResult> {
  try {
    logger.warn('⚠️  STARTING LIVE TRADING BOT - REAL MONEY AT RISK ⚠️');
    logger.warn('Press Ctrl+C to stop immediately...');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const config = loadBotConfig();

    if (config.mode !== 'live') {
      return {
        success: false,
        error: 'Configuration mode must be "live" to start live trading. Set TRADING_MODE=live in .env',
      };
    }

    const dbClient = getDbClient();
    initializeDatabase(dbClient);
    const db = dbClient.getDb();
    const bot = createTradingBot({ db });

    // Handle graceful shutdown
    const shutdownHandler = async () => {
      logger.info('Shutting down...');
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);

    await bot.start();

    logger.info(bot.getStatusSummary());

    return {
      success: true,
      message: 'Live trading bot started',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed to start live trading bot');
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Generate performance report
 */
export async function generateReport(): Promise<CommandResult> {
  try {
    const config = loadBotConfig();
    const dbClient = getDbClient();
    initializeDatabase(dbClient);
    const db = dbClient.getDb();

    const { createPositionRepository } = await import('../db/repositories/positions.js');
    const positionsRepo = createPositionRepository(db);

    const allPositions = positionsRepo.findAll();
    const closedPositions = allPositions.filter(p => p.state === 'CLOSED');
    const activePositions = positionsRepo.findActive();

    // Calculate statistics
    const totalTrades = closedPositions.length;
    const winningTrades = closedPositions.filter(p => {
      const entrySol = Number(p.entrySolSpent) / 1e9;
      const exitSol = p.exitSolReceived ? Number(p.exitSolReceived) / 1e9 : 0;
      return exitSol > entrySol;
    }).length;

    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Calculate P&L
    let totalPnl = 0;
    for (const pos of closedPositions) {
      const entrySol = Number(pos.entrySolSpent) / 1e9;
      const exitSol = pos.exitSolReceived ? Number(pos.exitSolReceived) / 1e9 : 0;
      totalPnl += exitSol - entrySol;
    }

    const pnlPercent = totalTrades > 0
      ? (totalPnl / (config.initialSol * totalTrades)) * 100
      : 0;

    const lines = [
      '═══════════════════════════════════════════════════════════════',
      '                    TRADING BOT PERFORMANCE REPORT',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Mode: ${config.mode.toUpperCase()}`,
      '',
      '───────────────────────────────────────────────────────────────',
      ' TRADE STATISTICS',
      '───────────────────────────────────────────────────────────────',
      `  Total Trades:        ${totalTrades}`,
      `  Winning Trades:      ${winningTrades}`,
      `  Losing Trades:       ${losingTrades}`,
      `  Win Rate:            ${winRate.toFixed(1)}%`,
      '',
      '───────────────────────────────────────────────────────────────',
      ' P&L SUMMARY',
      '───────────────────────────────────────────────────────────────',
      `  Total P&L:           ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(6)} SOL`,
      `  P&L Percentage:      ${totalPnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
      '',
      '───────────────────────────────────────────────────────────────',
      ' ACTIVE POSITIONS',
      '───────────────────────────────────────────────────────────────',
      `  Count:               ${activePositions.length}`,
    ];

    if (activePositions.length > 0) {
      lines.push('');
      for (const pos of activePositions.slice(0, 5)) {
        const entryPrice = pos.entryPricePerToken;
        const peakPrice = pos.peakPricePerToken;
        const pnl = ((peakPrice - entryPrice) / entryPrice) * 100;
        const tokenDisplay = pos.tokenMint.slice(0, 8);
        lines.push(`  - ${tokenDisplay.padEnd(10)} | ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`);
      }
      if (activePositions.length > 5) {
        lines.push(`  ... and ${activePositions.length - 5} more`);
      }
    }

    lines.push('', '═══════════════════════════════════════════════════════════════');

    console.log(lines.join('\n'));

    return {
      success: true,
      message: 'Report generated',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed to generate report');
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Show current status
 */
export async function showStatus(): Promise<CommandResult> {
  try {
    const config = loadBotConfig();
    const dbClient = getDbClient();
    initializeDatabase(dbClient);
    const db = dbClient.getDb();

    const { createPositionRepository } = await import('../db/repositories/positions.js');
    const positionsRepo = createPositionRepository(db);

    const activePositions = positionsRepo.findActive();
    const closedPositions = positionsRepo.findAll().filter(p => p.state === 'CLOSED');

    const lines = [
      '═══════════════════════════════════════════════════════════════',
      '                    TRADING BOT STATUS',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Mode: ${config.mode.toUpperCase()}`,
      `Initial SOL: ${config.initialSol}`,
      '',
      '───────────────────────────────────────────────────────────────',
      ' CURRENT POSITIONS',
      '───────────────────────────────────────────────────────────────',
      `  Active:              ${activePositions.length}`,
      `  Closed:              ${closedPositions.length}`,
      `  Total Trades:        ${activePositions.length + closedPositions.length}`,
      '',
    ];

    if (activePositions.length > 0) {
      lines.push('  Active Positions:');
      for (const pos of activePositions.slice(0, 10)) {
        const entryPrice = pos.entryPricePerToken;
        const peakPrice = pos.peakPricePerToken;
        const pnl = ((peakPrice - entryPrice) / entryPrice) * 100;
        const heldTime = Math.floor((Date.now() - pos.entryTimestamp) / 60000); // minutes
        const tokenDisplay = pos.tokenMint.slice(0, 8);

        lines.push(
          `  - ${tokenDisplay.padEnd(10)} | ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}% | Held: ${heldTime}m | ${pos.state}`
        );
      }
      if (activePositions.length > 10) {
        lines.push(`  ... and ${activePositions.length - 10} more`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════════');

    console.log(lines.join('\n'));

    return {
      success: true,
      message: 'Status displayed',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed to get status');
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Handle CLI command
 */
export async function handleCommand(options: CliOptions): Promise<CommandResult> {
  switch (options.command) {
    case 'start:paper':
      return startPaperTrading();

    case 'start:live':
      return startLiveTrading();

    case 'report':
      return generateReport();

    case 'status':
      return showStatus();

    default:
      return {
        success: false,
        error: `Unknown command: ${options.command}`,
      };
  }
}
