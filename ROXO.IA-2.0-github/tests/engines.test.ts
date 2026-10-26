import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Candle, Setup, BacktestConfig } from '../src/types/index.ts';
import { runInstitutionalBacktest, DEFAULT_BACKTEST_CONFIG } from '../src/services/backtestEngine.ts';
import { Indicators } from '../src/services/indicators.ts';
import {
  wilsonInterval,
  evaluateRule,
  evaluateSetupProbabilities,
  runHistoricalBacktest,
  checkFilters,
} from '../src/services/probabilityEngine.ts';

function makeCandles(
  n: number,
  mode: 'up' | 'down' | 'flat',
  start = 100
): Candle[] {
  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    let open = price;
    let close = price;
    if (mode === 'up') close = price + 1;
    if (mode === 'down') close = price - 1;
    candles.push({
      t: 1_700_000_000_000 + i * 300_000,
      o: open,
      h: Math.max(open, close) + 0.2,
      l: Math.min(open, close) - 0.2,
      c: close,
      v: 1000,
    });
    price = close;
  }
  return candles;
}

const alwaysSetup: Setup = {
  id: 'test_always',
  name: 'Setup de teste (sempre ativo)',
  dir: 'alta',
  payout: 85,
  rules: [
    {
      id: 'r1',
      type: 'rsi_zone',
      pol: 'pro',
      weight: 100,
      params: { min: -1, max: 101 },
    },
  ],
};

const putSetup: Setup = { ...alwaysSetup, id: 'test_put', dir: 'baixa' };

function config(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    ...DEFAULT_BACKTEST_CONFIG,
    symbol: 'TESTCASE',
    timeframe: '5m',
    initialCapital: 1000,
    payout: 85,
    stakeType: 'percent',
    stakeValue: 2,
    expirationCandles: 1,
    minScoreThreshold: 58,
    tieAction: 'refund',
    ...overrides,
  };
}

describe('Backtest institucional', () => {
  it('não opera com menos de 40 velas', () => {
    const result = runInstitutionalBacktest(alwaysSetup, makeCandles(39, 'up'), config());
    assert.equal(result.trades.length, 0);
    assert.equal(result.metrics.totalTrades, 0);
    assert.equal(result.metrics.netPnL, 0);
    assert.equal(result.candlesAnalyzed, 39);
  });

  it('entra na abertura seguinte e sai no fechamento da expiração de 1 vela', () => {
    const candles = makeCandles(60, 'up');
    const result = runInstitutionalBacktest(alwaysSetup, candles, config({ expirationCandles: 1 }));

    assert.ok(result.trades.length > 0);
    for (const trade of result.trades) {
      assert.equal(trade.entryPrice, candles[trade.index + 1].o);
      assert.equal(trade.exitPrice, candles[trade.index + 1].c);
      assert.equal(trade.result, 'WIN');
      assert.equal(trade.pnl, Number((trade.stake * 0.85).toFixed(2)));
    }
    assert.equal(result.metrics.winRate, 100);
    assert.equal(result.metrics.losses, 0);
    assert.equal(result.metrics.profitFactor, Infinity);
    assert.ok(result.metrics.netPnL > 0);
    assert.ok(result.metrics.wilsonConfidenceInterval[0] > 0);
  });

  it('respeita expiração de 3 velas e não sobrepõe operações', () => {
    const candles = makeCandles(80, 'up');
    const result = runInstitutionalBacktest(
      alwaysSetup,
      candles,
      config({ expirationCandles: 3 })
    );

    assert.ok(result.trades.length > 0);
    for (let i = 0; i < result.trades.length; i++) {
      const trade = result.trades[i];
      assert.equal(trade.entryPrice, candles[trade.index + 1].o);
      assert.equal(trade.exitPrice, candles[trade.index + 3].c);
      assert.equal(trade.expirationCandles, 3);
      if (i > 0) {
        assert.ok(
          trade.index >= result.trades[i - 1].index + 3,
          'a próxima operação deve começar após a expiração da anterior'
        );
      }
    }
  });

  it('marca WIN em PUT quando o preço cai', () => {
    const result = runInstitutionalBacktest(putSetup, makeCandles(60, 'down'), config());
    assert.ok(result.trades.length > 0);
    assert.ok(result.trades.every((t) => t.direction === 'PUT' && t.result === 'WIN'));
    assert.ok(result.metrics.netPnL > 0);
  });

  it('devolve a stake em empate com tieAction=refund', () => {
    const result = runInstitutionalBacktest(
      alwaysSetup,
      makeCandles(60, 'flat'),
      config({ tieAction: 'refund' })
    );

    assert.ok(result.trades.length > 0);
    assert.ok(result.trades.every((t) => t.result === 'EMPATE' && t.pnl === 0));
    assert.equal(result.metrics.netPnL, 0);
    assert.equal(result.metrics.expectancy, 0);
    assert.equal(result.metrics.maxDrawdown, 0);
    assert.equal(result.metrics.winRate, 0);
    assert.ok(Math.abs(result.metrics.breakEvenWinRate - 54.05) < 0.01);
  });

  it('conta empate como perda com tieAction=loss e break-even de 100%', () => {
    const result = runInstitutionalBacktest(
      alwaysSetup,
      makeCandles(60, 'flat'),
      config({ tieAction: 'loss' })
    );

    assert.ok(result.trades.length > 0);
    assert.ok(result.trades.every((t) => t.result === 'EMPATE' && t.pnl < 0));
    assert.ok(result.metrics.netPnL < 0);
    assert.equal(result.metrics.breakEvenWinRate, 100);
  });

  it('aplica stake percentual sobre o saldo e nunca fica abaixo de 1', () => {
    const result = runInstitutionalBacktest(alwaysSetup, makeCandles(60, 'up'), config());
    assert.ok(result.trades.length > 2);
    assert.equal(result.trades[0].stake, 20);
    for (const trade of result.trades) {
      const balanceBefore = trade.balanceAfter - trade.pnl;
      const expected = Math.max(1, Math.round(balanceBefore * 0.02 * 100) / 100);
      assert.equal(trade.stake, expected);
    }
  });

  it('encerra a sessão quando a banca zera', () => {
    const result = runInstitutionalBacktest(
      alwaysSetup,
      makeCandles(60, 'down'),
      config({ stakeType: 'fixed', stakeValue: 1000 })
    );

    assert.equal(result.trades.length, 1);
    assert.equal(result.trades[0].result, 'LOSS');
    assert.equal(result.metrics.netPnL, -1000);
    assert.equal(result.metrics.roiPct, -100);
  });

  it('ignora velas com preço inválido em vez de operar', () => {
    const candles = makeCandles(60, 'up');
    candles[30].o = 0;
    const result = runInstitutionalBacktest(alwaysSetup, candles, config({ expirationCandles: 1 }));

    assert.ok(result.trades.every((t) => Number.isFinite(t.entryPrice) && t.entryPrice > 0));
    assert.ok(!result.trades.some((t) => t.index === 29), 'entrada na vela inválida deve ser descartada');
  });
});

