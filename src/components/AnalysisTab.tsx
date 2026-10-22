import React, { useState, useEffect, useRef } from 'react';
import { Candle, Setup, MarketType, FilterConfig, AIAnalysisResult } from '../types';
import { CRYPTO_SYMBOLS, FOREX_SYMBOLS, EQUITIES_SYMBOLS, fetchMarketCandles } from '../services/marketApi';
import { evaluateSetupProbabilities, checkFilters } from '../services/probabilityEngine';
import { Indicators, analyzePatterns } from '../services/indicators';
import { Sparkles, ArrowUpRight, ArrowDownRight, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, Layers } from 'lucide-react';

interface AnalysisTabProps {
  setups: Setup[];
  activeSetup: Setup;
  onSelectSetup: (setup: Setup) => void;
  filters: FilterConfig[];
  onOpenCapture: () => void;
  candles: Candle[];
  setCandles: (candles: Candle[]) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  marketType: MarketType;
  setMarketType: (m: MarketType) => void;
}

export const AnalysisTab: React.FC<AnalysisTabProps> = ({
  setups,
  activeSetup,
  onSelectSetup,
  filters,
  onOpenCapture,
  candles,
  setCandles,
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
  marketType,
  setMarketType,
}) => {
  const [loading, setLoading] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [payout, setPayout] = useState(activeSetup.payout || 85);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load candles on mount or asset/tf change
  const loadCandles = async (sym = symbol, tf = timeframe, mType = marketType) => {
    setLoading(true);
    setAiAnalysis(null);
    try {
      const data = await fetchMarketCandles(sym, tf, 160, mType);
      setCandles(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (candles.length === 0) {
      loadCandles();
    }
  }, []);

  // Sync payout with active setup
  useEffect(() => {
    setPayout(activeSetup.payout || 85);
  }, [activeSetup]);

  // Current analysis evaluation
  const curIdx = candles.length - 1;
  const analysis = evaluateSetupProbabilities(
    { ...activeSetup, payout },
    candles,
    curIdx
  );
  const filterResult = checkFilters(filters, candles, curIdx);

  // Candlestick patterns in current candle
  const detectedPatterns = curIdx >= 2 ? analyzePatterns(candles, curIdx) : [];

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Padding
    const padTop = 15;
    const padBottom = 28;
    const padRight = 55;
    const padLeft = 8;
    const chartHeight = H - padTop - padBottom;
    const chartWidth = W - padLeft - padRight;

    // Price bounds
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const maxP = Math.max(...highs);
    const minP = Math.min(...lows);
    const spanP = Math.max(1e-6, maxP - minP);

    const getY = (val: number) => padTop + chartHeight - ((val - minP) / spanP) * chartHeight;

    // Grid lines
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = padTop + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();

      // Price labels
      const pVal = maxP - (spanP / 4) * i;
      ctx.fillStyle = '#9d8ac7';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(pVal.toFixed(symbol.includes('USD') && !symbol.includes('USDT') ? 4 : 2), W - padRight + 6, y + 3);
    }

    // EMAs overlay
    const closes = candles.map((c) => c.c);
    const ema9 = Indicators.ema(closes, 9);
    const ema21 = Indicators.ema(closes, 21);

    const candleWidth = chartWidth / candles.length;
    const bodyWidth = Math.max(2, Math.min(8, candleWidth * 0.65));

    // Draw EMA 21 (Violet)
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    candles.forEach((_, i) => {
      const val = ema21[i];
      if (val !== null) {
        const x = padLeft + i * candleWidth + candleWidth / 2;
        const y = getY(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw EMA 9 (Magenta)
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    candles.forEach((_, i) => {
      const val = ema9[i];
      if (val !== null) {
        const x = padLeft + i * candleWidth + candleWidth / 2;
        const y = getY(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Candlesticks
    candles.forEach((c, i) => {
      const x = padLeft + i * candleWidth + candleWidth / 2;
      const isUp = c.c >= c.o;
      const color = isUp ? '#4ade80' : '#fb7185';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, getY(c.h));
      ctx.lineTo(x, getY(c.l));
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const yOpen = getY(c.o);
      const yClose = getY(c.c);
      const topY = Math.min(yOpen, yClose);
      const bHeight = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillRect(x - bodyWidth / 2, topY, bodyWidth, bHeight);
    });

    // Current price dashed line
    const last = candles[candles.length - 1];
    if (last) {
      const curY = getY(last.c);
      ctx.strokeStyle = last.c >= last.o ? '#4ade80' : '#fb7185';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, curY);
      ctx.lineTo(W - padRight, curY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Badge
      ctx.fillStyle = last.c >= last.o ? '#166534' : '#9f1239';
      ctx.fillRect(W - padRight + 2, curY - 9, 50, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(last.c.toFixed(symbol.includes('USD') && !symbol.includes('USDT') ? 4 : 2), W - padRight + 6, curY + 4);
    }
  }, [candles]);

  // Request AI Analysis from Server
  const handleQueryAI = async () => {
    if (candles.length === 0) return;
    setAiLoading(true);
    try {
      const cur = candles[candles.length - 1];
      const closes = candles.map((c) => c.c);
      const rsi = Indicators.rsi(closes, 14)[candles.length - 1] ?? 50;
      const macd = Indicators.macd(closes).hist[candles.length - 1] ?? 0;
      const atr = Indicators.atr(candles)[candles.length - 1] ?? 0;

      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          probability: Math.round(analysis.prob * 100),
          score: analysis.score,
          ev: analysis.ev,
          indicators: {
            rsi: rsi.toFixed(1),
            macdHist: macd.toFixed(4),
            atr: atr.toFixed(4),
            currentPrice: cur.c,
          },
          setupName: activeSetup.name,
          rulesStatus: `${analysis.satisfiedCount} regras satisfeitas, ${analysis.violatedCount} contrárias`,
          payout,
        }),
      });

      const data = await res.json();
      setAiAnalysis(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Verdict calculation
  const probPercent = Math.round(analysis.prob * 100);
  let verdictLabel = 'NEUTRO / ESPERAR';
  let verdictColor = 'text-violet-300 bg-violet-500/10 border-violet-500/30';
  let isCall = false;
  let isPut = false;

  if (!filterResult.passed) {
    verdictLabel = 'FORA DO PERFIL (FILTROS)';
    verdictColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
  } else if (probPercent >= 58) {
    verdictLabel = 'CALL (OPÇÃO DE COMPRA)';
    verdictColor = 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_15px_rgba(74,222,128,0.2)]';
    isCall = true;
  } else if (probPercent <= 42) {
    verdictLabel = 'PUT (OPÇÃO DE VENDA)';
    verdictColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40 shadow-[0_0_15px_rgba(251,113,133,0.2)]';
    isPut = true;
  }

  // SVG Gauge calculations
  const circumference = 2 * Math.PI * 52;
  const strokeOffset = circumference * (1 - analysis.prob);

  return (
    <div className="space-y-4">
      {/* Top Controls: Asset, Market, Timeframe, Setup & Payout */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Market Selector Buttons */}
          <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-violet-500/20">
            {(['crypto', 'forex', 'equities'] as MarketType[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMarketType(m);
                  const firstSym = m === 'crypto' ? 'BTCUSDT' : m === 'forex' ? 'EURUSD' : 'AAPL';
                  setSymbol(firstSym);
                  loadCandles(firstSym, timeframe, m);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                  marketType === m
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm'
                    : 'text-violet-300/70 hover:text-white'
                }`}
              >
                {m === 'crypto' ? 'Cripto' : m === 'forex' ? 'Forex' : 'Ações'}
              </button>
            ))}
            <button
              onClick={onOpenCapture}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-fuchsia-300 hover:text-white hover:bg-fuchsia-500/20 transition-all flex items-center gap-1"
            >
              📷 Imagem / Print
            </button>
          </div>

          {/* Symbol Select */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-violet-300/70 uppercase tracking-wider">Ativo:</span>
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                loadCandles(e.target.value, timeframe, marketType);
              }}
              className="bg-black/50 border border-violet-500/30 text-white rounded-lg px-3 py-1.5 text-xs font-mono font-semibold focus:outline-none focus:border-violet-400"
            >
              {(marketType === 'crypto' ? CRYPTO_SYMBOLS : marketType === 'forex' ? FOREX_SYMBOLS : EQUITIES_SYMBOLS).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>

            {/* Custom Input */}
            <input
              type="text"
              placeholder="Outro símbolo..."
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customSymbol.trim()) {
                  const s = customSymbol.trim().toUpperCase();
                  setSymbol(s);
                  loadCandles(s, timeframe, marketType);
                }
              }}
              className="bg-black/50 border border-violet-500/30 text-white placeholder-violet-400/40 rounded-lg px-2.5 py-1.5 text-xs font-mono w-28 focus:outline-none focus:border-violet-400"
            />
          </div>

          {/* Timeframe & Setup Select */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-violet-300/70 uppercase tracking-wider">Expiração:</span>
              <select
                value={timeframe}
                onChange={(e) => {
                  setTimeframe(e.target.value);
                  loadCandles(symbol, e.target.value, marketType);
                }}
                className="bg-black/50 border border-violet-500/30 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-violet-400"
              >
                <option value="1m">M1 (1 minuto)</option>
                <option value="5m">M5 (5 minutos)</option>
                <option value="15m">M15 (15 minutos)</option>
                <option value="30m">M30 (30 minutos)</option>
                <option value="1h">H1 (1 hora)</option>
                <option value="4h">H4 (4 horas)</option>
                <option value="1d">D1 (1 dia)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-violet-300/70 uppercase tracking-wider">Setup:</span>
              <select
                value={activeSetup.id}
                onChange={(e) => {
                  const found = setups.find((s) => s.id === e.target.value);
                  if (found) onSelectSetup(found);
                }}
                className="bg-black/50 border border-violet-500/30 text-white rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-violet-400 max-w-[190px] truncate"
              >
                {setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payout Adjustment */}
            <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-violet-500/20 text-xs">
              <span className="text-violet-400 font-semibold">Payout:</span>
              <input
                type="number"
                min="50"
                max="99"
                value={payout}
                onChange={(e) => setPayout(Number(e.target.value))}
                className="w-10 bg-transparent text-white font-mono font-bold text-right outline-none"
              />
              <span className="text-violet-300">%</span>
            </div>

            <button
              onClick={() => loadCandles()}
              disabled={loading}
              className="p-2 rounded-lg bg-violet-600/30 text-violet-200 border border-violet-500/30 hover:bg-violet-600/50 transition-colors"
              title="Recarregar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Probability Gauge & Interactive Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gauge & Metrics Card (Cols 4) */}
        <div className="lg:col-span-5 bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-violet-100 tracking-wide uppercase">
                  Probabilidade Próxima Vela
                </span>
              </div>
              <span className="text-[11px] font-mono text-violet-300/80 bg-violet-950/60 px-2 py-0.5 rounded border border-violet-500/20">
                {activeSetup.dir.toUpperCase()} · Payout {payout}%
              </span>
            </div>

            {/* Gauge Graphic */}
            <div className="flex items-center justify-center py-4">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <defs>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#e879f9" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="url(#purpleGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference.toFixed(1)}
                    strokeDashoffset={strokeOffset.toFixed(1)}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-4xl font-black tracking-tight font-mono text-white tabular-nums">
                    {probPercent}%
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-violet-300/70 mt-0.5">
                    Probabilidade
                  </span>
                </div>
              </div>
            </div>

            {/* Verdict Banner */}
            <div className={`p-3 rounded-xl border text-center font-extrabold text-sm tracking-wide ${verdictColor} flex items-center justify-center gap-2`}>
              {isCall && <ArrowUpRight className="w-5 h-5 text-emerald-400" />}
              {isPut && <ArrowDownRight className="w-5 h-5 text-rose-400" />}
              {!filterResult.passed && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              <span>{verdictLabel}</span>
            </div>
          </div>

          {/* Quantitative KPIs Grid */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-violet-500/15">
            <div className="bg-black/30 p-2.5 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Score</span>
              <span className="text-base font-bold font-mono text-white tabular-nums">{analysis.score}/100</span>
            </div>
            <div className="bg-black/30 p-2.5 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">IC 95% Wilson</span>
              <span className="text-base font-bold font-mono text-violet-200 tabular-nums">
                {Math.round(analysis.ci[0] * 100)}–{Math.round(analysis.ci[1] * 100)}%
              </span>
            </div>
            <div className="bg-black/30 p-2.5 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Esperança EV</span>
              <span
                className={`text-base font-bold font-mono tabular-nums ${
                  analysis.ev >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {analysis.ev >= 0 ? '+' : ''}
                {analysis.ev}%
              </span>
            </div>
          </div>

          {/* Gemini AI Consultation Button & Box */}
          <div className="mt-4 pt-3 border-t border-violet-500/15">
            <button
              onClick={handleQueryAI}
              disabled={aiLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 hover:opacity-95 transition-all text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.35)]"
            >
              <Sparkles className={`w-4 h-4 text-amber-300 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>{aiLoading ? 'A IA está calculando confluências...' : 'Consultar Análise da IA Gemini'}</span>
            </button>

            {aiAnalysis && (
              <div className="mt-3 p-3 rounded-xl bg-violet-950/70 border border-fuchsia-500/30 text-xs space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between text-fuchsia-300 font-bold">
                  <span>Parecer da IA: {aiAnalysis.verdict}</span>
                  <span className="text-[10px] font-mono text-violet-300">Confiança: {aiAnalysis.confidence}%</span>
                </div>
                <p className="text-violet-100/90 leading-relaxed">{aiAnalysis.recommendation}</p>
                {aiAnalysis.confluences && aiAnalysis.confluences.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-violet-500/20">
                    <span className="text-[10px] uppercase font-bold text-violet-400">Confluências Detectadas:</span>
                    <ul className="list-disc list-inside text-violet-200/80 text-[11px] space-y-0.5">
                      {aiAnalysis.confluences.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.riskWarning && (
                  <div className="text-[10px] text-amber-300/90 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                    ⚠️ {aiAnalysis.riskWarning}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chart Viewport & Indicators (Cols 7) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Canvas Chart Card */}
          <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-violet-500/15 mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
                  Gráfico de Velas & Tendência — {symbol} ({timeframe})
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="flex items-center gap-1 text-fuchsia-400 font-semibold">
                  <span className="w-2 h-0.5 bg-fuchsia-400 inline-block" /> EMA 9
                </span>
                <span className="flex items-center gap-1 text-violet-400 font-semibold">
                  <span className="w-2 h-0.5 bg-violet-400 inline-block" /> EMA 21
                </span>
              </div>
            </div>

            <div className="relative bg-black/50 rounded-xl overflow-hidden border border-violet-500/20">
              <canvas
                ref={canvasRef}
                width={700}
                height={260}
                className="w-full h-auto block"
              />
            </div>

            {/* Candlestick Patterns Notification Bar */}
            {detectedPatterns.length > 0 && (
              <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-violet-900/30 border border-violet-500/30 text-xs">
                <Layers className="w-4 h-4 text-fuchsia-400 shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-violet-300">Padrão na última vela:</span>
                  {detectedPatterns.map((p, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.type === 'bullish'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : p.type === 'bearish'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Setup Rules Status Checklist */}
          <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-violet-500/15 mb-3">
              <span className="font-extrabold text-xs text-violet-100 uppercase tracking-wide">
                Condições do Setup: {activeSetup.name}
              </span>
              <span className="text-[11px] text-violet-300 font-mono font-semibold">
                {analysis.satisfiedCount} satisfeitas · {analysis.violatedCount} contrárias
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {analysis.ruleDetails.map((rd, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 text-xs transition-colors ${
                    rd.satisfied
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100'
                      : 'bg-rose-950/20 border-rose-500/20 text-rose-200/80'
                  }`}
                >
                  {rd.satisfied ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold block">{rd.text}</span>
                    <span className="text-[10px] text-violet-400/80 font-mono">
                      Peso {rd.rule.weight} · Polaridade {rd.rule.pol.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
