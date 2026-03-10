/**
 * Paper Trading Engine
 *
 * Simulates live trading using real market data but no actual transactions.
 * Core components:
 * - Real Jupiter quotes (live prices)
 * - Simulated execution (slippage, no real swaps)
 * - Virtual wallet tracking
 * - Position management
 *
 * This is the main orchestrator for paper trading.
 */

import type { Database } from 'better-sqlite3';
import { getQuote } from '../jupiter/client';
import { getSlippageSimulator } from './slippage';
import { createVirtualWallet, type VirtualWalletManager } from './wallet';
import {
  createPositionRepository,
  createTokenMetadataRepository,
  type Position,
  type CreatePositionInput
} from '../db';
import type { TokenSearchResult } from '../scanner/dexscreener';

// ============================================================================
// TYPES
// ============================================================================

export interface PaperEntryResult {
  success: boolean;
  position?: Position;
  quotedTokens: number;
  actualTokens: number;
  slippageBps: number;
  entryPriceSol: number;
  error?: string;
}

export interface PaperExitResult {
  success: boolean;
  quotedSol: number;
  actualSol: number;
  slippageBps: number;
  pnl: number;
  pnlPercent: number;
  exitReason: string;
  error?: string;
}

export interface PaperTradeConfig {
  initialSol: number;
  entryAmountSol: number;
  defaultSlippageBps: number;
  db: Database;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

// ============================================================================
// PAPER TRADING ENGINE
// ============================================================================

export class PaperTradingEngine {
  private wallet: VirtualWalletManager;
  private slippageSim = getSlippageSimulator();
  private positionsRepo: ReturnType<typeof createPositionRepository>;
  private tokenMetadataRepo: ReturnType<typeof createTokenMetadataRepository>;
  private config: PaperTradeConfig;

  constructor(config: PaperTradeConfig) {
    this.config = config;
    this.wallet = createVirtualWallet(config.initialSol);
    this.positionsRepo = createPositionRepository(config.db);
    this.tokenMetadataRepo = createTokenMetadataRepository(config.db);
  }

