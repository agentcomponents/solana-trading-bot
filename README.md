# Solana Trading Bot - Picker

**Goal:** Build an automated Solana crypto trading bot that maximizes SOL holdings through intelligent token discovery and strategic entry/exit.

---

## Project Overview

This bot scans for tokens about to pump using the DexScreener CLI tool, executes trades via Jupiter SDK, and compounds profits to grow SOL holdings.

### Key Specs
- **Initial Capital:** 0.1 SOL
- **Strategy:** Enter high-scoring tokens, exit with profit via trailing stops
- **Compounding:** After tripling to 0.3 SOL, compound 0.1 SOL base after each trade
- **Position Limiting:** Execute 1 trade at a time
- **Goal:** Acquire as much SOL as possible (don't hold bags)

---

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 📝 Design | ✅ 100% Complete | All 7 design documents complete |
| 🔨 Implementation | ⏳ Planned | Awaiting design sign-off |
| 📊 Paper Trading | ⏳ Planned | 20+ trades before going live |
| 🚀 Live Trading | ⏳ Planned | After paper trading validation |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript / Node.js |
| RPC Provider | Helius Free Tier |
| Swap Execution | Jupiter SDK + API |
| Token Discovery | DexScreener CLI MCP Tool |
| Database | SQLite |
| Containerization | Docker |
| Security APIs | RugCheck, GoPlus, Token Sniffer |

---

## Key Design Decisions

### 1. Decimal Precision (CRITICAL)
- **Problem:** Tokens have 6-9 decimals, causing skewed sell balances
- **Solution:** Always fetch token metadata at entry, store raw amounts in DB, use stored raw for exit
- **File:** `design/02-decimal-handling.md`

### 2. Entry Strategy
- **Timing:** Wait 1-2 confirmations with limit orders (reduces false signals)
- **Slippage:** 1% on entry
- **Min Liquidity:** $15,000 USD / 50 SOL pool size
- **Safety Checks:** RugCheck + GoPlus + Token Sniffer before entry

### 3. Exit Strategy
- **Trailing Stop:** 15% trailing distance, activates after +100% profit
- **Stop Loss:** 40% max loss
- **Max Hold Time:** 4 hours
- **Partial Exits:** 25% at +50%, 25% at +100%, 50% trailing stop

### 4. Paper Trading First
- Minimum 20 paper trades before going live
- Real Jupiter quotes, simulated execution
- Realistic slippage modeling
- Performance analytics dashboard

### 5. Compounding Strategy
- **Build (0.1-0.3 SOL):** Fixed 0.1 SOL, compound +0.05 per 0.05 profit
- **Growth (0.3-1.0 SOL):** Scale 0.15→0.25 SOL, compound +0.1 per 0.1 profit
- **Expansion (1.0+ SOL):** 20% of portfolio, profit taking at 50% gain
- **File:** `design/05-compounding.md`

### 6. Priority Fee Strategy
- **Entry:** Conservative (10K-50K lamports) - opportunity cost only
- **Exit:** Aggressive (100K-1M+ lamports) - speed is critical
- **Dynamic:** Scale based on profit level and urgency
- **File:** `design/06-priority-fees.md`

### 7. Error Recovery
- **Multi-RPC:** Primary (Helius) + Backup + Public fallback
- **Circuit Breaker:** Open after 5 failures, auto-retry after 60s
- **Transaction Monitoring:** Detect stuck tx after 60s
- **State Persistence:** Save before/after every trade
- **File:** `design/07-error-recovery.md`

### 8. Exit Strategy (THE MOST CRITICAL)
- **Real-Time Monitoring:** Jupiter API polling every 2 seconds
- **Stop Loss:** -40% → Sell 50%
- **Take Profit 1:** +50% → Sell 25%
- **Take Profit 2:** +100% → Sell 25%, activate trailing stop
- **Trailing Stop:** 15% below peak → Sell remaining 50%
- **Max Hold:** 4 hours → Exit all remaining
- **Emergency:** Liquidity crash/rug → Exit all immediately
- **File:** `design/04-monitoring-exit.md`

---

## Project Structure

```
Picker/
├── README.md                    # This file
├── CONTEXT.md                   # Quick session context
├── CLAUDE.md                    # Claude session instructions
├── design/                      # Design documents
│   ├── 01-architecture.md       # System architecture, API stack
│   ├── 02-decimal-handling.md   # CRITICAL: Token decimals solution
│   ├── 03-paper-trading.md      # Paper trading architecture
│   ├── 04-monitoring-exit.md    # Exit strategy & monitoring
│   ├── 05-compounding.md        # Compounding strategy
│   ├── 06-priority-fees.md      # Priority fee strategies
│   └── 07-error-recovery.md     # Error recovery & resilience
├── docs/                        # API references
├── src/                         # Source code (when implemented)
│   ├── config/
│   ├── db/
│   ├── solana/
│   ├── jupiter/
│   ├── security/
│   ├── paperTrading/
│   └── core/
├── .env.example                 # Configuration template
├── Dockerfile
├── docker-compose.yml
└── ssrn-3247865.pdf             # Trading strategies reference
```

---

## API Keys Required

| API | Status | Purpose |
|-----|--------|---------|
| Helius RPC | ✓ Have | RPC + WebSocket |
| Jupiter API | ✓ Have | Quotes + Swaps |
| GoPlus Security | ⏳ Get | Token safety checks |
| RugCheck | ✓ Free | No key needed |
| Token Sniffer | ⏳ Get | Cross-verification |

---

## Quick Start (New Session)

1. Read `CONTEXT.md` for current state
2. Check `design/` folder for architecture details
3. Review this README for project overview

---

## License

MIT

---

*Last Updated: 2026-03-10*
