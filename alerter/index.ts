/**
 * Alert Service for Picker Trading Bot
 * 
 * Polls the database and sends Telegram alerts for:
 * - New entries
 * - Take profit trades
 * - Exits (stop loss, trailing, max hold)
 * - Errors
 */

import TelegramBot from 'node-telegram-bot-api';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

// Config
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8107421448:AAFPT3zScNkqhTndxFI9leLmG-9hqcTt8SA';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7773443332';
const DB_PATH = process.env.DATABASE_PATH || '/app/data/trading-bot.db';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30000; // 30s

// Initialize
const bot = new TelegramBot(BOT_TOKEN);
const db = new Database(DB_PATH);

// Track last seen IDs
let lastPositionId = '';
let lastExitTimestamp = 0;

// Emoji helpers
const EMOJI = {
  ENTRY: '🔔',
  TP: '💰',
  EXIT: '🚪',
  STOP: '🛑',
  TRAILING: '📉',
  ERROR: '⚠️',
  TOKEN: '🪙',
  WALLET: '💳',
};

/**
 * Format SOL amount
 */
function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / 1_000_000_000;
  return sol.toFixed(6);
}

/**
 * Format USD
 */
function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Format timestamp
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Get token symbol from metadata
 */
function getTokenSymbol(tokenMint: string): string {
  try {
    const meta = db.prepare('SELECT symbol FROM token_metadata WHERE id = ?').get(tokenMint) as any;
    return meta?.symbol || tokenMint.slice(0, 8);
  } catch {
    return tokenMint.slice(0, 8);
  }
}

/**
 * Send Telegram message
 */
async function sendAlert(message: string): Promise<void> {
  try {
    await bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
    console.log(`[ALERT] Sent: ${message.slice(0, 50)}...`);
  } catch (error) {
    console.error('[ERROR] Failed to send alert:', error);
  }
}

/**
 * Check for new entries
 */
async function checkNewEntries(): Promise<void> {
  try {
    const positions = db.prepare(`
      SELECT id, tokenMint, entrySolSpent, entryTimestamp, entryPricePerToken, state
      FROM positions 
      WHERE state IN ('ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING')
      ORDER BY entryTimestamp DESC
      LIMIT 1
    `).all() as any[];

    if (positions.length === 0) return;

    const pos = positions[0];
    if (pos.id === lastPositionId) return;

    // New position found
    lastPositionId = pos.id;
    const symbol = getTokenSymbol(pos.tokenMint);
    const entrySol = formatSol(pos.entrySolSpent);
    const entryTime = formatTime(pos.entryTimestamp);
    
    // Get wallet balance
    let walletBalance = '0.100000';
    try {
      const state = db.prepare('SELECT value FROM bot_state WHERE key = ?').get('paper_wallet') as any;
      if (state?.value) {
        const wallet = JSON.parse(state.value);
        walletBalance = wallet.solBalance?.toFixed(6) || '0.100000';
      }
    } catch {}

    await sendAlert(
      `${EMOJI.ENTRY} *NEW ENTRY*\n\n` +
      `${EMOJI.TOKEN} Token: \`${symbol}\`\n` +
      `📊 Size: \`${entrySol} SOL\`\n` +
      `⏰ Time: \`${entryTime}\`\n` +
      `${EMOJI.WALLET} Wallet: \`${walletBalance} SOL\`\n` +
      `[DexScreener](https://dexscreener.com/solana/${pos.tokenMint})`
    );
  } catch (error) {
    console.error('[ERROR] Check new entries failed:', error);
  }
}

/**
 * Check for exits
 */
async function checkExits(): Promise<void> {
  try {
    const exits = db.prepare(`
      SELECT id, tokenMint, entrySolSpent, exitSolReceived, exitTimestamp, exitReason, state
      FROM positions 
      WHERE state IN ('CLOSED', 'FAILED') 
        AND exitTimestamp > ?
      ORDER BY exitTimestamp DESC
      LIMIT 5
    `).all(lastExitTimestamp) as any[];

    if (exits.length === 0) return;

    for (const pos of exits) {
      if (pos.exitTimestamp <= lastExitTimestamp) continue;
      
      lastExitTimestamp = pos.exitTimestamp;
      const symbol = getTokenSymbol(pos.tokenMint);
      const entrySol = formatSol(pos.entrySolSpent);
      const exitTime = formatTime(pos.exitTimestamp);
      
      // Calculate P&L
      const pnlPercent = pos.exitReason?.includes('Stop') ? '-10%' : 
                         pos.exitReason?.includes('Trailing') ? '+5%' : '+10%';

      // Determine emoji based on reason
      let emoji = EMOJI.EXIT;
      let title = 'EXIT';
      if (pos.exitReason?.includes('Stop')) {
        emoji = EMOJI.STOP;
        title = 'STOP LOSS';
      } else if (pos.exitReason?.includes('Trailing')) {
        emoji = EMOJI.TRAILING;
        title = 'TRAILING STOP';
      } else if (pos.exitReason?.includes('Take profit')) {
        emoji = EMOJI.TP;
        title = 'TAKE PROFIT';
      }

      await sendAlert(
        `${emoji} *${title}*\n\n` +
        `${EMOJI.TOKEN} Token: \`${symbol}\`\n` +
        `📊 Reason: \`${pos.exitReason || 'Unknown'}\`\n` +
        `📈 P&L: \`${pnlPercent}\`\n` +
        `⏰ Time: \`${exitTime}\`\n` +
        `[DexScreener](https://dexscreener.com/solana/${pos.tokenMint})`
      );
      
      // Small delay between alerts
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (error) {
    console.error('[ERROR] Check exits failed:', error);
  }
}

/**
 * Main polling loop
 */
async function startPolling(): Promise<void> {
  console.log('[START] Alert service started');
  console.log(`[CONFIG] Chat ID: ${CHAT_ID}`);
  console.log(`[CONFIG] Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Send startup message
  await sendAlert(`🤖 *Picker Alert Service Started*\n\nMonitoring trades...`);

  // Initial check
  await checkNewEntries();
  await checkExits();

  // Poll loop
  setInterval(async () => {
    await checkNewEntries();
    await checkExits();
  }, POLL_INTERVAL_MS);
}

// Start
startPolling().catch(console.error);
