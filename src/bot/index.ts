/**
 * Bot Module
 *
 * Main bot orchestrator and configuration.
 */

export {
  loadBotConfig,
  getBotConfig,
  getEnvConfig,
  isPaperTrading,
  isLiveTrading,
  _resetBotConfig,
  type TradingBotConfig,
  type TradingMode,
} from './config';

export {
  TradingBot,
  createTradingBot,
  type TradingBotOptions,
  type TradingBotStatus,
} from './orchestrator';
