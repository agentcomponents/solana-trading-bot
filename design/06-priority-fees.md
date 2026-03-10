# 06. Priority Fees & Strategic Transaction Execution

**Status:** Complete
**Last Updated:** 2026-03-10

---

## Overview

This document covers priority fee strategies for optimizing transaction execution speed on Solana, particularly for exits where capturing profits before price movement is critical.

**User Requirement:**
> "Jupiter allows for priority based fees when exiting. do some research on the topic and find ways that we could speed up exiting, it may cost slightly more but might be worth it."

---

## Solana Priority Fee Mechanics

### How Priority Fees Work

On Solana, transactions are processed by leaders (validators) in each slot. When network congestion occurs, leaders prioritize transactions with higher priority fees.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLANA TRANSACTION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Transaction submitted to leader                            │
│  2. Leader's queue fills (capacity: ~1M compute units)         │
│  3. Priority fee determines queue position                     │
│  4. Higher priority = processed earlier                        │
│                                                                 │
│  Fee Structure:                                                 │
│  - Base fee: 5000 lamports (fixed)                             │
│  - Priority fee: Additional (0 to ∞ lamports)                  │
│  - Total = Base + Priority                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Jupiter's Priority Fee Support

Jupiter supports priority fees through the `prioritizationFeeLamports` parameter in the swap API:

```typescript
// Jupiter swap API with priority fees
const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  body: JSON.stringify({
    quoteResponse,
    userPublicKey: wallet.publicKey.toString(),
    wrapAndUnwrapSol: true,
    prioritizationFeeLamports: 100000  // Priority fee in lamports
  })
})
```

---

## Strategic Priority Fee Approach

### Entry vs Exit Priority

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PRIORITY FEE STRATEGY                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ENTRY: CONSERVATIVE                                                 │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Priority Fee: Standard (10,000 - 50,000 lamports)          │     │
│  │ Rationale: Missing entry = opportunity cost, not loss      │     │
│  │ Strategy: Wait 1-2 confirmations, lower acceptable         │     │
│  │                                                                  │
│  │ "Better to miss a trade than overpay for entry"             │     │
│  └────────────────────────────────────────────────────────────┘     │
│                               ↓                                        │
│  EXIT: AGGRESSIVE                                                    │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Priority Fee: High (100,000 - 500,000+ lamports)           │     │
│  │ Rationale: Delay = lost profit, potential bag holding      │     │
│  │ Strategy: Dynamic based on profit level                    │     │
│  │                                                                  │
│  │ "Speed is money - pay to exit first"                        │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Dynamic Priority Fee Configuration

```typescript
export interface PriorityFeeConfig {
  // Entry settings
  entryStandardFee: number      // 10,000 lamports (0.00001 SOL)
  entryMaxFee: number           // 50,000 lamports (0.00005 SOL)

  // Exit settings (dynamic based on profit)
  exitBaseFee: number           // 100,000 lamports (0.0001 SOL)
  exitHighProfitFee: number     // 500,000 lamports (0.0005 SOL)
  exitEmergencyFee: number      // 1,000,000 lamports (0.001 SOL)

  // Fee thresholds
  highProfitThreshold: number   // 100% profit triggers high fee
  emergencyThreshold: number    // Trailing stop activated
}

export const DEFAULT_PRIORITY_FEE_CONFIG: PriorityFeeConfig = {
  entryStandardFee: 10_000,
  entryMaxFee: 50_000,
  exitBaseFee: 100_000,
  exitHighProfitFee: 500_000,
  exitEmergencyFee: 1_000_000,
  highProfitThreshold: 100,  // 100% profit
  emergencyThreshold: 85     // Trailing stop at 15% distance
}
```

---

## Priority Fee Calculation

```typescript
export class PriorityFeeManager {
  private config: PriorityFeeConfig

  /**
   * Calculate priority fee for entry trade
   * Use conservative fee - we can afford to wait
   */
  getEntryPriorityFee(): number {
    // Check current network conditions
    const networkLoad = this.getNetworkLoad()

    if (networkLoad > 0.8) {
      // Network congested - use max entry fee
      return this.config.entryMaxFee
    }

    return this.config.entryStandardFee
  }

  /**
   * Calculate priority fee for exit trade
   * Use aggressive fee - speed is critical
   */
  getExitPriorityFee(profitPercentage: number, isTrailingStop: boolean): number {
    // Emergency: Trailing stop just activated
    if (isTrailingStop) {
      console.log('🚨 EMERGENCY EXIT: Maximum priority fee')
      return this.config.exitEmergencyFee
    }

    // High profit: Pay more to lock it in
    if (profitPercentage >= this.config.highProfitThreshold) {
      console.log(`💰 HIGH PROFIT (${profitPercentage}%): Using high priority fee`)
      return this.config.exitHighProfitFee
    }

    // Standard exit: Base priority fee
    return this.config.exitBaseFee
  }

  /**
   * Estimate current network load
   * Based on recent slot fill rate
   */
  private getNetworkLoad(): number {
    // This would be tracked via WebSocket subscription
    // For now, return conservative estimate
    return 0.5
  }
}
```

