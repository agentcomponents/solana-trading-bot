# Solana Trading Bot - Session Context

> **Quick Start:** Read this file first in any new session to understand the current project state.

---

## Project Summary

Build a Solana crypto trading bot that:
1. **Scans** for pumping tokens using DexScreener CLI MCP Tool
2. **Executes** entry/exit swaps via Jupiter SDK
3. **Maximizes** SOL holdings through compounding
4. **Starts small:** 0.1 SOL initial capital

**Core Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

---

## Current Phase: Design & Architecture

### ✅ Completed Design Work

| Design Doc | Status | Description |
|------------|--------|-------------|
| 01-architecture.md | ✅ Complete | Overall system architecture, API stack, Docker setup |
| 02-decimal-handling.md | ✅ Complete | CRITICAL: Solving 6-9 decimal token issue |
| 03-paper-trading.md | ✅ Complete | Paper trading architecture with realistic simulation |

### 🔄 In Progress

| Topic | Status | Next Discussion |
|-------|--------|-----------------|
| Position Compounding | 📝 Planned | How to compound 0.1 SOL after tripling |
| Error Recovery | 📝 Planned | RPC failures, stuck transactions |
| Monitoring/Dashboard | 📝 Planned | Grafana setup, real-time metrics |

---

## Key Design Decisions (Must Follow)

### 1. Decimal Precision (CRITICAL - User Bug Fix)
**Problem User Experienced:** Token decimals (6-9) caused skewed sell balances

**Solution Implemented:**
```typescript
// At ENTRY: Store everything needed for exit
interface Position {
  tokensReceivedRaw: string   // Raw from Jupiter - NO conversion!
  tokenDecimals: number       // Fetched from mint account
  // ... other fields
}

// At EXIT: Use stored raw directly
await jupiter.swap({
  amount: new BN(position.tokensReceivedRaw)  // No conversion!
})
```

**Full Design:** `design/02-decimal-handling.md`

### 2. Entry Strategy (User Confirmed)
- **Timing:** Option 2 - Wait 1-2 confirmations with limit orders
- **Slippage:** 1% (100 bps)
- **Min Liquidity:** $15,000 USD / 50 SOL pool size
- **Safety:** ALL checks (RugCheck + GoPlus + Token Sniffer) before entry

### 3. Exit Strategy (User Confirmed)
- **Trailing Stop:** 15% trailing distance, activates after +100%
- **Stop Loss:** 40% max loss
- **Max Hold:** 4 hours
- **Partial Exits:** 25% at +50%, 25% at +100%, 50% trailing

### 4. Paper Trading Before Live
- Minimum 20 trades with positive P&L
- Win rate ≥ 40%
- Max drawdown < 30%
- Real quotes, simulated execution

---

## Technical Stack

```typescript
// Core dependencies (planned)
{
  "@solana/web3.js": "^1.x",
  "@jup-ag/core": "*",
  "bn.js": "*",
  "better-sqlite3": "*",
  "zod": "*",
  "ws": "*"
}
```

### APIs
| API | Key Status | Usage |
|-----|------------|-------|
| Helius RPC | ✓ Have user key | Primary RPC + WebSocket |
| Jupiter API | ✓ Have user key | Quotes + Swap execution |
| Backup RPC | Free endpoint | Failover when Helius down |
| RugCheck | Free (no key) | Honeypot detection |
| GoPlus | Need to get | Contract security |
| DexScreener CLI | User has tool | Token scanning |

---

## Repository Structure

```
Picker/
├── README.md                    # Project overview
├── CONTEXT.md                   # THIS FILE - read first
├── design/                      # All design docs
│   ├── 01-architecture.md       # Overall system design
│   ├── 02-decimal-handling.md   # Token decimals solution
│   └── 03-paper-trading.md      # Paper trading architecture
├── docs/                        # API docs (to be added)
├── src/                         # Source code (when ready to build)
└── .env.example                 # Config template
```

---

## Database Schema (SQLite)

Same schema for both paper and live trading:

```sql
-- Core tables
token_metadata     -- Cache decimals, symbols
positions          -- Entry/exit data with raw amounts
safety_checks      -- RugCheck, GoPlus results
trades             -- Execution log
performance_snapshot -- Track growth over time
```

**Critical:** `positions.tokensReceivedRaw` stores the raw BN amount from Jupiter for accurate exit.

---

## User's Specific Requirements

From direct conversation:
> "some issues i had in the past included which decimal the token was using (6 to 9), as this could skew the sell balance when trying to exit."

> "We must also paper trade using live data before going live, trying to simulate onchain trading to test our strategy."

> "i only want to hold SOL! my goal is to aquire as much SOL as possible."

---

## Next Steps (Current Session Priorities)

1. **Design Position Compounding Logic** - How to handle after 0.1 → 0.3 SOL
2. **Design Error Recovery** - RPC failures, tx confirmation issues
3. **Design Monitoring/Dashboard** - Grafana or CLI metrics
4. **Create Implementation Plan** - Phase-by-phase build guide

---

## Last Session Summary (2025-03-10)

**Completed:**
- Designed paper trading architecture with realistic slippage simulation
- Defined performance analytics and readiness criteria for going live
- Discussed Docker setup for safety isolation

**Key Insight:** Paper trading must use REAL Jupiter quotes but SIMULATED execution with realistic slippage based on pool depth, volatility, and trade size.

---

## Commands for New Session

```bash
# Check git status
git status

# Pull latest changes
git pull origin main

# View recent design changes
git log --oneline -10

# Read specific design doc
cat design/02-decimal-handling.md
```

---

*Remember: Don't start coding until all design is finalized and user approves!*
