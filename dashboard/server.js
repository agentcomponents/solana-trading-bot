const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database path
const DB_PATH = path.join(__dirname, '..', 'data', 'trading-bot.db');

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

// API Routes

// GET /api/stats - Get bot statistics
app.get('/api/stats', (req, res) => {
  try {
    const db = getDb();

    const positions = db.prepare(`
      SELECT * FROM positions
      ORDER BY entryTimestamp DESC
    `).all();

    // Count only actively trading positions (not ENTERING or FAILED)
    const activelyTrading = positions.filter(p =>
      ['ACTIVE', 'PARTIAL_EXIT_1', 'PARTIAL_EXIT_2', 'TRAILING'].includes(p.state)
    );
    const closedPositions = positions.filter(p => p.state === 'CLOSED');
    const enteringPositions = positions.filter(p => p.state === 'ENTERING');

    let totalPnl = 0;
    let winningTrades = 0;

    for (const pos of closedPositions) {
      const entrySol = Number(pos.entrySolSpent) / 1e9;
      const exitSol = pos.exitSolReceived ? Number(pos.exitSolReceived) / 1e9 : 0;
      const pnl = exitSol - entrySol;
      totalPnl += pnl;
      if (pnl > 0) winningTrades++;
    }

    const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;
    const totalPnlPercent = closedPositions.length > 0
      ? (totalPnl / (closedPositions.length * 0.05)) * 100
      : 0;

    res.json({
      walletBalance: 0.1 + totalPnl,
      totalTrades: closedPositions.length,
      activePositions: activelyTrading.length,
      closedPositions: closedPositions.length,
      winRate,
      totalPnl,
      totalPnlPercent,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

// GET /api/positions - Get all positions
app.get('/api/positions', (req, res) => {
  try {
    const db = getDb();

    const positions = db.prepare(`
      SELECT p.*, tm.symbol, tm.name
      FROM positions p
      LEFT JOIN token_metadata tm ON p.tokenMint = tm.id
      ORDER BY p.entryTimestamp DESC
    `).all();

    const enrichedPositions = positions.map(pos => {
      const entrySol = Number(pos.entrySolSpent) / 1e9;
      const exitSol = pos.exitSolReceived ? Number(pos.exitSolReceived) / 1e9 : null;
      const pnl = exitSol !== null ? exitSol - entrySol : null;
      const pnlPercent = pnl !== null ? (pnl / entrySol) * 100 : null;
      const tokensHeld = Number(pos.tokensReceivedRaw) / Math.pow(10, pos.tokenDecimals);
      const heldMinutes = pos.exitTimestamp
        ? Math.floor((pos.exitTimestamp - pos.entryTimestamp) / 60000)
        : Math.floor((Date.now() - pos.entryTimestamp) / 60000);

      const currentPnlPercent = pos.peakPricePerToken > 0
        ? ((pos.peakPricePerToken - pos.entryPricePerToken) / pos.entryPricePerToken) * 100
        : 0;

      return {
        id: pos.id,
        state: pos.state,
        tokenMint: pos.tokenMint,
        symbol: pos.symbol || 'UNKNOWN',
        name: pos.name || pos.symbol || 'Unknown Token',
        entrySol,
        entryPricePerToken: pos.entryPricePerToken,
        tokensHeld,
        peakPricePerToken: pos.peakPricePerToken,
        currentPnlPercent,
        exitSol: exitSol ?? undefined,
        pnl: pnl ?? undefined,
        pnlPercent: pnlPercent ?? undefined,
        exitReason: pos.exitReason,
        entryTimestamp: pos.entryTimestamp,
        exitTimestamp: pos.exitTimestamp ?? undefined,
        heldMinutes,
        dexscreenerUrl: `https://dexscreener.com/solana/${pos.tokenMint}`,
      };
    });

    res.json(enrichedPositions);
  } catch (error) {
    console.error('Positions API error:', error);
    res.status(500).json({ error: 'Failed to fetch positions', details: error.message });
  }
});

// GET /api/tokens - Get scanned tokens (filtered)
app.get('/api/tokens', (req, res) => {
  try {
    const db = getDb();

    // For now, return tokens from positions (deduplicated by tokenMint)
    const tokens = db.prepare(`
      SELECT
        p.tokenMint as address,
        tm.symbol,
        tm.name,
        p.entryPricePerToken as priceUsd,
        0 as priceChangeH1,
        0 as priceChangeH24,
        p.peakPricePerToken as liquidity,
        50 as opportunityScore
      FROM positions p
      LEFT JOIN token_metadata tm ON p.tokenMint = tm.id
      WHERE p.id IN (
        SELECT MAX(id) FROM positions
        WHERE state != 'CLOSED'
        GROUP BY tokenMint
      )
      ORDER BY p.entryTimestamp DESC
      LIMIT 10
    `).all();

    const enrichedTokens = tokens.map(t => ({
      address: t.address,
      symbol: t.symbol || 'UNKNOWN',
      name: t.name || t.symbol || 'Unknown Token',
      priceUsd: t.priceUsd || 0,
      priceChangeH1: t.priceChangeH1 || 0,
      priceChangeH24: t.priceChangeH24 || 0,
      liquidity: t.liquidity || 0,
      volume24h: t.volume24h || 0,
      opportunityScore: t.opportunityScore || 50,
      dexscreenerUrl: `https://dexscreener.com/solana/${t.address}`,
    }));

    res.json(enrichedTokens);
  } catch (error) {
    console.error('Tokens API error:', error);
    res.status(500).json({ error: 'Failed to fetch tokens', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard running on http://localhost:${PORT}`);
  console.log(`📊 Bot database: ${DB_PATH}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