---

## Fee Schedule by Scenario

| Scenario | Profit | Priority Fee | Rationale |
|----------|--------|--------------|-----------|
| **Entry** | N/A | 10,000 - 50,000 lamports | Conservative - opportunity cost only |
| **Stop Loss** | -40% | 500,000 lamports | Urgent - minimize loss |
| **Take Profit (50%)** | +50% | 100,000 lamports | Standard - decent profit secured |
| **Take Profit (100%)** | +100% | 500,000 lamports | High profit - worth the fee |
| **Trailing Stop** | +100%+ | 1,000,000 lamports | Emergency - peak imminent |
| **Max Hold (4h)** | Any | 100,000 lamports | Time-based exit, moderate urgency |

### Cost-Benefit Analysis

```
Example: 0.1 SOL position with 100% profit

Without Priority Fee:
  - Exit value: 0.2 SOL
  - Risk: 5% price drop during delay = 0.01 SOL lost

With Priority Fee (500,000 lamports = 0.0005 SOL):
  - Exit value: 0.2 SOL
  - Fee cost: 0.0005 SOL
  - Benefit: Lock in 0.2 SOL faster

Break-even: Priority fee pays for itself if it prevents
            just 0.25% price slippage (very likely!)

Conclusion: Priority fees on exits are almost always worth it
```

---

## Jupiter Integration

```typescript
// src/jupiter/jupiterClient.ts

import { VersionedTransaction } from '@solana/web3.js'

export class JupiterClient {
  private priorityFeeManager: PriorityFeeManager

  /**
   * Execute swap with dynamic priority fees
   */
  async executeSwap(
    quote: QuoteResponse,
    direction: 'entry' | 'exit',
    context?: {
      profitPercentage?: number
      isTrailingStop?: boolean
    }
  ): Promise<string> {
    // Calculate priority fee based on direction and context
    const priorityFee = direction === 'entry'
      ? this.priorityFeeManager.getEntryPriorityFee()
      : this.priorityFeeManager.getExitPriorityFee(
          context?.profitPercentage ?? 0,
          context?.isTrailingStop ?? false
        )

    console.log(`📤 Priority Fee: ${priorityFee} lamports (${priorityFee / 1_000_000_000} SOL)`)

    // Get swap transaction
    const swapResponse = await this.getSwapTransaction(quote, priorityFee)

    // Sign and send
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapResponse.swapTransaction, 'base64')
    )
    transaction.sign([this.keypair])

    // Send with additional confirmation strategies
    const signature = await this.connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'processed'
    })

    return signature
  }

  /**
   * Get swap transaction from Jupiter API
   */
  private async getSwapTransaction(
    quote: QuoteResponse,
    priorityFee: number
  ): Promise<SwapResponse> {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: priorityFee,
        dynamicComputeUnitLimit: true  // Let Jupiter optimize CU
      })
    })

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.statusText}`)
    }

    return response.json()
  }
}
```

---

## Advanced: Compute Unit Optimization

Jupiter can dynamically optimize compute units (CU) when combined with priority fees:

```typescript
interface SwapRequest {
  quoteResponse: QuoteResponse
  userPublicKey: string
  wrapAndUnwrapSol: boolean
  prioritizationFeeLamports: number
  dynamicComputeUnitLimit: boolean  // Let Jupiter set optimal CU
}

// Benefits of dynamic CU:
// 1. Jupiter calculates exact CU needed
// 2. Sets compute unit limit accordingly
// 3. Adds priority fee to tip leader
// 4. More predictable execution
```

### Compute Unit Priority Fee Formula

```
Priority Fee per CU = (Total Priority Fee) / Compute Units

Example:
  Compute Units: 200,000
  Priority Fee: 500,000 lamports
  Fee per CU: 2.5 lamports

This gives leader more incentive to include transaction
```

---

## Monitoring and Adjustment

```typescript
export class PriorityFeeMonitor {
  private feeHistory: Array<{ timestamp: number; fee: number; landedSlot: number }> = []

