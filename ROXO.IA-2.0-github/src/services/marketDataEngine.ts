import { Candle, MarketType } from '../types';

export interface MarketFeedAudit {
  providerId: string;
  providerName: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  latencyMs: number;
  isReal: boolean;
  status: 'online' | 'connecting' | 'error' | 'blocked';
  errorMessage?: string;
  candleCount: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'crypto' | 'forex' | 'equities' | 'universal';
  requiresKey: boolean;
  keyName?: string;
  websiteUrl: string;
  description: string;
  status: 'active' | 'configured' | 'unconfigured' | 'error';
}

export const SUPPORTED_PROVIDERS: ProviderConfig[] = [
  {
    id: 'binance',
    name: 'Binance Public Vision API',
    type: 'crypto',
    requiresKey: false,
    websiteUrl: 'https://binance.com',
    description: 'Dados públicos de alta frequência para criptomoedas sem necessidade de chave.',
    status: 'active',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance Live v8',
    type: 'universal',
    requiresKey: false,
    websiteUrl: 'https://finance.yahoo.com',
    description: 'Cotações oficiais de Forex global (EUR/USD, GBP/USD) e Ações (AAPL, NVDA, PETR4).',
    status: 'active',
  },
  {
    id: 'mt5',
    name: 'MetaTrader 5 Bridge (MT5)',
    type: 'universal',
    requiresKey: false,
    websiteUrl: 'https://metatrader5.com',
    description: 'Ponte local para conectar candles em tempo real direto da sua corretora ou MetaTrader 5.',
    status: 'configured',
  },
  {
    id: 'twelvedata',
    name: 'Twelve Data API',
    type: 'universal',
    requiresKey: true,
    keyName: 'twelvedata_api_key',
    websiteUrl: 'https://twelvedata.com',
    description: 'API profissional com plano gratuito para Forex, Cripto e Ações mundiais.',
    status: 'unconfigured',
  },
  {
    id: 'finnhub',
    name: 'Finnhub Stock & Forex API',
    type: 'universal',
    requiresKey: true,
    keyName: 'finnhub_api_key',
    websiteUrl: 'https://finnhub.io',
    description: 'Feed institucional em tempo real para ações globais e pares de moedas.',
    status: 'unconfigured',
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    type: 'universal',
    requiresKey: true,
    keyName: 'alphavantage_api_key',
    websiteUrl: 'https://alphavantage.co',
    description: 'Dados históricos e intradiários para mercado financeiro global.',
    status: 'unconfigured',
  },
  {
    id: 'polygon',
    name: 'Polygon.io',
    type: 'universal',
    requiresKey: true,
    keyName: 'polygon_api_key',
    websiteUrl: 'https://polygon.io',
    description: 'Plataforma de dados de alta precisão para ações, opções e forex.',
    status: 'unconfigured',
  },
  {
    id: 'coingecko',
    name: 'CoinGecko API',
    type: 'crypto',
    requiresKey: false,
    websiteUrl: 'https://coingecko.com',
    description: 'Feed de criptoativos descentralizado com endpoints públicos gratuitos.',
    status: 'active',
  },
];

class UniversalMarketDataEngine {
  private latestAudit: MarketFeedAudit = {
    providerId: 'none',
    providerName: 'Aguardando primeira consulta',
    symbol: 'BTCUSDT',
    timeframe: '5m',
    timestamp: Date.now(),
    latencyMs: 0,
    isReal: false,
    status: 'connecting',
    candleCount: 0,
    errorMessage: 'Nenhuma consulta de mercado foi realizada ainda nesta sessão.',
  };

  private listeners: ((audit: MarketFeedAudit) => void)[] = [];

  public getLatestAudit(): MarketFeedAudit {
    return this.latestAudit;
  }

  public onAuditChange(callback: (audit: MarketFeedAudit) => void) {
    this.listeners.push(callback);
    callback(this.latestAudit);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify(audit: MarketFeedAudit) {
    this.latestAudit = audit;
    this.listeners.forEach((l) => l(audit));
  }

  // Key storage helpers
  public getStoredApiKey(keyName: string): string {
    try {
      const keys = JSON.parse(localStorage.getItem('roxoia_api_keys') || '{}');
      return keys[keyName] || '';
    } catch {
      return '';
    }
  }

  public setStoredApiKey(keyName: string, value: string) {
    try {
      const keys = JSON.parse(localStorage.getItem('roxoia_api_keys') || '{}');
      if (value.trim()) {
        keys[keyName] = value.trim();
      } else {
        delete keys[keyName];
      }
      localStorage.setItem('roxoia_api_keys', JSON.stringify(keys));
    } catch {}
  }

  /**
   * Universal candle fetcher - Never generates synthetic or fake data
   */
  public async fetchCandles(
    symbol: string,
    timeframe: string,
    limit = 160,
    marketType: MarketType = 'crypto'
  ): Promise<{ candles: Candle[]; audit: MarketFeedAudit }> {
    const startTime = performance.now();
    const cleanSym = symbol.toUpperCase().replace('/', '').trim();

    // 1. Check if MT5 Bridge has custom local feed active
    const mt5Url = localStorage.getItem('roxoia_mt5_bridge_url');
    if (mt5Url) {
      try {
        const res = await fetch(`${mt5Url}?symbol=${cleanSym}&timeframe=${timeframe}&limit=${limit}`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.candles) && data.candles.length > 5) {
            const audit: MarketFeedAudit = {
              providerId: 'mt5',
              providerName: 'MetaTrader 5 Bridge (MT5 Local)',
              symbol: cleanSym,
              timeframe,
              timestamp: Date.now(),
              latencyMs: Math.round(performance.now() - startTime),
              isReal: true,
              status: 'online',
              candleCount: data.candles.length,
            };
            this.notify(audit);
            return { candles: data.candles, audit };
          }
        }
      } catch {
        // MT5 local bridge not reachable, continue to cloud feeds
      }
    }

