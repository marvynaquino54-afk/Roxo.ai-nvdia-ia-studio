export interface MarketCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const ALLOWED_TIMEFRAMES = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '60m',
  '4h': '60m',
  '1d': '1d',
};

export function sanitizeSymbol(raw: unknown, fallback = 'EURUSD'): string {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9.\-^]/g, '')
    .slice(0, 12);
  return clean || fallback;
}

export function sanitizeTimeframe(raw: unknown): string {
  const value = String(raw || '');
  return ALLOWED_TIMEFRAMES.has(value) ? value : '5m';
}

export function clampLimit(raw: unknown, max = 500, fallback = 160): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(20, Math.round(parsed)));
}

function aggregateCandles(candles: MarketCandle[], bucketMs: number): MarketCandle[] {
  if (candles.length === 0) return [];
  const out: MarketCandle[] = [];
  let current: MarketCandle | null = null;
  let bucket = 0;

  for (const candle of candles) {
    const candleBucket = Math.floor(candle.t / bucketMs) * bucketMs;
    if (!current || candleBucket !== bucket) {
      if (current) out.push(current);
      bucket = candleBucket;
      current = { ...candle, t: candleBucket };
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
      current.v += candle.v;
    }
  }
  if (current) out.push(current);
  return out;
}

export async function fetchYahooCandles(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<{ candles: MarketCandle[]; isForex: boolean }> {
  const cleanSym = sanitizeSymbol(symbol);
  const FIAT_PAIR = /^(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY)$/;
  const isForex = FIAT_PAIR.test(cleanSym);

  const yahooTicker = isForex ? `${cleanSym}=X` : cleanSym;
  const interval = INTERVAL_MAP[sanitizeTimeframe(timeframe)] || '5m';
  const range =
    timeframe === '1m' || timeframe === '5m'
      ? '2d'
      : timeframe === '15m' || timeframe === '30m'
      ? '5d'
      : timeframe === '4h'
      ? '3mo'
      : '1mo';

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooTicker
  )}?interval=${interval}&range=${range}`;

  const response = await fetch(yahooUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance retornou status ${response.status}`);
  }

  const json: any = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error('Formato inesperado dos dados de mercado da Yahoo Finance');
  }

  const timestamps: number[] = result.timestamp;
  const quote = result.indicators.quote[0];
  const opens: number[] = quote.open || [];
  const highs: number[] = quote.high || [];
  const lows: number[] = quote.low || [];
  const closes: number[] = quote.close || [];
  const volumes: number[] = quote.volume || [];

  const digits = isForex ? 5 : 2;
  const candles: MarketCandle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(c) &&
      o > 0 &&
      c > 0
    ) {
      candles.push({
        t: timestamps[i] * 1000,
        o: Number(o.toFixed(digits)),
        h: Number(h.toFixed(digits)),
        l: Number(l.toFixed(digits)),
        c: Number(c.toFixed(digits)),
        v: Number.isFinite(volumes[i]) ? Math.round(volumes[i]) : 0,
      });
    }
  }

  if (candles.length < 5) {
    throw new Error('Velas insuficientes retornadas pelo feed oficial');
  }

  // A Yahoo não oferece H4 nativo: agrupamos 4 velas de 1h em buckets UTC de 4h.
  const finalCandles = timeframe === '4h' ? aggregateCandles(candles, 4 * 60 * 60 * 1000) : candles;

  if (finalCandles.length < 5) {
    throw new Error('Velas H4 insuficientes após agregação');
  }

  return { candles: finalCandles.slice(-limit), isForex };
}
