# 04. Monitoring & Exit Strategy

**Status:** Complete
**Last Updated:** 2026-03-10

---

## Overview

This document covers the most critical aspect of the trading bot: **when and how to exit positions**. Getting this right is what protects profits and prevents holding bags.

**User's Core Philosophy:** "I don't want to hold bags. I only want to hold SOL!"

---

## Exit Conditions (Summary)

| Condition | Trigger | Action |
|-----------|---------|--------|
| **Stop Loss** | -40% from entry | Immediate exit (50% of position) |
| **Take Profit 1** | +50% from entry | Sell 25% of position |
| **Take Profit 2** | +100% from entry | Sell 25% of position, activate trailing stop |
| **Trailing Stop** | 15% below peak | Sell remaining 50% |
| **Max Hold Time** | 4 hours from entry | Exit remaining position |
| **Emergency** | Liquidity crash, rug detected | Immediate exit, pause bot |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXIT STRATEGY VISUALIZED                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Price %                                                                │
│    ▲                                                                    │
│ +100│══════════════════════════╗  TAKE PROFIT 2: Sell 25%, Trail 15%    │
│     │                          ║                                        │
│  +50│════════════════╗          ║  TAKE PROFIT 1: Sell 25%              │
│     │               ║          ║                                        │
│    0│───────────────╨──────────╨─────────────────────────────────────   │
│     │               ║          ║  ENTRY                                 │
│  -40│════════════════╝          ║  STOP LOSS: Sell 50%                  │
│     │                          ║                                        │
│    ▼                                                                    │
│                                                                         │
│  After +100%, trailing stop activates:                                  │
│  • Track peak price                                                     │
│  • Exit if price drops 15% from peak                                    │
│  • Example: Peak +150%, drops to +127.5% → EXIT                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Real-Time Price Monitoring

### Helius WebSocket Setup

```typescript
// src/solana/priceMonitor.ts

import { WebSocket } from 'ws'

export interface PriceUpdate {
  tokenMint: string
  price: number
  timestamp: number
  source: 'jupiter' | 'helius' | 'dexscreener'
}

export class PriceMonitor {
  private ws: WebSocket | null = null
  private subscribedTokens: Set<string> = new Set()
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map()
  private priceCallbacks: Map<string, ((update: PriceUpdate) => void)[]> = new Map()

  constructor(
    private heliusWsUrl: string,
    private apiKey: string
  ) {}

  /**
   * Connect to Helius WebSocket
   */
  connect(): void {
    const wsUrl = `${this.heliusWsUrl}?api-key=${this.apiKey}`
    this.ws = new WebSocket(wsUrl)

    this.ws.on('open', () => {
      console.log('📡 Connected to Helius WebSocket')
      this.resubscribeAll()
    })

    this.ws.on('message', (data) => {
      this.handleMessage(data)
    })

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error)
    })

    this.ws.on('close', () => {
      console.warn('WebSocket closed, reconnecting in 5s...')
      setTimeout(() => this.connect(), 5_000)
    })
  }

  /**
   * Subscribe to price updates for a token
   */
  subscribe(tokenMint: string, callback: (update: PriceUpdate) => void): void {
    this.subscribedTokens.add(tokenMint)

    if (!this.priceCallbacks.has(tokenMint)) {
      this.priceCallbacks.set(tokenMint, [])
    }
    this.priceCallbacks.get(tokenMint)!.push(callback)

    // Send subscription request
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription(tokenMint)
    }
  }

  /**
   * Unsubscribe from token price updates
   */
  unsubscribe(tokenMint: string): void {
    this.subscribedTokens.delete(tokenMint)
    this.priceCallbacks.delete(tokenMint)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'accountUnsubscribe',
        params: [tokenMint]
      }))
    }
  }

  /**
   * Send subscription request via WebSocket
   */
  private sendSubscription(tokenMint: string): void {
    this.ws!.send(JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'accountSubscribe',
      params: [tokenMint, { encoding: 'base64' }]
    }))
  }

  /**
   * Resubscribe to all tokens after reconnect
   */
  private resubscribeAll(): void {
    for (const tokenMint of this.subscribedTokens) {
      this.sendSubscription(tokenMint)
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: any): void {
    try {
      const message = JSON.parse(data)

      // Handle account notification (price updates)
      if (message.method === 'accountNotification') {
        const accountData = message.params.result
        // Parse and emit price update
        this.processAccountNotification(accountData)
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  /**
   * Process account notification and extract price
   */
  private processAccountNotification(accountData: any): void {
    // This would parse the account data and extract price info
    // For now, we'll use Jupiter API for polling price
  }

  /**
   * Get latest cached price for a token
   */
  getCachedPrice(tokenMint: string): number | null {
    const cached = this.priceCache.get(tokenMint)
    if (!cached) return null

    // Cache expires after 5 seconds
    if (Date.now() - cached.timestamp > 5_000) {
      this.priceCache.delete(tokenMint)
      return null
    }

    return cached.price
  }
}
```

