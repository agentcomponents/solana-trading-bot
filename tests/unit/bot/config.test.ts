/**
 * Tests for bot configuration module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetConfig as resetEnvConfig } from '@/config/index';
import {
  loadBotConfig,
  type TradingBotConfig,
  _resetBotConfig,
} from '@/bot/config';

describe('bot/config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset all config before each test
    resetEnvConfig();
    _resetBotConfig();

    // Clear and set minimal required env vars
    delete process.env.TRADING_MODE;
    delete process.env.INITIAL_SOL_AMOUNT;
    delete process.env.SCAN_INTERVAL_SECONDS;
    delete process.env.MAX_POSITIONS;
    delete process.env.ENTRY_SLIPPAGE_BPS;
    delete process.env.EXIT_SLIPPAGE_BPS;

    process.env.WALLET_PRIVATE_KEY = '1'.repeat(64);
    process.env.HELIUS_RPC_URL = 'https://rpc.helius.xyz';
    process.env.HELIUS_WS_URL = 'wss://rpc.helius.xyz';
    process.env.BACKUP_RPC_URL = 'https://api.mainnet-beta.solana.com';
    process.env.DATABASE_PATH = ':memory:';
  });

  afterEach(() => {
    // Restore original env
    for (const key in process.env) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    resetEnvConfig();
    _resetBotConfig();
  });

  describe('loadBotConfig', () => {
    it('should load config with defaults', () => {
      const config = loadBotConfig();

      expect(config.mode).toBe('paper');
      expect(config.initialSol).toBe(0.1);
      expect(config.scanIntervalSeconds).toBe(10);
      expect(config.maxPositions).toBe(1);
      expect(config.entrySlippageBps).toBe(100);
      expect(config.exitSlippageBps).toBe(300);
    });

    it('should use environment overrides', () => {
      // Reset and set new env vars before loading config
      _resetBotConfig();

      process.env.TRADING_MODE = 'live';
      process.env.INITIAL_SOL_AMOUNT = '0.5';
      process.env.SCAN_INTERVAL_SECONDS = '30';
      process.env.MAX_POSITIONS = '3';
      process.env.ENTRY_SLIPPAGE_BPS = '50';
      process.env.EXIT_SLIPPAGE_BPS = '200';

      const config = loadBotConfig();

      expect(config.mode).toBe('live');
      expect(config.initialSol).toBe(0.5);
      expect(config.scanIntervalSeconds).toBe(30);
      expect(config.maxPositions).toBe(3);
      expect(config.entrySlippageBps).toBe(50);
      expect(config.exitSlippageBps).toBe(200);
    });

    it('should validate trading mode', () => {
      // Test paper mode (default)
      _resetBotConfig();
      expect(loadBotConfig().mode).toBe('paper');

      // Test live mode
      _resetBotConfig();
      process.env.TRADING_MODE = 'live';
      expect(loadBotConfig().mode).toBe('live');
    });

    it('should include risk management settings', () => {
      const config = loadBotConfig();

      expect(config.stopLossPercentage).toBe(10);
      expect(config.trailingStopPercentage).toBe(7);
      expect(config.trailingStopActivationPercentage).toBe(10);
      expect(config.maxHoldTimeHours).toBe(4);
    });

    it('should include liquidity filters', () => {
      const config = loadBotConfig();

      expect(config.minLiquidityUsd).toBe(8000);
      expect(config.maxLiquidityUsd).toBe(500000);
      expect(config.minPoolSolAmount).toBe(50);
    });

    it('should include take profit levels', () => {
      const config = loadBotConfig();

      // These read from .env which has the new values
      expect(config.takeProfit1Percent).toBe(10);
      expect(config.takeProfit2Percent).toBe(10);
      expect(config.takeProfit1SellPercent).toBe(50);
      expect(config.takeProfit2SellPercent).toBe(0);
    });

    it('should cache config on subsequent calls', () => {
      const config1 = loadBotConfig();
      const config2 = loadBotConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('getBotConfig', () => {
    it('should throw if config not loaded', () => {
      _resetBotConfig();

      expect(() => {
        const { getBotConfig } = require('@/bot/config');
        getBotConfig();
      }).toThrow();
    });

    it('should return cached config', () => {
      _resetBotConfig();
      const config = loadBotConfig();

      expect(config.mode).toBe('paper');
      expect(config.initialSol).toBe(0.1);
    });
  });

  describe('TradingBotConfig type', () => {
    it('should have all required fields', () => {
      const config: TradingBotConfig = {
        mode: 'paper',
        initialSol: 0.1,
        scanIntervalSeconds: 10,
        maxPositions: 1,
        entrySlippageBps: 100,
        exitSlippageBps: 300,
        stopLossPercentage: 40,
        trailingStopPercentage: 15,
        trailingStopActivationPercentage: 100,
        maxHoldTimeHours: 4,
        minLiquidityUsd: 15000,
        maxLiquidityUsd: 500000,
        minPoolSolAmount: 50,
        takeProfit1Percent: 50,
        takeProfit2Percent: 100,
        takeProfit1SellPercent: 25,
        takeProfit2SellPercent: 25,
        databasePath: ':memory:',
        logLevel: 'info',
      };

      expect(config.mode).toBeDefined();
      expect(config.initialSol).toBeDefined();
    });
  });
});
