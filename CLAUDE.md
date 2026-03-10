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

**Key Strategy Change (2025-03):**
- Real-time token discovery via WebSocket
- Age-based classification (FRESH vs WARM tokens)
- Conservative profit targets (5-10%) - consistent wins over home runs
- Jupiter tradeability filter (only tradeable tokens)

---

## Current Status: WEBSOCKET DISCOVERY ✅

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Project Foundation | ✅ Complete | Core infrastructure, types, config |
| Phase 2: Database + APIs | ✅ Complete | SQLite, DexScreener, Jupiter, Safety |
| Phase 3: Trading Engine | ✅ Complete | Entry/exit with paper trading |
| Phase 4: Paper Trading | ✅ Complete | Engine + WebSocket integration |
| Phase 5: WebSocket Discovery | ✅ Complete | Real-time token discovery |
| Phase 6: Live Trading | ⏳ Planned | After validation |

---

## Quick Commands

```bash
# Build and test
npm run build      # TypeScript compilation
npm test           # Run unit tests

# WebSocket Discovery (NEW)
npx tsx tests/manual/test-websocket-discovery.ts       # Test WebSocket discovery
npx tsx tests/manual/test-websocket-orchestrator.ts     # Test entry orchestrator
npx tsx tests/manual/test-websocket-paper-trading.ts    # Test paper trading with WS

# Existing tests
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
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY
BACKUP_RPC_URL=https://api.mainnet-beta.solana.com

# APIs
JUPITER_API_KEY=your_key
GOPLUS_API_KEY=your_key
```

### Trading Parameters (Updated 2025-03)

| Parameter | FRESH Tokens | WARM Tokens |
|-----------|--------------|-------------|
| **Age** | < 1 hour old | 1-4 hours old |
| **Target Profit** | 10% | 5% |
| **Stop Loss** | -20% | -25% |
| **Max Hold Time** | 1 hour | 4 hours |
| **Position Size** | 0.05 SOL | 0.10 SOL |
| **Min Liquidity** | $10,000 | $25,000 |
| **Min Volume 24h** | $1,000 | $5,000 |
| **Min Pump Required** | None | 3%+ |

**Strategy Philosophy:** Consistent 5-10% wins add up. Don't expect every token to do 25-150%.

---

## Critical Design Decisions

### 1. Decimal Precision (CRITICAL)

**The Problem:** User experienced skewed sell balances because tokens have 6-9 decimals.

**The Solution:**
- Fetch token metadata (decimals) at ENTRY time
- Store `tokensReceivedRaw` (exact value from Jupiter) in database
- At EXIT, use stored raw amount directly - NO conversion

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

### 2. WebSocket Token Discovery (NEW 2025-03)

**Problem:** DexScreener API has rate limits and shows already-pumped tokens.

**Solution:** Real-time WebSocket discovery with age classification.

```typescript
// src/scanner/websocket-discovery.ts
export enum TokenAge {
  FRESH = 'fresh',  // < 1 hour old (early movers)
  WARM = 'warm',    // 1-4 hours old (momentum)
  STALE = 'stale',  // > 4 hours old (skip)
}
```

**Key Features:**
- Real-time DexScreener WebSocket connection
- Age-based strategy parameters
- Jupiter tradeability filter (only tradeable tokens)
- Opportunity scoring (0-100 points)
- Full safety integration (RugCheck + GoPlus)

### 3. Jupiter Tradeability Filter (CRITICAL)

**Problem:** Not all tokens discovered via DexScreener are tradeable on Jupiter.

**Solution:** Pre-filter with Jupiter quote check before adding tokens.

```typescript
// In processToken():
const jupiterTradeable = await this.checkJupiterTradeability(tokenAddress);
if (!jupiterTradeable) {
  return; // Skip tokens we can't trade
}
```

**Why this matters:** If we can't get a quote, we can't know the price or execute a trade.

### 4. Exit Strategy (Aggressive Profit Taking)

**Updated Strategy:** Take profits early and often.

| Condition | Action |
|-----------|--------|
| Stop Loss | -20% (FRESH) / -25% (WARM) |
| Target Hit | Sell at 10% (FRESH) or 5% (WARM) |
| Max Hold | 1 hour (FRESH) / 4 hours (WARM) |
| Emergency | Liquidity crash → Exit immediately |

