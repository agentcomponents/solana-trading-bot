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

## Current Phase: Phase 2 Complete ✅ | Phase 3 Next

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

### ✅ Phase 2: Database & API Integrations (COMPLETED)

**Status:** All APIs integrated and tested, 225+ tests passing

| Component | Status | Tests |
|-----------|--------|-------|
| Database Layer (Better SQLite3) | ✅ Complete | 38 tests |
| Helius RPC Integration | ✅ Complete | 7 tests |
| Jupiter API Integration | ✅ Complete | 33 tests |
| GoPlus Security API | ✅ Complete | 23 tests |
| RugCheck API | ✅ Complete | 25 tests |

**Phase 2 Deliverables:**
- ✅ Better SQLite3 with WAL mode
- ✅ Repository pattern for data access
- ✅ Database schema with migrations
- ✅ Helius RPC client (connection, balance, tokens)
- ✅ Jupiter API client (quotes, swaps, priority fees)
- ✅ GoPlus Security API (token safety checks)
- ✅ RugCheck API (security reports, risk analysis)
- ✅ 225+ tests passing, TypeScript compilation clean

**API Key Status:**
| API | Key Status | Purpose |
|-----|------------|---------|
| Helius RPC | ✓ User has | Primary RPC + WebSocket |
| Jupiter API | ✓ User has | Quotes + Swaps |
| GoPlus Security | ✓ User has | Token safety checks |
| RugCheck | Free (no key) | Rug pull detection |
| DexScreener CLI | User has tool | Token scanning (Phase 3) |

### ⏳ Phase 3: Trading Engine (NEXT UP)

**Planned Implementation:**
1. Token Scanner (DexScreener CLI integration)
2. Safety Checker (aggregates RugCheck + GoPlus results)
3. Entry Logic (quote, validate, execute)
4. Exit Logic (monitoring, trailing stop, partial exits)
5. Paper Trading Engine (simulated execution)

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
├── .prettierrc                  # Prettier config
├── .env.example                 # Config template
├── design/                      # All design docs (complete)
│   ├── 01-architecture.md
│   ├── 02-decimal-handling.md
│   ├── 03-paper-trading.md
│   ├── 04-monitoring-exit.md
│   ├── 05-compounding.md
│   ├── 06-priority-fees.md
│   ├── 07-error-recovery.md
│   └── 08-implementation-plan.md
├── src/
│   ├── types/
│   │   └── index.ts             # Core types and Zod schemas
│   ├── config/
│   │   ├── index.ts             # Environment validation
│   │   └── constants.ts         # Trading constants
│   ├── utils/
│   │   ├── decimal.ts           # CRITICAL: Token decimal conversion
│   │   ├── sleep.ts             # Async sleep utility
│   │   ├── retry.ts             # Exponential backoff retry
│   │   └── logger.ts            # Structured logging
│   ├── db/
│   │   ├── client.ts            # Database client (WAL mode)
│   │   ├── init.ts              # Database initialization
│   │   ├── schema.ts            # SQL schema definitions
│   │   ├── repository.ts        # Repository pattern base
│   │   └── repositories/
│   │       ├── positions.ts     # Positions CRUD
│   │       └── token-metadata.ts # Token metadata cache
│   ├── jupiter/
│   │   └── client.ts            # Jupiter API client
│   └── safety/
│       ├── goplus.ts            # GoPlus Security API client
│       └── rugcheck.ts          # RugCheck API client
├── tests/
│   ├── setup.ts                 # Test setup (dotenv)
│   ├── utils/
│   │   ├── decimal.test.ts      # 69 tests
│   │   ├── sleep.test.ts        # 8 tests
│   │   └── retry.test.ts        # 16 tests
│   ├── db/
│   │   ├── client.test.ts       # Database client tests
│   │   ├── positions.test.ts    # Positions repository tests
│   │   └── token-metadata.test.ts # Token metadata tests
│   ├── jupiter/
│   │   └── client.test.ts       # Jupiter client tests
│   ├── integration/
│   │   ├── helius.test.ts       # Helius RPC tests
│   │   ├── jupiter.test.ts      # Jupiter API tests
│   │   ├── goplus.test.ts       # GoPlus integration tests
│   │   └── rugcheck.test.ts     # RugCheck integration tests
│   └── safety/
│       ├── goplus.test.ts       # GoPlus safety module tests
│       └── rugcheck.test.ts     # RugCheck safety module tests
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
- ✅ **Phase 2: Database & API Integrations** - Fully implemented and tested
- ✅ **Database Layer** - Better SQLite3 with WAL mode, repository pattern
- ✅ **API Integrations** - Helius, Jupiter, GoPlus, RugCheck all tested
- ✅ **Test Coverage** - 225+ tests passing across all modules
- ✅ **TypeScript Compilation** - Clean build, no errors
- ✅ **Live Token Testing** - Verified safety APIs with real tokens

**Live Token Testing Results:**
| Token | Symbol | Result | Key Findings |
|-------|--------|--------|--------------|
| xyzR4s6H724bUq6q7MTqWxUnhi8LM5fiKKUq38h8M1P | SHROOM | ⚠️ CAUTION | 59% holder concentration, mutable metadata |
| 8yW8gpJh4BoXMTHPmt2JWT4XEoQqDEvMcea3WurNpump | Miracil D | ✅ SAFE | Perfect score 1/100, well distributed |
| 5NFHTLFBQ3GgQ9QwjeWzHkVpCTQwwcko3vDpkakvpump | HATE | 🚨 HIGH RISK | 62% holder concentration, $6K liquidity |

**Validated Safety Thresholds:**
- ✅ Minimum liquidity: $15,000 (tokens below $6K flagged)
- ✅ Holder concentration: Alert when top holder > 50%
- ✅ RugCheck score: 1-100 scale, lower is better
- ✅ Authority checks: mintAuthority, freezeAuthority, mutable metadata

**Current Status:**
- Phase 1: ✅ Complete (Utilities, Types, Config)
- Phase 2: ✅ Complete (Database, API Integrations)
- Phase 3: ⏳ Next (Trading Engine, Paper Trading)

**Next Session Options:**
Choose what to implement first:
1. **Token Scanner** - DexScreener CLI integration to find opportunities
2. **Safety Aggregator** - Combine RugCheck + GoPlus into unified decision engine
3. **Entry Logic** - Quote → Validate → Execute swap flow
4. **Exit Logic** - Price monitoring, trailing stops, partial exits
5. **Paper Trading Engine** - Simulated execution with realistic slippage

---

*Remember: All design is complete. Follow TDD - write tests first, then implementation. Target 80%+ coverage.*
