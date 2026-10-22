import { Candle } from '../types';

export const Indicators = {
  sma(data: number[], period: number): (number | null)[] {
    const res: (number | null)[] = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      if (i >= period) sum -= data[i - period];
      if (i >= period - 1) res[i] = sum / period;
    }
    return res;
  },

  ema(data: number[], period: number): (number | null)[] {
    const res: (number | null)[] = new Array(data.length).fill(null);
    const k = 2 / (period + 1);
    let prev: number | null = null;
    for (let i = 0; i < data.length; i++) {
      if (prev === null) {
        prev = data[i];
      } else {
        prev = data[i] * k + prev * (1 - k);
      }
      res[i] = prev;
    }
    return res;
  },

  rsi(closes: number[], period = 14): (number | null)[] {
    const n = closes.length;
    const res: (number | null)[] = new Array(n).fill(null);
    if (n <= period) return res;

    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gain += diff;
      else loss -= diff;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;

    res[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      const g = diff > 0 ? diff : 0;
      const l = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      res[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return res;
  },

  macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
    const fastEMA = this.ema(closes, fast);
    const slowEMA = this.ema(closes, slow);
    const macdLine = closes.map((_, i) => {
      const f = fastEMA[i];
      const s = slowEMA[i];
      return f !== null && s !== null ? f - s : 0;
    });
    const signalLine = this.ema(macdLine, signalPeriod);
    const hist = macdLine.map((v, i) => {
      const s = signalLine[i];
      return s !== null ? v - s : 0;
    });
    return { line: macdLine, signal: signalLine, hist };
  },

  atr(candles: Candle[], period = 14): (number | null)[] {
    const n = candles.length;
    if (n === 0) return [];
    const tr: number[] = new Array(n).fill(0);
    tr[0] = Math.max(candles[0].h - candles[0].l, 1e-9);

    for (let i = 1; i < n; i++) {
      const cur = candles[i];
      const prevC = candles[i - 1].c;
      tr[i] = Math.max(cur.h - cur.l, Math.abs(cur.h - prevC), Math.abs(cur.l - prevC));
    }

    // Wilder smoothing
    const res: (number | null)[] = new Array(n).fill(null);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (i < period - 1) {
        sum += tr[i];
      } else if (i === period - 1) {
        sum += tr[i];
        res[i] = sum / period;
      } else {
        const prevAtr = res[i - 1]!;
        res[i] = (prevAtr * (period - 1) + tr[i]) / period;
      }
    }
    return res;
  },

  bollinger(closes: number[], period = 20, multiplier = 2) {
    const mid = this.sma(closes, period);
    const up: (number | null)[] = new Array(closes.length).fill(null);
    const lo: (number | null)[] = new Array(closes.length).fill(null);

    for (let i = period - 1; i < closes.length; i++) {
      const m = mid[i];
      if (m === null) continue;
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSq += Math.pow(closes[j] - m, 2);
      }
      const sd = Math.sqrt(sumSq / period);
      up[i] = m + multiplier * sd;
      lo[i] = m - multiplier * sd;
    }
    return { mid, up, lo };
  },

  stochastic(candles: Candle[], period = 14, kPeriod = 3, dPeriod = 3) {
    const n = candles.length;
    const rawK: (number | null)[] = new Array(n).fill(null);
    const k: (number | null)[] = new Array(n).fill(null);
    const d: (number | null)[] = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
      let high = -Infinity;
      let low = Infinity;
      const start = Math.max(0, i - period + 1);
      for (let j = start; j <= i; j++) {
        if (candles[j].h > high) high = candles[j].h;
        if (candles[j].l < low) low = candles[j].l;
      }
      rawK[i] = high === low ? 50 : ((candles[i].c - low) / (high - low)) * 100;
    }

    // Smooth %K
    for (let i = kPeriod - 1; i < n; i++) {
      let s = 0;
      for (let j = i - kPeriod + 1; j <= i; j++) s += (rawK[j] || 50);
      k[i] = s / kPeriod;
    }

    // %D is SMA of %K
    for (let i = dPeriod - 1; i < n; i++) {
      let s = 0;
      let cnt = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        if (k[j] !== null) {
          s += k[j]!;
          cnt++;
        }
      }
      if (cnt === dPeriod) d[i] = s / dPeriod;
    }
    return { k, d };
  },

  adx(candles: Candle[], period = 14) {
    const n = candles.length;
    const tr: number[] = new Array(n).fill(0);
    const plusDM: number[] = new Array(n).fill(0);
    const minusDM: number[] = new Array(n).fill(0);

    for (let i = 1; i < n; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];
      tr[i] = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
      const up = cur.h - prev.h;
      const down = prev.l - cur.l;
      plusDM[i] = up > down && up > 0 ? up : 0;
      minusDM[i] = down > up && down > 0 ? down : 0;
    }

    const smoothedTR = this.ema(tr, period);
    const smoothedPlus = this.ema(plusDM, period);
    const smoothedMinus = this.ema(minusDM, period);

    const dx: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const sTR = smoothedTR[i];
      if (!sTR) continue;
      const plusDI = (100 * (smoothedPlus[i] || 0)) / sTR;
      const minusDI = (100 * (smoothedMinus[i] || 0)) / sTR;
      const diff = Math.abs(plusDI - minusDI);
      const sum = plusDI + minusDI;
      dx[i] = sum === 0 ? 0 : (100 * diff) / sum;
    }

    const adxValues = this.ema(
      dx.map((v) => v || 0),
      period
    );
    return { adx: adxValues };
  },

  roc(closes: number[], period = 10): (number | null)[] {
    const res: (number | null)[] = new Array(closes.length).fill(null);
    for (let i = period; i < closes.length; i++) {
      const prev = closes[i - period];
      if (prev) res[i] = ((closes[i] - prev) / prev) * 100;
    }
    return res;
  },
};

