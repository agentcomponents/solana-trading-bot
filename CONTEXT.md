# Solana Trading Bot - Session Context

> **Quick Start:** Read this file first in any new session to understand the project state.

---

## Project Summary

Build a Solana crypto trading bot that:
1. **Scans** for pumping tokens using DexScreener
2. **Executes** entry/exit swaps via Jupiter SDK
3. **Maximizes** SOL holdings through intelligent compounding
4. **Starts small:** 0.1 SOL initial capital

**Core Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

---

## Current Status: Phase 5 Complete ✅ | Ready for Testing

### 🎯 Quick Reference

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 1: Project Foundation | ✅ Complete | 93 tests |
| Phase 2: Database + APIs | ✅ Complete | 225+ tests |
| Phase 3: Trading Engine | ✅ Complete | 298+ tests |
| Phase 4: Paper Trading | ✅ Complete | 31 tests |
| **Phase 5: Main Bot** | ✅ **Complete** | **15 tests** |

**Total: 364 tests passing ✅**

---

## Latest Session (2026-03-10) - System Testing Phase

### ✅ Live Swap Tests Completed

**Tests Performed:**
1. **SOL → USDC Swap:** 0.01 SOL successfully swapped via Jupiter
   - Quote received: 0.86 USDC
   - Transaction confirmed on mainnet
   - Signature verified on Solscan

2. **USDC → SOL Swap:** Swapped back 0.86 USDC
   - Restored SOL balance
   - Both directions working correctly

3. **Paper Trading Full Cycle Test:** Complete end-to-end test
   - Scanned 6 trading opportunities from DexScreener
   - Safety checks passed (RugCheck + GoPlus)
   - Paper entry: 25,766 tokens @ 0.000002 SOL/token
   - Paper exit: 0.04879 SOL returned
   - P&L: -2.42% (realistic with slippage)
   - Position saved to database with CLOSED state

**Fixes Applied:**
- Fixed Helius RPC preflight error (`skipPreflight: true`)
- Fixed FOREIGN KEY constraint (token metadata pre-creation)
- Fixed exitReason CHECK constraint (use 'MANUAL' not custom strings)

### 🧪 Manual Test Files
```bash
npx tsx tests/manual/test-live-swap.ts     # SOL → USDC swap
npx tsx tests/manual/test-swap-back.ts     # USDC → SOL swap
npx tsx tests/manual/test-paper-trading.ts # Full paper trading cycle
```

---

## Completed Phases

### ✅ Phase 1: Project Foundation

| Component | Status | Tests |
|-----------|--------|-------|
| Core Types (src/types/index.ts) | ✅ Complete | - |
| Environment Config (src/config/index.ts) | ✅ Complete | - |
| Decimal Utilities (src/utils/decimal.ts) | ✅ Complete | 69 tests |
| Sleep/Retry/Logger | ✅ Complete | 24 tests |

**Key Deliverables:**
- TypeScript strict mode, Zod schemas
- BN.js decimal conversion (CRITICAL for token amounts)
- Exponential backoff retry with circuit breaker

### ✅ Phase 2: Database & API Integrations

| Component | Status | Tests |
|-----------|--------|-------|
| Database Layer (Better SQLite3) | ✅ Complete | 38 tests |
| Helius RPC Integration | ✅ Complete | 7 tests |
| Jupiter API Integration | ✅ Complete | 33 tests |
| GoPlus Security API | ✅ Complete | 23 tests |
| RugCheck API | ✅ Complete | 25 tests |

### ✅ Phase 3: Trading Engine

| Component | Status | Tests |
|-----------|--------|-------|
| Safety Aggregator | ✅ Complete | 18 tests |
| DexScreener Client | ✅ Complete | 9 tests |
| Token Scanner | ✅ Complete | 15 tests |
| Entry Validator | ✅ Complete | 7 tests |
| Entry Executor | ✅ Complete | 8 tests |
| Exit Strategy | ✅ Complete | 29 tests |
| Exit Executor | ✅ Complete | 15 tests |
| Price Monitor | ✅ Complete | - |
| Exit Orchestrator | ✅ Complete | - |

### ✅ Phase 4: Paper Trading Engine

| Component | Status | Tests |
|-----------|--------|-------|
| Slippage Simulator | ✅ Complete | 13 tests |
| Virtual Wallet | ✅ Complete | 18 tests |
| Paper Trading Engine | ✅ Complete | - |
| Performance Analytics | ✅ Complete | - |

### ✅ Phase 5: Main Bot Orchestrator

| Component | Status | Tests |
|-----------|--------|-------|
| Bot Config | ✅ Complete | 10 tests |
| Bot Orchestrator | ✅ Complete | 5 tests |
| CLI Commands | ✅ Complete | - |
| Main Entry Point | ✅ Complete | - |

---

## Live Trading Readiness Criteria

Before switching from paper to live trading:

| Criterion | Threshold | Current |
|-----------|-----------|---------|
| Minimum Paper Trades | ≥ 20 | ⏳ Need to run |
| Win Rate | ≥ 40% | ⏳ TBD |
| Max Drawdown | < 30% | ⏳ TBD |
| Positive P&L | Yes | ⏳ TBD |

---

## Repository Structure