---

## 2. Jupiter Price Polling (Primary Method)

Since WebSocket price feeds can be unreliable, we primarily poll Jupiter API:

```typescript
// src/jupiter/priceFetcher.ts

export class JupiterPriceFetcher {
  private pollInterval: number = 2_000  // Poll every 2 seconds

  constructor(
    private jupiterApi: JupiterClient,
    private db: Database
  ) {}

  /**
   * Start monitoring a position's price
   */
  async monitorPosition(position: Position): Promise<void> {
    console.log(`📊 Monitoring position: ${position.tokenMint.slice(0, 8)}...`)
    console.log(`   Entry: ${position.entryPrice} SOL`)

    const monitor = setInterval(async () => {
      try {
        const currentPrice = await this.fetchCurrentPrice(
          position.tokenMint,
          position.tokensReceivedRaw,
          position.tokenDecimals
        )

        // Update price cache
        this.priceCache.set(position.tokenMint, {
          price: currentPrice,
          timestamp: Date.now()
        })

        // Calculate P&L
        const pnlPercent = this.calculatePnlPercent(position.entryPrice, currentPrice)

        // Emit price update
        this.emitPriceUpdate({
          tokenMint: position.tokenMint,
          currentPrice,
          entryPrice: position.entryPrice,
          pnlPercent,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error(`Failed to fetch price for ${position.tokenMint}:`, error)
      }
    }, this.pollInterval)

    // Store interval ID for cleanup
    this.activeMonitors.set(position.tokenMint, monitor)
  }

  /**
   * Fetch current price from Jupiter (what we'd get if we sold now)
   */
  async fetchCurrentPrice(
    tokenMint: string,
    rawAmount: string,
    decimals: number
  ): Promise<number> {
    // Get sell quote from Jupiter
    const quote = await this.jupiterApi.getQuote({
      inputMint: tokenMint,
      outputMint: 'So11111111111111111111111111111111111111112', // SOL
      amount: rawAmount,
      slippageBps: 100  // 1% slippage
    })

    // Return output amount in SOL (human-readable)
    const outAmount = BigInt(quote.outAmount)
    return Number(outAmount) / 1e9  // Convert lamports to SOL
  }

  /**
   * Calculate P&L percentage
   */
  calculatePnlPercent(entryPrice: number, currentPrice: number): number {
    return ((currentPrice - entryPrice) / entryPrice) * 100
  }

  /**
   * Stop monitoring a position
   */
  stopMonitoring(tokenMint: string): void {
    const monitor = this.activeMonitors.get(tokenMint)
    if (monitor) {
      clearInterval(monitor)
      this.activeMonitors.delete(tokenMint)
    }
  }
}
```

---

## 3. Position State Machine

