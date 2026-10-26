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

  // EMA clássica: semeada pela SMA dos primeiros `period` valores (nada é calculado antes de haver histórico).
  ema(data: number[], period: number): (number | null)[] {
    const res: (number | null)[] = new Array(data.length).fill(null);
    if (period <= 0 || data.length < period) return res;
    const k = 2 / (period + 1);
    let seed = 0;
    for (let i = 0; i < period; i++) seed += data[i];
    let prev = seed / period;
    res[period - 1] = prev;
    for (let i = period; i < data.length; i++) {
      prev = data[i] * k + prev * (1 - k);
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
    const line: (number | null)[] = closes.map((_, i) => {
      const f = fastEMA[i];
      const s = slowEMA[i];
      return f !== null && s !== null ? f - s : null;
    });

    const signal: (number | null)[] = new Array(closes.length).fill(null);
    const hist: (number | null)[] = new Array(closes.length).fill(null);
    const firstValid = line.findIndex((v) => v !== null);

    if (firstValid >= 0) {
      const values = line.slice(firstValid) as number[];
      const sig = this.ema(values, signalPeriod);
      sig.forEach((v, j) => {
        if (v === null) return;
        const idx = firstValid + j;
        signal[idx] = v;
        hist[idx] = (line[idx] as number) - v;
      });
    }

    return { line, signal, hist };
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

    for (let i = period - 1; i < n; i++) {
      let high = -Infinity;
      let low = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (candles[j].h > high) high = candles[j].h;
        if (candles[j].l < low) low = candles[j].l;
      }
      rawK[i] = high === low ? 50 : ((candles[i].c - low) / (high - low)) * 100;
    }

    // %K = SMA(rawK) — only once a full window of rawK exists
    for (let i = period - 1 + kPeriod - 1; i < n; i++) {
      let s = 0;
      for (let j = i - kPeriod + 1; j <= i; j++) s += rawK[j] as number;
      k[i] = s / kPeriod;
    }

    // %D = SMA(%K)
    for (let i = 0; i < n; i++) {
      if (k[i] === null) continue;
      let s = 0;
      let ok = true;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        if (j < 0 || k[j] === null) {
          ok = false;
          break;
        }
        s += k[j] as number;
      }
      if (ok) d[i] = s / dPeriod;
    }
    return { k, d };
  },

  // ADX clássico (Wilder): +DM/-DM e TR suavizados por soma de Wilder; DX suavizado para ADX.
  // O array retorna null até existir histórico suficiente (2 × period velas).
  adx(candles: Candle[], period = 14) {
    const n = candles.length;
    const adxRes: (number | null)[] = new Array(n).fill(null);
    if (period <= 0 || n < period * 2 + 1) return { adx: adxRes };

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

    let trS = 0;
    let pS = 0;
    let mS = 0;
    for (let i = 1; i <= period; i++) {
      trS += tr[i];
      pS += plusDM[i];
      mS += minusDM[i];
    }

    const dx: (number | null)[] = new Array(n).fill(null);
    const computeDx = (): number => {
      if (trS <= 0) return 0;
      const plusDI = (100 * pS) / trS;
      const minusDI = (100 * mS) / trS;
      const sum = plusDI + minusDI;
      return sum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / sum;
    };

    dx[period] = computeDx();

    for (let i = period + 1; i < n; i++) {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + plusDM[i];
      mS = mS - mS / period + minusDM[i];
      dx[i] = computeDx();
    }

    // Seed do ADX: média dos primeiros `period` valores de DX (de `period` até `2*period-1`)
    let dxSum = 0;
    for (let i = period; i < period * 2; i++) dxSum += dx[i] as number;
    let adxPrev = dxSum / period;
    adxRes[period * 2 - 1] = adxPrev;

    for (let i = period * 2; i < n; i++) {
      adxPrev = (adxPrev * (period - 1) + (dx[i] as number)) / period;
      adxRes[i] = adxPrev;
    }

    return { adx: adxRes };
  },

  // -------------------------------------------------------------
  // Dynamic Support & Resistance Clusters (Pivot Highs & Lows)
  // -------------------------------------------------------------
  supportResistance(candles: Candle[], idx: number, lookback = 30) {
    if (idx < 10) return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null, nearSupport: false, nearResistance: false };
    const start = Math.max(0, idx - lookback);
    const slice = candles.slice(start, idx + 1);
    const cur = candles[idx];

    const swingHighs: number[] = [];
    const swingLows: number[] = [];

    // Pivot detection (2 bars left, 2 bars right)
    for (let i = 2; i < slice.length - 2; i++) {
      const c = slice[i];
      if (c.h > slice[i - 1].h && c.h > slice[i - 2].h && c.h > slice[i + 1].h && c.h > slice[i + 2].h) {
        swingHighs.push(c.h);
      }
      if (c.l < slice[i - 1].l && c.l < slice[i - 2].l && c.l < slice[i + 1].l && c.l < slice[i + 2].l) {
        swingLows.push(c.l);
      }
    }

    const supports = swingLows.filter((l) => l <= cur.c).sort((a, b) => b - a);
    const resistances = swingHighs.filter((h) => h >= cur.c).sort((a, b) => a - b);

    const nearestSupport = supports[0] ?? null;
    const nearestResistance = resistances[0] ?? null;

    // Tolerance: 0.15% to 0.35% of current price or within lower/upper wick
    const tol = cur.c * 0.003;
    const nearSupport = nearestSupport !== null && (cur.l <= nearestSupport + tol && cur.c >= nearestSupport - tol);
    const nearResistance = nearestResistance !== null && (cur.h >= nearestResistance - tol && cur.c <= nearestResistance + tol);

    return {
      supports,
      resistances,
      nearestSupport,
      nearestResistance,
      nearSupport,
      nearResistance,
    };
  },

  // -------------------------------------------------------------
  // Pullback Validation (Reteste em Média Móvel ou Suporte Rompido)
  // -------------------------------------------------------------
  checkPullback(candles: Candle[], idx: number, emaPeriod = 21, dir: 'alta' | 'baixa' = 'alta') {
    if (idx < emaPeriod + 5) return { isPullback: false, reason: 'Histórico insuficiente' };
    const closes = candles.slice(0, idx + 1).map((c) => c.c);
    const emaVals = this.ema(closes, emaPeriod);
    const emaNow = emaVals[idx];
    const emaPrev = emaVals[idx - 1];
    if (emaNow === null || emaPrev === null) return { isPullback: false, reason: 'EMA indisponível' };

    const cur = candles[idx];
    const prev = candles[idx - 1];

    if (dir === 'alta') {
      const trendingUp = emaNow >= emaPrev && prev.c >= emaPrev * 0.998;
      // Low reached or pierced EMA, but closed above EMA
      const touchedEma = cur.l <= emaNow * 1.002;
      const closedAbove = cur.c >= emaNow;
      const rejectedWick = (Math.min(cur.o, cur.c) - cur.l) >= (cur.h - cur.l) * 0.35;
      const pass = trendingUp && touchedEma && closedAbove && rejectedWick;
      return {
        isPullback: pass,
        reason: pass
          ? `Pullback de Alta confirmado na EMA${emaPeriod}: rejeição com pavio inferior e fechamento acima da média`
          : `Sem pullback de alta na EMA${emaPeriod}`,
      };
    } else {
      const trendingDown = emaNow <= emaPrev && prev.c <= emaPrev * 1.002;
      const touchedEma = cur.h >= emaNow * 0.998;
      const closedBelow = cur.c <= emaNow;
      const rejectedWick = (cur.h - Math.max(cur.o, cur.c)) >= (cur.h - cur.l) * 0.35;
      const pass = trendingDown && touchedEma && closedBelow && rejectedWick;
      return {
        isPullback: pass,
        reason: pass
          ? `Pullback de Baixa confirmado na EMA${emaPeriod}: rejeição com pavio superior e fechamento abaixo da média`
          : `Sem pullback de baixa na EMA${emaPeriod}`,
      };
    }
  },

  // -------------------------------------------------------------
  // Breakout vs False Breakout (Rompimento Real vs Armadilha/Trap)
  // -------------------------------------------------------------
  checkBreakout(candles: Candle[], idx: number, lookback = 20) {
    if (idx < lookback + 2) return { isBreakout: false, isFalseBreakout: false, type: 'none', reason: 'Histórico insuficiente' };
    const cur = candles[idx];
    const rangeCandles = candles.slice(idx - lookback, idx);
    let hh = -Infinity;
    let ll = Infinity;

    rangeCandles.forEach((c) => {
      if (c.h > hh) hh = c.h;
      if (c.l < ll) ll = c.l;
    });

    const body = Math.abs(cur.c - cur.o);
    const range = Math.max(cur.h - cur.l, 1e-9);
    const bodyPct = body / range;

    // Volume confirmation
    const vols = candles.slice(0, idx + 1).map((c) => c.v);
    const volMa = (this.sma(vols, 20)[idx] ?? 1) || 1;
    const volSurge = cur.v >= volMa * 1.15;

    // True Bull Breakout: Close cleanly above previous 20-candle HH with solid body and volume
    if (cur.c > hh && bodyPct >= 0.5 && volSurge) {
      return {
        isBreakout: true,
        isFalseBreakout: false,
        type: 'bull_breakout',
        reason: `Rompimento de Alta Válido: Fechou acima da máxima dos últimos ${lookback} candles (${hh.toFixed(2)}) com volume ${(cur.v / volMa).toFixed(2)}x a média`,
      };
    }

    // True Bear Breakout: Close cleanly below previous 20-candle LL with solid body and volume
    if (cur.c < ll && bodyPct >= 0.5 && volSurge) {
      return {
        isBreakout: true,
        isFalseBreakout: false,
        type: 'bear_breakout',
        reason: `Rompimento de Baixa Válido: Fechou abaixo da mínima dos últimos ${lookback} candles (${ll.toFixed(2)}) com volume ${(cur.v / volMa).toFixed(2)}x a média`,
      };
    }

    // False Bull Breakout (Bull Trap): High breached HH, but closed back inside with rejection
    const upperWick = cur.h - Math.max(cur.o, cur.c);
    if (cur.h > hh && cur.c <= hh && upperWick >= range * 0.45) {
      return {
        isBreakout: false,
        isFalseBreakout: true,
        type: 'bull_trap',
        reason: `Falso Rompimento de Alta (Bull Trap): Superou a máxima (${hh.toFixed(2)}) mas rejeitou com pavio de ${(upperWick / range * 100).toFixed(0)}%`,
      };
    }

    // False Bear Breakout (Bear Trap): Low pierced LL, but closed back above with rejection
    const lowerWick = Math.min(cur.o, cur.c) - cur.l;
    if (cur.l < ll && cur.c >= ll && lowerWick >= range * 0.45) {
      return {
        isBreakout: false,
        isFalseBreakout: true,
        type: 'bear_trap',
        reason: `Falso Rompimento de Baixa (Bear Trap): Rompeu a mínima (${ll.toFixed(2)}) mas voltou fechando dentro com pavio de ${(lowerWick / range * 100).toFixed(0)}%`,
      };
    }

    return { isBreakout: false, isFalseBreakout: false, type: 'none', reason: 'Preço dentro da faixa de consolidação' };
  },

  // -------------------------------------------------------------
  // RSI Classic Divergence (Regular Bullish & Bearish)
  // -------------------------------------------------------------
  checkRsiDivergence(candles: Candle[], idx: number, rsiPeriod = 14, lookback = 25) {
    if (idx < rsiPeriod + lookback) return { divergence: 'none', reason: 'Amostra insuficiente' };
    const closes = candles.slice(0, idx + 1).map((c) => c.c);
    const rsiVals = this.rsi(closes, rsiPeriod);
    const rsiCur = rsiVals[idx] ?? 50;

    // Look for pivot low/high in candles and RSI
    let minPriceIdx = idx;
    let minPriceVal = candles[idx].l;
    let maxPriceIdx = idx;
    let maxPriceVal = candles[idx].h;

    for (let j = idx - 1; j >= idx - lookback; j--) {
      if (candles[j].l < minPriceVal) {
        minPriceVal = candles[j].l;
        minPriceIdx = j;
      }
      if (candles[j].h > maxPriceVal) {
        maxPriceVal = candles[j].h;
        maxPriceIdx = j;
      }
    }

    const cur = candles[idx];

    // Bullish Divergence: Price making lower or equal low, but RSI making higher low (< 38 zone)
    if (idx - minPriceIdx >= 5 && cur.l <= minPriceVal * 1.002) {
      const pastRsi = rsiVals[minPriceIdx] ?? 50;
      if (rsiCur > pastRsi + 3 && rsiCur < 42) {
        return {
          divergence: 'bullish',
          reason: `Divergência de Alta no RSI(14): Preço renovando mínimas enquanto RSI sobe de ${pastRsi.toFixed(1)} para ${rsiCur.toFixed(1)}`,
        };
      }
    }

    // Bearish Divergence: Price making higher or equal high, but RSI making lower high (> 62 zone)
    if (idx - maxPriceIdx >= 5 && cur.h >= maxPriceVal * 0.998) {
      const pastRsi = rsiVals[maxPriceIdx] ?? 50;
      if (rsiCur < pastRsi - 3 && rsiCur > 58) {
        return {
          divergence: 'bearish',
          reason: `Divergência de Baixa no RSI(14): Preço renovando máximas enquanto RSI cai de ${pastRsi.toFixed(1)} para ${rsiCur.toFixed(1)}`,
        };
      }
    }

    return { divergence: 'none', reason: 'Sem divergência evidente' };
  },

  // -------------------------------------------------------------
  // Bollinger Squeeze & Volatility Compression
  // -------------------------------------------------------------
  bollingerSqueeze(closes: number[], idx: number, period = 20) {
    if (idx < period + 15) return { isSqueezed: false, bandwidth: 0, reason: 'Histórico insuficiente' };
    const bb = this.bollinger(closes, period, 2);
    const m = bb.mid[idx];
    const u = bb.up[idx];
    const l = bb.lo[idx];
    if (m === null || u === null || l === null || m === 0) return { isSqueezed: false, bandwidth: 0, reason: 'BB indisponível' };

    const curBw = (u - l) / m;
    let minBw = Infinity;
    for (let j = idx - 15; j < idx; j++) {
      const mj = bb.mid[j];
      const uj = bb.up[j];
      const lj = bb.lo[j];
      if (mj && uj && lj && mj !== 0) {
        const bw = (uj - lj) / mj;
        if (bw < minBw) minBw = bw;
      }
    }

    const isSqueezed = curBw <= minBw * 1.05;
    return {
      isSqueezed,
      bandwidth: Number(curBw.toFixed(4)),
      reason: isSqueezed
        ? `Bollinger Squeeze Ativo: Compressão de volatilidade estreita (${(curBw * 100).toFixed(2)}%), iminência de explosão direcional`
        : `Volatilidade normal das bandas (${(curBw * 100).toFixed(2)}%)`,
    };
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
