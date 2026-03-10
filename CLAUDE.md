# Solana Trading Bot - Claude Instructions

> **IMPORTANT:** Read this file first when starting a new session on this project.

---

## Project Quick Start

```bash
# Navigate to project
cd /home/saturn/Downloads/Picker

# Read context first
cat CONTEXT.md

# Pull latest changes
git pull origin main

# Check current status
git status
git log --oneline -5
```

---

## Project Overview

**Goal:** Build a Solana crypto trading bot that maximizes SOL holdings through intelligent token discovery and strategic entry/exit.

**User's Core Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

**Starting Capital:** 0.1 SOL → Compounds after reaching 0.3 SOL

---

## Current Status: IMPLEMENTATION COMPLETE ✅

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 1: Project Foundation | ✅ Complete | 93 tests |
| Phase 2: Database + APIs | ✅ Complete | 225+ tests |
| Phase 3: Trading Engine | ✅ Complete | 298+ tests |
| Phase 4: Paper Trading | ✅ Complete | 31 tests |
| Phase 5: Main Bot | ✅ Complete | 15 tests |

**Total: 364 tests passing ✅**

**Current State:** Bot is fully implemented and currently running in paper trading mode.

---

## Quick Commands

```bash
# Build and test
npm run build      # TypeScript compilation
npm test -- --run  # Run all 364 tests

# Run the bot
npm run start:paper  # Paper trading mode (simulated)
npm run start:live   # Live trading mode (REAL MONEY)

# Monitor and report
npm run status       # Show current positions
npm run report       # Generate performance report

# Manual tests
npx tsx tests/manual/test-paper-trading.ts  # Full paper trading cycle test
npx tsx tests/manual/test-live-swap.ts      # Test live SOL→USDC swap
npx tsx tests/manual/test-swap-back.ts      # Test USDC→SOL swap
```

---

## Configuration

### Environment Variables (.env)

```bash
# Trading Mode: paper or live
TRADING_MODE=live

# Wallet (NEVER commit)
WALLET_PRIVATE_KEY=your_key_here

# RPC endpoints
HELIUS_RPC_URL=https://beta.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_WS_URL=wss://beta.helius-rpc.com/?api-key=YOUR_KEY
BACKUP_RPC_URL=https://api.mainnet-beta.solana.com

# APIs
JUPITER_API_KEY=your_key
GOPLUS_API_KEY=your_key
```

### Trading Parameters

| Parameter | Value |
|-----------|-------|
| Initial Capital | 0.1 SOL |
| Entry Slippage | 1% (100 bps) |
| Exit Slippage | 3% (300 bps) |
| Max Positions | 1 |
| Scan Interval | 60 seconds |
| Stop Loss | -40% |
| Take Profit 1 | +50% (sell 25%) |
| Take Profit 2 | +100% (sell 25%, activate trailing) |
| Trailing Stop | 15% below peak |
| Max Hold Time | 4 hours |

---

## Critical Design Decisions (Must Follow)

### 1. Decimal Precision (CRITICAL - User's Past Bug)

**The Problem:** User experienced skewed sell balances because tokens have 6-9 decimals.

**The Solution:**
- Fetch token metadata (decimals) at ENTRY time
- Store `tokensReceivedRaw` (exact value from Jupiter) in database
- At EXIT, use stored raw amount directly - NO conversion
- Only convert to human amounts for display and P&L calculation

```typescript
// CORRECT PATTERN (must follow)
const position = {
  tokensReceivedRaw: quote.outAmount,  // Store raw from Jupiter
  tokenDecimals: metadata.decimals,    // Fetch from mint at entry
}

// At exit: Use stored raw directly
await jupiter.swap({
  amount: new BN(position.tokensReceivedRaw)  // No conversion!
})
```

### 2. Foreign Key Constraints

**Important:** When creating a position, the `token_metadata` entry must exist first.

```typescript
// In paper engine, before creating position:
this.tokenMetadataRepo.getOrCreate(token.address, {
  symbol: tokenMetadata.symbol,
  name: token.name || tokenMetadata.symbol,
  decimals: tokenMetadata.decimals,
});
```

### 3. Exit Reason Enum

**Valid exit reasons** (CHECK constraint in database):
- `STOP_LOSS`
- `TAKE_PROFIT_1`
- `TAKE_PROFIT_2`
- `TRAILING_STOP`
- `MAX_HOLD_TIME`
- `EMERGENCY`
- `MANUAL`

### 4. RPC Configuration