```typescript
// src/core/positionManager.ts

export enum PositionState {
  ENTERING = 'entering',       // Entry transaction submitted
  ACTIVE = 'active',           // Position open, monitoring
  PARTIAL_EXIT_1 = 'partial_1', // 25% sold at +50%
  PARTIAL_EXIT_2 = 'partial_2', // 25% sold at +100%, trailing active
  TRAILING = 'trailing',        // Trailing stop active
  EXITING = 'exiting',          // Exit transaction submitted
  CLOSED = 'closed',            // Position fully closed
  FAILED = 'failed'             // Entry failed
}

export interface Position {
  id: string
  tokenMint: string
  tokenSymbol: string
  state: PositionState

  // Entry data
  entryPrice: number            // SOL value at entry
  tokensReceivedRaw: string     // Raw amount from Jupiter
  tokenDecimals: number
  entrySolAmount: number        // SOL spent

  // Current data
  currentPrice: number          // Current SOL value
  peakPrice: number             // Highest price seen

  // Tracking
  enteredAt: number
  updatedAt: number

  // Partial exits
  remainingPercent: number      // % of position still held (starts at 100)

  // Exit reasons
  exitReason?: string
}

export class PositionManager {
  private currentPosition: Position | null = null

  constructor(
    private priceFetcher: JupiterPriceFetcher,
    private jupiter: JupiterClient,
    private db: Database
  ) {}

  /**
   * Create new position after successful entry
   */
  async createPosition(entryData: {
    tokenMint: string
    tokenSymbol: string
    entryPrice: number
    tokensReceivedRaw: string
    tokenDecimals: number
    entrySolAmount: number
  }): Promise<Position> {
    const position: Position = {
      id: crypto.randomUUID(),
      tokenMint: entryData.tokenMint,
      tokenSymbol: entryData.tokenSymbol,
      state: PositionState.ACTIVE,
      entryPrice: entryData.entryPrice,
      tokensReceivedRaw: entryData.tokensReceivedRaw,
      tokenDecimals: entryData.tokenDecimals,
      entrySolAmount: entryData.entrySolAmount,
      currentPrice: entryData.entryPrice,
      peakPrice: entryData.entryPrice,
      enteredAt: Date.now(),
      updatedAt: Date.now(),
      remainingPercent: 100
    }

    this.currentPosition = position

    // Save to database
    await this.db.insert('positions', position)

    // Start monitoring
    this.priceFetcher.monitorPosition(position)

    return position
  }

  /**
   * Update position with new price data
   */
  async updatePosition(tokenMint: string, currentPrice: number): Promise<void> {
    const position = this.currentPosition
    if (!position || position.tokenMint !== tokenMint) {
      return
    }

    // Update current price
    position.currentPrice = currentPrice

    // Update peak if new high
    if (currentPrice > position.peakPrice) {
      position.peakPrice = currentPrice
      console.log(`🆙 New peak: ${this.formatPrice(currentPrice)} (${this.getPeakPercent()}% above entry)`)
    }

    position.updatedAt = Date.now()

    // Save to database
    await this.db.update('positions', { id: position.id }, position)

    // Check exit conditions
    await this.checkExitConditions(position)
  }

  /**
   * Check all exit conditions
   */
  private async checkExitConditions(position: Position): Promise<void> {
    const pnlPercent = this.calculatePnlPercent(position)

    // 1. STOP LOSS: -40%
    if (pnlPercent <= -40) {
      await this.triggerStopLoss(position, 'Stop loss hit (-40%)')
      return
    }

    // 2. MAX HOLD TIME: 4 hours
    const holdTime = Date.now() - position.enteredAt
    if (holdTime > 4 * 60 * 60 * 1000) {
      await this.triggerMaxHoldExit(position, 'Max hold time reached (4 hours)')
      return
    }

    // 3. TAKE PROFIT 1: +50% (only if 100% remaining)
    if (pnlPercent >= 50 && position.remainingPercent === 100) {
      await this.triggerPartialExit1(position, 'Take profit +50%')
      return
    }

    // 4. TAKE PROFIT 2: +100% (only if 75% remaining)
    if (pnlPercent >= 100 && position.remainingPercent === 75) {
      await this.triggerPartialExit2(position, 'Take profit +100%')
      return
    }

    // 5. TRAILING STOP: Only active after +100% and partial exit 2
    if (position.state === PositionState.TRAILING || position.state === PositionState.PARTIAL_EXIT_2) {
      const trailingPercent = this.calculateTrailingPercent(position)
      if (trailingPercent >= 15) {
        await this.triggerTrailingStop(position, `Trailing stop hit (15% below peak)`)
        return
      }
    }
  }

  /**
   * Calculate current P&L percentage
   */
  private calculatePnlPercent(position: Position): number {
    return ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100
  }

  /**
   * Calculate how far below peak we are (for trailing stop)
   */
  private calculateTrailingPercent(position: Position): number {
    return ((position.peakPrice - position.currentPrice) / position.peakPrice) * 100
  }

  /**
   * Get peak percentage above entry
   */
  private getPeakPercent(): number {
    if (!this.currentPosition) return 0
    return ((this.currentPosition.peakPrice - this.currentPosition.entryPrice) / this.currentPosition.entryPrice) * 100
  }

  /**
   * Format price for display
   */
  private formatPrice(price: number): string {
    return `${price.toFixed(6)} SOL`
  }
}
```

