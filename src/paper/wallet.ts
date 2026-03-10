/**
 * Virtual Wallet for Paper Trading
 *
 * Tracks virtual holdings without real funds:
 * - SOL balance
 * - Token positions
 * - Trade history
 * - P&L tracking
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VirtualTokenBalance {
  tokenAddress: string;
  tokenSymbol: string;
  rawAmount: string; // ALWAYS store raw (same as live trading)
  decimals: number;
  entryPrice: number; // SOL per token
  entryTimestamp: number;
}

export interface VirtualWallet {
  solBalance: number;
  tokens: Map<string, VirtualTokenBalance>;
  totalTrades: number;
  totalPnL: number;
  initialBalance: number;
}

export interface WalletState {
  solBalance: number;
  tokens: VirtualTokenBalance[];
  totalTrades: number;
  totalPnL: number;
  totalPnLPercent: number;
  initialValue: number;
  currentValue: number;
}

// ============================================================================
// VIRTUAL WALLET CLASS
// ============================================================================

export class VirtualWalletManager {
  private wallet: VirtualWallet;

  constructor(initialSol: number) {
    this.wallet = {
      solBalance: initialSol,
      tokens: new Map(),
      totalTrades: 0,
      totalPnL: 0,
      initialBalance: initialSol,
    };
  }

  /**
   * Get current wallet state
   */
  getState(): WalletState {
    const tokens = Array.from(this.wallet.tokens.values());
    const currentValue = this.calculateCurrentValue();
    const totalPnLPercent = ((currentValue - this.wallet.initialBalance) / this.wallet.initialBalance) * 100;

    return {
      solBalance: this.wallet.solBalance,
      tokens,
      totalTrades: this.wallet.totalTrades,
      totalPnL: this.wallet.totalPnL,
      totalPnLPercent,
      initialValue: this.wallet.initialBalance,
      currentValue,
    };
  }

  /**
   * Get SOL balance
   */
  getSolBalance(): number {
    return this.wallet.solBalance;
  }

  /**
   * Check if we have enough SOL for a trade
   */
  hasEnoughSol(amount: number): boolean {
    return this.wallet.solBalance >= amount;
  }

  /**
   * Deduct SOL for an entry (buy tokens)
   */
  deductSol(amount: number): void {
    if (amount > this.wallet.solBalance) {
      throw new Error(`Insufficient SOL balance: have ${this.wallet.solBalance}, need ${amount}`);
    }
    this.wallet.solBalance -= amount;
  }

  /**
   * Add SOL from an exit (sell tokens)
   */
  addSol(amount: number): void {
    this.wallet.solBalance += amount;
  }

  /**
   * Add tokens to wallet (after entry)
   */
  addTokens(
    tokenAddress: string,
    tokenSymbol: string,
    rawAmount: string,
    decimals: number,
    entryPrice: number
  ): void {
    this.wallet.tokens.set(tokenAddress, {
      tokenAddress,
      tokenSymbol,
      rawAmount,
      decimals,
      entryPrice,
      entryTimestamp: Date.now(),
    });
  }

  /**
   * Remove tokens from wallet (after exit)
   */
  removeTokens(tokenAddress: string): VirtualTokenBalance | null {
    const tokens = this.wallet.tokens.get(tokenAddress);
    if (!tokens) return null;
    this.wallet.tokens.delete(tokenAddress);
    return tokens;
  }

  /**
   * Get token balance
   */
  getTokenBalance(tokenAddress: string): VirtualTokenBalance | null {
    return this.wallet.tokens.get(tokenAddress) || null;
  }

  /**
   * Get all token positions
   */
  getAllTokens(): VirtualTokenBalance[] {
    return Array.from(this.wallet.tokens.values());
  }

  /**
   * Check if we hold a specific token
   */
  hasToken(tokenAddress: string): boolean {
    return this.wallet.tokens.has(tokenAddress);
  }

  /**
   * Record a completed trade and update P&L
   */
  recordTrade(pnl: number): void {
    this.wallet.totalTrades++;
    this.wallet.totalPnL += pnl;
  }

  /**
   * Calculate current portfolio value
   */
  private calculateCurrentValue(): number {
    // Current value = initial balance + realized P&L from closed trades
    return this.wallet.initialBalance + this.wallet.totalPnL;
  }

  /**
   * Reset wallet to initial state
   */
  reset(): void {
    this.wallet.solBalance = this.wallet.initialBalance;
    this.wallet.tokens.clear();
    this.wallet.totalTrades = 0;
    this.wallet.totalPnL = 0;
  }

  /**
   * Get wallet summary as string
   */
  toString(): string {
    const state = this.getState();
    const pnl = state.totalPnL >= 0 ? '+' : '';
    return `
Virtual Wallet:
  SOL Balance: ${state.solBalance.toFixed(6)} SOL
  Tokens Held: ${state.tokens.length}
  Total Trades: ${state.totalTrades}
  Total P&L: ${pnl}${state.totalPnL.toFixed(6)} SOL (${pnl}${state.totalPnLPercent.toFixed(2)}%)
  Initial: ${state.initialValue.toFixed(6)} SOL → Current: ${state.currentValue.toFixed(6)} SOL
    `.trim();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createVirtualWallet(initialSol: number = 0.1): VirtualWalletManager {
  return new VirtualWalletManager(initialSol);
}
