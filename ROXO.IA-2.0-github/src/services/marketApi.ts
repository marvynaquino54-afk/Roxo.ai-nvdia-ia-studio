import { Candle, MarketType } from '../types';
import { universalMarketData } from './marketDataEngine';

export const CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'NEARUSDT', 'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'LTCUSDT',
];

export const FOREX_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'EURGBP',
];

export const EQUITIES_SYMBOLS = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN',
];

/**
 * Fetch market candles exclusively from real market providers
 */
export async function fetchMarketCandles(
  symbol: string,
  timeframe: string,
  limit = 160,
  marketType: MarketType = 'crypto'
): Promise<Candle[]> {
  const result = await universalMarketData.fetchCandles(symbol, timeframe, limit, marketType);
  return result.candles;
}