**Primary:** Helius RPC (user's API key)
**Backup:** Solana public RPC (`https://api.mainnet-beta.solana.com`)

**Never use placeholder URLs** like `https://backup.rpc.com`

---

## File Structure

```
Picker/
├── CLAUDE.md              # THIS FILE - Read first!
├── CONTEXT.md             # Session context summary
├── README.md              # Project overview
├── .env                   # Actual config (NEVER commit)
├── .env.example           # Configuration template
├── package.json
├── tsconfig.json
├── design/                # All design documents (complete)
│   ├── 01-architecture.md
│   ├── 02-decimal-handling.md
│   ├── 03-paper-trading.md
│   ├── 04-monitoring-exit.md
│   ├── 05-compounding.md
│   ├── 06-priority-fees.md
│   └── 07-error-recovery.md
├── src/
│   ├── types/             # Core types and Zod schemas
│   ├── config/            # Environment validation
│   ├── utils/             # Utilities (decimal, sleep, retry, logger)
│   ├── db/                # Database layer (Better SQLite3)
│   ├── solana/            # Solana connection, wallet
│   ├── jupiter/           # Jupiter API client (quotes + swaps)
│   ├── scanner/           # DexScreener client
│   ├── safety/            # RugCheck + GoPlus safety
│   ├── entry/             # Entry logic
│   ├── exit/              # Exit logic (strategy, executor, orchestrator)
│   ├── paper/             # Paper trading (engine, wallet, slippage)
│   ├── bot/               # Main bot orchestrator, config
│   ├── cli/               # CLI commands
│   └── index.ts           # Main entry point
├── tests/
│   ├── unit/              # 364 unit tests
│   ├── integration/       # API integration tests
│   └── manual/            # Manual test scripts
└── data/                  # SQLite database
    └── trading-bot.db
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript / Node.js 20+ |
| Blockchain | @solana/web3.js |
| DEX Aggregation | @jup-ag/api |
| Database | Better SQLite3 |
| Validation | Zod |
| Real-time | WebSocket (Helius) |
| Testing | Vitest |

---

## API Keys Status

| API | Status | Purpose |
|-----|--------|---------|
| Helius RPC | ✓ Configured | Primary RPC + WebSocket |
| Jupiter API | ✓ Configured | Quotes + Swaps |
| GoPlus Security | ✓ Configured | Token safety |
| RugCheck | ✓ Free | Rug pull detection |

---

## When Resuming This Project

1. **Read CONTEXT.md** - Contains session summary and next steps
2. **Check if bot is running:** `ps aux | grep tsx`
3. **Check status:** `npm run status`
4. **Ask user** - "What would you like to work on today?"

---

## Testing Status

| Test Type | Count | Status |
|-----------|-------|--------|
| Unit Tests | 364 | ✅ Passing |
| Integration | - | ✅ Working |
| Manual Tests | 3 | ✅ Passing |

### Manual Tests (All Passing)

1. **test-paper-trading.ts** - Full paper trading cycle (scan → entry → exit → DB)
2. **test-live-swap.ts** - Live SOL → USDC swap (tested with 0.01 SOL)
3. **test-swap-back.ts** - Live USDC → SOL swap (restored balance)

---

## Live Trading Readiness Criteria

Before switching from paper to live trading:

| Criterion | Threshold | Current |
|-----------|-----------|---------|
| Minimum Paper Trades | ≥ 20 | ⏳ In progress |
| Win Rate | ≥ 40% | ⏳ TBD |
| Max Drawdown | < 30% | ⏳ TBD |
| Positive P&L | Yes | ⏳ TBD |

**Current Status:** Bot is running in paper trading mode to gather performance data.

---

## Known Issues & Fixes

### Fixed Issues

1. **Helius preflight error** - Fixed by setting `skipPreflight: true`
2. **FOREIGN KEY constraint** - Fixed by creating token metadata before position
3. **exitReason CHECK constraint** - Fixed by using valid enum values ('MANUAL', not custom strings)
4. **Backup RPC placeholder** - Fixed tests to use real Solana public RPC
5. **start:paper not forcing paper mode** - Fixed by setting `process.env.TRADING_MODE = 'paper'` before loading config

### GoPlus API Warnings

The GoPlus security API occasionally returns errors. The system gracefully handles this and continues with other safety checks (RugCheck).

---

## Important Conversations

### User's Specific Quote on Decimal Bug

> "some issues i had in the past included which decimal the token was using (6 to 9), as this could skew the sell balance when trying to exit."

**This is why the decimal handling solution is CRITICAL.**

### User's Paper Trading Requirement

> "We must also paper trade using live data before going live, trying to simulate onchain trading to test our strategy."

**No live trading until 20+ successful paper trades.**

### User's Live Trading Test Instructions

> "are there other background services trying to access the api? . kill all and clean up the environment. start with a fresh build"

> "swap a small amount to USDC 0.01"
> "swap back to sol"
> "we cannot start trading yet. we need to test the system"

**Live swap tests completed successfully ✅**

---

## Git Workflow

```bash
# Check status
git status
git log --oneline -5

# Commit changes
git add -A
git commit -m "type: description"

# Push to remote
git push origin main
```

**Never commit:**
- `.env` file (use .env.example)
- Actual private keys
- Node modules

---

## Recent Commits

```
9513bd1 fix: use real Solana public RPC as backup (not placeholder)
300fa9d fix: paper trading foreign key constraint + test fixes
d5ff489 fix: update DexScreener API to use token-boosts + token-pairs
c868d13 feat: implement Phase 5 Main Bot Orchestrator
9744b8c docs: prepare session handoff - Phase 4 complete
```

---

*Last Updated: 2026-03-10*
*Session: Paper Trading Validation In Progress*
*Status: Bot running in paper mode, gathering performance data*