---

## 4. Exit Handlers

### Stop Loss Exit

```typescript
/**
 * Stop loss: Sell 50% of position immediately
 */
private async triggerStopLoss(position: Position, reason: string): Promise<void> {
  console.error(`🛑 STOP LOSS TRIGGERED: ${reason}`)
  console.error(`   Current: ${this.formatPrice(position.currentPrice)}`)
  console.error(`   Entry: ${this.formatPrice(position.entryPrice)}`)
  console.error(`   Loss: ${this.calculatePnlPercent(position).toFixed(2)}%`)

  // Sell 50% of position
  await this.executePartialExit(position, 50, reason)

  // Update state
  position.state = PositionState.FAILED
  position.exitReason = reason
  await this.db.update('positions', { id: position.id }, position)

  // Note: The remaining 50% would be subject to normal exit logic
  // or could be closed immediately based on user preference
}
```

### Partial Exit 1 (+50%)

```typescript
/**
 * Take profit 1: Sell 25% at +50%
 */
private async triggerPartialExit1(position: Position, reason: string): Promise<void> {
  console.log(`💰 TAKE PROFIT 1: ${reason}`)
  console.log(`   Current: ${this.formatPrice(position.currentPrice)}`)
  console.log(`   Selling: 25% of position`)

  // Calculate raw amount to sell (25% of total)
  const totalRaw = BigInt(position.tokensReceivedRaw)
  const sellRaw = (totalRaw * BigInt(25)) / BigInt(100)

  // Execute exit
  await this.executeExit(position, sellRaw.toString(), 25, reason)

  // Update state
  position.state = PositionState.PARTIAL_EXIT_1
  position.remainingPercent = 75
  await this.db.update('positions', { id: position.id }, position)
}
```

### Partial Exit 2 (+100%) - Activate Trailing

```typescript
/**
 * Take profit 2: Sell 25% at +100%, activate trailing stop
 */
private async triggerPartialExit2(position: Position, reason: string): Promise<void> {
  console.log(`💰 TAKE PROFIT 2: ${reason}`)
  console.log(`   Current: ${this.formatPrice(position.currentPrice)}`)
  console.log(`   Peak: ${this.formatPrice(position.peakPrice)}`)
  console.log(`   Selling: 25% of position`)
  console.log(`   ACTIVATING TRAILING STOP (15% below peak)`)

  // Calculate raw amount to sell (25% of total)
  const totalRaw = BigInt(position.tokensReceivedRaw)
  const sellRaw = (totalRaw * BigInt(25)) / BigInt(100)

  // Execute exit
  await this.executeExit(position, sellRaw.toString(), 25, reason)

  // Update state - activate trailing stop
  position.state = PositionState.TRAILING
  position.remainingPercent = 50
  await this.db.update('positions', { id: position.id }, position)

  // Log trailing stop info
  console.log(`   Trailing stop will trigger at: ${this.formatPrice(position.peakPrice * 0.85)}`)
}
```

