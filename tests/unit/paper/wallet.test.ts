/**
 * Unit Tests: Virtual Wallet
 *
 * Tests the virtual wallet functionality for paper trading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualWalletManager } from '../../../src/paper/wallet';

describe('VirtualWalletManager', () => {
  let wallet: VirtualWalletManager;
  const initialSol = 0.1;

  beforeEach(() => {
    wallet = new VirtualWalletManager(initialSol);
  });

  describe('initialization', () => {
    it('should initialize with given SOL balance', () => {
      expect(wallet.getSolBalance()).toBe(initialSol);
    });

    it('should start with no tokens', () => {
      const state = wallet.getState();
      expect(state.tokens.length).toBe(0);
      expect(state.totalTrades).toBe(0);
      expect(state.totalPnL).toBe(0);
    });
  });

  describe('SOL balance operations', () => {
    it('should check if enough SOL is available', () => {
      expect(wallet.hasEnoughSol(0.05)).toBe(true);
      expect(wallet.hasEnoughSol(0.1)).toBe(true);
      expect(wallet.hasEnoughSol(0.11)).toBe(false);
    });

    it('should deduct SOL from balance', () => {
      wallet.deductSol(0.05);
      expect(wallet.getSolBalance()).toBe(0.05);
    });

    it('should throw when deducting more than available', () => {
      expect(() => wallet.deductSol(0.11)).toThrow('Insufficient SOL balance');
    });

    it('should add SOL to balance', () => {
      wallet.addSol(0.05);
      expect(wallet.getSolBalance()).toBeCloseTo(0.15, 10);
    });
  });

  describe('token operations', () => {
    it('should add tokens to wallet', () => {
      wallet.addTokens('token_address', 'TOKEN', '1000000', 6, 0.01);

      const balance = wallet.getTokenBalance('token_address');
      expect(balance).toBeDefined();
      expect(balance?.tokenAddress).toBe('token_address');
      expect(balance?.tokenSymbol).toBe('TOKEN');
      expect(balance?.rawAmount).toBe('1000000');
      expect(balance?.decimals).toBe(6);
      expect(balance?.entryPrice).toBe(0.01);
    });

    it('should check if token is held', () => {
      wallet.addTokens('token_address', 'TOKEN', '1000000', 6, 0.01);

      expect(wallet.hasToken('token_address')).toBe(true);
      expect(wallet.hasToken('other_token')).toBe(false);
    });

    it('should remove tokens from wallet', () => {
      wallet.addTokens('token_address', 'TOKEN', '1000000', 6, 0.01);

      const removed = wallet.removeTokens('token_address');

      expect(removed).toBeDefined();
      expect(removed?.tokenAddress).toBe('token_address');
      expect(wallet.hasToken('token_address')).toBe(false);
    });

    it('should return null when removing non-existent token', () => {
      const removed = wallet.removeTokens('unknown_token');
      expect(removed).toBeNull();
    });

    it('should get all tokens', () => {
      wallet.addTokens('token_a', 'TOKA', '1000000', 6, 0.01);
      wallet.addTokens('token_b', 'TOKB', '2000000', 6, 0.02);

      const tokens = wallet.getAllTokens();
      expect(tokens.length).toBe(2);
    });

    it('should handle multiple tokens with same address (replace)', () => {
      wallet.addTokens('token_address', 'TOKEN', '1000000', 6, 0.01);
      wallet.addTokens('token_address', 'TOKEN', '2000000', 6, 0.02);

      const balance = wallet.getTokenBalance('token_address');
      expect(balance?.rawAmount).toBe('2000000'); // Should be replaced
    });
  });

  describe('trade tracking', () => {
    it('should record completed trades', () => {
      wallet.recordTrade(0.01);
      wallet.recordTrade(-0.005);
      wallet.recordTrade(0.02);

      const state = wallet.getState();
      expect(state.totalTrades).toBe(3);
      expect(state.totalPnL).toBe(0.025);
    });

    it('should update P&L percent correctly', () => {
      wallet.recordTrade(0.02); // +20% on 0.1 SOL

      const state = wallet.getState();
      expect(state.totalPnL).toBe(0.02);
      expect(state.totalPnLPercent).toBeCloseTo(20, 5);
    });
  });

  describe('wallet state', () => {
    it('should return complete wallet state', () => {
      wallet.addTokens('token_addr', 'TOK', '1000000', 6, 0.01);
      wallet.recordTrade(0.01);

      const state = wallet.getState();
      expect(state.solBalance).toBe(0.1);
      expect(state.tokens.length).toBe(1);
      expect(state.totalTrades).toBe(1);
      expect(state.totalPnL).toBe(0.01);
      expect(state.initialValue).toBe(0.1);
      expect(state.currentValue).toBe(0.11); // 0.1 initial + 0.01 P&L
    });
  });

  describe('reset', () => {
    it('should reset wallet to initial state', () => {
      wallet.deductSol(0.05);
      wallet.addTokens('token_addr', 'TOK', '1000000', 6, 0.01);
      wallet.recordTrade(0.01);

      wallet.reset();

      const state = wallet.getState();
      expect(state.solBalance).toBe(0.1);
      expect(state.tokens.length).toBe(0);
      expect(state.totalTrades).toBe(0);
      expect(state.totalPnL).toBe(0);
    });
  });

  describe('toString', () => {
    it('should format wallet as readable string', () => {
      const str = wallet.toString();

      expect(str).toContain('Virtual Wallet');
      expect(str).toContain('SOL Balance:');
      expect(str).toContain('0.1');
      expect(str).toContain('Tokens Held: 0');
      expect(str).toContain('Total Trades: 0');
    });

    it('should show tokens and trades', () => {
      wallet.addTokens('token_addr', 'TOK', '1000000', 6, 0.01);
      wallet.recordTrade(0.01);

      const str = wallet.toString();

      expect(str).toContain('Tokens Held: 1');
      expect(str).toContain('Total Trades: 1');
      expect(str).toContain('+0.01');
    });
  });
});