```
Picker/
├── README.md
├── CONTEXT.md                   # THIS FILE
├── CLAUDE.md                    # Claude instructions
├── package.json
├── tsconfig.json
├── .env.example
├── design/                      # Complete design docs
├── src/
│   ├── types/                   # Core types and Zod schemas
│   ├── config/                  # Environment validation
│   ├── utils/                   # Utilities (decimal, sleep, retry, logger)
│   ├── db/                      # Database layer
│   ├── jupiter/                 # Jupiter API client
│   ├── scanner/                 # DexScreener client
│   ├── safety/                  # RugCheck + GoPlus safety
│   ├── entry/                   # Entry logic
│   ├── exit/                    # Exit logic
│   ├── paper/                   # Paper trading
│   ├── bot/                     # ✅ NEW - Main bot orchestrator
│   ├── cli/                     # ✅ NEW - CLI commands
│   └── index.ts                 # ✅ NEW - Main entry point
├── tests/
│   ├── unit/                    # Unit tests (364 total)
│   │   ├── bot/                 # ✅ NEW - Bot tests
│   │   └── paper/               # Paper trading tests
│   ├── integration/             # API integration tests
│   └── manual/                  # Demo scripts
└── data/                        # SQLite database
```

---

## Key Design Decisions (Must Follow)

### 1. Decimal Precision (CRITICAL)
**Problem:** Token decimals (6-9) caused skewed sell balances in user's past bot.

**Solution:**
```typescript
// At ENTRY: Store raw amount from Jupiter
positions.tokensReceivedRaw = quote.outAmount  // Store as-is!

// At EXIT: Use stored raw directly
await jupiter.swap({
  amount: new BN(position.tokensReceivedRaw)  // No conversion!
})
```

**Full Design:** `design/02-decimal-handling.md`

### 2. Entry Strategy
| Parameter | Value |
|-----------|-------|
| Min Liquidity | $15,000 USD |
| Max Liquidity | $500,000 USD |
| Slippage | 1% (100 bps) |
| Safety Checks | ALL: RugCheck + GoPlus |

### 3. Exit Strategy
| Condition | Trigger | Action |
|-----------|---------|--------|
| Stop Loss | -40% | Sell 50% |
| Take Profit 1 | +50% | Sell 25% |
| Take Profit 2 | +100% | Sell 25%, activate trailing |
| Trailing Stop | 15% below peak | Sell remaining |
| Max Hold Time | 4 hours | Exit remaining |

### 4. Slippage Simulation (Paper Trading)
```
baseSlippage = (tradeSize / poolSize)^1.5 × 100 bps
finalSlippage = base × volatility × liquidity × side × jitter
Clamp: 5 bps to 500 bps
```

---

## API Keys Status

| API | Status | Purpose |
|-----|--------|---------|
| Helius RPC | ✓ Configured | Primary RPC + WebSocket |
| Jupiter API | ✓ Configured | Quotes + Swaps |
| GoPlus Security | ✓ Configured | Token safety |
| RugCheck | Free | Rug pull detection |

---

## Next Session: Paper Trading Validation

### What's Next

The bot is now **fully implemented**! The next step is to **run paper trading** to validate the strategy:

```
Ready to test:
├── npm run start:paper  ✅ Run paper trading bot
├── npm run report       ✅ Generate performance report
└── npm run status       ✅ Check current positions
```

### Validation Criteria

Before switching to live trading:

| Criterion | Threshold | Current |
|-----------|-----------|---------|
| Minimum Paper Trades | ≥ 20 | ⏳ Need to run |
| Win Rate | ≥ 40% | ⏳ TBD |
| Max Drawdown | < 30% | ⏳ TBD |
| Positive P&L | Yes | ⏳ TBD |

### Steps to Start Paper Trading

1. **Run the bot** (it will scan and trade automatically):
   ```bash
   npm run start:paper
   ```

2. **Monitor progress** in another terminal:
   ```bash
   npm run status
   ```

3. **Generate report** after 20+ trades:
   ```bash
   npm run report
   ```

4. **Review results** and validate:
   - Win rate ≥ 40%
   - Max drawdown < 30%
   - Positive P&L

---

## Commands for New Session

```bash
# Navigate to project
cd /home/saturn/Downloads/Picker

# Pull latest changes
git pull origin main

# Check current status
git status
git log --oneline -5

# Run verification
npm run build      # TypeScript compilation
npm run lint       # ESLint check
npm test -- --run  # Run all 364 tests

# Start paper trading bot
npm run start:paper

# Check status (in another terminal)
npm run status

# Generate report
npm run report
```

---

## Important Technical Notes

### Decimal Handling (CRITICAL)
- **NEVER** convert `tokensReceivedRaw` - use as-is for exits
- Only convert to human amounts for display/P&L calculation
- `tokenDecimals` fetched at entry time for display only

### Database
- Path: `/home/saturn/Downloads/Picker/data/trading-bot.db`
- WAL mode enabled for performance
- Schema version: 1

### Testing
- Total: 364 tests
- Framework: Vitest
- Coverage: 80%+ target achieved

### Git History (Recent)
```
[To be committed] feat: implement Phase 5 Main Bot Orchestrator
b6e2b9a feat: implement Phase 4 Paper Trading Engine
5a656b9 docs: prepare session handoff - Phase 3 complete
612d6e8 docs: update CONTEXT.md for Phase 3 Trading Engine completion
319cdbc feat: implement Phase 3 Exit Logic
```

---

## Design Documents (All Complete ✅)

| Design Doc | Description |
|------------|-------------|
| 01-architecture.md | System architecture, API stack, Docker |
| 02-decimal-handling.md | CRITICAL: Solving 6-9 decimal issue |
| 03-paper-trading.md | Paper trading architecture |
| 04-monitoring-exit.md | Real-time monitoring, trailing stop |
| 05-compounding.md | 3-stage compounding strategy |
| 06-priority-fees.md | Dynamic priority fees |
| 07-error-recovery.md | RPC failover, circuit breakers |

---

*Last Updated: 2026-03-10*
*Session: Phase 5 Main Bot Orchestrator Complete*
*Next: Paper Trading Validation*
