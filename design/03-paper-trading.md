# 03. Paper Trading Architecture

**Status:** Complete
**Last Updated:** 2025-03-10

---

## Overview

Paper trading simulates live trading using **real market data** but **simulated execution**. This allows strategy validation without risking real capital.

**User Requirement:**
> "We must also paper trade using live data before going live, trying to simulate onchain trading to test our strategy."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PAPER TRADING SYSTEM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   LIVE DATA LAYER                   SIMULATION LAYER                │
│  ┌──────────────────┐            ┌──────────────────┐              │
│  │ DexScreener API  │───────────▶│  Paper Engine    │              │
│  │ - Price feeds    │            │  - Entry logic   │              │
│  │ - Liquidity      │            │  - Exit logic    │              │
│  │ - Volume         │            │  - Slippage sim  │              │
│  └──────────────────┘            └──────────────────┘              │
│           │                                │                        │
│  ┌──────────────────┐                    │                        │
│  │ Helius WebSocket │─────────────────────┼────────────────┐       │
│  │ - Real-time price                    │                │       │
│  │ - Pool updates                       ▼                │       │
│  └──────────────────┘            ┌──────────────┐       │       │
│                                  │ Virtual DB    │       │       │
│                                  │ (same schema) │◄──────┘       │
│                                  └──────────────┘                │
│                                                                     │
│                         ANALYTICS LAYER                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Performance Metrics                                          │  │
│  │ • Win rate, Avg win/loss, Sharpe ratio                       │  │
│  │ • Max drawdown, Profit factor                                │  │
│  │ • Trade duration distribution                                │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Trading Modes

```typescript
export enum PaperTradingMode {
  /**
   * SIMULATION - Real quotes, simulated execution
   * No actual transactions, zero risk
   */
  SIMULATION = 'simulation',

  /**
   * PAPER_LIVE - Real transactions on devnet
   * Tests actual Jupiter flow without real money
   */
  PAPER_LIVE = 'paper_live',

  /**
   * LIVE - Production with real funds
   */
  LIVE = 'live'
}
```

---

## Virtual Wallet

```typescript
export interface VirtualWallet {
  solBalance: number
  tokens: Map<string, VirtualTokenBalance>
  totalTrades: number
  totalPnL: number
}

export interface VirtualTokenBalance {
  tokenAddress: string
  tokenSymbol: string
  rawAmount: string        // ALWAYS store raw (same as live)
  decimals: number
  entryPrice: number
}
```

---

## Slippage Simulation

The key to realistic paper trading is simulating slippage beyond Jupiter's quote.

```typescript
export interface SlippageSimulation {
  slippageBps: number        // Additional slippage beyond quote
  confidence: number         // 0-1
  factors: SlippageFactors
}

export interface SlippageFactors {
  liquidityDepth: number     // 0-1, higher = better
  priceImpact: number        // From Jupiter quote
  volatility: number         // 0-1
  sizeVsPool: number         // Trade size / pool size ratio
}
```

### Slippage Calculation Formula

```
baseSlippage = (tradeSize / poolSize)^1.5 × 100 bps
volatilityMultiplier = 1 + (volatility × 2)
liquidityMultiplier = 2 - liquidityScore
sideMultiplier = buy ? 1 : 1.5

finalSlippage = baseSlippage × volatilityMultiplier × liquidityMultiplier × sideMultiplier
finalSlippage += random(-20%, +20% of calculated)

finalSlippage = clamp(5 bps, finalSlippage, 500 bps)
```

### Slippage Simulator Implementation

