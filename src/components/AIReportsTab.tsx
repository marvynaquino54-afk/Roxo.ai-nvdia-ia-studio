import React, { useState, useEffect } from 'react';
import { TradeRecord } from '../types';
import { cloudStorage } from '../services/firebase';
import { geminiService } from '../services/geminiService';
import { Sparkles, Plus, Award, AlertCircle, FileText, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';

interface AIReportsTabProps {
  bankroll: number;
  payout: number;
}

export const AIReportsTab: React.FC<AIReportsTabProps> = ({ bankroll, payout }) => {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // New trade entry form
  const [sym, setSym] = useState('EURUSD');
  const [dir, setDir] = useState<'CALL' | 'PUT'>('CALL');
  const [stake, setStake] = useState(20);
  const [setupUsed, setSetupUsed] = useState('Momentum M5');

  useEffect(() => {
    const saved = cloudStorage.getTrades();
    if (saved.length > 0) {
      setTrades(saved);
    }
  }, []);

  const handleAddTrade = (result: 'WIN' | 'LOSS') => {
    const pnl = result === 'WIN' ? stake * (payout / 100) : -stake;
    const newTrade: TradeRecord = {
      id: 'tr_' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      symbol: sym,
      setupName: setupUsed,
      direction: dir,
      timeframe: '5m',
      stake,
      result,
      pnl: Number(pnl.toFixed(2)),
    };
    const updated = [newTrade, ...trades];
    setTrades(updated);
    cloudStorage.saveTrades(updated);
  };

  const handleClearTrades = () => {
    setTrades([]);
    cloudStorage.saveTrades([]);
    setReport(null);
  };

  const totalWins = trades.filter((t) => t.result === 'WIN').length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0';
  const totalPnL = trades.reduce((acc, t) => acc + t.pnl, 0);

  const handleGenerateReport = async () => {
    if (trades.length === 0) return;
    setLoading(true);
    try {
      const data = await geminiService.generateReport({
        sessionData: trades.slice(0, 20),
        bankroll,
        totalOps: totalTrades,
        winRate,
        profitLoss: totalPnL.toFixed(2),
      });
      setReport(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
          <div className="flex items-center justify-between pb-2 border-b border-violet-500/20">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-fuchsia-400" />
              <span className="font-extrabold text-sm text-white uppercase tracking-wide">
                {report.title || 'Relatório Executivo de Performance'}
              </span>
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                report.verdict?.includes('APROVADO') || report.verdict?.includes('LUCRATIVO')
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {report.verdict || 'AVALIAÇÃO QUANT'}
            </span>
          </div>

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

      {/* Quick Trade Logger Card */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
          <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
            Diário de Operações da Sessão
          </span>
          <button
            onClick={handleClearTrades}
            disabled={trades.length === 0}
            className="text-xs text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-40"
          >
            Limpar Diário
          </button>
        </div>

        {/* Quick Log Form */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-black/40 rounded-xl border border-violet-500/20 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-violet-400 font-bold">Ativo:</span>
            <input
              type="text"
              value={sym}
              onChange={(e) => setSym(e.target.value.toUpperCase())}
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
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-16 bg-black/60 border border-violet-500/30 rounded px-2 py-1 text-white font-mono font-bold outline-none"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => handleAddTrade('WIN')}
              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 shadow-sm"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Registrar WIN (+R${(stake * (payout / 100)).toFixed(0)})
            </button>
            <button
              onClick={() => handleAddTrade('LOSS')}
              className="py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 shadow-sm"
            >
              <TrendingDown className="w-3.5 h-3.5" /> Registrar LOSS (-R${stake})
            </button>
          </div>
        </div>

        {/* Trades Table */}
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] text-violet-400 border-b border-violet-500/20 uppercase font-bold">
                <th className="py-2">Horário</th>
                <th className="py-2">Ativo</th>
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
                  <td colSpan={7} className="text-center py-6 text-violet-400/50">
                    Nenhuma operação registrada na sessão. Utilize os botões acima para registrar suas vitórias e derrotas.
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 text-violet-400">{t.timestamp}</td>
                    <td className="py-2 text-white font-bold">{t.symbol}</td>
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
