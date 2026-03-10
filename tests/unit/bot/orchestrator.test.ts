/**
 * Tests for main bot orchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetConfig as resetEnvConfig, validateConfig } from '@/config/index';
import { _resetBotConfig, loadBotConfig } from '@/bot/config';
import {
  TradingBot,
  createTradingBot,
  type TradingBotOptions,
  type TradingBotStatus,
} from '@/bot/orchestrator';

describe('bot/orchestrator', () => {
  beforeEach(() => {
    resetEnvConfig();
    vi.clearAllMocks();

    // Set minimal required env vars
    process.env.WALLET_PRIVATE_KEY = '1'.repeat(64);
    process.env.HELIUS_RPC_URL = 'https://rpc.helius.xyz';
    process.env.HELIUS_WS_URL = 'wss://rpc.helius.xyz';
    process.env.BACKUP_RPC_URL = 'https://backup.rpc.com';
    process.env.DATABASE_PATH = ':memory:';
    process.env.TRADING_MODE = 'paper';

    // Initialize config properly
    validateConfig();
    loadBotConfig();
  });

  afterEach(() => {
    resetEnvConfig();
    vi.restoreAllMocks();
  });

  describe('TradingBot', () => {
    // Mock database with all required methods
    const mockDb = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
        run: vi.fn(() => ({ lastInsertRowid: 1 })),
      })),
      exec: vi.fn(),
      pragma: vi.fn(() => ({})),
      close: vi.fn(),
      pragma: vi.fn(),
    } as any;

    it('should create a bot instance', () => {
      const options: TradingBotOptions = {
        db: mockDb,
      };

      const bot = new TradingBot(options);

      expect(bot).toBeDefined();
      expect(bot.isRunning()).toBe(false);
    });

    it('should get initial status', () => {
      const options: TradingBotOptions = {
        db: mockDb,
      };

      const bot = new TradingBot(options);
      const status = bot.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.mode).toBe('paper');
      expect(status.activePositions).toBe(0);
      expect(status.totalTrades).toBe(0);
    });

    it('should update status after starting', async () => {
      const options: TradingBotOptions = {
        db: mockDb,
      };

      const bot = new TradingBot(options);

      // Mock the scan loop
      vi.spyOn(bot as any, 'runMainLoop').mockResolvedValue(undefined);

      await bot.start();

      expect(bot.isRunning()).toBe(true);

      await bot.stop();

      expect(bot.isRunning()).toBe(false);
    });
  });

  describe('createTradingBot', () => {
    it('should create bot with default options', () => {
      const bot = createTradingBot({
        db: {} as any,
      });

      expect(bot).toBeDefined();
      expect(bot instanceof TradingBot).toBe(true);
    });
  });

  describe('TradingBotStatus', () => {
    it('should have all required fields', () => {
      const status: TradingBotStatus = {
        isRunning: false,
        mode: 'paper',
        startTime: 0,
        activePositions: 0,
        totalTrades: 0,
        scanCount: 0,
        lastScanTime: 0,
        walletSol: 0,
      };

      expect(status.isRunning).toBeDefined();
      expect(status.mode).toBe('paper');
      expect(status.activePositions).toBe(0);
    });
  });
});