```typescript
export class SlippageSimulator {
  private historicalSlippage: Map<string, number[]> = new Map()

  async calculateSlippage(params: {
    tokenAddress: string
    inputAmount: number
    liquidity: number
    isBuy: boolean
  }): Promise<SlippageSimulation> {
    // 1. Get pool data from DexScreener
    const pairData = await this.fetchPairData(params.tokenAddress)
    if (!pairData) return this.defaultSlippage(params.isBuy)

    // 2. Calculate size ratio
    const poolSolAmount = pairData.liquidity?.sol || 0
    const sizeRatio = params.inputAmount / poolSolAmount

    // 3. Base slippage (exponential with size)
    const sizeSlippage = Math.pow(sizeRatio, 1.5) * 100

    // 4. Volatility adjustment
    const volatility = this.calculateVolatility(pairData)
    const volatilityMultiplier = 1 + (volatility * 2)

    // 5. Liquidity adjustment
    const liquidityScore = Math.min(params.liquidity / 50000, 1)
    const liquidityMultiplier = 2 - liquidityScore

    // 6. Side adjustment (sells have more slippage)
    const sideMultiplier = params.isBuy ? 1 : 1.5

    // 7. Calculate with jitter
    let slippageBps = sizeSlippage * volatilityMultiplier * liquidityMultiplier * sideMultiplier
    const jitter = slippageBps * 0.2 * (Math.random() * 2 - 1)
    slippageBps += jitter

    // 8. Clamp to bounds
    slippageBps = Math.max(5, Math.min(slippageBps, 500))

    // 9. Update history and calculate confidence
    this.updateHistory(params.tokenAddress, slippageBps)
    const confidence = this.calculateConfidence(params.tokenAddress)

    return {
      slippageBps: Math.round(slippageBps),
      confidence,
      factors: {
        liquidityDepth: liquidityScore,
        priceImpact: sizeRatio * 100,
        volatility,
        sizeVsPool: sizeRatio * 100
      }
    }
  }
}
```

---

## Paper Trading Engine

```typescript
export class PaperTradingEngine {
  private db: Database
  private priceFeed: PriceFeed
  private slippageSim: SlippageSimulator
  private wallet: VirtualWallet
  private mode: PaperTradingMode

  constructor(config: {
    mode: PaperTradingMode
    initialSol: number
    dbPath: string
  }) {
    this.mode = config.mode
    this.wallet = {
      solBalance: config.initialSol,
      tokens: new Map(),
      totalTrades: 0,
      totalPnL: 0
    }

    // Same database schema as live trading!
    this.db = new Database(config.dbPath, { isPaperTrading: true })
    this.priceFeed = new PriceFeed()
    this.slippageSim = new SlippageSimulator()
  }

  async executeEntry(token: TokenCandidate): Promise<Position> {
    // 1. Get REAL Jupiter quote
    const quote = await this.getJupiterQuote({
      inputMint: SOL_MINT,
      outputMint: token.address,
      amount: humanToRaw(0.1, 9),
      slippageBps: 100
    })

    // 2. Get token metadata
    const metadata = await getTokenMetadata(this.connection, token.address)

    // 3. SIMULATE slippage
    const slippage = await this.slippageSim.calculateSlippage({
      tokenAddress: token.address,
      inputAmount: 0.1,
      liquidity: token.liquidity,
      isBuy: true
    })

    // 4. Calculate actual output
    const quotedOutput = rawToHuman(quote.outAmount, metadata.decimals)
    const slippageMultiplier = 1 - (slippage.slippageBps / 10000)
    const actualOutput = quotedOutput * slippageMultiplier
    const actualOutputRaw = humanToRaw(actualOutput, metadata.decimals)

    // 5. Update virtual wallet
    this.wallet.solBalance -= 0.1
    this.wallet.tokens.set(token.address, {
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      rawAmount: actualOutputRaw.toString(),
      decimals: metadata.decimals,
      entryPrice: 0.1 / actualOutput
    })

    // 6. Store position (same structure as live!)
    const position: Position = {
      id: generateId(),
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      entrySolSpent: 0.1,
      entrySolSpentRaw: humanToRaw(0.1, 9).toString(),
      tokensReceivedRaw: actualOutputRaw.toString(),
      tokenDecimals: metadata.decimals,
      entryPricePerToken: 0.1 / actualOutput,
      entryTime: new Date(),
      entryScore: token.score,
      status: 'open'
    }

    await this.db.createPosition(position)

    console.log(`📝 PAPER ENTRY: ${token.symbol}`)
    console.log(`   Quoted: ${quotedOutput.toFixed(metadata.decimals)} tokens`)
    console.log(`   Actual (after slippage): ${actualOutput.toFixed(metadata.decimals)} tokens`)
    console.log(`   Slippage: ${(slippage.slippageBps / 100).toFixed(2)}%`)

    return position
  }

  async executeExit(position: Position, reason: string): Promise<void> {
    // 1. Get REAL Jupiter quote
    const quote = await this.getJupiterQuote({
      inputMint: position.tokenAddress,
      outputMint: SOL_MINT,
      amount: new BN(position.tokensReceivedRaw),
      slippageBps: 300
    })

    // 2. SIMULATE exit slippage
    const slippage = await this.slippageSim.calculateSlippage({
      tokenAddress: position.tokenAddress,
      inputAmount: rawToHuman(new BN(position.tokensReceivedRaw), position.tokenDecimals),
      liquidity: position.entryLiquidity,
      isBuy: false
    })

    // 3. Calculate actual SOL received
    const quotedSol = rawToHuman(quote.outAmount, 9)
    const slippageMultiplier = 1 - (slippage.slippageBps / 10000)
    const actualSol = quotedSol * slippageMultiplier

    // 4. Calculate P&L
    const pnl = actualSol - position.entrySolSpent
    const pnlPct = (pnl / position.entrySolSpent) * 100

    // 5. Update wallet and position
    this.wallet.solBalance += actualSol
    this.wallet.tokens.delete(position.tokenAddress)
    this.wallet.totalTrades++
    this.wallet.totalPnL += pnl

    await this.db.closePosition({
      id: position.id,
      exitSolReceived: actualSol,
      exitReason: reason,
      pnl,
      pnlPercentage: pnlPct
    })

    const emoji = pnl >= 0 ? '🟢' : '🔴'
    console.log(`\n${emoji} PAPER EXIT: ${position.tokenSymbol}`)
    console.log(`   Reason: ${reason}`)
    console.log(`   P&L: ${pnlPct.toFixed(2)}% (${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} SOL)`)
    console.log(`   Wallet: ${this.wallet.solBalance.toFixed(6)} SOL\n`)
  }
}
```

