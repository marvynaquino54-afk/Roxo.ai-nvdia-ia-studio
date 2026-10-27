import React, { useState, useEffect } from 'react';
import { Setup, Candle, BacktestConfig, BacktestRunResult, BacktestTrade } from '../types';
import { fetchMarketCandlesDetailed } from '../services/marketApi';
import { runInstitutionalBacktest, DEFAULT_BACKTEST_CONFIG } from '../services/backtestEngine';
import { EquityCurveChart } from './EquityCurveChart';
import {
  Play,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Percent,
  DollarSign,
  Award,
  RefreshCw,
  Copy,
  Check,
  Download,
  BarChart3,
  Sliders,
  ChevronRight,
  Eye,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface BacktestTabProps {
  setups: Setup[];
  activeSetup: Setup;
  onSelectSetup: (s: Setup) => void;
  candles: Candle[];
  symbol: string;
  timeframe: string;
}

export const BacktestTab: React.FC<BacktestTabProps> = ({
  setups,
  activeSetup,
  onSelectSetup,
  candles: parentCandles,
  symbol: parentSymbol,
  timeframe: parentTimeframe,
}) => {
  // Configuration state
  const [config, setConfig] = useState<BacktestConfig>({
    symbol: parentSymbol || 'BTCUSDT',
    timeframe: parentTimeframe || '5m',
    candleCount: 250,
    payout: activeSetup.payout || 85,
    initialCapital: 1000,
    stakeType: 'percent',
    stakeValue: 2,
    expirationCandles: 1,
    minScoreThreshold: 58,
    tieAction: 'refund',
  });

  const [loading, setLoading] = useState(false);
  const [backtestData, setBacktestData] = useState<BacktestRunResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [selectedTrade, setSelectedTrade] = useState<BacktestTrade | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<{
    kind: 'fresh' | 'parent';
    providerName: string;
    candleCount: number;
    isReal: boolean;
    note?: string;
  } | null>(null);

  // Sync payout when activeSetup changes
  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      payout: activeSetup.payout || 85,
    }));
  }, [activeSetup]);

  // Reaproveita as velas já carregadas no gráfico (dados reais) enquanto não houver busca nova
  useEffect(() => {
    if (!parentCandles || parentCandles.length < 40) return;
    const effectiveConfig = {
      ...config,
      symbol: parentSymbol || config.symbol,
      timeframe: parentTimeframe || config.timeframe,
    };
    const result = runInstitutionalBacktest(activeSetup, parentCandles, effectiveConfig);
    setBacktestData(result);
    setSelectedTrade(result.trades.length > 0 ? result.trades[0] : null);
    setDataSource({
      kind: 'parent',
      providerName: 'Gráfico atual (feed real já carregado)',
      candleCount: parentCandles.length,
      isReal: true,
      note: 'Execução automática com as velas do gráfico. Use "Rodar Backtest" para buscar um histórico novo.',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentCandles, activeSetup.id]);

  const handleRunBacktest = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Busca exclusiva em provedores reais; nunca gera candles sintéticos
      const detail = await fetchMarketCandlesDetailed(
        config.symbol,
        config.timeframe,
        config.candleCount
      );

      if (detail.candles.length >= 40) {
        const result = runInstitutionalBacktest(activeSetup, detail.candles, config);
        setBacktestData(result);
        setSelectedTrade(result.trades.length > 0 ? result.trades[0] : null);
        setDataSource({
          kind: 'fresh',
          providerName: detail.providerName,
          candleCount: detail.candles.length,
          isReal: detail.isReal,
        });
        return;
      }

      const reason = `${detail.providerName} retornou ${detail.candles.length} velas (mínimo 40).`;
      if (parentCandles && parentCandles.length >= 40) {
        const result = runInstitutionalBacktest(activeSetup, parentCandles, config);
        setBacktestData(result);
        setSelectedTrade(result.trades.length > 0 ? result.trades[0] : null);
        setDataSource({
          kind: 'parent',
          providerName: 'Gráfico atual (fallback)',
          candleCount: parentCandles.length,
          isReal: true,
          note: reason,
        });
        setLoadError(`Não foi possível usar o histórico novo: ${reason} O resultado abaixo usa as velas já carregadas no gráfico.`);
      } else {
        setBacktestData(null);
        setSelectedTrade(null);
        setDataSource(null);
        setLoadError(`${reason} Não há velas suficientes no gráfico para o fallback. Nenhum resultado foi gerado.`);
      }
    } catch (e: any) {
      const message = e?.message || 'Falha desconhecida ao buscar dados reais.';
      if (parentCandles && parentCandles.length >= 40) {
        const result = runInstitutionalBacktest(activeSetup, parentCandles, config);
        setBacktestData(result);
        setSelectedTrade(result.trades.length > 0 ? result.trades[0] : null);
        setDataSource({
          kind: 'parent',
          providerName: 'Gráfico atual (fallback)',
          candleCount: parentCandles.length,
          isReal: true,
          note: message,
        });
        setLoadError(`A busca de histórico novo falhou: ${message} O resultado abaixo usa as velas já carregadas no gráfico.`);
      } else {
        setBacktestData(null);
        setSelectedTrade(null);
        setDataSource(null);
        setLoadError(`${message} Nenhum resultado foi gerado (sem velas suficientes para o fallback).`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (preset: 'conservador' | 'scalping' | 'agressivo') => {
    if (preset === 'conservador') {
      setConfig((prev) => ({
        ...prev,
        timeframe: '15m',
        stakeType: 'percent',
        stakeValue: 1.5,
        expirationCandles: 1,
        minScoreThreshold: 62,
        initialCapital: 1500,
      }));
    } else if (preset === 'scalping') {
      setConfig((prev) => ({
        ...prev,
        timeframe: '1m',
        stakeType: 'percent',
        stakeValue: 2,
        expirationCandles: 1,
        minScoreThreshold: 58,
        initialCapital: 1000,
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        stakeType: 'percent',
        stakeValue: 4,
        expirationCandles: 1,
        minScoreThreshold: 55,
        initialCapital: 1000,
      }));
    }
  };

  const handleCopyReport = () => {
    if (!backtestData) return;
    const m = backtestData.metrics;
    const c = backtestData.config;
    const text = `=== RELATÓRIO INSTITUCIONAL DE BACKTEST — ROXO.IA ===
Estratégia: ${backtestData.setup.name}
Ativo / Timeframe: ${c.symbol} (${c.timeframe})
Amostra: ${backtestData.candlesAnalyzed} velas analisadas | Operações: ${m.totalTrades}
Data de Execução: ${backtestData.executedAt}

MÉTRICAS QUANTITATIVAS:
• Taxa de Acerto (Win Rate): ${m.winRate}% (Vitórias: ${m.wins} | Derrotas: ${m.losses} | Empates: ${m.ties})
• Break-Even Necessário (Payout ${c.payout}%): ${m.breakEvenWinRate}%
• Vantagem Matemática (Edge): ${m.mathematicalEdge >= 0 ? '+' : ''}${m.mathematicalEdge}%
• Fator de Lucro (Profit Factor): ${Number.isFinite(m.profitFactor) ? m.profitFactor : '∞ (sem perdas)'}
• Lucro Líquido: ${m.netPnL >= 0 ? '+$' : '-$'}${Math.abs(m.netPnL)} (ROI: ${m.roiPct}%)
• Expectativa Matemática (EV/Trade): ${m.expectancy >= 0 ? '+$' : '-$'}${Math.abs(m.expectancy)}
• Drawdown Máximo: $${m.maxDrawdown} (${m.maxDrawdownPct}%)
• Maior Sequência Vencedora: ${m.maxConsecutiveWins} trades
• Maior Sequência Perdedora: ${m.maxConsecutiveLosses} trades
• Sharpe Estimado por Operação (não anualizado): ${m.sharpeRatio}
• Intervalo de Confiança Wilson 95%: [${(m.wilsonConfidenceInterval[0] * 100).toFixed(1)}% - ${(m.wilsonConfidenceInterval[1] * 100).toFixed(1)}%]

Metodologia: sinal no fechamento da vela; entrada na abertura da vela seguinte; saída no fechamento da expiração. Sem lookahead.
Plataforma: ROXO.IA PRO QUANT`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportCsv = () => {
    if (!backtestData || backtestData.trades.length === 0) return;
    const headers = 'ID,DataHora,Direcao,Entrada,Saida,ExpiracaoVelas,Resultado,Stake,Payout,PnL,SaldoApos,DrawdownPct,Score\n';
    const rows = backtestData.trades
      .map(
        (t) =>
          `${t.id},"${t.timeStr}",${t.direction},${t.entryPrice},${t.exitPrice},${t.expirationCandles},${t.result},${t.stake},${t.payout},${t.pnl},${t.balanceAfter},${t.drawdownAfter},${t.score}`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `backtest_${backtestData.config.symbol}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const breakEvenPayout = Number((100 / (100 + config.payout) * 100).toFixed(2));
  const filteredTrades =
    backtestData?.trades.filter((t) => {
      if (tradeFilter === 'ALL') return true;
      return t.result === tradeFilter;
    }) || [];

  return (
    <div className="space-y-4">
      {/* Top Controls & Configuration Card */}
      <div className="bg-[#120a28]/85 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-violet-500/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                Backtest Profissional & Motor de Simulação
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Vela por Vela (Sem Lookahead)
                </span>
              </h2>
              <p className="text-xs text-violet-400">
                Teste quantitativo em dados reais de mercado com payout binário, curva de patrimônio e controle de risco.
              </p>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-violet-400 text-[11px] mr-1 hidden sm:inline">Presets:</span>
            <button
              onClick={() => handleApplyPreset('conservador')}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 text-[11px] font-semibold transition-all"
            >
              Conservador
            </button>
            <button
              onClick={() => handleApplyPreset('scalping')}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 text-[11px] font-semibold transition-all"
            >
              Scalping M1
            </button>
            <button
              onClick={() => handleApplyPreset('agressivo')}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 text-[11px] font-semibold transition-all"
            >
              Agressivo
            </button>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 text-xs">
          {/* Strategy / Setup Selector */}
          <div>
            <label className="text-[10px] font-bold uppercase text-violet-400 block mb-1">Estratégia / Setup</label>
            <select
              value={activeSetup.id}
              onChange={(e) => {
                const found = setups.find((s) => s.id === e.target.value);
                if (found) onSelectSetup(found);
              }}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-2.5 py-1.5 text-white outline-none font-semibold"
            >
              {setups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.dir.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Asset / Symbol */}
          <div>
            <label className="text-[10px] font-bold uppercase text-violet-400 block mb-1">Ativo de Mercado</label>
            <select
              value={config.symbol}
              onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-2.5 py-1.5 text-white outline-none font-mono font-bold"
            >
              <option value="BTCUSDT">BTC/USDT (Cripto)</option>
              <option value="ETHUSDT">ETH/USDT (Cripto)</option>
              <option value="SOLUSDT">SOL/USDT (Cripto)</option>
              <option value="EURUSD">EUR/USD (Forex)</option>
              <option value="GBPUSD">GBP/USD (Forex)</option>
              <option value="AAPL">AAPL (Ações)</option>
            </select>
          </div>

          {/* Timeframe */}
          <div>
            <label className="text-[10px] font-bold uppercase text-violet-400 block mb-1">Timeframe</label>
            <select
              value={config.timeframe}
              onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-2.5 py-1.5 text-white outline-none font-semibold"
            >
              <option value="1m">1 Minuto (M1)</option>
              <option value="5m">5 Minutos (M5)</option>
              <option value="15m">15 Minutos (M15)</option>
              <option value="30m">30 Minutos (M30)</option>
              <option value="1h">1 Hora (H1)</option>
              <option value="4h">4 Horas (H4)</option>
              <option value="1d">1 Dia (D1)</option>
            </select>
          </div>

          {/* Candle Sample Size */}
          <div>
            <label className="text-[10px] font-bold uppercase text-violet-400 block mb-1">Amostra Histórica</label>
            <select
              value={config.candleCount}
              onChange={(e) => setConfig({ ...config, candleCount: Number(e.target.value) })}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-2.5 py-1.5 text-white outline-none font-semibold"
            >
              <option value={100}>100 Velas</option>
              <option value={250}>250 Velas (Recomendado)</option>
              <option value={500}>500 Velas (Alta Amostra)</option>
            </select>
          </div>

          {/* Payout & Expiration */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] font-bold uppercase text-violet-400">Payout (%)</label>
              <span className="text-[10px] text-fuchsia-300 font-mono font-bold">{config.payout}%</span>
            </div>
            <input
              type="range"
              min="70"
              max="95"
              step="1"
              value={config.payout}
              onChange={(e) => setConfig({ ...config, payout: Number(e.target.value) })}
              className="w-full accent-fuchsia-500 h-1.5 bg-black/60 rounded-lg cursor-pointer"
            />
            <span className="text-[9px] text-violet-400/80 block mt-0.5">BE: {breakEvenPayout}%</span>
          </div>

          {/* Action Button */}
          <div className="flex items-end">
            <button
              onClick={handleRunBacktest}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 hover:opacity-95 text-white font-extrabold text-xs shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {loading ? 'Calculando...' : 'Rodar Backtest'}
            </button>
          </div>
        </div>

        {/* Advanced Simulation Parameters Accordion / Row */}
        <div className="mt-3 pt-3 border-t border-violet-500/10 flex items-center justify-between flex-wrap gap-2 text-xs text-violet-300">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-violet-400">Banca Inicial:</span>
              <input
                type="number"
                min="50"
                value={config.initialCapital}
                onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                className="w-20 bg-black/40 border border-violet-500/30 rounded-lg px-2 py-0.5 text-white font-mono font-bold text-xs outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400">Risco / Trade:</span>
              <select
                value={config.stakeType}
                onChange={(e) => setConfig({ ...config, stakeType: e.target.value as any })}
                className="bg-black/40 border border-violet-500/30 rounded-lg px-2 py-0.5 text-white text-xs outline-none"
              >
                <option value="percent">% da Banca</option>
                <option value="fixed">Fixo ($)</option>
              </select>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={config.stakeValue}
                onChange={(e) => setConfig({ ...config, stakeValue: Number(e.target.value) })}
                className="w-14 bg-black/40 border border-violet-500/30 rounded-lg px-2 py-0.5 text-white font-mono font-bold text-xs outline-none"
              />
              <span className="text-violet-400 text-[11px]">{config.stakeType === 'percent' ? '%' : '$'}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400">Expiração:</span>
              <select
                value={config.expirationCandles}
                onChange={(e) => setConfig({ ...config, expirationCandles: Number(e.target.value) })}
                className="bg-black/40 border border-violet-500/30 rounded-lg px-2 py-0.5 text-white text-xs outline-none"
              >
                <option value={1}>Próxima Vela (1 vela)</option>
                <option value={2}>2 Velas</option>
                <option value={3}>3 Velas</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400">Empate:</span>
              <select
                value={config.tieAction}
                onChange={(e) => setConfig({ ...config, tieAction: e.target.value as any })}
                className="bg-black/40 border border-violet-500/30 rounded-lg px-2 py-0.5 text-white text-xs outline-none"
              >
                <option value="refund">Devolução (Push)</option>
                <option value="loss">Perda (Loss)</option>
              </select>
            </div>
          </div>

          {backtestData && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyReport}
                className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar Relatório'}
              </button>
              <button
                onClick={handleExportCsv}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-violet-500/20 text-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {(loadError || dataSource) && (
        <div
          className={`rounded-2xl border p-3 text-xs flex items-start gap-2 ${
            loadError
              ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              : 'bg-[#120a28]/70 border-violet-500/20 text-violet-300'
          }`}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {loadError && <div className="font-semibold">{loadError}</div>}
            {dataSource && (
              <div>
                <span className="text-violet-400">Fonte usada:</span>{' '}
                <b>{dataSource.providerName}</b> · {dataSource.candleCount} velas ·{' '}
                {dataSource.isReal ? 'dados reais' : 'sem confirmação de dados reais'}
                {!loadError && dataSource.note ? ` · ${dataSource.note}` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Results Container */}
      {backtestData && (
        <>
          {/* Institutional KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Card 1: Win Rate & Edge */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Taxa de Acerto</span>
                <Percent className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-xl font-black font-mono ${
                      backtestData.metrics.winRate >= backtestData.metrics.breakEvenWinRate
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {backtestData.metrics.winRate}%
                  </span>
                  <span className="text-[10px] text-violet-400">
                    / BE {backtestData.metrics.breakEvenWinRate}%
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      backtestData.metrics.mathematicalEdge >= 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    Edge: {backtestData.metrics.mathematicalEdge >= 0 ? '+' : ''}
                    {backtestData.metrics.mathematicalEdge}%
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Profit Factor */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Fator de Lucro</span>
                <Award className="w-3.5 h-3.5" />
              </div>
              <div>
                <span
                  className={`text-xl font-black font-mono ${
                    backtestData.metrics.profitFactor >= 1.5
                      ? 'text-emerald-400'
                      : backtestData.metrics.profitFactor >= 1.0
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {Number.isFinite(backtestData.metrics.profitFactor)
                    ? backtestData.metrics.profitFactor.toFixed(2)
                    : '∞'}
                </span>
                <div className="mt-1 text-[10px] text-violet-400">
                  {backtestData.metrics.profitFactor >= 2.0
                    ? 'Excelente (Grau Pro)'
                    : backtestData.metrics.profitFactor >= 1.5
                    ? 'Consistente'
                    : backtestData.metrics.profitFactor >= 1.0
                    ? 'Marginal'
                    : 'Sub-ótimo (Prejuízo)'}
                </div>
              </div>
            </div>

            {/* Card 3: Max Drawdown */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Drawdown Máx</span>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div>
                <span className="text-xl font-black font-mono text-rose-400">
                  {backtestData.metrics.maxDrawdownPct}%
                </span>
                <div className="mt-1 text-[10px] text-violet-400 font-mono">
                  ${backtestData.metrics.maxDrawdown.toFixed(2)} pico a vale
                </div>
              </div>
            </div>

            {/* Card 4: Expectancy EV */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Expectativa (EV)</span>
                <DollarSign className="w-3.5 h-3.5 text-violet-300" />
              </div>
              <div>
                <span
                  className={`text-xl font-black font-mono ${
                    backtestData.metrics.expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {backtestData.metrics.expectancy >= 0 ? '+' : ''}${backtestData.metrics.expectancy}
                </span>
                <div className="mt-1 text-[10px] text-violet-400">por trade executado</div>
              </div>
            </div>

            {/* Card 5: Net PnL & ROI */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Resultado Líquido</span>
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div>
                <span
                  className={`text-xl font-black font-mono ${
                    backtestData.metrics.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {backtestData.metrics.netPnL >= 0 ? '+' : ''}${backtestData.metrics.netPnL}
                </span>
                <div className="mt-1 text-[10px] text-violet-400 font-mono">
                  ROI: {backtestData.metrics.roiPct >= 0 ? '+' : ''}
                  {backtestData.metrics.roiPct}%
                </div>
              </div>
            </div>

            {/* Card 6: Operations & Streaks */}
            <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-3 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-violet-400 mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Operações & Streaks</span>
                <Layers className="w-3.5 h-3.5 text-violet-300" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-white">
                  {backtestData.metrics.totalTrades} trades
                </div>
                <div className="mt-1 text-[10px] text-violet-400">
                  <span className="text-emerald-300">W: {backtestData.metrics.wins}</span> ·{' '}
                  <span className="text-rose-300">L: {backtestData.metrics.losses}</span> ·{' '}
                  <span>E: {backtestData.metrics.ties}</span>
                </div>
                <div className="text-[9px] text-violet-400 mt-0.5">
                  Max Win: {backtestData.metrics.maxConsecutiveWins} | Max Loss:{' '}
                  {backtestData.metrics.maxConsecutiveLosses}
                </div>
              </div>
            </div>
          </div>

          {/* Equity Curve Canvas & Visual Evolution */}
          <div className="bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-4 shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-white uppercase tracking-wider">
                  Curva de Capital (Evolução Patrimonial)
                </span>
                <span className="text-[10px] text-violet-400">
                  Saldo Inicial: ${config.initialCapital.toFixed(2)} → Final: $
                  {backtestData.equityCurve[backtestData.equityCurve.length - 1].balance.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-white/40 inline-block" />
                  <span className="text-violet-400">Linha Base</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span className="text-emerald-400">Vitórias</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                  <span className="text-rose-400">Derrotas</span>
                </div>
              </div>
            </div>

            <EquityCurveChart
              equityPoints={backtestData.equityCurve}
              initialCapital={config.initialCapital}
              height={260}
            />
          </div>

          {/* Replay & Trade Inspector Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Trades Table (Cols 7) */}
            <div className="lg:col-span-7 bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-violet-500/15 mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-white uppercase tracking-wider">
                      Diário de Operações do Backtest ({filteredTrades.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      onClick={() => setTradeFilter('ALL')}
                      className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                        tradeFilter === 'ALL'
                          ? 'bg-violet-600 text-white'
                          : 'bg-white/5 text-violet-300 hover:bg-white/10'
                      }`}
                    >
                      Todas ({backtestData.trades.length})
                    </button>
                    <button
                      onClick={() => setTradeFilter('WIN')}
                      className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                        tradeFilter === 'WIN'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/5 text-violet-300 hover:bg-white/10'
                      }`}
                    >
                      WIN ({backtestData.metrics.wins})
                    </button>
                    <button
                      onClick={() => setTradeFilter('LOSS')}
                      className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                        tradeFilter === 'LOSS'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white/5 text-violet-300 hover:bg-white/10'
                      }`}
                    >
                      LOSS ({backtestData.metrics.losses})
                    </button>
                  </div>
                </div>

                <div className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {filteredTrades.map((trade, idx) => {
                    const isSelected = selectedTrade?.id === trade.id;
                    return (
                      <div
                        key={trade.id}
                        onClick={() => setSelectedTrade(trade)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-violet-600/20 border-violet-500 text-white shadow-md'
                            : 'bg-black/30 border-violet-500/10 hover:border-violet-500/30 text-violet-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                              trade.direction === 'CALL'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {trade.direction === 'CALL' ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>#{trade.index + 1}</span>
                              <span
                                className={`text-[10px] px-1 rounded ${
                                  trade.direction === 'CALL' ? 'text-emerald-300' : 'text-rose-300'
                                }`}
                              >
                                {trade.direction}
                              </span>
                              <span className="text-[10px] text-violet-400 font-normal">({trade.timeStr})</span>
                            </div>
                            <div className="text-[10px] text-violet-400 font-mono">
                              Entr: {trade.entryPrice.toFixed(2)} → Saída: {trade.exitPrice.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <span
                            className={`text-xs font-black ${
                              trade.result === 'WIN'
                                ? 'text-emerald-400'
                                : trade.result === 'LOSS'
                                ? 'text-rose-400'
                                : 'text-violet-300'
                            }`}
                          >
                            {trade.result === 'WIN' ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`}
                          </span>
                          <div className="text-[10px] text-violet-400">
                            Saldo: ${trade.balanceAfter.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Inspector Details (Cols 5) */}
            <div className="lg:col-span-5 bg-[#120a28]/80 border border-violet-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-violet-500/15 mb-3">
                  <span className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-violet-400" />
                    Auditoria da Operação
                  </span>
                  {selectedTrade && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                        selectedTrade.result === 'WIN'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : selectedTrade.result === 'LOSS'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      }`}
                    >
                      {selectedTrade.result}
                    </span>
                  )}
                </div>

                {selectedTrade ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-black/40 border border-violet-500/20 space-y-2">
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Horário da Vela:</span>
                        <span className="font-bold text-white font-mono">{selectedTrade.timeStr}</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Direção da Ordem:</span>
                        <span className="font-bold text-white font-mono">{selectedTrade.direction}</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Preço de Abertura / Entrada:</span>
                        <span className="font-bold text-white font-mono">{selectedTrade.entryPrice}</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Preço de Fechamento / Saída:</span>
                        <span className="font-bold text-white font-mono">{selectedTrade.exitPrice}</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Variação de Preço (Delta):</span>
                        <span
                          className={`font-mono font-bold ${
                            selectedTrade.exitPrice >= selectedTrade.entryPrice
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(selectedTrade.exitPrice - selectedTrade.entryPrice).toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300 border-t border-violet-500/10 pt-1.5">
                        <span>Investimento (Stake):</span>
                        <span className="font-bold text-white font-mono">${selectedTrade.stake.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Payout Aplicado:</span>
                        <span className="font-bold text-fuchsia-300 font-mono">{selectedTrade.payout}%</span>
                      </div>
                      <div className="flex justify-between items-center text-violet-300">
                        <span>Resultado Financeiro:</span>
                        <span
                          className={`font-bold font-mono text-sm ${
                            selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {selectedTrade.pnl >= 0 ? `+$${selectedTrade.pnl.toFixed(2)}` : `-$${Math.abs(selectedTrade.pnl).toFixed(2)}`}
                        </span>
                      </div>
                    </div>

                    {/* Confluences Triggered */}
                    <div>
                      <span className="text-[10px] font-bold uppercase text-violet-400 block mb-1.5">
                        Confluências Técnicas Validadas ({selectedTrade.confluences.length})
                      </span>
                      {selectedTrade.confluences.length > 0 ? (
                        <div className="space-y-1">
                          {selectedTrade.confluences.map((c, i) => (
                            <div
                              key={i}
                              className="text-[11px] p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 flex items-center gap-1.5"
                            >
                              <span className="text-emerald-400">✔</span>
                              <span>{c}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-violet-400 text-xs italic">
                          Operação aprovada por pontuação mínima de confluência ({selectedTrade.score} pts).
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-violet-400 text-xs">
                    <p>Selecione uma operação no diário para inspecionar os detalhes.</p>
                  </div>
                )}
              </div>

              {/* Informative Footer */}
              <div className="mt-4 p-2.5 rounded-xl bg-violet-950/40 border border-violet-500/20 text-[10px] text-violet-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <span>
                  O backtest executa a regra sem antecipação de candles (zero lookahead). O sinal é avaliado no fechamento da vela sinalizadora, a entrada ocorre na abertura da vela seguinte e a saída no fechamento da expiração configurada.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
