# 02. Token Decimal Precision Handling

**Status:** Complete
**Priority:** CRITICAL - User experienced bugs from this in past
**Last Updated:** 2025-03-10

---

## The Problem

**User's Experience:**
> "some issues i had in the past included which decimal the token was using (6 to 9), as this could skew the sell balance when trying to exit."

SPL tokens on Solana can have 0-9 decimals. When you buy tokens, Jupiter returns amounts in the **token's smallest unit** (raw). If you don't properly track the decimals and raw amounts, your exit trades will fail or be for wrong amounts.

### Example of the Bug

```typescript
// ❌ WRONG: What causes the bug
const entry = await jupiter.swap({ amount: 0.1 })  // 0.1 SOL
const tokensReceived = entry.outputAmount  // "150000000" (raw for 6 decimals)

// Later, for exit:
await jupiter.swap({
  amount: tokensReceived  // BUG: This is raw for 6 decimals!
  // But what if we forgot and thought it was 9 decimals?
  // Or we converted to human then back to raw with wrong decimals?
})
```

---

## The Solution

**Key Principle:** Store EXACTLY what Jupiter returns, and use it directly for exit.

```
Entry: Human → Raw (for Jupiter) → Store Raw
Exit:  Use Stored Raw (directly to Jupiter) → Result Raw → Human (for display)
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ENTRY FLOW                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User wants to spend 0.1 SOL                                     │
│         │                                                            │
│         ▼                                                            │
│  2. Fetch token metadata (CRITICAL!)                                │
│     ┌─────────────────────────────────────┐                         │
│     │ tokenAddress: "xxx..."               │                         │
│     │ decimals: 6                          │  ← Must store this!    │
│     │ symbol: "TOKEN"                      │                         │
│     └─────────────────────────────────────┘                         │
│         │                                                            │
│         ▼                                                            │
│  3. Convert human SOL to raw SOL                                    │
│     humanToRaw(0.1, 9) = 100,000,000                                 │
│         │                                                            │
│         ▼                                                            │
│  4. Get Jupiter quote (using RAW)                                   │
│     ┌─────────────────────────────────────┐                         │
│     │ inputAmount: 100,000,000 (SOL raw)   │                         │
│     │ outputAmount: 150,000,000 (TOKEN raw)│  ← Must store this!    │
│     └─────────────────────────────────────┘                         │
│         │                                                            │
│         ▼                                                            │
│  5. Execute swap                                                    │
│         │                                                            │
│         ▼                                                            │
│  6. Store in DATABASE                                               │
│     ┌─────────────────────────────────────┐                         │
│     │ tokensReceivedRaw: "150000000"      │  ← Critical field!      │
│     │ tokenDecimals: 6                    │  ← Critical field!      │
│     │ entrySolSpent: 0.1                  │  ← For P&L calc        │
│     └─────────────────────────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          EXIT FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Load position from DATABASE                                     │
│     ┌─────────────────────────────────────┐                         │
│     │ tokensReceivedRaw: "150000000"      │  ← Stored at entry     │
│     │ tokenDecimals: 6                    │  ← Stored at entry     │
│     └─────────────────────────────────────┘                         │
│         │                                                            │
│         ▼                                                            │
│  2. Get Jupiter quote (using STORED RAW)                            │
│     ┌─────────────────────────────────────┐                         │
│     │ inputMint: TOKEN_ADDRESS             │                         │
│     │ outputMint: SOL_ADDRESS              │                         │
│     │ amount: 150,000,000 (raw from DB!)   │  ← No conversion!      │
│     └─────────────────────────────────────┘                         │
│         │                                                            │
│         ▼                                                            │
│  3. Execute swap                                                    │
│         │                                                            │
│         ▼                                                            │
│  4. Update position with P&L (human amounts)                        │
│     solReceived = rawToHuman(outputRaw, 9)                           │
│     pnl = solReceived - entrySolSpent                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Token Metadata Fetcher

```typescript
// src/solana/tokenMetadata.ts
import { Connection, PublicKey } from '@solana/web3.js'

export interface TokenMetadata {
  address: string
  decimals: number        // CRITICAL: Fetch this at entry!
  symbol?: string
  name?: string
}

const metadataCache = new Map<string, TokenMetadata>()