### Trailing Stop Exit

```typescript
/**
 * Trailing stop: Sell remaining when 15% below peak
 */
private async triggerTrailingStop(position: Position, reason: string): Promise<void> {
  console.log(`🎯 TRAILING STOP TRIGGERED: ${reason}`)
  console.log(`   Peak was: ${this.formatPrice(position.peakPrice)}`)
  console.log(`   Current: ${this.formatPrice(position.currentPrice)}`)
  console.log(`   Below peak by: ${this.calculateTrailingPercent(position).toFixed(2)}%`)
  console.log(`   Selling remaining: ${position.remainingPercent}%`)

  // Calculate raw amount to sell (remaining percentage)
  const totalRaw = BigInt(position.tokensReceivedRaw)
  const sellRaw = (totalRaw * BigInt(position.remainingPercent)) / BigInt(100)

  // Execute exit
  await this.executeExit(position, sellRaw.toString(), position.remainingPercent, reason)

  // Close position
  position.state = PositionState.CLOSED
  position.exitReason = reason
  position.remainingPercent = 0
  await this.db.update('positions', { id: position.id }, position)

  // Clear current position
  this.currentPosition = null
}
```

### Max Hold Time Exit

```typescript
/**
 * Max hold time: Exit remaining after 4 hours
 */
private async triggerMaxHoldExit(position: Position, reason: string): Promise<void> {
  console.log(`⏱️ MAX HOLD TIME: ${reason}`)
  console.log(`   Held for: ${Math.floor((Date.now() - position.enteredAt) / 60000)} minutes`)
  console.log(`   Selling remaining: ${position.remainingPercent}%`)

  // Calculate raw amount to sell (remaining percentage)
  const totalRaw = BigInt(position.tokensReceivedRaw)
  const sellRaw = (totalRaw * BigInt(position.remainingPercent)) / BigInt(100)

  // Execute exit
  await this.executeExit(position, sellRaw.toString(), position.remainingPercent, reason)

  // Close position
  position.state = PositionState.CLOSED
  position.exitReason = reason
  position.remainingPercent = 0
  await this.db.update('positions', { id: position.id }, position)

  // Clear current position
  this.currentPosition = null
}
```

---

## 5. Exit Execution

