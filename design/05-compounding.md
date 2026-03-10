# 05. Position Compounding Logic

**Status:** Complete
**Last Updated:** 2025-03-10

---

## Overview

This document covers the compounding strategy for growing trading capital while managing risk appropriately.

**User Requirement:**
> "After tripling initial amount to 0.3 SOL, compound the 0.1 SOL base after every trade"

**Core Philosophy:** Scale up gradually with profits, scale down quickly on losses.

---

## Compounding Stages

```
┌─────────────────────────────────────────────────────────────────────┐
│                      COMPOUNDING STAGES                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STAGE 1: BUILD (0.1 → 0.3 SOL)                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Base: 0.1 SOL (fixed)                                       │   │
│  │ Trade Size: 0.1 SOL                                         │   │
│  │ Target: Reach 0.3 SOL total                                 │   │
│  │ Strategy: Build foundation, validate strategy               │   │
│  │ Compounding: +0.05 SOL to base per 0.05 SOL profit         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            ↓                                         │
│  STAGE 2: GROWTH (0.3 → 1.0 SOL)                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Base: Scales from 0.15 → 0.25 SOL                           │   │
│  │ Trade Size: Gradually increases                             │   │
│  │ Target: Reach 1.0 SOL total                                 │   │
│  │ Strategy: Increase position size, compound profits          │   │
│  │ Compounding: +0.1 SOL to base per 0.1 SOL profit           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            ↓                                         │
│  STAGE 3: EXPANSION (1.0+ SOL)                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Base: 20% of total portfolio                                │   │
│  │ Trade Size: Variable (min 0.25 SOL)                         │   │
│  │ Target: Unlimited                                          │   │
│  │ Strategy: Scale proportionally to portfolio size            │   │
│  │ Compounding: Automatic, profit taking at 50% gain           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Compounding State

```typescript
export interface CompoundingState {
  stage: 'build' | 'growth' | 'expansion'

  // Capital allocation
  totalSol: number           // Total SOL in wallet
  baseSol: number            // Amount used per trade
  profitSol: number          // Realized profits available

  // Tracking
  initialBase: number        // Original 0.1 SOL
  totalDeposits: number      // Total SOL deposited
  totalWithdrawals: number   // Total SOL withdrawn
  allTimeHigh: number        // Highest total SOL achieved

  // Statistics
  totalTrades: number
  winStreak: number
  lossStreak: number
}
```

---

## Compounding Configuration

```typescript
export interface CompoundingConfig {
  // Stage thresholds (SOL)
  buildTarget: number       // 0.3 SOL - target to leave build stage
  growthTarget: number      // 1.0 SOL - target to leave growth stage

  // Compounding rates (SOL)
  buildCompoundingRate: number    // 0.05 - compound increment in build
  growthCompoundingRate: number   // 0.1 - compound increment in growth
  expansionPositionPct: number    // 0.2 - 20% of portfolio

  // Risk management
  maxDrawdownPct: number          // 0.3 - 30% drawdown triggers reduction
  lossRecoveryMode: boolean       // Enable position reduction on losses

  // Withdrawal
  takeProfitPct: number           // 0.5 - 50% gain triggers withdrawal
  takeProfitAmount: number        // 0.1 - SOL to withdraw each time
}