  /**
   * Track fee effectiveness
   */
  recordFee(fee: number, landedSlot: number): void {
    this.feeHistory.push({
      timestamp: Date.now(),
      fee,
      landedSlot
    })

    // Keep last 100 records
    if (this.feeHistory.length > 100) {
      this.feeHistory.shift()
    }
  }

  /**
   * Analyze if fees are effective
   */
  analyzeFeeEffectiveness(): {
    avgLag: number
    successRate: number
    recommendedAdjustment: number
  } {
    // Calculate average slot delay
    const avgLag = this.calculateAverageLag()

    // Calculate what fee would have been better
    const recommendedAdjustment = avgLag > 3 ? 1.5 : 1.0

    return {
      avgLag,
      successRate: this.calculateSuccessRate(),
      recommendedAdjustment
    }
  }

  private calculateAverageLag(): number {
    // Implementation: Measure slot submission to confirmation delay
    return 2 // placeholder
  }

  private calculateSuccessRate(): number {
    // Implementation: Measure first-try confirmation rate
    return 0.95 // placeholder
  }
}
```

---

## Helius WebSocket for Real-Time Monitoring

Track network conditions to adjust priority fees dynamically:

```typescript
// src/solana/websocketMonitor.ts

export class NetworkConditionMonitor {
  private ws: WebSocket

  constructor(private heliusWsUrl: string) {
    this.connect()
  }

  private connect(): void {
    this.ws = new WebSocket(`${this.heliusWsUrl}?api-key=${process.env.HELIUS_API_KEY}`)

    this.ws.onopen = () => {
      console.log('📡 Connected to Helius WebSocket')
      this.subscribeToSlots()
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleSlotUpdate(message)
    }
  }

  private subscribeToSlots(): void {
    this.ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'slotsUpdatesSubscribe'
    }))
  }

  private handleSlotUpdate(message: any): void {
    if (message.method === 'slotsUpdates') {
      const slotUpdate = message.params.result
      // Analyze slot fill rate
      const fillRate = this.calculateFillRate(slotUpdate)

      // Adjust priority fees based on network
      if (fillRate > 0.9) {
        console.log('🔥 Network HOT: Increasing priority fees')
        this.increaseFees()
      }
    }
  }

  private calculateFillRate(slotUpdate: any): number {
    // Calculate how full slots are
    return slotUpdate?.slot?.transactionCount ?? 0
  }

  private increaseFees(): void {
    // Signal to PriorityFeeManager
  }
}
```

---

## Configuration Examples

### Conservative Configuration (Lower Fees)

```typescript
// For initial testing or low-value trades
const CONSERVATIVE_CONFIG: PriorityFeeConfig = {
  entryStandardFee: 5_000,      // 0.000005 SOL
  entryMaxFee: 20_000,          // 0.00002 SOL
  exitBaseFee: 50_000,          // 0.00005 SOL
  exitHighProfitFee: 200_000,   // 0.0002 SOL
  exitEmergencyFee: 500_000,    // 0.0005 SOL
  highProfitThreshold: 100,
  emergencyThreshold: 85
}
```

### Aggressive Configuration (Faster Execution)

```typescript
// For volatile markets or high-value trades
const AGGRESSIVE_CONFIG: PriorityFeeConfig = {
  entryStandardFee: 50_000,     // 0.00005 SOL
  entryMaxFee: 200_000,         // 0.0002 SOL
  exitBaseFee: 200_000,         // 0.0002 SOL
  exitHighProfitFee: 1_000_000, // 0.001 SOL
  exitEmergencyFee: 2_000_000,  // 0.002 SOL
  highProfitThreshold: 100,
  emergencyThreshold: 85
}
```

---

## Summary: Priority Fee Strategy

| Phase | Strategy | Fee Range | When to Use |
|-------|----------|-----------|-------------|
| **Entry** | Conservative | 10K - 50K lamports | All entries - opportunity cost only |
| **Exit - Standard** | Moderate | 100K lamports | Take profit < 100% |
| **Exit - High Profit** | Aggressive | 500K lamports | Take profit ≥ 100% |
| **Exit - Emergency** | Maximum | 1M+ lamports | Trailing stop, stop loss |

### Key Principles

1. **Entry = Conservative:** Missing entry costs nothing, overpaying costs real money
2. **Exit = Aggressive:** Delay on exit risks profits, priority fees are insurance
3. **Dynamic Adjustment:** Scale fees based on profit level and urgency
4. **Monitor Network:** Increase fees during congestion
5. **Track Effectiveness:** Adjust based on actual confirmation speed

---

## Related Files

- Architecture: `design/01-architecture.md`
- Exit Strategy: `design/04-monitoring-exit.md`
- Decimal Handling: `design/02-decimal-handling.md`
- Compounding: `design/05-compounding.md`