```typescript
/**
 * Execute exit trade via Jupiter
 */
private async executeExit(
  position: Position,
  rawAmount: string,
  percentOfTotal: number,
  reason: string
): Promise<void> {
  try {
    console.log(`📤 Executing exit: ${percentOfTotal}% of position`)
    console.log(`   Token: ${position.tokenSymbol}`)
    console.log(`   Amount (raw): ${rawAmount}`)

    // Get quote from Jupiter
    const quote = await this.jupiter.getQuote({
      inputMint: position.tokenMint,
      outputMint: 'So11111111111111111111111111111111111111112', // SOL
      amount: rawAmount,
      slippageBps: this.getExitSlippage(reason)  // Higher slippage for urgent exits
    })

    console.log(`   Expected output: ${Number(quote.outAmount) / 1e9} SOL`)

    // Calculate priority fee based on scenario
    const priorityFee = this.getExitPriorityFee(reason, position)
    console.log(`   Priority fee: ${priorityFee} lamports`)

    // Execute swap
    const signature = await this.jupiter.executeSwap({
      quote,
      prioritizationFeeLamports: priorityFee
    })

    console.log(`✅ Exit submitted: ${signature.slice(0, 8)}...`)

    // Track transaction
    this.transactionMonitor.track(signature, 2)  // Wait for 2 confirmations

    // Record trade in database
    await this.db.insert('trades', {
      id: crypto.randomUUID(),
      positionId: position.id,
      type: 'exit',
      tokenMint: position.tokenMint,
      amountRaw: rawAmount,
      expectedOutput: quote.outAmount,
      signature,
      reason,
      timestamp: Date.now(),
      priorityFee
    })

    // Update position's stored raw amount
    const totalRaw = BigInt(position.tokensReceivedRaw)
    const soldRaw = BigInt(rawAmount)
    position.tokensReceivedRaw = (totalRaw - soldRaw).toString()

    // Update entry price for remaining position (weighted average)
    if (position.remainingPercent > percentOfTotal) {
      position.entryPrice = position.entryPrice * (position.remainingPercent / (position.remainingPercent - percentOfTotal))
    }

  } catch (error) {
    console.error(`❌ Exit failed: ${error}`)

    // Record failed exit
    await this.db.insert('exit_failures', {
      positionId: position.id,
      reason,
      error: error.message,
      timestamp: Date.now()
    })

    throw error
  }
}

/**
 * Get slippage tolerance based on exit reason
 */
private getExitSlippage(reason: string): number {
  if (reason.includes('Trailing stop')) return 300  // 3% - want out fast
  if (reason.includes('Stop loss')) return 200       // 2% - urgent
  if (reason.includes('Max hold')) return 150        // 1.5% - moderate
  return 100  // 1% - normal take profit
}

/**
 * Get priority fee based on exit scenario
 */
private getExitPriorityFee(reason: string, position: Position): number {
  if (reason.includes('Trailing stop')) return 1_000_000     // Emergency - protect peak
  if (reason.includes('Stop loss')) return 500_000           // Urgent - minimize loss
  if (reason.includes('Max hold')) return 100_000            // Standard
  if (reason.includes('+100%')) return 500_000               // High profit - lock it in
  return 100_000                                             // Standard
}
```

---

## 6. Emergency Exit Conditions

```typescript
/**
 * Check for emergency exit conditions
 */
private async checkEmergencyConditions(position: Position): Promise<boolean> {
  // 1. Liquidity crash: Price drops >20% in 1 minute
  const recentPrices = await this.getRecentPrices(position.tokenMint, 60_000)
  if (recentPrices.length >= 2) {
    const dropPercent = ((recentPrices[0] - recentPrices[recentPrices.length - 1]) / recentPrices[0]) * 100
    if (dropPercent > 20) {
      await this.triggerEmergencyExit(position, `Liquidity crash: ${dropPercent.toFixed(1)}% drop in 1 minute`)
      return true
    }
  }

  // 2. Rug detection: Trading paused or liquidity pulled
  const safetyStatus = await this.checkTokenSafety(position.tokenMint)
  if (!safetyStatus.safe) {
    await this.triggerEmergencyExit(position, `Rug detected: ${safetyStatus.reason}`)
    return true
  }

  return false
}

/**
 * Emergency exit: Sell everything immediately
 */
private async triggerEmergencyExit(position: Position, reason: string): Promise<void> {
  console.error(`🚨 EMERGENCY EXIT: ${reason}`)

  // Use maximum priority fee
  const emergencyPriorityFee = 2_000_000  // 0.002 SOL

  // Use high slippage to ensure exit
  const emergencySlippage = 500  // 5%

  // Get quote
  const quote = await this.jupiter.getQuote({
    inputMint: position.tokenMint,
    outputMint: 'So11111111111111111111111111111111111111112',
    amount: position.tokensReceivedRaw,
    slippageBps: emergencySlippage
  })

  // Execute immediately
  try {
    const signature = await this.jupiter.executeSwap({
      quote,
      prioritizationFeeLamports: emergencyPriorityFee
    })

    console.log(`🚨 Emergency exit submitted: ${signature.slice(0, 8)}...`)

    // Close position
    position.state = PositionState.CLOSED
    position.exitReason = `EMERGENCY: ${reason}`
    await this.db.update('positions', { id: position.id }, position)

    // PAUSE BOT
    this.emergencyControl.pause(PauseReason.HIGH_SLIPPAGE, reason)

  } catch (error) {
    console.error(`❌ Emergency exit failed: ${error}`)
    // Bot should remain paused
  }
}
```

