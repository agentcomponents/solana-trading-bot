/**
 * Simple logger utility
 *
 * For now, this wraps console.log/error with context.
 * In Phase 2, this will be replaced with Pino structured logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

export function debug(message: string | object, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.debug(`[DEBUG] ${msg}`, ...args);
  }
}

export function info(message: string | object, ...args: unknown[]): void {
  if (shouldLog('info')) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.log(`[INFO] ${msg}`, ...args);
  }
}

export function warn(message: string | object, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.warn(`[WARN] ${msg}`, ...args);
  }
}

export function error(message: string | object, ...args: unknown[]): void {
  if (shouldLog('error')) {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.error(`[ERROR] ${msg}`, ...args);
  }
}

// Export as object for convenient importing
export const logger = {
  debug,
  info,
  warn,
  error
};

function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  return levels.indexOf(level) >= levels.indexOf(currentLevel);
}
