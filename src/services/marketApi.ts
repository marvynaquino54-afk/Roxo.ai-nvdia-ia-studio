import { Candle, MarketType } from '../types';

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

export async function fetchMarketCandles(
  symbol: string,
  timeframe: string,
  limit = 200,
  marketType: MarketType = 'crypto'
): Promise<Candle[]> {
  const sym = symbol.toUpperCase().replace('/', '');

  // 1. Forex or Equities: query server endpoint
  if (marketType === 'forex' || marketType === 'equities' || FOREX_SYMBOLS.includes(sym) || EQUITIES_SYMBOLS.includes(sym)) {
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.candles) && data.candles.length > 0) {
        return data.candles;
      }
    } catch (err) {
      console.warn('Failed to fetch from market candles API, falling back...', err);
    }
  }

  // 2. Crypto: query Binance Vision (CORS enabled)
  const bases = ['https://data-api.binance.vision', 'https://api.binance.com'];
  let lastError: any = null;

  for (const base of bases) {
    try {
      const cleanSym = sym.includes('USDT') ? sym : `${sym}USDT`;
      const url = `${base}/api/v3/klines?symbol=${encodeURIComponent(cleanSym)}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (Array.isArray(raw)) {
        return raw.map((k: any) => ({
          t: Number(k[0]),
          o: Number(k[1]),
          h: Number(k[2]),
          l: Number(k[3]),
          c: Number(k[4]),
          v: Number(k[5]),
        }));
      }
    } catch (err) {
      lastError = err;
    }
  }

  // 3. Fallback: query internal synthetic feed if binance fails or is blocked
  try {
    const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`);
    const data = await res.json();
    if (data.candles) return data.candles;
  } catch {}

  throw lastError || new Error('Não foi possível obter os dados do ativo selecionado.');
}

// -------------------------------------------------------------
// Image & Screenshot Candle Detector (Canvas Vision)
// -------------------------------------------------------------
export function detectCandlesFromImage(canvas: HTMLCanvasElement): Candle[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const W = canvas.width;
  const H = canvas.height;
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Find green and red pixel clusters
  const mask = new Uint8Array(W * H);
  const colors = new Uint8Array(W * H); // 1 = green, 2 = red

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (g > r + 24 && g > b + 12) {
        mask[y * W + x] = 1;
        colors[y * W + x] = 1;
      } else if (r > g + 24 && r > b + 12) {
        mask[y * W + x] = 1;
        colors[y * W + x] = 2;
      }
    }
  }

  // Scan columns for candles
  const colHits = new Int32Array(W);
  const minY = new Int32Array(W).fill(-1);
  const maxY = new Int32Array(W).fill(-1);

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (mask[y * W + x]) {
        colHits[x]++;
        if (minY[x] < 0) minY[x] = y;
        maxY[x] = y;
      }
    }
  }

  // Group columns into candle bars
  const groups: { x0: number; x1: number }[] = [];
  let currentGroup: { x0: number; x1: number } | null = null;

  for (let x = 0; x < W; x++) {
    if (colHits[x] >= 3) {
      if (!currentGroup) currentGroup = { x0: x, x1: x };
      else currentGroup.x1 = x;
    } else {
      if (currentGroup && x - currentGroup.x1 > 1) {
        groups.push(currentGroup);
        currentGroup = null;
      }
    }
  }
  if (currentGroup) groups.push(currentGroup);

  const validGroups = groups.filter((g) => g.x1 - g.x0 >= 1);
  if (validGroups.length < 3) return [];

  const candles: Candle[] = [];
  const now = Date.now();

  validGroups.forEach((g, idx) => {
    let topY = Infinity;
    let botY = -Infinity;
    let greenCount = 0;
    let redCount = 0;

    for (let x = g.x0; x <= g.x1; x++) {
      if (minY[x] >= 0) topY = Math.min(topY, minY[x]);
      if (maxY[x] >= 0) botY = Math.max(botY, maxY[x]);

      for (let y = Math.max(0, topY); y <= Math.min(H - 1, botY); y++) {
        const c = colors[y * W + x];
        if (c === 1) greenCount++;
        else if (c === 2) redCount++;
      }
    }

    const isBullish = greenCount >= redCount;
    const priceHigh = H - topY;
    const priceLow = H - botY;
    const bodyHeight = (priceHigh - priceLow) * 0.7;

    const open = isBullish ? priceLow + (priceHigh - priceLow - bodyHeight) / 2 : priceHigh - (priceHigh - priceLow - bodyHeight) / 2;
    const close = isBullish ? open + bodyHeight : open - bodyHeight;

    candles.push({
      t: now - (validGroups.length - idx) * 60000,
      o: Number(open.toFixed(2)),
      h: Number(priceHigh.toFixed(2)),
      l: Number(priceLow.toFixed(2)),
      c: Number(close.toFixed(2)),
      v: greenCount + redCount,
    });
  });

  return candles;
}