describe('Motor de probabilidade e regras', () => {
  it('bloqueia regra desconhecida e neutraliza o sinal', () => {
    const setup: Setup = {
      ...alwaysSetup,
      rules: [{ id: 'x', type: 'regra_inexistente', pol: 'pro', weight: 100, params: {} }],
    };
    const res = evaluateSetupProbabilities(setup, makeCandles(60, 'up'), 30);
    assert.equal(res.hasBlockedRules, true);
    assert.ok(res.score <= 42);
    assert.equal(res.prob, 0.5);
    assert.equal(res.ev, 0);
    assert.equal(res.isMathematicallyViable, false);
    assert.equal(res.conf, 10);
  });

  it('retorna texto de bloqueio para regra desconhecida', () => {
    const res = evaluateRule(
      { id: 'x', type: 'regra_inexistente', pol: 'pro', weight: 10, params: {} },
      makeCandles(60, 'up'),
      30
    );
    assert.equal(res.pass, false);
    assert.match(res.text, /desconhecida|inválida/i);
  });

  it('não inventa cruzamento de EMA/SMA sem histórico', () => {
    const candles = makeCandles(60, 'up');
    const emaRes = evaluateRule(
      { id: 'e', type: 'ema_cross', pol: 'pro', weight: 10, params: { fast: 9, slow: 21, dir: 'alta' } },
      candles,
      20
    );
    assert.equal(emaRes.pass, false);
    assert.match(emaRes.text, /histórico insuficiente/i);

    const smaRes = evaluateRule(
      { id: 's', type: 'sma_cross', pol: 'pro', weight: 10, params: { fast: 10, slow: 50, dir: 'alta' } },
      candles,
      20
    );
    assert.equal(smaRes.pass, false);
    assert.match(smaRes.text, /histórico insuficiente/i);
  });

  it('não avalia setups antes do aquecimento mínimo', () => {
    const res = evaluateSetupProbabilities(alwaysSetup, makeCandles(60, 'up'), 10);
    assert.equal(res.score, 50);
    assert.equal(res.prob, 0.5);
    assert.equal(res.ruleDetails.length, 0);
  });

  it('backtest rápido sem sobreposição usa o candle seguinte', () => {
    const res = runHistoricalBacktest(alwaysSetup, makeCandles(60, 'up'));
    assert.ok(res.n > 0);
    assert.equal(res.losses, 0);
    assert.equal(res.winRate, 1);
    assert.equal(res.ev, 85);
  });

  it('backtest rápido não roda com menos de 40 velas', () => {
    const res = runHistoricalBacktest(alwaysSetup, makeCandles(39, 'up'));
    assert.equal(res.n, 0);
    assert.deepEqual(res.ci, [0, 1]);
  });

  it('filtros passam quando não há filtros ativos', () => {
    const res = checkFilters([], makeCandles(60, 'up'), 30);
    assert.equal(res.passed, true);
    assert.equal(res.items.length, 0);
  });

  it('suporte e resistência não inventam níveis sem histórico', () => {
    const sr = Indicators.supportResistance(makeCandles(60, 'up'), 5, 30);
    assert.equal(sr.nearestSupport, null);
    assert.equal(sr.nearestResistance, null);
  });
});

