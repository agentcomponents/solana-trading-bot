import { NextResponse } from 'next/server';
import { getDb, type Position } from '@/lib/db';

export interface BotStats {
  walletBalance: number;
  totalTrades: number;
  activePositions: number;
  closedPositions: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
}

export async function GET() {
  try {
    const db = getDb();

    // Get all positions
    const positions = db.prepare(`
      SELECT * FROM positions
      ORDER BY entryTimestamp DESC
    `).all() as Position[];

    const activePositions = positions.filter(p => p.state !== 'CLOSED');
    const closedPositions = positions.filter(p => p.state === 'CLOSED');

    // Calculate statistics
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

    const stats: BotStats = {
      walletBalance: 0.1 + totalPnl, // Initial balance + P&L
      totalTrades: closedPositions.length,
      activePositions: activePositions.length,
      closedPositions: closedPositions.length,
      winRate,
      totalPnl,
      totalPnlPercent,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
