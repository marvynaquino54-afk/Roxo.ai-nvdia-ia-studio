import React, { useState, useEffect } from 'react';
import { TradeRecord } from '../types';
import { cloudStorage } from '../services/firebase';
import { geminiService } from '../services/geminiService';
import { Sparkles, Plus, Award, AlertCircle, FileText, CheckCircle2, TrendingUp, TrendingDown, Copy, Check, Zap, Bot } from 'lucide-react';

interface AIReportsTabProps {
  bankroll: number;
  payout: number;
  initialSetupName?: string;
  initialTimeframe?: string;
}

export const AIReportsTab: React.FC<AIReportsTabProps> = ({
  bankroll,
  payout,
  initialSetupName,
  initialTimeframe,
}) => {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // New trade entry form
  const [sym, setSym] = useState('EURUSD');
  const [dir, setDir] = useState<'CALL' | 'PUT'>('CALL');
  const [stake, setStake] = useState(20);
  const [setupUsed, setSetupUsed] = useState(initialSetupName || 'Setup atual');
  const [tf, setTf] = useState(initialTimeframe || '5m');

  useEffect(() => {
    if (initialSetupName) setSetupUsed(initialSetupName);
    if (initialTimeframe) setTf(initialTimeframe);
  }, [initialSetupName, initialTimeframe]);

  useEffect(() => {
    const saved = cloudStorage.getTrades();
    if (saved.length > 0) {
      setTrades(saved);
    }
  }, []);

  const safeStake = Number.isFinite(stake) && stake > 0 ? stake : 0;
  const setupReady = setupUsed.trim().length > 0 && sym.trim().length > 0 && safeStake > 0;

  const formatTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleAddTrade = (result: 'WIN' | 'LOSS') => {
    if (!setupReady) return;
    const pnl = result === 'WIN' ? safeStake * (payout / 100) : -safeStake;
    const newTrade: TradeRecord = {
      id: 'tr_' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      symbol: sym.trim().toUpperCase(),
      setupName: setupUsed.trim(),
      direction: dir,
      timeframe: tf,
      stake: safeStake,
      result,
      pnl: Number(pnl.toFixed(2)),
    };
    const updated = [newTrade, ...trades];
    setTrades(updated);
    cloudStorage.saveTrades(updated);
    setConfirmClear(false);
  };

  const handleClearTrades = () => {
    setTrades([]);
    cloudStorage.saveTrades([]);
    setReport(null);
    setReportError(null);
    setConfirmClear(false);
  };

  const totalWins = trades.filter((t) => t.result === 'WIN').length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';
  const totalPnL = trades.reduce((acc, t) => acc + t.pnl, 0);

  const handleGenerateReport = async () => {
    if (trades.length === 0) return;
    setLoading(true);
    setReportError(null);
    try {
      const data = await geminiService.generateReport({
        sessionData: trades.slice(0, 20),
        bankroll,
        totalOps: totalTrades,
        winRate,
        profitLoss: totalPnL.toFixed(2),
        payout,
      });
      setReport(data);
    } catch (err: any) {
      const raw = String(err?.message || '');
      if (/429|sobrecarreg|limite|quota/i.test(raw)) {
        setReportError('O modelo de IA está temporariamente limitado. Tente novamente em alguns instantes.');
      } else if (/503|indispon|overload/i.test(raw)) {
        setReportError('O serviço de IA está indisponível agora. O diário continua salvo neste navegador.');
      } else {
        setReportError('Não foi possível gerar o relatório agora. Confira a chave da IA na aba Conexão e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    const text = `◈ RELATÓRIO EXECUTIVO ROXO.IA
Título: ${report.title || 'Desempenho da Sessão'}
Veredito: ${report.verdict || 'Análise Concluída'}
Resumo: ${report.summary}
Pontos Fortes:
${(report.strengths || []).map((s: string) => `- ${s}`).join('\n')}
Recomendações:
${(report.improvements || []).map((m: string) => `- ${m}`).join('\n')}
Modelo: ${report.modelUsed || 'Gemini 3.6 Flash'}`;
    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Session KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Total Operações</span>
          <span className="text-2xl font-black font-mono text-white mt-1 block tabular-nums">{totalTrades}</span>
        </div>
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Taxa de Acerto</span>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block tabular-nums">{winRate}%</span>
        </div>
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <span className="text-[10px] text-violet-400 uppercase font-bold tracking-wider block">Resultado Sessão</span>
          <span
            className={`text-2xl font-black font-mono mt-1 block tabular-nums ${
              totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalPnL >= 0 ? '+' : ''}R$ {totalPnL.toFixed(2)}
          </span>
        </div>
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl flex items-center justify-center">
          <button
            onClick={handleGenerateReport}
            disabled={loading || totalTrades === 0}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-40"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Gerando Relatório...' : 'Gerar Relatório IA'}</span>
          </button>
        </div>
      </div>

      {/* AI Performance Report Display */}
      {report && (
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-fuchsia-500/30 rounded-2xl p-5 shadow-2xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-violet-500/20 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-fuchsia-400" />
              <span className="font-extrabold text-sm text-white uppercase tracking-wide">
                {report.title || 'Relatório Executivo de Performance'}
              </span>
              {report.executionTimeMs !== undefined && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  ⚡ {report.executionTimeMs}ms
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  report.aiPowered
                    ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30'
                    : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                }`}
              >
                {report.modelUsed || (report.aiPowered ? 'Gemini 3.6 Flash' : 'Motor Local')}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  report.verdict?.includes('APROVADO') || report.verdict?.includes('LUCRATIVO')
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {report.verdict || 'AVALIAÇÃO QUANT'}
              </span>
              <button
                onClick={handleCopyReport}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-violet-300 hover:text-white transition-colors"
                title="Copiar Relatório"
              >
                {copiedReport ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>


          {/* Statistical basis enforced by the shared report evaluator */}
          {report.statisticalBasis && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                <div className="bg-black/30 rounded-lg border border-violet-500/15 px-2.5 py-1.5">
                  <span className="text-violet-400 uppercase font-bold block">Amostra</span>
                  <span className="font-mono text-white font-bold">n={report.statisticalBasis.sampleSize}</span>
                </div>
                <div className="bg-black/30 rounded-lg border border-violet-500/15 px-2.5 py-1.5">
                  <span className="text-violet-400 uppercase font-bold block">Break-even</span>
                  <span className="font-mono text-white font-bold">{report.statisticalBasis.breakEvenWinRate}%</span>
                </div>
                <div className="bg-black/30 rounded-lg border border-violet-500/15 px-2.5 py-1.5">
                  <span className="text-violet-400 uppercase font-bold block">IC 95% Wilson</span>
                  <span className="font-mono text-white font-bold">
                    {report.statisticalBasis.wilsonLowerPct}–{report.statisticalBasis.wilsonUpperPct}%
                  </span>
                </div>
                <div className="bg-black/30 rounded-lg border border-violet-500/15 px-2.5 py-1.5">
                  <span className="text-violet-400 uppercase font-bold block">Payout usado</span>
                  <span className="font-mono text-white font-bold">{report.statisticalBasis.payout}%</span>
                </div>
              </div>
              <p className="text-[10px] text-violet-300/90 leading-relaxed bg-violet-500/5 border border-violet-500/15 rounded-lg px-2.5 py-1.5">
                <b>Critério aplicado:</b> {report.statisticalBasis.reason}
              </p>
            </div>
          )}

          <p className="text-xs text-violet-100 leading-relaxed">{report.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {report.strengths && report.strengths.length > 0 && (
              <div className="bg-black/30 p-3 rounded-xl border border-emerald-500/20 space-y-1">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                  Pontos Fortes da Sessão
                </span>
                <ul className="list-disc list-inside text-xs text-violet-200/90 space-y-0.5">
                  {report.strengths.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {report.improvements && report.improvements.length > 0 && (
              <div className="bg-black/30 p-3 rounded-xl border border-amber-500/20 space-y-1">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                  Recomendações e Ajustes
                </span>
                <ul className="list-disc list-inside text-xs text-violet-200/90 space-y-0.5">
                  {report.improvements.map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {reportError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{reportError}</span>
        </div>
      )}

      {/* Quick Trade Logger Card */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15 flex-wrap gap-2">
          <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
            Diário de Operações da Sessão
          </span>
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rose-300 font-semibold">Apagar todo o diário?</span>
              <button
                onClick={handleClearTrades}
                className="text-xs px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-300 font-semibold hover:bg-white/10"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={trades.length === 0}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-40"
            >
              Limpar Diário
            </button>
          )}
        </div>

        {/* Quick Log Form */}
        <div className="space-y-2 p-3 bg-black/40 rounded-xl border border-violet-500/20 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-violet-400 font-bold">Ativo:</span>
              <input
                type="text"
                value={sym}
                onChange={(e) => setSym(e.target.value.toUpperCase().replace(/[^A-Z0-9.^]/g, '').slice(0, 12))}
                className="w-24 bg-black/60 border border-violet-500/30 rounded px-2 py-1 text-white font-mono font-bold outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400 font-bold">Direção:</span>
              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as any)}
                className="bg-black/60 border border-violet-500/30 rounded px-2 py-1 text-white font-bold outline-none"
              >
                <option value="CALL">CALL (Compra)</option>
                <option value="PUT">PUT (Venda)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400 font-bold">Valor:</span>
              <input
                type="number"
                min="0"
                step="any"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                className={`w-20 bg-black/60 border rounded px-2 py-1 text-white font-mono font-bold outline-none ${
                  safeStake > 0 ? 'border-violet-500/30' : 'border-rose-500/60'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              <span className="text-violet-400 font-bold">Setup:</span>
              <input
                type="text"
                value={setupUsed}
                onChange={(e) => setSetupUsed(e.target.value)}
                placeholder="Nome do setup usado"
                className="flex-1 bg-black/60 border border-violet-500/30 rounded px-2 py-1 text-white outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-violet-400 font-bold">TF:</span>
              <select
                value={tf}
                onChange={(e) => setTf(e.target.value)}
                className="bg-black/60 border border-violet-500/30 rounded px-2 py-1 text-white font-bold outline-none"
              >
                {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <span className={`text-[10px] ${setupReady ? 'text-violet-400' : 'text-rose-300'}`}>
              {setupReady
                ? `Resultado calculado com payout de ${payout}%. O horário é gravado com data completa.`
                : 'Informe ativo, setup e valor maior que zero para registrar.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAddTrade('WIN')}
                disabled={!setupReady}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 shadow-sm disabled:opacity-40"
              >
                <TrendingUp className="w-3.5 h-3.5" /> Registrar WIN (+R${(safeStake * (payout / 100)).toFixed(2)})
              </button>
              <button
                onClick={() => handleAddTrade('LOSS')}
                disabled={!setupReady}
                className="py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 shadow-sm disabled:opacity-40"
              >
                <TrendingDown className="w-3.5 h-3.5" /> Registrar LOSS (-R${safeStake.toFixed(2)})
              </button>
            </div>
          </div>
        </div>

        {/* Trades Table */}
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] text-violet-400 border-b border-violet-500/20 uppercase font-bold">
                <th className="py-2">Data/Hora</th>
                <th className="py-2">Ativo</th>
                <th className="py-2">TF</th>
                <th className="py-2">Direção</th>
                <th className="py-2">Setup</th>
                <th className="py-2">Entrada</th>
                <th className="py-2">Resultado</th>
                <th className="py-2 text-right">Resultado R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-500/10">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-violet-400/50">
                    Nenhuma operação registrada na sessão. Utilize os botões acima para registrar suas vitórias e derrotas.
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 text-violet-400 whitespace-nowrap">{formatTimestamp(t.timestamp)}</td>
                    <td className="py-2 text-white font-bold">{t.symbol}</td>
                    <td className="py-2 text-violet-300">{t.timeframe}</td>
                    <td className="py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === 'CALL' ? 'text-emerald-300 bg-emerald-500/20' : 'text-rose-300 bg-rose-500/20'
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2 text-violet-300 truncate max-w-[140px]">{t.setupName}</td>
                    <td className="py-2 text-violet-200">R$ {t.stake}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.result === 'WIN' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {t.result}
                      </span>
                    </td>
                    <td
                      className={`py-2 text-right font-bold ${
                        t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {t.pnl >= 0 ? '+' : ''}R$ {t.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
