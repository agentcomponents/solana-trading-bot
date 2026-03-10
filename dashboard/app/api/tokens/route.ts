import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export interface ScannedToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChangeH1: number;
  priceChangeH24: number;
  liquidity: number;
  volume24h: number;
  opportunityScore: number;
  dexscreenerUrl: string;
}

export async function GET() {
  try {
    const db = getDb();

    // For now, return tokens from positions as "scanned" tokens
    // In a full implementation, this would integrate with the scanner
    const tokens = db.prepare(`
      SELECT DISTINCT
        p.tokenMint as address,
        tm.symbol,
        tm.name,
        p.entryPricePerToken as priceUsd,
        0 as priceChangeH1,
        0 as priceChangeH24,
        p.peakPricePerToken as liquidity,
        50 as opportunityScore
      FROM positions p
      LEFT JOIN token_metadata tm ON p.tokenMint = tm.address
      WHERE p.state != 'CLOSED'
      ORDER BY p.entryTimestamp DESC
      LIMIT 10
    `).all() as any[];

    const enrichedTokens: ScannedToken[] = tokens.map(t => ({
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

    return NextResponse.json(enrichedTokens);
  } catch (error) {
    console.error('Tokens API error:', error);
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }
}
