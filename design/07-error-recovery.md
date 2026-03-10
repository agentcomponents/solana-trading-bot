# 07. Error Recovery & Resilience

**Status:** Complete
**Last Updated:** 2026-03-10

---

## Overview

This document covers comprehensive error recovery strategies for the Solana trading bot. Given the volatility of crypto markets and the potential for network issues, robust error handling is critical to protecting capital and avoiding stuck positions.

**Core Principles:**
1. **Fail Fast** - Detect issues early rather than waiting
2. **Graceful Degradation** - Continue operating at reduced capacity if possible
3. **Never Lose State** - All critical data persisted before actions
4. **Manual Override** - Emergency pause and manual intervention capability

---

## Failure Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FAILURE CATEGORIES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  NETWORK / RPC  │  │   TRANSACTION   │  │    BUSINESS     │        │
│  │                 │  │                 │  │                 │        │
│  │ • RPC timeout   │  │ • Stuck tx      │  │ • Slippage too  │        │
│  │ • Connection    │  │ • Failed        │  │   high          │        │
│  │   failures      │  │   confirm       │  │ • Liquidity     │        │
│  │ • Rate limit    │  │ • Dropped       │  │   dried up      │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. RPC Connection Management

### Multi-RPC Strategy

Always maintain multiple RPC endpoints with automatic failover:

```typescript
interface RpcEndpoint {
  name: string
  url: string
  priority: number        // 1 = primary, 2 = backup, etc.
  healthy: boolean
  lastFailure: number
  failureCount: number
}

export const RPC_ENDPOINTS: RpcEndpoint[] = [
  {
    name: 'helius-primary',
    url: process.env.HELIUS_RPC_URL!,
    priority: 1,
    healthy: true,
    lastFailure: 0,
    failureCount: 0
  },
  {
    name: 'helius-backup',
    url: process.env.HELIUS_BACKUP_URL || process.env.HELIUS_RPC_URL!,
    priority: 2,
    healthy: true,
    lastFailure: 0,
    failureCount: 0
  },
  {
    name: 'public-fallback',
    url: 'https://api.mainnet-beta.solana.com',
    priority: 3,
    healthy: true,
    lastFailure: 0,
    failureCount: 0
  }
]
```

### RPC Health Monitor

```typescript
export class RpcHealthMonitor {
  private endpoints: Map<string, RpcEndpoint>
  private currentEndpoint: RpcEndpoint
  private healthCheckInterval: number = 30_000  // 30 seconds

  constructor() {
    this.endpoints = new Map(RPC_ENDPOINTS.map(e => [e.name, e]))
    this.currentEndpoint = this.getHighestPriorityHealthy()
    this.startHealthChecks()
  }

  /**
   * Get the best available RPC endpoint
   */
  getCurrentEndpoint(): RpcEndpoint {
    if (!this.currentEndpoint.healthy) {
      this.failover()
    }
    return this.currentEndpoint
  }

  /**
   * Mark endpoint as failed and trigger failover
   */
  markFailure(endpointName: string): void {
    const endpoint = this.endpoints.get(endpointName)
    if (!endpoint) return

    endpoint.failureCount++
    endpoint.lastFailure = Date.now()

    // Circuit breaker: 3 failures in 5 minutes = unhealthy
    const recentFailures = this.getRecentFailures(endpoint)
    if (recentFailures >= 3) {
      console.error(`🔴 Circuit breaker activated: ${endpointName}`)
      endpoint.healthy = false

      // Schedule recovery check
      setTimeout(() => this.checkRecovery(endpoint), 60_000)
    }

    // If current endpoint failed, failover
    if (endpointName === this.currentEndpoint.name) {
      this.failover()
    }
  }

  /**
   * Failover to next healthy endpoint
   */
  private failover(): void {
    const next = this.getHighestPriorityHealthy()
    if (!next) {
      throw new Error('🚨 No healthy RPC endpoints available!')
    }

    console.warn(`⚠️ Failing over from ${this.currentEndpoint.name} to ${next.name}`)
    this.currentEndpoint = next
  }

  /**
   * Get highest priority healthy endpoint
   */
  private getHighestPriorityHealthy(): RpcEndpoint {
    const healthy = Array.from(this.endpoints.values())
      .filter(e => e.healthy)
      .sort((a, b) => a.priority - b.priority)

    if (healthy.length === 0) {
      throw new Error('No healthy RPC endpoints available')
    }

    return healthy[0]
  }

  /**
   * Check if failed endpoint has recovered
   */
  private async checkRecovery(endpoint: RpcEndpoint): Promise<void> {
    try {
      const connection = new Connection(endpoint.url, 'confirmed')
      await connection.getLatestBlockhash()

      console.log(`✅ Endpoint recovered: ${endpoint.name}`)
      endpoint.healthy = true
      endpoint.failureCount = 0
    } catch (error) {
      console.log(`❌ Endpoint still down: ${endpoint.name}`)
      // Check again in 60 seconds
      setTimeout(() => this.checkRecovery(endpoint), 60_000)
    }
  }

  /**
   * Count failures in last 5 minutes
   */
  private getRecentFailures(endpoint: RpcEndpoint): number {
    const fiveMinutesAgo = Date.now() - 300_000
    // This would be tracked in a separate failure log
    return endpoint.failureCount
  }

  /**
   * Background health checks
   */
  private startHealthChecks(): void {
    setInterval(async () => {
      for (const endpoint of this.endpoints.values()) {
        if (!endpoint.healthy) continue

        try {
          const connection = new Connection(endpoint.url, 'confirmed')
          await connection.getLatestBlockhash()
        } catch (error) {
          this.markFailure(endpoint.name)
        }
      }
    }, this.healthCheckInterval)
  }
}
```

