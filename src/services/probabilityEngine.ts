import { Candle, Setup, SetupRule, FilterConfig } from '../types';
import { Indicators, analyzePatterns } from './indicators';

// -------------------------------------------------------------
// Wilson Score Interval 95%
// -------------------------------------------------------------
export function wilsonInterval(k: number, n: number, z = 1.96): [number, number] {
  if (!n || n <= 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (center - margin) / d), Math.min(1, (center + margin) / d)];
}

// -------------------------------------------------------------
// Default Setups
// -------------------------------------------------------------
export const DEFAULT_SETUPS: Setup[] = [
  {
    id: 's1',
    name: 'Momentum Clássico M5 — EMA 9/21 + RSI',
    dir: 'alta',
    payout: 85,
    timeframe: '5m',
    rules: [
      { id: 'r1', type: 'ema_cross', pol: 'pro', weight: 35, params: { fast: 9, slow: 21, dir: 'alta' } },
      { id: 'r2', type: 'rsi_zone', pol: 'pro', weight: 25, params: { min: 45, max: 70 } },
      { id: 'r3', type: 'adx_strength', pol: 'pro', weight: 20, params: { min: 22 } },
      { id: 'r4', type: 'macd_hist', pol: 'pro', weight: 20, params: { op: 'pos' } },
    ],
  },
  {
    id: 's2',
    name: 'Reversão em Fundo — Bollinger + Pin Bar',
    dir: 'alta',
    payout: 85,
    timeframe: '1m',
    rules: [
      { id: 'r1', type: 'bollinger_break', pol: 'pro', weight: 35, params: { op: 'below' } },
      { id: 'r2', type: 'candlestick_pattern', pol: 'pro', weight: 30, params: { pattern: 'Martelo (Hammer)' } },
      { id: 'r3', type: 'rsi_level', pol: 'pro', weight: 20, params: { op: 'menor', val: 35 } },
      { id: 'r4', type: 'volume_spike', pol: 'pro', weight: 15, params: { mult: 1.2 } },
    ],
  },
  {
    id: 's3',
    name: 'Rompimento Donchian 20 + Volume',
    dir: 'alta',
    payout: 87,
    timeframe: '5m',
    rules: [
      { id: 'r1', type: 'donchian_break', pol: 'pro', weight: 40, params: { len: 20, dir: 'up' } },
      { id: 'r2', type: 'volume_spike', pol: 'pro', weight: 25, params: { mult: 1.5 } },
      { id: 'r3', type: 'adx_strength', pol: 'pro', weight: 20, params: { min: 25 } },
      { id: 'r4', type: 'ema_price', pol: 'pro', weight: 15, params: { len: 50, dir: 'acima' } },
    ],
  },
  {
    id: 's4',
    name: 'Exaustão & Reversão — RSI Sobrecomprado',
    dir: 'baixa',
    payout: 85,
    timeframe: '5m',
    rules: [
      { id: 'r1', type: 'rsi_level', pol: 'pro', weight: 35, params: { op: 'maior', val: 68 } },
      { id: 'r2', type: 'bollinger_break', pol: 'pro', weight: 25, params: { op: 'above' } },
      { id: 'r3', type: 'candlestick_pattern', pol: 'pro', weight: 25, params: { pattern: 'Estrela Cadente' } },
      { id: 'r4', type: 'stoch_cross', pol: 'pro', weight: 15, params: { op: 'kd' } },
    ],
  },
];

export const DEFAULT_FILTERS: FilterConfig[] = [
  { id: 'f_atr', on: true, a: 0.04, b: 3.5, l: 'Volatilidade (ATR % do preço) dentro da faixa' },
  { id: 'f_adx', on: false, a: 18, b: 65, l: 'ADX (Tendência) dentro da faixa operacional' },
  { id: 'f_rsi', on: true, a: 20, b: 80, l: 'RSI sem exaustão extrema (<20 ou >80)' },
  { id: 'f_body', on: true, a: 0.2, b: 0, l: 'Tamanho mínimo do corpo do candle' },
  { id: 'f_sample', on: false, a: 30, b: 0, l: 'Amostra mínima do backtest histórico' },
];