---

## 7. Price History & Analytics

```typescript
/**
 * Track price history for analysis
 */
export class PriceHistoryTracker {
  constructor(private db: Database) {}

  /**
   * Record price update
   */
  async recordPrice(tokenMint: string, price: number, timestamp: number): Promise<void> {
    await this.db.insert('price_history', {
      tokenMint,
      price,
      timestamp
    })

    // Clean old data (keep last 24 hours)
    await this.cleanOldData(tokenMint)
  }

  /**
   * Get recent prices for analysis
   */
  async getRecentPrices(tokenMint: string, duration: number): Promise<number[]> {
    const cutoff = Date.now() - duration
    const records = await this.db.query('price_history', {
      tokenMint,
      timestamp: { $gte: cutoff }
    })

    return records.map(r => r.price).sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Calculate price volatility
   */
  async calculateVolatility(tokenMint: string, duration: number = 300_000): Promise<number> {
    const prices = await this.getRecentPrices(tokenMint, duration)

    if (prices.length < 2) return 0

    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length

    return Math.sqrt(variance) * 100 // Volatility as percentage
  }

  private async cleanOldData(tokenMint: string): Promise<void> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours
    await this.db.delete('price_history', {
      tokenMint,
      timestamp: { $lt: cutoff }
    })
  }
}
```

---

## 8. Database Schema Additions

```sql
-- Position tracking
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  state TEXT NOT NULL,

  -- Entry data
  entry_price REAL NOT NULL,
  tokens_received_raw TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  entry_sol_amount REAL NOT NULL,

  -- Current data
  current_price REAL NOT NULL,
  peak_price REAL NOT NULL,

  -- Tracking
  entered_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  remaining_percent INTEGER DEFAULT 100,

  -- Exit
  exit_reason TEXT
);

-- Trade log
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'entry' or 'exit'
  token_mint TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  expected_output TEXT,
  signature TEXT NOT NULL,
  reason TEXT,
  priority_fee INTEGER,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id)
);

-- Exit failures
CREATE TABLE exit_failures (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  error TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id)
);

-- Price history
CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL,
  price REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  INDEX idx_token_time (token_mint, timestamp)
);

-- Exit events log
CREATE TABLE exit_events (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'stop_loss', 'take_profit_1', 'take_profit_2', 'trailing_stop', 'max_hold', 'emergency'
  trigger_value REAL NOT NULL,
  price_at_trigger REAL NOT NULL,
  pnl_percent REAL NOT NULL,
  percent_sold INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id)
);
```

---

## 9. Monitoring Dashboard

Real-time position status display:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ACTIVE POSITION                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Token:    TOKEN_SYMBOL                                                │
│  Mint:     AbCdEf...                                                    │
│  State:    ACTIVE                                                      │
│  Entered:  2 minutes ago                                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                          PRICE CHART                           │   │
│  │  0.0050 SOL ┤──────────────────────────── ◆ Peak (+120%)       │   │
│  │  0.0045 SOL ┤                       ╱                          │   │
│  │  0.0040 SOL ┤                  ╱                                 │   │
│  │  0.0035 SOL ┤             ╱         ╲ Current (+85%)           │   │
│  │  0.0030 SOL ┤        ╱                                            │   │
│  │  0.0025 SOL ┤   ╱                                                 │   │
│  │  0.0020 SOL ┼── Entry                                             │   │
│  │             └────────────────────────────────────────────────      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Entry Price:    0.00200 SOL                                            │
│  Current Price:  0.00370 SOL                                            │
│  Peak Price:     0.00440 SOL                                            │
│  P&L:            +85.0%                                                 │
│                                                                         │
│  Remaining:      100% (no exits yet)                                    │
│                                                                         │
│  EXIT CONDITIONS:                                                       │
│  [ ] Stop Loss (-40%)          Current: +85%                            │
│  [ ] Take Profit 1 (+50%)      Triggered: No                            │
│  [ ] Take Profit 2 (+100%)     Triggered: No                            │
│  [ ] Trailing Stop (15% ↓)     Active: No (need +100% first)           │
│  [ ] Max Hold Time (4h)        Elapsed: 2 minutes                      │
│                                                                         │
│  NEXT EXIT: Take Profit 1 at 0.00300 SOL (+50%)                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Configuration