export const DEFAULT_COMPOUNDING_CONFIG: CompoundingConfig = {
  buildTarget: 0.3,
  growthTarget: 1.0,
  buildCompoundingRate: 0.05,
  growthCompoundingRate: 0.1,
  expansionPositionPct: 0.2,
  maxDrawdownPct: 0.3,
  lossRecoveryMode: true,
  takeProfitPct: 0.5,
  takeProfitAmount: 0.1
}
```

---

## Position Sizing Logic

```typescript
export class CompoundingManager {
  getPositionSize(): number {
    this.updateStage()

    switch (this.state.stage) {
      case 'build':
        // Fixed 0.1 SOL in build stage
        return 0.1

      case 'growth':
        // Gradually increase from 0.1 to 0.25 SOL
        // Based on progress from 0.3 to 1.0 SOL
        const progress = (this.state.totalSol - 0.3) / (1.0 - 0.3)
        return 0.1 + (progress * 0.15)  // 0.1 to 0.25 SOL

      case 'expansion':
        // 20% of portfolio (with min of 0.25 SOL)
        const positionSize = this.state.totalSol * this.config.expansionPositionPct
        return Math.max(positionSize, 0.25)

      default:
        return 0.1
    }
  }
}
```

### Position Sizing Table

| Stage | Total SOL | Position Size | Formula |
|-------|-----------|---------------|---------|
| Build | 0.1 | 0.1 SOL | Fixed |
| Build | 0.15 | 0.1 SOL | Fixed |
| Build | 0.25 | 0.1 SOL | Fixed |
| Build → Growth | 0.3 | 0.15 SOL | Compounded! |
| Growth | 0.4 | 0.17 SOL | 0.1 + (progress × 0.15) |
| Growth | 0.6 | 0.21 SOL | 0.1 + (progress × 0.15) |
| Growth | 0.9 | 0.25 SOL | 0.1 + (progress × 0.15) |
| Growth → Expansion | 1.0 | 0.25 SOL | Min(20%, 0.25) |
| Expansion | 1.5 | 0.30 SOL | 20% of total |
| Expansion | 2.0 | 0.40 SOL | 20% of total |

---

## Trade Result Handling

### On Profit

```typescript
private async handleProfit(profit: number): Promise<void> {
  const oldBase = this.state.baseSol
  const oldProfit = this.state.profitSol

  switch (this.state.stage) {
    case 'build':
      // Accumulate profits until we can compound
      this.state.profitSol += profit

      // Try to compound base by 0.05 SOL
      if (this.state.profitSol >= this.config.buildCompoundingRate) {
        this.state.baseSol += this.config.buildCompoundingRate
        this.state.profitSol -= this.config.buildCompoundingRate
        console.log(`📈 Compounded: Base now ${this.state.baseSol} SOL`)
      }
      break

    case 'growth':
      // Compound more aggressively
      this.state.profitSol += profit

      if (this.state.profitSol >= this.config.growthCompoundingRate) {
        this.state.baseSol += this.config.growthCompoundingRate
        this.state.profitSol -= this.config.growthCompoundingRate
        console.log(`📈 Compounded: Base now ${this.state.baseSol} SOL`)
      }
      break

    case 'expansion':
      // Base is calculated as % of total
      this.state.profitSol += profit

      // Check for profit taking
      const totalGain = this.state.totalSol - this.state.totalDeposits
      const gainPercentage = totalGain / this.state.totalDeposits

      if (gainPercentage >= this.config.takeProfitPct) {
        await this.withdrawProfit(this.config.takeProfitAmount)
      }
      break
  }
}
```

### On Loss

```typescript
private async handleLoss(loss: number): Promise<void> {
  this.state.profitSol -= loss

  // Ensure profit doesn't go negative
  if (this.state.profitSol < 0) {
    this.state.baseSol += this.state.profitSol  // Reduce base
    this.state.profitSol = 0
  }

  // Check if we need to reduce position size
  const drawdown = (this.state.allTimeHigh - this.state.totalSol) / this.state.allTimeHigh

  if (drawdown > this.config.maxDrawdownPct) {
    await this.reducePositionSize()
  }

  // Check for stage downgrade
  if (this.state.totalSol < 0.3 && this.state.stage !== 'build') {
    this.state.stage = 'build'
    this.state.baseSol = 0.1
    console.log(`⚠️  Drawdown: Returned to BUILD stage`)
  }
}
```

---

## Drawdown Protection

```typescript
/**
 * Reduce position size after significant drawdown
 */
