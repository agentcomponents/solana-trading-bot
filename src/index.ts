/**
 * Solana Trading Bot - Main Entry Point
 *
 * Entry point for the trading bot application.
 *
 * Usage:
 *   npm run start:paper  - Run paper trading mode
 *   npm run start:live   - Run live trading mode
 *   npm run report       - Generate performance report
 *   npm run status       - Show current status
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import { validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { handleCommand, type CliOptions } from './cli/index.js';

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Global error handler
 */
process.on('uncaughtException', (error: Error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});

/**
 * Unhandled promise rejection handler
 */
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Validate environment configuration
    const config = validateConfig();

    logger.info(
      {
        mode: config.TRADING_MODE,
        initialSol: config.INITIAL_SOL_AMOUNT,
        scanInterval: config.SCAN_INTERVAL_SECONDS,
      },
      'Solana Trading Bot starting...'
    );

    // Determine command from process arguments
    const command = process.argv[2] || 'start:paper';
    const validCommands = ['start:paper', 'start:live', 'report', 'status'];

    if (!validCommands.includes(command)) {
      logger.error(`Invalid command: ${command}`);
      logger.info(`Valid commands: ${validCommands.join(', ')}`);
      process.exit(1);
    }

    // Execute command
    const options: CliOptions = {
      command: command as CliOptions['command'],
    };

    const result = await handleCommand(options);

    if (!result.success) {
      logger.error({ error: result.error }, 'Command failed');
      process.exit(1);
    }

    // For status and report commands, exit after completion
    if (command === 'status' || command === 'report') {
      process.exit(0);
    }

    // For start commands, keep running (handled by signal handlers in command)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, `Fatal error: ${message}`);
    process.exit(1);
  }
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

main();