export async function getTokenMetadata(
  connection: Connection,
  tokenMint: string
): Promise<TokenMetadata> {
  // Check cache first (5-minute TTL)
  const cached = metadataCache.get(tokenMint)
  if (cached && Date.now() - (cached as any).cachedAt < 300000) {
    return cached
  }

  // Fetch mint account info
  const mintAccount = await connection.getAccountInfo(new PublicKey(tokenMint))
  if (!mintAccount) {
    throw new Error(`Token mint not found: ${tokenMint}`)
  }

  // Parse mint data - decimals is at byte 44
  const decimals = mintAccount.data[44]

  const metadata: TokenMetadata = {
    address: tokenMint,
    decimals,
  }

  // Cache with timestamp
  ;(metadata as any).cachedAt = Date.now()
  metadataCache.set(tokenMint, metadata)

  return metadata
}
```

### 2. Decimal Conversion Utilities

```typescript
// src/solana/decimalConverter.ts
import BN from 'bn.js'

/**
 * Convert human-readable amount to raw token amount
 * @param amount - Human-readable amount (e.g., 1.5)
 * @param decimals - Token decimals (e.g., 9 for SOL, 6 for USDC)
 * @returns Raw amount as BN
 */
export function humanToRaw(amount: number, decimals: number): BN {
  if (amount < 0) throw new Error('Amount cannot be negative')

  const multiplier = Math.pow(10, decimals)
  const raw = Math.floor(amount * multiplier)

  return new BN(raw.toString())
}

/**
 * Convert raw token amount to human-readable amount
 * @param rawAmount - Raw amount from chain/Jupiter
 * @param decimals - Token decimals
 * @returns Human-readable amount
 */
export function rawToHuman(rawAmount: BN | string | number, decimals: number): number {
  const raw = typeof rawAmount === 'string' ? new BN(rawAmount)
              : typeof rawAmount === 'number' ? new BN(rawAmount)
              : rawAmount

  const divisor = new BN(10).pow(new BN(decimals))

  const integerPart = raw.div(divisor).toNumber()
  const fractionalPart = raw.mod(divisor).toNumber() / Math.pow(10, decimals)

  return integerPart + fractionalPart
}

/**
 * Calculate position value in SOL
 * Uses stored raw amount + current price
 */
export function calculatePositionValue(
  rawTokenAmount: BN,
  tokenDecimals: number,
  currentPricePerToken: number
): number {
  const tokenCount = rawToHuman(rawTokenAmount, tokenDecimals)
  return tokenCount * currentPricePerToken
}

/**
 * Calculate P&L percentage
 */
export function calculatePnLPercentage(
  rawTokenAmount: BN,
  tokenDecimals: number,
  currentPricePerToken: number,
  entrySolSpent: number
): number {
  const currentValue = calculatePositionValue(rawTokenAmount, tokenDecimals, currentPricePerToken)
  return ((currentValue - entrySolSpent) / entrySolSpent) * 100
}
```

### 3. Position Model with Decimal Tracking

```typescript
// src/models/position.ts
import BN from 'bn.js'

export interface Position {
  id: string
  tokenAddress: string
  tokenSymbol: string

  // ENTRY DATA - Store both formats
  entrySolSpent: number              // Human-readable (0.1)
  entrySolSpentRaw: BN               // Raw (100000000 for SOL)

  // CRITICAL: Store these exact values from Jupiter
  tokensReceivedRaw: BN              // Raw amount from Jupiter - DO NOT MODIFY
  tokenDecimals: number              // Fetched at entry time

  entryPricePerToken: number         // For calculations
  entryTime: Date
  entryScore: number

  // EXIT DATA
  exitPricePerToken?: number
  exitTime?: Date
  exitSignature?: string

  pnl?: number                       // Calculated from human amounts
  pnlPercentage?: number

  status: 'open' | 'closed'
  exitReason?: string
}
```

### 4. Entry Execution

```typescript
// src/jupiter/entryFlow.ts
import { humanToRaw, rawToHuman } from '../solana/decimalConverter'
import { getTokenMetadata } from '../solana/tokenMetadata'

