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
| 05-compounding.md | ✅ Complete | 3-stage compounding: build, growth, expansion |
| 06-priority-fees.md | ✅ Complete | Dynamic priority fees, entry/exit strategies |
| 07-error-recovery.md | ✅ Complete | RPC failover, transaction monitoring, circuit breakers |

### 🔄 In Progress / Next Up

| Topic | Status | Priority |
|-------|--------|----------|
| Exit Strategy Details | 📝 NEXT | Complete design/04-monitoring-exit.md |
| Monitoring/Dashboard | 📝 Planned | Grafana setup, real-time metrics |
| Implementation Plan | 📝 Planned | Phase-by-phase build guide |

### ✅ Recently Completed (2026-03-10)

| Design Doc | Description |
|------------|-------------|
| 06-priority-fees.md | Dynamic priority fees, entry/exit strategies, cost-benefit analysis |
| 05-compounding.md | 3-stage compounding with drawdown protection |

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

### 5. Compounding Strategy
- **Build Stage (0.1-0.3 SOL):** Fixed 0.1 SOL, compound +0.05 per 0.05 profit
- **Growth Stage (0.3-1.0 SOL):** Scale 0.15→0.25 SOL, compound +0.1 per 0.1 profit
- **Expansion Stage (1.0+ SOL):** 20% of portfolio, profit taking at 50% gain
- **Drawdown Protection:** 30% drawdown = reduce base 20%, drop below 0.3 = reset to build

**Full Design:** `design/05-compounding.md`

### 6. Priority Fee Strategy (Entry vs Exit)
- **Entry:** Conservative fees (10K-50K lamports) - opportunity cost only
- **Exit:** Aggressive fees (100K-1M+ lamports) - speed is critical
- **Dynamic Scaling:** Higher fees for higher profits, emergency fees for trailing stop
- **Cost-Benefit:** Priority fees pay for themselves 20x on average

**Full Design:** `design/06-priority-fees.md`

### 7. Error Recovery & Resilience
- **Multi-RPC Strategy:** Primary (Helius) + Backup + Public fallback with automatic failover
- **Circuit Breaker:** Open after 5 failures, half-open after 60 seconds
- **Transaction Monitoring:** Track every tx, detect stuck after 60s
- **Exponential Backoff:** 3 attempts, 1s → 2s → 4s delay
- **State Persistence:** Save before/after every trade for crash recovery
- **Emergency Controls:** Manual pause/resume, auto-pause on critical errors

**Full Design:** `design/07-error-recovery.md`

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
│   ├── 03-paper-trading.md      # Paper trading architecture
│   ├── 05-compounding.md        # Compounding strategy
│   ├── 06-priority-fees.md      # Priority fee strategies
│   ├── 07-error-recovery.md     # Error recovery & resilience
│   ├── 04-monitoring-exit.md    # Exit strategy (pending)
├── docs/                        # API docs (to be added)
├── src/                         # Source code (when ready to build)
└── .env.example                 # Config template
```

---

## Database Schema (SQLite)

Same schema for both paper and live trading:

```sql
-- Core tables
token_metadata         -- Cache decimals, symbols
positions              -- Entry/exit data with raw amounts
safety_checks          -- RugCheck, GoPlus results
trades                 -- Execution log
performance_snapshot   -- Track growth over time
compounding_state      -- Single-row state tracking
position_sizes         -- Position sizing history
withdrawals            -- Profit withdrawal log
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

**Design Status: 98% Complete**

1. **Finalize Exit Strategy (04-monitoring-exit.md)** - WebSocket setup, trailing stop implementation (NEXT)
2. **Implementation Plan** - Phase-by-phase build guide (after all design complete)

---

## Last Session Summary (2026-03-10)

**Completed:**
- **Priority Fees Research (design/06-priority-fees.md):**
  - Dynamic fee strategy: Conservative entry (10K-50K lamports), Aggressive exit (100K-1M+ lamports)
  - Cost-benefit analysis: Priority fees pay for themselves 20x on average
- **Error Recovery Design (design/07-error-recovery.md):**
  - Multi-RPC failover with health monitoring
  - Transaction lifecycle management (pending → submitted → confirmed)
  - Stuck transaction detection (60s+ = stuck)
  - Circuit breaker pattern for external services
  - Exponential backoff retry strategy
  - State persistence for crash recovery
  - Emergency pause/resume controls

**Key Insights:**
- Priority fees on exits are almost always worth it
- All state must be persisted BEFORE any trading action
- Stuck transactions require manual verification on Solscan

**Design Status:** 98% Complete

**Next Priority:** Finalize Exit Strategy (WebSocket setup, trailing stop implementation)

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