private async reducePositionSize(): Promise<void> {
  const oldBase = this.state.baseSol
  const newBase = this.state.baseSol * 0.8  // Reduce by 20%

  this.state.baseSol = Math.max(newBase, 0.1)  // Never go below 0.1
  this.state.profitSol = this.state.totalSol - this.state.baseSol

  console.log(`⚠️  Max drawdown exceeded: Reduced base ${oldBase} → ${this.state.baseSol} SOL`)
}
```

### Drawdown Rules

| Drawdown | Action |
|----------|--------|
| < 30% | Continue normally |
| ≥ 30% | Reduce base by 20% |
| Drop below 0.3 SOL | Return to build stage, reset base to 0.1 |

---

## Stage Transitions

```typescript
private updateStage(): void {
  const oldStage = this.state.stage

  if (this.state.totalSol < 0.3) {
    this.state.stage = 'build'
    this.state.baseSol = 0.1
  } else if (this.state.totalSol < 1.0) {
    this.state.stage = 'growth'
  } else {
    this.state.stage = 'expansion'
  }

  if (oldStage !== this.state.stage) {
    console.log(`🎯 Stage transition: ${oldStage.toUpperCase()} → ${this.state.stage.toUpperCase()}`)
    console.log(`   Total SOL: ${this.state.totalSol.toFixed(4)}`)
    console.log(`   New base: ${this.getPositionSize().toFixed(4)} SOL`)
  }
}
```

---

## Profit Taking (Expansion Stage Only)

```typescript
/**
 * Withdraw profit to external wallet
 */
private async withdrawProfit(amount: number): Promise<void> {
  // In live mode, this would transfer SOL to a cold wallet
  // In paper mode, just track it
  this.state.totalWithdrawals += amount
  this.state.totalSol -= amount
  this.state.profitSol -= amount

  console.log(`💵 Withdrew ${amount} SOL in profits`)
  console.log(`   Total withdrawn: ${this.state.totalWithdrawals} SOL`)
}
```

**Trigger:** When total gain ≥ 50% of deposits
**Amount:** 0.1 SOL per withdrawal
**Purpose:** Lock in profits, reduce risk

---

## Example Scenarios

### Scenario 1: Successful Build Phase

```
Start: 0.1 SOL (Stage: build)

Trade 1: +0.05 SOL → Total: 0.15 SOL
  Profit pool: 0.05 SOL (not enough to compound)

Trade 2: +0.06 SOL → Total: 0.21 SOL
  Profit pool: 0.11 SOL → Compound +0.05
  Base: 0.1 → 0.15 SOL ✓
  Remaining profit: 0.06 SOL

Trade 3: +0.04 SOL → Total: 0.25 SOL
  Profit pool: 0.10 SOL → Compound +0.05
  Base: 0.15 → 0.20 SOL ✓
  Remaining profit: 0.05 SOL

Trade 4: +0.05 SOL → Total: 0.30 SOL ✓ TARGET REACHED
  → Stage transition: build → growth
  → New position size: 0.17 SOL (scaled)
```

### Scenario 2: Drawdown Recovery

```
Start: 0.35 SOL (Stage: growth, Base: 0.17 SOL)

Trade 1: +0.04 SOL → Total: 0.39 SOL (ATH: 0.39)

Trade 2: -0.03 SOL → Total: 0.36 SOL

Trade 3: -0.05 SOL → Total: 0.31 SOL

Trade 4: -0.04 SOL → Total: 0.27 SOL
  → Total dropped below 0.3
  → Stage downgrade: growth → build
  → Base reset: 0.17 → 0.1 SOL

Trade 5: +0.03 SOL → Total: 0.30 SOL
  → Back to growth stage
```

### Scenario 3: Expansion with Profit Taking

```
Start: 1.2 SOL (Stage: expansion, Deposits: 1.0 SOL)
  Position size: 1.2 × 20% = 0.24 SOL
  Current gain: +0.2 SOL (20%)

Trade 1: +0.06 SOL → Total: 1.26 SOL
  Gain: 26% (not enough for profit taking)

Trade 2: +0.10 SOL → Total: 1.36 SOL
  Gain: 36% (not enough)

Trade 3: +0.20 SOL → Total: 1.56 SOL
  Gain: 56% ✓ TAKE PROFIT TRIGGERED
  → Withdraw 0.1 SOL
  → Total: 1.46 SOL
  → Deposits: 1.0, Withdrawals: 0.1
  → Net worth: 1.46 (locked in 0.1 profit!)
```

---

## Integration with Trading Engine

```typescript
// src/core/tradingEngine.ts

export class TradingEngine {
  private compounding: CompoundingManager

  async executeEntry(token: TokenCandidate): Promise<Position> {
    // Get current position size from compounding manager
    const positionSize = this.compounding.getPositionSize()

    console.log(`📊 Entering with ${positionSize} SOL (stage: ${this.compounding.getState().stage})`)

    // Execute trade with calculated position size
    const position = await this.jupiter.swap({
      inputAmount: positionSize,
      outputToken: token.address,
      slippageBps: 100
    })

    return position
  }