  /**
   * Execute a paper entry (buy tokens with virtual SOL)
   *
   * Flow:
   * 1. Check wallet has enough SOL
   * 2. Get REAL Jupiter quote
   * 3. Calculate SIMULATED slippage
   * 4. Update virtual wallet
   * 5. Store position in database (same schema as live!)
   */
  async executeEntry(
    token: TokenSearchResult,
    tokenMetadata: { decimals: number; symbol: string; score?: number }
  ): Promise<PaperEntryResult> {
    try {
      // 1. Check wallet balance
      if (!this.wallet.hasEnoughSol(this.config.entryAmountSol)) {
        return {
          success: false,
          quotedTokens: 0,
          actualTokens: 0,
          slippageBps: 0,
          entryPriceSol: 0,
          error: `Insufficient SOL: have ${this.wallet.getSolBalance()}, need ${this.config.entryAmountSol}`,
        };
      }

      // 2. Get REAL Jupiter quote
      const quote = await getQuote({
        inputMint: SOL_MINT,
        outputMint: token.address,
        amount: String(Math.floor(this.config.entryAmountSol * LAMPORTS_PER_SOL)),
        slippageBps: this.config.defaultSlippageBps,
      });

      const quotedOutputRaw = quote.outAmount;
      const quotedOutput = Number(quotedOutputRaw) / Math.pow(10, tokenMetadata.decimals);

      // 3. Calculate SIMULATED slippage
      const slippage = await this.slippageSim.calculateSlippage({
        tokenAddress: token.address,
        inputAmountSol: this.config.entryAmountSol,
        liquidity: token.liquidity,
        isBuy: true,
        priceChange1h: token.priceChangeH1,
      });

      // Apply slippage to get actual output
      const slippageMultiplier = 1 - slippage.slippageBps / 10000;
      const actualOutput = quotedOutput * slippageMultiplier;
      const actualOutputRaw = String(Math.floor(actualOutput * Math.pow(10, tokenMetadata.decimals)));

      // 4. Calculate entry price
      const entryPriceSol = this.config.entryAmountSol / actualOutput;

      // 5. Update virtual wallet
      this.wallet.deductSol(this.config.entryAmountSol);
      this.wallet.addTokens(
        token.address,
        tokenMetadata.symbol,
        actualOutputRaw,
        tokenMetadata.decimals,
        entryPriceSol
      );

      // 6. Ensure token metadata exists (for foreign key constraint)
      this.tokenMetadataRepo.getOrCreate(token.address, {
        symbol: tokenMetadata.symbol,
        name: token.name || tokenMetadata.symbol,
        decimals: tokenMetadata.decimals,
      });

      // 7. Store position (same structure as live trading!)
      const positionInput: CreatePositionInput = {
        tokenMint: token.address,
        entrySolSpent: String(Math.floor(this.config.entryAmountSol * LAMPORTS_PER_SOL)),
        entryTimestamp: Date.now(),
        entryPricePerToken: entryPriceSol,
        tokensReceivedRaw: actualOutputRaw, // CRITICAL: Store simulated amount
        tokenDecimals: tokenMetadata.decimals,
        entryScore: tokenMetadata.score ?? token.opportunityScore,
        peakPricePerToken: entryPriceSol,
        peakTimestamp: Date.now(),
      };

      const position = this.positionsRepo.create(positionInput);

      console.log(`\n📝 PAPER ENTRY: ${tokenMetadata.symbol}`);
      console.log(`   Quoted: ${quotedOutput.toFixed(tokenMetadata.decimals)} tokens`);
      console.log(`   Actual (after ${slippage.slippageBps / 100}% slippage): ${actualOutput.toFixed(tokenMetadata.decimals)} tokens`);
      console.log(`   Entry price: ${entryPriceSol.toFixed(8)} SOL per token`);
      console.log(`   Wallet: ${this.wallet.getSolBalance().toFixed(6)} SOL remaining\n`);

      return {
        success: true,
        position,
        quotedTokens: quotedOutput,
        actualTokens: actualOutput,
        slippageBps: slippage.slippageBps,
        entryPriceSol,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Paper entry failed: ${message}`);

      return {
        success: false,
        quotedTokens: 0,
        actualTokens: 0,
        slippageBps: 0,
        entryPriceSol: 0,
        error: message,
      };
    }
  }

  /**
   * Execute a paper exit (sell tokens for virtual SOL)
   *
   * Flow:
   * 1. Check wallet has tokens
   * 2. Get REAL Jupiter quote
   * 3. Calculate SIMULATED slippage
   * 4. Calculate P&L
   * 5. Update virtual wallet
   * 6. Update position in database
   */
  async executeExit(
    position: Position,
    exitReason: string
  ): Promise<PaperExitResult> {
    try {
      // 1. Check wallet has tokens
      const tokenBalance = this.wallet.getTokenBalance(position.tokenMint);
      if (!tokenBalance) {
        return {
          success: false,
          quotedSol: 0,
          actualSol: 0,
          slippageBps: 0,
          pnl: 0,
          pnlPercent: 0,
          exitReason,
          error: `Token ${position.tokenMint} not found in wallet`,
        };
      }

      // 2. Get REAL Jupiter quote
      const quote = await getQuote({
        inputMint: position.tokenMint,
        outputMint: SOL_MINT,
        amount: position.tokensReceivedRaw,
        slippageBps: 300, // Higher slippage for exits
      });

      const quotedSolRaw = quote.outAmount;
      const quotedSol = Number(quotedSolRaw) / LAMPORTS_PER_SOL;

      // 3. Calculate SIMULATED exit slippage
      // Estimate liquidity from position entry
      const estimatedLiquidity = position.entryPricePerToken * Number(position.tokensReceivedRaw) * 100;
      const slippage = await this.slippageSim.calculateSlippage({
        tokenAddress: position.tokenMint,
        inputAmountSol: quotedSol,
        liquidity: estimatedLiquidity,
        isBuy: false, // Selling
      });

      // Apply slippage
      const slippageMultiplier = 1 - slippage.slippageBps / 10000;
      const actualSol = quotedSol * slippageMultiplier;

      // 4. Calculate P&L
      const entrySol = Number(position.entrySolSpent) / LAMPORTS_PER_SOL;
      const pnl = actualSol - entrySol;
      const pnlPercent = (pnl / entrySol) * 100;

      // 5. Update virtual wallet
      this.wallet.removeTokens(position.tokenMint);
      this.wallet.addSol(actualSol);
      this.wallet.recordTrade(pnl);

      // 6. Update position in database
      this.positionsRepo.recordExit(
        position.id,
        String(Math.floor(actualSol * LAMPORTS_PER_SOL)),
        actualSol / Number(position.tokensReceivedRaw),
        exitReason as any
      );

      const emoji = pnl >= 0 ? '🟢' : '🔴';
      const pnlSign = pnl >= 0 ? '+' : '';
      console.log(`\n${emoji} PAPER EXIT: ${tokenBalance.tokenSymbol}`);
      console.log(`   Reason: ${exitReason}`);
      console.log(`   Quoted: ${quotedSol.toFixed(6)} SOL`);
      console.log(`   Actual (after ${slippage.slippageBps / 100}% slippage): ${actualSol.toFixed(6)} SOL`);
      console.log(`   P&L: ${pnlSign}${pnlPercent.toFixed(2)}% (${pnlSign}${pnl.toFixed(6)} SOL)`);
      console.log(`   Wallet: ${this.wallet.getSolBalance().toFixed(6)} SOL\n`);

      return {
        success: true,
        quotedSol,
        actualSol,
        slippageBps: slippage.slippageBps,
        pnl,
        pnlPercent,
        exitReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Paper exit failed: ${message}`);

      return {
        success: false,
        quotedSol: 0,
        actualSol: 0,
        slippageBps: 0,
        pnl: 0,
        pnlPercent: 0,
        exitReason,
        error: message,
      };
    }
  }

  /**
   * Get current wallet state
   */
  getWalletState() {
    return this.wallet.getState();
  }

  /**
   * Get wallet as formatted string
   */
  getWalletSummary(): string {
    return this.wallet.toString();
  }

  /**
   * Get open positions from database
   */
  getOpenPositions(): Position[] {
    return this.positionsRepo.findActive();
  }

  /**
   * Get closed positions from database
   */
  getClosedPositions(): Position[] {
    // Filter for closed positions (those with exitTimestamp)
    return this.positionsRepo.findAll().filter(p => p.state === 'CLOSED');
  }

  /**
   * Get position by ID
   */
  getPosition(id: string): Position | undefined {
    return this.positionsRepo.findById(id);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPaperTradingEngine(config: PaperTradeConfig): PaperTradingEngine {
  return new PaperTradingEngine(config);
}
