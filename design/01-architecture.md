# 01. System Architecture

**Status:** Complete
**Last Updated:** 2025-03-10

---

## Overview

The Solana Trading Bot is designed as a containerized, isolated system that scans for profitable trading opportunities, executes swaps via Jupiter, and manages positions with strict risk controls.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL API LAYER                            │
├───────────────────┬───────────────────┬─────────────────────────────┤
│     Trading       │     Monitoring     │        Security             │
├───────────────────┼───────────────────┼─────────────────────────────┤
│ • Jupiter Swap    │ • Helius RPC      │ • RugCheck.xyz              │
│ • Jupiter Quote   │ • Helius WS       │ • GoPlus Security API       │
│                  │ • DexScreener     │ • Token Sniffer             │
└───────────────────┴───────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CORE SYSTEM                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│  │   Scanner   │→│  Evaluator  │→│   Executor  │→│  Monitor    ││
│  │ DexScreener│  │Safety+Risk │  │ Jupiter SDK │  │  Position   ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│
│                              │                                      │
│                              ▼                                      │
│                    ┌─────────────────────┐                          │
│                    │   SQLite Database   │                          │
│                    │  • Positions        │                          │
│                    │  • Token Metadata   │                          │
│                    │  • Trades           │                          │
│                    └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 20+ | TypeScript execution |
| **Blockchain** | @solana/web3.js | Solana interaction |
| **DEX Aggregation** | @jup-ag/core | Swap execution |
| **Database** | Better SQLite3 | Position storage |
| **Validation** | Zod | Schema validation |
| **Real-time** | WebSocket (Helius) | Price monitoring |
| **Container** | Docker | Isolation & safety |

---

## API Stack

### Trading APIs

#### Jupiter API
```typescript
// Quote API - Get expected output for a swap
GET https://quote-api.jup.ag/v6/quote?
  inputMint={input_token}
  &outputMint={output_token}
  &amount={amount}
  &slippageBps={slippage}

// Swap API - Execute the swap
POST https://quote-api.jup.ag/v6/swap
```

**Usage:**
- Get quotes for both entry and exit
- Execute swaps with proper slippage tolerance
- Route optimization for best prices

### Monitoring APIs

#### Helius RPC
```typescript
// Primary RPC endpoint
const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key={key}"

// WebSocket for real-time updates
const HELIUS_WS = "wss://mainnet.helius-rpc.com/?api-key={key}"
```

**Usage:**
- Fetch token mint info (decimals, authorities)
- Monitor account changes via WebSocket
- Get transaction confirmations

#### DexScreener API
```typescript
// Token info
GET https://api.dexscreener.com/latest/dex/tokens/{token_address}

// Pair search
GET https://api.dexscreener.com/latest/dex/search/?q={query}
```

**Usage:**
- Real-time price feeds
- Liquidity data
- Volume metrics

### Security APIs

#### RugCheck.xyz (FREE)
```typescript
// No API key needed
GET https://api.rugcheck.xyz/v1/tokens/{token_address}
```

**Checks:**
- Mint authority revoked
- Freeze authority revoked
- Liquidity pool status
- Top holder concentration
- Sell tax (honeypot detection)

#### GoPlus Security API (Free Tier: 100/day)
```typescript
GET https://api.gopluslabs.io/api/v1/token_security/solana?
  contract_addresses={token_address}
```

**Checks:**
- Contract security
- Trading security
- Honeypot information
- Transfer tax

#### Token Sniffer (Optional)
```typescript
// Cross-verification
GET https://api.tokensniffer.com/v2/token/{token_address}
```

---

## Database Schema

```sql
-- Token metadata cache (avoid repeated RPC calls)
CREATE TABLE token_metadata (
    token_address TEXT PRIMARY KEY,
    decimals INTEGER NOT NULL,
    symbol TEXT,
    name TEXT,
    mint_authority_revoked BOOLEAN,
    freeze_authority_revoked BOOLEAN,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active and closed positions
CREATE TABLE positions (
    id TEXT PRIMARY KEY,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,

    -- Entry data (CRITICAL: Store raw amounts for accurate exit)
    entry_sol_spent REAL NOT NULL,
    entry_sol_spent_raw TEXT NOT NULL,
    tokens_received_raw TEXT NOT NULL,  -- KEY: Raw from Jupiter!
    token_decimals INTEGER NOT NULL,    -- KEY: Fetched at entry!
    entry_price_per_token REAL NOT NULL,
    entry_time TIMESTAMP NOT NULL,
    entry_score INTEGER NOT NULL,

    -- DexScreener data at entry
    entry_liquidity REAL,
    entry_market_cap REAL,
    entry_volume_24h REAL,

    -- Exit data
    exit_price_per_token REAL,
    exit_time TIMESTAMP,
    exit_sol_received REAL,
    exit_signature TEXT,
    pnl REAL,
    pnl_percentage REAL,
    exit_reason TEXT,

    status TEXT NOT NULL, -- 'open' or 'closed'

    FOREIGN KEY (token_address) REFERENCES token_metadata(token_address)
);

-- Safety check results (audit trail)
CREATE TABLE safety_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_address TEXT NOT NULL,
    check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL, -- 'rugcheck', 'goplus', 'tokensniffer'
    safe BOOLEAN NOT NULL,
    score INTEGER,
    issues TEXT, -- JSON array
    result_json TEXT, -- Full response for debugging
    FOREIGN KEY (token_address) REFERENCES token_metadata(token_address)
);

-- Trade execution log
CREATE TABLE trades (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'entry' or 'exit'
    signature TEXT NOT NULL,
    input_token TEXT NOT NULL,
    output_token TEXT NOT NULL,
    input_amount_raw TEXT NOT NULL,
    output_amount_raw TEXT NOT NULL,
    input_amount_human REAL NOT NULL,
    output_amount_human REAL NOT NULL,
    slippage_bps INTEGER NOT NULL,
    executed_at TIMESTAMP NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    FOREIGN KEY (position_id) REFERENCES positions(id)
);

-- Performance tracking over time
CREATE TABLE performance_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_sol REAL NOT NULL,
    base_sol REAL NOT NULL,
    profit_sol REAL NOT NULL,
    open_positions_count INTEGER NOT NULL,
    closed_positions_count INTEGER NOT NULL,
    win_count INTEGER NOT NULL,
    loss_count INTEGER NOT NULL,
    largest_win REAL,
    largest_loss REAL,
    current_streak INTEGER
);

-- Indexes for performance
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_token ON positions(token_address);
CREATE INDEX idx_trades_position ON trades(position_id);
CREATE INDEX idx_safety_token_time ON safety_checks(token_address, check_time);
```