  async onPositionClose(position: Position): Promise<void> {
    // Calculate trade result
    const result = {
      pnl: position.pnl || 0,
      pnlPercentage: position.pnlPercentage || 0,
      entrySol: position.entrySolSpent,
      exitSol: position.exitSolReceived || 0
    }

    // Update compounding state
    await this.compounding.onTradeClose(result)
  }
}
```

---

## Database Schema

```sql
-- Compounding state tracking
CREATE TABLE compounding_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stage TEXT NOT NULL,           -- 'build', 'growth', 'expansion'
    total_sol REAL NOT NULL,
    base_sol REAL NOT NULL,
    profit_sol REAL NOT NULL,
    initial_base REAL NOT NULL,
    total_deposits REAL NOT NULL,
    total_withdrawals REAL NOT NULL,
    all_time_high REAL NOT NULL,
    total_trades INTEGER NOT NULL,
    win_streak INTEGER NOT NULL,
    loss_streak INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one row
INSERT INTO compounding_state (id, stage, total_sol, base_sol, profit_sol,
                               initial_base, total_deposits, total_withdrawals,
                               all_time_high, total_trades, win_streak, loss_streak)
VALUES (1, 'build', 0.1, 0.1, 0, 0.1, 0.1, 0, 0.1, 0, 0, 0);

-- Position sizing history (for analytics)
CREATE TABLE position_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    position_size REAL NOT NULL,
    total_sol_at_time REAL NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (position_id) REFERENCES positions(id)
);

-- Withdrawal history
CREATE TABLE withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    total_sol_before REAL NOT NULL,
    total_sol_after REAL NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## State Display Format

```typescript
private logState(): void {
  console.log('\n' + '='.repeat(50))
  console.log(`         COMPOUNDING STATUS - ${this.state.stage.toUpperCase()}`)
  console.log('='.repeat(50))
  console.log(`Total SOL:     ${this.state.totalSol.toFixed(6)} SOL`)
  console.log(`Base (per trade): ${this.getPositionSize().toFixed(6)} SOL`)
  console.log(`Profit pool:   ${this.state.profitSol.toFixed(6)} SOL`)
  console.log(`All-time high: ${this.state.allTimeHigh.toFixed(6)} SOL`)
  console.log(`Trades: ${this.state.totalTrades} | Win: ${this.state.winStreak} | Loss: ${this.state.lossStreak}`)
  console.log('='.repeat(50) + '\n')
}
```

Output example:
```
==================================================
         COMPOUNDING STATUS - GROWTH
==================================================
Total SOL:     0.450000 SOL
Base (per trade): 0.171429 SOL
Profit pool:   0.050000 SOL
All-time high: 0.450000 SOL
Trades: 8 | Win: 3 | Loss: 0
==================================================
```

---

## Summary: Compounding Rules

| Stage | Total SOL | Position Size | Compounding | Drawdown Action |
|-------|-----------|---------------|-------------|-----------------|
| **Build** | 0.1 - 0.3 | Fixed 0.1 | +0.05 per 0.05 profit | Reset to 0.1 if drop below 0.3 |
| **Growth** | 0.3 - 1.0 | 0.1 → 0.25 (scaled) | +0.1 per 0.1 profit | Return to build if drop below 0.3 |
| **Expansion** | 1.0+ | 20% of portfolio | Auto, take profit at 50% gain | Reduce by 20% if 30% drawdown |

---

## Key Principles

1. **Gradual Scaling:** Increase position size slowly with profits
2. **Quick Reduction:** Decrease position size immediately on losses
3. **Stage Protection:** Drop to lower stage if threshold breached
4. **Profit Locking:** Withdraw profits at predetermined levels
5. **Never Risk Original Base:** Always keep at least 0.1 SOL base

---

## Related Files

- Architecture: `design/01-architecture.md`
- Decimal Handling: `design/02-decimal-handling.md`
- Paper Trading: `design/03-paper-trading.md`
- Exit Strategy: `design/04-monitoring-exit.md`