---

## Real-Time Price Monitoring

```typescript
export class PriceMonitor {
  private ws: WebSocket | null = null
  private subscriptions: Set<string> = new Set()
  private priceCallbacks: Map<string, (price: number) => void> = new Map()

  async subscribePrice(
    tokenAddress: string,
    callback: (price: number) => void
  ): Promise<void> {
    this.subscriptions.add(tokenAddress)
    this.priceCallbacks.set(tokenAddress, callback)

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }

    // Subscribe to account changes
    this.ws?.send(JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'account_subscribe',
      params: [tokenAddress, { encoding: 'base64', commitment: 'confirmed' }]
    }))
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = process.env.HELIUS_WS_URL
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        console.log('📡 Connected to Helius WebSocket')
        resolve()
      })

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        if (message.method === 'accountNotification') {
          const price = this.extractPrice(message.params.result)
          const callback = this.priceCallbacks.get(message.params.subscription)
          callback?.(price)
        }
      })

      this.ws.on('close', () => {
        console.log('WebSocket closed, reconnecting...')
        setTimeout(() => this.connect(), 5000)
      })
    })
  }
}
```

---

## Position Monitoring & Exit Logic

```typescript
export class PositionMonitor {
  private paperEngine: PaperTradingEngine
  private priceMonitor: PriceMonitor
  private activeMonitors: Map<string, MonitorState> = new Map()

  async startMonitoring(position: Position): Promise<void> {
    const state: MonitorState = {
      positionId: position.id,
      highestPrice: position.entryPricePerToken,
      highestValue: position.entrySolSpent,
      trailingStopPrice: null,
      entryTime: new Date(),
      priceUpdates: []
    }

    this.activeMonitors.set(position.id, state)

    await this.priceMonitor.subscribePrice(
      position.tokenAddress,
      (price) => this.onPriceUpdate(position.id, price)
    )

    this.startTimeChecks(position.id)
  }

  private async onPriceUpdate(positionId: string, currentPrice: number): Promise<void> {
    const state = this.activeMonitors.get(positionId)
    if (!state) return

    const position = await this.paperEngine.db.getPosition(positionId)
    if (!position || position.status !== 'open') return

    const tokenCount = rawToHuman(
      new BN(position.tokensReceivedRaw),
      position.tokenDecimals
    )
    const currentValue = tokenCount * currentPrice
    const pnlPercentage = ((currentValue - position.entrySolSpent) / position.entrySolSpent) * 100

    // Update highest watermark
    if (currentValue > state.highestValue) {
      state.highestValue = currentValue
      state.highestPrice = currentPrice

      // Activate trailing stop after +100%
      if (pnlPercentage >= 100 && state.trailingStopPrice === null) {
        state.trailingStopPrice = currentPrice * 0.85
        console.log(`🎯 Trailing stop activated at ${currentPrice.toFixed(10)}`)
      }

      // Update trailing stop
      if (state.trailingStopPrice !== null) {
        state.trailingStopPrice = currentPrice * 0.85
      }
    }

    // Check exit conditions

    // 1. Trailing stop
    if (state.trailingStopPrice !== null && currentPrice <= state.trailingStopPrice) {
      await this.paperEngine.executeExit(position, 'trailing_stop')
      this.stopMonitoring(positionId)
      return
    }

    // 2. Stop loss (-40%)
    if (pnlPercentage <= -40) {
      await this.paperEngine.executeExit(position, 'stop_loss')
      this.stopMonitoring(positionId)
      return
    }

    // 3. Take profit levels
    if (pnlPercentage >= 50 && !state.partialExits?.takeProfit50) {
      await this.partialExit(position, 0.25, 'take_profit_50')
      state.partialExits = { ...state.partialExits, takeProfit50: true }
    }

    if (pnlPercentage >= 100 && !state.partialExits?.takeProfit100) {
      await this.partialExit(position, 0.25, 'take_profit_100')
      state.partialExits = { ...state.partialExits, takeProfit100: true }
    }
  }
}
```

