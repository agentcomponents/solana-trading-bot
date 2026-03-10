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
| 📝 Design | 🔄 80% Complete | Architecture, decimals, paper trading, compounding done; error recovery, monitoring pending |
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

---

## Project Structure

```
Picker/
├── README.md                    # This file
├── CONTEXT.md                   # Quick session context
├── design/                      # Design documents
│   ├── 01-architecture.md
│   ├── 02-decimal-handling.md
│   ├── 03-paper-trading.md
│   ├── 04-monitoring-exit.md
│   └── 05-compounding.md
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

*Last Updated: 2025-03-10*