---

## 2. Transaction Lifecycle Management

### Transaction States

```typescript
export enum TransactionState {
  PENDING = 'pending',           // Created but not sent
  SUBMITTED = 'submitted',       // Sent to network, awaiting confirmation
  CONFIRMING = 'confirming',     // Seen in mempool, checking confirmations
  CONFIRMED = 'confirmed',       // Required confirmations reached
  FAILED = 'failed',             // Transaction failed
  STUCK = 'stuck',               // Too long without confirmation
  UNKNOWN = 'unknown'            // Network error, status unclear
}

export interface TrackedTransaction {
  id: string
  signature: string
  state: TransactionState
  submittedAt: number
  lastChecked: number
  confirmations: number
  requiredConfirmations: number
  retryCount: number
  maxRetries: number
}
```

### Transaction Monitor

```typescript
export class TransactionMonitor {
  private tracked: Map<string, TrackedTransaction>
  private connection: Connection
  private checkInterval: number = 2_000  // Check every 2 seconds

  constructor(connection: Connection) {
    this.connection = connection
    this.tracked = new Map()
    this.startMonitoring()
  }

  /**
   * Start tracking a transaction
   */
  track(signature: string, requiredConfirmations: number = 1): string {
    const id = crypto.randomUUID()

    const tx: TrackedTransaction = {
      id,
      signature,
      state: TransactionState.SUBMITTED,
      submittedAt: Date.now(),
      lastChecked: Date.now(),
      confirmations: 0,
      requiredConfirmations,
      retryCount: 0,
      maxRetries: 3
    }

    this.tracked.set(id, tx)
    console.log(`📤 Tracking transaction: ${signature.slice(0, 8)}...`)

    return id
  }

  /**
   * Check transaction status with exponential backoff
   */
  private async checkTransaction(tx: TrackedTransaction): Promise<void> {
    const age = Date.now() - tx.submittedAt

    // STUCK: Transaction older than 60 seconds without confirmation
    if (age > 60_000 && tx.state === TransactionState.SUBMITTED) {
      console.warn(`⚠️ Transaction may be stuck: ${tx.signature.slice(0, 8)}...`)
      tx.state = TransactionState.STUCK
      this.handleStuckTransaction(tx)
      return
    }

    try {
      const status = await this.connection.getSignatureStatus(tx.signature)

      if (!status) {
        // Unknown status - keep waiting
        return
      }

      if (status.value?.err) {
        console.error(`❌ Transaction failed: ${status.value.err}`)
        tx.state = TransactionState.FAILED
        this.handleFailedTransaction(tx, status.value.err)
        return
      }

      if (status.value?.confirmationStatus === 'confirmed') {
        tx.confirmations = 1

        if (tx.confirmations >= tx.requiredConfirmations) {
          console.log(`✅ Transaction confirmed: ${tx.signature.slice(0, 8)}...`)
          tx.state = TransactionState.CONFIRMED
          this.handleConfirmedTransaction(tx)
        }
      }
    } catch (error) {
      tx.retryCount++

      if (tx.retryCount > tx.maxRetries) {
        console.error(`❌ Max retries exceeded: ${tx.signature.slice(0, 8)}...`)
        tx.state = TransactionState.UNKNOWN
        this.handleUnknownTransaction(tx, error)
      }
    }

    tx.lastChecked = Date.now()
  }

  /**
   * Handle stuck transaction
   */
  private async handleStuckTransaction(tx: TrackedTransaction): Promise<void> {
    const age = Date.now() - tx.submittedAt
    const ageSeconds = Math.floor(age / 1000)

    console.error(`🚨 STUCK TRANSACTION (${ageSeconds}s old):`)
    console.error(`   Signature: ${tx.signature}`)
    console.error(`   Action Required: Check Solscan/explorer`)

    // Options for stuck transactions:
    // 1. Wait longer (up to 2 minutes max)
    // 2. Send replacement transaction with higher priority fee
    // 3. Give up and mark as failed

    if (age > 120_000) {
      // 2 minutes = definitely stuck
      console.error(`   Giving up after 2 minutes`)
      tx.state = TransactionState.FAILED
      // Bot should pause and require manual intervention
    }
  }

  /**
   * Handle confirmed transaction
   */
  private handleConfirmedTransaction(tx: TrackedTransaction): void {
    // Remove from active tracking
    this.tracked.delete(tx.id)

    // Update database
    // Dispatch event
    // Continue with next operation
  }

  /**
   * Handle failed transaction
   */
  private handleFailedTransaction(tx: TrackedTransaction, error: any): void {
    this.tracked.delete(tx.id)

    // Log to database
    // Alert user
    // Determine if retry is safe
  }

  /**
   * Handle transaction with unknown status
   */
  private handleUnknownTransaction(tx: TrackedTransaction, error: any): void {
    console.error(`❓ Unknown transaction status: ${tx.signature.slice(0, 8)}...`)
    console.error(`   This transaction may have landed. Check explorer:`)
    console.error(`   https://solscan.io/tx/${tx.signature}`)

    // PAUSE BOT and require manual verification
  }

  /**
   * Background monitoring loop
   */
  private startMonitoring(): void {
    setInterval(() => {
      for (const tx of this.tracked.values()) {
        this.checkTransaction(tx)
      }
    }, this.checkInterval)
  }
}
```

---

## 3. Exponential Backoff & Retry

### Retry Configuration

```typescript
export interface RetryConfig {
  maxAttempts: number
  initialDelay: number    // ms
  maxDelay: number        // ms
  backoffMultiplier: number
  retryableErrors: string[]
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1_000,    // 1 second
  maxDelay: 30_000,       // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    'NetworkError',
    'TimeoutError',
    '429',  // Rate limit
    '503',  // Service unavailable
    'connection timeout'
  ]
}
```

### Retry Executor

```typescript
export class RetryExecutor {
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Execute operation with exponential backoff
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error
    let delay = this.config.initialDelay

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error
        }

        // Last attempt - rethrow
        if (attempt === this.config.maxAttempts) {
          console.error(`❌ Max retries exceeded for ${context}`)
          throw error
        }

        console.warn(
          `⚠️ ${context} failed (attempt ${attempt}/${this.config.maxAttempts}): ` +
          `${error.message}. Retrying in ${delay}ms...`
        )

        // Wait before retry
        await this.sleep(delay)

        // Exponential backoff
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay)
      }
    }

    throw lastError!
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: any): boolean {
    const errorMessage = error.message || ''

    for (const retryable of this.config.retryableErrors) {
      if (errorMessage.includes(retryable)) {
        return true
      }
    }

    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### Usage Example

```typescript
// Get quote with retry
const retry = new RetryExecutor()

const quote = await retry.execute(
  () => jupiterApi.getQuote(inputMint, outputMint, amount),
  'Get Jupiter Quote'
)
```

---

## 4. Circuit Breaker Pattern

Prevent cascading failures by temporarily disabling failing services:

```typescript
export enum CircuitState {
  CLOSED = 'closed',       // Normal operation
  OPEN = 'open',           // Failing, reject requests
  HALF_OPEN = 'half_open'  // Testing if recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private lastFailureTime: number = 0
  private successCount: number = 0

  constructor(
    private name: string,
    private threshold: number = 5,      // Open after 5 failures
    private timeout: number = 60_000,   // Try again after 60 seconds
    private halfOpenAttempts: number = 3  // 3 successful attempts to close
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Circuit is OPEN - reject immediately
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        console.log(`🔄 Circuit breaker HALF_OPEN: ${this.name}`)
        this.state = CircuitState.HALF_OPEN
        this.successCount = 0
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name}`)
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++

      if (this.successCount >= this.halfOpenAttempts) {
        console.log(`✅ Circuit breaker CLOSED: ${this.name}`)
        this.state = CircuitState.CLOSED
        this.failureCount = 0
      }
    } else {
      this.failureCount = 0
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.threshold) {
      console.error(`🔴 Circuit breaker OPEN: ${this.name}`)
      this.state = CircuitState.OPEN
    }
  }

  getState(): CircuitState {
    return this.state
  }
}
```

### Circuit Breaker Configuration

```typescript
// Create circuit breakers for external services
export const circuitBreakers = {
  jupiter: new CircuitBreaker('Jupiter API', 5, 60_000),
  rugcheck: new CircuitBreaker('RugCheck API', 3, 30_000),
  goplus: new CircuitBreaker('GoPlus API', 3, 30_000),
  dexscreener: new CircuitBreaker('DexScreener', 5, 60_000),
  rpc: new CircuitBreaker('RPC Connection', 10, 30_000)
}
```

---

## 5. Position Recovery After Crash

### State Persistence

All critical state must be persisted BEFORE any trading action:

```typescript
export interface PersistentState {
  currentPosition: Position | null
  pendingTransaction: string | null
  walletBalance: number
  lastActivity: number
}

