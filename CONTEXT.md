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

## Current Phase: Phase 1 Complete ✅ | Phase 2 Next

### ✅ Phase 1: Project Foundation (COMPLETED)

**Status:** All code review issues fixed, 93 tests passing, lint clean

| Component | Status | Tests |
|-----------|--------|-------|
| Core Types (src/types/index.ts) | ✅ Complete | - |
| Environment Config (src/config/index.ts) | ✅ Complete + Base58 validation | - |
| Constants (src/config/constants.ts) | ✅ Complete | - |
| Decimal Utilities (src/utils/decimal.ts) | ✅ Complete - String-based precision | 69 tests |
| Sleep Utility (src/utils/sleep.ts) | ✅ Complete | 8 tests |
| Retry Utility (src/utils/retry.ts) | ✅ Complete | 16 tests |
| Logger (src/utils/logger.ts) | ✅ Complete | - |

**Phase 1 Deliverables:**
- ✅ TypeScript strict mode configuration (all strict options enabled)
- ✅ Zod schemas for runtime validation
- ✅ BN.js-based decimal conversion (CRITICAL for token amounts)
- ✅ Exponential backoff retry with circuit breaker pattern
- ✅ Structured logging with level filtering
- ✅ ESLint + Prettier + Vitest setup
- ✅ 93 tests passing, 0 lint warnings

**Code Review Fixes Applied:**
1. ✅ Fixed floating-point precision in `humanToRaw()` using string-based calculation
2. ✅ Added negative amount validation to `calculatePartialExitRaw()`
3. ✅ Added Base58 validation for wallet private key
4. ✅ Added `.d.ts` to ESLint ignore patterns
5. ✅ Added tests for `calculatePartialExitRaw` (8 tests)
6. ✅ Added tests for `formatAmount` (6 tests)

### ⏳ Phase 2: Database Layer (NEXT UP)

**Planned Implementation:**
1. Better SQLite3 schema design
2. Repository pattern for data access
3. Migration system
4. Integration tests for database operations

---

## Design Documents (All Complete ✅)

| Design Doc | Status | Description |
|------------|--------|-------------|
| 01-architecture.md | ✅ Complete | Overall system architecture, API stack, Docker setup |
| 02-decimal-handling.md | ✅ Complete | CRITICAL: Solving 6-9 decimal token issue |
| 03-paper-trading.md | ✅ Complete | Paper trading architecture with realistic simulation |
| 04-monitoring-exit.md | ✅ Complete | Real-time monitoring, trailing stop, exit handlers |
| 05-compounding.md | ✅ Complete | 3-stage compounding: build, growth, expansion |
| 06-priority-fees.md | ✅ Complete | Dynamic priority fees, entry/exit strategies |
| 07-error-recovery.md | ✅ Complete | RPC failover, transaction monitoring, circuit breakers |

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

### 6. Priority Fee Strategy (Entry vs Exit)
- **Entry:** Conservative fees (10K-50K lamports) - opportunity cost only
- **Exit:** Aggressive fees (100K-1M+ lamports) - speed is critical
- **Dynamic Scaling:** Higher fees for higher profits, emergency fees for trailing stop

### 7. Error Recovery & Resilience
- **Multi-RPC Strategy:** Primary (Helius) + Backup + Public fallback with automatic failover
- **Circuit Breaker:** Open after 5 failures, half-open after 60 seconds
- **Transaction Monitoring:** Track every tx, detect stuck after 60s
- **Exponential Backoff:** 3 attempts, 1s → 2s → 4s delay

---

## Technical Stack

```json
{
  "dependencies": {
    "@solana/web3.js": "^1.95.8",
    "bn.js": "^5.2.1",
    "better-sqlite3": "^11.7.0",
    "zod": "^3.24.1",
    "ws": "^8.18.0",
    "pino": "^9.6.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^2.1.8",
    "@vitest/coverage-v8": "^2.1.8",
    "eslint": "^9.18.0",
    "prettier": "^3.4.2"
  }
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
├── CLAUDE.md                    # Claude instructions
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # Strict TypeScript config
├── vitest.config.ts             # Test configuration
├── .eslintrc.cjs                # ESLint rules
├── .env.example                 # Config template
├── design/                      # All design docs (complete)
│   ├── 01-architecture.md
│   ├── 02-decimal-handling.md
│   ├── 03-paper-trading.md
│   ├── 04-monitoring-exit.md
│   ├── 05-compounding.md
│   ├── 06-priority-fees.md
│   └── 07-error-recovery.md
├── src/
│   ├── types/
│   │   └── index.ts             # Core types and Zod schemas
│   ├── config/
│   │   ├── index.ts             # Environment validation
│   │   └── constants.ts         # Trading constants
│   └── utils/
│       ├── decimal.ts           # CRITICAL: Token decimal conversion
│       ├── sleep.ts             # Async sleep utility
│       ├── retry.ts             # Exponential backoff retry
│       └── logger.ts            # Structured logging
├── tests/
│   └── utils/
│       ├── decimal.test.ts      # 69 tests
│       ├── sleep.test.ts        # 8 tests
│       └── retry.test.ts        # 16 tests
└── docs/                        # API docs (to be added)
```

---

## Database Schema (SQLite - Planned for Phase 2)

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

## Commands for New Session

```bash
# Navigate to project
cd /home/saturn/Downloads/Picker

# Check current status
git status
git log --oneline -5

# Run verification
npm run lint       # ESLint check
npm run build      # TypeScript compilation
npm run test       # Run all 93 tests
npm run test -- --run --coverage  # Run with coverage

# Pull latest changes
git pull origin main
```

---

## Last Session Summary (2026-03-10)

**Completed:**
- ✅ **Phase 1: Project Foundation** - Fully implemented and tested
- ✅ **Code Review** - All HIGH and MEDIUM issues fixed
- ✅ **Test Coverage** - 93 tests passing (69 decimal, 16 retry, 8 sleep)
- ✅ **Lint Clean** - 0 errors, 0 warnings
- ✅ **TypeScript Strict Mode** - All strict options enabled

**Key Fixes Applied:**
1. Floating-point precision in `humanToRaw()` - Now uses string-based calculation
2. Negative amount validation in `calculatePartialExitRaw()`
3. Base58 validation for wallet private key
4. Added tests for previously untested functions

**Current Status:**
- Phase 1: ✅ Complete
- Phase 2: ⏳ Ready to start (Database Layer)

**Next Session Priority:**
Start Phase 2 - Database Layer implementation with:
1. Better SQLite3 schema design
2. Repository pattern for data access
3. Migration system
4. Integration tests

---

*Remember: All design is complete. Follow TDD - write tests first, then implementation. Target 80%+ coverage.*
