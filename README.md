# Solana Trading Bot - Picker

**Goal:** Build an automated Solana crypto trading bot that maximizes SOL holdings through intelligent token discovery and strategic entry/exit.

---

## Project Overview

This bot uses real-time WebSocket discovery to find trading opportunities on Solana:

1. **Discovers** tokens in real-time via DexScreener WebSocket
2. **Classifies** by age: FRESH (<1hr) vs WARM (1-4hr)
3. **Validates** safety (RugCheck) and tradeability (Jupiter)
4. **Enters** with age-appropriate strategy (10% FRESH / 5% WARM targets)
5. **Exits** with profit via automated stop loss/target profit

**User Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

---

## Current Status: ✅ FULLY IMPLEMENTED

| Phase | Status |
|-------|--------|
| 📝 Design | ✅ Complete |
| 🔨 Implementation | ✅ Complete |
| 📊 Paper Trading | ✅ Complete |
| 🚀 WebSocket Discovery | ✅ Complete |
| 🔧 Jupiter Filter | ⏳ Tuning |

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Build
npm run build

# Run tests
npm test

# Start bot (paper trading mode)
npm run start:paper

# Start bot (live trading mode)
npm run start:live
```

---

## Key Features

### Real-Time Discovery
- DexScreener WebSocket integration for instant token detection
- Age-based classification (FRESH vs WARM tokens)
- Jupiter tradeability pre-filtering

### Age-Based Strategies

| Parameter | FRESH (<1hr) | WARM (1-4hr) |
|-----------|---------------|--------------|
| Target Profit | 10% | 5% |
| Stop Loss | -20% | -25% |
| Max Hold Time | 1 hour | 4 hours |
| Position Size | 0.05 SOL | 0.10 SOL |

**Philosophy:** Consistent 5-10% wins compound better than hoping for 100%+.

### Safety Checks
- **RugCheck.xyz:** Mint authority, freeze authority, liquidity checks
- **GoPlus Security:** Additional verification layer
- **Jupiter Filter:** Only tradeable tokens considered

### Paper Trading
- Real Jupiter quotes, simulated execution
- Realistic slippage modeling
- Performance tracking before live trading

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript / Node.js 20+ |
| Blockchain | @solana/web3.js |
| DEX Aggregation | @jup-ag/api |
| Database | Better SQLite3 |
| Discovery | DexScreener WebSocket |
| RPC | Helius |
| Testing | Vitest |

---

## Configuration

### Environment Variables

```bash
# Trading Mode
TRADING_MODE=live

# Wallet
WALLET_PRIVATE_KEY=your_private_key_here

# RPC
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# APIs (Optional - RugCheck is free)
GOPLUS_API_KEY=your_key
```

---

## Documentation

- **CLAUDE.md** - Developer instructions and design decisions
- **design/** - Detailed architecture documents
  - `01-architecture.md` - System architecture
  - `02-decimal-handling.md` - Token decimal solution
  - `03-paper-trading.md` - Paper trading design
  - `04-monitoring-exit.md` - Exit strategy
  - `05-compounding.md` - Compounding logic
  - `06-priority-fees.md` - Priority fee strategies
  - `07-error-recovery.md` - Error recovery
  - `08-implementation-plan.md` - Implementation roadmap

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN DISCOVERY ENGINE                     │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│   DexScreener WebSocket → Age Classification → Jupiter Filter  │
│                                                                     │
│   ┌──────────────┐      ┌──────────────────┐                   │
│   │ FRESH (<1hr) │      │ WARM (1-4hr)    │                   │
│   │ 10% target   │      │ 5% target       │                   │
│   │ -20% stop    │      │ -25% stop        │                   │
│   │ 0.05 SOL     │      │ 0.10 SOL         │                   │
│   └──────────────┘      └──────────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      TRADING ENGINE                           │
├─────────────────────────────────────────────────────────────┤
│   • Jupiter API for quotes and swaps                           │
│   • RugCheck + GoPlus for safety                              │
│   • Automated stop loss and take profit                         │
│   • Position monitoring and tracking                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing

```bash
# WebSocket discovery tests
npx tsx tests/manual/test-websocket-discovery.ts
npx tsx tests/manual/test-websocket-orchestrator.ts
npx tsx tests/manual/test-websocket-paper-trading.ts

# Original tests
npx tsx tests/manual/test-paper-trading.ts
npx tsx tests/manual/test-live-swap.ts
npx tsx tests/manual/test-swap-back.ts
```

---

## License

MIT

---

*Last Updated: 2025-03-10*
