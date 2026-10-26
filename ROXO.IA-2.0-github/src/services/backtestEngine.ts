import { Candle, Setup, BacktestConfig, BacktestTrade, BacktestRunResult, BacktestMetrics, EquityPoint } from '../types';
import { evaluateSetupProbabilities, wilsonInterval } from './probabilityEngine';

/**
 * Marcação a mercado do backtest (binárias):
 * - O sinal é avaliado no fechamento da vela i (sem olhar velas futuras).
 * - A entrada ocorre na ABERTURA da vela i+1 (sem lookahead).
 * - A saída ocorre no FECHAMENTO da vela i+expiry (expiração em 1, 2 ou 3 velas).
 * - Nunca há sobreposição de operações.
 */

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  candleCount: 250,
  payout: 85,
  initialCapital: 1000,
  stakeType: 'percent',
  stakeValue: 2, // 2% per trade
  expirationCandles: 1, // Next-candle expiry
  minScoreThreshold: 58, // Minimum confluence score to trigger entry
  tieAction: 'refund', // Return stake on exact tie
};

export function runInstitutionalBacktest(
  setup: Setup,
  candles: Candle[],
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG
): BacktestRunResult {
  const n = candles.length;
  const initialCap = Math.max(config.initialCapital || 1000, 10);
  const expiry = Math.max(config.expirationCandles || 1, 1);
  const payout = config.payout || setup.payout || 85;
  const payoutDec = payout / 100;
  const minScore = config.minScoreThreshold || 58;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [
    {
      tradeNum: 0,
      timestamp: candles[0]?.t || Date.now(),
      balance: initialCap,
      drawdown: 0,
      drawdownPct: 0,
      pnl: 0,
      result: 'START',
    },
  ];

  if (n < 40) {
    // Insufficient candles to run statistically valid backtest
    const zeroMetrics = calculateMetrics(trades, initialCap, initialCap, payout, 0, 0, config.tieAction);
    return {
      config,
      setup,
      metrics: zeroMetrics,
      trades: [],
      equityCurve,
      candlesAnalyzed: n,
      executedAt: new Date().toLocaleString('pt-BR'),
    };
  }

  let runningBalance = initialCap;
  let peakBalance = initialCap;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  // Warmup period for indicators (at least 25 candles to establish moving averages & oscillators)
  const startIdx = Math.max(25, Math.floor(n * 0.15));
  const endIdx = n - 1 - expiry;

  let lastTradeExitIdx = -1; // Prevents overlapping duplicate entries on same bar if desired

  for (let i = startIdx; i <= endIdx; i++) {
    // Enforce no overlap: wait until previous expiry finishes before opening next trade
    if (i <= lastTradeExitIdx) continue;

    const evalRes = evaluateSetupProbabilities(setup, candles, i);

    // Filter by confluence score threshold
    if (evalRes.score < minScore) continue;

    // Determine signal direction
    let dir: 'CALL' | 'PUT';
    if (setup.dir === 'alta') {
      dir = 'CALL';
    } else if (setup.dir === 'baixa') {
      dir = 'PUT';
    } else {
      // Setup dir 'qualquer': pick direction based on probability score
      dir = evalRes.prob >= 0.5 ? 'CALL' : 'PUT';
    }

    const signalCandle = candles[i];
    const entryCandle = candles[i + 1];
    const exitCandle = candles[i + expiry];

    // Reject corrupted candles instead of trading on invalid prices
    if (
      !signalCandle ||
      !Number.isFinite(signalCandle.c) ||
      signalCandle.c <= 0 ||
      !Number.isFinite(entryCandle?.o) ||
      (entryCandle?.o ?? 0) <= 0 ||
      !Number.isFinite(exitCandle?.c) ||
      (exitCandle?.c ?? 0) <= 0
    ) {
      continue;
    }

    const entryPrice = entryCandle.o;
    const exitPrice = exitCandle.c;

    // Calculate stake amount
    let stake = 0;
    if (config.stakeType === 'percent') {
      const pct = Math.min(Math.max(config.stakeValue || 2, 0.5), 50) / 100;
      stake = Math.max(1, Math.round(runningBalance * pct * 100) / 100);
    } else {
      stake = Math.min(Math.max(config.stakeValue || 20, 1), runningBalance);
    }

    // Evaluate Win / Loss / Empate
    let result: 'WIN' | 'LOSS' | 'EMPATE' = 'LOSS';
    let pnl = 0;

    if (dir === 'CALL') {
      if (exitPrice > entryPrice) {
        result = 'WIN';
        pnl = Number((stake * payoutDec).toFixed(2));
      } else if (exitPrice < entryPrice) {
        result = 'LOSS';
        pnl = -stake;
      } else {
        result = 'EMPATE';
        pnl = config.tieAction === 'refund' ? 0 : -stake;
      }
    } else {
      // PUT
      if (exitPrice < entryPrice) {
        result = 'WIN';
        pnl = Number((stake * payoutDec).toFixed(2));
      } else if (exitPrice > entryPrice) {
        result = 'LOSS';
        pnl = -stake;
      } else {
        result = 'EMPATE';
        pnl = config.tieAction === 'refund' ? 0 : -stake;
      }
    }

    runningBalance = Number((runningBalance + pnl).toFixed(2));
    if (runningBalance < 0) runningBalance = 0;

    // Track peak & drawdown
    if (runningBalance > peakBalance) {
      peakBalance = runningBalance;
    }
    const currentDrawdown = peakBalance - runningBalance;
    const currentDrawdownPct = peakBalance > 0 ? (currentDrawdown / peakBalance) * 100 : 0;

    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
    if (currentDrawdownPct > maxDrawdownPct) maxDrawdownPct = currentDrawdownPct;

    const tradeItem: BacktestTrade = {
      id: `bt_${i}_${Date.now()}`,
      index: i,
      timestamp: signalCandle.t,
      timeStr: new Date(signalCandle.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: dir,
      entryPrice,
      exitPrice,
      expirationCandles: expiry,
      result,
      stake,
      payout,
      pnl,
      balanceAfter: runningBalance,
      drawdownAfter: Number(currentDrawdownPct.toFixed(2)),
      score: evalRes.score,
      confluences: evalRes.ruleDetails.filter((r) => r.satisfied).map((r) => r.text),
    };

    trades.push(tradeItem);

    equityCurve.push({
      tradeNum: trades.length,
      timestamp: exitCandle.t,
      balance: runningBalance,
      drawdown: Number(currentDrawdown.toFixed(2)),
      drawdownPct: Number(currentDrawdownPct.toFixed(2)),
      pnl,
      result,
    });

    // The trade occupies candles i+1 .. i+expiry; the next entry candle must come after i+expiry
    lastTradeExitIdx = i + expiry - 1;
    if (runningBalance <= 0) break; // Bankroll bust
  }

  const metrics = calculateMetrics(
    trades,
    initialCap,
    runningBalance,
    payout,
    maxDrawdown,
    maxDrawdownPct,
    config.tieAction
  );

  return {
    config,
    setup,
    metrics,
    trades,
    equityCurve,
    candlesAnalyzed: n,
    executedAt: new Date().toLocaleString('pt-BR'),
  };
}

function calculateMetrics(
  trades: BacktestTrade[],
  initialCap: number,
  finalCap: number,
  payout: number,
  maxDrawdown: number = 0,
  maxDrawdownPct: number = 0,
  tieAction: 'refund' | 'loss' = 'refund'
): BacktestMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.result === 'WIN').length;
  const losses = trades.filter((t) => t.result === 'LOSS').length;
  const ties = trades.filter((t) => t.result === 'EMPATE').length;

  // Win rate always counts resolved (non-tie) trades, as documented in the UI.
  const validTrades = wins + losses;
  const winRate = validTrades > 0 ? (wins / validTrades) * 100 : 0;
  const tieRate = totalTrades > 0 ? ties / totalTrades : 0;

  // Break-even win rate:
  // - ties refunded: 100 / (100 + payout)
  // - ties counted as losses: 10000 / ((100 + payout) * (1 - tieRate)) among non-tie trades
  const breakEvenWinRate =
    tieAction === 'loss' && tieRate > 0
      ? tieRate >= 1
        ? 100
        : Number((10000 / ((100 + payout) * (1 - tieRate))).toFixed(2))
      : Number(((100 / (100 + payout)) * 100).toFixed(2));
  const mathematicalEdge = Number((winRate - breakEvenWinRate).toFixed(2));

  let grossProfit = 0;
  let grossLoss = 0;
  let currentWins = 0;
  let currentLosses = 0;
  let maxConsecWins = 0;
  let maxConsecLosses = 0;

  // Per-trade return on bankroll (pnl / balance before the trade) for the Sharpe estimate
  const returns: number[] = [];

  trades.forEach((t) => {
    const balanceBefore = t.balanceAfter - t.pnl;
    returns.push(balanceBefore > 0 ? t.pnl / balanceBefore : 0);

    if (t.pnl > 0) {
      grossProfit += t.pnl;
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxConsecWins) maxConsecWins = currentWins;
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxConsecLosses) maxConsecLosses = currentLosses;
    } else {
      currentWins = 0;
      currentLosses = 0;
    }
  });

  const netPnL = Number((finalCap - initialCap).toFixed(2));
  const roiPct = initialCap > 0 ? Number(((netPnL / initialCap) * 100).toFixed(2)) : 0;

  // Profit Factor: Infinity (never 99.99) when there are no losses and some profit.
  let profitFactor = 0;
  if (grossLoss > 0) {
    profitFactor = Number((grossProfit / grossLoss).toFixed(2));
  } else if (grossProfit > 0) {
    profitFactor = Infinity;
  }

  // Expectancy per trade ($): exact average PnL across all executed trades,
  // so ties refunded count as neutral and ties booked as loss count as loss.
  const expectancy =
    totalTrades > 0
      ? Number((trades.reduce((acc, t) => acc + t.pnl, 0) / totalTrades).toFixed(2))
      : 0;

  // "Sharpe" estimate: mean / standard deviation of per-trade bankroll returns.
  // Not annualized (trades are not evenly spaced in time) and not a guarantee of future results.
  let sharpeRatio = 0;
  if (returns.length > 2) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpeRatio = Number((mean / stdDev).toFixed(2));
    }
  }

  const wilsonCi = wilsonInterval(wins, validTrades);

  return {
    totalTrades,
    wins,
    losses,
    ties,
    winRate: Number(winRate.toFixed(2)),
    breakEvenWinRate,
    mathematicalEdge,
    expectancy,
    profitFactor,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    netPnL,
    roiPct,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    consecutiveWins: currentWins,
    consecutiveLosses: currentLosses,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
    sharpeRatio,
    wilsonConfidenceInterval: wilsonCi,
  };
}
