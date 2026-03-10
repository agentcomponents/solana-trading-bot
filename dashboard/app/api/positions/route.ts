import { NextResponse } from 'next/server';
import { getDb, type Position, type TokenMetadata } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();

    // Get all positions with token metadata
    const positions = db.prepare(`
      SELECT p.*, tm.symbol, tm.name
      FROM positions p
      LEFT JOIN token_metadata tm ON p.tokenMint = tm.address
      ORDER BY p.entryTimestamp DESC
    `).all() as (Position & { symbol?: string; name?: string })[];

    // Enrich positions with calculated fields
    const enrichedPositions = positions.map(pos => {
      const entrySol = Number(pos.entrySolSpent) / 1e9;
      const exitSol = pos.exitSolReceived ? Number(pos.exitSolReceived) / 1e9 : null;
      const pnl = exitSol !== null ? exitSol - entrySol : null;
      const pnlPercent = pnl !== null ? (pnl / entrySol) * 100 : null;
      const tokensHeld = Number(pos.tokensReceivedRaw) / Math.pow(10, pos.tokenDecimals);
      const heldMinutes = pos.exitTimestamp
        ? Math.floor((pos.exitTimestamp - pos.entryTimestamp) / 60000)
        : Math.floor((Date.now() - pos.entryTimestamp) / 60000);

      // Calculate current P&L based on peak price
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

    return NextResponse.json(enrichedPositions);
  } catch (error) {
    console.error('Positions API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to fetch positions', details: errorMessage }, { status: 500 });
  }
}
