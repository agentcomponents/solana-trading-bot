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
```

---

## Project Overview

**Goal:** Build a Solana crypto trading bot that maximizes SOL holdings through intelligent token discovery and strategic entry/exit.

**User's Core Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

**Starting Capital:** 0.1 SOL → Compounds after reaching 0.3 SOL

---

## Current Status: Design Phase

| Phase | Status |
|-------|--------|
| 📝 Architecture Design | ✅ Complete |
| 🔨 Implementation | ⏳ NOT STARTED - Awaiting user sign-off |
| 📊 Paper Trading | ⏳ Planned |
| 🚀 Live Trading | ⏳ Planned |

**CRITICAL: Do NOT start coding until all design is finalized and user approves.**

---

## Critical Design Decisions (Must Follow)

### 1. Decimal Precision (CRITICAL - User's Past Bug)

**The Problem:** User experienced skewed sell balances because tokens have 6-9 decimals.

**The Solution:**
- Fetch token metadata (decimals) at ENTRY time
- Store `tokensReceivedRaw` (exact value from Jupiter) in database
- At EXIT, use stored raw amount directly - NO conversion
- Only convert to human amounts for display and P&L calculation

**File:** `design/02-decimal-handling.md`

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

### 2. Entry Strategy (User Confirmed)

| Parameter | Value |
|-----------|-------|
| Timing | Wait 1-2 confirmations with limit orders |
| Slippage | 1% (100 bps) |
| Min Liquidity | $15,000 USD / 50 SOL pool |
| Safety Checks | ALL: RugCheck + GoPlus + Token Sniffer |

### 3. Exit Strategy (User Confirmed)

| Condition | Trigger |
|-----------|---------|
| Stop Loss | -40% |
| Trailing Stop | 15% below peak (after +100%) |
| Max Hold Time | 4 hours |
| Partial Exit 1 | 25% at +50% |
| Partial Exit 2 | 25% at +100% |
| Remaining | Trailing stop |

### 4. Paper Trading Before Live

- Minimum 20 trades
- Win rate ≥ 40%
- Max drawdown < 30%
- Real quotes, simulated execution with realistic slippage

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript / Node.js 20+ |
| Blockchain | @solana/web3.js |
| DEX Aggregation | @jup-ag/core |
| Database | Better SQLite3 |
| Validation | Zod |
| Real-time | WebSocket (Helius) |
| Container | Docker |

---

## API Keys Status

| API | Status | Purpose |
|-----|--------|---------|
| Helius RPC | ✓ User has | Primary RPC + WebSocket |
| Jupiter API | ✓ User has | Quotes + Swaps |
| GoPlus Security | ⏳ Need to get | Token safety |
| RugCheck | ✓ Free | No key needed |
| DexScreener CLI | ✓ User has | Token scanning |

---

## File Structure

```
Picker/
├── CLAUDE.md              # THIS FILE - Read first!
├── CONTEXT.md             # Session context summary
├── README.md              # Project overview
├── .env.example           # Configuration template
├── design/                # All design documents
│   ├── 01-architecture.md     # System architecture
│   ├── 02-decimal-handling.md # CRITICAL: Decimal solution
│   ├── 03-paper-trading.md    # Paper trading design
│   ├── 04-monitoring-exit.md  # Exit strategy (pending)
│   ├── 05-compounding.md      # Compounding logic
│   ├── 06-priority-fees.md    # Priority fee strategies
│   └── 07-error-recovery.md   # Error recovery & resilience
├── docs/                  # API references (empty for now)
└── src/                   # Source code (NOT CREATED YET)
```

---

## When Resuming This Project

1. **Read CONTEXT.md** - Contains session summary and next steps
2. **Read design/** folder - Review completed design documents
3. **Check git status** - See what's changed since last session
4. **Ask user** - "What would you like to work on today?"

---

## Commands for Development

```bash
# Git operations
git status
git log --oneline -10
git pull origin main
git add -A
git commit -m "message"
git push

# When ready to implement (NOT YET)
npm install
npm run build
npm run dev
```

---

## Implementation Checklist (NOT STARTED)

When user approves design, follow this order:

- [ ] Phase 1: Project Setup
  - [ ] Initialize TypeScript project
  - [ ] Set up Docker
  - [ ] Create database schema
  - [ ] Set up environment validation

- [ ] Phase 2: Core Infrastructure
  - [ ] Solana connection (Helius RPC)
  - [ ] Token metadata fetching
  - [ ] Decimal conversion utilities
  - [ ] Database layer

- [ ] Phase 3: Trading Engine
  - [ ] Jupiter swap executor
  - [ ] Token scanner (DexScreener CLI integration)
  - [ ] Safety checkers (RugCheck, GoPlus)
  - [ ] Entry/exit logic

- [ ] Phase 4: Paper Trading
  - [ ] Slippage simulator
  - [ ] Paper trading engine
  - [ ] Price monitoring
  - [ ] Performance analytics

- [ ] Phase 5: Live Trading
  - [ ] Error recovery
  - [ ] Real-time monitoring
  - [ ] Dashboard/CLI

---

## Important Conversations

### User's Specific Quote on Decimal Bug

> "some issues i had in the past included which decimal the token was using (6 to 9), as this could skew the sell balance when trying to exit."

**This is why design/02-decimal-handling.md is CRITICAL.**

### User's Paper Trading Requirement

> "We must also paper trade using live data before going live, trying to simulate onchain trading to test our strategy."

**No live trading until 20+ successful paper trades.**

---

## Next Steps (Current Design Phase)

1. ✅ Architecture design
2. ✅ Decimal handling solution
3. ✅ Paper trading architecture
4. ✅ Position compounding logic
5. ✅ Priority fee strategies
6. ✅ **Error recovery design**
7. ⏳ **Finalize exit strategy** (NEXT - design/04-monitoring-exit.md)
8. ⏳ Implementation plan

---

## Testing Requirements

**MANDATORY:** Test-Driven Development with 80%+ coverage

- Unit tests for all utilities
- Integration tests for API calls
- E2E tests for critical flows
- Paper trading validation tests

---

## Git Workflow

```
1. Create/update design docs
2. Commit with descriptive message
3. Push to GitHub
4. Update CONTEXT.md with progress
```

**Never commit:**
- `.env` file (use .env.example)
- Actual private keys
- Node modules

---

*Last Updated: 2026-03-10*
*Session Phase: Design & Architecture (98% Complete)*