export class StateManager {
  constructor(private db: Database) {}

  /**
   * Save state BEFORE any trading action
   */
  async saveBeforeTrade(state: PersistentState): Promise<void> {
    await this.db.insert('state_log', {
      timestamp: Date.now(),
      state: JSON.stringify(state),
      phase: 'before_trade'
    })
  }

  /**
   * Save state AFTER trading action completes
   */
  async saveAfterTrade(state: PersistentState): Promise<void> {
    await this.db.insert('state_log', {
      timestamp: Date.now(),
      state: JSON.stringify(state),
      phase: 'after_trade'
    })
  }

  /**
   * Recover state on startup
   */
  async recover(): Promise<{
    state: PersistentState
    actionRequired: string | null
  }> {
    const latest = await this.db.getLatestState()

    if (!latest) {
      return {
        state: this.getInitialState(),
        actionRequired: null
      }
    }

    const state = JSON.parse(latest.state) as PersistentState
    const age = Date.now() - latest.timestamp

    // Check for incomplete operations
    if (latest.phase === 'before_trade' && age > 5_000) {
      // State saved but no after_trade log = crashed during trade
      console.error(`🚨 Incomplete trade detected from ${new Date(latest.timestamp).toISOString()}`)
      return {
        state,
        actionRequired: 'Verify last transaction status on Solscan before continuing'
      }
    }

    return {
      state,
      actionRequired: null
    }
  }
}
```

---

## 6. Emergency Controls

### Pause/Resume Mechanism

```typescript
export enum PauseReason {
  MANUAL = 'manual',
  STUCK_TRANSACTION = 'stuck_transaction',
  RPC_FAILURE = 'rpc_failure',
  HIGH_SLIPPAGE = 'high_slippage',
  CIRCUIT_BREAKER = 'circuit_breaker',
  UNKNOWN_STATE = 'unknown_state'
}