```typescript
export interface ExitStrategyConfig {
  // Percentages
  stopLossPercent: number          // -40%
  takeProfit1Percent: number       // +50%
  takeProfit2Percent: number       // +100%
  trailingStopPercent: number      // 15% below peak

  // Position sizing
  takeProfit1SellPercent: number   // 25%
  takeProfit2SellPercent: number   // 25%
  stopLossSellPercent: number      // 50% (remainder handled by normal logic)

  // Time limits
  maxHoldTimeMs: number            // 4 hours

  // Price monitoring
  pricePollIntervalMs: number      // 2000ms (2 seconds)
  priceCacheTtlMs: number          // 5000ms (5 seconds)

  // Slippage
  normalExitSlippageBps: number    // 100 (1%)
  urgentExitSlippageBps: number    // 300 (3%)
  emergencyExitSlippageBps: number // 500 (5%)

  // Emergency conditions
  liquidityCrashPercent: number    // 20% drop in 1 minute
  liquidityCrashDurationMs: number // 60000 (1 minute)
}

export const DEFAULT_EXIT_CONFIG: ExitStrategyConfig = {
  stopLossPercent: -40,
  takeProfit1Percent: 50,
  takeProfit2Percent: 100,
  trailingStopPercent: 15,

  takeProfit1SellPercent: 25,
  takeProfit2SellPercent: 25,
  stopLossSellPercent: 50,

  maxHoldTimeMs: 4 * 60 * 60 * 1000,

  pricePollIntervalMs: 2000,
  priceCacheTtlMs: 5000,

  normalExitSlippageBps: 100,
  urgentExitSlippageBps: 300,
  emergencyExitSlippageBps: 500,

  liquidityCrashPercent: 20,
  liquidityCrashDurationMs: 60000
}
```

---

## Summary: Exit Strategy Checklist

| Condition | Trigger | Action | Priority Fee |
|-----------|---------|--------|--------------|
| **Stop Loss** | -40% | Sell 50% | 500K lamports |
| **Take Profit 1** | +50% | Sell 25% | 100K lamports |
| **Take Profit 2** | +100% | Sell 25%, enable trailing | 500K lamports |
| **Trailing Stop** | 15% below peak | Sell remaining | 1M lamports |
| **Max Hold** | 4 hours | Sell remaining | 100K lamports |
| **Emergency** | Liquidity crash / rug | Sell all | 2M lamports |

**Critical Implementation Points:**
1. Poll Jupiter API every 2 seconds for accurate prices
2. Store raw amounts at entry, use directly at exit (design/02-decimal-handling.md)
3. Track peak price for trailing stop calculation
4. Use priority fees strategically (design/06-priority-fees.md)
5. Save state before/after every trade (design/07-error-recovery.md)

---

## Related Files

- Architecture: `design/01-architecture.md`
- Decimal Handling: `design/02-decimal-handling.md` (CRITICAL for exit amounts)
- Priority Fees: `design/06-priority-fees.md` (exit fee strategy)
- Error Recovery: `design/07-error-recovery.md` (stuck transactions)
- Compounding: `design/05-compounding.md` (profit reinvestment)