---

## Docker Architecture

### Dockerfile

```dockerfile
FROM node:20-bullseye-slim

# Security: Run as non-root user
RUN groupadd -r solana && useradd -r -g solana solana

# Install dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY --chown=solana:solana . .

# Create data directory
RUN mkdir -p /app/data && chown solana:solana /app/data

USER solana

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  solana-bot:
    build: .
    container_name: solana-trading-bot
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - bot-data:/app/data
      - ./logs:/app/logs
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
    networks:
      - bot-network
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp

volumes:
  bot-data:

networks:
  bot-network:
    driver: bridge
```

---

## Configuration

### .env.example

```bash
# ===== Wallet =====
WALLET_PRIVATE_KEY=your_base58_encoded_private_key_here

# ===== APIs =====
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY
JUPITER_API_KEY=YOUR_JUPITER_API_KEY

# Backup RPC (public)
BACKUP_RPC_URL=https://api.mainnet-beta.solana.com

# ===== Security APIs (optional) =====
GOPLUS_API_KEY=your_goplus_key
RUGCHECK_ENABLED=true
TOKEN_SNIFFER_API_KEY=your_tokensniffer_key

# ===== Strategy =====
INITIAL_SOL_AMOUNT=0.1
BASE_SOL=0.1
SCAN_INTERVAL_SECONDS=5
MAX_POSITIONS=1

# ===== Risk Management =====
STOP_LOSS_PERCENTAGE=40
TRAILING_STOP_PERCENTAGE=15
TRAILING_STOP_ACTIVATION_PERCENTAGE=100
MAX_HOLD_TIME_HOURS=4

# ===== Liquidity =====
MIN_LIQUIDITY_USD=15000
MIN_POOL_SOL_AMOUNT=50

# ===== Slippage =====
ENTRY_SLIPPAGE_BPS=100    # 1%
EXIT_SLIPPAGE_BPS=300     # 3%

# ===== Database =====
DATABASE_PATH=/app/data/bot.db

# ===== Trading Mode =====
TRADING_MODE=paper  # 'paper' or 'live'
```

---

## Core Modules

```
src/
├── config/
│   ├── env.ts              # Environment validation with Zod
│   └── constants.ts        # Trading constants
├── db/
│   ├── database.ts         # SQLite connection & schema
│   ├── repositories/       # Data access layer
│   └── migrations/         # Schema migrations
├── solana/
│   ├── connection.ts       # Helius RPC setup
│   ├── tokenMetadata.ts    # Fetch decimals, authorities
│   └── decimalConverter.ts # Raw ↔ Human conversions
├── jupiter/
│   ├── swapExecutor.ts     # Jupiter SDK wrapper
│   └── quoteApi.ts         # Quote fetching
├── security/
│   ├── rugCheck.ts         # RugCheck integration
│   ├── goPlus.ts           # GoPlus integration
│   └── evaluator.ts        # Aggregate safety scores
├── paperTrading/
│   ├── paperEngine.ts      # Simulation engine
│   ├── slippageSimulator.ts # Realistic slippage
│   ├── priceMonitor.ts     # Real-time price feeds
│   └── analytics.ts        # Performance metrics
├── core/
│   ├── scanner.ts          # Token discovery
│   ├── tradingEngine.ts    # Main orchestration
│   └── positionMonitor.ts  # Exit logic & monitoring
└── index.ts                # Entry point
```

---

## Risk Management

### Entry Requirements
- Minimum liquidity: $15,000 USD
- Minimum pool SOL: 50 SOL
- DexScreener score: ≥ 75
- All safety checks: PASS
- Price not in local top (avoid buying peak)

### Exit Conditions
| Condition | Trigger |
|-----------|---------|
| Stop Loss | -40% from entry |
| Trailing Stop | 15% below peak (after +100%) |
| Max Hold Time | 4 hours |
| Take Profit 1 | +50% (sell 25%) |
| Take Profit 2 | +100% (sell 25%) |
| Remaining | Trailing stop |

---

## Next Steps

- [x] Architecture design
- [x] Decimal handling solution
- [x] Paper trading architecture
- [ ] Position compounding logic
- [ ] Error recovery design
- [ ] Implementation plan