export class EmergencyControl {
  private paused: boolean = false
  private pauseReason: PauseReason | null = null
  private pausedAt: number = 0

  /**
   * Emergency pause - stops all trading
   */
  pause(reason: PauseReason, details?: string): void {
    if (this.paused) return

    this.paused = true
    this.pauseReason = reason
    this.pausedAt = Date.now()

    console.error(`🚨 BOT PAUSED: ${reason}`)
    if (details) {
      console.error(`   Details: ${details}`)
    }

    // Persist pause state
    // Send alert notification
  }

  /**
   * Resume trading (manual only)
   */
  resume(): void {
    console.log(`▶️ Bot resuming (was paused: ${this.pauseReason})`)
    this.paused = false
    this.pauseReason = null
  }

  isPaused(): boolean {
    return this.paused
  }

  getPauseReason(): PauseReason | null {
    return this.pauseReason
  }
}
```

---

## 7. Slippage Protection

### Dynamic Slippage Adjustment

```typescript
export class SlippageMonitor {
  private readonly SLIPPAGE_THRESHOLD = 5 // percent

  /**
   * Compare expected vs actual slippage
   */
  async validateSlippage(
    expectedOutAmount: bigint,
    actualOutAmount: bigint
  ): Promise<{ acceptable: boolean; slippagePercent: number }> {
    const slippagePercent =
      (1 - Number(actualOutAmount) / Number(expectedOutAmount)) * 100

    if (slippagePercent > this.SLIPPAGE_THRESHOLD) {
      console.error(`❌ Excessive slippage: ${slippagePercent.toFixed(2)}%`)
      console.error(`   Expected: ${expectedOutAmount.toString()}`)
      console.error(`   Actual: ${actualOutAmount.toString()}`)

      return {
        acceptable: false,
        slippagePercent
      }
    }

    return {
      acceptable: true,
      slippagePercent
    }
  }