describe('Indicadores técnicos', () => {
  it('SMA calcula apenas com janela completa', () => {
    assert.deepEqual(Indicators.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  });

  it('EMA é semeada pela SMA e retorna nulo antes do período', () => {
    const ema = Indicators.ema([1, 2, 3, 4, 5], 3);
    assert.equal(ema[0], null);
    assert.equal(ema[1], null);
    assert.equal(ema[2], 2);
    assert.equal(ema[4], 4);
  });

  it('RSI fica em 100 em alta constante e em 0 em queda constante', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const down = Array.from({ length: 40 }, (_, i) => 100 - i);
    assert.equal(Indicators.rsi(up, 14)[39], 100);
    assert.equal(Indicators.rsi(down, 14)[39], 0);
    assert.equal(Indicators.rsi(up, 14)[13], null);
  });

  it('RSI permanece entre 0 e 100 em série oscilante', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const rsi = Indicators.rsi(closes, 14);
    for (const value of rsi) {
      if (value !== null) {
        assert.ok(value >= 0 && value <= 100);
      }
    }
  });

  it('ADX retorna nulo até 2×período e fica entre 0 e 100', () => {
    const candles = makeCandles(80, 'up');
    const { adx } = Indicators.adx(candles, 14);
    for (let i = 0; i < 27; i++) assert.equal(adx[i], null);
    assert.ok(adx[27] !== null);
    for (const value of adx) {
      if (value !== null) assert.ok(value >= 0 && value <= 100);
    }
  });

  it('Estocástico só existe com janelas completas e fica entre 0 e 100', () => {
    const candles = makeCandles(40, 'up');
    const { k, d } = Indicators.stochastic(candles, 14, 3, 3);
    for (let i = 0; i < 15; i++) assert.equal(k[i], null);
    assert.ok(k[15] !== null);
    for (let i = 0; i < 17; i++) assert.equal(d[i], null);
    assert.ok(d[17] !== null);
    for (const value of k) {
      if (value !== null) assert.ok(value >= 0 && value <= 100);
    }
  });

  it('MACD é nulo até haver slow EMA e sinal completos', () => {
    const closes = new Array(60).fill(50);
    const { line, signal, hist } = Indicators.macd(closes, 12, 26, 9);
    assert.equal(line[24], null);
    assert.equal(line[25], 0);
    assert.equal(signal[32], null);
    assert.equal(signal[33], 0);
    assert.equal(hist[33], 0);
  });

  it('Bollinger colapsa em série constante', () => {
    const closes = new Array(40).fill(50);
    const bb = Indicators.bollinger(closes, 20, 2);
    assert.equal(bb.mid[19], 50);
    assert.equal(bb.up[19], 50);
    assert.equal(bb.lo[19], 50);
  });

  it('ATR usa suavização de Wilder e começa no período', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      t: i * 60000,
      o: 100.5,
      h: 101,
      l: 100,
      c: 100.5,
      v: 1000,
    }));
    const atr = Indicators.atr(candles, 14);
    assert.equal(atr[12], null);
    assert.equal(atr[13], 1);
    assert.equal(atr[29], 1);
  });
});

describe('Intervalo de confiança de Wilson', () => {
  it('50/100 produz intervalo em torno de 50%', () => {
    const [lo, hi] = wilsonInterval(50, 100);
    assert.ok(lo < 0.5 && hi > 0.5);
    assert.ok(Math.abs(lo - 0.4038) < 0.001);
    assert.ok(Math.abs(hi - 0.5962) < 0.001);
  });

  it('amostra vazia retorna [0,1]', () => {
    assert.deepEqual(wilsonInterval(0, 0), [0, 1]);
    assert.deepEqual(wilsonInterval(0, -3), [0, 1]);
  });

  it('não ultrapassa os limites 0 e 1', () => {
    const [lo, hi] = wilsonInterval(100, 100);
    assert.ok(lo >= 0 && hi <= 1);
  });
});
