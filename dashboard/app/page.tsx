'use client';

import { useEffect, useState } from 'react';

interface BotStats {
  walletBalance: number;
  totalTrades: number;
  activePositions: number;
  closedPositions: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
}

interface Position {
  id: string;
  state: string;
  tokenMint: string;
  symbol: string;
  name: string;
  entrySol: number;
  entryPricePerToken: number;
  tokensHeld: number;
  peakPricePerToken: number;
  currentPnlPercent: number;
  exitSol?: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  entryTimestamp: number;
  exitTimestamp?: number;
  heldMinutes: number;
  dexscreenerUrl: string;
}

interface ScannedToken {
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

export default function DashboardPage() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tokens, setTokens] = useState<ScannedToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    fetchData();

    // Refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    try {
      const [statsRes, positionsRes, tokensRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/positions'),
        fetch('/api/tokens'),
      ]);

      const [statsData, positionsData, tokensData] = await Promise.all([
        statsRes.json(),
        positionsRes.json(),
        tokensRes.json(),
      ]);

      setStats(statsData);
      setPositions(positionsData);
      setTokens(tokensData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  }

  const activePositions = positions.filter(p => p.state !== 'CLOSED');
  const closedPositions = positions.filter(p => p.state === 'CLOSED');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-[#27272a] bg-[#0a0a0f]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <span className="text-xl font-bold">S</span>
              </div>
              <span className="text-xl font-semibold">Solana Bot</span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-8">
              <a href="#" className="text-white font-medium">Dashboard</a>
              <a href="#" className="text-zinc-400 hover:text-white transition">Trade</a>
              <a href="#" className="text-zinc-400 hover:text-white transition">Analytics</a>
              <a href="#" className="text-zinc-400 hover:text-white transition">Settings</a>
            </nav>

            {/* Wallet */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-zinc-400">Wallet</div>
                <div className="font-mono text-sm">{stats?.walletBalance.toFixed(4)} SOL</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Wallet Balance"
            value={`${stats?.walletBalance.toFixed(4)} SOL`}
            change={stats?.totalPnlPercent ? `${stats.totalPnlPercent.toFixed(2)}%` : undefined}
            positive={stats?.totalPnlPercent ?? 0 >= 0}
          />
          <StatCard
            label="Total Trades"
            value={stats?.totalTrades.toString() ?? '0'}
          />
          <StatCard
            label="Win Rate"
            value={`${stats?.winRate.toFixed(1)}%`}
          />
          <StatCard
            label="Total P&L"
            value={`${stats?.totalPnl >= 0 ? '+' : ''}${(stats?.totalPnl ?? 0).toFixed(6)} SOL`}
            positive={(stats?.totalPnl ?? 0) >= 0}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Filtered Tokens */}
          <div className="bg-[#18181b] rounded-2xl border border-[#27272a] overflow-hidden">
            <div className="p-6 border-b border-[#27272a]">
              <h2 className="text-xl font-semibold">Filtered Tokens</h2>
              <p className="text-sm text-zinc-400 mt-1">Tokens matching your criteria</p>
            </div>
            <div className="divide-y divide-[#27272a] max-h-[600px] overflow-y-auto">
              {tokens.map((token) => (
                <TokenRow key={token.address} token={token} />
              ))}
            </div>
          </div>

          {/* Right: Active & Closed Trades */}
          <div className="space-y-6">
            {/* Active Trades */}
            <div className="bg-[#18181b] rounded-2xl border border-[#27272a] overflow-hidden">
              <div className="p-6 border-b border-[#27272a]">
                <h2 className="text-xl font-semibold">Active Trades</h2>
                <p className="text-sm text-zinc-400 mt-1">{activePositions.length} positions open</p>
              </div>
              <div className="divide-y divide-[#27272a] max-h-[280px] overflow-y-auto">
                {activePositions.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">No active positions</div>
                ) : (
                  activePositions.map((pos) => (
                    <PositionRow key={pos.id} position={pos} />
                  ))
                )}
              </div>
            </div>

            {/* Closed Trades */}
            <div className="bg-[#18181b] rounded-2xl border border-[#27272a] overflow-hidden">
              <div className="p-6 border-b border-[#27272a]">
                <h2 className="text-xl font-semibold">Closed Trades</h2>
                <p className="text-sm text-zinc-400 mt-1">{closedPositions.length} trades completed</p>
              </div>
              <div className="divide-y divide-[#27272a] max-h-[280px] overflow-y-auto">
                {closedPositions.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">No closed positions</div>
                ) : (
                  closedPositions.slice(0, 10).map((pos) => (
                    <PositionRow key={pos.id} position={pos} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
  positive
}: {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
      <div className="text-sm text-zinc-400 mb-2">{label}</div>
      <div className="text-2xl font-semibold mb-1">{value}</div>
      {change && (
        <div className={`text-sm ${positive ? 'text-green-500' : 'text-red-500'}`}>
          {change}
        </div>
      )}
    </div>
  );
}

function TokenRow({ token }: { token: ScannedToken }) {
  return (
    <div className="p-4 hover:bg-[#27272a] transition cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold">
            {token.symbol[0]}
          </div>
          <div>
            <div className="font-semibold">{token.symbol}</div>
            <div className="text-sm text-zinc-400">{token.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono">${token.priceUsd.toFixed(6)}</div>
          <div className={`text-sm ${token.priceChangeH1 >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {token.priceChangeH1 >= 0 ? '+' : ''}{token.priceChangeH1.toFixed(1)}% (1h)
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-zinc-400">Score</div>
          <div className="font-semibold">{token.opportunityScore}/100</div>
        </div>
        <a
          href={token.dexscreenerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition"
        >
          Trade
        </a>
      </div>
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const isClosed = position.state === 'CLOSED';

  return (
    <div className="p-4 hover:bg-[#27272a] transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center font-bold text-sm">
            {position.symbol[0]}
          </div>
          <div>
            <div className="font-semibold">{position.symbol}</div>
            <div className="text-sm text-zinc-400">{position.heldMinutes}m ago</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm">{position.entrySol.toFixed(6)} SOL</div>
          <div className={`text-sm font-medium ${
            isClosed
              ? (position.pnlPercent && position.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500')
              : (position.currentPnlPercent >= 0 ? 'text-green-500' : 'text-red-500')
          }`}>
            {isClosed
              ? (position.pnlPercent !== undefined ? `${position.pnlPercent >= 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%` : '-')
              : `${position.currentPnlPercent >= 0 ? '+' : ''}${position.currentPnlPercent.toFixed(2)}%`
            }
          </div>
        </div>
        <div className="text-sm text-zinc-400">{position.state}</div>
        <a
          href={position.dexscreenerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white transition"
        >
          ↗
        </a>
      </div>
    </div>
  );
}
