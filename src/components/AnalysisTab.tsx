import React, { useState, useEffect, useMemo } from 'react';
import { Candle, Setup, MarketType, FilterConfig, AIAnalysisResult, AIRole, UserProfile } from '../types';
import { CRYPTO_SYMBOLS, FOREX_SYMBOLS, EQUITIES_SYMBOLS, fetchMarketCandlesDetailed } from '../services/marketApi';
import { universalMarketData, MarketFeedAudit } from '../services/marketDataEngine';
import { evaluateSetupProbabilities, checkFilters, CONFLUENCE_THRESHOLD, MIN_HISTORICAL_SAMPLE } from '../services/probabilityEngine';
import { runHistoricalBacktest } from '../services/backtestEngine';
import { Indicators, analyzePatterns } from '../services/indicators';
import { geminiService } from '../services/geminiService';
import { buildJournalDraft, resolveSignalDirection, saveJournalDraft } from '../services/analysisJournal';
import { PriceChart } from './PriceChart';
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Layers,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Bot,
  BookOpen,
  ShieldAlert,
  BrainCircuit,
  Sliders,
  CheckSquare,
} from 'lucide-react';

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
  onNavigateToConnections?: () => void;
  onFeedStatusChange?: (status: 'unknown' | 'connecting' | 'online' | 'error') => void;
  currentUser?: UserProfile | null;
  onOpenJournal?: () => void;
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
  onNavigateToConnections,
  onFeedStatusChange,
  currentUser,
  onOpenJournal,
}) => {
  const [loading, setLoading] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [payout, setPayout] = useState(activeSetup.payout || 85);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRole, setAiRole] = useState<AIRole>('analista');
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [audit, setAudit] = useState<MarketFeedAudit>(() => universalMarketData.getLatestAudit());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ignoreFilters, setIgnoreFilters] = useState(false);
  const [journalFeedback, setJournalFeedback] = useState<{
    ok: boolean;
    message: string;
    entryId?: string;
  } | null>(null);

  // Só aceita auditoria do ativo/timeframe visível; o scanner consulta outros símbolos em paralelo.
  useEffect(() => {
    if (marketType === 'image') return;
    const clean = symbol.toUpperCase().replace('/', '').trim();
    const unsub = universalMarketData.onAuditChange((latest) => {
      if (latest.symbol === clean && latest.timeframe === timeframe) {
        setAudit(latest);
      }
    });
    return unsub;
  }, [symbol, timeframe, marketType]);

  // Load candles on mount or asset/tf change
  const loadCandles = async (sym = symbol, tf = timeframe, mType = marketType) => {
    setLoading(true);
    setAiAnalysis(null);
    setLoadError(null);
    onFeedStatusChange?.('connecting');
    try {
      const detail = await fetchMarketCandlesDetailed(sym, tf, 160, mType);
      const data = detail.candles;
      if (data.length === 0) {
        throw new Error('O feed não retornou velas para este ativo/timeframe.');
      }
      setAudit(detail.audit);
      setCandles(data);
      onFeedStatusChange?.('online');
    } catch (err: any) {
      console.warn('Real market feed error:', err);
      setLoadError(err.message || 'Falha ao conectar com o feed de dados reais');
      setCandles([]);
      onFeedStatusChange?.('error');
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

  // Ignorar filtros é uma decisão consciente e não pode sobreviver à troca de cenário
  useEffect(() => {
    setIgnoreFilters(false);
  }, [activeSetup.id, symbol, timeframe, filters]);

  useEffect(() => {
    setJournalFeedback(null);
  }, [activeSetup.id, symbol, timeframe]);

  // Current analysis evaluation
  const curIdx = candles.length - 1;
  const effectiveSetup = useMemo(() => ({ ...activeSetup, payout }), [activeSetup, payout]);
  const historicalSample = useMemo(() => {
    if (candles.length < 40) return null;
    return runHistoricalBacktest(effectiveSetup, candles);
  }, [effectiveSetup, candles]);
  const analysis = evaluateSetupProbabilities(effectiveSetup, candles, curIdx, historicalSample);
  const filterResult = checkFilters(filters, candles, curIdx, historicalSample?.n ?? null);
  const failedFilters = filterResult.items.filter((item) => !item.ok);

  const hasBlockedRule = analysis.hasBlockedRules;
  const usingImageData = marketType === 'image';
  const feedBlocked =
    candles.length < 5 || Boolean(loadError) || (!usingImageData && audit.status === 'error');
  const auditLabel = usingImageData
    ? 'Imagem/Print (velas lidas do gráfico)'
    : audit.providerName;
  const filtersBlocked = !filterResult.passed && !ignoreFilters;
  const isSignalsBlocked = feedBlocked || hasBlockedRule || filtersBlocked;
  const scorePercent = feedBlocked ? 50 : Math.round(analysis.score);
  const hasHistoricalProbability = analysis.probabilitySource === 'historical' && analysis.probability !== null;
  const probabilityPercent = hasHistoricalProbability ? Math.round(analysis.probability! * 100) : null;

  // Candlestick patterns in current candle
  const detectedPatterns = curIdx >= 2 ? analyzePatterns(candles, curIdx) : [];

  // Request AI Analysis via resilient Gemini Service
  const handleQueryAI = async () => {
    if (candles.length === 0) return;
    setAiLoading(true);
    try {
      const cur = candles[candles.length - 1];
      const closes = candles.map((c) => c.c);
      const rsi = Indicators.rsi(closes, 14)[candles.length - 1] ?? 50;
      const macd = Indicators.macd(closes).hist[candles.length - 1] ?? 0;
      const atr = Indicators.atr(candles)[candles.length - 1] ?? 0;

      const data = await geminiService.analyzeEntry({
        symbol,
        timeframe,
        probability: probabilityPercent,
        probabilitySource: analysis.probabilitySource,
        sampleSize: analysis.sampleSize,
        score: analysis.score,
        ev: analysis.ev,
        setupDirection: activeSetup.dir,
        hasBlockedRules: hasBlockedRule,
        indicators: {
          rsi: rsi.toFixed(1),
          macdHist: macd.toFixed(4),
          atr: atr.toFixed(4),
          currentPrice: cur.c,
        },
        setupName: activeSetup.name,
        rulesStatus: `${analysis.satisfiedCount} regras satisfeitas, ${analysis.violatedCount} contrárias, ${analysis.unavailableCount} sem dados suficientes`,
        payout,
        role: aiRole,
      });

      setAiAnalysis(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveToJournal = () => {
    if (feedBlocked || candles.length === 0) {
      setJournalFeedback({
        ok: false,
        message: 'Não há feed real suficiente para registrar esta análise.',
      });
      return;
    }

    try {
      const score = Math.round(analysis.score);
      const blocked = hasBlockedRule || filtersBlocked || feedBlocked;
      const direction = resolveSignalDirection(activeSetup.dir, score, blocked);
      const filterFailures = filterResult.items
        .filter((item) => !item.ok)
        .map((item) => `${item.label}: ${item.reason}`);

      const draft = buildJournalDraft({
        candles,
        symbol,
        timeframe,
        marketType,
        setup: effectiveSetup,
        payout,
        evaluation: analysis,
        dataSource: usingImageData ? 'Imagem/Print (OCR)' : audit.providerName || 'Feed de mercado',
        origin: 'terminal',
        direction,
        userId: currentUser?.uid ?? null,
        filterFailures,
        blockedReason: hasBlockedRule
          ? 'Regra técnica inválida no setup.'
          : filtersBlocked
            ? 'Filtros anti-ruído reprovados.'
            : undefined,
        aiContext: aiAnalysis
          ? {
              model: aiAnalysis.modelUsed,
              recommendation: aiAnalysis.recommendation,
              riskWarning: aiAnalysis.riskWarning,
            }
          : null,
      });

      const saved = saveJournalDraft(draft);
      if (!saved.persisted) {
        setJournalFeedback({
          ok: false,
          message:
            'A análise foi montada, mas o navegador não permitiu salvar no armazenamento local. Exporte o diário e libere espaço.',
        });
        return;
      }

      setJournalFeedback({
        ok: true,
        message: saved.created
          ? 'Análise registrada no Diário. A decisão humana continua pendente até você informá-la.'
          : 'Esta análise já estava registrada; mantive a decisão e o resultado que você já havia informado.',
        entryId: saved.entry.id,
      });
    } catch (err: any) {
      setJournalFeedback({
        ok: false,
        message: err?.message || 'Não foi possível registrar a análise no Diário.',
      });
    }
  };

  const handleCopyAIReport = () => {
    if (!aiAnalysis) return;
    const text = `◈ PARECER ROXO.IA (${aiAnalysis.roleTitle || 'IA'} - ${symbol} ${timeframe})
Veredito: ${aiAnalysis.verdict} (Confiança: ${aiAnalysis.confidence}%)
Recomendação: ${aiAnalysis.recommendation}
Base estatística: ${aiAnalysis.probabilityNotice || (aiAnalysis.probabilitySource === 'historical' ? `probabilidade histórica (n=${aiAnalysis.sampleSize})` : 'score de confluência, sem probabilidade calibrada')}
Confluências:
${(aiAnalysis.confluences || []).map((c) => `- ${c}`).join('\n')}
Aviso de Risco: ${aiAnalysis.riskWarning || 'Nenhum'}
Modelo: ${aiAnalysis.modelUsed || 'Gemini 3.6 Flash'}`;
    navigator.clipboard.writeText(text);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  };


  // Bloqueios: sem feed real, regra inválida ou filtros anti-ruído reprovados
  let verdictLabel = 'NEUTRO / SETUP NÃO CONFIRMADO';
  let verdictColor = 'text-violet-300 bg-violet-500/10 border-violet-500/30';
  let isCall = false;
  let isPut = false;

  if (hasBlockedRule) {
    verdictLabel = 'SINAIS BLOQUEADOS (REGRA TÉCNICA INVÁLIDA)';
    verdictColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]';
  } else if (feedBlocked) {
    verdictLabel = 'SINAIS BLOQUEADOS (SEM FEED REAL)';
    verdictColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]';
  } else if (filtersBlocked) {
    verdictLabel = 'SINAIS BLOQUEADOS (FILTROS ANTI-RUÍDO)';
    verdictColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
  } else if (scorePercent >= CONFLUENCE_THRESHOLD) {
    if (activeSetup.dir === 'baixa') {
      verdictLabel = 'PUT (OPÇÃO DE VENDA)';
      verdictColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40 shadow-[0_0_15px_rgba(251,113,133,0.2)]';
      isPut = true;
    } else {
      verdictLabel = 'CALL (OPÇÃO DE COMPRA)';
      verdictColor = 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_15px_rgba(74,222,128,0.2)]';
      isCall = true;
    }
  } else if (activeSetup.dir === 'qualquer' && scorePercent <= 100 - CONFLUENCE_THRESHOLD) {
    verdictLabel = 'PUT (OPÇÃO DE VENDA)';
    verdictColor = 'text-rose-300 bg-rose-500/15 border-rose-500/40 shadow-[0_0_15px_rgba(251,113,133,0.2)]';
    isPut = true;
  }

  // SVG Gauge calculations
  const circumference = 2 * Math.PI * 52;
  const gaugeFraction = feedBlocked ? 0.5 : Math.max(0, Math.min(1, analysis.score / 100));
  const strokeOffset = circumference * (1 - gaugeFraction);

  return (
    <div className="space-y-4">
      {/* Real-time Data Origin & Audit Badge (Zero Synthetic Data Proof) */}
      <div className="bg-gradient-to-r from-violet-950/70 via-black/80 to-[#120a28] border border-violet-500/30 rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isSignalsBlocked
                ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                : 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse'
            }`}
          />
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-xs uppercase tracking-wide">
              {auditLabel}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${
                isSignalsBlocked
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : usingImageData
                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {isSignalsBlocked
                ? 'BLOQUEIO DE SEGURANÇA'
                : usingImageData
                  ? 'DADOS DERIVADOS DE IMAGEM (NÃO É FEED AO VIVO)'
                  : 'DADOS 100% REAIS (AUDITADO)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-violet-300/80 font-mono text-[11px] flex-wrap">
          {usingImageData ? (
            <span>
              Origem: <b className="text-amber-200">velas lidas de imagem/print</b>
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" /> Ping: <b className="text-white">{audit.latencyMs}ms</b>
              </span>
              <span>
                Atualizado:{' '}
                <b className="text-violet-100">{new Date(audit.timestamp).toLocaleTimeString('pt-BR')}</b>
              </span>
            </>
          )}
          <span>
            Amostra: <b className="text-white">{candles.length} velas</b>
          </span>
        </div>
      </div>

      {/* Signal Blocker Warning Banner if no real data */}
      {feedBlocked && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <b>SINAIS TEMPORARIAMENTE BLOQUEADOS:</b> O terminal não aceita candles simulados. O feed atual está sem dados reais. Conecte um provedor válido ou verifique sua conexão.
            </span>
          </div>
          {onNavigateToConnections && (
            <button
              onClick={onNavigateToConnections}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white font-bold whitespace-nowrap"
            >
              Configurar Provedor ↗
            </button>
          )}
        </div>
      )}

      {/* Anti-noise filters rejected this scenario */}
      {!feedBlocked && !hasBlockedRule && !filterResult.passed && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 flex-wrap animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span>
                <b>FILTROS ANTI-RUÍDO REPROVARAM ESTE CENÁRIO:</b> sinais CALL/PUT ficam bloqueados enquanto a condição não for satisfeita.
              </span>
              <div className="text-[10px] text-amber-300/80 font-mono">
                {failedFilters.map((f) => f.reason).join(' · ')}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIgnoreFilters((v) => !v)}
            className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap border ${
              ignoreFilters
                ? 'bg-amber-500/30 border-amber-400/50 text-white'
                : 'bg-black/30 border-amber-500/30 text-amber-200 hover:bg-amber-500/20'
            }`}
          >
            {ignoreFilters ? 'Reativar bloqueio por filtros' : 'Ignorar filtros e visualizar análise'}
          </button>
        </div>
      )}

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
              {!(
                marketType === 'crypto'
                  ? CRYPTO_SYMBOLS
                  : marketType === 'forex'
                    ? FOREX_SYMBOLS
                    : EQUITIES_SYMBOLS
              ).includes(symbol) && <option value={symbol}>{symbol}</option>}
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
                  Score de Confluência (0–100)
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
                    {scorePercent}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-violet-300/70 mt-0.5">
                    Score / 100
                  </span>
                </div>
              </div>
            </div>

            {/* Estimation source disclosure */}
            <div
              className={`mb-2 px-2.5 py-2 rounded-lg border text-[10px] leading-relaxed ${
                analysis.probabilitySource === 'historical'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : analysis.probabilitySource === 'blocked'
                  ? 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                  : 'bg-violet-500/10 border-violet-500/25 text-violet-300'
              }`}
            >
              {analysis.probabilitySource === 'historical' ? (
                <>
                  <b>Probabilidade histórica calibrada:</b> {probabilityPercent}% · IC 95% Wilson{' '}
                  {Math.round(analysis.ci![0] * 100)}–{Math.round(analysis.ci![1] * 100)}% · amostra n={analysis.sampleSize}
                </>
              ) : analysis.probabilitySource === 'blocked' ? (
                <><b>Regra técnica inválida:</b> nenhuma estimativa estatística é exibida e sinais estão bloqueados.</>
              ) : analysis.probabilitySource === 'insufficient_data' ? (
                <><b>Aguardando histórico mínimo:</b> o score só é calculado após 20 velas.</>
              ) : (
                <>
                  <b>Sem amostra histórica ≥ {MIN_HISTORICAL_SAMPLE}:</b> este número é apenas o score de confluência. Probabilidade, EV e edge não são calculados.
                </>
              )}
            </div>

            {/* Verdict Banner */}
            <div className={`p-3 rounded-xl border text-center font-extrabold text-sm tracking-wide ${verdictColor} flex items-center justify-center gap-2`}>
              {isCall && <ArrowUpRight className="w-5 h-5 text-emerald-400" />}
              {isPut && <ArrowDownRight className="w-5 h-5 text-rose-400" />}
              {filtersBlocked && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              <span>{verdictLabel}</span>
            </div>
            {!filterResult.passed && ignoreFilters && !hasBlockedRule && !feedBlocked && (
              <div className="mt-2 text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                ANÁLISE LIBERADA MANUALMENTE — filtros anti-ruído ignorados pelo usuário.
              </div>
            )}

            <button
              onClick={handleSaveToJournal}
              disabled={feedBlocked || loading || candles.length === 0}
              className="mt-2.5 w-full py-2 px-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-100 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
              title="Registra a análise atual no diário local. Não marca a operação como executada."
            >
              <BookOpen className="w-3.5 h-3.5 text-fuchsia-300" />
              <span>Salvar análise no Diário</span>
            </button>
            <p className="mt-1 text-center text-[9px] text-violet-400/70">
              O registro guarda apenas a análise. Execução e resultado são informados por você no Diário.
            </p>

            {journalFeedback && (
              <div
                className={`mt-2 p-2.5 rounded-xl border text-[10px] leading-relaxed space-y-1 ${
                  journalFeedback.ok
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {journalFeedback.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{journalFeedback.message}</span>
                </div>
                {journalFeedback.ok && onOpenJournal && (
                  <button
                    onClick={onOpenJournal}
                    className="font-bold text-fuchsia-300 hover:text-white underline block"
                  >
                    Abrir Diário e informar decisão ↗
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quantitative KPIs Grid for Binary Options */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-violet-500/15">
            <div className="bg-black/30 p-2 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Score Confluência</span>
              <span className="text-base font-bold font-mono text-white tabular-nums">{analysis.score}/100</span>
            </div>
            <div className="bg-black/30 p-2 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">IC 95% Wilson</span>
              <span className="text-base font-bold font-mono text-violet-200 tabular-nums">
                {analysis.ci
                  ? `${Math.round(analysis.ci[0] * 100)}–${Math.round(analysis.ci[1] * 100)}%`
                  : 'Sem amostra'}
              </span>
            </div>
            <div className="bg-black/30 p-2 rounded-xl border border-violet-500/15">
              <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Esperança EV</span>
              {analysis.ev === null ? (
                <span className="text-base font-bold font-mono text-violet-400 tabular-nums">Sem amostra</span>
              ) : (
                <span
                  className={`text-base font-bold font-mono tabular-nums ${
                    analysis.ev >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {analysis.ev >= 0 ? '+' : ''}
                  {analysis.ev}%
                </span>
              )}
            </div>
          </div>

          {/* Binary Options Edge & Mathematical Viability */}
          <div className="mt-3 space-y-2">
            <div className="p-2.5 rounded-xl bg-black/40 border border-violet-500/20 text-xs flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] text-violet-400 uppercase font-bold block">
                  Break-Even com Payout {payout}%
                </span>
                <span className="font-mono text-white font-bold">{analysis.breakEvenWinRate}%</span>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-[10px] text-violet-400 uppercase font-bold block">
                  Edge Matemático
                </span>
                {analysis.mathematicalEdge === null ? (
                  <span className="font-mono font-bold text-violet-400">Sem amostra</span>
                ) : (
                  <span
                    className={`font-mono font-bold ${
                      analysis.mathematicalEdge > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {analysis.mathematicalEdge > 0 ? '+' : ''}
                    {analysis.mathematicalEdge}%
                  </span>
                )}
              </div>
            </div>

            {/* Wick Rejection Micro-Telemetry */}
            <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/15 text-[10px] text-violet-300 font-mono flex items-center justify-between">
              <span>Pavio Inf. (Suporte): <b>{analysis.lowerWickRatio}%</b></span>
              <span>Pavio Sup. (Resist.): <b>{analysis.upperWickRatio}%</b></span>
            </div>

            {/* Mathematical Viability Tag */}
            {hasHistoricalProbability ? (
              <div
                className={`p-2 rounded-xl text-[11px] font-bold flex items-center justify-between border ${
                  analysis.isMathematicallyViable
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                <span>
                  {analysis.isMathematicallyViable
                    ? '✓ Entrada Matematicamente Viável (+EV e IC acima do break-even)'
                    : '✕ Desvantagem Matemática para Opções Binárias'}
                </span>
                <span className="font-mono text-[10px]">
                  {analysis.isMathematicallyViable ? 'FAVORÁVEL' : 'NÃO ENTRAR'}
                </span>
              </div>
            ) : (
              <div className="p-2 rounded-xl text-[11px] font-bold flex items-center justify-between border bg-amber-500/10 border-amber-500/25 text-amber-300">
                <span>Indisponível — sem amostra histórica (mínimo {MIN_HISTORICAL_SAMPLE} operações)</span>
                <span className="font-mono text-[10px]">SEM BASE</span>
              </div>
            )}
          </div>

          {/* Gemini AI Consultation Multi-Persona & Analysis Box */}
          <div className="mt-4 pt-3 border-t border-violet-500/15 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold text-violet-300 tracking-wider flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-fuchsia-400" /> Papel da IA (Persona)
                </span>
                <span className="text-[10px] text-fuchsia-300 font-mono">Gemini 3.6 Flash</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                {[
                  { id: 'analista', label: '🎯 Analista', desc: 'Confluências' },
                  { id: 'professor', label: '👨‍🏫 Professor', desc: 'Didática' },
                  { id: 'auditor', label: '🛡️ Auditor', desc: 'Risco & Payout' },
                  { id: 'explicador', label: '🧠 Explicador', desc: 'Matemática' },
                  { id: 'setup', label: '⚡ Otimizador', desc: 'Parâmetros' },
                  { id: 'revisor', label: '📝 Revisor', desc: 'Disciplina' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setAiRole(item.id as AIRole)}
                    className={`py-1.5 px-2 rounded-lg text-center transition-all border font-semibold truncate ${
                      aiRole === item.id
                        ? 'bg-fuchsia-600/30 text-white border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.25)]'
                        : 'bg-black/40 text-violet-300/70 border-violet-500/15 hover:border-violet-500/30 hover:text-white'
                    }`}
                    title={item.desc}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleQueryAI}
              disabled={aiLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 hover:opacity-95 transition-all text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.35)] disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-amber-300 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>
                {aiLoading
                  ? 'A IA está calculando confluências neurais...'
                  : `Consultar com ${
                      aiRole === 'analista'
                        ? 'Analista Quantitativo'
                        : aiRole === 'professor'
                        ? 'Professor & Mentor'
                        : aiRole === 'auditor'
                        ? 'Auditor de Risco'
                        : aiRole === 'explicador'
                        ? 'Explicador Bayesiano'
                        : aiRole === 'setup'
                        ? 'Otimizador de Setup'
                        : 'Revisor Crítico'
                    }`}
              </span>
            </button>

            {aiAnalysis && (
              <div className="p-3.5 rounded-xl bg-gradient-to-b from-[#190d36] to-[#0e0722] border border-fuchsia-500/30 text-xs space-y-2.5 animate-fadeIn shadow-2xl">
                {/* Header with Role Title, Latency and Copy Action */}
                <div className="flex items-center justify-between pb-2 border-b border-violet-500/20 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                      {aiAnalysis.roleTitle || 'IA Quantitativa'}
                    </span>
                    {aiAnalysis.executionTimeMs !== undefined && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        ⚡ {aiAnalysis.executionTimeMs}ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        aiAnalysis.aiPowered
                          ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30'
                          : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      }`}
                    >
                      {aiAnalysis.modelUsed || (aiAnalysis.aiPowered ? 'Gemini 3.6 Flash' : 'Motor Local')}
                    </span>
                    <button
                      onClick={handleCopyAIReport}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-violet-300 hover:text-white transition-colors"
                      title="Copiar Parecer Completo"
                    >
                      {copiedFeedback ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Verdict & Confidence */}
                <div className="flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg border border-violet-500/15">
                  <span className="font-extrabold text-white text-xs">
                    Veredito: <b className="text-fuchsia-300">{aiAnalysis.verdict}</b>
                  </span>
                  <span className="text-[11px] font-mono font-bold text-violet-300">
                    Confiança: {aiAnalysis.confidence}%
                  </span>
                </div>

                {/* Statistical basis of the AI opinion */}
                <div className="text-[10px] leading-relaxed text-violet-300/90 bg-violet-500/5 border border-violet-500/15 rounded-lg px-2.5 py-1.5">
                  {aiAnalysis.probabilityNotice ||
                    (aiAnalysis.probabilitySource === 'historical'
                      ? `Base: probabilidade histórica com amostra n=${aiAnalysis.sampleSize}.`
                      : 'Base: score de confluência. Não há probabilidade calibrada sem amostra histórica suficiente.')}
                </div>

                {/* Rationale / Explanation */}
                <p className="text-violet-100/90 leading-relaxed text-[11px] bg-white/[0.02] p-2.5 rounded-lg border border-violet-500/10">
                  {aiAnalysis.recommendation}
                </p>

                {/* Key Confluences */}
                {aiAnalysis.confluences && aiAnalysis.confluences.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] uppercase font-bold text-violet-300 tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Confluências Principais:
                    </span>
                    <div className="grid grid-cols-1 gap-1">
                      {aiAnalysis.confluences.map((c, i) => (
                        <div
                          key={i}
                          className="px-2.5 py-1 rounded bg-black/30 border border-violet-500/15 text-[11px] text-violet-200/90 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shrink-0" />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Warning / Notice */}
                {aiAnalysis.riskWarning && (
                  <div className="text-[10px] text-amber-300/90 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{aiAnalysis.riskWarning}</span>
                    </div>
                    {!aiAnalysis.aiPowered && onNavigateToConnections && (
                      <button
                        onClick={onNavigateToConnections}
                        className="text-[11px] font-bold text-fuchsia-300 hover:text-white underline block pt-1"
                      >
                        Clique aqui para conectar sua chave Gemini gratuita na aba Conexão ↗
                      </button>
                    )}
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

            <PriceChart candles={candles} symbol={symbol} timeframe={timeframe} />

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
                {analysis.satisfiedCount} satisfeitas · {analysis.violatedCount} contrárias · {analysis.unavailableCount} sem dados
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {analysis.ruleDetails.map((rd, i) => {
                const isBlocked = rd.text.includes('bloqueado') || rd.text.includes('desconhecida') || rd.text.includes('inválida');
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl border flex items-start gap-2.5 text-xs transition-colors ${
                      isBlocked
                        ? 'bg-rose-950/50 border-rose-500/60 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                        : rd.unavailable
                        ? 'bg-amber-950/20 border-amber-500/20 text-amber-200/80'
                        : rd.satisfied
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100'
                        : 'bg-rose-950/20 border-rose-500/20 text-rose-200/80'
                    }`}
                  >
                    {isBlocked ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                    ) : rd.unavailable ? (
                      <Sliders className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    ) : rd.satisfied ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold block">{rd.text}</span>
                        {isBlocked && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-rose-500/30 text-rose-300 border border-rose-500/40">
                            Bloqueado
                          </span>
                        )}
                        {!isBlocked && rd.unavailable && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Sem dados
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-violet-400/80 font-mono">
                        Tipo: {rd.rule.type} · Peso {rd.rule.weight} · Polaridade {rd.rule.pol.toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