  /**
   * Suggest increased slippage tolerance
   */
  suggestIncreasedTolerance(currentSlippageBps: number): number {
    // Increase by 50% if we're seeing high slippage
    return Math.min(currentSlippageBps * 1.5, 1000) // Max 10%
  }
}
```

---

## 8. Error Handling Flowchart

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  START OPERATION                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────┐                                                   │
│  │ Save State      │ ───────────────► FAIL: Log & Alert                │
│  │ (Before Action) │                                                   │
│  └────────┬────────┘                                                   │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐                                                   │
│  │ Circuit Breaker │ ───────────────► OPEN: Pause & Alert               │
│  │ Check           │                                                   │
│  └────────┬────────┘                                                   │
│           │ CLOSED                                                      │
│           ▼                                                             │
│  ┌─────────────────┐                                                   │
│  │ Execute with    │ ───────────────► FAIL: Retry with Backoff         │
│  │ Retry           │                                                   │
│  └────────┬────────┘                                                   │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐                                                   │
│  │ Monitor Transaction│ ────────► STUCK: Wait → Check Manually         │
│  │                 │          ────────► FAILED: Log & Handle           │
│  └────────┬────────┘                                                   │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐                                                   │
│  │ Save State      │                                                   │
│  │ (After Action)  │                                                   │
│  └────────┬────────┘                                                   │
│           │                                                             │
│           ▼                                                             │
│     COMPLETE                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Database Schema Additions

Add these tables for error tracking:

```sql
-- Transaction tracking
CREATE TABLE tracked_transactions (
  id TEXT PRIMARY KEY,
  signature TEXT NOT NULL,
  state TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  last_checked INTEGER NOT NULL,
  confirmations INTEGER DEFAULT 0,
  required_confirmations INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 0
);

-- Error log
CREATE TABLE error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  severity TEXT NOT NULL,  -- 'info', 'warning', 'error', 'critical'
  category TEXT NOT NULL,  -- 'rpc', 'transaction', 'slippage', 'api'
  message TEXT NOT NULL,
  details TEXT,
  resolved BOOLEAN DEFAULT 0
);

-- State persistence
CREATE TABLE state_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  state TEXT NOT NULL,        -- JSON serialized
  phase TEXT NOT NULL         -- 'before_trade', 'after_trade'
);

-- Circuit breaker state
CREATE TABLE circuit_breaker_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  service TEXT NOT NULL,
  state TEXT NOT NULL,        -- 'closed', 'open', 'half_open'
  failure_count INTEGER,
  reason TEXT
);
```

---

## 10. Configuration Examples

### Conservative (Safer)

```typescript
const CONSERVATIVE_CONFIG = {
  retry: {
    maxAttempts: 5,
    initialDelay: 2_000,
    maxDelay: 60_000
  },
  circuitBreaker: {
    threshold: 3,        // Open after 3 failures
    timeout: 120_000     // Wait 2 minutes before retry
  },
  transaction: {
    stuckTimeout: 90_000,     // 90 seconds = stuck
    maxConfirmTime: 180_000   // 3 minutes max wait
  }
}
```

### Aggressive (Faster)

```typescript
const AGGRESSIVE_CONFIG = {
  retry: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 10_000
  },
  circuitBreaker: {
    threshold: 10,       // More failures before opening
    timeout: 30_000      // Retry sooner
  },
  transaction: {
    stuckTimeout: 45_000,      // 45 seconds = stuck
    maxConfirmTime: 60_000     // 1 minute max wait
  }
}
```

---

## Summary: Error Recovery Checklist

| Component | Strategy |
|-----------|----------|
| **RPC Failures** | Multi-endpoint failover, health checks, circuit breaker |
| **Transaction Stuck** | Monitor 60s+, send replacement with higher fee, or abort |
| **API Failures** | Circuit breaker, exponential backoff, pause bot |
| **Crash Recovery** | State persistence, incomplete trade detection |
| **Slippage** | Validate actual vs expected, pause if excessive |
| **Manual Override** | Emergency pause/resume, requires manual verification |

---

## Related Files

- Architecture: `design/01-architecture.md`
- Priority Fees: `design/06-priority-fees.md`
- Decimal Handling: `design/02-decimal-handling.md`
- Exit Strategy: `design/04-monitoring-exit.md`