**Philosophy:** Consistent 5-10% wins compound better than hoping for 100%+.

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
│   ├── scanner/           # DexScreener + WebSocket discovery
│   │   ├── scanner.ts
│   │   ├── dexscreener.ts
│   │   └── websocket-discovery.ts  # NEW: Real-time discovery
│   ├── safety/            # RugCheck + GoPlus safety
│   ├── entry/             # Entry logic
│   │   └── websocket-orchestrator.ts  # NEW: Live trading orchestrator
│   ├── exit/              # Exit logic (strategy, executor, monitor)
│   ├── paper/             # Paper trading
│   │   ├── engine.ts
│   │   ├── wallet.ts
│   │   ├── slippage.ts
│   │   ├── analytics.ts
│   │   └── websocket-orchestrator.ts  # NEW: Paper trading with WS
│   ├── bot/               # Main bot orchestrator
│   └── cli/               # CLI commands
├── tests/
│   ├── unit/              # Unit tests
│   ├── integration/       # API integration tests
│   └── manual/            # Manual test scripts
│       ├── test-websocket-discovery.ts       # NEW
│       ├── test-websocket-orchestrator.ts     # NEW
│       └── test-websocket-paper-trading.ts    # NEW
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
| WebSocket | DexScreener (token-boosts) |
| Real-time RPC | Helius |
| Testing | Vitest |

---

## API Keys Status

| API | Status | Purpose |
|-----|--------|---------|
| Helius RPC | ✓ Configured | Primary RPC + WebSocket |
| Jupiter API | ✓ Configured | Quotes + Swaps |
| GoPlus Security | Optional | Token safety (can use RugCheck only) |
| RugCheck | ✓ Free | Rug pull detection (primary) |

---

## WebSocket Discovery (NEW 2025-03)

### How It Works

```
DexScreener WebSocket → Real-time token boosts
                          ↓
                  Age Classification
                          ↓
              ┌─────────┴─────────┐
              ▼                   ▼
          FRESH (<1hr)        WARM (1-4hr)
          10% target          5% target
          -20% stop           -25% stop
          0.05 SOL            0.10 SOL
                          ↓
                  Jupiter Tradeability Check
                          ↓
                  Only tradeable tokens
                          ↓
                  Safety Checks (RugCheck)
                          ↓
                  Add to watchlist / Trade
```

### Strategy Parameters by Age

| Parameter | FRESH | WARM |
|-----------|-------|------|
| **Max Age** | 1 hour | 4 hours |
| **Target Profit** | 10% | 5% |
| **Stop Loss** | -20% | -25% |
| **Max Hold** | 60 min | 240 min |
| **Position Size** | 0.05 SOL | 0.10 SOL |
| **Min Liquidity** | $10K | $25K |
| **Min Volume** | $1K | $5K |
| **Pump Required** | None | 3%+ |

### Opportunity Scoring (0-100)

| Factor | Points |
|--------|--------|
| Safety (HIGH/MED/LOW) | 30 / 15 / 0 |
| Liquidity (sweet spot) | 0-20 |
| Volume Spike (h1/h6 ratio) | 0-25 |
| Early Momentum (FRESH only) | 0-25 |

---

## Known Issues & Current Work

### Current Limitation (2025-03)

**Jupiter Tradeability Filter:**
- DexScreener WebSocket shows tokens from ALL DEXs
- Most boosted tokens are NOT on Jupiter
- Current filter correctly rejects non-tradeable tokens
- **Result:** Very few tokens pass the Jupiter filter

**Planned Solution:**
- Switch from DexScreener WebSocket to DexScreener `trending` or `search` API
- Trending tokens more likely to be on major DEXs (including Jupiter)
- Still need Jupiter filter, but higher success rate

---

## Important Conversations

### User's Strategy Philosophy (2025-03)

> "we cant be greedy and expect every token to have 25%-150% return (not realistic), even if we get a consistent 5% return. it could add up after a day of trading."

**This drove the strategy change to conservative 5-10% targets.**

### User's Discovery Concern (2025-03)

> "i noticed that the 3 coins we filtered had already pumped, so we are buying a top."

> "our discovery engine should be finding tokens for us!"

**This led to implementing WebSocket discovery for early detection.**

### Jupiter Tradeability Question (2025-03)

> "why are we tracking tokens that cant be traded on Jupiter? how would we trade them?"

**Valid point! Added Jupiter tradeability filter to only consider tradeable tokens.**

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

*Last Updated: 2026-03-10*
*Session: WebSocket Discovery Integration*
*Status: Discovery implemented, validating tradeability filter*