// -------------------------------------------------------------
// Candlestick Pattern Detection
// -------------------------------------------------------------
export function analyzePatterns(candles: Candle[], index: number) {
  if (index < 2 || index >= candles.length) return [];
  const cur = candles[index];
  const p1 = candles[index - 1];
  const p2 = candles[index - 2];

  const body = Math.abs(cur.c - cur.o);
  const range = Math.max(cur.h - cur.l, 1e-9);
  const upperWick = cur.h - Math.max(cur.o, cur.c);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;
  const isGreen = cur.c >= cur.o;

  const patterns: { name: string; type: 'bullish' | 'bearish' | 'neutral'; description: string }[] = [];

  // 1. Doji
  if (body <= range * 0.1) {
    patterns.push({
      name: 'Doji',
      type: 'neutral',
      description: 'Indecisão extrema do mercado no candle atual.',
    });
  }

  // 2. Hammer (Martelo)
  if (lowerWick >= body * 2 && upperWick <= body * 0.8 && isGreen) {
    patterns.push({
      name: 'Martelo (Hammer)',
      type: 'bullish',
      description: 'Forte rejeição da mínima. Probabilidade de reversão para CALL.',
    });
  }

  // 3. Shooting Star (Estrela Cadente)
  if (upperWick >= body * 2 && lowerWick <= body * 0.8 && !isGreen) {
    patterns.push({
      name: 'Estrela Cadente',
      type: 'bearish',
      description: 'Rejeição de topo forte. Probabilidade de reversão para PUT.',
    });
  }

  // 4. Bullish Engulfing (Engolfo de Alta)
  if (p1.c < p1.o && isGreen && cur.o <= p1.c && cur.c >= p1.o) {
    patterns.push({
      name: 'Engolfo de Alta',
      type: 'bullish',
      description: 'Vela compradora envolve completamente a vela vendedora anterior.',
    });
  }

  // 5. Bearish Engulfing (Engolfo de Baixa)
  if (p1.c > p1.o && !isGreen && cur.o >= p1.c && cur.c <= p1.o) {
    patterns.push({
      name: 'Engolfo de Baixa',
      type: 'bearish',
      description: 'Vela vendedora envolve completamente a vela compradora anterior.',
    });
  }

  // 6. Pin Bar
  if (lowerWick >= body * 2 && upperWick <= body * 1.2) {
    patterns.push({
      name: 'Pin Bar de Alta',
      type: 'bullish',
      description: 'Pavio longo inferior demonstrando absorção compradora.',
    });
  } else if (upperWick >= body * 2 && lowerWick <= body * 1.2) {
    patterns.push({
      name: 'Pin Bar de Baixa',
      type: 'bearish',
      description: 'Pavio longo superior demonstrando absorção vendedora.',
    });
  }

  // 7. Morning Star (Estrela da Manhã)
  if (p2.c < p2.o && Math.abs(p1.c - p1.o) < (p2.h - p2.l) * 0.4 && isGreen && cur.c > (p2.o + p2.c) / 2) {
    patterns.push({
      name: 'Estrela da Manhã',
      type: 'bullish',
      description: 'Padrão triplo clássico de reversão altista.',
    });
  }

  return patterns;
}