---

## Performance Analytics

```typescript
export interface PerformanceReport {
  // Basic metrics
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number

  // P&L metrics
  totalPnL: number
  totalPnLPercentage: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  profitFactor: number

  // Risk metrics
  maxDrawdown: number
  maxDrawdownPercentage: number
  avgTradeDuration: number
  sharpeRatio: number

  // Slippage analysis
  avgEntrySlippage: number
  avgExitSlippage: number
  slippageCost: number

  // Readiness
  readyForLive: boolean
  recommendations: string[]
}

export class PerformanceAnalytics {
  async generateReport(): Promise<PerformanceReport> {
    const positions = await this.db.getClosedPositions()

    const wins = positions.filter(p => (p.pnl || 0) > 0)
    const losses = positions.filter(p => (p.pnl || 0) < 0)

    // Calculate metrics...
    const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0)
    const winRate = (wins.length / positions.length) * 100

    // Max drawdown calculation
    let peak = 0, maxDrawdown = 0, runningPnL = 0
    for (const position of positions) {
      runningPnL += position.pnl || 0
      if (runningPnL > peak) peak = runningPnL
      const drawdown = peak - runningPnL
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    // Readiness criteria
    const readyForLive =
      positions.length >= 20 &&
      winRate >= 40 &&
      totalPnL > 0 &&
      (maxDrawdown / (0.1 * positions.length)) < 0.3

    const recommendations: string[] = []
    if (positions.length < 20) recommendations.push('Run more paper trades (need 20+)')
    if (winRate < 40) recommendations.push('Win rate below 40%. Refine entry criteria.')
    if (totalPnL < 0) recommendations.push('Total P&L negative. Review strategy.')

    return { /* ... */ readyForLive, recommendations }
  }
}
```

---

## Live Readiness Checklist

Before switching from paper to live trading:

| Criterion | Threshold | Purpose |
|-----------|-----------|---------|
| Minimum Trades | ≥ 20 | Statistical significance |
| Win Rate | ≥ 40% | Strategy viability |
| Max Drawdown | < 30% | Risk control |
| Positive P&L | Yes | Profitability |
| Wallet Key | Configured | Ready to execute |
| API Keys | Valid | Access to services |
| Decimal Handling | Tested | Critical bug fix verified |

---

## Paper Trading Docker Compose

```yaml
# docker-compose.paper.yml
version: '3.8'

services:
  paper-trading-bot:
    build: .
    container_name: solana-paper-trading-bot
    restart: unless-stopped
    environment:
      - TRADING_MODE=paper
      - INITIAL_SOL_AMOUNT=0.1
      - DATABASE_PATH=/app/data/paper_trades.db
      - HELIUS_RPC_URL=${HELIUS_RPC_URL}
      - JUPITER_API_KEY=${JUPITER_API_KEY}
      # No wallet key needed for paper!
    volumes:
      - paper-data:/app/data

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3001:3000'
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  paper-data:
  grafana-data:
```

---

## CLI Commands

```
status   - Show current wallet and open positions
report   - Generate performance report
positions- List all positions
help     - Show available commands
```

---

## Related Files

- Architecture: `design/01-architecture.md`
- Decimal Handling: `design/02-decimal-handling.md`
- Exit Strategy: `design/04-monitoring-exit.md` (pending)