    // 2. Check Twelve Data key if configured
    const twelveKey = this.getStoredApiKey('twelvedata_api_key');
    if (twelveKey) {
      try {
        const intervalMap: Record<string, string> = {
          '1m': '1min',
          '5m': '5min',
          '15m': '15min',
          '30m': '30min',
          '1h': '1h',
          '4h': '4h',
          '1d': '1day',
        };
        const interval = intervalMap[timeframe] || '5min';
        const url = `https://api.twelvedata.com/time_series?symbol=${cleanSym}&interval=${interval}&outputsize=${limit}&apikey=${twelveKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const json = await res.json();
          if (json.values && Array.isArray(json.values)) {
            const candles: Candle[] = json.values.reverse().map((v: any) => ({
              t: new Date(v.datetime).getTime(),
              o: parseFloat(v.open),
              h: parseFloat(v.high),
              l: parseFloat(v.low),
              c: parseFloat(v.close),
              v: Number.isFinite(parseFloat(v.volume)) ? parseFloat(v.volume) : 0,
            }));
            const audit: MarketFeedAudit = {
              providerId: 'twelvedata',
              providerName: 'Twelve Data API (Chave Própria)',
              symbol: cleanSym,
              timeframe,
              timestamp: Date.now(),
              latencyMs: Math.round(performance.now() - startTime),
              isReal: true,
              status: 'online',
              candleCount: candles.length,
            };
            this.notify(audit);
            return { candles, audit };
          }
        }
      } catch {}
    }

    // 3. Forex and Equities: Query Real Yahoo Finance v8 (Server Proxy)
    const FIAT_PAIR = /^(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)$/;
    const isForex = marketType === 'forex' || FIAT_PAIR.test(cleanSym);
    const isEquities = marketType === 'equities' || ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'PETR4', 'VALE3'].includes(cleanSym);

    if (isForex || isEquities) {
      try {
        const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(cleanSym)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.candles) && data.candles.length > 5) {
            const audit: MarketFeedAudit = {
              providerId: data.source || 'yahoo',
              providerName: data.providerName || 'Yahoo Finance Live v8',
              symbol: cleanSym,
              timeframe,
              timestamp: Date.now(),
              latencyMs: Math.round(performance.now() - startTime),
              isReal: true,
              status: 'online',
              candleCount: data.candles.length,
            };
            this.notify(audit);
            return { candles: data.candles, audit };
          }
        }
      } catch (err: any) {
        console.warn('Real Yahoo Finance proxy failed', err);
      }
    }

    // 4. Crypto: Query Binance Vision Public API (Real CORS data)
    const bases = ['https://data-api.binance.vision', 'https://api.binance.com'];
    for (const base of bases) {
      try {
        const binanceSym = cleanSym.includes('USDT') ? cleanSym : `${cleanSym}USDT`;
        const url = `${base}/api/v3/klines?symbol=${encodeURIComponent(binanceSym)}&interval=${timeframe}&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 5) {
            const candles: Candle[] = raw.map((k: any) => ({
              t: Number(k[0]),
              o: Number(k[1]),
              h: Number(k[2]),
              l: Number(k[3]),
              c: Number(k[4]),
              v: Number(k[5]),
            }));

            const audit: MarketFeedAudit = {
              providerId: 'binance',
              providerName: 'Binance Public Vision API',
              symbol: binanceSym,
              timeframe,
              timestamp: Date.now(),
              latencyMs: Math.round(performance.now() - startTime),
              isReal: true,
              status: 'online',
              candleCount: candles.length,
            };
            this.notify(audit);
            return { candles, audit };
          }
        }
      } catch {}
    }

    // 5. Fail-Safe: If ALL real providers fail, NEVER return fake candles.
    // Explicitly flag error and block signals to protect the trader.
    const blockedAudit: MarketFeedAudit = {
      providerId: 'disconnected',
      providerName: 'Feed Indisponível',
      symbol: cleanSym,
      timeframe,
      timestamp: Date.now(),
      latencyMs: Math.round(performance.now() - startTime),
      isReal: false,
      status: 'error',
      errorMessage: 'Não foi possível conectar a uma fonte real de mercado. Sinais bloqueados por segurança.',
      candleCount: 0,
    };
    this.notify(blockedAudit);

    throw new Error('SINAIS BLOQUEADOS: Nenhum provedor de dados reais retornou cotações válidas para este ativo.');
  }
}

export const universalMarketData = new UniversalMarketDataEngine();