// -------------------------------------------------------------
// Rule Evaluation
// -------------------------------------------------------------
export function evaluateRule(rule: SetupRule, candles: Candle[], idx: number) {
  if (idx < 20 || idx >= candles.length) return { pass: null, text: 'Histórico insuficiente' };
  const cur = candles[idx];
  const closes = candles.slice(0, idx + 1).map((c) => c.c);
  const p = rule.params;

  switch (rule.type) {
    case 'ema_cross': {
      const fast = Indicators.ema(closes, p.fast || 9);
      const slow = Indicators.ema(closes, p.slow || 21);
      const f0 = fast[idx - 1] ?? 0;
      const s0 = slow[idx - 1] ?? 0;
      const f1 = fast[idx] ?? 0;
      const s1 = slow[idx] ?? 0;
      const isUp = f0 <= s0 && f1 > s1;
      const isDn = f0 >= s0 && f1 < s1;
      const pass = p.dir === 'alta' ? isUp : isDn;
      return {
        pass,
        text: `Cruzamento EMA ${p.fast}/${p.slow}: ${pass ? 'Confirmado' : 'Sem cruzamento recente'}`,
      };
    }

    case 'rsi_zone': {
      const rsi = Indicators.rsi(closes, 14)[idx] ?? 50;
      const pass = rsi >= (p.min || 40) && rsi <= (p.max || 70);
      return { pass, text: `RSI(14) = ${rsi.toFixed(1)} (${pass ? 'Dentro' : 'Fora'} da zona ${p.min}-${p.max})` };
    }

    case 'rsi_level': {
      const rsi = Indicators.rsi(closes, 14)[idx] ?? 50;
      const pass = p.op === 'maior' ? rsi > (p.val || 70) : rsi < (p.val || 30);
      return { pass, text: `RSI(14) = ${rsi.toFixed(1)} (${p.op} que ${p.val})` };
    }

    case 'adx_strength': {
      const adxArr = Indicators.adx(candles.slice(0, idx + 1)).adx;
      const adxVal = adxArr[idx] ?? 0;
      const pass = adxVal >= (p.min || 20);
      return { pass, text: `ADX = ${adxVal.toFixed(1)} (mínimo ${p.min})` };
    }

    case 'macd_hist': {
      const hist = Indicators.macd(closes).hist;
      const h = hist[idx] ?? 0;
      const pass = p.op === 'pos' ? h > 0 : h < 0;
      return { pass, text: `MACD Histograma = ${h.toFixed(4)} (${pass ? 'Favorável' : 'Contrário'})` };
    }

    case 'bollinger_break': {
      const bb = Indicators.bollinger(closes, 20, 2);
      const up = bb.up[idx] ?? Infinity;
      const lo = bb.lo[idx] ?? -Infinity;
      let pass = false;
      if (p.op === 'above') pass = cur.c > up;
      else if (p.op === 'below') pass = cur.c < lo;
      else pass = cur.c <= up && cur.c >= lo;
      return { pass, text: `Bollinger: preço ${pass ? 'rompeu/tocou' : 'dentro das'} bandas` };
    }

    case 'volume_spike': {
      const vols = candles.slice(0, idx + 1).map((c) => c.v);
      const vma = Indicators.sma(vols, 20)[idx] ?? 1;
      const ratio = cur.v / (vma || 1);
      const pass = ratio >= (p.mult || 1.3);
      return { pass, text: `Volume = ${ratio.toFixed(2)}x a média de 20 períodos` };
    }

    case 'candlestick_pattern': {
      const patterns = analyzePatterns(candles, idx);
      const pass = patterns.some((pat) => pat.name.toLowerCase().includes((p.pattern || '').toLowerCase()));
      return { pass, text: pass ? `Padrão ${p.pattern} detectado!` : `Sem padrão ${p.pattern}` };
    }

    case 'donchian_break': {
      const len = p.len || 20;
      let hh = -Infinity;
      let ll = Infinity;
      for (let j = idx - len; j < idx; j++) {
        if (candles[j].h > hh) hh = candles[j].h;
        if (candles[j].l < ll) ll = candles[j].l;
      }
      const pass = p.dir === 'up' ? cur.c > hh : cur.c < ll;
      return { pass, text: `Donchian(${len}): ${pass ? 'Rompimento confirmado' : 'Sem rompimento'}` };
    }

    case 'ema_price': {
      const emaVal = Indicators.ema(closes, p.len || 50)[idx] ?? cur.c;
      const pass = p.dir === 'acima' ? cur.c > emaVal : cur.c < emaVal;
      return { pass, text: `Preço ${pass ? 'a favor' : 'contra'} a EMA${p.len}` };
    }

    default:
      return { pass: true, text: 'Regra genérica aprovada' };
  }
}