export async function executeEntry(params: {
  tokenAddress: string
  tokenSymbol: string
  solAmount: number
  dexScore: number
}): Promise<Position> {
  const connection = getConnection()

  // 1. PRE-FLIGHT: Fetch token metadata BEFORE swapping
  const metadata = await getTokenMetadata(connection, params.tokenAddress)
  console.log(`Token ${params.tokenSymbol} has ${metadata.decimals} decimals`)

  // 2. Convert human SOL to raw SOL
  const solAmountRaw = humanToRaw(params.solAmount, 9)

  // 3. Get Jupiter quote
  const quote = await jupiter.getQuote({
    inputMint: SOL_MINT,
    outputMint: params.tokenAddress,
    amount: solAmountRaw,
    slippageBps: 100  // 1%
  })

  // 4. Execute swap
  const signature = await jupiter.executeSwap(quote)

  // 5. Store position with CRITICAL data
  const position: Position = {
    id: generateId(),
    tokenAddress: params.tokenAddress,
    tokenSymbol: params.tokenSymbol,
    entrySolSpent: params.solAmount,
    entrySolSpentRaw: solAmountRaw,

    // THE CRITICAL PART - Store exactly what Jupiter returned
    tokensReceivedRaw: quote.outAmount,  // BN from Jupiter
    tokenDecimals: metadata.decimals,    // Fetched from mint

    entryPricePerToken: params.solAmount / rawToHuman(quote.outAmount, metadata.decimals),
    entryTime: new Date(),
    entryScore: params.dexScore,
    status: 'open'
  }

  // 6. Verify
  const actualBalance = await getTokenBalance(connection, getKeyPair().publicKey, params.tokenAddress)
  if (!actualBalance.eq(position.tokensReceivedRaw)) {
    console.warn('Balance mismatch - transaction may have failed')
  }

  return position
}
```

### 5. Exit Execution

```typescript
// src/jupiter/exitFlow.ts
export async function executeExit(
  position: Position,
  exitReason: string
): Promise<void> {
  // 1. Use the STORED raw amount - no conversion needed!
  // This is the fix for the decimal skew bug
  const quote = await jupiter.getQuote({
    inputMint: new PublicKey(position.tokenAddress),
    outputMint: SOL_MINT,
    amount: position.tokensReceivedRaw,  // Direct from database!
    slippageBps: 300  // 3%
  })

  // 2. Execute swap
  const signature = await jupiter.executeSwap(quote)

  // 3. Calculate P&L using human amounts
  const solReceived = rawToHuman(quote.outAmount, 9)  // SOL is always 9 decimals
  const pnl = solReceived - position.entrySolSpent
  const pnlPercentage = (pnl / position.entrySolSpent) * 100

  // 4. Update position
  position.exitTime = new Date()
  position.exitSignature = signature
  position.status = 'closed'
  position.exitReason = exitReason
  position.pnl = pnl
  position.pnlPercentage = pnlPercentage

  console.log(`Closed position: ${position.tokenSymbol}`)
  console.log(`P&L: ${pnlPercentage.toFixed(2)}% (${pnl.toFixed(6)} SOL)`)
}
```

---

## Testing Strategy

```typescript
// tests/decimal/decimalHandling.test.ts
describe('Decimal Precision Tests', () => {
  test('should correctly convert 6 decimal token (USDC)', () => {
    const raw = humanToRaw(100.5, 6)
    expect(raw.toString()).toBe('100500000')

    const human = rawToHuman(raw, 6)
    expect(human).toBe(100.5)
  })

  test('should correctly convert 9 decimal token (SOL)', () => {
    const raw = humanToRaw(0.123456789, 9)
    expect(raw.toString()).toBe('123456789')

    const human = rawToHuman(raw, 9)
    expect(human).toBeCloseTo(0.123456789, 9)
  })

  test('should correctly convert 8 decimal token', () => {
    const raw = humanToRaw(1.23456789, 8)
    expect(raw.toString()).toBe('123456789')

    const human = rawToHuman(raw, 8)
    expect(human).toBeCloseTo(1.23456789, 8)
  })

  test('should handle position entry and exit with different decimals', () => {
    // Entry: Buy 1M tokens with 6 decimals, using 0.1 SOL (9 decimals)
    const position: Position = {
      id: 'test',
      tokenAddress: 'test',
      tokenSymbol: 'TEST',
      entrySolSpent: 0.1,
      entrySolSpentRaw: humanToRaw(0.1, 9),
      tokensReceivedRaw: humanToRaw(1000000, 6),
      tokenDecimals: 6,
      entryPricePerToken: 0.0000001,
      entryTime: new Date(),
      entryScore: 85,
      status: 'open'
    }

    // At 2x price, we should have 2x value
    const currentValue = calculatePositionValue(
      position.tokensReceivedRaw,
      position.tokenDecimals,
      0.0000002  // 2x price
    )
    expect(currentValue).toBeCloseTo(0.2, 6)
  })
})
```

---

## Key Takeaways

1. **Always fetch decimals at entry** - Never assume or guess
2. **Store raw amounts** - Keep exactly what Jupiter returns
3. **Use stored raw for exit** - No conversion, just pass through
4. **Only convert for display** - Human amounts are for P&L calculation and UI
5. **Cache metadata** - Avoid repeated RPC calls but keep TTL short

---

## Common Pitfalls

| Pitfall | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| Converting raw→human→raw | Precision loss | Keep original raw |
| Assuming decimals | Tokens vary | Always fetch from mint |
| Using string for raw | Can overflow | Use BN.js |
| Forgetting decimals at exit | Wrong amount | Store with position |

---

## Related Files

- Architecture: `design/01-architecture.md`
- Paper Trading: `design/03-paper-trading.md`
- Database Schema: `design/01-architecture.md#database-schema`