// -------------------------------------------------------------
// Full Setup Evaluator
// -------------------------------------------------------------
export function evaluateSetupProbabilities(
  setup: Setup,
  candles: Candle[],
  idx: number,
  backtestResult?: { winRate: number; n: number } | null
) {
  if (idx < 20 || idx >= candles.length) {
    return {
      prob: 0.5,
      score: 50,
      conf: 30,
      ev: 0,
      ci: [0.4, 0.6] as [number, number],
      satisfiedCount: 0,
      violatedCount: 0,
      ruleDetails: [],
    };
  }

  let totalWeight = 0;
  let scorePoints = 0;
  let satisfiedCount = 0;
  let violatedCount = 0;

  const ruleDetails = setup.rules.map((rule) => {
    const res = evaluateRule(rule, candles, idx);
    const weight = Math.max(1, rule.weight || 10);
    totalWeight += weight;

    let satisfied = false;
    if (rule.pol === 'pro') satisfied = !!res.pass;
    else if (rule.pol === 'contra') satisfied = !res.pass;
    else satisfied = true;

    if (satisfied) {
      satisfiedCount++;
      scorePoints += weight;
    } else {
      violatedCount++;
      scorePoints -= weight;
    }

    return {
      rule,
      pass: res.pass,
      satisfied,
      text: res.text,
    };
  });

  const normalizedScore = totalWeight > 0 ? Math.max(0, Math.min(100, 50 + (50 * scorePoints) / totalWeight)) : 50;

  // Logistic transformation for probability
  const rawProb = 0.5 + 0.38 * Math.tanh((normalizedScore - 50) / 22);

  // Bayesian blend with historical backtest if available
  let finalProb = rawProb;
  if (backtestResult && backtestResult.n >= 15) {
    const priorWeight = Math.min(0.65, backtestResult.n / 100);
    finalProb = priorWeight * backtestResult.winRate + (1 - priorWeight) * rawProb;
  }
  finalProb = Math.max(0.08, Math.min(0.92, finalProb));

  // Payout and Expectancy for Binary Options
  const payoutDec = (setup.payout || 85) / 100;
  const ev = finalProb * payoutDec - (1 - finalProb);

  // Confidence & Wilson
  const ci =
    backtestResult && backtestResult.n > 0
      ? wilsonInterval(Math.round(backtestResult.winRate * backtestResult.n), backtestResult.n)
      : [Math.max(0, finalProb - 0.12), Math.min(1, finalProb + 0.12)];

  let conf = 35;
  if (candles.length > 100) conf += 25;
  if (backtestResult && backtestResult.n >= 30) conf += 25;
  if (setup.rules.length >= 3) conf += 15;
  conf = Math.min(99, conf);

  return {
    prob: finalProb,
    score: Math.round(normalizedScore),
    conf,
    ev: Number((ev * 100).toFixed(2)),
    ci: [Number(ci[0].toFixed(2)), Number(ci[1].toFixed(2))] as [number, number],
    satisfiedCount,
    violatedCount,
    ruleDetails,
  };
}

// -------------------------------------------------------------
// Backtesting Engine
// -------------------------------------------------------------
export function runHistoricalBacktest(setup: Setup, candles: Candle[]) {
  const n = candles.length;
  if (n < 40) return { n: 0, wins: 0, losses: 0, winRate: 0, ev: 0, ci: [0, 1] as [number, number] };

  const startIdx = Math.max(25, Math.floor(n * 0.25));
  let wins = 0;
  let losses = 0;

  for (let i = startIdx; i < n - 1; i++) {
    // Check if setup triggered
    const evalRes = evaluateSetupProbabilities(setup, candles, i);
    const triggered = evalRes.score >= 58;

    if (triggered) {
      const nextCandle = candles[i + 1];
      const isCall = setup.dir === 'alta';
      const won = isCall ? nextCandle.c > nextCandle.o : nextCandle.c < nextCandle.o;

      if (won) wins++;
      else losses++;
    }
  }

  const total = wins + losses;
  const winRate = total > 0 ? wins / total : 0;
  const payoutDec = (setup.payout || 85) / 100;
  const ev = total > 0 ? winRate * payoutDec - (1 - winRate) : 0;

  return {
    n: total,
    wins,
    losses,
    winRate: Number(winRate.toFixed(3)),
    ev: Number((ev * 100).toFixed(2)),
    ci: wilsonInterval(wins, total),
  };
}

// -------------------------------------------------------------
// Anti-Noise Filter Check
// -------------------------------------------------------------
export function checkFilters(filters: FilterConfig[], candles: Candle[], idx: number) {
  if (idx < 5 || idx >= candles.length) return { passed: true, items: [] };

  const cur = candles[idx];
  const closes = candles.slice(0, idx + 1).map((c) => c.c);
  const items: { label: string; ok: boolean; reason: string }[] = [];

  filters.forEach((f) => {
    if (!f.on) return;

    if (f.id === 'f_atr') {
      const atrVal = Indicators.atr(candles.slice(0, idx + 1))[idx] || 0;
      const atrPct = (atrVal / cur.c) * 100;
      const ok = atrPct >= f.a && atrPct <= f.b;
      items.push({
        label: f.l,
        ok,
        reason: `ATR% = ${atrPct.toFixed(3)}% (limites: ${f.a}% a ${f.b}%)`,
      });
    }

    if (f.id === 'f_rsi') {
      const rsi = Indicators.rsi(closes, 14)[idx] ?? 50;
      const ok = rsi >= f.a && rsi <= f.b;
      items.push({
        label: f.l,
        ok,
        reason: `RSI = ${rsi.toFixed(1)} (segurança: ${f.a} a ${f.b})`,
      });
    }

    if (f.id === 'f_body') {
      const body = Math.abs(cur.c - cur.o);
      const range = Math.max(cur.h - cur.l, 1e-6);
      const ratio = body / range;
      const ok = ratio >= f.a;
      items.push({
        label: f.l,
        ok,
        reason: `Corpo = ${(ratio * 100).toFixed(1)}% da vela (mínimo ${(f.a * 100).toFixed(0)}%)`,
      });
    }
  });

  const passed = items.every((i) => i.ok);
  return { passed, items };
}
